import { NextResponse, type NextRequest } from 'next/server';
import { isFcmConfigured, sendPush } from '@/lib/notifications/fcm';
import { createAdminClient } from '@/lib/supabase/admin';
import { callPendingRpc, fromPending } from '@/lib/supabase/rpc';

/**
 * Notification worker. Drains notification_queue.
 *
 * Runs under the service role, which is correct and requires care: the queue's
 * RLS is bypassed entirely here, so this handler is the authorisation boundary.
 * The CRON_SECRET check below is not decoration — without it this endpoint
 * would let anyone on the internet flush the queue.
 *
 * Safe to call repeatedly and concurrently. claim_notification_batch uses
 * FOR UPDATE SKIP LOCKED, so two overlapping invocations take disjoint rows
 * rather than double-sending.
 *
 * Batch sizes are shaped by the free tiers, not by throughput:
 *   push  — 100/run, FCM is generous
 *   email — 40/run, because Resend's free plan allows 100 A DAY and sign-in
 *           codes must always have headroom. Locking a student out to deliver a
 *           digest would be exactly the wrong trade.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PUSH_BATCH = 100;
const EMAIL_BATCH = 40;

interface QueueRow {
  id: number;
  user_id: string;
  channel: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
}

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // Fail closed. An unset secret must not mean "open to everyone".
  if (!secret) return false;

  const header = request.headers.get('authorization');
  return header === `Bearer ${secret}`;
}

/**
 * Vercel Cron invokes with GET and an `Authorization: Bearer $CRON_SECRET`
 * header. POST stays for manual triggers and for anything calling it by hand.
 */
export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: 'UNAUTHORISED' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const result = {
    reminders: [] as unknown[],
    push: { sent: 0, failed: 0, skipped: 0 },
    email: { sent: 0, failed: 0, skipped: 0 },
  };

  // Produce before consuming, so a class starting in fifteen minutes is queued
  // and delivered in the same run rather than waiting for the next one.
  //
  // pg_cron also runs this every five minutes. Doing it here too is deliberate
  // redundancy: reminders are the one thing where a missed run is visible to
  // students, and enqueue_due_reminders() is idempotent via the sent_at stamps,
  // so running it twice costs nothing.
  const { data: reminders, error: reminderError } = await callPendingRpc(
    supabase,
    'enqueue_due_reminders',
    {}
  );
  if (reminderError) console.error('enqueue_due_reminders failed', reminderError.message);
  else result.reminders = reminders ?? [];

  // ---------------------------------------------------------------- push ----
  if (isFcmConfigured()) {
    const { data: batch } = await callPendingRpc(supabase, 'claim_notification_batch', {
      p_channel: 'push',
      p_limit: PUSH_BATCH,
    });

    for (const row of (batch ?? []) as QueueRow[]) {
      const { data: tokens } = await fromPending(supabase, 'push_tokens')
        .select('id, token')
        .eq('user_id', row.user_id)
        .eq('provider', 'fcm');

      if (!tokens?.length) {
        // No device registered. 'skipped' not 'failed' — nothing is wrong, the
        // student simply has not turned push on, and retrying cannot help.
        await callPendingRpc(supabase, 'complete_notification', {
          p_id: row.id,
          p_status: 'skipped',
          p_error: 'NO_DEVICE_TOKEN',
        });
        result.push.skipped += 1;
        continue;
      }

      let delivered = false;
      let lastError = '';

      for (const token of tokens) {
        const outcome = await sendPush({
          token: token.token,
          title: row.title,
          body: row.body,
          url: typeof row.data?.url === 'string' ? row.data.url : undefined,
        });

        if (outcome.ok) {
          delivered = true;
          await fromPending(supabase, 'push_tokens')
            .update({ last_used_at: new Date().toISOString(), failure_count: 0 })
            .eq('id', token.id);
          continue;
        }

        lastError = outcome.reason;

        if (outcome.permanent) {
          // The app was uninstalled or the token rotated. Keeping it would mean
          // a guaranteed failure on every future send.
          await fromPending(supabase, 'push_tokens').delete().eq('id', token.id);
        }
      }

      await callPendingRpc(supabase, 'complete_notification', {
        p_id: row.id,
        p_status: delivered ? 'sent' : 'failed',
        p_error: delivered ? null : lastError.slice(0, 300),
      });

      if (delivered) result.push.sent += 1;
      else result.push.failed += 1;
    }
  }

  // --------------------------------------------------------------- email ----
  const { data: emailBatch } = await callPendingRpc(supabase, 'claim_notification_batch', {
    p_channel: 'email',
    p_limit: EMAIL_BATCH,
  });

  for (const row of (emailBatch ?? []) as QueueRow[]) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', row.user_id)
      .maybeSingle();

    if (!profile?.email) {
      await callPendingRpc(supabase, 'complete_notification', {
        p_id: row.id,
        p_status: 'skipped',
        p_error: 'NO_EMAIL',
      });
      result.email.skipped += 1;
      continue;
    }

    try {
      // lib/email.ts owns the suppression check, the daily cap and the
      // log-before-dispatch ordering. Bypassing it here would bypass all three.
      const { sendEmail } = await import('@/lib/email');
      const outcome = await sendEmail({
        to: profile.email,
        subject: row.title,
        html: `<p>${escapeHtml(row.title)}</p>${row.body ? `<p>${escapeHtml(row.body)}</p>` : ''}`,
        category: 'notification',
        userId: row.user_id,
        // Re-running the worker after a crash must not double-send. The queue
        // row id is unique and stable, which is exactly what this needs.
        idempotencyKey: `queue:${row.id}`,
      });

      await callPendingRpc(supabase, 'complete_notification', {
        p_id: row.id,
        p_status: outcome.sent ? 'sent' : 'skipped',
        p_error: outcome.sent ? null : (outcome.reason ?? 'NOT_SENT'),
      });

      if (outcome.sent) result.email.sent += 1;
      else result.email.skipped += 1;
    } catch (error) {
      await callPendingRpc(supabase, 'complete_notification', {
        p_id: row.id,
        p_status: 'failed',
        p_error: String(error).slice(0, 300),
      });
      result.email.failed += 1;
    }
  }

  return NextResponse.json({ ok: true, ...result });
}

/** Titles and bodies are operator-authored, but they still land in an HTML email. */
function escapeHtml(input: string): string {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
