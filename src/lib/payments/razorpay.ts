import 'server-only';

import {
  verifyCheckoutSignature as verifyCheckout,
  verifyWebhookSignature as verifySignature,
} from './signature';

/**
 * Razorpay, without the SDK.
 *
 * Two calls and two signature checks is the whole surface, and the official
 * package pulls in a request stack we do not otherwise need on a serverless
 * route. Fewer dependencies on the money path is worth a few lines here.
 *
 * Amounts are in PAISE at the gateway and RUPEES in our database. Every
 * conversion happens at this boundary and nowhere else — a factor-of-100 bug
 * scattered through the app is exactly the kind that reaches production.
 */

const API = 'https://api.razorpay.com/v1';

export function isRazorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

function authHeader(): string {
  const id = process.env.RAZORPAY_KEY_ID ?? '';
  const secret = process.env.RAZORPAY_KEY_SECRET ?? '';
  return `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
}

export interface GatewayOrder {
  id: string;
  amount: number;
  currency: string;
}

/** `receipt` is our order id, so a human reading the dashboard can join the two. */
export async function createGatewayOrder(input: {
  amountInr: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<GatewayOrder | null> {
  if (!isRazorpayConfigured()) return null;

  const response = await fetch(`${API}/orders`, {
    method: 'POST',
    headers: { authorization: authHeader(), 'content-type': 'application/json' },
    body: JSON.stringify({
      amount: input.amountInr * 100,
      currency: 'INR',
      receipt: input.receipt,
      notes: input.notes ?? {},
      // Capture immediately. Manual capture means money sits authorised and
      // expires unclaimed if a cron ever fails — needless risk for this volume.
      payment_capture: 1,
    }),
  });

  if (!response.ok) {
    console.error('razorpay order failed', response.status, (await response.text()).slice(0, 300));
    return null;
  }

  return (await response.json()) as GatewayOrder;
}

/**
 * Signature checks live in ./signature.ts as pure functions taking the secret
 * as an argument — this module is `server-only`, and a `server-only` import
 * cannot be loaded by the test runner. These wrappers just supply the env.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  return verifySignature(rawBody, signature, process.env.RAZORPAY_WEBHOOK_SECRET);
}

export function verifyCheckoutSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  return verifyCheckout(input.orderId, input.paymentId, input.signature, process.env.RAZORPAY_KEY_SECRET);
}
