import 'server-only';

import type { EmailPool } from './pools';
import { payloadHash, signRequest } from './sigv4';

/**
 * Provider adapters.
 *
 * Each returns the provider's own message id, which is what the delivery
 * webhook later matches on. Resend and Brevo both expose a plain REST endpoint
 * and a bearer-style key, so neither needs an SDK.
 *
 * `retryable` is the field that matters for failover: a 4xx means this request
 * was wrong and the next pool would reject it too, while a 429 or 5xx means
 * this account is busy or broken and another one may well work.
 */

export interface DispatchInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  category: string;
}

export type DispatchResult =
  { ok: true; providerId: string | null } | { ok: false; error: string; retryable: boolean };

async function sendViaResend(pool: EmailPool, input: DispatchInput): Promise<DispatchResult> {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${pool.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `Forensic Science by Priyanshi <${pool.from}>`,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        tags: [{ name: 'category', value: input.category }],
      }),
    });

    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };

    if (!response.ok) {
      return {
        ok: false,
        error: body.message ?? `HTTP ${response.status}`,
        // 429 is the daily/rate cap — exactly the case another pool can absorb.
        retryable: response.status === 429 || response.status >= 500,
      };
    }

    return { ok: true, providerId: body.id ?? null };
  } catch (error) {
    // Network failure. Another pool is a different host, so worth trying.
    return { ok: false, error: error instanceof Error ? error.message : 'network error', retryable: true };
  }
}

async function sendViaBrevo(pool: EmailPool, input: DispatchInput): Promise<DispatchResult> {
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': pool.key, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Forensic Science by Priyanshi', email: pool.from },
        to: [{ email: input.to }],
        subject: input.subject,
        htmlContent: input.html,
        textContent: input.text,
        tags: [input.category],
      }),
    });

    const body = (await response.json().catch(() => ({}))) as { messageId?: string; message?: string };

    if (!response.ok) {
      return {
        ok: false,
        error: body.message ?? `HTTP ${response.status}`,
        retryable: response.status === 429 || response.status >= 500,
      };
    }

    return { ok: true, providerId: body.messageId ?? null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'network error', retryable: true };
  }
}

/**
 * Amazon SES, v2 API, SigV4-signed.
 *
 * No @aws-sdk dependency — see sigv4.ts for why. The request is built once and
 * BOTH signed and sent as the same string, because the signature covers the
 * exact bytes; re-serialising between the two produces a signature AWS rejects.
 *
 * The error classification matters more here than with the others, because SES
 * has one failure mode that looks transient and is not: while the account is in
 * the sandbox, sending to an unverified address fails every time. Retrying it
 * across pools would burn budget to reproduce the same rejection.
 */
async function sendViaSes(pool: EmailPool, input: DispatchInput): Promise<DispatchResult> {
  const region = pool.region ?? 'ap-south-1';
  const host = `email.${region}.amazonaws.com`;
  const path = '/v2/email/outbound-emails';

  if (!pool.secret) {
    return { ok: false, error: 'SES pool is missing `secret` (AWS secret access key)', retryable: false };
  }

  const body = JSON.stringify({
    FromEmailAddress: `Forensic Science by Priyanshi <${pool.from}>`,
    Destination: { ToAddresses: [input.to] },
    Content: {
      Simple: {
        Subject: { Data: input.subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: input.html, Charset: 'UTF-8' },
          ...(input.text ? { Text: { Data: input.text, Charset: 'UTF-8' } } : {}),
        },
      },
    },
    // Surfaces per-category stats in the SES console without extra plumbing.
    EmailTags: [{ Name: 'category', Value: input.category }],
  });

  try {
    const signed = signRequest({
      method: 'POST',
      host,
      path,
      region,
      service: 'ses',
      body,
      accessKeyId: pool.key,
      secretAccessKey: pool.secret,
    });

    const response = await fetch(`https://${host}${path}`, {
      method: 'POST',
      headers: {
        authorization: signed.authorization,
        'x-amz-date': signed['x-amz-date'],
        'x-amz-content-sha256': payloadHash(body),
        'content-type': 'application/json',
      },
      body,
    });

    const result = (await response.json().catch(() => ({}))) as {
      MessageId?: string;
      message?: string;
      Message?: string;
      __type?: string;
    };

    if (!response.ok) {
      const reason = result.message ?? result.Message ?? result.__type ?? `HTTP ${response.status}`;

      // Throttling and 5xx are worth another pool. Everything else — an
      // unverified sender, a sandbox restriction, a malformed address — will
      // fail identically wherever it is retried.
      const retryable =
        response.status === 429 ||
        response.status >= 500 ||
        /Throttling|TooManyRequests|ServiceUnavailable/i.test(reason);

      return { ok: false, error: reason, retryable };
    }

    return { ok: true, providerId: result.MessageId ?? null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'network error', retryable: true };
  }
}

export async function dispatch(pool: EmailPool, input: DispatchInput): Promise<DispatchResult> {
  switch (pool.provider) {
    case 'ses':
      return sendViaSes(pool, input);
    case 'brevo':
      return sendViaBrevo(pool, input);
    case 'resend':
    default:
      return sendViaResend(pool, input);
  }
}
