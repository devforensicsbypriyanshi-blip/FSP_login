import { BarChart2, Clock, FileCheck, ListChecks } from 'lucide-react';
import Link from 'next/link';
import { StartQuizButton } from '@/components/quiz/start-quiz-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { getQuizzes } from '@/lib/data/quizzes';
import { formatDate, formatWhen } from '@/lib/format';
import { getSessionContext } from '@/lib/session/server';

export const metadata = { title: 'Tests & Quizzes' };

export default async function TestsPage() {
  const session = await getSessionContext();
  const quizzes = session ? await getQuizzes(session.userId) : [];
  const now = Date.now();

  return (
    <>
      <PageHeader
        title="Tests & quizzes"
        description="Timed practice. Your answers save as you go, so a dropped connection costs nothing."
      />

      {quizzes.length === 0 ? (
        <EmptyState
          icon={FileCheck}
          title="No quizzes available"
          description="Quizzes appear here once your educator publishes them to a course you're enrolled in."
        />
      ) : (
        quizzes.map((quiz) => {
          const open = quiz.attempts.find((a) => !a.submittedAt && new Date(a.expiresAt).getTime() > now);
          const finished = quiz.attempts.filter((a) => a.submittedAt);
          const best = finished.reduce<number | null>(
            (top, a) => (a.score !== null && (top === null || a.score > top) ? a.score : top),
            null
          );
          const exhausted = quiz.attempts.length >= quiz.maxAttempts && !open;
          const closed = quiz.closesAt !== null && new Date(quiz.closesAt).getTime() < now;

          return (
            <Card key={quiz.id}>
              <CardHeader>
                <CardTitle>{quiz.title}</CardTitle>
                <div className="flex flex-wrap gap-1.5">
                  {open && <Badge variant="warning">In progress</Badge>}
                  {closed && <Badge variant="gray">Closed</Badge>}
                  {best !== null && <Badge variant="success">Best {best}</Badge>}
                </div>
              </CardHeader>

              {quiz.description && (
                <p className="text-ink-secondary mb-3 text-[13.5px] leading-relaxed">{quiz.description}</p>
              )}

              <p className="text-ink-muted mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
                <span className="flex items-center gap-1">
                  <ListChecks className="size-3.5" aria-hidden /> {quiz.questionCount} questions
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="size-3.5" aria-hidden /> {quiz.durationMin} min
                </span>
                {quiz.negativeMark > 0 && (
                  <span className="text-warning">−{quiz.negativeMark} per wrong answer</span>
                )}
                <span>
                  {quiz.attempts.length} of {quiz.maxAttempts} attempts used
                </span>
                {quiz.closesAt && <span>Closes {formatDate(quiz.closesAt)}</span>}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                {closed ? (
                  <p className="text-ink-muted text-[13px]">This quiz is no longer accepting attempts.</p>
                ) : exhausted ? (
                  <p className="text-ink-muted text-[13px]">You have used all your attempts.</p>
                ) : (
                  <StartQuizButton quizId={quiz.id} resume={Boolean(open)} />
                )}

                {finished.length > 0 && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/app/tests/attempt/${finished[0]!.id}`}>
                      <BarChart2 className="size-4" aria-hidden /> Review last attempt
                    </Link>
                  </Button>
                )}
              </div>

              {finished.length > 0 && (
                <ul className="border-line divide-line mt-4 divide-y border-t pt-3">
                  {finished.slice(0, 3).map((attempt) => (
                    <li
                      key={attempt.id}
                      className="text-ink-muted flex items-center justify-between gap-3 py-2 text-[12.5px]"
                    >
                      <span>Submitted {formatWhen(attempt.submittedAt!)}</span>
                      <span className="text-ink font-semibold">
                        {attempt.score ?? 0}
                        {quiz.totalMarks ? ` / ${quiz.totalMarks}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })
      )}
    </>
  );
}
