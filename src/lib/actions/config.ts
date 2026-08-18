'use server';

import { revalidatePath } from 'next/cache';
import { invalidateConfigCache } from '@/lib/config/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Runtime config writes from /dev/config.
 *
 * Authorisation is entirely RLS. The `flags: write by role` policy encodes the
 * rule that matters — kill switches and protected flags require admin, ordinary
 * flags allow developer — and re-stating it here would create a second copy to
 * drift out of sync with the first.
 *
 * Every write drops the read cache. Without that a toggle appears to do nothing
 * for up to 30 seconds, which is exactly long enough for someone to toggle it
 * again and end up back where they started.
 */

export async function toggleFlag(key: string, enabled: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, message: 'You need to sign in again.' };

  const { data, error } = await supabase
    .from('feature_flags')
    .update({ enabled, updated_by: user.id })
    .eq('key', key)
    .select('key')
    .maybeSingle();

  if (error) return { ok: false as const, message: 'Could not update that flag.' };

  // RLS filters the row out rather than raising, so a blocked write succeeds
  // with zero rows. Treating that as success would silently lie to the operator.
  if (!data) {
    return {
      ok: false as const,
      message: 'That flag is admin-only. Ask an admin to change it.',
    };
  }

  invalidateConfigCache();
  revalidatePath('/dev/config');
  return { ok: true as const, message: `${key} is now ${enabled ? 'on' : 'off'}.` };
}

export async function updateSetting(key: string, value: unknown) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, message: 'You need to sign in again.' };

  const { data, error } = await supabase
    .from('app_settings')
    .update({ value: value as never, updated_by: user.id })
    .eq('key', key)
    .select('key')
    .maybeSingle();

  if (error) return { ok: false as const, message: 'Could not update that setting.' };
  if (!data) return { ok: false as const, message: 'That setting is admin-only.' };

  invalidateConfigCache();
  revalidatePath('/dev/config');
  return { ok: true as const, message: `${key} updated.` };
}
