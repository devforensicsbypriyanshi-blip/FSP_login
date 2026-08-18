import 'server-only';

import { getPools } from '@/lib/email/pools';
import { callPendingRpc } from '@/lib/supabase/rpc';
import { createClient } from '@/lib/supabase/server';

/**
 * Developer console reads.
 *
 * The integrations check reports whether a secret is *set*, never what it is.
 * The values live in Vercel and Supabase; nothing in this application can read
 * one back out, and that property is worth more than the convenience of a
 * "reveal" button would ever be. A console that can display a secret is a
 * console that leaks one the first time someone screen-shares it.
 */

export interface SystemHealth {
  emailsFailed24h: number;
  emailsSent24h: number;
  notificationsFailed24h: number;
  notificationsPending: number;
  notificationsStuck: number;
  webhooksFailed24h: number;
  webhooksReceived24h: number;
  lastWebhookAt: string | null;
  lastEmailAt: string | null;
}

const EMPTY_HEALTH: SystemHealth = {
  emailsFailed24h: 0,
  emailsSent24h: 0,
  notificationsFailed24h: 0,
  notificationsPending: 0,
  notificationsStuck: 0,
  webhooksFailed24h: 0,
  webhooksReceived24h: 0,
  lastWebhookAt: null,
  lastEmailAt: null,
};

export async function getSystemHealth(): Promise<SystemHealth> {
  const supabase = await createClient();
  const { data, error } = await callPendingRpc(supabase, 'get_system_health', {});

  const row = data?.[0];
  if (error || !row) return EMPTY_HEALTH;

  return {
    emailsFailed24h: row.emails_failed_24h,
    emailsSent24h: row.emails_sent_24h,
    notificationsFailed24h: row.notifications_failed_24h,
    notificationsPending: row.notifications_pending,
    notificationsStuck: row.notifications_stuck,
    webhooksFailed24h: row.webhooks_failed_24h,
    webhooksReceived24h: row.webhooks_received_24h,
    lastWebhookAt: row.last_webhook_at,
    lastEmailAt: row.last_email_at,
  };
}

export interface WebhookEvent {
  id: string;
  provider: string;
  eventId: string;
  eventType: string;
  status: string;
  error: string | null;
  attempts: number;
  receivedAt: string;
  processedAt: string | null;
}

/** Payloads are deliberately not returned — Razorpay's carry payer contact details. */
export async function getWebhookEvents(provider?: string): Promise<WebhookEvent[]> {
  const supabase = await createClient();
  const { data, error } = await callPendingRpc(supabase, 'get_webhook_events', {
    p_provider: provider ?? null,
    p_limit: 100,
  });

  if (error) return [];

  return (data ?? []).map((row) => ({
    id: row.id,
    provider: row.provider,
    eventId: row.event_id,
    eventType: row.event_type,
    status: row.status,
    error: row.error,
    attempts: row.attempts,
    receivedAt: row.received_at,
    processedAt: row.processed_at,
  }));
}

export interface Failure {
  id: string;
  source: string;
  subject: string;
  detail: string;
  attempts: number;
  failedAt: string;
}

export async function getRecentFailures(): Promise<Failure[]> {
  const supabase = await createClient();
  const { data, error } = await callPendingRpc(supabase, 'get_recent_failures', { p_limit: 150 });

  if (error) return [];

  return (data ?? []).map((row, index) => ({
    // These come from a UNION across three tables with no shared key, so the
    // row identity is positional. It is only used as a React key.
    id: `${row.source}-${index}`,
    source: row.source,
    subject: row.subject,
    detail: row.detail,
    attempts: row.attempts,
    failedAt: row.failed_at,
  }));
}

export interface PoolHealth {
  id: string;
  provider: string;
  from: string;
  categories: string;
  sentToday: number;
  dailyCap: number;
  sentMonth: number;
  monthlyCap: number;
}

/**
 * Per-key budget, daily and monthly.
 *
 * Keys are read from config and never returned — only pool ids, budgets and
 * counts. The two numbers are both needed because Resend's free tier is two
 * limits at once: a key that has spent its month passes the daily check every
 * morning, gets chosen, and fails at the API.
 */
export async function getEmailPoolHealth(): Promise<PoolHealth[]> {
  const supabase = await createClient();
  const { data } = await callPendingRpc(supabase, 'email_pool_usage', {});
  const usage = new Map((data ?? []).map((row) => [row.pool_id, row]));

  return getPools().map((pool) => {
    const used = usage.get(pool.id);
    return {
      id: pool.id,
      provider: pool.provider,
      from: pool.from,
      categories: pool.categories?.join(', ') ?? 'all categories',
      sentToday: used?.sent_today ?? 0,
      dailyCap: pool.dailyCap,
      sentMonth: used?.sent_month ?? 0,
      monthlyCap: pool.monthlyCap,
    };
  });
}

export interface IntegrationStatus {
  name: string;
  /** What stops working if this is missing. */
  effect: string;
  configured: boolean;
  /** Set when the thing works without it, just in a reduced way. */
  optional?: boolean;
  detail?: string;
}

const isSet = (name: string): boolean => Boolean(process.env[name]?.trim());

/**
 * Which integrations are configured. Presence only.
 *
 * The effect column is the point: "RAZORPAY_KEY_SECRET missing" means nothing
 * at 2am, where "students cannot pay" means something.
 */
export function getIntegrations(): IntegrationStatus[] {
  const pools = getPools();

  return [
    {
      name: 'Supabase',
      effect: 'Nothing works — this is the database and the auth provider',
      configured: isSet('NEXT_PUBLIC_SUPABASE_URL') && isSet('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    },
    {
      name: 'Session cookie secret',
      effect: 'Device locking falls back to a per-request database read',
      configured: isSet('SESSION_COOKIE_SECRET'),
    },
    {
      name: 'Email delivery',
      effect: 'No sign-in codes, no reminders, no receipts',
      configured: pools.length > 0,
      detail:
        pools.length > 0
          ? `${pools.length} pool${pools.length === 1 ? '' : 's'}: ${[...new Set(pools.map((pool) => pool.provider))].join(', ')}`
          : 'Set EMAIL_POOLS, or RESEND_API_KEY for a single key',
    },
    {
      name: 'Razorpay',
      effect: 'Students cannot pay — manual enrolment still works',
      configured: isSet('RAZORPAY_KEY_ID') && isSet('RAZORPAY_KEY_SECRET'),
    },
    {
      name: 'Razorpay webhook secret',
      effect: 'Payments succeed but never grant access — enrolment follows the webhook',
      configured: isSet('RAZORPAY_WEBHOOK_SECRET'),
    },
    {
      name: 'Firebase (push)',
      effect: 'Class reminders arrive by email only',
      configured: isSet('FIREBASE_SERVICE_ACCOUNT') && isSet('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
      optional: true,
    },
    {
      name: 'Cron secret',
      effect: 'The queue worker refuses every request — it fails closed',
      configured: isSet('CRON_SECRET'),
    },
    {
      name: 'Cloudinary',
      effect: 'Images fall back to unoptimised originals',
      configured: isSet('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME'),
      optional: true,
    },
  ];
}
