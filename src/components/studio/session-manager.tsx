'use client';

import { Ban, CalendarClock, Check, ClipboardList, Video } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input } from '@/components/ui/field';
import { attachRecording, cancelSession, rescheduleSession } from '@/lib/actions/studio';
import { formatWhen } from '@/lib/format';
import type { StudioSession } from '@/lib/data/studio';

/**
 * Class admin: attach a recording, move one class, or cancel with a reason.
 *
 * All three write through SECURITY DEFINER functions that re-check ownership,
 * so an educator cannot touch another educator's class even by editing the id
 * in the request. The UI is a convenience over that, never the control.
 *
 * Moving affects ONE occurrence. Shifting the recurring pattern would move every
 * future class on that weekday, which is the mistake worth designing out.
 */

const STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'gray' | 'error' }> = {
  scheduled: { label: 'Scheduled', variant: 'warning' },
  live: { label: 'Live', variant: 'error' },
  ended: { label: 'Ended', variant: 'gray' },
  cancelled: { label: 'Cancelled', variant: 'gray' },
};

export function SessionManager({ sessions }: { sessions: StudioSession[] }) {
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const [driveUrl, setDriveUrl] = useState('');
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [moveFor, setMoveFor] = useState<string | null>(null);
  const [newStart, setNewStart] = useState('');
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  function attach(sessionId: string) {
    startTransition(async () => {
      const result = await attachRecording(sessionId, driveUrl);
      setFeedback(result);
      if (result.ok) {
        setOpenId(null);
        setDriveUrl('');
      }
    });
  }

  function cancel(sessionId: string) {
    startTransition(async () => {
      const result = await cancelSession(sessionId, reason);
      setFeedback(result);
      if (result.ok) {
        setReasonFor(null);
        setReason('');
      }
    });
  }

  function move(sessionId: string) {
    startTransition(async () => {
      const result = await rescheduleSession(sessionId, newStart, reason);
      setFeedback(result);
      if (result.ok) {
        setMoveFor(null);
        setNewStart('');
        setReason('');
      }
    });
  }

  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={Video}
        title="No classes yet"
        description="Create a schedule and your classes appear here, ready for recordings once they finish."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {feedback && (
        <p
          className={
            feedback.ok
              ? 'border-success-border bg-success-bg text-success rounded-xl border p-3 text-[13px]'
              : 'border-error-border bg-error-bg text-error rounded-xl border p-3 text-[13px]'
          }
          role={feedback.ok ? 'status' : 'alert'}
        >
          {feedback.message}
        </p>
      )}

      <ul className="divide-line flex flex-col divide-y">
        {sessions.map((session) => {
          const status = STATUS[session.status] ?? { label: session.status, variant: 'gray' as const };
          const finished = new Date(session.endsAt) < new Date();

          return (
            <li key={session.id} className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-ink font-semibold">{session.title}</p>
                  <p className="text-ink-muted mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px]">
                    <span>{session.courseTitle ?? 'Live class'}</span>
                    <span aria-hidden>·</span>
                    <span>{formatWhen(session.startsAt)}</span>
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Badge variant={status.variant}>{status.label}</Badge>
                  {session.recordingDriveId && <Badge variant="success">Recording up</Badge>}

                  {/* Shown from the moment the room can open, not only once the
                      class has ended — during a live class "who is here?" is the
                      question, and afterwards it becomes "who missed it?". */}
                  {session.status !== 'cancelled' && (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/studio/live/${session.id}`}>
                        <ClipboardList className="size-4" aria-hidden /> Attendance
                      </Link>
                    </Button>
                  )}

                  {finished && session.status !== 'cancelled' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setOpenId(openId === session.id ? null : session.id)}
                    >
                      <Video className="size-4" aria-hidden />
                      {session.recordingDriveId ? 'Replace' : 'Add recording'}
                    </Button>
                  )}

                  {!finished && session.status !== 'cancelled' && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setMoveFor(moveFor === session.id ? null : session.id)}
                      >
                        <CalendarClock className="size-4" aria-hidden /> Move
                      </Button>
                      <Button
                        size="sm"
                        variant="danger-outline"
                        onClick={() => setReasonFor(reasonFor === session.id ? null : session.id)}
                      >
                        <Ban className="size-4" aria-hidden /> Cancel
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {openId === session.id && (
                <div className="bg-hover flex flex-col gap-3 rounded-xl p-3.5 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <Field
                      label="Drive link to the recording"
                      htmlFor={`rec-${session.id}`}
                      hint="Enrolled students are notified as soon as you attach it."
                    >
                      <Input
                        id={`rec-${session.id}`}
                        value={driveUrl}
                        onChange={(e) => setDriveUrl(e.target.value)}
                        placeholder="https://drive.google.com/file/d/…/view"
                      />
                    </Field>
                  </div>
                  <Button size="sm" loading={pending} onClick={() => attach(session.id)}>
                    <Check className="size-4" aria-hidden /> Attach
                  </Button>
                </div>
              )}

              {moveFor === session.id && (
                <div className="bg-hover flex flex-col gap-3 rounded-xl p-3.5">
                  <p className="text-ink-secondary text-[12.5px] leading-relaxed">
                    This moves <strong>only this class</strong>. The recurring pattern is untouched, so every
                    other class stays where it is.
                  </p>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <Field label="New date and time (IST)" htmlFor={`when-${session.id}`}>
                        <Input
                          id={`when-${session.id}`}
                          type="datetime-local"
                          value={newStart}
                          onChange={(e) => setNewStart(e.target.value)}
                        />
                      </Field>
                    </div>
                    <div className="flex-1">
                      <Field label="Reason for students" htmlFor={`movewhy-${session.id}`}>
                        <Input
                          id={`movewhy-${session.id}`}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Clashes with the university exam"
                        />
                      </Field>
                    </div>
                    <Button
                      size="sm"
                      loading={pending}
                      disabled={!newStart || reason.trim().length < 5}
                      onClick={() => move(session.id)}
                    >
                      <Check className="size-4" aria-hidden /> Move class
                    </Button>
                  </div>
                </div>
              )}

              {reasonFor === session.id && (
                <div className="bg-error-bg flex flex-col gap-3 rounded-xl p-3.5 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <Field
                      label="Why is this class cancelled?"
                      htmlFor={`cancel-${session.id}`}
                      hint="Sent to every enrolled student. At least a few words."
                    >
                      <Input
                        id={`cancel-${session.id}`}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Rescheduled to Saturday due to a clash"
                      />
                    </Field>
                  </div>
                  <Button
                    size="sm"
                    variant="danger"
                    loading={pending}
                    disabled={reason.trim().length < 5}
                    onClick={() => cancel(session.id)}
                  >
                    Cancel class
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
