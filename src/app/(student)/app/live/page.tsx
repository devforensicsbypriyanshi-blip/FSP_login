import { CalendarDays, Clock, Lock, PlayCircle, Users, Video } from 'lucide-react';
import Link from 'next/link';
import { JoinClassButton } from '@/components/live/join-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Progress } from '@/components/ui/progress';
import { getMyAttendance, getPastSessions, getUpcomingSessions, type LiveSession } from '@/lib/data/live';
import { formatWhen, minutesUntil } from '@/lib/format';

export const metadata = { title: 'Live Classes' };

/**
 * The join button is deliberately not a link to a stored Meet URL.
 *
 * join_url is revoked at column level and issued only by get_live_join_url(),
 * which re-checks active enrolment and the T-15m → T+30m window server-side
 * (docs Part 1 §6.3). Everything on this page below is presentation; the
 * decision to let someone in is made in Postgres.
 */

/** Open the room 15 minutes early — matches live.join_window_before_minutes. */
const JOIN_WINDOW_MINUTES = 15;

function isLiveNow(session: LiveSession, now: Date): boolean {
  return new Date(session.startsAt) <= now && new Date(session.endsAt) > now;
}

export default async function LivePage() {
  const now = new Date();
  const [upcoming, past, attendance] = await Promise.all([
    getUpcomingSessions(12),
    getPastSessions(8),
    getMyAttendance(),
  ]);

  const liveNow = upcoming.find((s) => isLiveNow(s, now));
  const queued = upcoming.filter((s) => s.id !== liveNow?.id);
  const recordings = past.filter((s) => s.hasRecording);

  // Courses with nothing held yet would show "0 of 0" and a 0% bar, which reads
  // as a bad score rather than as "term hasn't started".
  const tracked = attendance.filter((course) => course.held > 0);

  return (
    <>
      <PageHeader title="Live classroom" description="Join live sessions and catch up on recordings.">
        <Button asChild variant="outline" size="sm">
          <Link href="/app/calendar">
            <CalendarDays className="size-4" aria-hidden /> Full calendar
          </Link>
        </Button>
      </PageHeader>

      {liveNow && (
        <Card className="border-primary border-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <Badge variant="error" dot pulse>
              LIVE NOW
            </Badge>
            <span className="text-primary text-[13px] font-semibold">
              Started {Math.abs(minutesUntil(liveNow.startsAt, now))}m ago
            </span>
          </div>

          <div className="bg-navy flex flex-col items-center justify-center gap-3 rounded-xl px-5 py-10 text-center text-white md:py-14">
            <span className="bg-primary grid size-14 place-items-center rounded-full shadow-[0_0_24px_rgba(124,58,237,0.55)]">
              <Video className="size-7" aria-hidden />
            </span>
            <h2 className="font-display text-lg font-bold text-balance md:text-xl">{liveNow.title}</h2>
            <p className="max-w-md text-[13px] text-white/70">
              {liveNow.educatorName ? `${liveNow.educatorName} is live.` : 'Class in progress.'} The Google
              Meet link opens for enrolled students only.
            </p>
            <JoinClassButton sessionId={liveNow.id} size="lg" className="mt-2 w-full sm:w-auto" />
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Upcoming sessions</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/app/calendar">View calendar</Link>
          </Button>
        </CardHeader>

        {queued.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No classes scheduled"
            description="When your educator schedules the next class it will appear here, and you'll get an email the day before."
          />
        ) : (
          <ul className="divide-line flex flex-col divide-y">
            {queued.map((session) => {
              const minutes = minutesUntil(session.startsAt, now);
              const openable = minutes <= JOIN_WINDOW_MINUTES;

              return (
                <li
                  key={session.id}
                  className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-ink font-semibold">{session.title}</p>
                    <p className="text-ink-muted mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px]">
                      <span>{session.courseTitle ?? 'Live class'}</span>
                      <span aria-hidden>·</span>
                      <span className="flex items-center gap-1">
                        <Clock className="size-3.5" aria-hidden /> {formatWhen(session.startsAt, now)} IST
                      </span>
                    </p>
                  </div>

                  {openable ? (
                    <JoinClassButton sessionId={session.id} size="sm" className="self-start sm:self-auto">
                      Join now
                    </JoinClassButton>
                  ) : (
                    <span className="text-ink-light flex items-center gap-1.5 self-start text-[12.5px] sm:self-auto">
                      <Lock className="size-3.5" aria-hidden /> Opens {JOIN_WINDOW_MINUTES} min before
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {tracked.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Your attendance</CardTitle>
            <Badge variant="gray">Live classes only</Badge>
          </CardHeader>

          <ul className="flex flex-col gap-4">
            {tracked.map((course) => (
              <li key={course.courseId}>
                <Progress
                  value={(course.attended / course.held) * 100}
                  label={`${course.courseTitle} — ${course.attended} of ${course.held} attended`}
                />
              </li>
            ))}
          </ul>

          <p className="text-ink-muted mt-4 text-[12.5px] leading-relaxed">
            Counts classes that have already finished. Watching a recording afterwards does not change this —
            it only records that you opened the live room.
          </p>
        </Card>
      )}

      {recordings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent recordings</CardTitle>
            <Badge variant="gray">{recordings.length}</Badge>
          </CardHeader>

          <ul className="divide-line flex flex-col divide-y">
            {recordings.map((session) => (
              <li
                key={session.id}
                className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-ink font-semibold">{session.title}</p>
                  <p className="text-ink-muted mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px]">
                    <span>{session.courseTitle ?? 'Live class'}</span>
                    <span aria-hidden>·</span>
                    <span className="flex items-center gap-1">
                      <Users className="size-3.5" aria-hidden /> {formatWhen(session.startsAt, now)}
                    </span>
                  </p>
                </div>
                <Button asChild variant="outline" size="sm" className="self-start sm:self-auto">
                  <Link href={`/app/live/${session.id}`}>
                    <PlayCircle className="size-4" aria-hidden /> Watch
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
