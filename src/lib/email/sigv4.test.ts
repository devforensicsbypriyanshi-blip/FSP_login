import { describe, expect, it } from 'vitest';
import { payloadHash, signRequest } from './sigv4';

/**
 * SigV4 is all-or-nothing: a signature is either byte-exact or rejected, and
 * AWS's error message ("The request signature we calculated does not match")
 * tells you nothing about which step was wrong. These tests pin the parts that
 * are easy to get subtly wrong.
 */

const base = {
  method: 'POST',
  host: 'email.ap-south-1.amazonaws.com',
  path: '/v2/email/outbound-emails',
  region: 'ap-south-1',
  service: 'ses',
  body: '{"hello":"world"}',
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  now: new Date('2026-08-13T10:15:30Z'),
};

describe('signRequest', () => {
  it('is deterministic for the same inputs', () => {
    expect(signRequest(base).authorization).toBe(signRequest(base).authorization);
  });

  it('formats x-amz-date as the basic ISO8601 AWS expects', () => {
    // 20260813T101530Z — no dashes, no colons, no milliseconds.
    expect(signRequest(base)['x-amz-date']).toBe('20260813T101530Z');
  });

  it('builds a credential scope of date/region/service/aws4_request', () => {
    expect(signRequest(base).authorization).toContain(
      'Credential=AKIDEXAMPLE/20260813/ap-south-1/ses/aws4_request'
    );
  });

  it('declares signed headers lowercase and sorted', () => {
    // These must match the canonical header block exactly; a mismatch is the
    // single most common cause of a rejected signature.
    expect(signRequest(base).authorization).toContain(
      'SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date'
    );
  });

  it('changes the signature when the body changes by one byte', () => {
    const a = signRequest(base).authorization;
    const b = signRequest({ ...base, body: '{"hello":"worlD"}' }).authorization;

    expect(a).not.toBe(b);
  });

  it('changes the signature when the region changes', () => {
    const mumbai = signRequest(base).authorization;
    const ireland = signRequest({ ...base, region: 'eu-west-1' }).authorization;

    expect(mumbai).not.toBe(ireland);
  });

  it('changes the signature when the secret changes', () => {
    const a = signRequest(base).authorization;
    const b = signRequest({ ...base, secretAccessKey: 'different-secret-value-here' }).authorization;

    expect(a).not.toBe(b);
  });

  it('produces a 64-character hex signature', () => {
    const signature = signRequest(base).authorization.split('Signature=')[1];

    expect(signature).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('payloadHash', () => {
  it('matches the known SHA-256 of an empty body', () => {
    // AWS documents this constant for unsigned/empty payloads.
    expect(payloadHash('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('is sensitive to whitespace, so the sent body must be the signed body', () => {
    expect(payloadHash('{"a":1}')).not.toBe(payloadHash('{ "a": 1 }'));
  });
});
