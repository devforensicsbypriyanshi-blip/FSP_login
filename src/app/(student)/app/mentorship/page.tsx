import { CalendarClock } from 'lucide-react';
import { BookingFlow } from '@/components/mentorship/booking-flow';
import { BookingList } from '@/components/mentorship/booking-list';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { getMentors, getMyBookings, getOpenSlots } from '@/lib/data/mentorship';

export const metadata = { title: '1:1 Mentorship' };

export default async function MentorshipPage() {
  const [mentors, slots, bookings] = await Promise.all([getMentors(), getOpenSlots(), getMyBookings()]);

  // Cancelled sessions are hidden from the student's own view — they are noise
  // once the slot has gone back on sale, and the notification already told them.
  const mine = bookings.filter((booking) => booking.isMine && booking.status !== 'cancelled');

  return (
    <>
      <PageHeader title="1:1 mentorship" description="Book a personal session with one of our educators." />

      {mine.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Your sessions</CardTitle>
            <CalendarClock className="text-primary size-[18px]" aria-hidden />
          </CardHeader>
          <BookingList bookings={mine} />
        </Card>
      )}

      <BookingFlow mentors={mentors} slots={slots} />

      <p className="text-ink-muted mx-auto max-w-xl text-center text-xs leading-relaxed">
        The join link appears on your session an hour before it starts and is issued only to you — it is never
        rendered into this page, so there is nothing to forward.
      </p>
    </>
  );
}
