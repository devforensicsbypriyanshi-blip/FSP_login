import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { DEVICE_COOKIE } from './constants';
import type { Role } from '@/components/layout/nav-config';

/**
 * Server-side view of "who is asking?".
 *
 * Every portal layout calls this. It is the single place that decides which of
 * a user's roles drives the UI, so the answer is consistent across the shell,
 * the nav and the pages.
 */

export interface SessionContext {
  userId: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  examTarget: string | null;
  onboarded: boolean;
  roles: Role[];
  /** The portal this user lands in by default. */
  primaryRole: Role;
}

/**
 * Most-privileged first. A user holding both `educator` and `student` should
 * land in the studio, not the student dashboard.
 */
const ROLE_PRECEDENCE: readonly Role[] = ['admin', 'developer', 'educator', 'support', 'student'];

export function pickPrimaryRole(roles: readonly string[]): Role {
  return ROLE_PRECEDENCE.find((r) => roles.includes(r)) ?? 'student';
}

/** Extracts the caller's IP for the session audit trail. Null rather than a guess. */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for');
  const candidate = forwarded?.split(',')[0]?.trim() || headers.get('x-real-ip')?.trim();
  if (!candidate) return null;
  // Postgres `inet` rejects anything malformed and would fail the whole call,
  // so anything that isn't obviously an address is dropped instead.
  const looksLikeAddress = /^[0-9.]+$/.test(candidate) || /^[0-9a-fA-F:]+$/.test(candidate);
  return looksLikeAddress ? candidate : null;
}

export async function getDeviceId(): Promise<string | null> {
  const store = await cookies();
  return store.get(DEVICE_COOKIE)?.value ?? null;
}

/**
 * Returns null when nobody is signed in. Callers in protected layouts can
 * treat null as "middleware should have caught this" and redirect.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, email, avatar_url, exam_target, onboarded_at')
      .eq('id', user.id)
      .maybeSingle(),
    supabase.from('user_roles').select('roles(key)').eq('user_id', user.id),
  ]);

  const roles = (roleRows ?? [])
    .map((row) => (row.roles as { key: string } | null)?.key)
    .filter((key): key is Role => Boolean(key));

  // The profile row is created by the handle_new_user trigger, but a signed-in
  // user with no profile is possible if that trigger ever failed. Falling back
  // to auth data keeps them usable rather than showing a broken shell.
  return {
    userId: user.id,
    email: profile?.email ?? user.email ?? '',
    fullName: profile?.full_name ?? user.email?.split('@')[0] ?? 'Student',
    avatarUrl: profile?.avatar_url ?? null,
    examTarget: profile?.exam_target ?? null,
    onboarded: Boolean(profile?.onboarded_at),
    roles: roles.length ? roles : ['student'],
    primaryRole: pickPrimaryRole(roles),
  };
}

/** Unread notification count for the header bell. Cheap: a head-only count. */
export async function getUnreadCount(userId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);
  return count ?? 0;
}
