'use server';

import { revalidatePath } from 'next/cache';
import { callPendingRpc } from '@/lib/supabase/rpc';
import { createClient } from '@/lib/supabase/server';

/**
 * Quiz lifecycle.
 *
 * Thin by design — every rule that matters lives in the database functions,
 * because a rule enforced here is a rule enforced in one caller. Server Actions
 * are public HTTP endpoints; treating them as the gate would mean re-deriving
 * enrolment, attempt limits and the expiry clock at each call site.
 */

const MESSAGES: Record<string, string> = {
  NOT_ENROLLED: 'You are not enrolled in the course this quiz belongs to.',
  QUIZ_NOT_PUBLISHED: 'This quiz is not available yet.',
  QUIZ_NOT_OPEN: 'This quiz has not opened yet.',
  QUIZ_CLOSED: 'This quiz has closed.',
  NO_ATTEMPTS_LEFT: 'You have used all your attempts for this quiz.',
  ALREADY_SUBMITTED: 'This attempt has already been submitted.',
  TIME_EXPIRED: 'Time is up — your answers up to now have been kept.',
  NOT_YOUR_ATTEMPT: 'That attempt does not belong to you.',
  ATTEMPT_NOT_FOUND: 'That attempt no longer exists.',
  QUESTION_NOT_IN_QUIZ: 'That question is not part of this quiz.',
  OPTION_NOT_IN_QUESTION: 'That option does not belong to this question.',
};

function translate(raw: string): string {
  const code = Object.keys(MESSAGES).find((key) => raw.toUpperCase().includes(key));
  return code ? MESSAGES[code]! : 'Something went wrong. Please try again.';
}

export async function startAttempt(quizId: string) {
  const supabase = await createClient();
  const { data, error } = await callPendingRpc(supabase, 'start_quiz_attempt', { p_quiz: quizId });

  if (error) return { ok: false as const, message: translate(error.message) };
  if (!data) return { ok: false as const, message: 'We could not start that quiz.' };

  return { ok: true as const, attemptId: data };
}

/**
 * Autosave. Deliberately quiet: a save that fails must not interrupt someone
 * mid-question, and the next answer re-saves anyway. The one failure worth
 * surfacing is expiry, which the runner shows through the timer regardless.
 */
export async function saveResponse(attemptId: string, questionId: string, optionId: string | null) {
  const supabase = await createClient();
  const { error } = await callPendingRpc(supabase, 'save_quiz_response', {
    p_attempt: attemptId,
    p_question: questionId,
    p_option: optionId,
  });

  if (error) return { ok: false as const, message: translate(error.message) };
  return { ok: true as const };
}

export async function submitAttempt(attemptId: string) {
  const supabase = await createClient();
  const { data, error } = await callPendingRpc(supabase, 'submit_quiz_attempt', { p_attempt: attemptId });

  if (error) return { ok: false as const, message: translate(error.message) };

  revalidatePath('/app/tests');
  revalidatePath(`/app/tests/attempt/${attemptId}`);

  const result = Array.isArray(data) ? data[0] : null;
  return { ok: true as const, result: result ?? null };
}
