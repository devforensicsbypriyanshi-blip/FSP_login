'use client';

import { FileText, Link2, Plus, Save, Upload } from 'lucide-react';
import { useActionState, useState } from 'react';
import { NoteEditor } from '@/components/studio/note-editor';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { saveResource } from '@/lib/actions/notes';
import { IDLE_FORM_STATE } from '@/lib/actions/types';
import type { AuthorCourse } from '@/lib/data/studio';
import type { Resource } from '@/lib/data/library';

/**
 * Add or edit study material.
 *
 * The format picker is first because it changes what the rest of the form even
 * asks for, and because the choice is the one the educator already made before
 * opening this page: "I have a PDF" / "I want to type this out" / "it lives in
 * Google Slides".
 */

const FORMATS = [
  {
    value: 'text',
    label: 'Write or paste',
    icon: FileText,
    hint: 'Paste straight out of a PDF. Students read it in the app, watermarked, on any screen size.',
  },
  {
    value: 'drive',
    label: 'Drive PDF',
    icon: Upload,
    hint: 'A PDF you already have. Shown in the watermarked viewer — no download button.',
  },
  {
    value: 'link',
    label: 'External link',
    icon: Link2,
    hint: 'Slides, Sheets, a dataset. The URL is never rendered into the page; the click is logged.',
  },
] as const;

const KINDS = [
  { value: 'note', label: 'Notes' },
  { value: 'dpp', label: 'Daily practice problems' },
  { value: 'paper', label: 'Previous year paper' },
  { value: 'solution', label: 'Solutions' },
  { value: 'syllabus', label: 'Syllabus' },
];

export function NoteForm({
  courses,
  resource,
  onDone,
}: {
  courses: AuthorCourse[];
  resource?: Resource;
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState(saveResource, IDLE_FORM_STATE);
  const [format, setFormat] = useState<string>(resource?.format ?? 'text');

  const chosen = FORMATS.find((entry) => entry.value === format) ?? FORMATS[0];

  if (courses.length === 0) {
    return (
      <p className="text-ink-muted text-[13px] leading-relaxed">
        You do not have any courses yet. Study material belongs to a course, so there is nowhere to put it.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4" onSubmit={() => onDone?.()}>
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

      <input type="hidden" name="resourceId" value={resource?.id ?? ''} />
      <input type="hidden" name="format" value={format} />

      <fieldset>
        <legend className="text-ink-secondary mb-2 text-[13px] font-medium">Format</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {FORMATS.map((entry) => (
            <button
              key={entry.value}
              type="button"
              onClick={() => setFormat(entry.value)}
              aria-pressed={format === entry.value}
              className={
                format === entry.value
                  ? 'border-primary bg-primary-light text-primary flex items-center gap-2 rounded-xl border-2 p-3 text-[13px] font-semibold'
                  : 'border-line-medium text-ink-secondary hover:border-primary flex items-center gap-2 rounded-xl border p-3 text-[13px] transition'
              }
            >
              <entry.icon className="size-4 shrink-0" aria-hidden />
              {entry.label}
            </button>
          ))}
        </div>
        <p className="text-ink-muted mt-2 text-[12.5px] leading-relaxed">{chosen.hint}</p>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Course" htmlFor="courseId" error={state.fieldErrors?.courseId}>
          <Select id="courseId" name="courseId" defaultValue={courses[0]?.id}>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Type" htmlFor="kind">
          <Select id="kind" name="kind" defaultValue={resource?.kind ?? 'note'}>
            {KINDS.map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Title" htmlFor="title" error={state.fieldErrors?.title}>
        <Input
          id="title"
          name="title"
          defaultValue={resource?.title}
          placeholder="e.g. Forensic Serology — complete notes"
          required
        />
      </Field>

      <Field
        label="Summary"
        htmlFor="summary"
        hint="One line, shown in the list. Optional."
        error={state.fieldErrors?.summary}
      >
        <Input
          id="summary"
          name="summary"
          defaultValue={resource?.summary ?? ''}
          placeholder="Covers ABO typing, precipitin tests and SEM-EDX interpretation."
        />
      </Field>

      {format === 'text' && (
        <Field label="Content" htmlFor="bodyMd" error={state.fieldErrors?.bodyMd}>
          <NoteEditor name="bodyMd" defaultValue={resource?.bodyMd ?? ''} />
        </Field>
      )}

      {format === 'drive' && (
        <Field
          label="Google Drive link"
          htmlFor="driveUrl"
          hint="Set sharing to “Viewer, download disabled” before pasting."
          error={state.fieldErrors?.driveUrl}
        >
          <Input id="driveUrl" name="driveUrl" placeholder="https://drive.google.com/file/d/…/view" />
        </Field>
      )}

      {format === 'link' && (
        <Field
          label="Link"
          htmlFor="externalUrl"
          hint="Anyone with the link can open it once they click through, so use link-restricted sharing at the other end too."
          error={state.fieldErrors?.externalUrl}
        >
          <Input
            id="externalUrl"
            name="externalUrl"
            defaultValue=""
            placeholder="https://docs.google.com/presentation/d/…"
          />
        </Field>
      )}

      <label className="text-ink-secondary flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          name="isFree"
          defaultChecked={resource?.isFree}
          className="size-4 accent-[var(--color-primary)]"
        />
        Free sample — readable without enrolling
      </label>

      <Button type="submit" size="sm" className="self-start" loading={pending}>
        {resource ? (
          <>
            <Save className="size-4" aria-hidden /> Save changes
          </>
        ) : (
          <>
            <Plus className="size-4" aria-hidden /> Create draft
          </>
        )}
      </Button>
    </form>
  );
}
