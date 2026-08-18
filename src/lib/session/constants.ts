/**
 * Cookie names and timings shared by middleware and the session routes.
 * Kept in one place so the two never drift apart — a mismatch here would
 * silently disable the device lock rather than fail loudly.
 */

/** The claimed device id. httpOnly: the page sets it via /api/session/claim, never directly. */
export const DEVICE_COOKIE = 'fsp_device';

/** Signed cache of {device, roles} so middleware queries Postgres at most once a minute. */
export const SESSION_CACHE_COOKIE = 'fsp_sess';

/** How long a cached middleware verdict is trusted. */
export const SESSION_CACHE_TTL_SECONDS = 60;

/** Device id lifetime. Long — losing it just means the student looks like a new device. */
export const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export interface CachedSession {
  /** device id this verdict was issued for */
  d: string;
  /** role keys held by the user */
  r: string[];
  /** epoch ms after which this verdict must be re-checked */
  e: number;
}

/** Reason codes surfaced on /sign-in so the page can explain what happened. */
export const SIGNED_OUT_ELSEWHERE = 'device';
