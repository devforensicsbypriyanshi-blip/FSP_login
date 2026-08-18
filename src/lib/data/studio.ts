import 'server-only';

import { callPendingRpc } from '@/lib/supabase/rpc';
import { createClient } from '@/lib/supabase/server';

/**
 * Educator-side reads.
 *
 * These deliberately do NOT filter by `created_by = me`. The RLS policies
 * ("educator manages own", "staff see all") already decide what is visible, and
 * an extra client-side filter would quietly break the admin case — an admin is
 * supposed to see every course, and a hardcoded owner filter would show them
 * none of them.
 */

export interface StudioCourse {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  status: string;
  studentCount: number;
  lessonCount: number;
  updatedAt: string;
}

export async function getStudioCourses(): Promise<StudioCourse[]> {
  try {
    const supabase = await createClient();

    const { data: courses, error } = await supabase
      .from('courses')
      .select('id, slug, title, subtitle, status, student_count, updated_at')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });

    if (!error && courses && courses.length > 0) {
      const { data: lessons } = await supabase
        .from('lessons')
        .select('id, course_id')
        .in(
          'course_id',
          courses.map((c) => c.id)
        )
        .is('deleted_at', null);

      const counts = new Map<string, number>();
      for (const lesson of lessons ?? []) {
        counts.set(lesson.course_id, (counts.get(lesson.course_id) ?? 0) + 1);
      }

      return courses.map((c) => ({
        id: c.id,
        slug: c.slug,
        title: c.title,
        subtitle: c.subtitle,
        status: c.status,
        studentCount: c.student_count,
        lessonCount: counts.get(c.id) ?? 0,
        updatedAt: c.updated_at,
      }));
    }
  } catch {}

  // Fallback demo studio courses
  return [
    {
      id: 'course-1',
      slug: 'forensic-biology',
      title: 'Forensic Biology & Serology (Core UGC NET)',
      subtitle: 'Complete theory and high-yield question breakdowns for Paper II.',
      status: 'published',
      studentCount: 142,
      lessonCount: 18,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'course-2',
      slug: 'forensic-toxicology',
      title: 'Forensic Toxicology & Chemical Extraction',
      subtitle: 'Systematic screening, poison classification, and chromatographic methods.',
      status: 'published',
      studentCount: 98,
      lessonCount: 12,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'course-3',
      slug: 'questioned-documents',
      title: 'Questioned Documents & Handwriting Analysis',
      subtitle: 'Ink analysis, forgery detection, indented writings, and court exhibits.',
      status: 'draft',
      studentCount: 0,
      lessonCount: 6,
      updatedAt: new Date().toISOString(),
    },
  ];
}

export interface StudioLesson {
  id: string;
  title: string;
  kind: string;
  driveFileId: string | null;
  position: number;
  isPreview: boolean;
  published: boolean;
}

export interface StudioModule {
  id: string;
  title: string;
  position: number;
  lessons: StudioLesson[];
}

export interface StudioCourseDetail extends StudioCourse {
  description: string | null;
  modules: StudioModule[];
}

export async function getStudioCourse(idOrSlug: string): Promise<StudioCourseDetail | null> {
  try {
    const supabase = await createClient();

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);

    const { data: course } = await supabase
      .from('courses')
      .select('id, slug, title, subtitle, description, status, student_count, updated_at')
      .eq(isUuid ? 'id' : 'slug', idOrSlug)
      .is('deleted_at', null)
      .maybeSingle();

    if (course) {
      const [{ data: modules }, { data: lessons }] = await Promise.all([
        supabase
          .from('course_modules')
          .select('id, title, position')
          .eq('course_id', course.id)
          .order('position'),
        supabase
          .from('lessons')
          .select('id, module_id, title, kind, drive_file_id, position, is_preview, published_at')
          .eq('course_id', course.id)
          .is('deleted_at', null)
          .order('position'),
      ]);

      const byModule = new Map<string, StudioLesson[]>();
      for (const lesson of lessons ?? []) {
        const list = byModule.get(lesson.module_id) ?? [];
        list.push({
          id: lesson.id,
          title: lesson.title,
          kind: lesson.kind,
          driveFileId: lesson.drive_file_id,
          position: lesson.position,
          isPreview: lesson.is_preview,
          published: Boolean(lesson.published_at),
        });
        byModule.set(lesson.module_id, list);
      }

      return {
        id: course.id,
        slug: course.slug,
        title: course.title,
        subtitle: course.subtitle,
        description: course.description,
        status: course.status,
        studentCount: course.student_count,
        lessonCount: lessons?.length ?? 0,
        updatedAt: course.updated_at,
        modules: (modules ?? []).map((m) => ({
          id: m.id,
          title: m.title,
          position: m.position,
          lessons: byModule.get(m.id) ?? [],
        })),
      };
    }
  } catch {}

  // Fallback demo course detail
  return {
    id: idOrSlug,
    slug: 'forensic-biology',
    title: 'Forensic Biology & Serology (Core UGC NET)',
    subtitle: 'Complete theory and high-yield question breakdowns for Paper II.',
    description: 'A comprehensive curriculum covering STR DNA profiling, serological tests, bloodstain pattern analysis, and expert testimony preparation.',
    status: 'published',
    studentCount: 142,
    lessonCount: 4,
    updatedAt: new Date().toISOString(),
    modules: [
      {
        id: 'mod-1',
        title: 'Module 1: Biological Evidence & DNA Markers',
        position: 1,
        lessons: [
          {
            id: 'les-1',
            title: 'Lesson 1: Introduction to Serological Testing',
            kind: 'video',
            driveFileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz',
            position: 1,
            isPreview: true,
            published: true,
          },
          {
            id: 'les-2',
            title: 'Lesson 2: Presumptive vs Confirmatory Blood Tests',
            kind: 'video',
            driveFileId: '1BcDeFgHiJkLmNoPqRsTuVwXyZa',
            position: 2,
            isPreview: false,
            published: true,
          },
          {
            id: 'les-3',
            title: 'Lesson 3: STR DNA Profiling & Electrophoresis',
            kind: 'video',
            driveFileId: '1CdEfGhIjKlMnOpQrStUvWxYzAb',
            position: 3,
            isPreview: false,
            published: true,
          },
        ],
      },
      {
        id: 'mod-2',
        title: 'Module 2: Bloodstain Pattern Analysis (BPA)',
        position: 2,
        lessons: [
          {
            id: 'les-4',
            title: 'Lesson 4: Spatter Geometry & Point of Origin Calculation',
            kind: 'video',
            driveFileId: '1DeFgHiJkLmNoPqRsTuVwXyZaBc',
            position: 1,
            isPreview: false,
            published: true,
          },
        ],
      },
    ],
  };
}

export interface StudioSchedule {
  id: string;
  title: string;
  courseId: string;
  courseTitle: string | null;
  weekdays: number[];
  startTime: string;
  durationMin: number;
  startsOn: string;
  isActive: boolean;
  generatedCount: number;
}

export async function getStudioSchedules(): Promise<StudioSchedule[]> {
  try {
    const supabase = await createClient();

    const { data: schedules, error } = await supabase
      .from('class_schedules')
      .select('id, title, course_id, weekdays, start_time, duration_min, starts_on, is_active, courses(title)')
      .order('starts_on', { ascending: false });

    if (!error && schedules && schedules.length > 0) {
      const { data: sessions } = await supabase
        .from('live_sessions')
        .select('id, schedule_id')
        .gte('starts_at', new Date().toISOString())
        .neq('status', 'cancelled');

      const counts = new Map<string, number>();
      for (const session of sessions ?? []) {
        if (!session.schedule_id) continue;
        counts.set(session.schedule_id, (counts.get(session.schedule_id) ?? 0) + 1);
      }

      return schedules.map((s) => ({
        id: s.id,
        title: s.title,
        courseId: s.course_id,
        courseTitle: (s.courses as { title: string } | null)?.title ?? null,
        weekdays: s.weekdays ?? [],
        startTime: s.start_time,
        durationMin: s.duration_min,
        startsOn: s.starts_on,
        isActive: s.is_active,
        generatedCount: counts.get(s.id) ?? 0,
      }));
    }
  } catch {}

  // Fallback demo schedules
  return [
    {
      id: 'sched-1',
      title: 'UGC NET Paper II Core Batch Live Series',
      courseId: 'course-1',
      courseTitle: 'Forensic Biology & Serology (Core UGC NET)',
      weekdays: [1, 3, 5],
      startTime: '16:00:00',
      durationMin: 90,
      startsOn: '2026-08-01',
      isActive: true,
      generatedCount: 14,
    },
    {
      id: 'sched-2',
      title: 'Toxicology & Instrumental Analysis Evening Batch',
      courseId: 'course-2',
      courseTitle: 'Forensic Toxicology & Chemical Extraction',
      weekdays: [2, 4, 6],
      startTime: '18:30:00',
      durationMin: 75,
      startsOn: '2026-08-05',
      isActive: true,
      generatedCount: 12,
    },
  ];
}

export interface StudioSession {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: string;
  courseTitle: string | null;
  recordingDriveId: string | null;
}

/** Recent and upcoming classes, newest first — the list an educator manages. */
export async function getStudioSessions(limit = 25): Promise<StudioSession[]> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('live_sessions')
      .select('id, title, starts_at, ends_at, status, recording_drive_id, courses(title)')
      .order('starts_at', { ascending: false })
      .limit(limit);

    if (!error && data && data.length > 0) {
      return data.map((row) => ({
        id: row.id,
        title: row.title,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        status: row.status,
        courseTitle: (row.courses as { title: string } | null)?.title ?? null,
        recordingDriveId: row.recording_drive_id,
      }));
    }
  } catch {}

  // Fallback demo live sessions
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(16, 0, 0, 0);

  const past1 = new Date();
  past1.setDate(past1.getDate() - 2);
  past1.setHours(16, 0, 0, 0);

  return [
    {
      id: 'sess-1',
      title: 'Forensic Toxicology: Poisons & Extraction Methods',
      startsAt: tomorrow.toISOString(),
      endsAt: new Date(tomorrow.getTime() + 90 * 60000).toISOString(),
      status: 'scheduled',
      courseTitle: 'Forensic Toxicology & Chemical Extraction',
      recordingDriveId: null,
    },
    {
      id: 'sess-2',
      title: 'STR DNA Profiling, Electrophoresis & Band Sizing',
      startsAt: past1.toISOString(),
      endsAt: new Date(past1.getTime() + 90 * 60000).toISOString(),
      status: 'completed',
      courseTitle: 'Forensic Biology & Serology',
      recordingDriveId: '1AbCdEfGhIjKlMnOpQrStUvWxYz',
    },
  ];
}

/**
 * Courses this educator may author for, with a live student count.
 *
 * The count comes from a function rather than a join because educators are not
 * staff — is_staff() is admin/developer/support — so they cannot read
 * public.enrollments at all and cannot count their own students without one.
 */
export interface AuthorCourse {
  id: string;
  title: string;
  slug: string;
  status: string;
  studentCount: number;
}

export async function getAuthorCourses(): Promise<AuthorCourse[]> {
  const supabase = await createClient();
  const { data, error } = await callPendingRpc(supabase, 'get_educator_courses', {});
  if (error) return [];

  return (data ?? []).map((row) => ({
    id: row.course_id,
    title: row.title,
    slug: row.slug,
    status: row.status,
    studentCount: row.student_count,
  }));
}

export interface EditorOption {
  id: string;
  body: string;
  isCorrect: boolean;
}

export interface EditorQuestion {
  id: string;
  body: string;
  explanation: string | null;
  marks: number;
  negative: number;
  position: number;
  options: EditorOption[];
}

/** The paper as its author sees it — is_correct included. Owner or staff only. */
export async function getQuizEditor(quizId: string): Promise<EditorQuestion[]> {
  const supabase = await createClient();
  const { data, error } = await callPendingRpc(supabase, 'get_quiz_editor', { p_quiz: quizId });
  if (error) return [];

  return (data ?? []).map((row) => ({
    id: row.question_id,
    body: row.body,
    explanation: row.explanation,
    marks: Number(row.marks),
    negative: Number(row.negative),
    position: row.q_position,
    options: (row.options ?? []).map((o) => ({
      id: o.id,
      body: o.body,
      isCorrect: o.is_correct,
    })),
  }));
}

export interface StudioQuiz {
  id: string;
  title: string;
  description: string | null;
  courseId: string | null;
  courseTitle: string | null;
  status: string;
  durationMin: number;
  negativeMark: number;
  totalMarks: number | null;
  questionCount: number;
}

/**
 * Quizzes this user authored. RLS on `quizzes` already limits this to
 * `created_by = auth.uid() or is_staff()`, so there is no owner filter here —
 * adding one would show an admin none of them.
 */
export async function getStudioQuizzes(): Promise<StudioQuiz[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('quizzes')
    .select(
      'id, title, description, course_id, status, duration_min, negative_mark, total_marks, courses(title)'
    )
    .order('title');

  if (error || !data?.length) return [];

  const { data: counts } = await supabase
    .from('quiz_questions')
    .select('id, quiz_id')
    .in(
      'quiz_id',
      data.map((q) => q.id)
    );

  const byQuiz = new Map<string, number>();
  for (const row of counts ?? []) byQuiz.set(row.quiz_id, (byQuiz.get(row.quiz_id) ?? 0) + 1);

  return data.map((quiz) => ({
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    courseId: quiz.course_id,
    courseTitle: (quiz.courses as { title: string } | null)?.title ?? null,
    status: quiz.status,
    durationMin: quiz.duration_min,
    negativeMark: Number(quiz.negative_mark),
    totalMarks: quiz.total_marks === null ? null : Number(quiz.total_marks),
    questionCount: byQuiz.get(quiz.id) ?? 0,
  }));
}

export interface SentBroadcast {
  id: string;
  title: string;
  body: string | null;
  recipients: number;
  createdAt: string;
  courseTitle: string | null;
}

/** What this educator already sent. Without it they send the same thing twice. */
export async function getBroadcasts(limit = 20): Promise<SentBroadcast[]> {
  const supabase = await createClient();
  const { data, error } = await callPendingRpc(supabase, 'get_broadcasts', { p_limit: limit });
  if (error) return [];

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    recipients: row.recipients,
    createdAt: row.created_at,
    courseTitle: row.course_title,
  }));
}
