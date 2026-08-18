import {
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  parse,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Lock, MapPin } from 'lucide-react';
import Link from 'next/link';
import { MonthGrid } from '@/components/calendar/month-grid';
import { WeekGrid } from '@/components/calendar/week-grid';
import { JoinClassButton } from '@/components/live/join-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { getSessionsBetween, type LiveSession } from '@/lib/data/live';
import { APP_TIMEZONE, formatTime, minutesUntil, toDayKey } from '@/lib/format';

export const metadata = { title: 'Class Calendar' };

/**
 * Our own calendar, not Google's (docs Part 4 §3).
 *
 *   < lg  agenda only — a 7-column grid at 375px is unreadable, and a student on
 *         a phone wants "what's next", not a month overview
 *   ≥ lg  month grid first, agenda underneath for detail
 *
 * Month and week are both URL parameters rather than component state, so a
 * particular view is linkable and the back button steps through periods as
 * expected. Week is proportional (a 90-minute class is twice the height of a
 * 45-minute one); month is uniform, because at that zoom the question is "which
 * days" rather than "how long".
 */

const JOIN_WINDOW_MINUTES = 15;

function stateOf(session: LiveSession, now: Date) {
  const start = new Date(session.startsAt);
  const end = new Date(session.endsAt);

  if (session.status === 'cancelled') {
    return { badge: 'gray' as const, label: 'Cancelled', border: 'border-l-line-dark', joinable: false };
  }
  if (start <= now && end > now) {
    return { badge: 'error' as const, label: 'Live now', border: 'border-l-error', joinable: true };
  }
  if (end <= now) {
    return { badge: 'gray' as const, label: 'Finished', border: 'border-l-line-dark', joinable: false };
  }
  if (minutesUntil(session.startsAt, now) <= JOIN_WINDOW_MINUTES) {
    return { badge: 'warning' as const, label: 'Starting soon', border: 'border-l-warning', joinable: true };
  }
  return { badge: 'info' as const, label: 'Upcoming', border: 'border-l-primary', joinable: false };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; week?: string; view?: string }>;
}) {
  const { month: monthParam, week: weekParam, view: viewParam } = await searchParams;
  const now = new Date();

  const isWeek = viewParam === 'week';

  // An unparseable date parameter falls back to today rather than throwing —
  // a mangled URL should not be a crash.
  const raw = isWeek ? weekParam : monthParam;
  const pattern = isWeek ? 'yyyy-MM-dd' : 'yyyy-MM';
  const parsed = raw ? parse(raw, pattern, new Date()) : null;
  const anchor = parsed && !Number.isNaN(parsed.getTime()) ? parsed : now;

  // A week can straddle two months, so the fetch window follows the view rather
  // than always being the calendar month.
  const rangeStart = isWeek ? startOfWeek(anchor, { weekStartsOn: 1 }) : startOfMonth(anchor);
  const rangeEnd = isWeek ? endOfWeek(anchor, { weekStartsOn: 1 }) : endOfMonth(anchor);

  const sessions = await getSessionsBetween(rangeStart.toISOString(), rangeEnd.toISOString());

  const todayKey = toDayKey(now.toISOString());

  // Group into days for the agenda, preserving the ascending order the query
  // already guarantees.
  const byDay = new Map<string, LiveSession[]>();
  for (const session of sessions) {
    const key = toDayKey(session.startsAt);
    byDay.set(key, [...(byDay.get(key) ?? []), session]);
  }

  const periodLabel = isWeek
    ? `${formatInTimeZone(rangeStart, APP_TIMEZONE, 'd MMM')} – ${formatInTimeZone(rangeEnd, APP_TIMEZONE, 'd MMM yyyy')}`
    : formatInTimeZone(anchor, APP_TIMEZONE, 'MMMM yyyy');

  const stepLink = (direction: -1 | 1) =>
    isWeek
      ? `/app/calendar?view=week&week=${formatInTimeZone(
          direction === -1 ? subWeeks(anchor, 1) : addWeeks(anchor, 1),
          APP_TIMEZONE,
          'yyyy-MM-dd'
        )}`
      : `/app/calendar?month=${formatInTimeZone(
          direction === -1 ? subMonths(anchor, 1) : addMonths(anchor, 1),
          APP_TIMEZONE,
          'yyyy-MM'
        )}`;

  return (
    <>
      <PageHeader title="Class calendar" description="All scheduled live sessions, in IST." />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-ink text-base font-bold md:text-lg">{periodLabel}</h2>

        <div className="flex items-center gap-2">
          {/* Desktop-only: the grids are hidden below lg, so a switcher that
              changes nothing visible would be a dead control on mobile. */}
          <div className="border-line-medium hidden overflow-hidden rounded-full border lg:flex">
            <Link
              href="/app/calendar"
              aria-current={!isWeek ? 'page' : undefined}
              className={
                !isWeek
                  ? 'bg-primary px-3.5 py-2 text-[13px] font-semibold text-white'
                  : 'text-ink-secondary hover:bg-hover px-3.5 py-2 text-[13px] font-semibold'
              }
            >
              Month
            </Link>
            <Link
              href="/app/calendar?view=week"
              aria-current={isWeek ? 'page' : undefined}
              className={
                isWeek
                  ? 'bg-primary px-3.5 py-2 text-[13px] font-semibold text-white'
                  : 'text-ink-secondary hover:bg-hover px-3.5 py-2 text-[13px] font-semibold'
              }
            >
              Week
            </Link>
          </div>

          <Button
            asChild
            variant="outline"
            size="icon"
            aria-label={isWeek ? 'Previous week' : 'Previous month'}
          >
            <Link href={stepLink(-1)}>
              <ChevronLeft className="size-4" aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={isWeek ? '/app/calendar?view=week' : '/app/calendar'}>Today</Link>
          </Button>
          <Button asChild variant="outline" size="icon" aria-label={isWeek ? 'Next week' : 'Next month'}>
            <Link href={stepLink(1)}>
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </div>

      {/* Grids are desktop-only: seven columns at 375px is unreadable, and the
          agenda below already answers "what's next" better on a phone. */}
      <div className="hidden lg:block">
        {isWeek ? (
          <WeekGrid anchor={anchor} sessions={sessions} todayKey={todayKey} />
        ) : (
          <MonthGrid month={anchor} sessions={sessions} todayKey={todayKey} />
        )}
      </div>

      {sessions.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={`Nothing scheduled in ${periodLabel}`}
          description="Live classes appear here as soon as your educator schedules them. You'll also get an email reminder the day before each one."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {[...byDay.entries()].map(([dayKey, daySessions]) => {
            const first = daySessions[0];
            if (!first) return null;

            const heading =
              dayKey === todayKey
                ? 'Today'
                : formatInTimeZone(new Date(first.startsAt), APP_TIMEZONE, 'EEEE');

            return (
              <section key={dayKey}>
                {/* Sticky day header keeps the date visible through a long agenda. */}
                <div className="bg-surface/95 sticky top-[57px] z-10 -mx-4 flex items-baseline gap-2 px-4 py-2 backdrop-blur md:top-[65px] md:mx-0 md:px-0">
                  <h2 className="font-display text-ink text-[15px] font-bold">{heading}</h2>
                  <span className="text-ink-muted text-[12.5px]">
                    {formatInTimeZone(new Date(first.startsAt), APP_TIMEZONE, 'd MMM')}
                  </span>
                </div>

                <div className="mt-1 flex flex-col gap-3">
                  {daySessions.map((session) => {
                    const state = stateOf(session, now);
                    return (
                      <Card
                        key={session.id}
                        id={`session-${session.id}`}
                        className={`scroll-mt-24 border-l-4 p-4 ${state.border}`}
                      >
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <h3 className="text-ink min-w-0 font-semibold text-balance">{session.title}</h3>
                            <Badge
                              variant={state.badge}
                              dot={state.label === 'Live now'}
                              pulse={state.label === 'Live now'}
                            >
                              {state.label}
                            </Badge>
                          </div>

                          <div className="text-ink-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
                            <span className="flex items-center gap-1">
                              <Clock className="size-3.5" aria-hidden />
                              {formatTime(session.startsAt)} – {formatTime(session.endsAt)}
                            </span>
                            {session.courseTitle && (
                              <span className="flex items-center gap-1">
                                <MapPin className="size-3.5" aria-hidden /> {session.courseTitle}
                              </span>
                            )}
                          </div>

                          {state.joinable ? (
                            <JoinClassButton
                              sessionId={session.id}
                              size="sm"
                              className="w-full sm:w-auto sm:self-start"
                            />
                          ) : state.label === 'Upcoming' ? (
                            <span className="text-ink-light flex items-center gap-1.5 text-[12.5px]">
                              <Lock className="size-3.5" aria-hidden /> Join link opens {JOIN_WINDOW_MINUTES}{' '}
                              minutes before
                            </span>
                          ) : null}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
