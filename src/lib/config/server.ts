import 'server-only';

import { DEFAULTS, type FlagKey } from '@/lib/flags';
import { createClient } from '@/lib/supabase/server';

/**
 * Runtime configuration engine (docs Part 5 §3).
 *
 * Flags and settings live in Postgres so the owner can change them from
 * /dev/config without a deploy. Two properties matter more than freshness:
 *
 *   1. It must never take the site down. If the database is unreachable we fall
 *      back to the compiled defaults in lib/flags.ts rather than throwing. A
 *      config lookup failing is not a reason for a student to see an error page.
 *   2. It must not add a query to every render. Results are cached in module
 *      scope for 30s, which on a 200-student platform means single-digit config
 *      queries a minute while a toggle still takes effect within half a minute.
 */

const CACHE_TTL_MS = 30_000;

export interface FlagRow {
  key: string;
  enabled: boolean;
  rollout_percent: number;
  target_roles: string[] | null;
  target_user_ids: string[] | null;
}

interface ConfigSnapshot {
  flags: Map<string, FlagRow>;
  settings: Map<string, unknown>;
  /** True when this snapshot came from the compiled defaults, not the database. */
  degraded: boolean;
  expiresAt: number;
}

let snapshot: ConfigSnapshot | null = null;
let inFlight: Promise<ConfigSnapshot> | null = null;

function fallbackSnapshot(): ConfigSnapshot {
  return {
    flags: new Map(),
    settings: new Map(),
    degraded: true,
    // Retry sooner than a healthy snapshot — the outage may be brief.
    expiresAt: Date.now() + 5_000,
  };
}

async function fetchSnapshot(): Promise<ConfigSnapshot> {
  try {
    const supabase = await createClient();

    const [flagResult, settingResult] = await Promise.all([
      supabase.from('feature_flags').select('key, enabled, rollout_percent, target_roles, target_user_ids'),
      supabase.from('app_settings').select('key, value'),
    ]);

    if (flagResult.error || settingResult.error) {
      return fallbackSnapshot();
    }

    return {
      flags: new Map((flagResult.data ?? []).map((row) => [row.key, row as FlagRow])),
      settings: new Map((settingResult.data ?? []).map((row) => [row.key, row.value])),
      degraded: false,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
  } catch {
    return fallbackSnapshot();
  }
}

async function getSnapshot(): Promise<ConfigSnapshot> {
  if (snapshot && snapshot.expiresAt > Date.now()) return snapshot;

  // Collapse concurrent misses into one query. Without this, a cold start under
  // load fires one config query per in-flight request.
  inFlight ??= fetchSnapshot().finally(() => {
    inFlight = null;
  });

  snapshot = await inFlight;
  return snapshot;
}

/** Drops the cache so the next read reflects a change immediately after a write. */
export function invalidateConfigCache(): void {
  snapshot = null;
}

/**
 * Deterministic 0–99 bucket for percentage rollouts. The same user always lands
 * in the same bucket, so a 10% rollout is a stable 10% of people rather than a
 * different 10% on every page load.
 */
function bucketOf(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 100;
}

export interface FlagAudience {
  userId?: string;
  roles?: readonly string[];
}

export async function isFeatureEnabled(key: FlagKey, audience: FlagAudience = {}): Promise<boolean> {
  const config = await getSnapshot();
  const row = config.flags.get(key);

  // Unknown to the database (not yet seeded, or we are degraded) → compiled default.
  if (!row) return DEFAULTS[key];
  if (!row.enabled) return false;

  if (row.target_user_ids?.length) {
    return audience.userId ? row.target_user_ids.includes(audience.userId) : false;
  }

  if (row.target_roles?.length) {
    const roles = audience.roles ?? [];
    if (!row.target_roles.some((role) => roles.includes(role))) return false;
  }

  if (row.rollout_percent >= 100) return true;
  if (row.rollout_percent <= 0) return false;

  // Anonymous visitors cannot be bucketed stably, so a partial rollout treats
  // them as outside it. Better to under-expose than to flicker per request.
  if (!audience.userId) return false;
  return bucketOf(`${key}:${audience.userId}`) < row.rollout_percent;
}

/** Resolves every flag at once — one snapshot read, for handing to the client. */
export async function resolveAllFlags(audience: FlagAudience = {}): Promise<Record<string, boolean>> {
  const keys = Object.keys(DEFAULTS) as FlagKey[];
  const entries = await Promise.all(
    keys.map(async (key) => [key, await isFeatureEnabled(key, audience)] as const)
  );
  return Object.fromEntries(entries);
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const config = await getSnapshot();
  if (!config.settings.has(key)) return fallback;
  return (config.settings.get(key) as T) ?? fallback;
}

/** Whether the last read came from the database. Surfaced on /dev for diagnosis. */
export async function configIsDegraded(): Promise<boolean> {
  return (await getSnapshot()).degraded;
}
