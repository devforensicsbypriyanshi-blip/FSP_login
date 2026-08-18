import { describe, expect, it } from 'vitest';
import { hasRoom, pressure, selectPools, type EmailPool, type PoolUsage } from './pools';

const pool = (over: Partial<EmailPool> & { id: string }): EmailPool => ({
  provider: 'resend',
  key: 'k',
  from: 'a@b.c',
  dailyCap: 100,
  monthlyCap: 3000,
  priority: 0,
  ...over,
});

const used = (today: number, month = today): PoolUsage => ({ today, month });

describe('hasRoom', () => {
  it('needs headroom on BOTH budgets', () => {
    const p = pool({ id: 'a' });

    expect(hasRoom(p, used(0, 0))).toBe(true);
    expect(hasRoom(p, used(100, 100))).toBe(false); // daily spent
    // The one that is easy to miss: fine today, but the month is gone.
    expect(hasRoom(p, used(0, 3000))).toBe(false);
  });
});

describe('pressure', () => {
  it('reports whichever budget is closer to full', () => {
    const p = pool({ id: 'a', dailyCap: 100, monthlyCap: 3000 });

    expect(pressure(p, used(50, 150))).toBeCloseTo(0.5); // daily binds
    expect(pressure(p, used(10, 2700))).toBeCloseTo(0.9); // monthly binds
  });
});

describe('selectPools', () => {
  it('routes to the pool that serves the category', () => {
    const pools = [
      pool({ id: 'auth', categories: ['auth'] }),
      pool({ id: 'bulk', categories: ['class_reminder'] }),
    ];

    expect(selectPools(pools, 'auth', {}).map((p) => p.id)).toEqual(['auth']);
    expect(selectPools(pools, 'class_reminder', {}).map((p) => p.id)).toEqual(['bulk']);
  });

  it('skips a pool that has spent its daily budget', () => {
    const pools = [pool({ id: 'a' }), pool({ id: 'b' })];

    expect(selectPools(pools, 'notification', { a: used(100) }).map((p) => p.id)).toEqual(['b']);
  });

  it('skips a pool that has spent its MONTHLY budget even with daily room', () => {
    // The failure this prevents: the key looks healthy every morning, gets
    // picked, and fails at the provider — again the next day, all month.
    const pools = [pool({ id: 'a' }), pool({ id: 'b' })];

    expect(selectPools(pools, 'notification', { a: used(0, 3000) }).map((p) => p.id)).toEqual(['b']);
  });

  it('still returns exhausted pools for auth — a lockout is worse than an overage', () => {
    const pools = [pool({ id: 'a' })];

    expect(selectPools(pools, 'notification', { a: used(100, 3000) })).toHaveLength(0);
    expect(selectPools(pools, 'auth', { a: used(100, 3000) }).map((p) => p.id)).toEqual(['a']);
  });

  it('puts pools with room ahead of exhausted ones for auth', () => {
    const pools = [pool({ id: 'spent', priority: 0 }), pool({ id: 'fresh', priority: 1 })];

    expect(selectPools(pools, 'auth', { spent: used(100) }).map((p) => p.id)).toEqual(['fresh', 'spent']);
  });

  it('spreads load across equal-priority pools by pressure', () => {
    const pools = [pool({ id: 'a' }), pool({ id: 'b' })];

    expect(selectPools(pools, 'notification', { a: used(90), b: used(10) }).map((p) => p.id)).toEqual([
      'b',
      'a',
    ]);
  });

  it('prefers monthly headroom when daily usage is level', () => {
    // Late in the month both keys look identical on the day, but one has
    // almost nothing left overall.
    const pools = [pool({ id: 'drained' }), pool({ id: 'spare' })];

    expect(
      selectPools(pools, 'notification', {
        drained: used(10, 2900),
        spare: used(10, 200),
      }).map((p) => p.id)
    ).toEqual(['spare', 'drained']);
  });

  it('honours priority ahead of pressure', () => {
    const pools = [pool({ id: 'primary', priority: 0 }), pool({ id: 'backup', priority: 9 })];

    expect(selectPools(pools, 'notification', {}).map((p) => p.id)).toEqual(['primary', 'backup']);
  });

  it('falls back to general-purpose pools when no pool names the category', () => {
    const pools = [pool({ id: 'auth', categories: ['auth'] }), pool({ id: 'any' })];

    expect(selectPools(pools, 'invoice', {}).map((p) => p.id)).toEqual(['any']);
  });

  it('returns nothing rather than guessing when every pool is category-locked', () => {
    const pools = [pool({ id: 'auth', categories: ['auth'] })];

    expect(selectPools(pools, 'invoice', {})).toHaveLength(0);
  });
});
