import { BookOpen, TrendingUp, UserX, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { KpiCard } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Progress } from '@/components/ui/progress';
import { getCourseStats } from '@/lib/data/analytics';

export const metadata = { title: 'Student Analytics' };

/**
 * Course engagement for the educator.
 *
 * The headline number is "never started", not average progress. An average of
 * 60% can mean everyone is a bit over halfway, or that half the cohort finished
 * and half never opened the course — and only the second is something teaching
 * can fix. Showing both makes the distribution visible.
 */
export default async function StudioAnalyticsPage() {
  const courses = await getCourseStats();

  const totalStudents = courses.reduce((n, c) => n + c.students, 0);
  const totalNeverStarted = courses.reduce((n, c) => n + c.neverStarted, 0);
  const withStudents = courses.filter((c) => c.students > 0);
  const meanProgress =
    withStudents.length > 0
      ? Math.round(withStudents.reduce((n, c) => n + c.averageProgress, 0) / withStudents.length)
      : 0;

  return (
    <>
      <PageHeader
        title="Student analytics"
        description="Who is keeping up, and more usefully, who never started."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Enrolled students"
          value={String(totalStudents)}
          trend={`Across ${courses.length} ${courses.length === 1 ? 'course' : 'courses'}`}
          icon={<Users className="size-5" aria-hidden />}
          tone="bg-primary-light text-primary"
        />
        <KpiCard
          label="Average progress"
          value={`${meanProgress}%`}
          trend="Mean across courses"
          icon={<TrendingUp className="size-5" aria-hidden />}
          tone="bg-success-bg text-success"
        />
        <KpiCard
          label="Never started"
          value={String(totalNeverStarted)}
          trend="Zero lessons opened"
          icon={<UserX className="size-5" aria-hidden />}
          tone={totalNeverStarted > 0 ? 'bg-warning-bg text-warning' : 'bg-success-bg text-success'}
        />
        <KpiCard
          label="Courses"
          value={String(courses.length)}
          trend={`${courses.reduce((n, c) => n + c.lessons, 0)} lessons total`}
          icon={<BookOpen className="size-5" aria-hidden />}
          tone="bg-info-bg text-info"
        />
      </div>

      {courses.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Nothing to measure yet"
          description="Once students are enrolled in a course, their progress appears here."
        />
      ) : (
        courses.map((course) => (
          <Card key={course.courseId}>
            <CardHeader>
              <CardTitle>{course.title}</CardTitle>
              <div className="flex gap-1.5">
                <Badge variant="gray">{course.students} enrolled</Badge>
                {course.neverStarted > 0 && (
                  <Badge variant="warning">{course.neverStarted} never started</Badge>
                )}
              </div>
            </CardHeader>

            {course.students === 0 ? (
              <p className="text-ink-muted text-[13px]">Nobody is enrolled in this course yet.</p>
            ) : (
              <div className="flex flex-col gap-4">
                <Progress
                  value={course.averageProgress}
                  label={`Average completion · ${course.averageProgress}%`}
                />

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="border-line-medium rounded-xl border p-3">
                    <p className="text-ink-muted text-[11px] font-semibold tracking-wide uppercase">
                      Started
                    </p>
                    <p className="font-display text-ink mt-1 text-lg font-bold">
                      {course.students - course.neverStarted}
                    </p>
                  </div>
                  <div className="border-line-medium rounded-xl border p-3">
                    <p className="text-ink-muted text-[11px] font-semibold tracking-wide uppercase">
                      Never opened
                    </p>
                    <p className="font-display text-warning mt-1 text-lg font-bold">{course.neverStarted}</p>
                  </div>
                  <div className="border-line-medium rounded-xl border p-3">
                    <p className="text-ink-muted text-[11px] font-semibold tracking-wide uppercase">
                      Upcoming classes
                    </p>
                    <p className="font-display text-ink mt-1 text-lg font-bold">{course.upcomingClasses}</p>
                  </div>
                </div>

                {course.neverStarted > 0 && (
                  <p className="border-warning-border bg-warning-bg text-warning rounded-xl border p-3 text-[12.5px] leading-relaxed">
                    <strong>{course.neverStarted}</strong> enrolled{' '}
                    {course.neverStarted === 1 ? 'student has' : 'students have'} never opened a lesson. That
                    is the group most likely to drift away, and the cheapest one to win back.
                  </p>
                )}
              </div>
            )}
          </Card>
        ))
      )}

      <p className="text-ink-light text-center text-[12px] leading-relaxed">
        Progress is lesson-level. Google Drive&rsquo;s player is cross-origin and reports no playback events,
        so watch time is not measurable — a lesson counts once a student marks it complete.
      </p>
    </>
  );
}
