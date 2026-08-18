import { ArrowLeft, CheckCircle2, MinusCircle, XCircle } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { QuizRunner } from '@/components/quiz/quiz-runner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { KpiCard } from '@/components/ui/data-table';
import { getAttemptPaper, getAttemptReview } from '@/lib/data/quizzes';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Quiz' };

/**
 * One route, two states.
 *
 * An unsubmitted attempt renders the runner; a submitted one renders the
 * review. Keeping them on the same URL means the redirect after submitting is
 * to the page you were already on, and a student who bookmarks their attempt
 * always lands somewhere sensible.
 *
 * The review is fetched from get_quiz_review(), which refuses to return
 * anything until the attempt is submitted — so this page cannot leak an answer
 * key by being requested early.
 */
export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const review = await getAttemptReview(id);

  if (review) {
    const total = review.questions.reduce((n, q) => n + q.marks, 0);

    return (
      <>
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
            <Link href="/app/tests">
              <ArrowLeft className="size-4" aria-hidden /> All quizzes
            </Link>
          </Button>
          <h1 className="font-display text-ink text-xl font-bold text-balance md:text-2xl">
            {review.quizTitle}
          </h1>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="Score"
            value={`${review.score ?? 0}${total ? ` / ${total}` : ''}`}
            trend="Marks awarded"
            icon={<CheckCircle2 className="size-5" aria-hidden />}
            tone="bg-primary-light text-primary"
          />
          <KpiCard
            label="Correct"
            value={String(review.correctCount ?? 0)}
            trend="Right answers"
            icon={<CheckCircle2 className="size-5" aria-hidden />}
            tone="bg-success-bg text-success"
          />
          <KpiCard
            label="Wrong"
            value={String(review.wrongCount ?? 0)}
            trend="Cost you marks"
            icon={<XCircle className="size-5" aria-hidden />}
            tone="bg-error-bg text-error"
          />
          <KpiCard
            label="Skipped"
            value={String(review.skippedCount ?? 0)}
            trend="Left blank"
            icon={<MinusCircle className="size-5" aria-hidden />}
            tone="bg-hover text-ink-secondary"
          />
        </div>

        {review.questions.map((question, i) => {
          const wasRight = question.chosen !== null && question.chosen === question.correct;
          const skipped = question.chosen === null;

          return (
            <Card key={question.questionId}>
              <CardHeader>
                <CardTitle>Question {i + 1}</CardTitle>
                <Badge variant={skipped ? 'gray' : wasRight ? 'success' : 'error'}>
                  {skipped ? 'Skipped' : wasRight ? `+${question.awarded ?? 0}` : `${question.awarded ?? 0}`}
                </Badge>
              </CardHeader>

              <p className="text-ink mb-4 text-[14px] leading-relaxed whitespace-pre-line">{question.body}</p>

              <ul className="flex flex-col gap-2">
                {question.options.map((option) => {
                  const chosen = option.id === question.chosen;
                  return (
                    <li
                      key={option.id}
                      className={cn(
                        'flex items-start gap-2.5 rounded-xl border p-3 text-[13.5px] leading-relaxed',
                        option.correct
                          ? 'border-success-border bg-success-bg'
                          : chosen
                            ? 'border-error-border bg-error-bg'
                            : 'border-line-medium'
                      )}
                    >
                      {option.correct ? (
                        <CheckCircle2 className="text-success mt-px size-4 shrink-0" aria-hidden />
                      ) : chosen ? (
                        <XCircle className="text-error mt-px size-4 shrink-0" aria-hidden />
                      ) : (
                        <span className="mt-px size-4 shrink-0" aria-hidden />
                      )}
                      <span className="text-ink">{option.body}</span>
                      {chosen && (
                        <span className="text-ink-muted ml-auto shrink-0 text-[11.5px]">Your answer</span>
                      )}
                    </li>
                  );
                })}
              </ul>

              {question.explanation && (
                <div className="border-info-border bg-info-bg mt-3 rounded-xl border p-3.5">
                  <p className="text-info mb-1 text-[11px] font-semibold tracking-wide uppercase">
                    Explanation
                  </p>
                  <p className="text-ink-secondary text-[13px] leading-relaxed whitespace-pre-line">
                    {question.explanation}
                  </p>
                </div>
              )}
            </Card>
          );
        })}
      </>
    );
  }

  // Not submitted — run it.
  const paper = await getAttemptPaper(id);
  if (!paper) notFound();

  return <QuizRunner paper={paper} />;
}
