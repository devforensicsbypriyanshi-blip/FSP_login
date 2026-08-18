'use client';

import { CheckCircle2, Lock, Send } from 'lucide-react';
import { useActionState, useState, useTransition } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { replyToTicket, setTicketStatus } from '@/lib/actions/support';
import { IDLE_FORM_STATE } from '@/lib/actions/types';
import type { TicketDetail } from '@/lib/data/support';
import { formatWhen } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * A ticket conversation.
 *
 * Internal notes sit in the same thread as replies rather than a separate tab,
 * because an agent reading history needs both in order. They are visually
 * unmistakable — amber ground, a lock, an explicit label — since the failure
 * mode here is an agent believing the student has seen something they haven't.
 *
 * Students never receive internal notes at all: RLS filters them out of the
 * query, so this styling is a second signal, not the control.
 */
export function TicketThread({ ticket, canModerate }: { ticket: TicketDetail; canModerate: boolean }) {
  const [state, action, pending] = useActionState(replyToTicket, IDLE_FORM_STATE);
  const [statusPending, startTransition] = useTransition();
  const [internal, setInternal] = useState(false);
  const { toast } = useToast();

  function changeStatus(status: 'open' | 'pending' | 'resolved' | 'closed') {
    startTransition(async () => {
      const result = await setTicketStatus(ticket.id, status);
      toast({ tone: result.ok ? 'success' : 'error', message: result.message });
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col gap-4">
        {ticket.messages.map((message) => (
          <li
            key={message.id}
            className={cn('flex gap-3', message.senderIsStaff ? 'flex-row-reverse text-right' : 'flex-row')}
          >
            <Avatar name={message.senderName} size="sm" />

            <div className={cn('min-w-0 flex-1', message.senderIsStaff && 'flex flex-col items-end')}>
              <p className="text-ink-muted mb-1 flex items-center gap-2 text-[11.5px]">
                <span className="font-semibold">{message.senderName}</span>
                <span>{formatWhen(message.createdAt)}</span>
                {message.isInternal && (
                  <Badge variant="warning">
                    <Lock className="size-3" aria-hidden /> Internal note
                  </Badge>
                )}
              </p>

              <div
                className={cn(
                  'inline-block max-w-[42rem] rounded-2xl border px-4 py-3 text-left text-[13.5px] leading-relaxed whitespace-pre-line',
                  message.isInternal
                    ? 'border-warning-border bg-warning-bg text-ink'
                    : message.senderIsStaff
                      ? 'border-primary-border bg-primary-light text-ink'
                      : 'border-line-medium bg-surface text-ink'
                )}
              >
                {message.body}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {ticket.status === 'closed' ? (
        <p className="border-line-medium text-ink-muted rounded-xl border p-4 text-center text-[13px]">
          This ticket is closed. Reopen it to reply.
        </p>
      ) : (
        <form action={action} className="border-line flex flex-col gap-3 border-t pt-4">
          <input type="hidden" name="ticketId" value={ticket.id} />
          {internal && <input type="hidden" name="internal" value="on" />}

          {state.message && (
            <p
              className={
                state.ok
                  ? 'border-success-border bg-success-bg text-success rounded-xl border p-3 text-[13px]'
                  : 'border-error-border bg-error-bg text-error rounded-xl border p-3 text-[13px]'
              }
              role={state.ok ? 'status' : 'alert'}
            >
              {state.message}
            </p>
          )}

          <Textarea
            name="body"
            rows={4}
            required
            aria-label={internal ? 'Internal note' : 'Reply to student'}
            placeholder={internal ? 'Note for the team — the student never sees this…' : 'Write your reply…'}
            className={internal ? 'border-warning-border bg-warning-bg' : undefined}
          />
          {state.fieldErrors?.body && (
            <p className="text-error text-[12.5px] font-medium" role="alert">
              {state.fieldErrors.body}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" loading={pending}>
              <Send className="size-4" aria-hidden /> {internal ? 'Add note' : 'Send reply'}
            </Button>

            {canModerate && (
              <>
                <label className="border-line-medium hover:bg-hover flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-[13px]">
                  <input
                    type="checkbox"
                    checked={internal}
                    onChange={(e) => setInternal(e.target.checked)}
                    className="size-[16px] accent-[var(--color-warning)]"
                  />
                  Internal note
                </label>

                {ticket.status !== 'resolved' && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    loading={statusPending}
                    onClick={() => changeStatus('resolved')}
                    className="ml-auto"
                  >
                    <CheckCircle2 className="size-4" aria-hidden /> Mark resolved
                  </Button>
                )}
                {ticket.status === 'resolved' && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    loading={statusPending}
                    onClick={() => changeStatus('closed')}
                    className="ml-auto"
                  >
                    Close ticket
                  </Button>
                )}
              </>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
