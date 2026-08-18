/**
 * Tiny signed-payload helper for the middleware session cache.
 *
 * Uses Web Crypto only, so it runs unchanged in the Edge runtime where Node's
 * `crypto` module is unavailable.
 *
 * What this protects: middleware would otherwise query Postgres on every single
 * request to answer "is this device still the active one, and what roles does
 * this user hold?". Caching that answer for a minute in a *signed* cookie means
 * one query per device per minute, and a forged cookie buys an attacker at most
 * the remaining seconds of a window they cannot extend.
 *
 * What this is NOT: an auth token. It is only ever read for a user Supabase has
 * already authenticated. If the signature or expiry fails we re-query rather
 * than reject, so a bad cookie costs latency, never access.
 */

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Backed by an explicit ArrayBuffer rather than Uint8Array.from(), which infers
 * ArrayBufferLike and is therefore not assignable to BufferSource.
 */
function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export async function signPayload(payload: unknown, secret: string): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const mac = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(mac))}`;
}

/** Returns the payload, or null if the token is malformed or the signature fails. */
export async function verifyPayload<T>(token: string, secret: string): Promise<T | null> {
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;

  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);

  try {
    // crypto.subtle.verify is constant-time, so no manual comparison here.
    const ok = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      fromBase64Url(mac),
      encoder.encode(body)
    );
    if (!ok) return null;
    return JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as T;
  } catch {
    return null;
  }
}
