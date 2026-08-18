import 'server-only';

/**
 * Firebase Cloud Messaging — HTTP v1.
 *
 * The legacy `/fcm/send` endpoint took a static server key and is now shut down.
 * v1 requires a short-lived OAuth2 access token, obtained by signing a JWT with
 * the service account's private key. That is the whole of the complexity here,
 * and it is why this file exists rather than a one-line fetch.
 *
 * No firebase-admin dependency: it pulls in a large tree and assumes a
 * long-lived Node process, neither of which fits a serverless route that sends
 * a few hundred messages a day. Web Crypto does the signing in ~40 lines.
 *
 * Tokens are cached in module scope for their full hour minus a minute of slack,
 * so a warm instance mints one token, not one per message.
 */

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

function readServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;

  try {
    // Accepts either raw JSON or base64 — Vercel's env UI mangles multi-line
    // values, so base64 is the reliable way to paste a service account there.
    const decoded = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded) as ServiceAccount;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null;

    return {
      ...parsed,
      // Env vars flatten newlines; the PEM parser needs them back.
      private_key: parsed.private_key.replace(/\\n/g, '\n'),
    };
  } catch {
    return null;
  }
}

function base64Url(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** PEM → ArrayBuffer, for crypto.subtle.importKey. */
function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function getAccessToken(account: ServiceAccount): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  );

  try {
    const key = await crypto.subtle.importKey(
      'pkcs8',
      pemToPkcs8(account.private_key),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      key,
      new TextEncoder().encode(`${header}.${claim}`)
    );

    const assertion = `${header}.${claim}.${base64Url(new Uint8Array(signature))}`;

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });

    if (!response.ok) return null;

    const body = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) return null;

    cachedToken = {
      value: body.access_token,
      expiresAt: Date.now() + ((body.expires_in ?? 3600) - 60) * 1000,
    };
    return cachedToken.value;
  } catch {
    return null;
  }
}

export type PushOutcome =
  | { ok: true }
  /** The token is dead for good — delete it rather than counting a failure. */
  | { ok: false; permanent: true; reason: string }
  | { ok: false; permanent: false; reason: string };

export function isFcmConfigured(): boolean {
  return readServiceAccount() !== null;
}

export async function sendPush(input: {
  token: string;
  title: string;
  body?: string | null;
  /** Deep link opened when the notification is tapped. */
  url?: string;
  data?: Record<string, string>;
}): Promise<PushOutcome> {
  const account = readServiceAccount();
  if (!account) return { ok: false, permanent: false, reason: 'FCM_NOT_CONFIGURED' };

  const accessToken = await getAccessToken(account);
  if (!accessToken) return { ok: false, permanent: false, reason: 'FCM_AUTH_FAILED' };

  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token: input.token,
        notification: { title: input.title, body: input.body ?? '' },
        // Data must be flat strings — FCM rejects nested objects outright.
        data: { url: input.url ?? '/app/notifications', ...(input.data ?? {}) },
        webpush: {
          fcm_options: { link: input.url ?? '/app/notifications' },
          notification: { icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' },
        },
      },
    }),
  });

  if (response.ok) return { ok: true };

  const text = await response.text();

  // 404 UNREGISTERED / 400 INVALID_ARGUMENT on the token mean it will never
  // work again — the app was uninstalled or the token rotated.
  const permanent =
    response.status === 404 ||
    text.includes('UNREGISTERED') ||
    text.includes('INVALID_ARGUMENT') ||
    text.includes('registration-token-not-registered');

  return { ok: false, permanent, reason: `${response.status}: ${text.slice(0, 200)}` };
}
