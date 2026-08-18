import { formatInTimeZone } from 'date-fns-tz';

/**
 * Date formatting for a single-timezone audience.
 *
 * Every student sits in India and every class time the educator sets is IST, so
 * formatting is pinned to Asia/Kolkata rather than the browser's zone. A student
 * travelling abroad should still see "4:00 PM" — the time the class was
 * announced as — not a converted local time that matches nothing anyone said.
 */

export const APP_TIMEZONE = 'Asia/Kolkata';

export function formatTime(iso: string): string {
  return formatInTimeZone(new Date(iso), APP_TIMEZONE, 'h:mm a');
}

export function formatDate(iso: string): string {
  return formatInTimeZone(new Date(iso), APP_TIMEZONE, 'd MMM yyyy');
}

export function formatDayMonth(iso: string): string {
  return formatInTimeZone(new Date(iso), APP_TIMEZONE, 'd MMM');
}

/** Calendar day in IST, as yyyy-MM-dd — the key the calendar groups on. */
export function toDayKey(iso: string): string {
  return formatInTimeZone(new Date(iso), APP_TIMEZONE, 'yyyy-MM-dd');
}

/**
 * "Today · 4:00 PM", "Tomorrow · 9:00 AM", "Fri 15 Aug · 4:00 PM".
 *
 * Compared by IST calendar day, not by elapsed hours: a class at 11 PM tonight
 * and one at 1 AM tomorrow are 2 hours apart but belong on different days, and
 * a student reads them that way.
 */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const target = toDayKey(iso);
  const today = toDayKey(now.toISOString());
  const tomorrow = toDayKey(new Date(now.getTime() + 86_400_000).toISOString());

  const time = formatTime(iso);
  if (target === today) return `Today · ${time}`;
  if (target === tomorrow) return `Tomorrow · ${time}`;

  return `${formatInTimeZone(new Date(iso), APP_TIMEZONE, 'EEE d MMM')} · ${time}`;
}

/** Minutes until the given moment. Negative once it has passed. */
export function minutesUntil(iso: string, now: Date = new Date()): number {
  return Math.round((new Date(iso).getTime() - now.getTime()) / 60_000);
}

export function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '—';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

/** Indian digit grouping — ₹1,20,000, not ₹120,000. */
export function formatRupees(paiseOrRupees: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paiseOrRupees);
}
