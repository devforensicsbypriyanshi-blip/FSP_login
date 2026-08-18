'use client';

import { CalendarPlus, Plus, X } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { createSlots } from '@/lib/actions/mentorship';
import type { Slot } from '@/lib/data/mentorship';
import { formatDayMonth, formatTime } from '@/lib/format';
import { formatINR } from '@/lib/utils';

/**
 * Publish availability.
 *
 * Times are entered as `datetime-local`, which carries no timezone. The server
 * action stamps them as IST before they reach the database — without that they
 * would be read as UTC and every slot would silently land five and a half hours
 * out, which looks like the educator making a mistake.
 *
 * Overlapping times are skipped rather than failing the whole batch: pasting a
 * week of slots should not be lost because one clashes with something already
 * published. The result says how many were skipped, because a silent skip is
 * indistinguishable from a save that worked.
 */
export function SlotPublisher({ slots }: { slots: Slot[] }) {
  const [pending, startTransition] = useTransition();
  const [times, setTimes] = useState<string[]>(['']);
  const [minutes, setMinutes] = useState(45);
  const [price, setPrice] = useState(0);
  const [topic, setTopic] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  function publish() {
    startTransition(async () => {
      const result = await createSlots(times, minutes, price, topic);
      setFeedback(result);
      if (result.ok) {
        setTimes(['']);
        setTopic('');
      }
    });
  }

  const filled = times.filter((time) => time.trim().length > 0);

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

      <div className="flex flex-col gap-3">
        <p className="text-ink-secondary text-[13px] font-medium">Times (IST)</p>

        {times.map((time, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              type="datetime-local"
              value={time}
              onChange={(event) =>
                setTimes(times.map((existing, i) => (i === index ? event.target.value : existing)))
              }
              aria-label={`Slot ${index + 1} start time`}
              className="flex-1"
            />
            {times.length > 1 && (
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remove slot ${index + 1}`}
                onClick={() => setTimes(times.filter((_, i) => i !== index))}
              >
                <X className="size-4" aria-hidden />
              </Button>
            )}
          </div>
        ))}

        <Button size="sm" variant="ghost" className="self-start" onClick={() => setTimes([...times, ''])}>
          <Plus className="size-4" aria-hidden /> Add another time
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Length (minutes)" htmlFor="minutes">
          <Input
            id="minutes"
            type="number"
            min={10}
            max={240}
            value={minutes}
            onChange={(event) => setMinutes(Number(event.target.value))}
          />
        </Field>

        <Field label="Price (₹)" htmlFor="price" hint="0 for a free session.">
          <Input
            id="price"
            type="number"
            min={0}
            value={price}
            onChange={(event) => setPrice(Number(event.target.value))}
          />
        </Field>

        <Field label="Focus" htmlFor="topic" hint="Optional.">
          <Input
            id="topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="Paper 2 strategy"
          />
        </Field>
      </div>

      <Button
        size="sm"
        className="self-start"
        loading={pending}
        disabled={filled.length === 0}
        onClick={publish}
      >
        <CalendarPlus className="size-4" aria-hidden />
        Publish {filled.length || ''} slot{filled.length === 1 ? '' : 's'}
      </Button>

      {slots.length > 0 && (
        <div className="border-line border-t pt-4">
          <p className="text-ink-secondary mb-2 text-[13px] font-medium">
            Open and unbooked ({slots.length})
          </p>
          <ul className="flex flex-wrap gap-2">
            {slots.map((slot) => (
              <li
                key={slot.id}
                className="border-line-medium text-ink-secondary rounded-lg border px-2.5 py-1.5 text-[12.5px]"
              >
                {formatDayMonth(slot.startsAt)} {formatTime(slot.startsAt)}
                {slot.priceInr > 0 && <span className="text-primary ml-1.5">{formatINR(slot.priceInr)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
