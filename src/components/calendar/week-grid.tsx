import { eachDayOfInterval, endOfWeek, startOfWeek } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { APP_TIMEZONE, formatTime, toDayKey } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { LiveSession } from '@/lib/data/live';

/**
 * Week view: seven columns, time down the side.
 *
 * Unlike the month grid this is proportional — a 90-minute class is twice the
 * height of a 45-minute one — because the question a week view answers is "how
 * much of my day does this take", which a uniform chip cannot show.
 *
 * The visible hours are derived from the data, not fixed at 00:00–24:00. A grid
 * showing eight empty pre-dawn rows wastes the screen; classes here run late
 * afternoon, so the window closes around them with an hour of padding.
 */

const HOUR_HEIGHT = 52;
const MIN_HOUR = 6;
const MAX_HOUR = 23;

function hourOf(iso: string): number {
  const [h, m] = formatInTimeZone(new Date(iso), APP_TIMEZONE, 'H:m').split(':');
  return Number(h) + Number(m) / 60;
}

export function WeekGrid({
  anchor,
  sessions,
  todayKey,
}: {
  /** Any date inside the week to render. */
  anchor: Date;
  sessions: LiveSession[];
  todayKey: string;
}) {
  const start = startOfWeek(anchor, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start, end: endOfWeek(anchor, { weekStartsOn: 1 }) });

  const dayKeys = new Set(days.map((d) => formatInTimeZone(d, APP_TIMEZONE, 'yyyy-MM-dd')));
  const inWeek = sessions.filter((s) => dayKeys.has(toDayKey(s.startsAt)));

  // Bound the grid to what is actually on it, with an hour either side.
  const starts = inWeek.map((s) => hourOf(s.startsAt));
  const ends = inWeek.map((s) => hourOf(s.endsAt));
  const first = starts.length > 0 ? Math.max(MIN_HOUR, Math.floor(Math.min(...starts)) - 1) : 8;
  const last = ends.length > 0 ? Math.min(MAX_HOUR, Math.ceil(Math.max(...ends)) + 1) : 18;
  const hours = Array.from({ length: Math.max(1, last - first) }, (_, i) => first + i);

  const byDay = new Map<string, LiveSession[]>();
  for (const session of inWeek) {
    const key = toDayKey(session.startsAt);
    byDay.set(key, [...(byDay.get(key) ?? []), session]);
  }

  return (
    <div className="border-line-medium overflow-hidden rounded-2xl border">
      {/* Day headings */}
      <div className="border-line-medium bg-hover grid grid-cols-[3.5rem_repeat(7,1fr)] border-b">
        <div aria-hidden />
        {days.map((day) => {
          const key = formatInTimeZone(day, APP_TIMEZONE, 'yyyy-MM-dd');
          const isToday = key === todayKey;
          return (
            <div key={key} className="px-1 py-2 text-center">
              <p className="text-ink-muted text-[10.5px] font-semibold tracking-wide uppercase">
                {formatInTimeZone(day, APP_TIMEZONE, 'EEE')}
              </p>
              <p
                className={cn(
                  'mx-auto mt-0.5 grid size-6 place-items-center rounded-full text-[12px] font-semibold',
                  isToday ? 'bg-primary text-white' : 'text-ink-secondary'
                )}
                aria-current={isToday ? 'date' : undefined}
              >
                {formatInTimeZone(day, APP_TIMEZONE, 'd')}
              </p>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="grid grid-cols-[3.5rem_repeat(7,1fr)]">
        {/* Hour labels */}
        <div className="border-line border-r">
          {hours.map((hour) => (
            <div
              key={hour}
              style={{ height: HOUR_HEIGHT }}
              className="text-ink-muted border-line relative border-b pr-1.5 text-right text-[10.5px]"
            >
              <span className="absolute -top-1.5 right-1.5">
                {hour % 12 === 0 ? 12 : hour % 12}
                {hour < 12 ? 'am' : 'pm'}
              </span>
            </div>
          ))}
        </div>

        {days.map((day) => {
          const key = formatInTimeZone(day, APP_TIMEZONE, 'yyyy-MM-dd');
          const daySessions = byDay.get(key) ?? [];

          return (
            <div key={key} className="border-line relative border-r last:border-r-0">
              {hours.map((hour) => (
                <div key={hour} style={{ height: HOUR_HEIGHT }} className="border-line border-b" />
              ))}

              {daySessions.map((session) => {
                const top = (hourOf(session.startsAt) - first) * HOUR_HEIGHT;
                const height = Math.max(
                  22,
                  (hourOf(session.endsAt) - hourOf(session.startsAt)) * HOUR_HEIGHT - 2
                );
                const cancelled = session.status === 'cancelled';

                return (
                  <a
                    key={session.id}
                    href={`#session-${session.id}`}
                    title={`${formatTime(session.startsAt)} · ${session.title}`}
                    style={{ top, height }}
                    className={cn(
                      'absolute inset-x-0.5 overflow-hidden rounded-md border px-1.5 py-1 text-[10.5px] leading-tight',
                      cancelled
                        ? 'border-line-medium bg-hover text-ink-muted line-through'
                        : 'border-primary-border bg-primary-light text-primary hover:bg-primary-border'
                    )}
                  >
                    <span className="block font-semibold">{formatTime(session.startsAt)}</span>
                    <span className="block truncate">{session.title}</span>
                  </a>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
