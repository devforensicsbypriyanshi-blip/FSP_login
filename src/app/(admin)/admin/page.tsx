import { AlertTriangle, BookOpen, CalendarDays, GraduationCap, Inbox, Mail, Users } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { KpiCard } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { getCourseStats, getPlatformStats } from '@/lib/data/analytics';

export const metadata = { title: 'Overview' };

/**
 * Admin overview.
 *
 * Every figure is counted from the database. The temptation on a dashboard is
 * to fill it with impressive derived metrics; at 200 students the useful
 * numbers are small and literal — how many people, how many enrolled, what is
 * waiting for a human.
 *
 * Revenue is absent on purpose: payments ship disabled, so a revenue tile would
 * read ₹0 and mean nothing.
 */
export default async function AdminOverviewPage() {
  const [stats, courses] = await Promise.all([getPlatformStats(), getCourseStats()]);

  const emailPct = Math.round((stats.emailsToday / stats.emailCap) * 100);
  const needsAttention = courses.filter((c) => c.students > 0 && c.neverStarted > 0);

  return (
    <>
      <PageHeader
        title="Platform overview"
        description="Everything counted from the live database, not estimated."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Students"
          value={String(stats.students)}
          trend={`${stats.signupsThisWeek} joined this week`}
          icon={<Users className="size-5" aria-hidden />}
          tone="bg-primary-light text-primary"
        />
        <KpiCard
          label="Active enrolments"
          value={String(stats.activeEnrolments)}
          trend={`Across ${stats.publishedCourses} published courses`}
          icon={<GraduationCap className="size-5" aria-hidden />}
          tone="bg-success-bg text-success"
        />
        <KpiCard
          label="Upcoming classes"
          value={String(stats.upcomingClasses)}
          trend="Scheduled from now on"
          icon={<CalendarDays className="size-5" aria-hidden />}
          tone="bg-info-bg text-info"
        />
        <KpiCard
          label="Open tickets"
          value={String(stats.openTickets)}
          trend="Waiting on support"
          icon={<Inbox className="size-5" aria-hidden />}
          tone={stats.openTickets > 0 ? 'bg-warning-bg text-warning' : 'bg-success-bg text-success'}
        />
      </div>

      {/* The cap that actually binds — 100/day, not 3,000/month. */}
      <Card>
        <CardHeader>
          <CardTitle>Email quota today</CardTitle>
          <Badge variant={emailPct >= 80 ? 'error' : emailPct >= 50 ? 'warning' : 'success'}>
            {stats.emailsToday} / {stats.emailCap}
          </Badge>
        </CardHeader>

        <div className="bg-hover h-2 w-full overflow-hidden rounded-full">
          <div
            className={
              emailPct >= 80 ? 'bg-error h-full' : emailPct >= 50 ? 'bg-warning h-full' : 'bg-success h-full'
            }
            style={{ width: `${Math.min(100, emailPct)}%` }}
          />
        </div>

        <p className="text-ink-muted mt-3 flex items-start gap-2 text-[12.5px] leading-relaxed">
          <Mail className="mt-px size-3.5 shrink-0" aria-hidden />
          Resend&rsquo;s free plan allows 100 a day. One class reminder to {stats.students || 200} students
          exceeds that on its own, which is why reminders batch and sign-in codes are always allowed through.
        </p>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Courses</CardTitle>
          <Badge variant="gray">{courses.length}</Badge>
        </CardHeader>

        {courses.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No courses yet"
            description="Once a course exists here you'll see enrolment and progress against it."
          />
        ) : (
          <ul className="divide-line flex flex-col divide-y">
            {courses.map((course) => (
              <li
                key={course.courseId}
                className="flex flex-col gap-2 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-ink text-[13.5px] font-semibold">{course.title}</p>
                  <p className="text-ink-muted mt-0.5 text-[12px]">
                    {course.students} students · {course.lessons} lessons · {course.upcomingClasses} upcoming
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {/* Average alone hides the split between "finished" and
                      "never opened", so both are shown. */}
                  <Badge variant="gray">{course.averageProgress}% avg</Badge>
                  {course.neverStarted > 0 && (
                    <Badge variant="warning">{course.neverStarted} never started</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {needsAttention.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Worth a nudge</CardTitle>
            <AlertTriangle className="text-warning size-[18px]" aria-hidden />
          </CardHeader>
          <p className="text-ink-secondary text-[13.5px] leading-relaxed">
            {needsAttention.reduce((n, c) => n + c.neverStarted, 0)} enrolled students have not opened a
            single lesson. They paid or were granted access and then stopped — the cheapest retention win on
            the platform is an email to exactly those people.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-4 self-start">
            <Link href="/admin/enrollments">Review enrolments</Link>
          </Button>
        </Card>
      )}
    </>
  );
}
