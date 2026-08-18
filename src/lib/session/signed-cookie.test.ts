import { describe, expect, it } from 'vitest';
import { signPayload, verifyPayload } from './signed-cookie';

const SECRET = 'test-secret-at-least-16-chars-long';

describe('signed cookie', () => {
  it('round-trips a payload', async () => {
    const payload = { d: 'device-1', r: ['student'], e: 123456 };
    const token = await signPayload(payload, SECRET);

    expect(await verifyPayload(token, SECRET)).toEqual(payload);
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signPayload({ d: 'device-1', r: ['admin'], e: 1 }, SECRET);

    expect(await verifyPayload(token, 'a-completely-different-secret')).toBeNull();
  });

  it('rejects a tampered payload', async () => {
    // The attack this exists to stop: editing the roles list to grant yourself
    // admin, keeping the original signature.
    const token = await signPayload({ d: 'device-1', r: ['student'], e: 1 }, SECRET);
    const [, mac] = token.split('.');
    const forged = `${btoa(JSON.stringify({ d: 'device-1', r: ['admin'], e: 1 }))}.${mac}`;

    expect(await verifyPayload(forged, SECRET)).toBeNull();
  });

  it('returns null for malformed input rather than throwing', async () => {
    // Middleware treats null as "re-check against Postgres", so a garbage
    // cookie must degrade to a slow request, never a 500.
    expect(await verifyPayload('', SECRET)).toBeNull();
    expect(await verifyPayload('no-dot-here', SECRET)).toBeNull();
    expect(await verifyPayload('.onlymac', SECRET)).toBeNull();
    expect(await verifyPayload('bm90LWpzb24.abc', SECRET)).toBeNull();
  });

  it('produces url-safe tokens', async () => {
    // Signed a few different payloads because +/= only show up in some outputs.
    for (let i = 0; i < 20; i += 1) {
      const token = await signPayload({ d: `device-${i}`, r: ['student'], e: i }, SECRET);
      expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    }
  });
});
