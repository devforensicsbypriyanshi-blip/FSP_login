'use client';

import { Plus } from 'lucide-react';
import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { saveQuiz } from '@/lib/actions/authoring';
import { IDLE_FORM_STATE } from '@/lib/actions/types';
import type { AuthorCourse } from '@/lib/data/studio';

/**
 * Creates a test in draft.
 *
 * Draft, always — there is no "create and publish" path, because publishing
 * makes the paper visible to every enrolled student and that should never be a
 * side effect of filling in a title.
 */
export function QuizCreateForm({ courses }: { courses: AuthorCourse[] }) {
  const [state, action, pending] = useActionState(saveQuiz, IDLE_FORM_STATE);
  const [open, setOpen] = useState(false);

  if (courses.length === 0) {
    return (
      <p className="text-ink-muted text-[13px] leading-relaxed">
        You do not have any courses yet. A test belongs to a course, so there is nowhere to put one.
      </p>
    );
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="self-start" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden /> New test
      </Button>
    );
  }

  return (
    <form action={action} className="bg-hover flex flex-col gap-3 rounded-xl p-3.5">
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

      <input type="hidden" name="quizId" value="" />

      <Field label="Course" htmlFor="courseId" error={state.fieldErrors?.courseId}>
        <Select id="courseId" name="courseId">
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.title}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Title" htmlFor="title" error={state.fieldErrors?.title}>
        <Input id="title" name="title" placeholder="e.g. Forensic Serology — Unit Test 1" required />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Duration (min)" htmlFor="durationMin" error={state.fieldErrors?.durationMin}>
          <Input id="durationMin" name="durationMin" type="number" min={1} max={600} defaultValue={30} />
        </Field>
        <Field label="Negative marking" htmlFor="negativeMark" hint="Per wrong answer.">
          <Input id="negativeMark" name="negativeMark" type="number" min={0} step="0.25" defaultValue={0.5} />
        </Field>
        <Field label="Attempts allowed" htmlFor="maxAttempts">
          <Input id="maxAttempts" name="maxAttempts" type="number" min={1} max={10} defaultValue={1} />
        </Field>
      </div>

      <label className="text-ink-secondary flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          name="shuffle"
          defaultChecked
          className="size-4 accent-[var(--color-primary)]"
        />
        Shuffle question order for each student
      </label>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" loading={pending}>
          Create draft
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
