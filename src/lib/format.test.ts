import { describe, expect, it } from 'vitest';
import { formatDuration, formatTime, formatWhen, minutesUntil, toDayKey } from './format';

/**
 * These run in UTC on CI and IST on the owner's machine, so every expectation
 * is pinned to Asia/Kolkata. If a change here starts passing locally and
 * failing in CI, it is this that broke.
 */

describe('formatWhen', () => {
  const now = new Date('2026-08-12T06:00:00Z'); // 11:30 IST

  it('labels the same IST day as Today', () => {
    expect(formatWhen('2026-08-12T10:30:00Z', now)).toBe('Today · 4:00 PM');
  });

  it('labels the next IST day as Tomorrow', () => {
    expect(formatWhen('2026-08-13T10:30:00Z', now)).toBe('Tomorrow · 4:00 PM');
  });

  it('falls back to a weekday and date further out', () => {
    expect(formatWhen('2026-08-15T10:30:00Z', now)).toBe('Sat 15 Aug · 4:00 PM');
  });

  it('rolls over on the IST day boundary, not the UTC one', () => {
    // 19:00 UTC is 00:30 IST the NEXT day. Comparing by elapsed hours would
    // call this "Today"; comparing by IST calendar day correctly says Tomorrow.
    expect(formatWhen('2026-08-12T19:00:00Z', now)).toBe('Tomorrow · 12:30 AM');
  });
});

describe('toDayKey', () => {
  it('groups by IST calendar day', () => {
    expect(toDayKey('2026-08-12T18:29:00Z')).toBe('2026-08-12'); // 23:59 IST
    expect(toDayKey('2026-08-12T18:31:00Z')).toBe('2026-08-13'); // 00:01 IST
  });
});

describe('formatTime', () => {
  it('renders IST wall clock', () => {
    expect(formatTime('2026-08-12T10:30:00Z')).toBe('4:00 PM');
    expect(formatTime('2026-08-12T03:30:00Z')).toBe('9:00 AM');
  });
});

describe('minutesUntil', () => {
  const now = new Date('2026-08-12T06:00:00Z');

  it('counts forward', () => {
    expect(minutesUntil('2026-08-12T06:15:00Z', now)).toBe(15);
  });

  it('goes negative once passed — this is what drives "started 20m ago"', () => {
    expect(minutesUntil('2026-08-12T05:40:00Z', now)).toBe(-20);
  });
});

describe('formatDuration', () => {
  it('handles the empty cases without printing "0 min"', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(0)).toBe('—');
  });

  it('formats minutes and hours', () => {
    expect(formatDuration(90)).toBe('2 min');
    expect(formatDuration(1800)).toBe('30 min');
    expect(formatDuration(3600)).toBe('1 hr');
    expect(formatDuration(5400)).toBe('1 hr 30 min');
  });
});
