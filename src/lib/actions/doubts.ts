'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { callPendingRpc } from '@/lib/supabase/rpc';
import { createClient } from '@/lib/supabase/server';
import type { FormState } from './types';

/**
 * Doubts forum writes.
 *
 * Asking is a plain insert — `doubts: post own` already requires
 * `user_id = auth.uid() and is_enrolled(course_id)`, which is the whole rule.
 * Answering goes through answer_doubt(), because the educator-verified badge
 * must be granted by role rather than claimed by the poster (see 0018).
 */

const askSchema = z.object({
  courseId: z.string().uuid('Choose which course this is about.'),
  title: z.string().trim().max(160).optional(),
  // Matches the CHECK on doubts.body, so the message arrives before the trip.
  body: z.string().trim().min(10, 'Give a bit more detail — at least ten characters.').max(5000),
  anonymous: z.boolean().optional(),
});

export async function askDoubt(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = askSchema.safeParse({
    courseId: formData.get('courseId'),
    title: formData.get('title') || undefined,
    body: formData.get('body'),
    anonymous: formData.get('anonymous') === 'on',
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'You need to sign in again.' };

  const { error } = await supabase.from('doubts').insert({
    user_id: user.id,
    course_id: parsed.data.courseId,
    title: parsed.data.title ?? null,
    body: parsed.data.body,
    is_anonymous: parsed.data.anonymous ?? false,
  });

  if (error) {
    // The insert policy also requires enrolment, and RLS refuses rather than
    // explains — so say the likely reason instead of a generic failure.
    return {
      ok: false,
      message: 'We could not post that. You can only ask about courses you are enrolled in.',
    };
  }

  revalidatePath('/app/doubts');
  return { ok: true, message: 'Posted. You will be notified when an educator answers.' };
}

export async function answerDoubt(doubtId: string, body: string) {
  const supabase = await createClient();
  const { error } = await callPendingRpc(supabase, 'answer_doubt', {
    p_doubt: doubtId,
    p_body: body,
  });

  if (error) {
    const upper = error.message.toUpperCase();
    const message = upper.includes('EMPTY_ANSWER')
      ? 'Write something first.'
      : upper.includes('NOT_ENROLLED')
        ? 'You can only answer doubts in courses you are part of.'
        : 'We could not post that answer.';
    return { ok: false as const, message };
  }

  revalidatePath('/app/doubts');
  revalidatePath('/studio/doubts');
  return { ok: true as const, message: 'Answer posted.' };
}
