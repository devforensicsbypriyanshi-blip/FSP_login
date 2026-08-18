import { NextResponse } from 'next/server';
import {
  fetchSigningCertificate,
  isAllowedTopic,
  parseSesEvent,
  verifySnsSignature,
  type SnsEnvelope,
} from '@/lib/email/sns';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/ses
 *
 * SES has no webhook. Bounces and complaints go to an SNS topic, and SNS POSTs
 * them here.
 *
 * AWS already suppresses hard bounces internally, so this does not change what
 * SES will send — it changes what *we* can see. Without it, Support answers "I
 * never got my code" with a guess, and the deliverability screen shows a
 * reputation we are not actually measuring.
 *
 * Three gates, in this order, and each one is doing real work:
 *
 *   1. **Certificate host.** SNS puts the signing certificate URL in the
 *      message, which the sender controls. Fetching it blindly means verifying
 *      an attacker's signature against an attacker's certificate — a check that
 *      always passes. It is also a server-side request forgery primitive.
 *   2. **Signature.** Proves the message came from SNS.
 *   3. **Topic ARN.** Proves it came from *our* SNS. Anyone with an AWS account
 *      can create a topic and subscribe this URL to it, and their messages
 *      carry a perfectly valid AWS signature. Without this check, a stranger
 *      could file bounces against any address they liked — and a suppressed
 *      address stops receiving sign-in codes, so a forged bounce is a way to
 *      lock a named student out of the platform.
 *
 * SNS sends `Content-Type: text/plain`, not JSON. Reading the body as text and
 * parsing it by hand is required, not a stylistic choice.
 */

/** SNS retries on non-2xx, and a retry of a permanent failure never succeeds. */
const ACCEPTED = { ok: true };

async function confirmSubscription(url: string): Promise<boolean> {
  // The URL comes from a message we have already verified came from our own
  // topic, so following it is safe — but it is still fetched rather than
  // rendered anywhere, and nothing is done with the response body.
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  let envelope: SnsEnvelope;
  try {
    envelope = JSON.parse(rawBody) as SnsEnvelope;
  } catch {
    return NextResponse.json({ error: 'malformed json' }, { status: 400 });
  }

  // Some SDKs use the lowercase spelling. Both appear in AWS's own docs.
  const certUrl = envelope.SigningCertURL ?? envelope.SigningCertUrl;
  const certificate = await fetchSigningCertificate(certUrl ?? '');

  if (!certificate) {
    console.warn(JSON.stringify({ level: 'warn', event: 'ses.webhook.bad_cert_url' }));
    // Deliberately vague: a precise reason helps an attacker tune their forgery.
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  const verdict = verifySnsSignature(envelope, certificate);
  if (!verdict.ok) {
    console.warn(JSON.stringify({ level: 'warn', event: 'ses.webhook.rejected', reason: verdict.reason }));
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  if (!isAllowedTopic(envelope.TopicArn)) {
    console.warn(
      JSON.stringify({ level: 'warn', event: 'ses.webhook.wrong_topic', topic: envelope.TopicArn })
    );
    // 403, not 401: the message is genuinely from AWS, just not from us. A 401
    // here would send someone hunting for a signature bug that is not there.
    return NextResponse.json({ error: 'topic not accepted' }, { status: 403 });
  }

  if (envelope.Type === 'SubscriptionConfirmation') {
    if (!envelope.SubscribeURL) {
      return NextResponse.json({ error: 'no subscribe url' }, { status: 400 });
    }

    const confirmed = await confirmSubscription(envelope.SubscribeURL);
    // info, not warn: a subscription confirmation is a normal, expected setup
    // step, and filing it under "warning" makes that level useless for the
    // things that are actually wrong.
    // eslint-disable-next-line no-console
    console.info(
      JSON.stringify({
        level: 'info',
        event: 'ses.webhook.subscription',
        confirmed,
        topic: envelope.TopicArn,
      })
    );

    return NextResponse.json({ ok: confirmed }, { status: confirmed ? 200 : 502 });
  }

  if (envelope.Type === 'UnsubscribeConfirmation') {
    // Logged rather than acted on. Silently re-subscribing would defeat someone
    // deliberately detaching the topic in the AWS console.
    console.warn(
      JSON.stringify({ level: 'warn', event: 'ses.webhook.unsubscribed', topic: envelope.TopicArn })
    );
    return NextResponse.json(ACCEPTED, { status: 200 });
  }

  if (envelope.Type !== 'Notification' || !envelope.Message) {
    return NextResponse.json(ACCEPTED, { status: 200 });
  }

  const event = parseSesEvent(envelope.Message);
  if (!event) {
    // SES adds notification types over time. Accepting and ignoring beats
    // rejecting, which would have SNS retry an event we do not want anyway.
    return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
  }

  try {
    const db = createAdminClient();

    // messageId is what SES returns from SendEmail and what dispatch() stores in
    // email_log.resend_id — the column predates SES and keeps its name rather
    // than migrating a live table for cosmetics.
    let emailLogId: string | null = null;
    if (event.messageId) {
      const { data } = await db.from('email_log').select('id').eq('resend_id', event.messageId).maybeSingle();
      emailLogId = data?.id ?? null;
    }

    for (const recipient of event.recipients) {
      const { error } = await db.from('email_events').insert({
        email_log_id: emailLogId,
        resend_id: event.messageId,
        event_type: event.type,
        // SNS MessageId plays the role svix-id does for Resend: it makes a
        // redelivery a no-op instead of a duplicate row. One recipient per row,
        // so a multi-recipient bounce needs distinct keys.
        svix_id: `sns:${envelope.MessageId}:${recipient}`,
        recipient,
        payload: JSON.parse(envelope.Message) as Json,
        occurred_at: event.occurredAt,
      });

      // 23505 is a redelivery of an event already stored. That is success.
      if (error && error.code !== '23505') {
        console.error(
          JSON.stringify({ level: 'error', event: 'ses.webhook.insert_failed', code: error.code })
        );
        return NextResponse.json({ error: 'could not record event' }, { status: 500 });
      }

      // Only PERMANENT bounces suppress. A transient one is a full mailbox or a
      // greylist — suppressing on those would lock people out of the platform
      // over a temporary condition at their provider.
      const shouldSuppress =
        (event.type === 'email.bounced' && event.bounceType === 'Permanent') ||
        event.type === 'email.complained';

      if (shouldSuppress) {
        await db.from('email_suppressions').upsert(
          {
            email: recipient,
            reason: event.type === 'email.complained' ? 'complaint' : 'hard_bounce',
            detail: event.detail,
          },
          { onConflict: 'email', ignoreDuplicates: true }
        );
      }
    }

    return NextResponse.json(ACCEPTED, { status: 200 });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'ses.webhook.exception',
        detail: error instanceof Error ? error.message : 'unknown',
      })
    );
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

/** Reachability check. Says nothing about whether a topic is configured. */
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'ses-sns-webhook' });
}
