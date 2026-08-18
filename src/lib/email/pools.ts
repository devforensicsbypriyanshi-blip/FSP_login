import type { EmailCategory } from '@/lib/email';

/**
 * Email sending pools.
 *
 * Email is the ONLY authentication channel here, so a single provider account
 * is a single point of lockout. Pools let sends be spread across several keys
 * or several providers, with per-category routing and automatic failover.
 *
 * Configured with one env var, so adding capacity is a deployment setting
 * rather than a code change:
 *
 *   EMAIL_POOLS=[
 *     {"id":"auth","provider":"resend","key":"re_A","from":"no-reply@…","dailyCap":100,
 *      "categories":["auth"],"priority":1},
 *     {"id":"bulk","provider":"resend","key":"re_B","from":"updates@…","dailyCap":100,
 *      "categories":["class_reminder","notification","digest"],"priority":1},
 *     {"id":"backup","provider":"brevo","key":"xkeysib-…","from":"no-reply@…","dailyCap":300,
 *      "priority":9}
 *   ]
 *
 * A pool with no `categories` serves everything — that is the shape you want
 * for a backup. `priority` orders them; lower goes first.
 *
 * With EMAIL_POOLS unset it falls back to the single RESEND_API_KEY, so
 * existing deployments keep working untouched.
 */

export type EmailProvider = 'resend' | 'brevo' | 'ses';

export interface EmailPool {
  id: string;
  provider: EmailProvider;
  /** Resend/Brevo: the API key. SES: the AWS access key id. */
  key: string;
  /** SES only — the AWS secret access key. Unused by the other providers. */
  secret?: string;
  /** SES only. ap-south-1 (Mumbai) is closest to the students. */
  region?: string;
  from: string;
  /** Soft budget per IST day. Exhausted pools are skipped, not failed. */
  dailyCap: number;
  /**
   * Soft budget per calendar month.
   *
   * Resend's free tier is TWO limits: 100/day AND 3,000/month. Checking only
   * the daily one means a key that has spent its month looks healthy every
   * morning — it passes the daily check, gets chosen, and fails at the API.
   */
  monthlyCap: number;
  /** Categories this pool serves. Undefined means all of them. */
  categories?: EmailCategory[];
  priority: number;
}

/** What each pool has spent, from email_pool_usage(). */
export interface PoolUsage {
  today: number;
  month: number;
}

const DEFAULT_FROM = 'no-reply@forensicbypriyanshi.com';

let cached: EmailPool[] | null = null;

function parsePools(): EmailPool[] {
  const raw = process.env.EMAIL_POOLS;

  if (raw && raw.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(raw) as Partial<EmailPool>[];
      const pools = parsed
        .filter((p) => p.key && p.id)
        .map((p, i) => ({
          id: String(p.id),
          provider: (p.provider ?? 'resend') as EmailProvider,
          key: String(p.key),
          secret: p.secret,
          region: p.region,
          from: p.from ?? process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM,
          dailyCap: typeof p.dailyCap === 'number' ? p.dailyCap : 100,
          monthlyCap: typeof p.monthlyCap === 'number' ? p.monthlyCap : 3000,
          categories: p.categories,
          priority: typeof p.priority === 'number' ? p.priority : i,
        }));

      if (pools.length > 0) return pools;
    } catch {
      // A malformed EMAIL_POOLS must not take email down. Fall through to the
      // single-key path and log loudly — silent degradation here is invisible
      // until someone cannot sign in.
      console.error('EMAIL_POOLS is not valid JSON — falling back to RESEND_API_KEY');
    }
  }

  const single = process.env.RESEND_API_KEY;
  if (!single) return [];

  return [
    {
      id: 'default',
      provider: 'resend',
      key: single,
      from: process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM,
      dailyCap: Number(process.env.EMAIL_DAILY_CAP ?? 100),
      monthlyCap: Number(process.env.EMAIL_MONTHLY_CAP ?? 3000),
      priority: 0,
    },
  ];
}

export function getPools(): EmailPool[] {
  cached ??= parsePools();
  return cached;
}

/** Test seam, and used when config changes at runtime. */
export function resetPoolCache(): void {
  cached = null;
}

const NO_USAGE: PoolUsage = { today: 0, month: 0 };

/** Fraction of the tighter of the two budgets a pool has spent, 0–1+. */
export function pressure(pool: EmailPool, used: PoolUsage): number {
  const daily = pool.dailyCap > 0 ? used.today / pool.dailyCap : 1;
  const monthly = pool.monthlyCap > 0 ? used.month / pool.monthlyCap : 1;
  // The binding limit is whichever is closer to full.
  return Math.max(daily, monthly);
}

export function hasRoom(pool: EmailPool, used: PoolUsage): boolean {
  return used.today < pool.dailyCap && used.month < pool.monthlyCap;
}

/**
 * Pools that can carry this category, best first.
 *
 * A pool is only usable when it is under BOTH budgets. Checking the daily one
 * alone means a key that has spent its month looks fine every morning: it
 * passes, gets picked, and fails at the provider — then does it again tomorrow.
 *
 * Ordering is by priority, then by *pressure* — how full the tighter of its two
 * budgets is. That spreads load across equal-priority keys rather than draining
 * one and falling over to the next, and it naturally prefers the key with the
 * most monthly headroom late in the month even when daily usage is level.
 *
 * The exception that matters: a sign-in code must go out even when every budget
 * is spent. Locking a student out of the platform to protect a soft quota is
 * the wrong trade, and it is one we would be making silently. So for auth,
 * exhausted pools stay at the END of the list rather than being dropped.
 */
export function selectPools(
  pools: EmailPool[],
  category: EmailCategory,
  usage: Record<string, PoolUsage>
): EmailPool[] {
  const eligible = pools.filter((p) => !p.categories || p.categories.includes(category));

  // Nothing is configured for this category — fall back to general-purpose
  // pools rather than dropping the email.
  const candidates = eligible.length > 0 ? eligible : pools.filter((p) => !p.categories);

  const withRoom = candidates.filter((p) => hasRoom(p, usage[p.id] ?? NO_USAGE));
  const exhausted = candidates.filter((p) => !hasRoom(p, usage[p.id] ?? NO_USAGE));

  const byPreference = (a: EmailPool, b: EmailPool) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return pressure(a, usage[a.id] ?? NO_USAGE) - pressure(b, usage[b.id] ?? NO_USAGE);
  };

  withRoom.sort(byPreference);
  exhausted.sort(byPreference);

  return category === 'auth' ? [...withRoom, ...exhausted] : withRoom;
}
