'use client';

import { CheckCircle2, HelpCircle, MessageSquare, Send } from 'lucide-react';
import { useActionState, useState, useTransition } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { answerDoubt, askDoubt } from '@/lib/actions/doubts';
import { IDLE_FORM_STATE } from '@/lib/actions/types';
import type { Doubt } from '@/lib/data/library';
import { formatWhen } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The doubts forum.
 *
 * Verified educator answers sort to the top and are visually distinct, because
 * the reason a student opens a thread is to find the authoritative reply — not
 * to read the discussion in order.
 *
 * The verified badge cannot be self-applied: answer_doubt() sets it from the
 * poster's role. That was a real hole until migration 0018, where any student
 * could publish a wrong answer wearing the educator badge.
 */
export function DoubtBoard({
  doubts,
  courses,
  canAnswer,
}: {
  doubts: Doubt[];
  courses: { id: string; title: string }[];
  canAnswer: boolean;
}) {
  const [state, action, pending] = useActionState(askDoubt, IDLE_FORM_STATE);
  const [replying, startReply] = useTransition();
  const { toast } = useToast();

  const [asking, setAsking] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');

  function submitAnswer(doubtId: string) {
    startReply(async () => {
      const result = await answerDoubt(doubtId, replyBody);
      toast({ tone: result.ok ? 'success' : 'error', message: result.message });
      if (result.ok) {
        setReplyTo(null);
        setReplyBody('');
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Ask */}
      <div className="border-line-medium bg-surface rounded-2xl border p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-ink text-sm font-bold">Ask a doubt</h2>
          <Button size="sm" variant={asking ? 'outline' : 'primary'} onClick={() => setAsking((v) => !v)}>
            {asking ? 'Cancel' : 'Ask'}
          </Button>
        </div>

        {asking ? (
          courses.length === 0 ? (
            <p className="text-ink-muted text-[13px] leading-relaxed">
              You can only ask about courses you are enrolled in, and you are not enrolled in any yet.
            </p>
          ) : (
            <form action={action} className="flex flex-col gap-4">
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

              <Field label="Course" htmlFor="d-course" error={state.fieldErrors?.courseId} required>
                <Select id="d-course" name="courseId">
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Title" htmlFor="d-title" hint="Optional, but it helps others find the answer.">
                <Input
                  id="d-title"
                  name="title"
                  placeholder="How is GSR distinguished from environmental particles?"
                />
              </Field>

              <Field
                label="Your question"
                htmlFor="d-body"
                error={state.fieldErrors?.body}
                hint="At least ten characters. Include what you have already tried."
                required
              >
                <Textarea id="d-body" name="body" rows={4} required />
              </Field>

              <label className="border-line-medium hover:bg-hover flex min-h-11 w-fit cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 text-[13px]">
                <input type="checkbox" name="anonymous" className="size-4 accent-[var(--color-primary)]" />
                Post anonymously
              </label>

              <Button type="submit" size="sm" className="self-start" loading={pending}>
                <Send className="size-4" aria-hidden /> Post doubt
              </Button>
            </form>
          )
        ) : (
          <p className="text-ink-muted text-[13px] leading-relaxed">
            Stuck on something? Ask here and an educator will answer. Everyone on your course can see the
            reply, so one question helps the whole batch.
          </p>
        )}
      </div>

      {/* Threads */}
      {doubts.length === 0 ? (
        <EmptyState
          icon={HelpCircle}
          title="No doubts yet"
          description="Be the first to ask. Questions and their answers stay here for the whole batch to read."
        />
      ) : (
        doubts.map((doubt) => {
          const verified = doubt.answers.find((a) => a.isEducatorVerified);

          return (
            <article key={doubt.id} className="border-line-medium bg-surface rounded-2xl border p-5">
              <div className="flex gap-3">
                <Avatar name={doubt.askedBy} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    {doubt.title && (
                      <h3 className="text-ink text-[14px] leading-snug font-semibold text-balance">
                        {doubt.title}
                      </h3>
                    )}
                    <Badge variant={verified ? 'success' : doubt.status === 'open' ? 'warning' : 'gray'}>
                      {verified ? 'Answered' : doubt.status}
                    </Badge>
                  </div>

                  <p className="text-ink-secondary mt-1.5 text-[13.5px] leading-relaxed whitespace-pre-line">
                    {doubt.body}
                  </p>

                  <p className="text-ink-muted mt-2 flex flex-wrap items-center gap-x-2 text-[11.5px]">
                    <span>{doubt.askedBy}</span>
                    <span aria-hidden>·</span>
                    <span>{formatWhen(doubt.createdAt)}</span>
                    {doubt.courseTitle && (
                      <>
                        <span aria-hidden>·</span>
                        <span>{doubt.courseTitle}</span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              {doubt.answers.length > 0 && (
                <ul className="border-line mt-4 flex flex-col gap-3 border-t pt-4">
                  {doubt.answers.map((answer) => (
                    <li
                      key={answer.id}
                      className={cn(
                        'rounded-xl border p-3.5',
                        answer.isEducatorVerified
                          ? 'border-success-border bg-success-bg'
                          : 'border-line-medium'
                      )}
                    >
                      <p className="text-ink-muted mb-1.5 flex flex-wrap items-center gap-2 text-[11.5px]">
                        <span className="font-semibold">{answer.authorName}</span>
                        {answer.isEducatorVerified && (
                          <Badge variant="success">
                            <CheckCircle2 className="size-3" aria-hidden /> Educator answer
                          </Badge>
                        )}
                        <span>{formatWhen(answer.createdAt)}</span>
                      </p>
                      <p className="text-ink text-[13.5px] leading-relaxed whitespace-pre-line">
                        {answer.body}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              {canAnswer && (
                <div className="border-line mt-4 border-t pt-3">
                  {replyTo === doubt.id ? (
                    <div className="flex flex-col gap-2">
                      <Textarea
                        rows={3}
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        aria-label="Your answer"
                        placeholder="Answer this doubt…"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          loading={replying}
                          disabled={replyBody.trim().length < 2}
                          onClick={() => submitAnswer(doubt.id)}
                        >
                          <Send className="size-4" aria-hidden /> Post answer
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setReplyTo(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setReplyTo(doubt.id)}>
                      <MessageSquare className="size-4" aria-hidden /> Answer
                    </Button>
                  )}
                </div>
              )}
            </article>
          );
        })
      )}
    </div>
  );
}
