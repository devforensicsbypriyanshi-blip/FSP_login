'use client';

import { Check, CheckCircle2, MessageCircleQuestion, Send, ShieldCheck } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Textarea } from '@/components/ui/field';
import { answerDoubt } from '@/lib/actions/doubts';
import { setDoubtStatus } from '@/lib/actions/authoring';
import { formatWhen } from '@/lib/format';
import type { Doubt } from '@/lib/data/library';

/**
 * The educator's side of the doubts forum.
 *
 * Replies go through answer_doubt(), which sets is_educator_verified from the
 * caller's *role* rather than from anything sent by the browser. That is not a
 * detail: before 0018, a student could post an answer with the verified badge
 * set on themselves, which on an exam-prep platform is misinformation wearing
 * the platform's authority.
 *
 * Unanswered doubts sort first. An educator opening this screen is looking for
 * work to do, not for a chronological archive.
 */

const STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'gray' | 'purple' }> = {
  open: { label: 'Awaiting answer', variant: 'warning' },
  answered: { label: 'Answered', variant: 'purple' },
  resolved: { label: 'Resolved', variant: 'success' },
  closed: { label: 'Closed', variant: 'gray' },
};

export function DoubtsDesk({ doubts }: { doubts: Doubt[] }) {
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const queue = [...doubts].sort((a, b) => {
    const aOpen = a.status === 'open' ? 0 : 1;
    const bOpen = b.status === 'open' ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  function publish(doubtId: string) {
    startTransition(async () => {
      const result = await answerDoubt(doubtId, draft);
      setFeedback(result);
      if (result.ok) {
        setOpenId(null);
        setDraft('');
      }
    });
  }

  function mark(doubtId: string, status: string) {
    startTransition(async () => {
      setFeedback(await setDoubtStatus(doubtId, status));
    });
  }

  if (queue.length === 0) {
    return (
      <EmptyState
        icon={MessageCircleQuestion}
        title="No questions yet"
        description="When a student on one of your courses asks something, it lands here."
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
        {queue.map((doubt) => {
          const status = STATUS[doubt.status] ?? { label: doubt.status, variant: 'gray' as const };

          return (
            <li key={doubt.id} className="border-line-medium bg-surface rounded-2xl border p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-ink font-semibold">{doubt.title ?? 'Question'}</p>
                  <p className="text-ink-muted mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px]">
                    <span>{doubt.askedBy}</span>
                    <span aria-hidden>·</span>
                    <span>{doubt.courseTitle ?? 'General'}</span>
                    <span aria-hidden>·</span>
                    <span>{formatWhen(doubt.createdAt)}</span>
                  </p>
                </div>
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>

              <p className="text-ink border-line border-l-2 pl-3 leading-relaxed">{doubt.body}</p>

              {doubt.answers.length > 0 && (
                <ul className="mt-3 flex flex-col gap-2">
                  {doubt.answers.map((answer) => (
                    <li key={answer.id} className="bg-hover rounded-xl p-3">
                      <p className="text-ink-muted mb-1 flex items-center gap-1.5 text-[12.5px]">
                        {answer.isEducatorVerified && (
                          <ShieldCheck className="text-success size-3.5" aria-hidden />
                        )}
                        <span className="font-medium">{answer.authorName}</span>
                        {answer.isEducatorVerified && (
                          <span className="text-success font-semibold">Verified</span>
                        )}
                      </p>
                      <p className="text-ink-secondary text-[13.5px] leading-relaxed">{answer.body}</p>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={openId === doubt.id ? 'outline' : 'primary'}
                  onClick={() => {
                    setOpenId(openId === doubt.id ? null : doubt.id);
                    setDraft('');
                  }}
                >
                  <Send className="size-4" aria-hidden />
                  {doubt.answers.length > 0 ? 'Add another answer' : 'Answer'}
                </Button>

                {doubt.status !== 'resolved' && doubt.status !== 'closed' && (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={pending}
                    onClick={() => mark(doubt.id, 'resolved')}
                  >
                    <CheckCircle2 className="size-4" aria-hidden /> Mark resolved
                  </Button>
                )}
              </div>

              {openId === doubt.id && (
                <div className="mt-3 flex flex-col gap-3">
                  <Textarea
                    rows={4}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Explain it the way you would in class…"
                    aria-label="Your answer"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      loading={pending}
                      disabled={draft.trim().length < 2}
                      onClick={() => publish(doubt.id)}
                    >
                      <Check className="size-4" aria-hidden /> Publish answer
                    </Button>
                    <span className="text-ink-muted text-[12.5px]">
                      Posted with your verified badge, and the student is notified.
                    </span>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
