'use client';

import { BookCheck, Check, Undo2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input } from '@/components/ui/field';
import { setCourseStatus } from '@/lib/actions/console';
import { formatRupees, formatWhen } from '@/lib/format';
import type { PendingCourse } from '@/lib/data/console';

/**
 * Course approvals.
 *
 * Publishing puts a course in the public catalogue with a price on it, which is
 * why it is an admin decision rather than the educator's own. Sending one back
 * requires a note — the database refuses without one, because "rejected" on its
 * own guarantees a second submission of the same thing.
 *
 * Drafts are listed alongside submissions rather than hidden. An educator who
 * has forgotten to submit looks identical, from here, to one who has not
 * finished; showing both is how that gets noticed.
 */
export function ApprovalQueue({ courses }: { courses: PendingCourse[] }) {
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  function decide(courseId: string, status: string, reason?: string) {
    startTransition(async () => {
      const result = await setCourseStatus(courseId, status, reason);
      setFeedback(result);
      if (result.ok) {
        setRejecting(null);
        setNote('');
      }
    });
  }

  if (courses.length === 0) {
    return (
      <EmptyState
        icon={BookCheck}
        title="Nothing waiting"
        description="Courses submitted for review appear here, along with any still in draft."
      />
    );
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

      <ul className="flex flex-col gap-3">
        {courses.map((course) => {
          const submitted = course.status === 'pending_review';

          return (
            <li key={course.id} className="border-line-medium bg-surface rounded-2xl border p-4">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-ink font-semibold">{course.title}</p>
                  <p className="text-ink-muted mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px]">
                    <span>{course.educatorName ?? 'Unknown educator'}</span>
                    <span aria-hidden>·</span>
                    <span>
                      {course.lessonCount} lesson{course.lessonCount === 1 ? '' : 's'}
                    </span>
                    {course.priceInr !== null && (
                      <>
                        <span aria-hidden>·</span>
                        <span>{formatRupees(course.priceInr)}</span>
                      </>
                    )}
                    <span aria-hidden>·</span>
                    <span>Updated {formatWhen(course.updatedAt)}</span>
                  </p>
                </div>
                <Badge variant={submitted ? 'warning' : 'gray'}>
                  {submitted ? 'Pending review' : 'Draft'}
                </Badge>
              </div>

              {course.subtitle && (
                <p className="text-ink-secondary text-[13.5px] leading-relaxed">{course.subtitle}</p>
              )}

              {course.lessonCount === 0 && (
                <p className="text-warning mt-2 text-[12.5px]">
                  This course has no lessons yet. Publishing it would put an empty course in the catalogue.
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  loading={pending}
                  disabled={course.lessonCount === 0}
                  onClick={() => decide(course.id, 'published')}
                >
                  <Check className="size-4" aria-hidden /> Approve &amp; publish
                </Button>

                {submitted && (
                  <Button
                    size="sm"
                    variant="danger-outline"
                    onClick={() => setRejecting(rejecting === course.id ? null : course.id)}
                  >
                    <Undo2 className="size-4" aria-hidden /> Send back
                  </Button>
                )}
              </div>

              {rejecting === course.id && (
                <div className="bg-hover mt-3 flex flex-col gap-3 rounded-xl p-3.5 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <Field
                      label="What needs fixing?"
                      htmlFor={`note-${course.id}`}
                      hint="Sent to the educator. At least ten characters — it is the only thing they get."
                    >
                      <Input
                        id={`note-${course.id}`}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="Module 3 has no lessons, and the price is missing."
                      />
                    </Field>
                  </div>
                  <Button
                    size="sm"
                    variant="danger"
                    loading={pending}
                    disabled={note.trim().length < 10}
                    onClick={() => decide(course.id, 'draft', note)}
                  >
                    Send back
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
