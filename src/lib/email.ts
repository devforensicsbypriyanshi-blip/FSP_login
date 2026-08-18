import 'server-only';

import { dispatch } from '@/lib/email/dispatch';
import { getPools, selectPools, type PoolUsage } from '@/lib/email/pools';
import { createAdminClient } from '@/lib/supabase/admin';
import { callPendingRpc, fromPending } from '@/lib/supabase/rpc';

/**
 * Outbound email.
 *
 * Email is the ONLY authentication channel — no SMS, no password — so an
 * undelivered message is a locked-out student. Every send is therefore:
 *
 *   1. checked against the suppression list (hard bounces / complaints).
 *      Mailing a known-bad address damages sender reputation for everyone
 *      else, and eventually the domain stops reaching inboxes at all.
 *   2. logged BEFORE dispatch, so a send that fails mid-flight still leaves
 *      a trace Support can find.
 *   3. reconciled by the Resend webhook, which folds delivery events back
 *      into the same row.
 */

export type EmailCategory =
  'auth' | 'class_reminder' | 'enrolment' | 'invoice' | 'notification' | 'digest' | 'support';

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
  category: EmailCategory;
  userId?: string;
  /** Reuse to make a send idempotent — e.g. `reminder:<sessionId>:<userId>:15m`. */
  idempotencyKey?: string;
}

export type SendResult =
  | { sent: true; id: string }
  | { sent: false; reason: 'suppressed' | 'duplicate' | 'quota' | 'provider_error'; detail?: string };

const QUOTA_ALERT_AT = 0.8;

export async function sendEmail(args: SendEmailArgs): Promise<SendResult> {
  const db = createAdminClient();
  const to = args.to.trim().toLowerCase();

  // 1. Never mail a suppressed address.
  const { data: suppressed } = await db.rpc('is_email_suppressed', { p_email: to });
  if (suppressed) {
    return { sent: false, reason: 'suppressed', detail: 'address previously bounced or complained' };
  }

  // 2. Idempotency — a retried cron must not double-send.
  if (args.idempotencyKey) {
    const { data: existing } = await db
      .from('email_log')
      .select('id')
      .eq('idempotency_key', args.idempotencyKey)
      .maybeSingle();
    if (existing) return { sent: false, reason: 'duplicate', detail: existing.id };
  }

  // 3. Pick a sending pool with headroom.
  //
  //    Budgets are per pool, per IST day. Auth mail always goes: selectPools()
  //    keeps exhausted pools at the end of the list for that category, because
  //    locking a student out of the platform to protect a soft quota is the
  //    wrong trade — and it would be a trade made silently.
  const pools = getPools();

  if (pools.length === 0) {
    return { sent: false, reason: 'provider_error', detail: 'no email pool configured' };
  }

  const { data: usageRows } = await callPendingRpc(db, 'email_pool_usage', {});
  const usage: Record<string, PoolUsage> = {};
  for (const row of usageRows ?? []) {
    usage[row.pool_id] = { today: row.sent_today, month: row.sent_month };
  }

  const candidates = selectPools(pools, args.category, usage);

  if (candidates.length === 0) {
    const spentToday = Object.values(usage).reduce((n, v) => n + v.today, 0);
    const spentMonth = Object.values(usage).reduce((n, v) => n + v.month, 0);
    return {
      sent: false,
      reason: 'quota',
      detail: `every pool is at a budget (${spentToday} today, ${spentMonth} this month)`,
    };
  }

  const dailyCap = pools.reduce((n, p) => n + p.dailyCap, 0);
  const monthlyCap = pools.reduce((n, p) => n + p.monthlyCap, 0);
  const usedToday = Object.values(usage).reduce((n, v) => n + v.today, 0);
  const usedMonth = Object.values(usage).reduce((n, v) => n + v.month, 0);

  // Warn on whichever budget is closer to full. The monthly one is the easier
  // to miss: it creeps up over weeks and then everything stops at once.
  if (usedToday >= dailyCap * QUOTA_ALERT_AT || usedMonth >= monthlyCap * QUOTA_ALERT_AT) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'email.quota_warning',
        usedToday,
        dailyCap,
        usedMonth,
        monthlyCap,
        pools: pools.length,
        message: 'Approaching a combined budget — non-auth mail will start being dropped.',
      })
    );
  }

  // 4. Log first, so a mid-flight failure is still visible to Support.
  const { data: logRow, error: logError } = await db
    .from('email_log')
    .insert({
      to_email: to,
      template: args.category,
      subject: args.subject,
      category: args.category,
      user_id: args.userId ?? null,
      idempotency_key: args.idempotencyKey ?? null,
      state: 'queued',
    })
    .select('id')
    .single();

  if (logError || !logRow) {
    return { sent: false, reason: 'provider_error', detail: logError?.message ?? 'could not log send' };
  }

  // 5. Dispatch, trying each candidate pool in turn.
  //
  //    Only *retryable* failures move to the next pool. A 4xx means the request
  //    itself was wrong — a malformed address, an unverified sender — and every
  //    other pool would reject it identically, so walking the list would just
  //    burn budget to produce the same error.
  try {
    let lastError = 'no pool accepted the message';

    for (const pool of candidates) {
      const result = await dispatch(pool, {
        to,
        subject: args.subject,
        html: args.html,
        text: args.text,
        category: args.category,
      });

      if (result.ok) {
        // fromPending because `pool_id` is newer than the generated types.
        await fromPending(db, 'email_log')
          .update({
            resend_id: result.providerId,
            pool_id: pool.id,
            state: 'sent',
            sent_at: new Date().toISOString(),
          })
          .eq('id', logRow.id);

        return { sent: true, id: logRow.id };
      }

      lastError = `${pool.id}: ${result.error}`;

      if (!result.retryable) break;

      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'email.pool_failover',
          pool: pool.id,
          error: result.error,
          message: 'Pool refused the send — trying the next one.',
        })
      );
    }

    await db.from('email_log').update({ state: 'failed', error: lastError }).eq('id', logRow.id);
    return { sent: false, reason: 'provider_error', detail: lastError };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown';
    await db.from('email_log').update({ state: 'failed', error: detail }).eq('id', logRow.id);
    return { sent: false, reason: 'provider_error', detail };
  }
}
