import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createGatewayOrder, isRazorpayConfigured } from '@/lib/payments/razorpay';
import { callPendingRpc } from '@/lib/supabase/rpc';
import { createClient } from '@/lib/supabase/server';

/**
 * Starts a checkout.
 *
 * The request carries course IDS ONLY. No amount, no title, no discount —
 * create_order() reads every price from the catalogue. Accepting a total from
 * the browser is how a ₹5,000 course ends up costing ₹1, and no amount of
 * client-side validation fixes it.
 *
 * The response carries the amount purely so Razorpay's widget can display it;
 * the gateway order was already created server-side for that exact figure, and
 * the webhook re-checks it again before granting anything.
 */

const bodySchema = z.object({
  courseIds: z.array(z.string().uuid()).min(1).max(10),
  coupon: z.string().trim().max(40).optional(),
});

const ERRORS: Record<string, { status: number; message: string }> = {
  ALREADY_ENROLLED: { status: 409, message: 'You already have access to one of these courses.' },
  EMPTY_CART: { status: 400, message: 'Choose a course first.' },
  NO_PURCHASABLE_ITEMS: { status: 404, message: 'Those courses are no longer available.' },
  NOT_AUTHENTICATED: { status: 401, message: 'Please sign in again.' },
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

  if (!isRazorpayConfigured()) {
    return NextResponse.json(
      { error: 'Payments are not switched on yet. Contact support to be enrolled manually.' },
      { status: 503 }
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  // Prices resolved here, from the database.
  const { data, error } = await callPendingRpc(supabase, 'create_order', {
    p_course_ids: parsed.data.courseIds,
    p_coupon: parsed.data.coupon ?? null,
  });

  if (error) {
    if (error.message.includes('COUPON_REJECTED')) {
      // The function embeds the human-readable reason after the code.
      const reason = error.message.split('COUPON_REJECTED:')[1]?.trim();
      return NextResponse.json({ error: reason || 'That code is not valid.' }, { status: 400 });
    }

    const code = Object.keys(ERRORS).find((key) => error.message.includes(key));
    const mapped = code ? ERRORS[code]! : { status: 500, message: 'We could not start that checkout.' };
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }

  const order = Array.isArray(data) ? data[0] : null;
  if (!order) return NextResponse.json({ error: 'We could not start that checkout.' }, { status: 500 });

  // A fully-discounted order has nothing to charge. Sending ₹0 to Razorpay is
  // rejected by the gateway, so it is fulfilled directly instead.
  if (order.total_inr === 0) {
    return NextResponse.json({ free: true, orderId: order.order_id });
  }

  const gatewayOrder = await createGatewayOrder({
    amountInr: order.total_inr,
    receipt: order.order_id,
    notes: { user_id: user.id, order_id: order.order_id },
  });

  if (!gatewayOrder) {
    return NextResponse.json({ error: 'The payment provider is unavailable.' }, { status: 502 });
  }

  const { error: attachError } = await callPendingRpc(supabase, 'attach_gateway_order', {
    p_order: order.order_id,
    p_gateway_order_id: gatewayOrder.id,
  });

  if (attachError) {
    // Without this link the webhook cannot find our order, so the student would
    // pay and get nothing. Refuse before taking money.
    console.error('attach_gateway_order failed', attachError.message);
    return NextResponse.json({ error: 'We could not start that checkout.' }, { status: 500 });
  }

  return NextResponse.json({
    orderId: order.order_id,
    gatewayOrderId: gatewayOrder.id,
    amountInr: order.total_inr,
    subtotalInr: order.subtotal_inr,
    discountInr: order.discount_inr,
    // Publishable by design — it identifies the merchant, it does not authorise.
    keyId: process.env.RAZORPAY_KEY_ID,
  });
}
