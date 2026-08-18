'use server';

import { revalidatePath } from 'next/cache';
import { callPendingRpc } from '@/lib/supabase/rpc';
import { createClient } from '@/lib/supabase/server';

/**
 * Mentorship writes.
 *
 * The interesting one is book_slot. Two students tapping the same slot in the
 * same second must produce one booking and one clear refusal — never two
 * bookings, and never a slot held by nobody. That is settled by a single
 * guarded UPDATE inside the database, not by anything here, so this file only
 * translates the refusal into something a person can read.
 */

export type BookResult =
  | { ok: true; bookingId: string; orderId: string | null; priceInr: number; holdExpires: string | null }
  | { ok: false; message: string };

export async function bookSlot(slotId: string, topic: string, notes: string): Promise<BookResult> {
  const supabase = await createClient();
  const { data, error } = await callPendingRpc(supabase, 'book_slot', {
    p_slot: slotId,
    p_topic: topic.trim() || null,
    p_notes: notes.trim() || null,
  });

  if (error) {
    const upper = error.message.toUpperCase();
    const message = upper.includes('SLOT_TAKEN')
      ? 'Someone booked that slot a moment before you. Pick another time.'
      : upper.includes('HOLD_ALREADY_OPEN')
        ? 'You already have a session waiting for payment. Finish or cancel that one first.'
        : upper.includes('TOO_LATE')
          ? 'Sessions have to be booked at least an hour ahead.'
          : upper.includes('OWN_SLOT')
            ? 'That is your own slot.'
            : upper.includes('SLOT_NOT_FOUND')
              ? 'That slot is no longer available.'
              : 'We could not book that slot.';
    return { ok: false, message };
  }

  const row = data?.[0];
  if (!row) return { ok: false, message: 'We could not book that slot.' };

  revalidatePath('/app/mentorship');
  revalidatePath('/studio/mentorship');

  return {
    ok: true,
    bookingId: row.booking_id,
    orderId: row.order_id,
    priceInr: row.price_inr,
    holdExpires: row.hold_expires,
  };
}

export async function cancelBooking(bookingId: string, reason: string) {
  const supabase = await createClient();
  const { error } = await callPendingRpc(supabase, 'cancel_booking', {
    p_booking: bookingId,
    p_reason: reason.trim() || null,
  });

  if (error) {
    return {
      ok: false as const,
      message: error.message.toUpperCase().includes('NOT_YOURS')
        ? 'That booking is not yours.'
        : 'We could not cancel that.',
    };
  }

  revalidatePath('/app/mentorship');
  revalidatePath('/studio/mentorship');
  // The slot goes straight back on sale — it is a paid working hour, and
  // leaving it dark after a cancellation loses money for no reason.
  return { ok: true as const, message: 'Cancelled. The slot is open again.' };
}

/**
 * Publishes availability.
 *
 * Times arrive as `datetime-local` strings, which carry no timezone. They are
 * read as the server's local time, which on Vercel is UTC — so they are
 * converted here against Asia/Kolkata, the timezone every educator is actually
 * thinking in. Skipping this silently shifts every slot by five and a half
 * hours, which looks like the educator making a mistake.
 */
export async function createSlots(localTimes: string[], minutes: number, priceInr: number, topic: string) {
  const starts = localTimes
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => `${value}:00+05:30`);

  if (starts.length === 0) return { ok: false as const, message: 'Add at least one time.' };

  const supabase = await createClient();
  const { data, error } = await callPendingRpc(supabase, 'create_slots', {
    p_starts: starts,
    p_minutes: minutes,
    p_price_inr: priceInr,
    p_topic: topic.trim() || null,
  });

  if (error) {
    return {
      ok: false as const,
      message: error.message.toUpperCase().includes('NOT_PERMITTED')
        ? 'Only educators can publish slots.'
        : 'We could not publish those slots.',
    };
  }

  revalidatePath('/studio/mentorship');
  revalidatePath('/app/mentorship');

  const created = Number(data ?? 0);
  const skipped = starts.length - created;

  return {
    ok: true as const,
    // Overlaps are skipped rather than failing the batch, so saying how many is
    // the difference between "it worked" and "it half worked, silently".
    message:
      skipped > 0
        ? `Published ${created}. Skipped ${skipped} that clashed with slots you already have.`
        : `Published ${created} slot${created === 1 ? '' : 's'}.`,
  };
}

export async function setBookingMeetUrl(bookingId: string, url: string) {
  const supabase = await createClient();
  const { error } = await callPendingRpc(supabase, 'set_booking_meet_url', {
    p_booking: bookingId,
    p_url: url.trim(),
  });

  if (error) {
    const upper = error.message.toUpperCase();
    return {
      ok: false as const,
      message: upper.includes('BAD_URL')
        ? 'Paste the full Meet link, starting https://'
        : upper.includes('NOT_YOURS')
          ? 'That booking is not yours.'
          : 'We could not save that link.',
    };
  }

  revalidatePath('/studio/mentorship');
  revalidatePath('/app/mentorship');
  return { ok: true as const, message: 'Link saved. The student has been notified.' };
}
