'use client';

import { AlertTriangle, Check, ChevronLeft, ChevronRight, Clock, Flag, LayoutGrid } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { saveResponse, submitAttempt } from '@/lib/actions/quizzes';
import type { AttemptPaper } from '@/lib/data/quizzes';
import { cn } from '@/lib/utils';

/**
 * Timed MCQ runner.
 *
 * The three things exam candidates actually rely on, and why each is built the
 * way it is:
 *
 *   Autosave — every answer is persisted the moment it is chosen. There is no
 *   "save" button because a dropped connection at minute 58 must not cost the
 *   hour. Failures are silent by design: the next answer re-saves, and an error
 *   toast mid-question is a distraction, not a help.
 *
 *   The palette — colour-coded state for every question at a glance. This is
 *   the single most-used control in any real exam interface; candidates
 *   navigate by it far more than by Next.
 *
 *   The timer — a display of the server's `expiresAt`, recomputed from the wall
 *   clock each second rather than decremented. A decremented counter drifts
 *   when the tab is backgrounded, and mobile browsers throttle timers hard.
 *   When it hits zero the attempt auto-submits, because a student who ran out
 *   of time should still get their marks for what they answered.
 */

type Status = 'unseen' | 'answered' | 'review' | 'seen';

const PALETTE: Record<Status, string> = {
  answered: 'bg-success text-white border-success',
  review: 'bg-warning text-white border-warning',
  seen: 'bg-error-bg text-error border-error-border',
  unseen: 'bg-surface text-ink-muted border-line-medium',
};

function formatClock(msLeft: number): string {
  const total = Math.max(0, Math.floor(msLeft / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function QuizRunner({ paper }: { paper: AttemptPaper }) {
  const router = useRouter();
  const { toast } = useToast();
  const [submitting, startSubmit] = useTransition();

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(paper.questions.map((q) => [q.questionId, q.chosen]))
  );
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [visited, setVisited] = useState<Set<string>>(() => new Set([paper.questions[0]?.questionId ?? '']));
  const [msLeft, setMsLeft] = useState(() => new Date(paper.expiresAt).getTime() - Date.now());
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const submitted = useRef(false);
  const current = paper.questions[index];

  const finish = useCallback(
    (auto: boolean) => {
      if (submitted.current) return;
      submitted.current = true;

      startSubmit(async () => {
        const result = await submitAttempt(paper.attemptId);
        if (!result.ok) {
          submitted.current = false;
          toast({ tone: 'error', message: result.message });
          return;
        }
        if (auto) toast({ tone: 'warning', message: 'Time is up — your answers were submitted.' });
        router.replace(`/app/tests/attempt/${paper.attemptId}`);
        router.refresh();
      });
    },
    [paper.attemptId, router, toast]
  );

  // Recomputed from the clock, never decremented — a backgrounded tab would
  // otherwise drift minutes off the server's deadline.
  useEffect(() => {
    const tick = setInterval(() => {
      const remaining = new Date(paper.expiresAt).getTime() - Date.now();
      setMsLeft(remaining);
      if (remaining <= 0) finish(true);
    }, 1000);
    return () => clearInterval(tick);
  }, [paper.expiresAt, finish]);

  function choose(questionId: string, optionId: string) {
    // Tapping the chosen option again clears it — students expect to be able
    // to un-answer when negative marking is on.
    const next = answers[questionId] === optionId ? null : optionId;
    setAnswers((prev) => ({ ...prev, [questionId]: next }));
    void saveResponse(paper.attemptId, questionId, next);
  }

  function go(to: number) {
    const target = paper.questions[to];
    if (!target) return;
    setIndex(to);
    setVisited((prev) => new Set(prev).add(target.questionId));
    setPaletteOpen(false);
  }

  function statusOf(questionId: string): Status {
    if (flagged.has(questionId)) return 'review';
    if (answers[questionId]) return 'answered';
    return visited.has(questionId) ? 'seen' : 'unseen';
  }

  const answeredCount = Object.values(answers).filter(Boolean).length;
  const urgent = msLeft <= 60_000;

  if (!current) {
    return <p className="text-ink-muted text-[13px]">This quiz has no questions yet.</p>;
  }

  const palette = (
    <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 lg:grid-cols-5">
      {paper.questions.map((question, i) => (
        <button
          key={question.questionId}
          onClick={() => go(i)}
          aria-label={`Question ${i + 1}, ${statusOf(question.questionId)}`}
          aria-current={i === index ? 'true' : undefined}
          className={cn(
            'min-h-11 rounded-lg border text-[13px] font-semibold transition',
            PALETTE[statusOf(question.questionId)],
            i === index && 'ring-primary ring-2 ring-offset-1'
          )}
        >
          {i + 1}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {/* Timer bar */}
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5',
            urgent ? 'border-error-border bg-error-bg' : 'border-line-medium bg-surface'
          )}
        >
          <div className="min-w-0">
            <p className="text-ink truncate text-[13.5px] font-semibold">{paper.quizTitle}</p>
            <p className="text-ink-muted text-[12px]">
              Question {index + 1} of {paper.questions.length} · {answeredCount} answered
            </p>
          </div>

          <p
            className={cn(
              'flex items-center gap-1.5 font-mono text-lg font-bold tabular-nums',
              urgent ? 'text-error' : 'text-ink'
            )}
            // Announced once a minute rather than every second, or a screen
            // reader would read the clock continuously and drown the questions.
            aria-live={urgent ? 'assertive' : 'off'}
          >
            <Clock className="size-4" aria-hidden />
            {formatClock(msLeft)}
          </p>
        </div>

        {paper.negativeMark > 0 && (
          <p className="border-warning-border bg-warning-bg text-warning flex items-start gap-2 rounded-xl border p-3 text-[12.5px]">
            <AlertTriangle className="mt-px size-4 shrink-0" aria-hidden />
            Negative marking is on: a wrong answer costs {paper.negativeMark} mark
            {paper.negativeMark === 1 ? '' : 's'}. Tap a chosen option again to clear it.
          </p>
        )}

        {/* Question */}
        <div className="border-line-medium bg-surface rounded-2xl border p-5">
          <p className="text-ink mb-4 text-[15px] leading-relaxed font-medium whitespace-pre-line">
            {current.body}
          </p>

          <fieldset className="flex flex-col gap-2.5">
            <legend className="sr-only">Choose one answer</legend>
            {current.options.map((option, i) => {
              const chosen = answers[current.questionId] === option.id;
              return (
                <button
                  key={option.id}
                  onClick={() => choose(current.questionId, option.id)}
                  aria-pressed={chosen}
                  className={cn(
                    'flex min-h-11 items-start gap-3 rounded-xl border p-3.5 text-left transition',
                    chosen
                      ? 'border-primary bg-primary-light'
                      : 'border-line-medium hover:border-line-dark hover:bg-hover'
                  )}
                >
                  <span
                    className={cn(
                      'grid size-6 shrink-0 place-items-center rounded-full border text-[12px] font-bold',
                      chosen ? 'border-primary bg-primary text-white' : 'border-line-dark text-ink-muted'
                    )}
                    aria-hidden
                  >
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="text-ink text-[14px] leading-relaxed">{option.body}</span>
                </button>
              );
            })}
          </fieldset>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={index === 0} onClick={() => go(index - 1)}>
            <ChevronLeft className="size-4" aria-hidden /> Previous
          </Button>

          <Button
            variant={flagged.has(current.questionId) ? 'subtle' : 'outline'}
            size="sm"
            onClick={() =>
              setFlagged((prev) => {
                const next = new Set(prev);
                if (next.has(current.questionId)) next.delete(current.questionId);
                else next.add(current.questionId);
                return next;
              })
            }
          >
            <Flag className="size-4" aria-hidden />
            {flagged.has(current.questionId) ? 'Unmark' : 'Mark for review'}
          </Button>

          <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setPaletteOpen(true)}>
            <LayoutGrid className="size-4" aria-hidden /> All questions
          </Button>

          {index < paper.questions.length - 1 ? (
            <Button size="sm" className="ml-auto" onClick={() => go(index + 1)}>
              Next <ChevronRight className="size-4" aria-hidden />
            </Button>
          ) : (
            <Button size="sm" className="ml-auto" onClick={() => setConfirming(true)}>
              <Check className="size-4" aria-hidden /> Submit
            </Button>
          )}
        </div>
      </div>

      {/* Palette — sidebar on desktop */}
      <aside className="border-line-medium bg-surface hidden w-[280px] shrink-0 flex-col gap-4 rounded-2xl border p-4 lg:flex">
        <h2 className="font-display text-ink text-sm font-bold">Questions</h2>
        {palette}
        <Button size="sm" block loading={submitting} onClick={() => setConfirming(true)}>
          <Check className="size-4" aria-hidden /> Submit quiz
        </Button>
      </aside>

      {/* Palette — sheet on mobile */}
      {paletteOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPaletteOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="All questions"
            className="bg-surface absolute inset-x-0 bottom-0 max-h-[70dvh] overflow-y-auto rounded-t-3xl p-5"
          >
            <h2 className="font-display text-ink mb-4 text-sm font-bold">Questions</h2>
            {palette}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => finish(false)}
        pending={submitting}
        tone="primary"
        title="Submit this quiz?"
        confirmLabel="Submit"
        description={
          <>
            You have answered <strong>{answeredCount}</strong> of {paper.questions.length} questions
            {answeredCount < paper.questions.length && (
              <> — {paper.questions.length - answeredCount} will be marked as skipped</>
            )}
            . You cannot change your answers after submitting.
          </>
        }
      />
    </div>
  );
}
