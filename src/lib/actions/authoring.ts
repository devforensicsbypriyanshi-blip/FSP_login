'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { callPendingRpc } from '@/lib/supabase/rpc';
import { createClient } from '@/lib/supabase/server';
import type { FormState } from './types';

/**
 * Doubts desk, quiz builder and broadcasts.
 *
 * Nothing here checks "am I allowed?" in TypeScript. Every call lands in a
 * SECURITY DEFINER function that re-checks ownership, because quiz_questions and
 * quiz_options have a SELECT policy and no write policy at all — RLS denies the
 * insert outright, and the function is the only door. Repeating the check here
 * would create a second place to get it wrong and imply the first is optional.
 */

// -----------------------------------------------------------------------------
// Doubts desk
// -----------------------------------------------------------------------------

/**
 * Marks a question finished.
 *
 * answer_doubt() already moves 'open' → 'answered' when an educator replies.
 * This is the separate judgement that it is *done* — a doubt can be answered
 * and still be under discussion.
 */
export async function setDoubtStatus(doubtId: string, status: string) {
  const supabase = await createClient();
  const { error } = await callPendingRpc(supabase, 'set_doubt_status', {
    p_doubt: doubtId,
    p_status: status,
  });

  if (error) {
    const upper = error.message.toUpperCase();
    return {
      ok: false as const,
      message: upper.includes('NOT_PERMITTED')
        ? 'You can only manage doubts on your own courses.'
        : 'We could not update that doubt.',
    };
  }

  revalidatePath('/studio/doubts');
  revalidatePath('/app/doubts');
  return { ok: true as const, message: 'Updated.' };
}

// -----------------------------------------------------------------------------
// Quiz builder
// -----------------------------------------------------------------------------

const quizSchema = z.object({
  quizId: z.string().uuid().nullable(),
  courseId: z.string().uuid('Choose which course this test belongs to.'),
  title: z.string().trim().min(3, 'Give the test a title.').max(160),
  description: z.string().trim().max(500).optional(),
  durationMin: z.coerce.number().int().min(1, 'At least one minute.').max(600),
  negativeMark: z.coerce.number().min(0).max(10),
  maxAttempts: z.coerce.number().int().min(1).max(10),
  shuffle: z.boolean().optional(),
});

function collectFieldErrors(issues: z.ZodIssue[]): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function saveQuiz(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = quizSchema.safeParse({
    quizId: (formData.get('quizId') as string) || null,
    courseId: formData.get('courseId'),
    title: formData.get('title'),
    description: formData.get('description') || undefined,
    durationMin: formData.get('durationMin'),
    negativeMark: formData.get('negativeMark'),
    maxAttempts: formData.get('maxAttempts'),
    shuffle: formData.get('shuffle') === 'on',
  });

  if (!parsed.success) return { ok: false, fieldErrors: collectFieldErrors(parsed.error.issues) };

  const supabase = await createClient();
  const { error } = await callPendingRpc(supabase, 'upsert_quiz', {
    p_quiz: parsed.data.quizId,
    p_course: parsed.data.courseId,
    p_title: parsed.data.title,
    p_description: parsed.data.description ?? null,
    p_duration_min: parsed.data.durationMin,
    p_negative_mark: parsed.data.negativeMark,
    p_shuffle: parsed.data.shuffle ?? true,
    p_max_attempts: parsed.data.maxAttempts,
  });

  if (error) {
    const upper = error.message.toUpperCase();
    return {
      ok: false,
      message: upper.includes('NOT_YOUR_COURSE')
        ? 'You can only build tests for your own courses.'
        : upper.includes('NOT_PERMITTED')
          ? 'Only educators can build tests.'
          : 'We could not save that test.',
    };
  }

  revalidatePath('/studio/quizzes');
  return { ok: true, message: 'Saved.' };
}

/**
 * Saves a question and replaces its options in one call.
 *
 * The database refuses anything but exactly one correct answer. That check is
 * not repeated here: zero correct makes a question unscoreable and two makes it
 * unfair, and neither is noticed until results are published — so it belongs
 * where it cannot be bypassed.
 */
export async function saveQuestion(input: {
  quizId: string;
  questionId: string | null;
  body: string;
  explanation: string;
  marks: number;
  negative: number;
  options: { body: string; is_correct: boolean }[];
}) {
  const supabase = await createClient();

  const cleaned = input.options
    .map((option) => ({ body: option.body.trim(), is_correct: option.is_correct }))
    .filter((option) => option.body.length > 0);

  const { error } = await callPendingRpc(supabase, 'upsert_question', {
    p_quiz: input.quizId,
    p_question: input.questionId,
    p_body: input.body,
    p_options: cleaned,
    p_explanation: input.explanation || null,
    p_marks: input.marks,
    p_negative: input.negative,
  });

  if (error) {
    const upper = error.message.toUpperCase();
    const message = upper.includes('NEED_ONE_CORRECT')
      ? 'Mark exactly one option as the correct answer.'
      : upper.includes('NEED_TWO_OPTIONS')
        ? 'A question needs at least two options.'
        : upper.includes('EMPTY_QUESTION')
          ? 'Write the question first.'
          : upper.includes('NOT_YOUR_QUIZ')
            ? 'That test belongs to someone else.'
            : 'We could not save that question.';
    return { ok: false as const, message };
  }

  revalidatePath('/studio/quizzes');
  return { ok: true as const, message: 'Question saved.' };
}

export async function deleteQuestion(questionId: string) {
  const supabase = await createClient();
  const { error } = await callPendingRpc(supabase, 'delete_question', { p_question: questionId });

  if (error) return { ok: false as const, message: 'We could not delete that question.' };

  revalidatePath('/studio/quizzes');
  return { ok: true as const, message: 'Question deleted.' };
}

export async function setQuizStatus(quizId: string, status: string) {
  const supabase = await createClient();
  const { error } = await callPendingRpc(supabase, 'set_quiz_status', {
    p_quiz: quizId,
    p_status: status,
  });

  if (error) {
    const upper = error.message.toUpperCase();
    // INVALID_QUESTIONS carries the count, which is the whole value of the
    // message: "3 questions are incomplete" tells the educator how much work is
    // left, where "publish failed" tells them nothing.
    const broken = /INVALID_QUESTIONS:(\d+)/.exec(error.message)?.[1];
    const message = broken
      ? `${broken} question${broken === '1' ? '' : 's'} need exactly one correct answer and at least two options.`
      : upper.includes('NO_QUESTIONS')
        ? 'Add at least one question before publishing.'
        : upper.includes('NOT_YOUR_QUIZ')
          ? 'That test belongs to someone else.'
          : 'We could not change the status.';
    return { ok: false as const, message };
  }

  revalidatePath('/studio/quizzes');
  revalidatePath('/app/tests');

  const message =
    status === 'published'
      ? 'Published. Enrolled students have been notified.'
      : status === 'archived'
        ? 'Archived. Students can no longer start it.'
        : 'Moved back to draft.';

  return { ok: true as const, message };
}

// -----------------------------------------------------------------------------
// Broadcasts
// -----------------------------------------------------------------------------

const broadcastSchema = z.object({
  courseId: z.string().uuid('Choose an audience.'),
  title: z.string().trim().min(3, 'Give the announcement a title.').max(160),
  body: z.string().trim().max(2000).optional(),
});

/**
 * Sends an announcement to everyone actively enrolled on a course.
 *
 * There is no undo. Once send_broadcast() returns, the rows are in the queue and
 * the worker may already have delivered them — so the UI confirms before calling
 * this rather than offering a recall that could not work.
 */
export async function sendBroadcast(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = broadcastSchema.safeParse({
    courseId: formData.get('courseId'),
    title: formData.get('title'),
    body: formData.get('body') || undefined,
  });

  if (!parsed.success) return { ok: false, fieldErrors: collectFieldErrors(parsed.error.issues) };

  const supabase = await createClient();
  const { data, error } = await callPendingRpc(supabase, 'send_broadcast', {
    p_course: parsed.data.courseId,
    p_title: parsed.data.title,
    p_body: parsed.data.body ?? null,
  });

  if (error) {
    const upper = error.message.toUpperCase();
    return {
      ok: false,
      message: upper.includes('NOT_PERMITTED')
        ? 'You can only send announcements to your own courses.'
        : 'We could not send that announcement.',
    };
  }

  revalidatePath('/studio/broadcasts');

  const count = Number(data ?? 0);
  return {
    ok: true,
    message:
      count === 0
        ? 'Nobody is actively enrolled on that course yet, so nothing was sent.'
        : `Queued for ${count} student${count === 1 ? '' : 's'}.`,
  };
}
