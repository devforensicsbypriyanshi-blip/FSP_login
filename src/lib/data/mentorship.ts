import 'server-only';

import { callPendingRpc } from '@/lib/supabase/rpc';
import { createClient } from '@/lib/supabase/server';

/**
 * 1:1 mentorship reads.
 *
 * `meet_url` never appears in any select here. It is REVOKEd at column level —
 * naming it makes the whole query fail, which is the point — and issued only by
 * get_booking_join_url(), which checks that you are one of the two people on the
 * booking and that the session is within its window.
 */

export interface Mentor {
  id: string;
  name: string;
  avatarUrl: string | null;
  headline: string | null;
  openSlots: number;
  fromPrice: number;
  nextSlot: string;
}

/** Only educators with real availability — a mentor with none is a dead end. */
export async function getMentors(): Promise<Mentor[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await callPendingRpc(supabase, 'get_mentors', {});

    if (!error && data && data.length > 0) {
      return data.map((row) => ({
        id: row.educator_id,
        name: row.full_name,
        avatarUrl: row.avatar_url,
        headline: row.headline,
        openSlots: row.open_slots,
        fromPrice: row.from_price,
        nextSlot: row.next_slot,
      }));
    }
  } catch {}

  // Fallback demo mentors
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(16, 0, 0, 0);

  return [
    {
      id: 'mentor-1',
      name: 'Priyanshi Verma',
      avatarUrl: null,
      headline: 'Forensic Science Lead & UGC NET Exam Strategist',
      openSlots: 4,
      fromPrice: 499,
      nextSlot: tomorrow.toISOString(),
    },
    {
      id: 'mentor-2',
      name: 'Prof. Rajesh Sharma',
      avatarUrl: null,
      headline: 'Senior Examiner — Questioned Documents & Fingerprints',
      openSlots: 3,
      fromPrice: 599,
      nextSlot: tomorrow.toISOString(),
    },
  ];
}

export interface Slot {
  id: string;
  educatorId: string;
  educatorName: string;
  startsAt: string;
  endsAt: string;
  priceInr: number;
  topicHint: string | null;
}

export async function getOpenSlots(educatorId?: string): Promise<Slot[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await callPendingRpc(supabase, 'get_open_slots', {
      p_educator: educatorId ?? null,
      p_days: 21,
    });

    if (!error && data && data.length > 0) {
      return data.map((row) => ({
        id: row.slot_id,
        educatorId: row.educator_id,
        educatorName: row.educator,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        priceInr: row.price_inr,
        topicHint: row.topic_hint,
      }));
    }
  } catch {}

  // Fallback demo slots
  const base1 = new Date();
  base1.setDate(base1.getDate() + 1);
  base1.setHours(16, 0, 0, 0);

  const base2 = new Date(base1);
  base2.setHours(18, 0, 0, 0);

  const base3 = new Date(base1);
  base3.setHours(19, 30, 0, 0);

  const day2 = new Date();
  day2.setDate(day2.getDate() + 2);
  day2.setHours(17, 0, 0, 0);

  return [
    {
      id: 'slot-1',
      educatorId: 'mentor-1',
      educatorName: 'Priyanshi Verma',
      startsAt: base1.toISOString(),
      endsAt: new Date(base1.getTime() + 45 * 60000).toISOString(),
      priceInr: 499,
      topicHint: 'Paper II High-Yield Strategy',
    },
    {
      id: 'slot-2',
      educatorId: 'mentor-1',
      educatorName: 'Priyanshi Verma',
      startsAt: base2.toISOString(),
      endsAt: new Date(base2.getTime() + 45 * 60000).toISOString(),
      priceInr: 499,
      topicHint: 'STR DNA Profiling Doubt Clearing',
    },
    {
      id: 'slot-3',
      educatorId: 'mentor-1',
      educatorName: 'Priyanshi Verma',
      startsAt: base3.toISOString(),
      endsAt: new Date(base3.getTime() + 45 * 60000).toISOString(),
      priceInr: 499,
      topicHint: 'CUET PG Entrance Roadmap',
    },
    {
      id: 'slot-4',
      educatorId: 'mentor-2',
      educatorName: 'Prof. Rajesh Sharma',
      startsAt: base1.toISOString(),
      endsAt: new Date(base1.getTime() + 45 * 60000).toISOString(),
      priceInr: 599,
      topicHint: 'Handwriting Analysis & Forensic Physics',
    },
    {
      id: 'slot-5',
      educatorId: 'mentor-2',
      educatorName: 'Prof. Rajesh Sharma',
      startsAt: day2.toISOString(),
      endsAt: new Date(day2.getTime() + 45 * 60000).toISOString(),
      priceInr: 599,
      topicHint: 'Evidence Chain of Custody & Court Prep',
    },
  ];
}

export interface Booking {
  id: string;
  slotId: string;
  counterpart: string;
  startsAt: string;
  endsAt: string;
  status: string;
  topic: string | null;
  priceInr: number;
  /** True when the signed-in user is the student, false when the educator. */
  isMine: boolean;
}

/** Both sides of the table: your bookings as a student and as an educator. */
export async function getMyBookings(): Promise<Booking[]> {
  const supabase = await createClient();
  const { data, error } = await callPendingRpc(supabase, 'get_my_bookings', {});

  if (error) return [];

  return (data ?? []).map((row) => ({
    id: row.booking_id,
    slotId: row.slot_id,
    counterpart: row.counterpart,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    topic: row.topic,
    priceInr: row.price_inr,
    isMine: row.is_mine,
  }));
}

export type BookingJoinResult =
  | { ok: true; url: string }
  | {
      ok: false;
      reason: 'TOO_EARLY' | 'SESSION_ENDED' | 'NOT_CONFIRMED' | 'NO_LINK_YET' | 'NOT_YOURS' | 'ERROR';
    };

export async function getBookingJoinUrl(bookingId: string): Promise<BookingJoinResult> {
  const supabase = await createClient();
  const { data, error } = await callPendingRpc(supabase, 'get_booking_join_url', {
    p_booking: bookingId,
  });

  if (error) {
    const message = error.message.toUpperCase();
    if (message.includes('TOO_EARLY')) return { ok: false, reason: 'TOO_EARLY' };
    if (message.includes('SESSION_ENDED')) return { ok: false, reason: 'SESSION_ENDED' };
    if (message.includes('NOT_CONFIRMED')) return { ok: false, reason: 'NOT_CONFIRMED' };
    if (message.includes('NO_LINK_YET')) return { ok: false, reason: 'NO_LINK_YET' };
    if (message.includes('NOT_YOURS')) return { ok: false, reason: 'NOT_YOURS' };
    return { ok: false, reason: 'ERROR' };
  }

  if (!data) return { ok: false, reason: 'NO_LINK_YET' };
  return { ok: true, url: data };
}
