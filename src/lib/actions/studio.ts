'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { parseDriveUrl } from '@/lib/drive';
import { callPendingRpc } from '@/lib/supabase/rpc';
import { createClient } from '@/lib/supabase/server';
import type { FormState } from './types';

/**
 * Educator authoring.
 *
 * Nothing here checks "am I allowed?" in TypeScript. Ownership is enforced by
 * RLS on the plain writes, and inside the SECURITY DEFINER functions for the
 * rest. Duplicating the check here would create a second place to get it wrong
 * and a false sense that the first one is optional.
 */

// -----------------------------------------------------------------------------
// Lessons
// -----------------------------------------------------------------------------

const lessonSchema = z.object({
  moduleId: z.string().uuid(),
  courseId: z.string().uuid(),
  title: z.string().trim().min(3, 'Give the lesson a title.').max(160),
  description: z.string().trim().max(500).optional(),
  driveUrl: z.string().trim().optional(),
  durationMin: z.coerce.number().int().min(0).max(600).optional(),
  isPreview: z.boolean().optional(),
});

/**
 * Adds a lesson, storing the Drive FILE ID rather than the pasted URL.
 *
 * URLs carry tracking parameters and change shape between Drive's views; the id
 * is stable. parseDriveUrl also accepts a bare id, because educators paste that
 * about as often as a full link.
 */
export async function addLesson(_previous: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();

  const parsed = lessonSchema.safeParse({
    moduleId: formData.get('moduleId'),
    courseId: formData.get('courseId'),
    title: formData.get('title'),
    description: formData.get('description') || undefined,
    driveUrl: formData.get('driveUrl') || undefined,
    durationMin: formData.get('durationMin') || undefined,
    isPreview: formData.get('isPreview') === 'on',
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const { moduleId, courseId, title, description, driveUrl, durationMin, isPreview } = parsed.data;

  let driveFileId: string | null = null;
  if (driveUrl) {
    const link = parseDriveUrl(driveUrl);
    if (!link) {
      return {
        ok: false,
        fieldErrors: {
          driveUrl: "That doesn't look like a Google Drive link. Paste the share link or just the file ID.",
        },
      };
    }
    driveFileId = link.fileId;
  }

  // Append to the end of the module. Read-then-write is fine here: one educator
  // authoring one course, not a contended counter.
  const { data: last } = await supabase
    .from('lessons')
    .select('position')
    .eq('module_id', moduleId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from('lessons').insert({
    module_id: moduleId,
    course_id: courseId,
    title,
    description: description ?? null,
    // The drive_required_for_media constraint rejects a video with no file, so
    // a lesson without a link is stored as text until the recording exists.
    kind: driveFileId ? 'video' : 'text',
    drive_file_id: driveFileId,
    duration_sec: durationMin ? durationMin * 60 : null,
    position: (last?.position ?? 0) + 1,
    is_preview: isPreview ?? false,
    published_at: new Date().toISOString(),
  });

  if (error) {
    return { ok: false, message: 'We could not add that lesson. Please try again.' };
  }

  revalidatePath(`/studio/courses/${courseId}`);
  revalidatePath('/app/learning');
  return { ok: true, message: `Added “${title}”.` };
}

const moduleSchema = z.object({
  courseId: z.string().uuid(),
  title: z.string().trim().min(3, 'Give the section a title.').max(160),
});

export async function addModule(_previous: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();

  const parsed = moduleSchema.safeParse({
    courseId: formData.get('courseId'),
    title: formData.get('title'),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: { title: parsed.error.issues[0]?.message ?? 'Invalid title.' } };
  }

  const { data: last } = await supabase
    .from('course_modules')
    .select('position')
    .eq('course_id', parsed.data.courseId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from('course_modules').insert({
    course_id: parsed.data.courseId,
    title: parsed.data.title,
    position: (last?.position ?? 0) + 1,
  });

  if (error) return { ok: false, message: 'We could not add that section.' };

  revalidatePath(`/studio/courses/${parsed.data.courseId}`);
  return { ok: true, message: 'Section added.' };
}

// -----------------------------------------------------------------------------
// Live schedule
// -----------------------------------------------------------------------------

const scheduleSchema = z.object({
  courseId: z.string().uuid(),
  title: z.string().trim().min(3, 'Give the class a title.').max(160),
  description: z.string().trim().max(500).optional(),
  weekdays: z.array(z.coerce.number().int().min(1).max(7)).min(1, 'Pick at least one day.'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Pick a start time.'),
  durationMin: z.coerce.number().int().min(5).max(600),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a start date.'),
  joinUrl: z.string().trim().url('Paste the full Google Meet link.').optional().or(z.literal('')),
});

/**
 * Creates a recurring class and immediately generates its sessions.
 *
 * Both steps together, on purpose. A schedule with no generated sessions is
 * invisible to students, and "saved but not published" is a distinction that
 * only ever produces a confused educator and an empty calendar.
 */
export async function createSchedule(_previous: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'You need to sign in again.' };

  const parsed = scheduleSchema.safeParse({
    courseId: formData.get('courseId'),
    title: formData.get('title'),
    description: formData.get('description') || undefined,
    weekdays: formData.getAll('weekdays'),
    startTime: formData.get('startTime'),
    durationMin: formData.get('durationMin'),
    startsOn: formData.get('startsOn'),
    joinUrl: formData.get('joinUrl') || '',
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const input = parsed.data;

  const { data: schedule, error } = await supabase
    .from('class_schedules')
    .insert({
      course_id: input.courseId,
      educator_id: user.id,
      title: input.title,
      description: input.description ?? null,
      weekdays: input.weekdays,
      start_time: input.startTime,
      duration_min: input.durationMin,
      starts_on: input.startsOn,
      default_join_url: input.joinUrl || null,
      auto_generate: true,
    })
    .select('id')
    .single();

  if (error || !schedule) {
    return { ok: false, message: 'We could not save that schedule. Please try again.' };
  }

  const { data: created, error: publishError } = await callPendingRpc(supabase, 'publish_schedule', {
    p_schedule: schedule.id,
    p_horizon_days: 60,
  });

  revalidatePath('/studio/schedule');
  revalidatePath('/app/calendar');
  revalidatePath('/app/live');

  if (publishError) {
    // The schedule exists but has no sessions — say so precisely, because
    // "saved successfully" followed by an empty calendar is worse than an error.
    return {
      ok: false,
      message: 'The schedule was saved, but generating the classes failed. Open it and publish again.',
    };
  }

  return { ok: true, message: `Scheduled — ${created ?? 0} classes created for the next 60 days.` };
}

export async function republishSchedule(scheduleId: string) {
  const supabase = await createClient();
  const { data, error } = await callPendingRpc(supabase, 'publish_schedule', {
    p_schedule: scheduleId,
    p_horizon_days: 60,
  });

  if (error) return { ok: false as const, created: 0 };

  revalidatePath('/studio/schedule');
  revalidatePath('/app/calendar');
  return { ok: true as const, created: data ?? 0 };
}

// -----------------------------------------------------------------------------
// Sessions
// -----------------------------------------------------------------------------

export async function attachRecording(sessionId: string, driveUrl: string) {
  const link = parseDriveUrl(driveUrl);
  if (!link) {
    return { ok: false as const, message: "That doesn't look like a Google Drive link." };
  }

  const supabase = await createClient();
  const { error } = await callPendingRpc(supabase, 'set_session_recording', {
    p_session: sessionId,
    p_drive_file_id: link.fileId,
  });

  if (error) return { ok: false as const, message: 'We could not attach that recording.' };

  revalidatePath('/studio/live');
  revalidatePath('/app/live');
  return { ok: true as const, message: 'Recording attached. Enrolled students have been notified.' };
}

/**
 * Moves ONE occurrence. The recurring pattern is untouched — editing that would
 * shift every future class on the same weekday, which is the mistake this whole
 * function exists to make impossible.
 */
export async function rescheduleSession(sessionId: string, startsAtIso: string, reason: string) {
  const when = new Date(startsAtIso);
  if (Number.isNaN(when.getTime())) {
    return { ok: false as const, message: 'That date and time could not be read.' };
  }
  if (when.getTime() < Date.now()) {
    return { ok: false as const, message: 'Pick a time in the future.' };
  }

  const supabase = await createClient();
  const { error } = await callPendingRpc(supabase, 'reschedule_occurrence', {
    p_session: sessionId,
    p_starts_at: when.toISOString(),
    p_reason: reason,
  });

  if (error) {
    const upper = error.message.toUpperCase();
    const message = upper.includes('REASON_REQUIRED')
      ? 'Give students a reason — at least a few words.'
      : upper.includes('ALREADY_STARTED')
        ? 'That class has already started, so it cannot be moved.'
        : 'We could not move that class.';
    return { ok: false as const, message };
  }

  revalidatePath('/studio/live');
  revalidatePath('/studio/schedule');
  revalidatePath('/app/calendar');
  revalidatePath('/app/live');
  return { ok: true as const, message: 'Class moved and students notified.' };
}

export async function cancelSession(sessionId: string, reason: string) {
  const supabase = await createClient();
  const { error } = await callPendingRpc(supabase, 'cancel_live_session', {
    p_session: sessionId,
    p_reason: reason,
  });

  if (error) {
    const message = error.message.toUpperCase().includes('REASON_REQUIRED')
      ? 'Give students a reason — at least a few words.'
      : 'We could not cancel that class.';
    return { ok: false as const, message };
  }

  revalidatePath('/studio/live');
  revalidatePath('/app/calendar');
  revalidatePath('/app/live');
  return { ok: true as const, message: 'Class cancelled and students notified.' };
}
