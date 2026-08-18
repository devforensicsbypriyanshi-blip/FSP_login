import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifySvixSignature } from './svix';

const SECRET = 'whsec_' + Buffer.from('a-test-signing-key-32-bytes-long').toString('base64');
const BODY = JSON.stringify({ type: 'email.delivered', data: { email_id: 'abc' } });
const ID = 'msg_2abc';
const NOW = 1_780_000_000_000; // fixed clock — Date.now() would make this flaky
const TS = String(Math.floor(NOW / 1000));

function sign(body = BODY, id = ID, ts = TS, secret = SECRET) {
  const key = Buffer.from(secret.slice(6), 'base64');
  return 'v1,' + createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
}

const base = { secret: SECRET, rawBody: BODY, svixId: ID, svixTimestamp: TS, now: NOW };

describe('verifySvixSignature', () => {
  it('accepts a correctly signed payload', () => {
    expect(verifySvixSignature({ ...base, svixSignature: sign() })).toEqual({ ok: true });
  });

  it('accepts when the header carries several versions (key rotation)', () => {
    const header = `v1,${Buffer.from('wrong').toString('base64')} ${sign()}`;
    expect(verifySvixSignature({ ...base, svixSignature: header })).toEqual({ ok: true });
  });

  it('rejects a tampered body — the whole point', () => {
    const tampered = JSON.stringify({ type: 'email.delivered', data: { email_id: 'HACKED' } });
    const res = verifySvixSignature({ ...base, rawBody: tampered, svixSignature: sign() });
    expect(res).toEqual({ ok: false, reason: 'no_match' });
  });

  it('rejects a signature made with a different secret', () => {
    const other = 'whsec_' + Buffer.from('a-completely-different-key-here!').toString('base64');
    const res = verifySvixSignature({ ...base, svixSignature: sign(BODY, ID, TS, other) });
    expect(res).toEqual({ ok: false, reason: 'no_match' });
  });

  it('rejects a replayed payload outside the tolerance window', () => {
    const oldTs = String(Math.floor(NOW / 1000) - 600); // 10 minutes ago
    const res = verifySvixSignature({
      ...base,
      svixTimestamp: oldTs,
      svixSignature: sign(BODY, ID, oldTs),
    });
    expect(res).toEqual({ ok: false, reason: 'stale_timestamp' });
  });

  it('rejects a future timestamp beyond tolerance', () => {
    const futureTs = String(Math.floor(NOW / 1000) + 600);
    const res = verifySvixSignature({
      ...base,
      svixTimestamp: futureTs,
      svixSignature: sign(BODY, ID, futureTs),
    });
    expect(res).toEqual({ ok: false, reason: 'stale_timestamp' });
  });

  it('rejects a signature bound to a different message id', () => {
    const res = verifySvixSignature({ ...base, svixSignature: sign(BODY, 'msg_other') });
    expect(res).toEqual({ ok: false, reason: 'no_match' });
  });

  it.each([
    ['id', { svixId: null }],
    ['timestamp', { svixTimestamp: null }],
    ['signature', { svixSignature: null }],
  ])('rejects when the %s header is missing', (_label, override) => {
    const res = verifySvixSignature({ ...base, svixSignature: sign(), ...override });
    expect(res).toEqual({ ok: false, reason: 'missing_headers' });
  });

  it('rejects an unparseable timestamp', () => {
    const res = verifySvixSignature({ ...base, svixTimestamp: 'not-a-number', svixSignature: sign() });
    expect(res).toEqual({ ok: false, reason: 'stale_timestamp' });
  });

  it('ignores non-v1 signature versions', () => {
    const res = verifySvixSignature({ ...base, svixSignature: sign().replace('v1,', 'v2,') });
    expect(res).toEqual({ ok: false, reason: 'no_match' });
  });
});
