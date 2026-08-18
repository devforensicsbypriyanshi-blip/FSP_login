'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { callPendingRpc } from '@/lib/supabase/rpc';
import { createClient } from '@/lib/supabase/server';
import type { FormState } from './types';

/**
 * Support desk writes.
 *
 * Everything goes through reply_to_ticket() / set_ticket_status() rather than
 * direct table writes, because each one has bookkeeping attached — first
 * response time, the status transition, the student's notification — that must
 * not be able to drift apart from the message itself.
 */

const ERRORS: Record<string, string> = {
  NOT_YOUR_TICKET: 'You do not have access to that ticket.',
  TICKET_NOT_FOUND: 'That ticket no longer exists.',
  EMPTY_MESSAGE: 'Write something before sending.',
  STAFF_ONLY: 'Only support staff can change a ticket status.',
};

function translate(message: string): string {
  const code = Object.keys(ERRORS).find((key) => message.toUpperCase().includes(key));
  return code ? ERRORS[code]! : 'Something went wrong. Please try again.';
}

const replySchema = z.object({
  ticketId: z.string().uuid(),
  body: z.string().trim().min(1, 'Write something before sending.').max(5000),
  internal: z.boolean().optional(),
});

export async function replyToTicket(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = replySchema.safeParse({
    ticketId: formData.get('ticketId'),
    body: formData.get('body'),
    internal: formData.get('internal') === 'on',
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: { body: parsed.error.issues[0]?.message ?? 'Invalid message.' } };
  }

  const supabase = await createClient();
  const { error } = await callPendingRpc(supabase, 'reply_to_ticket', {
    p_ticket: parsed.data.ticketId,
    p_body: parsed.data.body,
    p_internal: parsed.data.internal ?? false,
  });

  if (error) return { ok: false, message: translate(error.message) };

  revalidatePath(`/support/${parsed.data.ticketId}`);
  revalidatePath('/support');
  return { ok: true, message: parsed.data.internal ? 'Internal note added.' : 'Reply sent.' };
}

export async function setTicketStatus(ticketId: string, status: 'open' | 'pending' | 'resolved' | 'closed') {
  const supabase = await createClient();
  const { error } = await callPendingRpc(supabase, 'set_ticket_status', {
    p_ticket: ticketId,
    p_status: status,
  });

  if (error) return { ok: false as const, message: translate(error.message) };

  revalidatePath(`/support/${ticketId}`);
  revalidatePath('/support');
  return { ok: true as const, message: `Ticket marked ${status}.` };
}
