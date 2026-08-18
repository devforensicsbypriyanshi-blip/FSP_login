'use client';

import { AlertTriangle, Megaphone, Send } from 'lucide-react';
import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { sendBroadcast } from '@/lib/actions/authoring';
import { IDLE_FORM_STATE } from '@/lib/actions/types';
import type { AuthorCourse } from '@/lib/data/studio';

/**
 * Compose an announcement.
 *
 * The confirmation step is not politeness. send_broadcast() queues one row per
 * enrolled student and the worker may deliver within the minute, so there is no
 * recall — an "undo" button here would be a lie. Naming the count in the
 * confirmation is the only real protection: "send to 196 students" reads
 * differently from "send".
 */
export function BroadcastComposer({ courses }: { courses: AuthorCourse[] }) {
  const [state, action, pending] = useActionState(sendBroadcast, IDLE_FORM_STATE);
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '');
  const [confirming, setConfirming] = useState(false);

  const selected = courses.find((course) => course.id === courseId);
  const recipients = selected?.studentCount ?? 0;

  if (courses.length === 0) {
    return (
      <p className="text-ink-muted text-[13px] leading-relaxed">
        You do not have any courses yet. Announcements go to the students enrolled on a course, so there is
        nobody to address.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4" onSubmit={() => setConfirming(false)}>
      {state.message && (
        <p
          className={
            state.ok
              ? 'border-success-border bg-success-bg text-success rounded-xl border p-3 text-[13px]'
              : 'border-error-border bg-error-bg text-error rounded-xl border p-3 text-[13px]'
          }
          role={state.ok ? 'status' : 'alert'}
        >
          {state.message}
        </p>
      )}

      <Field label="Audience" htmlFor="courseId" error={state.fieldErrors?.courseId}>
        <Select
          id="courseId"
          name="courseId"
          value={courseId}
          onChange={(event) => {
            setCourseId(event.target.value);
            setConfirming(false);
          }}
        >
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.title} ({course.studentCount} enrolled)
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Title" htmlFor="title" error={state.fieldErrors?.title}>
        <Input id="title" name="title" placeholder="e.g. Extra doubt session on Sunday" required />
      </Field>

      <Field
        label="Message"
        htmlFor="body"
        error={state.fieldErrors?.body}
        hint="Sent as a push notification and an email. Keep it to what a student needs on a phone screen."
      >
        <Textarea id="body" name="body" rows={4} placeholder="Type your message…" />
      </Field>

      {confirming ? (
        <div className="border-warning-border bg-warning-bg flex flex-col gap-3 rounded-xl border p-3.5">
          <p className="text-warning flex items-start gap-2 text-[13px] leading-relaxed">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              This goes to{' '}
              <strong>
                {recipients} student{recipients === 1 ? '' : 's'}
              </strong>{' '}
              on {selected?.title}. There is no recall — the worker may deliver it within a minute.
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" loading={pending}>
              <Send className="size-4" aria-hidden /> Yes, send it
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(false)}>
              Keep editing
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          className="self-start"
          disabled={recipients === 0}
          onClick={() => setConfirming(true)}
        >
          <Megaphone className="size-4" aria-hidden />
          {recipients === 0
            ? 'Nobody enrolled yet'
            : `Send to ${recipients} student${recipients === 1 ? '' : 's'}`}
        </Button>
      )}
    </form>
  );
}
