import { CalendarClock, CalendarPlus } from 'lucide-react';
import { BookingList } from '@/components/mentorship/booking-list';
import { SlotPublisher } from '@/components/mentorship/slot-publisher';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { getMyBookings, getOpenSlots } from '@/lib/data/mentorship';
import { getSessionContext } from '@/lib/session/server';

export const metadata = { title: '1:1 Sessions' };

export default async function StudioMentorshipPage() {
  const session = await getSessionContext();
  const [bookings, slots] = await Promise.all([
    getMyBookings(),
    // Own slots only: get_open_slots takes an educator id, and passing the
    // caller's own is what makes this "my availability" rather than everyone's.
    session ? getOpenSlots(session.userId) : Promise.resolve([]),
  ]);

  const asEducator = bookings.filter((booking) => !booking.isMine);
  const upcoming = asEducator.filter(
    (booking) => booking.status === 'confirmed' && new Date(booking.endsAt) > new Date()
  );

  return (
    <>
      <PageHeader
        title="1:1 sessions"
        description="Publish the hours you are free, and attach a Meet link once a session is booked."
      />

      <Card>
        <CardHeader>
          <CardTitle>Your availability</CardTitle>
          <CalendarPlus className="text-primary size-[18px]" aria-hidden />
        </CardHeader>
        <SlotPublisher slots={slots} />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Booked sessions</CardTitle>
          {upcoming.length > 0 ? (
            <Badge variant="success">{upcoming.length} upcoming</Badge>
          ) : (
            <CalendarClock className="text-ink-muted size-[18px]" aria-hidden />
          )}
        </CardHeader>
        <BookingList bookings={asEducator} />
      </Card>

      <p className="text-ink-muted mx-auto max-w-xl text-center text-xs leading-relaxed">
        A paid slot is held for fifteen minutes while the student pays. If the payment does not land, the hold
        is released and the slot goes back on sale by itself.
      </p>
    </>
  );
}
