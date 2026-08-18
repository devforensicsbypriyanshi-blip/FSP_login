import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyCheckoutSignature, verifyWebhookSignature } from './signature';

const SECRET = 'test_webhook_secret';

const sign = (body: string, secret = SECRET) => createHmac('sha256', secret).update(body).digest('hex');

describe('verifyWebhookSignature', () => {
  const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'p_1' } } } });

  it('accepts a correctly signed body', () => {
    expect(verifyWebhookSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects a body that was altered after signing', () => {
    // The attack: change the amount, keep the signature.
    const tampered = body.replace('p_1', 'p_2');
    expect(verifyWebhookSignature(tampered, sign(body), SECRET)).toBe(false);
  });

  it('rejects a signature made with a different secret', () => {
    expect(verifyWebhookSignature(body, sign(body, 'wrong_secret'), SECRET)).toBe(false);
  });

  it('fails closed when the secret is not configured', () => {
    // The dangerous default: an unset env var must not mean "accept anything".
    expect(verifyWebhookSignature(body, sign(body), undefined)).toBe(false);
    expect(verifyWebhookSignature(body, sign(body), '')).toBe(false);
  });

  it('fails closed when no signature header is present', () => {
    expect(verifyWebhookSignature(body, null, SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, '', SECRET)).toBe(false);
  });

  it('rejects a truncated signature without throwing', () => {
    // timingSafeEqual throws on length mismatch, which would surface as a 500
    // rather than a clean rejection. The length guard exists for this.
    expect(verifyWebhookSignature(body, sign(body).slice(0, 20), SECRET)).toBe(false);
  });

  it('is sensitive to whitespace, since the signature covers raw bytes', () => {
    // Re-serialising a parsed body is the classic way to break verification.
    const reserialised = JSON.stringify(JSON.parse(body), null, 2);
    expect(verifyWebhookSignature(reserialised, sign(body), SECRET)).toBe(false);
  });
});

describe('verifyCheckoutSignature', () => {
  const orderId = 'order_ABC';
  const paymentId = 'pay_XYZ';
  const valid = sign(`${orderId}|${paymentId}`);

  it('accepts the documented order_id|payment_id form', () => {
    expect(verifyCheckoutSignature(orderId, paymentId, valid, SECRET)).toBe(true);
  });

  it('rejects a swapped order and payment id', () => {
    expect(verifyCheckoutSignature(paymentId, orderId, valid, SECRET)).toBe(false);
  });

  it('rejects a signature for a different order', () => {
    expect(verifyCheckoutSignature('order_OTHER', paymentId, valid, SECRET)).toBe(false);
  });

  it('fails closed with no secret', () => {
    expect(verifyCheckoutSignature(orderId, paymentId, valid, undefined)).toBe(false);
  });
});
