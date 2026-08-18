'use client';

import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  FileText,
  ListVideo,
  Lock,
  PlayCircle,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { markLessonOpened, setLessonCompleted } from '@/lib/actions/progress';

import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { CourseDetail, CourseLesson } from '@/lib/data/courses';

/**
 * Course player.
 *
 * Layout follows what people actually do on each device:
 *   ≥ lg  player left, lesson list pinned right — you scan the syllabus while
 *         watching, which is how a desktop learner works
 *   < lg  player first, list behind a button — a 360px screen cannot show both,
 *         and the video is what they came for
 *
 * The video itself is a Drive /preview iframe. It is cross-origin, so we get no
 * playback events at all: no watch time, no resume point, no completion signal.
 * Hence the explicit "Mark complete" button. An automatic mark based on elapsed
 * wall-clock time would be a guess dressed up as data.
 */

function LessonRow({
  lesson,
  active,
  locked,
  onSelect,
}: {
  lesson: CourseLesson;
  active: boolean;
  locked: boolean;
  onSelect: () => void;
}) {
  const Icon = lesson.completed ? CheckCircle2 : locked ? Lock : lesson.kind === 'pdf' ? FileText : Circle;

  return (
    <button
      onClick={onSelect}
      disabled={locked}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'group flex min-h-[48px] w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-200',
        active
          ? 'bg-primary-light text-primary ring-primary/20 shadow-sm ring-1'
          : 'text-ink-secondary hover:bg-hover',
        locked && 'cursor-not-allowed opacity-50'
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 size-5 shrink-0 transition-colors',
          lesson.completed && !active && 'text-success',
          active && !lesson.completed && 'text-primary'
        )}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block text-[13.5px] leading-snug',
            active ? 'text-primary font-bold' : 'group-hover:text-ink font-medium'
          )}
        >
          {lesson.title}
        </span>
        <span className={cn('mt-0.5 block text-[12px]', active ? 'text-primary/70' : 'text-ink-muted')}>
          {locked ? 'Enrol to unlock' : formatDuration(lesson.durationSec)}
        </span>
      </span>
    </button>
  );
}

export function CoursePlayer({
  course,
  initialLessonId,
}: {
  course: CourseDetail;
  initialLessonId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [listOpen, setListOpen] = useState(false);

  const flat = course.modules.flatMap((m) => m.lessons);
  const [currentId, setCurrentId] = useState(initialLessonId ?? flat[0]?.id ?? null);

  const index = flat.findIndex((l) => l.id === currentId);
  const current = index >= 0 ? (flat[index] ?? null) : null;
  const previous = index > 0 ? (flat[index - 1] ?? null) : null;
  const next = index >= 0 && index < flat.length - 1 ? (flat[index + 1] ?? null) : null;
  const locked = (lesson: CourseLesson) => !course.enrolled && !lesson.isPreview;

  // Record the open as a side effect of showing it, not of clicking: arriving
  // by deep link counts too, and it is the same event either way.
  useEffect(() => {
    if (!current || locked(current)) return;
    void markLessonOpened(current.id, course.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, course.id]);

  function select(lesson: CourseLesson) {
    if (locked(lesson)) return;
    setCurrentId(lesson.id);
    setListOpen(false);
    // Shallow URL update so the lesson is linkable and Back works, without
    // re-running the server component for a change the client already made.
    window.history.replaceState(null, '', `?lesson=${lesson.id}`);
  }

  function toggleComplete() {
    if (!current) return;
    startTransition(async () => {
      await setLessonCompleted(current.id, course.id, !current.completed);
      router.refresh();
    });
  }

  const lessonList = (
    <div className="flex flex-col gap-5">
      {course.modules.map((module) => (
        <section key={module.id}>
          <h3 className="text-ink-muted mb-1.5 px-3 text-[11px] font-semibold tracking-wide uppercase">
            {module.title}
          </h3>
          <div className="flex flex-col gap-0.5">
            {module.lessons.map((lesson) => (
              <LessonRow
                key={lesson.id}
                lesson={lesson}
                active={lesson.id === currentId}
                locked={locked(lesson)}
                onSelect={() => select(lesson)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
      {/* ---------------- Player ---------------- */}
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        {/* Video Container */}
        <div className="bg-navy-deep ring-line/10 relative aspect-video w-full overflow-hidden rounded-[24px] shadow-lg ring-1">
          {current && !locked(current) && current.driveFileId ? (
            <iframe
              key={current.id}
              src={`/api/media/lesson/${current.id}`}
              title={current.title}
              allow="autoplay; encrypted-media"
              allowFullScreen
              className="size-full border-0 bg-black"
            />
          ) : (
            <div className="text-ink-inverse/80 from-navy-deep to-navy flex size-full flex-col items-center justify-center gap-4 bg-gradient-to-br px-6 text-center">
              {current && locked(current) ? (
                <>
                  <div className="rounded-full bg-white/10 p-4 backdrop-blur-md">
                    <Lock className="size-8" aria-hidden />
                  </div>
                  <div className="max-w-xs space-y-1">
                    <p className="font-display text-lg font-bold text-white">Course locked</p>
                    <p className="text-[14px]">
                      Enrol in this course to unlock this lesson and all associated materials.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-full bg-white/10 p-4 backdrop-blur-md">
                    <PlayCircle className="size-8" aria-hidden />
                  </div>
                  <div className="max-w-xs space-y-1">
                    <p className="font-display text-lg font-bold text-white">No video attached</p>
                    <p className="text-[14px]">This lesson does not have a video recording available yet.</p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Video Metadata & Controls */}
        <div className="flex flex-col gap-5 px-1 md:px-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <Badge variant="purple" className="mb-3 border-none shadow-sm">
                Module {index + 1}
              </Badge>
              <h1 className="font-display text-ink text-xl leading-tight font-bold text-balance md:text-[28px]">
                {current?.title ?? course.title}
              </h1>
              <p className="text-ink-secondary mt-2 text-[14px] font-medium">
                {course.title}
                {current && (
                  <span className="text-ink-muted">
                    {' '}
                    &bull; Lesson {index + 1} of {flat.length}
                  </span>
                )}
              </p>
            </div>

            {current && !locked(current) && (
              <Button
                size="md"
                variant={current.completed ? 'outline' : 'success'}
                loading={pending}
                onClick={toggleComplete}
                className={cn(
                  'gap-2 rounded-xl px-5 text-[14px] shadow-sm',
                  current.completed ? 'text-success border-success/30 bg-success/5 hover:bg-success/10' : ''
                )}
              >
                <CheckCircle2
                  className={cn('size-[18px]', current.completed ? 'text-success' : '')}
                  aria-hidden
                />
                {current.completed ? 'Completed' : 'Mark Complete'}
              </Button>
            )}
          </div>

          {current?.description && (
            <div className="bg-surface border-line-medium mt-2 rounded-2xl border p-5 shadow-sm">
              <h3 className="font-display text-ink mb-2 text-sm font-bold">Lesson Description</h3>
              <p className="text-ink-secondary text-[14px] leading-relaxed">{current.description}</p>
            </div>
          )}

          {/* Navigation Controls */}
          <div className="border-line-medium mt-2 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
            <Button
              variant="outline"
              size="md"
              disabled={!previous}
              onClick={() => previous && select(previous)}
              className="border-line-medium text-ink-secondary hover:text-ink gap-2 rounded-xl bg-white px-4 shadow-sm"
            >
              <ChevronLeft className="size-4" aria-hidden /> Previous
            </Button>

            <Button
              variant="outline"
              size="md"
              className="border-line-medium text-ink gap-2 rounded-xl bg-white px-5 shadow-sm lg:hidden"
              onClick={() => setListOpen(true)}
              aria-expanded={listOpen}
            >
              <ListVideo className="text-primary size-[18px]" aria-hidden /> View all lessons
            </Button>

            <Button
              size="md"
              disabled={!next}
              onClick={() => next && select(next)}
              className="gap-2 rounded-xl px-5 shadow-sm"
            >
              Next <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      </div>

      {/* ---------------- Lesson list: sidebar on desktop ---------------- */}
      <aside className="border-line-medium bg-surface hidden w-[360px] shrink-0 flex-col rounded-[24px] border p-5 shadow-sm lg:flex">
        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-display text-ink text-base font-bold">Course content</h2>
            <Badge variant="purple" className="border-none shadow-sm">
              {flat.length} Lessons
            </Badge>
          </div>
          <div className="space-y-2">
            <div className="text-ink-secondary flex justify-between text-[13px] font-medium">
              <span>Progress</span>
              <span>
                {course.lessonsDone} of {course.lessonsTotal} done
              </span>
            </div>
            <Progress value={course.progress} className="h-2" />
          </div>
        </div>
        <div className="custom-scrollbar max-h-[calc(100dvh-16rem)] overflow-y-auto pr-1">{lessonList}</div>
      </aside>

      {/* ---------------- Lesson list: sheet on mobile ---------------- */}
      {listOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="bg-ink-inverse/40 absolute inset-0 backdrop-blur-sm transition-opacity"
            onClick={() => setListOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Course content"
            className="bg-surface absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-[32px] p-5 shadow-2xl transition-transform"
          >
            <div className="mb-5 flex items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-ink text-lg font-bold">Course content</h2>
                <p className="text-ink-muted mt-0.5 text-[13px]">
                  {course.lessonsDone} of {course.lessonsTotal} lessons done
                </p>
              </div>
              <button
                onClick={() => setListOpen(false)}
                aria-label="Close lesson list"
                className="text-ink hover:bg-hover bg-app grid size-10 place-items-center rounded-full transition-colors"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="overflow-y-auto pb-6">{lessonList}</div>
          </div>
        </div>
      )}
    </div>
  );
}
