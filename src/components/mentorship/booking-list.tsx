'use client';

import { CalendarClock, Link2, Radio, Trash2, Video } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input } from '@/components/ui/field';
import { cancelBooking, setBookingMeetUrl } from '@/lib/actions/mentorship';
import { formatWhen } from '@/lib/format';
import { formatINR } from '@/lib/utils';
import type { Booking } from '@/lib/data/mentorship';

/**
 * Sessions, from either side.
 *
 * The join button is not a link. `meet_url` is REVOKEd at column level and
 * issued by get_booking_join_url(), which checks that you are one of the two
 * people on the booking and that the session is within its window — a link that
 * works a week early is a link that gets forwarded.
 */

const STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'gray' | 'error' }> = {
  pending_payment: { label: 'Awaiting payment', variant: 'warning' },
  confirmed: { label: 'Confirmed', variant: 'success' },
  completed: { label: 'Completed', variant: 'gray' },
  cancelled: { label: 'Cancelled', variant: 'gray' },
  no_show: { label: 'No show', variant: 'error' },
};

export function BookingList({ bookings }: { bookings: Booking[] }) {
  const [pending, startTransition] = useTransition();
  const [linkFor, setLinkFor] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [cancelFor, setCancelFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [joining, setJoining] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  async function join(bookingId: string) {
    setFeedback(null);
    setJoining(bookingId);

    // Opened synchronously, before the fetch: window.open() after an await is
    // blocked as a popup, which reads to the user as a broken button.
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;

    try {
      const response = await fetch(`/api/mentorship/${bookingId}/join`, { method: 'POST' });
      const body = (await response.json()) as { url?: string; message?: string };

      if (!response.ok || !body.url) {
        tab?.close();
        setFeedback({ ok: false, message: body.message ?? 'We could not open that session.' });
        return;
      }

      if (tab) tab.location.href = body.url;
      else window.location.href = body.url;
    } catch {
      tab?.close();
      setFeedback({ ok: false, message: 'You appear to be offline.' });
    } finally {
      setJoining(null);
    }
  }

  function saveLink(bookingId: string) {
    startTransition(async () => {
      const result = await setBookingMeetUrl(bookingId, url);
      setFeedback(result);
      if (result.ok) {
        setLinkFor(null);
        setUrl('');
      }
    });
  }

  function cancel(bookingId: string) {
    startTransition(async () => {
      const result = await cancelBooking(bookingId, reason);
      setFeedback(result);
      if (result.ok) {
        setCancelFor(null);
        setReason('');
      }
    });
  }

  if (bookings.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="No sessions yet"
        description="Booked sessions appear here with their join link an hour before they start."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {feedback && (
        <p
          className={
            feedback.ok
              ? 'border-success-border bg-success-bg text-success rounded-xl border p-3 text-[13px]'
              : 'border-error-border bg-error-bg text-error rounded-xl border p-3 text-[13px]'
          }
          role={feedback.ok ? 'status' : 'alert'}
        >
          {feedback.message}
        </p>
      )}

      <ul className="divide-line flex flex-col divide-y">
        {bookings.map((booking) => {
          const status = STATUS[booking.status] ?? { label: booking.status, variant: 'gray' as const };
          const upcoming = new Date(booking.endsAt) > new Date();
          const joinable = booking.status === 'confirmed' && upcoming;

          return (
            <li key={booking.id} className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-ink font-semibold">
                    {booking.isMine ? `With ${booking.counterpart}` : `${booking.counterpart} booked you`}
                  </p>
                  <p className="text-ink-muted mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px]">
                    <span>{formatWhen(booking.startsAt)} IST</span>
                    {booking.priceInr > 0 && (
                      <>
                        <span aria-hidden>·</span>
                        <span>{formatINR(booking.priceInr)}</span>
                      </>
                    )}
                  </p>
                  {booking.topic && <p className="text-ink-secondary mt-1 text-[12.5px]">{booking.topic}</p>}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Badge variant={status.variant}>{status.label}</Badge>

                  {joinable && (
                    <Button size="sm" loading={joining === booking.id} onClick={() => join(booking.id)}>
                      <Radio className="size-4" aria-hidden /> Join
                    </Button>
                  )}

                  {!booking.isMine && upcoming && booking.status === 'confirmed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setLinkFor(linkFor === booking.id ? null : booking.id)}
                    >
                      <Link2 className="size-4" aria-hidden /> Meet link
                    </Button>
                  )}

                  {upcoming && booking.status !== 'cancelled' && (
                    <Button
                      size="sm"
                      variant="danger-outline"
                      onClick={() => setCancelFor(cancelFor === booking.id ? null : booking.id)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  )}
                </div>
              </div>

              {linkFor === booking.id && (
                <div className="bg-hover flex flex-col gap-3 rounded-xl p-3.5 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <Field
                      label="Google Meet link"
                      htmlFor={`meet-${booking.id}`}
                      hint="Never shown in the page — issued to the student an hour before, and only to them."
                    >
                      <Input
                        id={`meet-${booking.id}`}
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                        placeholder="https://meet.google.com/abc-defg-hij"
                      />
                    </Field>
                  </div>
                  <Button size="sm" loading={pending} onClick={() => saveLink(booking.id)}>
                    <Video className="size-4" aria-hidden /> Save
                  </Button>
                </div>
              )}

              {cancelFor === booking.id && (
                <div className="bg-error-bg flex flex-col gap-3 rounded-xl p-3.5 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <Field label="Reason" htmlFor={`why-${booking.id}`} hint="Sent to the other person.">
                      <Input
                        id={`why-${booking.id}`}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Something urgent came up"
                      />
                    </Field>
                  </div>
                  <Button size="sm" variant="danger" loading={pending} onClick={() => cancel(booking.id)}>
                    Cancel session
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
