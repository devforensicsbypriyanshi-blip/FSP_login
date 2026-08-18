import { BookOpen, Users } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { getStudioCourses } from '@/lib/data/studio';
import { formatDate } from '@/lib/format';

export const metadata = { title: 'Courses' };

const STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'gray' | 'info' }> = {
  published: { label: 'Published', variant: 'success' },
  pending_review: { label: 'In review', variant: 'warning' },
  draft: { label: 'Draft', variant: 'gray' },
  archived: { label: 'Archived', variant: 'gray' },
};

export default async function StudioCoursesPage() {
  const courses = await getStudioCourses();

  return (
    <>
      <PageHeader
        title="Courses & lectures"
        description="Add lessons, attach Drive recordings and publish when a course is ready."
      />

      {courses.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No courses yet"
          description="Courses are created by an admin. Once one is assigned to you it appears here, ready for lessons."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {courses.map((course) => {
            const status = STATUS[course.status] ?? { label: course.status, variant: 'gray' as const };

            return (
              <Card key={course.id} hover className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-display text-ink min-w-0 text-[15px] leading-snug font-bold text-balance">
                    {course.title}
                  </h2>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </div>

                {course.subtitle && (
                  <p className="text-ink-muted text-[12.5px] leading-relaxed">{course.subtitle}</p>
                )}

                <p className="text-ink-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                  <span className="flex items-center gap-1">
                    <BookOpen className="size-3.5" aria-hidden /> {course.lessonCount} lessons
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="size-3.5" aria-hidden /> {course.studentCount} students
                  </span>
                </p>

                <p className="text-ink-light text-[11.5px]">Updated {formatDate(course.updatedAt)}</p>

                <Button asChild size="sm" className="mt-auto self-start">
                  <Link href={`/studio/courses/${course.id}`}>Manage lessons</Link>
                </Button>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
