import { BookOpen, PlayCircle, Radio } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Progress } from '@/components/ui/progress';
import { getMyCourses, type EnrolledCourse } from '@/lib/data/courses';
import { formatWhen } from '@/lib/format';
import { getSessionContext } from '@/lib/session/server';

export const metadata = { title: 'My Learning' };

/**
 * Client feedback (2026-08-06): make the display logic explicit for every
 * combination a student can be in.
 *
 *   zero courses            -> empty state with a route into the catalogue
 *   only recorded courses   -> no "live" grouping at all, no empty live section
 *   only live courses       -> live batches first, next-class time on the card
 *   mixed                   -> live batches first, then self-paced
 *
 * The two course types genuinely differ, so they read differently: a live batch
 * card answers "when is my next class", a recorded card answers "where did I
 * leave off". Showing progress on a live batch would be misleading, because the
 * schedule sets the pace, not the student.
 *
 * "Live" is derived, not stored: a course counts as live when it has a future
 * session on the calendar. That way a batch that has finished its last class
 * quietly becomes self-paced instead of advertising a class that never comes.
 */

/**
 * Banner gradients cycle by index. Full class strings, never interpolated —
 * Tailwind scans source statically, so a built-up class name emits no CSS.
 */
const GRADIENTS = [
  'from-navy-deep to-wine',
  'from-navy to-rose',
  'from-wine to-navy',
  'from-rose to-navy-deep',
];

function CourseCard({ course, index }: { course: EnrolledCourse; index: number }) {
  const gradient = GRADIENTS[index % GRADIENTS.length];

  return (
    <Card hover className="flex flex-col gap-4">
      <div
        className={`flex h-36 flex-col justify-between rounded-xl bg-gradient-to-br ${gradient} p-4 text-white md:h-40`}
      >
        <div className="flex items-start justify-between gap-2">
          <Badge className="bg-white/20 text-white">{course.category ?? 'Course'}</Badge>
          {course.isLive && (
            <Badge variant="error" dot pulse className="bg-white/20 text-white">
              Live batch
            </Badge>
          )}
        </div>
        <h2 className="font-display text-base leading-snug font-bold text-balance md:text-[17px]">
          {course.title}
        </h2>
      </div>

      {course.isLive ? (
        <>
          <div className="flex flex-col gap-1 text-[13px]">
            {course.batchName && <span className="text-ink-muted">{course.batchName}</span>}
            {course.nextSessionAt && (
              <span className="text-primary font-semibold">
                Next class · {formatWhen(course.nextSessionAt)}
              </span>
            )}
          </div>
          {course.lessonsTotal > 0 && (
            <p className="text-ink-muted text-[12.5px]">
              {course.lessonsDone} of {course.lessonsTotal} lessons completed
            </p>
          )}
          <div className="mt-auto flex gap-2">
            <Button asChild className="flex-1">
              <Link href="/app/live">
                <Radio className="size-4" aria-hidden /> Go to classroom
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/app/learning/${course.slug}`}>Recordings</Link>
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-ink-muted text-[12.5px]">
            {course.subtitle ?? `${course.lessonsTotal} lessons`}
          </p>
          <Progress value={course.progress} label="Course progress" />
          <Button asChild className="mt-auto">
            <Link href={`/app/learning/${course.slug}`}>
              <PlayCircle className="size-4" aria-hidden />
              {course.lessonsDone > 0 ? 'Resume' : 'Start course'}
            </Link>
          </Button>
        </>
      )}
    </Card>
  );
}

export default async function LearningPage() {
  const session = await getSessionContext();
  const courses = session ? await getMyCourses(session.userId) : [];

  const live = courses.filter((c) => c.isLive);
  const recorded = courses.filter((c) => !c.isLive);

  if (courses.length === 0) {
    return (
      <>
        <PageHeader title="My courses" description="Everything you're enrolled in." />
        <EmptyState
          icon={BookOpen}
          title="You're not enrolled in anything yet"
          description="Once you join a batch or buy a course it will appear here, with your next class and progress."
        >
          <Button asChild size="sm">
            <Link href="/app/store">Browse courses</Link>
          </Button>
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="My courses"
        description={`${live.length} live ${live.length === 1 ? 'batch' : 'batches'} · ${recorded.length} self-paced`}
      />

      {/* Live batches first — they have a schedule the student can miss. */}
      {live.length > 0 && (
        <section>
          <h2 className="text-ink-muted mb-3 text-[11.5px] font-semibold tracking-wide uppercase">
            Live batches
          </h2>
          <div className="grid gap-5 sm:grid-cols-2">
            {live.map((c, i) => (
              <CourseCard key={c.id} course={c} index={i} />
            ))}
          </div>
        </section>
      )}

      {/* Rendered only when non-empty — no hollow "0 courses" section. */}
      {recorded.length > 0 && (
        <section>
          <h2 className="text-ink-muted mb-3 text-[11.5px] font-semibold tracking-wide uppercase">
            Self-paced
          </h2>
          <div className="grid gap-5 sm:grid-cols-2">
            {recorded.map((c, i) => (
              <CourseCard key={c.id} course={c} index={live.length + i} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
