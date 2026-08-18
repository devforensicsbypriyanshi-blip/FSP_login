import { ClipboardList, Clock, FileQuestion } from 'lucide-react';
import Link from 'next/link';
import { QuizCreateForm } from '@/components/studio/quiz-create-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { getAuthorCourses, getStudioQuizzes } from '@/lib/data/studio';

export const metadata = { title: 'Quiz Builder' };

const STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'gray' }> = {
  draft: { label: 'Draft', variant: 'warning' },
  published: { label: 'Published', variant: 'success' },
  archived: { label: 'Archived', variant: 'gray' },
};

export default async function StudioQuizzesPage() {
  const [quizzes, courses] = await Promise.all([getStudioQuizzes(), getAuthorCourses()]);

  return (
    <>
      <PageHeader
        title="Tests"
        description="Build MCQ papers with negative marking. Publish when they are complete."
      />

      <Card>
        <CardHeader>
          <CardTitle>Your tests</CardTitle>
          <ClipboardList className="text-primary size-[18px]" aria-hidden />
        </CardHeader>

        <div className="flex flex-col gap-4">
          <QuizCreateForm courses={courses} />

          {quizzes.length === 0 ? (
            <EmptyState
              icon={FileQuestion}
              title="No tests yet"
              description="Create one as a draft, add questions, then publish it to your enrolled students."
            />
          ) : (
            <ul className="divide-line flex flex-col divide-y">
              {quizzes.map((quiz) => {
                const status = STATUS[quiz.status] ?? { label: quiz.status, variant: 'gray' as const };

                return (
                  <li
                    key={quiz.id}
                    className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-ink font-semibold">{quiz.title}</p>
                      <p className="text-ink-muted mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px]">
                        <span>{quiz.courseTitle ?? 'No course'}</span>
                        <span aria-hidden>·</span>
                        <span>
                          {quiz.questionCount} question{quiz.questionCount === 1 ? '' : 's'}
                        </span>
                        <span aria-hidden>·</span>
                        <span className="flex items-center gap-1">
                          <Clock className="size-3.5" aria-hidden /> {quiz.durationMin} min
                        </span>
                        {quiz.negativeMark > 0 && (
                          <>
                            <span aria-hidden>·</span>
                            <span>−{quiz.negativeMark} per wrong</span>
                          </>
                        )}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={status.variant}>{status.label}</Badge>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/studio/quizzes/${quiz.id}`}>
                          {quiz.status === 'published' ? 'View' : 'Edit'}
                        </Link>
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>

      <p className="text-ink-muted text-center text-xs">
        Correct answers never reach the browser during an attempt — students cannot select quiz_options at
        all, and scoring runs server-side against the attempt deadline.
      </p>
    </>
  );
}
