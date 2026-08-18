'use client';

import { AlertTriangle, Check, Link2, Plus } from 'lucide-react';
import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { addLesson } from '@/lib/actions/studio';
import { IDLE_FORM_STATE } from '@/lib/actions/types';
import { parseDriveUrl } from '@/lib/drive';

/**
 * Add a lesson by pasting a Google Drive link.
 *
 * The link is validated as you type, not only on submit — pasting a Drive URL
 * is the single most error-prone step in authoring a course, and finding out it
 * was wrong after a round-trip is a poor trade for a regex that costs nothing.
 *
 * We store the FILE ID, never the pasted URL: URLs carry tracking parameters and
 * change shape between Drive's views, the id does not.
 */
export function LessonForm({
  courseId,
  modules,
}: {
  courseId: string;
  modules: { id: string; title: string }[];
}) {
  const [state, action, pending] = useActionState(addLesson, IDLE_FORM_STATE);
  const [driveUrl, setDriveUrl] = useState('');
  const [open, setOpen] = useState(false);

  const parsed = driveUrl.trim() ? parseDriveUrl(driveUrl) : null;
  const linkInvalid = driveUrl.trim().length > 0 && !parsed;

  if (modules.length === 0) {
    return (
      <p className="text-ink-muted text-[13px] leading-relaxed">
        Add a section first — lessons live inside one.
      </p>
    );
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden /> Add lesson
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="courseId" value={courseId} />

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
        <Field label="Section" htmlFor="l-module" required>
          <Select id="l-module" name="moduleId">
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Lesson title" htmlFor="l-title" error={state.fieldErrors?.title} required>
          <Input
            id="l-title"
            name="title"
            placeholder="Classification of poisons"
            invalid={!!state.fieldErrors?.title}
          />
        </Field>
      </div>

      <Field
        label="Google Drive link"
        htmlFor="l-drive"
        error={
          state.fieldErrors?.driveUrl ?? (linkInvalid ? 'That is not a Drive link or file ID.' : undefined)
        }
        hint={
          parsed
            ? `Recognised — file ID ${parsed.fileId.slice(0, 12)}…`
            : 'Paste the share link, or just the file ID. Leave blank to add the video later.'
        }
      >
        <Input
          id="l-drive"
          name="driveUrl"
          placeholder="https://drive.google.com/file/d/…/view"
          value={driveUrl}
          onChange={(e) => setDriveUrl(e.target.value)}
          invalid={linkInvalid}
        />
      </Field>

      <Field label="Description" htmlFor="l-desc" hint="Optional. Shown under the video.">
        <Textarea id="l-desc" name="description" rows={2} maxLength={500} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Length in minutes" htmlFor="l-duration" hint="Optional.">
          <Input id="l-duration" name="durationMin" type="number" min={0} max={600} inputMode="numeric" />
        </Field>

        <label className="border-line-medium hover:bg-hover flex cursor-pointer items-start gap-3 self-end rounded-xl border p-3.5 transition">
          <input
            type="checkbox"
            name="isPreview"
            className="mt-0.5 size-[18px] shrink-0 accent-[var(--color-primary)]"
          />
          <span className="text-ink-secondary text-[13px] leading-relaxed">
            Free preview — visible without enrolling
          </span>
        </label>
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={pending} disabled={linkInvalid}>
          <Link2 className="size-4" aria-hidden /> Add lesson
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          Done
        </Button>
      </div>
    </form>
  );
}
