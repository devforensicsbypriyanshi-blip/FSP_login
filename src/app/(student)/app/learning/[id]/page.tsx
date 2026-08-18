import { notFound, redirect } from 'next/navigation';
import { CoursePlayer } from '@/components/player/course-player';
import { getCourseDetail } from '@/lib/data/courses';
import { getSessionContext } from '@/lib/session/server';

/**
 * The course player route. `[id]` accepts a slug or a uuid — the catalogue links
 * by slug, older links use the id, and both should work.
 */

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionContext();
  if (!session) return { title: 'Course' };

  const course = await getCourseDetail(session.userId, id);
  return { title: course?.title ?? 'Course' };
}

export default async function CoursePlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lesson?: string }>;
}) {
  const [{ id }, { lesson }] = await Promise.all([params, searchParams]);

  const session = await getSessionContext();
  if (!session) redirect('/sign-in');

  const course = await getCourseDetail(session.userId, id);

  // getCourseDetail returns null both for "no such course" and "RLS hid it".
  // 404 covers both on purpose — distinguishing them tells a prober that a
  // private course exists.
  if (!course) notFound();

  const flat = course.modules.flatMap((m) => m.lessons);

  // Resume where they left off: first not-yet-completed lesson. A returning
  // student should land on what is next, not back at lesson one.
  const resumeId = flat.find((l) => !l.completed)?.id ?? flat[0]?.id ?? null;
  const requested = lesson && flat.some((l) => l.id === lesson) ? lesson : null;

  return <CoursePlayer course={course} initialLessonId={requested ?? resumeId} />;
}
