import { NextResponse } from 'next/server';
import { getBookingJoinUrl } from '@/lib/data/mentorship';

/**
 * Issues the Meet link for a 1:1 session.
 *
 * Same shape as the live-class join endpoint, for the same reason:
 * `mentorship_bookings.meet_url` is REVOKEd at column level, so the link is not
 * in the page, not in the RSC payload, and not in anything anyone can forward.
 * get_booking_join_url() checks that the caller is one of the two people on the
 * booking, that it is confirmed, and that it is inside the window.
 *
 * POST, not GET: a GET would be prefetched, and prefetching a credential is
 * exactly the thing this endpoint exists to avoid.
 */

const MESSAGES: Record<string, { status: number; message: string }> = {
  TOO_EARLY: { status: 425, message: 'The link opens an hour before your session.' },
  SESSION_ENDED: { status: 410, message: 'That session has finished.' },
  NOT_CONFIRMED: {
    status: 402,
    message: 'This booking is not confirmed yet. Finish the payment and it will open.',
  },
  NO_LINK_YET: {
    status: 404,
    message: 'Your mentor has not added the link yet. You will be notified when they do.',
  },
  NOT_YOURS: { status: 403, message: 'That booking is not yours.' },
  ERROR: { status: 500, message: 'We could not open that session. Please try again.' },
};

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const result = await getBookingJoinUrl(id);

  if (!result.ok) {
    const { status, message } = MESSAGES[result.reason] ?? MESSAGES.ERROR!;
    return NextResponse.json({ error: result.reason, message }, { status });
  }

  return NextResponse.json({ url: result.url });
}
