import 'server-only';

import { createClient } from '@/lib/supabase/server';

/**
 * Course reads for the student portal.
 *
 * Every query here runs under the caller's own RLS context — no service role.
 * That means enrolment is enforced by the database, not by remembering to add a
 * `.eq('user_id', …)`: a missing filter returns nothing rather than everything.
 */

export interface EnrolledCourse {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  category: string | null;
  bannerPublicId: string | null;
  batchName: string | null;
  expiresAt: string | null;
  lessonsTotal: number;
  lessonsDone: number;
  progress: number;
  /** A course with a live schedule reads differently from a self-paced one. */
  isLive: boolean;
  nextSessionAt: string | null;
  nextSessionTitle: string | null;
}

export async function getMyCourses(userId: string): Promise<EnrolledCourse[]> {
  const supabase = await createClient();

  const { data: enrolments, error } = await supabase
    .from('enrollments')
    .select(
      'course_id, expires_at, courses(id, slug, title, subtitle, category, banner_public_id), batches(name)'
    )
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error || !enrolments?.length) return [];

  const courseIds = enrolments.map((e) => e.course_id);

  // Three follow-up reads rather than one clever join: PostgREST cannot group,
  // and at ~50 lessons a course this is a few kilobytes. Revisit if a course
  // ever carries hundreds of lessons.
  const [lessonResult, progressResult, sessionResult] = await Promise.all([
    supabase.from('lessons').select('id, course_id').in('course_id', courseIds).is('deleted_at', null),
    supabase
      .from('lesson_progress')
      .select('lesson_id, course_id, status')
      .eq('user_id', userId)
      .in('course_id', courseIds),
    supabase
      .from('live_sessions')
      .select('id, course_id, title, starts_at')
      .in('course_id', courseIds)
      .eq('status', 'scheduled')
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true }),
  ]);

  const lessonCount = new Map<string, number>();
  for (const lesson of lessonResult.data ?? []) {
    lessonCount.set(lesson.course_id, (lessonCount.get(lesson.course_id) ?? 0) + 1);
  }

  const doneCount = new Map<string, number>();
  for (const row of progressResult.data ?? []) {
    if (row.status !== 'completed') continue;
    doneCount.set(row.course_id, (doneCount.get(row.course_id) ?? 0) + 1);
  }

  // Ordered ascending, so the first hit per course is the next class.
  const nextSession = new Map<string, { title: string; starts_at: string }>();
  for (const session of sessionResult.data ?? []) {
    if (!nextSession.has(session.course_id)) {
      nextSession.set(session.course_id, { title: session.title, starts_at: session.starts_at });
    }
  }

  return enrolments
    .map((enrolment) => {
      const course = enrolment.courses as {
        id: string;
        slug: string;
        title: string;
        subtitle: string | null;
        category: string | null;
        banner_public_id: string | null;
      } | null;
      if (!course) return null;

      const total = lessonCount.get(course.id) ?? 0;
      const done = doneCount.get(course.id) ?? 0;
      const upcoming = nextSession.get(course.id) ?? null;

      return {
        id: course.id,
        slug: course.slug,
        title: course.title,
        subtitle: course.subtitle,
        category: course.category,
        bannerPublicId: course.banner_public_id,
        batchName: (enrolment.batches as { name: string } | null)?.name ?? null,
        expiresAt: enrolment.expires_at,
        lessonsTotal: total,
        lessonsDone: done,
        progress: total > 0 ? Math.round((done / total) * 100) : 0,
        isLive: Boolean(upcoming),
        nextSessionAt: upcoming?.starts_at ?? null,
        nextSessionTitle: upcoming?.title ?? null,
      } satisfies EnrolledCourse;
    })
    .filter((course): course is EnrolledCourse => course !== null)
    .sort((a, b) => {
      // Live batches first: they have a schedule the student can actually miss.
      if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
      return a.title.localeCompare(b.title);
    });
}

export interface CourseLesson {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  driveFileId: string | null;
  durationSec: number | null;
  position: number;
  isPreview: boolean;
  completed: boolean;
}

export interface CourseModule {
  id: string;
  title: string;
  position: number;
  lessons: CourseLesson[];
}

export interface CourseDetail {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  modules: CourseModule[];
  lessonsTotal: number;
  lessonsDone: number;
  progress: number;
  enrolled: boolean;
}

/**
 * Accepts an id or a slug — /app/learning/[id] is linked from several places
 * and the friendlier URL should not require the caller to know which it has.
 *
 * Returns null both when the course does not exist and when RLS hides it. The
 * caller renders 404 either way: distinguishing them would confirm to a probe
 * that a private course exists.
 */
export async function getCourseDetail(userId: string, idOrSlug: string): Promise<CourseDetail | null> {
  const supabase = await createClient();

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);

  const { data: course } = await supabase
    .from('courses')
    .select('id, slug, title, subtitle, description')
    .eq(isUuid ? 'id' : 'slug', idOrSlug)
    .is('deleted_at', null)
    .maybeSingle();

  if (!course) return null;

  const [moduleResult, lessonResult, progressResult, enrolmentResult] = await Promise.all([
    supabase
      .from('course_modules')
      .select('id, title, position')
      .eq('course_id', course.id)
      .order('position'),
    supabase
      .from('lessons')
      .select('id, module_id, title, description, kind, drive_file_id, duration_sec, position, is_preview')
      .eq('course_id', course.id)
      .is('deleted_at', null)
      .order('position'),
    supabase
      .from('lesson_progress')
      .select('lesson_id, status')
      .eq('user_id', userId)
      .eq('course_id', course.id),
    supabase
      .from('enrollments')
      .select('id')
      .eq('user_id', userId)
      .eq('course_id', course.id)
      .eq('status', 'active')
      .maybeSingle(),
  ]);

  const completed = new Set(
    (progressResult.data ?? []).filter((p) => p.status === 'completed').map((p) => p.lesson_id)
  );

  const lessonsByModule = new Map<string, CourseLesson[]>();
  for (const lesson of lessonResult.data ?? []) {
    const list = lessonsByModule.get(lesson.module_id) ?? [];
    list.push({
      id: lesson.id,
      title: lesson.title,
      description: lesson.description,
      kind: lesson.kind,
      driveFileId: lesson.drive_file_id,
      durationSec: lesson.duration_sec,
      position: lesson.position,
      isPreview: lesson.is_preview,
      completed: completed.has(lesson.id),
    });
    lessonsByModule.set(lesson.module_id, list);
  }

  const modules = (moduleResult.data ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    position: m.position,
    lessons: lessonsByModule.get(m.id) ?? [],
  }));

  const lessonsTotal = lessonResult.data?.length ?? 0;
  const lessonsDone = completed.size;

  return {
    id: course.id,
    slug: course.slug,
    title: course.title,
    subtitle: course.subtitle,
    description: course.description,
    modules,
    lessonsTotal,
    lessonsDone,
    progress: lessonsTotal > 0 ? Math.round((lessonsDone / lessonsTotal) * 100) : 0,
    enrolled: Boolean(enrolmentResult.data),
  };
}

export interface CatalogCourse {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  category: string | null;
  priceInr: number;
  mrpInr: number | null;
  isFree: boolean;
  studentCount: number;
}

/** Published courses, visible to anyone — the `courses: published are public` policy. */
export async function getCatalog(): Promise<CatalogCourse[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('courses')
    .select('id, slug, title, subtitle, category, price_inr, mrp_inr, is_free, student_count')
    .eq('status', 'published')
    .is('deleted_at', null)
    .order('published_at', { ascending: false });

  return (data ?? []).map((c) => ({
    id: c.id,
    slug: c.slug,
    title: c.title,
    subtitle: c.subtitle,
    category: c.category,
    priceInr: c.price_inr,
    mrpInr: c.mrp_inr,
    isFree: c.is_free ?? c.price_inr === 0,
    studentCount: c.student_count,
  }));
}
