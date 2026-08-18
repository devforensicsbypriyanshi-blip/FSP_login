import { ArrowLeft, Clock } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { QuizBuilder, QuizStatusControl } from '@/components/studio/quiz-builder';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { getQuizEditor, getStudioQuizzes } from '@/lib/data/studio';

export const metadata = { title: 'Edit test' };

const STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'gray' }> = {
  draft: { label: 'Draft', variant: 'warning' },
  published: { label: 'Published', variant: 'success' },
  archived: { label: 'Archived', variant: 'gray' },
};

/**
 * The question editor.
 *
 * Published tests are read-only here. Editing a paper students are already
 * sitting would change their marks under them — and the attempts already
 * scored against the old questions would silently stop matching the review
 * they are shown afterwards.
 */
export default async function QuizEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // RLS on `quizzes` already limits this list to the caller's own (or all, for
  // staff), so a quiz not in it is one they may not open.
  const quizzes = await getStudioQuizzes();
  const quiz = quizzes.find((row) => row.id === id);
  if (!quiz) notFound();

  const questions = await getQuizEditor(id);
  const status = STATUS[quiz.status] ?? { label: quiz.status, variant: 'gray' as const };

  return (
    <>
      <PageHeader
        title={quiz.title}
        description={`${quiz.courseTitle ?? 'No course'} · ${quiz.durationMin} min · ${
          quiz.negativeMark > 0 ? `−${quiz.negativeMark} per wrong answer` : 'no negative marking'
        }`}
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/studio/quizzes">
            <ArrowLeft className="size-4" aria-hidden /> All tests
          </Link>
        </Button>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>
            Questions
            <span className="text-ink-muted ml-2 text-[13px] font-normal">
              {questions.length} · {quiz.totalMarks ?? 0} marks total
            </span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={status.variant}>{status.label}</Badge>
            <QuizStatusControl quizId={quiz.id} status={quiz.status} questionCount={questions.length} />
          </div>
        </CardHeader>

        <QuizBuilder
          quizId={quiz.id}
          questions={questions}
          defaultNegative={quiz.negativeMark}
          readOnly={quiz.status === 'published'}
        />
      </Card>

      <p className="text-ink-muted flex items-center justify-center gap-1.5 text-center text-xs">
        <Clock className="size-3.5" aria-hidden />
        Publishing notifies every actively enrolled student on {quiz.courseTitle ?? 'the course'}.
      </p>
    </>
  );
}
