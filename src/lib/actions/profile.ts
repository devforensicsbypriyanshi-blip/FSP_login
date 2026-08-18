'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { FormState } from './types';

/**
 * Profile and device writes.
 *
 * Note what is NOT editable here: email. It is the login credential — changing
 * it is an auth flow needing verification on both addresses, not a text field.
 * Silently accepting a new email would let a typo lock someone out of their own
 * account for good, since there is no password to fall back on.
 */

const profileSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name.').max(80),
  examTarget: z.string().max(40).optional(),
  bio: z.string().trim().max(280).optional(),
});

export async function updateProfile(_previous: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'You need to sign in again.' };

  const parsed = profileSchema.safeParse({
    fullName: formData.get('fullName'),
    examTarget: formData.get('examTarget') || undefined,
    bio: formData.get('bio') || undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: parsed.data.fullName,
      exam_target: parsed.data.examTarget ?? null,
      bio: parsed.data.bio ?? null,
    })
    .eq('id', user.id);

  if (error) return { ok: false, message: 'We could not save that. Please try again.' };

  revalidatePath('/account');
  return { ok: true, message: 'Saved.' };
}

/** Marks onboarding finished. Separate from updateProfile so skipping still counts. */
export async function completeOnboarding(fullName?: string, examTarget?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const };

  const patch: { onboarded_at: string; full_name?: string; exam_target?: string } = {
    onboarded_at: new Date().toISOString(),
  };
  if (fullName && fullName.trim().length >= 2) patch.full_name = fullName.trim();
  if (examTarget) patch.exam_target = examTarget;

  const { error } = await supabase.from('profiles').update(patch).eq('id', user.id);
  return { ok: !error };
}

/**
 * Signs out every device except this one.
 *
 * Only reachable from Settings, where the current device is already known from
 * the httpOnly cookie — the caller does not get to name which device to keep.
 */
export async function revokeOtherDevices(keepDeviceId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('revoke_other_sessions', { p_keep_device: keepDeviceId });

  if (error) return { ok: false as const, count: 0 };

  revalidatePath('/account/settings');
  return { ok: true as const, count: data ?? 0 };
}

/** Per-type notification preferences. Upserted so a first change creates the row. */
export async function updateNotificationPref(
  type: string,
  channel: 'in_app' | 'push' | 'email',
  enabled: boolean
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const };

  // Built in two steps rather than with a computed key in the literal: a
  // computed key widens the object to an index signature, which the generated
  // row type rejects.
  const row: { user_id: string; type: string; in_app?: boolean; push?: boolean; email?: boolean } = {
    user_id: user.id,
    type,
  };
  row[channel] = enabled;

  const { error } = await supabase.from('notification_prefs').upsert(row, { onConflict: 'user_id,type' });

  if (error) return { ok: false as const };

  revalidatePath('/account/settings');
  return { ok: true as const };
}
