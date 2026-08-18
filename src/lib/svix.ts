import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Svix webhook signature verification (Resend signs webhooks with Svix).
 *
 * Implemented directly rather than pulling in the `svix` package: it is ~30
 * lines, it is the only thing standing between the internet and our email
 * state, and it should be readable without opening node_modules.
 *
 * Scheme: HMAC-SHA256 over `{svix-id}.{svix-timestamp}.{raw body}`, keyed with
 * the base64-decoded portion of a `whsec_…` secret, compared against the
 * space-separated `v1,<sig>` entries in the svix-signature header.
 *
 * Two properties that matter:
 *   - The RAW body is signed. Verify before parsing; re-serialising JSON
 *     changes bytes and the signature will never match.
 *   - Timestamp tolerance blocks replay of a previously valid payload.
 */

const TOLERANCE_SECONDS = 5 * 60;

export type SvixResult =
  { ok: true } | { ok: false; reason: 'missing_headers' | 'bad_secret' | 'stale_timestamp' | 'no_match' };

export function verifySvixSignature({
  secret,
  rawBody,
  svixId,
  svixTimestamp,
  svixSignature,
  now = Date.now(),
}: {
  secret: string;
  rawBody: string;
  svixId: string | null;
  svixTimestamp: string | null;
  svixSignature: string | null;
  now?: number;
}): SvixResult {
  if (!svixId || !svixTimestamp || !svixSignature) return { ok: false, reason: 'missing_headers' };

  const timestamp = Number(svixTimestamp);
  if (!Number.isFinite(timestamp)) return { ok: false, reason: 'stale_timestamp' };
  if (Math.abs(now / 1000 - timestamp) > TOLERANCE_SECONDS) {
    return { ok: false, reason: 'stale_timestamp' };
  }

  // Secrets are `whsec_<base64>`; the prefix is not part of the key.
  const encoded = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  let key: Buffer;
  try {
    key = Buffer.from(encoded, 'base64');
    if (key.length === 0) return { ok: false, reason: 'bad_secret' };
  } catch {
    return { ok: false, reason: 'bad_secret' };
  }

  const expected = createHmac('sha256', key).update(`${svixId}.${svixTimestamp}.${rawBody}`).digest();

  // Header may carry several versioned signatures during key rotation.
  for (const entry of svixSignature.split(' ')) {
    const [version, value] = entry.split(',');
    if (version !== 'v1' || !value) continue;

    let candidate: Buffer;
    try {
      candidate = Buffer.from(value, 'base64');
    } catch {
      continue;
    }
    if (candidate.length !== expected.length) continue;
    if (timingSafeEqual(candidate, expected)) return { ok: true };
  }

  return { ok: false, reason: 'no_match' };
}
