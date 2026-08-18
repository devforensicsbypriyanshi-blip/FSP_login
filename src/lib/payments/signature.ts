import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Razorpay signature verification, as pure functions.
 *
 * Split out from razorpay.ts deliberately. That module is `server-only` because
 * it reads API secrets, and a `server-only` import cannot be loaded by the test
 * runner. These functions take the secret as an argument instead, so they hold
 * nothing themselves — which makes them both testable and safe to sit outside
 * the guard.
 *
 * This is the code that decides whether a payment is real. It is the part most
 * worth having tests around.
 */

/** Constant-time compare. A length mismatch is a mismatch, not an exception. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Webhook signature — HMAC-SHA256 of the RAW body.
 *
 * The raw body matters: JSON.parse then re-stringify changes key order and
 * whitespace, and the signature covers the exact bytes Razorpay sent. That is
 * the single most common way webhook verification is silently broken — it
 * passes in testing with simple payloads and fails on real ones.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string | undefined
): boolean {
  // Fail closed. A missing secret must never mean "accept everything".
  if (!secret || !signature) return false;

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}

/**
 * Checkout-handler signature: HMAC-SHA256 of `order_id|payment_id`.
 *
 * A convenience check for the browser callback. It must NEVER be what grants
 * access — the handler runs on the buyer's machine.
 */
export function verifyCheckoutSignature(
  orderId: string,
  paymentId: string,
  signature: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!secret || !signature) return false;

  const expected = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqual(expected, signature);
}
