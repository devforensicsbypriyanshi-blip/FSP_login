'use client';

import { Eye, EyeOff, FileText, Link2, Plus, Trash2, Upload, X } from 'lucide-react';
import { useState, useTransition } from 'react';
import { NoteForm } from '@/components/studio/note-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { deleteResource, setResourcePublished } from '@/lib/actions/notes';
import { formatDate } from '@/lib/format';
import type { AuthorCourse } from '@/lib/data/studio';
import type { Resource } from '@/lib/data/library';

/**
 * The material library, educator side.
 *
 * Publishing is the switch that makes something real: `published_at` doubles as
 * the visibility flag, and crossing it notifies the whole course. So it is a
 * separate, deliberate action rather than a checkbox on the create form.
 */

const FORMAT_ICON: Record<string, typeof FileText> = {
  text: FileText,
  drive: Upload,
  link: Link2,
  storage: Upload,
};

const FORMAT_LABEL: Record<string, string> = {
  text: 'Reading',
  drive: 'PDF',
  link: 'Link',
  storage: 'File',
};

export function NoteManager({ resources, courses }: { resources: Resource[]; courses: AuthorCourse[] }) {
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  function togglePublished(resource: Resource) {
    startTransition(async () => {
      setFeedback(await setResourcePublished(resource.id, !resource.publishedAt));
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      setFeedback(await deleteResource(id));
      setConfirmId(null);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {feedback && (
        <p
          className={
            feedback.ok
              ? 'border-success-border bg-success-bg text-success rounded-xl border p-3 text-[13px]'
              : 'border-error-border bg-error-bg text-error rounded-xl border p-3 text-[13px]'
          }
          role={feedback.ok ? 'status' : 'alert'}
        >
          {feedback.message}
        </p>
      )}

      {creating ? (
        <div className="border-primary bg-surface rounded-2xl border-2 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-ink font-semibold">New material</p>
            <Button size="sm" variant="ghost" aria-label="Close" onClick={() => setCreating(false)}>
              <X className="size-4" aria-hidden />
            </Button>
          </div>
          <NoteForm courses={courses} onDone={() => setCreating(false)} />
        </div>
      ) : (
        <Button size="sm" variant="outline" className="self-start" onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden /> Add material
        </Button>
      )}

      {resources.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No material yet"
          description="Paste a chapter out of a PDF, attach one you already have, or link to a slide deck."
        />
      ) : (
        <ul className="divide-line flex flex-col divide-y">
          {resources.map((resource) => {
            const Icon = FORMAT_ICON[resource.format] ?? FileText;
            const published = Boolean(resource.publishedAt);

            return (
              <li key={resource.id} className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <span className="bg-primary-light text-primary grid size-9 shrink-0 place-items-center rounded-xl">
                    <Icon className="size-[18px]" aria-hidden />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-ink font-semibold">{resource.title}</p>
                    <p className="text-ink-muted mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px]">
                      <span>{resource.courseTitle ?? 'No course'}</span>
                      <span aria-hidden>·</span>
                      <span>{FORMAT_LABEL[resource.format] ?? resource.format}</span>
                      {published && (
                        <>
                          <span aria-hidden>·</span>
                          <span>Published {formatDate(resource.publishedAt!)}</span>
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {resource.isFree && <Badge variant="info">Free</Badge>}
                    <Badge variant={published ? 'success' : 'warning'}>
                      {published ? 'Published' : 'Draft'}
                    </Badge>

                    <Button
                      size="sm"
                      variant="outline"
                      loading={pending}
                      onClick={() => togglePublished(resource)}
                    >
                      {published ? (
                        <>
                          <EyeOff className="size-4" aria-hidden /> Unpublish
                        </>
                      ) : (
                        <>
                          <Eye className="size-4" aria-hidden /> Publish
                        </>
                      )}
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingId(editingId === resource.id ? null : resource.id)}
                    >
                      Edit
                    </Button>

                    <Button
                      size="sm"
                      variant="danger-outline"
                      aria-label={`Delete ${resource.title}`}
                      onClick={() => setConfirmId(confirmId === resource.id ? null : resource.id)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                </div>

                {confirmId === resource.id && (
                  <div className="border-error-border bg-error-bg flex flex-wrap items-center gap-2 rounded-xl border p-3">
                    <p className="text-error flex-1 text-[13px]">
                      Delete “{resource.title}” permanently? Students lose access immediately.
                    </p>
                    <Button size="sm" variant="danger" loading={pending} onClick={() => remove(resource.id)}>
                      Delete
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setConfirmId(null)}>
                      Keep
                    </Button>
                  </div>
                )}

                {editingId === resource.id && (
                  <div className="bg-hover rounded-xl p-3.5">
                    <NoteForm courses={courses} resource={resource} onDone={() => setEditingId(null)} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
