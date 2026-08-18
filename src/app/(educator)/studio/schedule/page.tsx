import { formatInTimeZone } from 'date-fns-tz';
import { CalendarDays, Clock, Repeat } from 'lucide-react';
import { ScheduleForm } from '@/components/studio/schedule-form';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { getStudioCourses, getStudioSchedules } from '@/lib/data/studio';
import { APP_TIMEZONE, formatDate } from '@/lib/format';

export const metadata = { title: 'Class Schedule' };

/**
 * Recurrence lives here, not in Google Calendar (docs Part 4 §3).
 *
 * An educator picks weekdays and a time; the engine generates real live_sessions
 * rows from it. That indirection is what makes "cancel just Friday's class"
 * possible — an exception against one occurrence, without touching the pattern.
 */

const DAY_LABELS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function describeDays(weekdays: number[]): string {
  if (weekdays.length === 7) return 'Every day';
  if (weekdays.length === 0) return 'No days set';
  return [...weekdays]
    .sort((a, b) => a - b)
    .map((d) => DAY_LABELS[d] ?? '?')
    .join(', ');
}

/** "16:00:00" → "4:00 PM". The column is a bare time, so no timezone maths. */
function formatClockTime(value: string): string {
  const [hourText, minuteText] = value.split(':');
  const hour = Number(hourText ?? 0);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${minuteText ?? '00'} ${suffix}`;
}

export default async function StudioSchedulePage() {
  const [schedules, courses] = await Promise.all([getStudioSchedules(), getStudioCourses()]);
  const today = formatInTimeZone(new Date(), APP_TIMEZONE, 'yyyy-MM-dd');

  return (
    <>
      <PageHeader
        title="Class schedule"
        description="Set a recurring pattern once. Classes are generated onto the student calendar automatically."
      />

      <Card>
        <CardHeader>
          <CardTitle>New recurring class</CardTitle>
          <Repeat className="text-primary size-[18px]" aria-hidden />
        </CardHeader>
        <ScheduleForm courses={courses.map((c) => ({ id: c.id, title: c.title }))} today={today} />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active schedules</CardTitle>
          <Badge variant="gray">{schedules.length}</Badge>
        </CardHeader>

        {schedules.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No schedules yet"
            description="Create one above and sixty days of classes appear on every enrolled student's calendar straight away."
          />
        ) : (
          <ul className="divide-line flex flex-col divide-y">
            {schedules.map((schedule) => (
              <li
                key={schedule.id}
                className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-ink font-semibold">{schedule.title}</p>
                  <p className="text-ink-muted mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
                    <span>{schedule.courseTitle ?? 'Course'}</span>
                    <span aria-hidden>·</span>
                    <span>{describeDays(schedule.weekdays)}</span>
                    <span aria-hidden>·</span>
                    <span className="flex items-center gap-1">
                      <Clock className="size-3.5" aria-hidden />
                      {formatClockTime(schedule.startTime)} IST, {schedule.durationMin} min
                    </span>
                  </p>
                  <p className="text-ink-light mt-0.5 text-[11.5px]">From {formatDate(schedule.startsOn)}</p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {/* The count is the only honest signal that publishing worked.
                      Zero upcoming means students see nothing, however healthy
                      the schedule row itself looks. */}
                  {schedule.generatedCount > 0 ? (
                    <Badge variant="success">{schedule.generatedCount} upcoming</Badge>
                  ) : (
                    <Badge variant="warning">No classes generated</Badge>
                  )}
                  {!schedule.isActive && <Badge variant="gray">Paused</Badge>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
