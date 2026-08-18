import { createVerify } from 'node:crypto';

/**
 * Amazon SNS message verification.
 *
 * SES has no webhook of its own. Bounces and complaints are published to an SNS
 * topic, and SNS POSTs them here — so this endpoint is reachable by anything
 * that can find the URL, and the signature is the only thing separating a real
 * bounce from a forged one.
 *
 * That matters more than it sounds. A forged bounce for a student's address
 * would add them to email_suppressions, and a suppressed address stops
 * receiving sign-in codes. Faking a bounce is therefore a way to lock a named
 * person out of the platform — silently, and in a way that looks like a
 * delivery problem.
 *
 * Two checks, and both are load-bearing:
 *
 *   1. The signing certificate URL must be an AWS SNS host. SNS puts the URL in
 *      the *message*, which the attacker controls, so fetching it blindly means
 *      verifying their signature against their certificate — a check that
 *      always passes. It is also a server-side request forgery primitive.
 *   2. The topic ARN must be one we configured. Signature verification proves
 *      the message came from SNS; it does not prove it came from *our* topic.
 *      Anyone with an AWS account can create a topic and subscribe our URL to
 *      it — and their messages carry a perfectly valid AWS signature.
 */

export type SnsMessageType = 'SubscriptionConfirmation' | 'Notification' | 'UnsubscribeConfirmation';

export interface SnsEnvelope {
  Type?: string;
  MessageId?: string;
  TopicArn?: string;
  Subject?: string;
  Message?: string;
  Timestamp?: string;
  SignatureVersion?: string;
  Signature?: string;
  SigningCertURL?: string;
  SigningCertUrl?: string;
  SubscribeURL?: string;
  Token?: string;
}

/**
 * The fields AWS signs, in this exact order, as `key\nvalue\n` pairs.
 *
 * The order is part of the specification and not alphabetical by accident —
 * getting it wrong produces a canonical string that never verifies, which looks
 * exactly like a forged message.
 */
const NOTIFICATION_KEYS = ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'] as const;

const SUBSCRIPTION_KEYS = [
  'Message',
  'MessageId',
  'SubscribeURL',
  'Timestamp',
  'Token',
  'TopicArn',
  'Type',
] as const;

export function buildCanonicalString(message: SnsEnvelope): string {
  const keys = message.Type === 'Notification' ? NOTIFICATION_KEYS : SUBSCRIPTION_KEYS;

  let canonical = '';
  for (const key of keys) {
    const value = (message as Record<string, unknown>)[key];
    // Absent optional fields (Subject is the common one) are skipped entirely,
    // not included as an empty string.
    if (value === undefined || value === null) continue;
    canonical += `${key}\n${String(value)}\n`;
  }

  return canonical;
}

/**
 * Accepts only certificate URLs served by SNS itself.
 *
 * `https://sns.<region>.amazonaws.com/...` and the China partition equivalent.
 * Anything else — a lookalike host, a path traversal, a different scheme — is
 * refused before any network request is made.
 */
export function isTrustedCertUrl(rawUrl: string | undefined): boolean {
  if (!rawUrl) return false;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:') return false;
  if (!/^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/.test(url.hostname)) return false;
  // Guards against `https://sns.us-east-1.amazonaws.com@evil.example.com/`,
  // which some URL parsers historically resolved to the wrong host.
  if (url.username || url.password) return false;
  if (!url.pathname.endsWith('.pem')) return false;

  return true;
}

/**
 * Certificates are stable for months, so refetching one per notification would
 * add a round trip to every bounce for no benefit. Bounded so a rotation storm
 * cannot grow it without limit.
 */
const certCache = new Map<string, string>();
const CERT_CACHE_LIMIT = 8;

export async function fetchSigningCertificate(url: string): Promise<string | null> {
  if (!isTrustedCertUrl(url)) return null;

  const cached = certCache.get(url);
  if (cached) return cached;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;

    const pem = await response.text();
    if (!pem.includes('BEGIN CERTIFICATE')) return null;

    if (certCache.size >= CERT_CACHE_LIMIT) {
      const oldest = certCache.keys().next().value;
      if (oldest) certCache.delete(oldest);
    }
    certCache.set(url, pem);

    return pem;
  } catch {
    return null;
  }
}

/** Test seam. Also lets a deploy drop a stale certificate without a restart. */
export function resetCertCache(): void {
  certCache.clear();
}

export type SnsVerdict = { ok: true } | { ok: false; reason: string };

export function verifySnsSignature(message: SnsEnvelope, certificatePem: string): SnsVerdict {
  if (!message.Signature) return { ok: false, reason: 'missing signature' };

  // Version 1 is SHA1, version 2 is SHA256. AWS still sends 1 on older topics,
  // so both are accepted — but only these two, because an unknown version means
  // an algorithm we have not agreed to.
  const algorithm =
    message.SignatureVersion === '2' ? 'RSA-SHA256' : message.SignatureVersion === '1' ? 'RSA-SHA1' : null;

  if (!algorithm) return { ok: false, reason: 'unsupported signature version' };

  try {
    const verifier = createVerify(algorithm);
    verifier.update(buildCanonicalString(message), 'utf8');
    const valid = verifier.verify(certificatePem, message.Signature, 'base64');
    return valid ? { ok: true } : { ok: false, reason: 'signature mismatch' };
  } catch {
    return { ok: false, reason: 'verification error' };
  }
}

/**
 * Topics we accept messages from.
 *
 * Empty means the endpoint refuses everything. Failing closed is right here: an
 * unconfigured endpoint that accepts anything would let any AWS account write
 * to our suppression list.
 */
export function allowedTopicArns(): string[] {
  return (process.env.SES_SNS_TOPIC_ARNS ?? process.env.SES_SNS_TOPIC_ARN ?? '')
    .split(',')
    .map((arn) => arn.trim())
    .filter(Boolean);
}

export function isAllowedTopic(topicArn: string | undefined): boolean {
  const allowed = allowedTopicArns();
  if (allowed.length === 0 || !topicArn) return false;
  return allowed.includes(topicArn);
}

// ---------------------------------------------------------------------------
// SES event payloads
//
// The SES notification is JSON *inside* the SNS `Message` string field. Two
// formats exist: the older notificationType shape and the newer eventType one
// from Configuration Set event destinations. Both are in the wild.
// ---------------------------------------------------------------------------

export interface SesEvent {
  /** Our vocabulary, matching the email_event_type enum. */
  type: 'email.delivered' | 'email.bounced' | 'email.complained' | 'email.delivery_delayed' | 'email.sent';
  recipients: string[];
  messageId: string | null;
  occurredAt: string;
  /** 'Permanent' or 'Transient' for a bounce. Only permanent ones suppress. */
  bounceType: string | null;
  detail: string | null;
}

interface SesNotification {
  notificationType?: string;
  eventType?: string;
  mail?: { messageId?: string; destination?: string[]; timestamp?: string };
  bounce?: {
    bounceType?: string;
    bounceSubType?: string;
    timestamp?: string;
    bouncedRecipients?: { emailAddress?: string; diagnosticCode?: string }[];
  };
  complaint?: {
    timestamp?: string;
    complaintFeedbackType?: string;
    complainedRecipients?: { emailAddress?: string }[];
  };
  delivery?: { timestamp?: string; recipients?: string[] };
}

const TYPE_MAP: Record<string, SesEvent['type']> = {
  bounce: 'email.bounced',
  complaint: 'email.complained',
  delivery: 'email.delivered',
  send: 'email.sent',
  delivelaydelay: 'email.delivery_delayed',
  deliverydelay: 'email.delivery_delayed',
};

export function parseSesEvent(rawMessage: string): SesEvent | null {
  let payload: SesNotification;
  try {
    payload = JSON.parse(rawMessage) as SesNotification;
  } catch {
    return null;
  }

  const kind = (payload.notificationType ?? payload.eventType ?? '').toLowerCase().replace(/\s+/g, '');
  const type = TYPE_MAP[kind];
  if (!type) return null;

  const fallbackTime = payload.mail?.timestamp ?? new Date().toISOString();

  if (type === 'email.bounced') {
    const recipients = (payload.bounce?.bouncedRecipients ?? [])
      .map((entry) => entry.emailAddress)
      .filter((address): address is string => Boolean(address));

    return {
      type,
      recipients: recipients.length ? recipients : (payload.mail?.destination ?? []),
      messageId: payload.mail?.messageId ?? null,
      occurredAt: payload.bounce?.timestamp ?? fallbackTime,
      bounceType: payload.bounce?.bounceType ?? null,
      detail: payload.bounce?.bouncedRecipients?.[0]?.diagnosticCode ?? payload.bounce?.bounceSubType ?? null,
    };
  }

  if (type === 'email.complained') {
    const recipients = (payload.complaint?.complainedRecipients ?? [])
      .map((entry) => entry.emailAddress)
      .filter((address): address is string => Boolean(address));

    return {
      type,
      recipients: recipients.length ? recipients : (payload.mail?.destination ?? []),
      messageId: payload.mail?.messageId ?? null,
      occurredAt: payload.complaint?.timestamp ?? fallbackTime,
      bounceType: null,
      detail: payload.complaint?.complaintFeedbackType ?? null,
    };
  }

  return {
    type,
    recipients: payload.delivery?.recipients ?? payload.mail?.destination ?? [],
    messageId: payload.mail?.messageId ?? null,
    occurredAt: payload.delivery?.timestamp ?? fallbackTime,
    bounceType: null,
    detail: null,
  };
}
