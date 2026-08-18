'use client';

import { AlertTriangle, CalendarPlus, Check } from 'lucide-react';
import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { createSchedule } from '@/lib/actions/studio';
import { IDLE_FORM_STATE } from '@/lib/actions/types';
import { cn } from '@/lib/utils';

/**
 * Create a recurring live class.
 *
 * Days are ISO 1–7 (Monday first) because that is what class_schedules.weekdays
 * stores and what the calendar grid renders. Using a different order here and
 * converting would be one more place for an off-by-one that silently schedules
 * every class on the wrong day.
 *
 * Saving also publishes: the action generates 60 days of sessions in the same
 * call. A schedule with no sessions is invisible to students, so "saved but not
 * published" would only ever produce a confused educator and an empty calendar.
 */

const DAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

export function ScheduleForm({
  courses,
  today,
}: {
  courses: { id: string; title: string }[];
  /** yyyy-MM-dd computed on the server, so the default is IST not the browser's zone. */
  today: string;
}) {
  const [state, action, pending] = useActionState(createSchedule, IDLE_FORM_STATE);
  const [selected, setSelected] = useState<number[]>([1, 3, 5]);

  function toggleDay(value: number) {
    setSelected((prev) => (prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]));
  }

  if (courses.length === 0) {
    return (
      <p className="text-ink-muted text-[13px] leading-relaxed">
        Create a course first — a live class has to belong to one.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {selected.map((day) => (
        <input key={day} type="hidden" name="weekdays" value={day} />
      ))}

      {state.message && (
        <p
          className={
            state.ok
              ? 'border-success-border bg-success-bg text-success flex items-center gap-2 rounded-xl border p-3 text-[13px]'
              : 'border-error-border bg-error-bg text-error flex items-start gap-2 rounded-xl border p-3 text-[13px]'
          }
          role={state.ok ? 'status' : 'alert'}
        >
          {state.ok ? (
            <Check className="size-4 shrink-0" aria-hidden />
          ) : (
            <AlertTriangle className="mt-px size-4 shrink-0" aria-hidden />
          )}
          {state.message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Course" htmlFor="s-course" required>
          <Select id="s-course" name="courseId">
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Class title" htmlFor="s-title" error={state.fieldErrors?.title} required>
          <Input
            id="s-title"
            name="title"
            placeholder="UGC NET 2026 · Live class"
            invalid={!!state.fieldErrors?.title}
          />
        </Field>
      </div>

      <fieldset>
        <legend className="text-ink-secondary mb-2 text-[13px] font-semibold">Repeats on</legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => {
            const on = selected.includes(day.value);
            return (
              <button
                key={day.value}
                type="button"
                onClick={() => toggleDay(day.value)}
                aria-pressed={on}
                className={cn(
                  'min-h-11 min-w-[52px] rounded-full border px-3 text-[13px] font-semibold transition',
                  on
                    ? 'border-primary bg-primary text-white'
                    : 'border-line-medium text-ink-secondary hover:bg-hover'
                )}
              >
                {day.label}
              </button>
            );
          })}
        </div>
        {state.fieldErrors?.weekdays && (
          <p className="text-error mt-1.5 text-[12.5px] font-medium" role="alert">
            {state.fieldErrors.weekdays}
          </p>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Start time (IST)" htmlFor="s-time" error={state.fieldErrors?.startTime} required>
          <Input id="s-time" name="startTime" type="time" defaultValue="16:00" />
        </Field>

        <Field label="Length in minutes" htmlFor="s-duration" required>
          <Input id="s-duration" name="durationMin" type="number" min={5} max={600} defaultValue={90} />
        </Field>

        <Field label="First class on" htmlFor="s-start" error={state.fieldErrors?.startsOn} required>
          <Input id="s-start" name="startsOn" type="date" defaultValue={today} />
        </Field>
      </div>

      <Field
        label="Google Meet link"
        htmlFor="s-join"
        error={state.fieldErrors?.joinUrl}
        hint="Students never see this directly — it is released to enrolled students 15 minutes before each class."
      >
        <Input
          id="s-join"
          name="joinUrl"
          type="url"
          placeholder="https://meet.google.com/abc-defg-hij"
          invalid={!!state.fieldErrors?.joinUrl}
        />
      </Field>

      <Field label="What this class covers" htmlFor="s-desc" hint="Optional. Shown on the calendar.">
        <Textarea id="s-desc" name="description" rows={2} maxLength={500} />
      </Field>

      <Button
        type="submit"
        size="sm"
        className="self-start"
        loading={pending}
        disabled={selected.length === 0}
      >
        <CalendarPlus className="size-4" aria-hidden /> Schedule &amp; publish 60 days
      </Button>
    </form>
  );
}
