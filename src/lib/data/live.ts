import 'server-only';

import { callPendingRpc } from '@/lib/supabase/rpc';
import { createClient } from '@/lib/supabase/server';

/**
 * Live class reads.
 *
 * NOTE: never `select('*')` from live_sessions. The join_url column is REVOKEd
 * from `authenticated`, so a star-select fails the whole query for students —
 * the column list below is deliberate, not stylistic. The URL is served only by
 * get_live_join_url(), which checks enrolment and the time window.
 */

export interface LiveSession {
  id: string;
  courseId: string;
  courseTitle: string | null;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
  educatorName: string | null;
  hasRecording: boolean;
  materialDriveId: string | null;
}

const SESSION_COLUMNS =
  'id, course_id, title, description, starts_at, ends_at, status, material_drive_id, recording_drive_id, courses(title), profiles!live_sessions_educator_id_fkey(full_name)';

interface SessionRow {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  material_drive_id: string | null;
  recording_drive_id: string | null;
  courses: { title: string } | null;
  profiles: { full_name: string } | null;
}

function toSession(row: SessionRow): LiveSession {
  return {
    id: row.id,
    courseId: row.course_id,
    courseTitle: row.courses?.title ?? null,
    title: row.title,
    description: row.description,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    educatorName: row.profiles?.full_name ?? null,
    hasRecording: Boolean(row.recording_drive_id),
    materialDriveId: row.material_drive_id,
  };
}

/**
 * Upcoming classes, soonest first.
 *
 * The lower bound is one hour in the past, not now(): a class that started
 * twenty minutes ago is exactly the one a student is looking for, and dropping
 * it the instant it starts is the single most annoying thing this page could do.
 */
export async function getUpcomingSessions(limit = 10): Promise<LiveSession[]> {
  const supabase = await createClient();
  const from = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('live_sessions')
    .select(SESSION_COLUMNS)
    .neq('status', 'cancelled')
    .gte('starts_at', from)
    .order('starts_at', { ascending: true })
    .limit(limit);

  if (error) return [];
  return (data as unknown as SessionRow[]).map(toSession);
}

/** Past classes that have a recording. */
export async function getPastSessions(limit = 20): Promise<LiveSession[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('live_sessions')
    .select(SESSION_COLUMNS)
    .lt('ends_at', new Date().toISOString())
    .neq('status', 'cancelled')
    .order('starts_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data as unknown as SessionRow[]).map(toSession);
}

/** Everything in a date window — the calendar's month and week views. */
export async function getSessionsBetween(fromIso: string, toIso: string): Promise<LiveSession[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('live_sessions')
    .select(SESSION_COLUMNS)
    .gte('starts_at', fromIso)
    .lte('starts_at', toIso)
    .order('starts_at', { ascending: true });

  if (error) return [];
  return (data as unknown as SessionRow[]).map(toSession);
}

/** One class. Null when it does not exist *or* RLS hides it — same answer to the caller. */
export async function getSessionById(sessionId: string): Promise<LiveSession | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('live_sessions')
    .select(SESSION_COLUMNS)
    .eq('id', sessionId)
    .maybeSingle();

  if (error || !data) return null;
  return toSession(data as unknown as SessionRow);
}

export type JoinResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'TOO_EARLY' | 'SESSION_ENDED' | 'NOT_ENROLLED' | 'NOT_FOUND' | 'ERROR' };

/**
 * Resolves the Meet link through join_live_session(), the only path that can
 * read the column — it is REVOKEd from `authenticated`, so no select reaches it.
 *
 * The function does three things in one transaction: checks active enrolment,
 * checks the T-15m → T+30m window, and records the attempt. All three are in
 * the database rather than here because this is reached from a public HTTP
 * endpoint, and a crafted request must not be able to skip any of them.
 *
 * Device, IP and user agent are passed for the attendance record. They are what
 * distinguishes "watched the recording twice" from "one account, four people" —
 * a distinction the previous one-row-per-student model could not make at all.
 *
 * Exceptions are mapped to reasons the UI can phrase for a student: "the room
 * opens 15 minutes before" rather than a Postgres error code.
 */
export async function getJoinUrl(
  sessionId: string,
  context: { deviceId?: string | null; ip?: string | null; userAgent?: string | null } = {}
): Promise<JoinResult> {
  const supabase = await createClient();

  const { data, error } = await callPendingRpc(supabase, 'join_live_session', {
    p_session: sessionId,
    p_device_id: context.deviceId ?? null,
    p_ip: context.ip ?? null,
    p_user_agent: context.userAgent ?? null,
  });

  if (error) {
    const message = error.message.toUpperCase();
    if (message.includes('TOO_EARLY')) return { ok: false, reason: 'TOO_EARLY' };
    if (message.includes('SESSION_ENDED')) return { ok: false, reason: 'SESSION_ENDED' };
    if (message.includes('NOT_ENROLLED')) return { ok: false, reason: 'NOT_ENROLLED' };
    if (message.includes('SESSION_NOT_FOUND')) return { ok: false, reason: 'NOT_FOUND' };
    return { ok: false, reason: 'ERROR' };
  }

  if (!data) return { ok: false, reason: 'NOT_FOUND' };
  return { ok: true, url: data };
}

/** One line of the register. Absentees have `joinCount: 0` and null times. */
export interface AttendanceRow {
  userId: string;
  fullName: string;
  email: string;
  firstJoined: string | null;
  lastSeen: string | null;
  joinCount: number;
  deviceCount: number;
}

/**
 * The register for one class: every actively enrolled student, attended or not.
 * Educator and staff only — enforced inside the function, not here.
 */
export async function getSessionAttendance(sessionId: string): Promise<AttendanceRow[]> {
  const supabase = await createClient();
  const { data, error } = await callPendingRpc(supabase, 'get_session_attendance', {
    p_session: sessionId,
  });

  if (error) return [];

  return (data ?? []).map((row) => ({
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    firstJoined: row.first_joined,
    lastSeen: row.last_seen,
    joinCount: row.join_count,
    deviceCount: row.device_count,
  }));
}

export interface CourseAttendance {
  courseId: string;
  courseTitle: string;
  held: number;
  attended: number;
}

/** The signed-in student's own record. `held` counts finished classes only. */
export async function getMyAttendance(): Promise<CourseAttendance[]> {
  const supabase = await createClient();
  const { data, error } = await callPendingRpc(supabase, 'get_my_attendance', { p_course: null });

  if (error) return [];

  return (data ?? []).map((row) => ({
    courseId: row.course_id,
    courseTitle: row.course_title,
    held: row.held,
    attended: row.attended,
  }));
}
