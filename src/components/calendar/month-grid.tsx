import { eachDayOfInterval, endOfMonth, endOfWeek, isSameMonth, startOfMonth, startOfWeek } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { APP_TIMEZONE, formatTime, toDayKey } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { LiveSession } from '@/lib/data/live';

/**
 * Desktop month grid. Built on date-fns rather than FullCalendar: ~8 KB instead
 * of ~200 KB, and it inherits our tokens instead of fighting them.
 *
 * Always six rows. A grid that is five rows in one month and six in the next
 * makes the page jump every time you page through, and the empty row costs
 * nothing.
 *
 * Weeks start Monday — the schedule model stores weekdays as ISO 1–7, and a
 * calendar that disagreed with the schedule editor would be a bug waiting to be
 * reported.
 */

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function MonthGrid({
  month,
  sessions,
  todayKey,
}: {
  /** Any date inside the month to render. */
  month: Date;
  sessions: LiveSession[];
  todayKey: string;
}) {
  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const byDay = new Map<string, LiveSession[]>();
  for (const session of sessions) {
    const key = toDayKey(session.startsAt);
    byDay.set(key, [...(byDay.get(key) ?? []), session]);
  }

  return (
    <div className="border-line-medium overflow-hidden rounded-2xl border">
      <div className="border-line-medium bg-hover grid grid-cols-7 border-b">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="text-ink-muted px-2 py-2 text-center text-[11px] font-semibold tracking-wide uppercase"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = formatInTimeZone(day, APP_TIMEZONE, 'yyyy-MM-dd');
          const dayName = formatInTimeZone(day, APP_TIMEZONE, 'd');
          const inMonth = isSameMonth(day, month);
          const isToday = key === todayKey;
          const daySessions = byDay.get(key) ?? [];

          return (
            <div
              key={key}
              className={cn(
                'border-line min-h-[104px] border-r border-b p-1.5 last:border-r-0 [&:nth-child(7n)]:border-r-0',
                !inMonth && 'bg-hover/40'
              )}
            >
              <div className="mb-1 flex justify-end">
                <span
                  className={cn(
                    'grid size-6 place-items-center rounded-full text-[11.5px] font-semibold',
                    isToday && 'bg-primary text-white',
                    !isToday && inMonth && 'text-ink-secondary',
                    !inMonth && 'text-ink-light'
                  )}
                  aria-current={isToday ? 'date' : undefined}
                >
                  {dayName}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                {daySessions.slice(0, 3).map((session) => (
                  <a
                    key={session.id}
                    href={`#session-${session.id}`}
                    title={session.title}
                    className="bg-primary-light text-primary hover:bg-primary-border block truncate rounded px-1.5 py-1 text-[11px] leading-tight font-medium"
                  >
                    {formatTime(session.startsAt)} {session.title}
                  </a>
                ))}
                {daySessions.length > 3 && (
                  <span className="text-ink-muted px-1.5 text-[10.5px]">+{daySessions.length - 3} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
