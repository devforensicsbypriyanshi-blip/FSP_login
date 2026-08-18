'use client';

import { CalendarDays, Check, Clock, CreditCard, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input, Textarea } from '@/components/ui/field';
import { bookSlot } from '@/lib/actions/mentorship';
import { formatDayMonth, formatTime } from '@/lib/format';
import { cn, formatINR } from '@/lib/utils';
import type { Mentor, Slot } from '@/lib/data/mentorship';

/**
 * Mentor first, then a time.
 *
 * Slots belong to a person, so picking a time before a mentor was meaningless —
 * that was the second of two client-reported problems with the original mock,
 * and it survives here because the shape was right.
 *
 * The first was that "Selected Slot" rendered a hardcoded date before anything
 * was chosen, so the booking looked pre-filled and a careless tap would confirm
 * a slot nobody picked. Selection starts empty and Confirm stays disabled.
 *
 * What is new is that the slots are real, and so is the race. Two students can
 * tap the same one within a second; the database settles it with a single
 * guarded UPDATE and the loser gets told plainly rather than seeing a spinner
 * and then somebody else's booking.
 */
export function BookingFlow({ mentors, slots }: { mentors: Mentor[]; slots: Slot[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mentorId, setMentorId] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [topic, setTopic] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string>();

  const mentorSlots = mentorId ? slots.filter((slot) => slot.educatorId === mentorId) : [];
  const selected = mentorSlots.find((slot) => slot.id === slotId) ?? null;

  function confirm() {
    if (!selected) return;
    setError(undefined);

    startTransition(async () => {
      const result = await bookSlot(selected.id, topic, notes);

      if (!result.ok) {
        setError(result.message);
        // The slot list is stale the moment somebody else takes one, so refresh
        // rather than leaving a button that will fail again identically.
        setSlotId(null);
        router.refresh();
        return;
      }

      // A paid slot is held for fifteen minutes, not booked. Sending the
      // student straight to checkout is the difference between a hold that
      // becomes a session and one that quietly expires.
      if (result.orderId) router.push(`/app/orders/${result.orderId}`);
      else router.refresh();
    });
  }

  if (mentors.length === 0) {
    return (
      <EmptyState
        icon={UserRound}
        title="No mentors are available right now"
        description="Sessions open up as educators publish their availability. Check back in a day or two."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p
          className="border-error-border bg-error-bg text-error rounded-xl border p-3 text-[13px]"
          role="alert"
        >
          {error}
        </p>
      )}

      <Card className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs">
        <CardHeader>
          <CardTitle className="text-[#1D1A39] text-sm font-bold">1 · Choose an Expert Mentor</CardTitle>
          <UserRound className="text-[#451952] size-4.5" aria-hidden />
        </CardHeader>

        <ul className="grid gap-3 sm:grid-cols-2 mt-3">
          {mentors.map((mentor) => (
            <li key={mentor.id}>
              <button
                type="button"
                aria-pressed={mentorId === mentor.id}
                onClick={() => {
                  setMentorId(mentor.id);
                  setSlotId(null);
                }}
                className={cn(
                  'flex w-full items-start gap-3.5 rounded-2xl border p-4 text-left transition-all',
                  mentorId === mentor.id
                    ? 'border-[#451952] bg-[#FAF8F7] ring-2 ring-[#451952]/20 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                )}
              >
                <Avatar name={mentor.name} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-[#1D1A39] font-bold text-sm">{mentor.name}</p>
                    {mentorId === mentor.id && (
                      <Badge variant="purple" className="text-[10px]">Selected</Badge>
                    )}
                  </div>
                  {mentor.headline && (
                    <p className="text-slate-500 line-clamp-2 text-xs leading-relaxed mt-0.5">
                      {mentor.headline}
                    </p>
                  )}
                  <p className="text-[#451952] font-semibold mt-1.5 text-xs">
                    {mentor.openSlots} open slot{mentor.openSlots === 1 ? '' : 's'} ·{' '}
                    {mentor.fromPrice > 0 ? `from ${formatINR(mentor.fromPrice)}` : 'free'}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      {mentorId && (
        <Card className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs">
          <CardHeader>
            <CardTitle className="text-[#1D1A39] text-sm font-bold">2 · Pick an Available Time Slot</CardTitle>
            <Badge variant="gray">IST</Badge>
          </CardHeader>

          {mentorSlots.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Nothing open for this mentor"
              description="Choose another mentor, or come back when they publish more availability."
            />
          ) : (
            <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 mt-3">
              {mentorSlots.map((slot) => (
                <li key={slot.id}>
                  <button
                    type="button"
                    aria-pressed={slotId === slot.id}
                    onClick={() => setSlotId(slot.id)}
                    className={cn(
                      'w-full rounded-xl border p-3.5 text-left transition-all',
                      slotId === slot.id
                        ? 'border-[#451952] bg-[#FAF8F7] ring-2 ring-[#451952]/20 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[#1D1A39] text-[13px] font-bold">{formatDayMonth(slot.startsAt)}</p>
                      {slotId === slot.id && <Check className="size-3.5 text-[#451952]" />}
                    </div>
                    <p className="text-slate-500 flex items-center gap-1 text-xs mt-0.5">
                      <Clock className="size-3.5" aria-hidden />
                      {formatTime(slot.startsAt)} – {formatTime(slot.endsAt)}
                    </p>
                    <p className="text-[#451952] mt-1.5 text-xs font-bold">
                      {slot.priceInr > 0 ? formatINR(slot.priceInr) : 'Free'}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {selected && (
        <Card className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs">
          <CardHeader>
            <CardTitle className="text-[#1D1A39] text-sm font-bold">3 · Session Details &amp; Confirmation</CardTitle>
            {selected.priceInr > 0 && (
              <Badge variant="amber">
                <CreditCard className="size-3.5" aria-hidden /> ₹{selected.priceInr} · Payment Required
              </Badge>
            )}
          </CardHeader>

          <div className="flex flex-col gap-4 mt-3">
            <div className="bg-[#FAF8F7] border border-[#e6e0df] rounded-xl p-4">
              <p className="text-[#1D1A39] font-bold text-sm">
                {selected.educatorName} · {formatDayMonth(selected.startsAt)}
              </p>
              <p className="text-slate-600 text-xs mt-0.5">
                {formatTime(selected.startsAt)} – {formatTime(selected.endsAt)} IST ·{' '}
                {selected.priceInr > 0 ? formatINR(selected.priceInr) : 'Free Session'}
              </p>
              {selected.topicHint && (
                <p className="text-[#451952] font-medium mt-1 text-xs">{selected.topicHint}</p>
              )}
            </div>

            <Field label="What do you want to cover?" htmlFor="topic">
              <Input
                id="topic"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="e.g. Paper 2 strategy for the December attempt"
                className="rounded-xl border-slate-200 focus:border-[#451952]"
              />
            </Field>

            <Field
              label="Anything else they should know?"
              htmlFor="notes"
              hint="Optional. Your mentor reads this before the session."
            >
              <Textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Share any specific doubts, previous scores, or preparation hurdles..."
                className="rounded-xl border-slate-200 focus:border-[#451952]"
              />
            </Field>

            {selected.priceInr > 0 && (
              <p className="text-slate-500 text-xs leading-relaxed">
                The slot is held for you for <strong>15 minutes</strong> while payment completes.
              </p>
            )}

            <Button
              size="sm"
              className="self-start bg-[#1D1A39] hover:bg-[#2A244E] text-white font-semibold rounded-xl px-5 py-2.5 shadow-2xs"
              loading={pending}
              onClick={confirm}
            >
              <Check className="size-4" aria-hidden />
              {selected.priceInr > 0 ? `Hold and pay ${formatINR(selected.priceInr)}` : 'Confirm booking'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
