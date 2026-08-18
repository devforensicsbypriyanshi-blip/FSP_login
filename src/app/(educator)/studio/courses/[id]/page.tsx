import { ArrowLeft, CheckCircle2, FileText, Link2, PlayCircle, Users } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LessonForm } from '@/components/studio/lesson-form';
import { ModuleForm } from '@/components/studio/module-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { getStudioCourse } from '@/lib/data/studio';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const course = await getStudioCourse(id);
  return { title: course?.title ?? 'Course' };
}

/**
 * Course authoring.
 *
 * A lesson without a Drive file is stored as `kind='text'`, not as a broken
 * video — the drive_required_for_media constraint refuses a video row with no
 * file id, and rightly so. The badge below makes that state visible rather than
 * letting a course look complete while half its lessons play nothing.
 */
export default async function StudioCourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const course = await getStudioCourse(id);

  if (!course) notFound();

  const missingVideo = course.modules.flatMap((m) => m.lessons).filter((l) => !l.driveFileId).length;

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link href="/studio/courses">
            <ArrowLeft className="size-4" aria-hidden /> All courses
          </Link>
        </Button>
        <h1 className="font-display text-ink text-xl font-bold text-balance md:text-2xl">{course.title}</h1>
        <p className="text-ink-muted mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          <span className="flex items-center gap-1">
            <PlayCircle className="size-3.5" aria-hidden /> {course.lessonCount} lessons
          </span>
          <span className="flex items-center gap-1">
            <Users className="size-3.5" aria-hidden /> {course.studentCount} students
          </span>
          <Badge variant={course.status === 'published' ? 'success' : 'gray'}>{course.status}</Badge>
        </p>
      </div>

      {missingVideo > 0 && (
        <div className="border-warning-border bg-warning-bg text-warning flex items-start gap-2.5 rounded-xl border p-4 text-[13px]">
          <Link2 className="mt-px size-4 shrink-0" aria-hidden />
          <p className="leading-relaxed">
            <strong>
              {missingVideo} {missingVideo === 1 ? 'lesson has' : 'lessons have'} no Drive link.
            </strong>{' '}
            Students can open them but there is nothing to play. Add the link and the lesson becomes a video.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add a lesson</CardTitle>
        </CardHeader>
        <LessonForm
          courseId={course.id}
          modules={course.modules.map((m) => ({ id: m.id, title: m.title }))}
        />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sections</CardTitle>
          <Badge variant="gray">{course.modules.length}</Badge>
        </CardHeader>
        <ModuleForm courseId={course.id} />
      </Card>

      {course.modules.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No sections yet"
          description="A course is organised into sections, and lessons live inside them. Add your first section above."
        />
      ) : (
        course.modules.map((module) => (
          <Card key={module.id}>
            <CardHeader>
              <CardTitle>{module.title}</CardTitle>
              <Badge variant="gray">{module.lessons.length}</Badge>
            </CardHeader>

            {module.lessons.length === 0 ? (
              <p className="text-ink-muted text-[13px]">No lessons in this section yet.</p>
            ) : (
              <ul className="divide-line flex flex-col divide-y">
                {module.lessons.map((lesson) => (
                  <li key={lesson.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="bg-hover text-ink-muted grid size-8 shrink-0 place-items-center rounded-lg text-[12px] font-semibold">
                      {lesson.position}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-ink truncate text-[13.5px] font-medium">{lesson.title}</p>
                      <p className="text-ink-muted mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px]">
                        {lesson.driveFileId ? (
                          <span className="text-success flex items-center gap-1">
                            <CheckCircle2 className="size-3" aria-hidden /> Drive linked
                          </span>
                        ) : (
                          <span className="text-warning">No video attached</span>
                        )}
                        {lesson.isPreview && (
                          <>
                            <span aria-hidden>·</span>
                            <span>Free preview</span>
                          </>
                        )}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))
      )}
    </>
  );
}
