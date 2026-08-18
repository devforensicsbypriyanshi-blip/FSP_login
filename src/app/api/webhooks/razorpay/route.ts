import { NextResponse, type NextRequest } from 'next/server';
import { verifyWebhookSignature } from '@/lib/payments/razorpay';
import { callPendingRpc } from '@/lib/supabase/rpc';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Razorpay webhook. THIS is what grants course access — not the browser.
 *
 * Order of operations matters and is not negotiable:
 *
 *   1. Read the RAW body. Verification is over the exact bytes sent; parsing
 *      first and re-serialising changes key order and breaks the signature.
 *   2. Verify the signature BEFORE parsing or storing anything. An unverified
 *      body is attacker-controlled input.
 *   3. Record the event, and let the (provider, event_id) unique constraint be
 *      the idempotency gate. Razorpay retries any non-2xx, so the same event
 *      WILL arrive twice.
 *   4. Only then fulfil.
 *
 * Response codes are chosen for Razorpay's retry behaviour: 200 for anything
 * final (handled, duplicate, or permanently un-fulfillable) so it stops
 * retrying, 500 only for transient failures we want retried.
 */

export const dynamic = 'force-dynamic';

interface RazorpayPaymentEntity {
  id: string;
  order_id: string;
  amount: number;
  method?: string;
  error_description?: string;
}

export async function POST(request: NextRequest) {
  // 1. Raw body, before anything else touches it.
  const rawBody = await request.text();

  // 2. Verify before parse.
  if (!verifyWebhookSignature(rawBody, request.headers.get('x-razorpay-signature'))) {
    // 401, not 400: this is an authentication failure, and a forged delivery
    // should not be retried into our logs forever.
    return NextResponse.json({ error: 'INVALID_SIGNATURE' }, { status: 401 });
  }

  let event: { event?: string; payload?: { payment?: { entity?: RazorpayPaymentEntity } } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const eventType = event.event ?? 'unknown';
  const payment = event.payload?.payment?.entity;

  // Razorpay's own delivery id, falling back to the payment id so we still have
  // an idempotency key if the header is ever absent.
  const eventId = request.headers.get('x-razorpay-event-id') ?? payment?.id ?? crypto.randomUUID();

  const supabase = createAdminClient();

  // 3. The idempotency gate. A duplicate insert means we have seen this before.
  const { error: insertError } = await supabase.from('webhook_events').insert({
    provider: 'razorpay',
    event_id: eventId,
    event_type: eventType,
    payload: event as never,
    status: 'received',
  });

  if (insertError) {
    // Unique violation — already processed. 200 so Razorpay stops retrying.
    if (insertError.code === '23505') {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error('webhook_events insert failed', insertError.message);
    return NextResponse.json({ error: 'STORE_FAILED' }, { status: 500 });
  }

  // 4. Fulfil.
  if (!payment?.order_id) {
    await markEvent(supabase, eventId, 'ignored', 'no payment entity');
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    if (eventType === 'payment.captured' || eventType === 'order.paid') {
      const { error } = await callPendingRpc(supabase, 'fulfil_order', {
        p_gateway_order_id: payment.order_id,
        p_gateway_payment_id: payment.id,
        // Paise → rupees. The only place this conversion happens on the way in.
        p_amount_inr: Math.round(payment.amount / 100),
        p_method: payment.method ?? null,
        p_raw: event,
      });

      if (error) {
        await markEvent(supabase, eventId, 'failed', error.message);

        // An amount mismatch or missing order will never succeed on retry, and
        // both are already recorded. Returning 500 would have Razorpay redeliver
        // a permanently broken event for hours.
        const permanent =
          error.message.includes('AMOUNT_MISMATCH') || error.message.includes('ORDER_NOT_FOUND');

        return NextResponse.json({ error: 'FULFIL_FAILED' }, { status: permanent ? 200 : 500 });
      }
    } else if (eventType === 'payment.failed') {
      await callPendingRpc(supabase, 'fail_order', {
        p_gateway_order_id: payment.order_id,
        p_reason: payment.error_description ?? 'payment failed',
      });
    }

    await markEvent(supabase, eventId, 'processed', null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    await markEvent(supabase, eventId, 'failed', String(error).slice(0, 300));
    return NextResponse.json({ error: 'UNEXPECTED' }, { status: 500 });
  }
}

async function markEvent(
  supabase: ReturnType<typeof createAdminClient>,
  eventId: string,
  status: string,
  error: string | null
) {
  await supabase
    .from('webhook_events')
    .update({ status, error, processed_at: new Date().toISOString() })
    .eq('provider', 'razorpay')
    .eq('event_id', eventId);
}
