'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { callPendingRpc } from '@/lib/supabase/rpc';
import { createClient } from '@/lib/supabase/server';
import type { FormState } from './types';

/**
 * Manual enrolment — the most important write in the admin console at launch.
 *
 * Payments ship disabled, so this is the ONLY way a student gets into a course.
 * If it is broken, nothing else in the console matters.
 */

const grantSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter the student’s email address.'),
  slug: z.string().trim().min(1, 'Choose a course.'),
  // Mirrors the CHECK inside grant_course_access(). Validated here purely so the
  // message arrives before the round-trip — the database remains the authority.
  reason: z.string().trim().min(10, 'Say why, in at least ten characters.').max(300),
  days: z.union([z.coerce.number().int().min(1).max(3650), z.literal('lifetime')]),
});

const ERRORS: Record<string, string> = {
  ADMIN_ONLY: 'Only an admin can grant course access.',
  NO_SUCH_USER: 'No account with that email. The student must register first — you cannot pre-enrol them.',
  NO_SUCH_COURSE: 'That course no longer exists.',
  REASON_REQUIRED: 'Say why, in at least ten characters.',
};

export async function grantCourseAccess(_previous: FormState, formData: FormData): Promise<FormState> {
  const rawDays = formData.get('days');

  const parsed = grantSchema.safeParse({
    email: formData.get('email'),
    slug: formData.get('slug'),
    reason: formData.get('reason'),
    days: rawDays === 'lifetime' ? 'lifetime' : rawDays,
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

  const { error } = await callPendingRpc(supabase, 'grant_course_access', {
    p_email: parsed.data.email,
    p_slug: parsed.data.slug,
    p_reason: parsed.data.reason,
    p_days: parsed.data.days === 'lifetime' ? null : parsed.data.days,
  });

  if (error) {
    // The function raises named exceptions precisely so they can be translated
    // here rather than leaking a Postgres message into the UI.
    const code = Object.keys(ERRORS).find((key) => error.message.toUpperCase().includes(key));
    return { ok: false, message: code ? ERRORS[code] : 'We could not grant access. Please try again.' };
  }

  revalidatePath('/admin/enrollments');
  return { ok: true, message: `${parsed.data.email} now has access. They have been notified.` };
}

/**
 * Revoking sets status rather than deleting the row, so progress and attempt
 * history survive and access can be restored rather than recreated.
 */
export async function setEnrolmentStatus(enrolmentId: string, status: 'active' | 'suspended') {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('enrollments')
    .update({ status })
    .eq('id', enrolmentId)
    .select('id')
    .maybeSingle();

  if (error) return { ok: false as const, message: 'We could not update that enrolment.' };

  // RLS filters the row out rather than raising, so a refused write comes back
  // as success with zero rows. Reporting that as "done" would tell a support
  // agent they had revoked access when nothing changed.
  if (!data) {
    return { ok: false as const, message: 'Only an admin can change course access.' };
  }

  revalidatePath('/admin/enrollments');
  return { ok: true as const, message: status === 'active' ? 'Access restored.' : 'Access revoked.' };
}
