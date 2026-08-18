'use server';

import { revalidatePath } from 'next/cache';
import { callPendingRpc } from '@/lib/supabase/rpc';
import { createClient } from '@/lib/supabase/server';

/**
 * "Mark all read" goes through a SECURITY DEFINER function rather than a client
 * UPDATE. The RLS policy would allow the same write, but an unbounded UPDATE
 * over every row a user can see is a wide door to leave open for one button —
 * the function can only ever touch that user's unread rows.
 */
export async function markAllNotificationsRead() {
  const supabase = await createClient();
  const { data, error } = await callPendingRpc(supabase, 'mark_all_notifications_read', {});

  if (error) return { ok: false as const, count: 0 };

  revalidatePath('/app/notifications');
  revalidatePath('/app');
  return { ok: true as const, count: data ?? 0 };
}

/**
 * Form-action variant. `<form action={…}>` requires a void return — React
 * serialises the result and a plain object would be a type error at the call
 * site, so the count is swallowed here rather than at every form.
 */
export async function markAllNotificationsReadAction(): Promise<void> {
  await markAllNotificationsRead();
}

export async function markNotificationRead(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const };

  // The user_id filter is redundant under RLS and kept deliberately: if a policy
  // is ever loosened, this statement still cannot touch someone else's row.
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .is('read_at', null);

  if (error) return { ok: false as const };

  revalidatePath('/app/notifications');
  return { ok: true as const };
}
