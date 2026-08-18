import 'server-only';

import { callPendingRpc } from '@/lib/supabase/rpc';
import { createClient } from '@/lib/supabase/server';

/**
 * Admin and developer console reads.
 *
 * Every function here calls a SECURITY DEFINER function that checks the role
 * itself. None of them filter by role in TypeScript — a screen that renders
 * empty because the query returned nothing is a bug report; a screen that
 * renders because the check was skipped is a breach.
 */

export interface ConsoleUser {
  id: string;
  fullName: string;
  email: string;
  roles: string[];
  enrollments: number;
  createdAt: string;
  lastSeenAt: string | null;
}

export async function getConsoleUsers(query?: string): Promise<ConsoleUser[]> {
  const supabase = await createClient();
  const { data, error } = await callPendingRpc(supabase, 'admin_list_users', {
    p_query: query?.trim() || null,
    p_limit: 200,
  });

  if (error) return [];

  return (data ?? []).map((row) => ({
    id: row.user_id,
    fullName: row.full_name,
    email: row.email,
    roles: row.roles ?? [],
    enrollments: row.enrollments,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  }));
}

export interface AuditEntry {
  id: string;
  actorName: string;
  actorEmail: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export async function getAuditLog(action?: string): Promise<AuditEntry[]> {
  const supabase = await createClient();
  const { data, error } = await callPendingRpc(supabase, 'get_audit_logs', {
    p_action: action?.trim() || null,
    p_limit: 200,
  });

  if (error) return [];

  return (data ?? []).map((row) => ({
    id: String(row.id),
    actorName: row.actor_name,
    actorEmail: row.actor_email,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    before: row.before,
    after: row.after,
    ip: row.ip,
    createdAt: row.created_at,
  }));
}

export interface Coupon {
  id: string;
  code: string;
  kind: string;
  value: number;
  maxDiscountInr: number | null;
  minAmountInr: number;
  maxUses: number | null;
  perUserLimit: number;
  usedCount: number;
  validTo: string | null;
  isActive: boolean;
}

/**
 * `coupons: staff read` is what keeps codes off the student side — before 0023
 * every signed-in user could read every code, which on a paid platform is a
 * price list anyone can share.
 */
export async function getCoupons(): Promise<Coupon[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('coupons')
    .select(
      'id, code, kind, value, max_discount_inr, min_amount_inr, max_uses, per_user_limit, used_count, valid_to, is_active'
    )
    .order('created_at', { ascending: false });

  if (error) return [];

  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    kind: row.kind,
    value: row.value,
    maxDiscountInr: row.max_discount_inr,
    minAmountInr: row.min_amount_inr,
    maxUses: row.max_uses,
    perUserLimit: row.per_user_limit,
    usedCount: row.used_count,
    validTo: row.valid_to,
    isActive: row.is_active,
  }));
}

export interface PendingCourse {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  status: string;
  educatorName: string | null;
  lessonCount: number;
  priceInr: number | null;
  updatedAt: string;
}

/** Courses awaiting a decision. Admin sees all of them through RLS. */
export async function getPendingCourses(): Promise<PendingCourse[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('courses')
    // The FK must be named: `courses` references profiles twice (created_by and
    // approved_by), so an unqualified embed is ambiguous and PostgREST refuses.
    .select(
      'id, title, slug, subtitle, status, price_inr, updated_at, profiles!courses_created_by_fkey(full_name)'
    )
    .in('status', ['pending_review', 'draft'])
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  if (error || !data?.length) return [];

  const { data: lessons } = await supabase
    .from('lessons')
    .select('id, course_id')
    .in(
      'course_id',
      data.map((course) => course.id)
    );

  const byCourse = new Map<string, number>();
  for (const lesson of lessons ?? []) {
    byCourse.set(lesson.course_id, (byCourse.get(lesson.course_id) ?? 0) + 1);
  }

  return data.map((course) => ({
    id: course.id,
    title: course.title,
    slug: course.slug,
    subtitle: course.subtitle,
    status: course.status,
    educatorName: (course.profiles as { full_name: string } | null)?.full_name ?? null,
    lessonCount: byCourse.get(course.id) ?? 0,
    priceInr: course.price_inr,
    updatedAt: course.updated_at,
  }));
}
