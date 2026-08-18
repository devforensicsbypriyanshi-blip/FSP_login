import 'server-only';

import { createClient } from '@/lib/supabase/server';

/**
 * Support desk reads.
 *
 * `tickets: own or staff` does the filtering, so the same functions serve both
 * the student view (their own tickets) and the agent view (all of them). No
 * role branching here — the database already knows who is asking.
 */

export interface TicketSummary {
  id: string;
  ref: string;
  subject: string;
  category: string | null;
  priority: string;
  status: string;
  createdAt: string;
  firstResponseAt: string | null;
  studentName: string;
  studentEmail: string;
  assignedToName: string | null;
  messageCount: number;
}

export async function getTickets(limit = 100): Promise<TicketSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('support_tickets')
    .select(
      'id, ref, subject, category, priority, status, created_at, first_response_at, profiles!support_tickets_user_id_fkey(full_name, email)'
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data?.length) return [];

  // One extra read for the counts rather than a correlated subquery per row —
  // PostgREST cannot express the latter, and at helpdesk volumes this is tiny.
  const { data: messages } = await supabase
    .from('ticket_messages')
    .select('ticket_id')
    .in(
      'ticket_id',
      data.map((t) => t.id)
    );

  const counts = new Map<string, number>();
  for (const message of messages ?? []) {
    counts.set(message.ticket_id, (counts.get(message.ticket_id) ?? 0) + 1);
  }

  return data.map((ticket) => {
    const profile = ticket.profiles as { full_name: string; email: string } | null;
    return {
      id: ticket.id,
      ref: ticket.ref,
      subject: ticket.subject,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      createdAt: ticket.created_at,
      firstResponseAt: ticket.first_response_at,
      studentName: profile?.full_name ?? 'Unknown',
      studentEmail: profile?.email ?? '',
      assignedToName: null,
      messageCount: counts.get(ticket.id) ?? 0,
    };
  });
}

export interface TicketMessage {
  id: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
  senderName: string;
  senderIsStaff: boolean;
}

export interface TicketDetail extends TicketSummary {
  messages: TicketMessage[];
}

export async function getTicket(id: string): Promise<TicketDetail | null> {
  const supabase = await createClient();

  const { data: ticket } = await supabase
    .from('support_tickets')
    .select(
      'id, ref, subject, category, priority, status, created_at, first_response_at, user_id, profiles!support_tickets_user_id_fkey(full_name, email)'
    )
    .eq('id', id)
    .maybeSingle();

  if (!ticket) return null;

  // Internal notes are filtered by RLS, not here — a student's query simply
  // does not return them, so there is nothing to accidentally leak in the map.
  const { data: messages } = await supabase
    .from('ticket_messages')
    .select('id, body, is_internal, created_at, sender_id, profiles(full_name)')
    .eq('ticket_id', id)
    .order('created_at', { ascending: true });

  const profile = ticket.profiles as { full_name: string; email: string } | null;

  return {
    id: ticket.id,
    ref: ticket.ref,
    subject: ticket.subject,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    createdAt: ticket.created_at,
    firstResponseAt: ticket.first_response_at,
    studentName: profile?.full_name ?? 'Unknown',
    studentEmail: profile?.email ?? '',
    assignedToName: null,
    messageCount: messages?.length ?? 0,
    messages: (messages ?? []).map((message) => ({
      id: message.id,
      body: message.body,
      isInternal: message.is_internal,
      createdAt: message.created_at,
      senderName: (message.profiles as { full_name: string } | null)?.full_name ?? 'Unknown',
      senderIsStaff: message.sender_id !== ticket.user_id,
    })),
  };
}
