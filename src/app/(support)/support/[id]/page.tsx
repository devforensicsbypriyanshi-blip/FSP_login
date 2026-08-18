import { ArrowLeft, Clock, Mail } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TicketThread } from '@/components/support/ticket-thread';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getTicket } from '@/lib/data/support';
import { formatWhen } from '@/lib/format';
import { getSessionContext } from '@/lib/session/server';

const STATUS: Record<string, { label: string; variant: 'error' | 'warning' | 'success' | 'gray' }> = {
  open: { label: 'Open', variant: 'error' },
  pending: { label: 'Awaiting reply', variant: 'warning' },
  resolved: { label: 'Resolved', variant: 'success' },
  closed: { label: 'Closed', variant: 'gray' },
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ticket = await getTicket(id);
  return { title: ticket ? `${ticket.ref} · ${ticket.subject}` : 'Ticket' };
}

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [ticket, session] = await Promise.all([getTicket(id), getSessionContext()]);

  // Null covers both "no such ticket" and "RLS hid it" — a student probing
  // ids should not be able to tell the difference.
  if (!ticket) notFound();

  const status = STATUS[ticket.status] ?? { label: ticket.status, variant: 'gray' as const };
  const canModerate = session?.roles.some((r) => r === 'support' || r === 'admin') ?? false;

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link href="/support">
            <ArrowLeft className="size-4" aria-hidden /> Inbox
          </Link>
        </Button>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-ink text-lg font-bold text-balance md:text-xl">
              {ticket.subject}
            </h1>
            <p className="text-ink-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
              <span className="font-mono">{ticket.ref}</span>
              <span className="flex items-center gap-1">
                <Mail className="size-3.5" aria-hidden /> {ticket.studentEmail}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden /> Raised {formatWhen(ticket.createdAt)}
              </span>
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-1.5">
            <Badge variant={status.variant}>{status.label}</Badge>
            <Badge variant="gray">{ticket.priority}</Badge>
            {!ticket.firstResponseAt && ticket.status !== 'closed' && (
              <Badge variant="error">No reply yet</Badge>
            )}
          </div>
        </div>
      </div>

      <Card>
        <TicketThread ticket={ticket} canModerate={canModerate} />
      </Card>
    </>
  );
}
