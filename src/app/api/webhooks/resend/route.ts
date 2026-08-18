import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySvixSignature } from '@/lib/svix';
import type { Database, Json } from '@/types/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/resend
 *
 * Receives delivery events from Resend (sent, delivered, delayed, bounced,
 * complained, opened, clicked) and records them, so Support can answer
 * "I never got my code" with evidence instead of a guess.
 *
 * Order of operations matters:
 *   1. Read the RAW body. Verify the signature BEFORE parsing — the signature
 *      covers exact bytes, and re-serialising JSON changes them.
 *   2. Insert keyed on svix-id. Resend retries on any non-2xx, so the same
 *      event will arrive more than once; the unique index makes that a no-op.
 *   3. Always return 2xx once the signature is valid. A 500 on our side
 *      triggers retries that will fail identically, and Resend eventually
 *      disables the endpoint.
 *
 * A database trigger folds each event into email_log's current state and
 * suppresses hard bounces and complaints (migration 0009).
 */

/**
 * Derived from the database enum rather than restated, so adding a value to
 * `email_event_type` and regenerating types makes any mismatch here a compile
 * error instead of a runtime insert failure.
 */
type EmailEventType = Database['public']['Enums']['email_event_type'];

const KNOWN_EVENTS = [
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.bounced',
  'email.complained',
  'email.opened',
  'email.clicked',
  'email.failed',
] as const satisfies readonly EmailEventType[];

function isKnownEvent(type: string): type is EmailEventType {
  return (KNOWN_EVENTS as readonly string[]).includes(type);
}

interface ResendEvent {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    subject?: string;
  };
}

/**
 * Every sending account signs its own webhooks with its own secret, so a
 * multi-pool setup has one secret per pool. All of them point at this single
 * endpoint, and we cannot tell from the request which account sent it — the
 * payload carries no account id.
 *
 * So: try each configured secret and accept on the first that verifies. With a
 * handful of secrets this is a few HMACs, and failing to do it would silently
 * drop the delivery events from every account except the first — bounces would
 * stop being recorded and suppression would quietly stop working.
 *
 * RESEND_WEBHOOK_SECRETS takes a comma-separated list; RESEND_WEBHOOK_SECRET
 * stays supported for the single-account case.
 */
function webhookSecrets(): string[] {
  const many = process.env.RESEND_WEBHOOK_SECRETS;
  if (many) {
    const list = many
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length > 0) return list;
  }

  const one = process.env.RESEND_WEBHOOK_SECRET;
  return one ? [one] : [];
}

export async function POST(request: Request) {
  const secrets = webhookSecrets();
  if (secrets.length === 0) {
    console.error(JSON.stringify({ level: 'error', event: 'resend.webhook.unconfigured' }));
    // 500 is right here: it IS our fault, and a retry may succeed post-deploy.
    return NextResponse.json({ error: 'webhook not configured' }, { status: 500 });
  }

  const rawBody = await request.text();

  const headers = {
    rawBody,
    svixId: request.headers.get('svix-id'),
    svixTimestamp: request.headers.get('svix-timestamp'),
    svixSignature: request.headers.get('svix-signature'),
  };

  let verdict = verifySvixSignature({ secret: secrets[0]!, ...headers });
  for (let i = 1; i < secrets.length && !verdict.ok; i += 1) {
    verdict = verifySvixSignature({ secret: secrets[i]!, ...headers });
  }

  if (!verdict.ok) {
    console.warn(JSON.stringify({ level: 'warn', event: 'resend.webhook.rejected', reason: verdict.reason }));
    // Deliberately vague: a precise reason helps an attacker tune their forgery.
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  // Kept as Json for storage AND read through a narrow view. Storing the
  // untouched payload matters: it is the evidence of what Resend actually
  // told us, and re-shaping it would lose fields we have not modelled yet.
  let rawPayload: Json;
  try {
    rawPayload = JSON.parse(rawBody) as Json;
  } catch {
    return NextResponse.json({ error: 'malformed json' }, { status: 400 });
  }

  const payload = rawPayload as ResendEvent;

  const eventType = payload.type ?? '';
  if (!isKnownEvent(eventType)) {
    // Unknown types are accepted and ignored — Resend adds new ones over time,
    // and rejecting them would cause endless retries of an event we don't want.
    return NextResponse.json({ ok: true, ignored: eventType }, { status: 200 });
  }

  const svixId = request.headers.get('svix-id');
  const resendId = payload.data?.email_id ?? null;
  const recipient = Array.isArray(payload.data?.to) ? payload.data?.to[0] : payload.data?.to;
  const occurredAt = payload.created_at ?? new Date().toISOString();

  try {
    const db = createAdminClient();

    // Link the event to its send, when we know about it. Events for mail sent
    // outside the app (a manual Resend test) still get recorded, unlinked.
    let emailLogId: string | null = null;
    if (resendId) {
      const { data } = await db.from('email_log').select('id').eq('resend_id', resendId).maybeSingle();
      emailLogId = data?.id ?? null;
    }

    const { error } = await db.from('email_events').insert({
      email_log_id: emailLogId,
      resend_id: resendId,
      event_type: eventType,
      svix_id: svixId,
      recipient: recipient ?? null,
      payload: rawPayload,
      occurred_at: occurredAt,
    });

    // 23505 = unique violation on svix_id: a retry of an event already stored.
    // That is success, not failure.
    if (error && error.code !== '23505') {
      console.error(
        JSON.stringify({ level: 'error', event: 'resend.webhook.insert_failed', code: error.code })
      );
      return NextResponse.json({ error: 'could not record event' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, duplicate: error?.code === '23505' }, { status: 200 });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'resend.webhook.exception',
        detail: error instanceof Error ? error.message : 'unknown',
      })
    );
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

/** Resend pings the endpoint on setup; answer so the UI shows it as reachable. */
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'resend-webhook' });
}
