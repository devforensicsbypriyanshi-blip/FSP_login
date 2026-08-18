'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

/**
 * Lesson progress writes.
 *
 * lesson_progress is `for all using (user_id = auth.uid())` under RLS, so the
 * browser could write these directly. Routing them through a Server Action
 * instead buys two things: user_id is taken from the verified session rather
 * than sent by the client, and revalidatePath refreshes the course list so a
 * completed lesson updates the progress bar on the way back.
 *
 * Progress is lesson-level only. The Drive iframe is cross-origin and emits no
 * playback events, so "63% through the video" is not obtainable in v1 — see
 * docs Part 0 §F3. Pretending otherwise would mean inventing numbers.
 */

export async function markLessonOpened(lessonId: string, courseId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const };

  // ignoreDuplicates: opening a lesson a second time must not clear a
  // 'completed' status back to 'opened'.
  const { error } = await supabase
    .from('lesson_progress')
    .upsert(
      { user_id: user.id, lesson_id: lessonId, course_id: courseId, status: 'opened' },
      { onConflict: 'user_id,lesson_id', ignoreDuplicates: true }
    );

  return { ok: !error };
}

export async function setLessonCompleted(lessonId: string, courseId: string, completed: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const };

  const { error } = await supabase.from('lesson_progress').upsert(
    {
      user_id: user.id,
      lesson_id: lessonId,
      course_id: courseId,
      status: completed ? 'completed' : 'opened',
      completed_at: completed ? new Date().toISOString() : null,
    },
    { onConflict: 'user_id,lesson_id' }
  );

  if (error) return { ok: false as const };

  revalidatePath('/app/learning');
  revalidatePath('/app');
  return { ok: true as const };
}
