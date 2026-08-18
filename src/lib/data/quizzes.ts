import 'server-only';

import { callPendingRpc } from '@/lib/supabase/rpc';
import { createClient } from '@/lib/supabase/server';

/**
 * Quiz reads.
 *
 * The paper and the review both come from SECURITY DEFINER functions, never
 * from table selects: `quiz_options.is_correct` must not reach the browser
 * while an attempt is open, and a select would eventually leak it the first
 * time someone reached for `select('*')`.
 */

export interface QuizSummary {
  id: string;
  title: string;
  description: string | null;
  durationMin: number;
  totalMarks: number | null;
  negativeMark: number;
  maxAttempts: number;
  questionCount: number;
  opensAt: string | null;
  closesAt: string | null;
  courseTitle: string | null;
  /** This student's attempts, newest first. */
  attempts: { id: string; submittedAt: string | null; score: number | null; expiresAt: string }[];
}

export async function getQuizzes(userId: string): Promise<QuizSummary[]> {
  const supabase = await createClient();

  const { data: quizzes } = await supabase
    .from('quizzes')
    .select(
      'id, title, description, duration_min, total_marks, negative_mark, max_attempts, opens_at, closes_at, courses(title)'
    )
    .eq('status', 'published')
    .order('opens_at', { ascending: false, nullsFirst: false });

  if (!quizzes?.length) return [];

  const ids = quizzes.map((q) => q.id);

  const [{ data: questions }, { data: attempts }] = await Promise.all([
    supabase.from('quiz_questions').select('id, quiz_id').in('quiz_id', ids),
    supabase
      .from('quiz_attempts')
      .select('id, quiz_id, submitted_at, score, expires_at')
      .eq('user_id', userId)
      .in('quiz_id', ids)
      .order('started_at', { ascending: false }),
  ]);

  const counts = new Map<string, number>();
  for (const question of questions ?? []) {
    counts.set(question.quiz_id, (counts.get(question.quiz_id) ?? 0) + 1);
  }

  const byQuiz = new Map<string, QuizSummary['attempts']>();
  for (const attempt of attempts ?? []) {
    byQuiz.set(attempt.quiz_id, [
      ...(byQuiz.get(attempt.quiz_id) ?? []),
      {
        id: attempt.id,
        submittedAt: attempt.submitted_at,
        score: attempt.score,
        expiresAt: attempt.expires_at,
      },
    ]);
  }

  return quizzes.map((quiz) => ({
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    durationMin: quiz.duration_min,
    totalMarks: quiz.total_marks,
    negativeMark: quiz.negative_mark,
    maxAttempts: quiz.max_attempts,
    questionCount: counts.get(quiz.id) ?? 0,
    opensAt: quiz.opens_at,
    closesAt: quiz.closes_at,
    courseTitle: (quiz.courses as { title: string } | null)?.title ?? null,
    attempts: byQuiz.get(quiz.id) ?? [],
  }));
}

export interface PaperQuestion {
  questionId: string;
  body: string;
  marks: number;
  negative: number;
  position: number;
  options: { id: string; body: string }[];
  chosen: string | null;
}

export interface AttemptPaper {
  attemptId: string;
  quizTitle: string;
  expiresAt: string;
  negativeMark: number;
  questions: PaperQuestion[];
}

export async function getAttemptPaper(attemptId: string): Promise<AttemptPaper | null> {
  const supabase = await createClient();

  const { data: attempt } = await supabase
    .from('quiz_attempts')
    .select('id, expires_at, submitted_at, quizzes(title, negative_mark)')
    .eq('id', attemptId)
    .maybeSingle();

  if (!attempt) return null;

  const { data, error } = await callPendingRpc(supabase, 'get_quiz_paper', { p_attempt: attemptId });
  if (error) return null;

  const quiz = attempt.quizzes as { title: string; negative_mark: number } | null;

  return {
    attemptId,
    quizTitle: quiz?.title ?? 'Quiz',
    expiresAt: attempt.expires_at,
    negativeMark: quiz?.negative_mark ?? 0,
    questions: (data ?? []).map((row) => ({
      questionId: row.question_id,
      body: row.body,
      marks: Number(row.marks),
      negative: Number(row.negative),
      position: row.q_position,
      options: (row.options ?? []) as { id: string; body: string }[],
      chosen: row.chosen,
    })),
  };
}

export interface ReviewQuestion {
  questionId: string;
  body: string;
  explanation: string | null;
  marks: number;
  awarded: number | null;
  chosen: string | null;
  correct: string | null;
  options: { id: string; body: string; correct: boolean }[];
}

export interface AttemptReview {
  attemptId: string;
  quizTitle: string;
  score: number | null;
  correctCount: number | null;
  wrongCount: number | null;
  skippedCount: number | null;
  submittedAt: string | null;
  questions: ReviewQuestion[];
}

export async function getAttemptReview(attemptId: string): Promise<AttemptReview | null> {
  const supabase = await createClient();

  const { data: attempt } = await supabase
    .from('quiz_attempts')
    .select('id, score, correct_count, wrong_count, skipped_count, submitted_at, quizzes(title)')
    .eq('id', attemptId)
    .maybeSingle();

  if (!attempt || !attempt.submitted_at) return null;

  const { data, error } = await callPendingRpc(supabase, 'get_quiz_review', { p_attempt: attemptId });
  if (error) return null;

  return {
    attemptId,
    quizTitle: (attempt.quizzes as { title: string } | null)?.title ?? 'Quiz',
    score: attempt.score,
    correctCount: attempt.correct_count,
    wrongCount: attempt.wrong_count,
    skippedCount: attempt.skipped_count,
    submittedAt: attempt.submitted_at,
    questions: (data ?? []).map((row) => ({
      questionId: row.question_id,
      body: row.body,
      explanation: row.explanation,
      marks: Number(row.marks),
      awarded: row.awarded === null ? null : Number(row.awarded),
      chosen: row.chosen,
      correct: row.correct,
      options: (row.options ?? []) as { id: string; body: string; correct: boolean }[],
    })),
  };
}
