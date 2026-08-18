import { Clock, Inbox, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { KpiCard } from '@/components/ui/data-table';
import { getTickets } from '@/lib/data/support';
import { formatWhen } from '@/lib/format';

export const metadata = { title: 'Ticket Inbox' };

/**
 * The helpdesk queue.
 *
 * Ordered oldest-unanswered first rather than newest-first: the ticket that has
 * been waiting longest is the one at risk, and a reverse-chronological inbox
 * quietly buries it under every new arrival.
 */

const STATUS: Record<string, { label: string; variant: 'error' | 'warning' | 'success' | 'gray' }> = {
  open: { label: 'Open', variant: 'error' },
  pending: { label: 'Awaiting reply', variant: 'warning' },
  resolved: { label: 'Resolved', variant: 'success' },
  closed: { label: 'Closed', variant: 'gray' },
};

const PRIORITY: Record<string, 'error' | 'warning' | 'gray'> = {
  urgent: 'error',
  high: 'error',
  medium: 'warning',
  low: 'gray',
};

export default async function SupportInboxPage() {
  const tickets = await getTickets();

  const open = tickets.filter((t) => t.status === 'open');
  const pending = tickets.filter((t) => t.status === 'pending');
  const unanswered = tickets.filter((t) => !t.firstResponseAt && t.status !== 'closed');

  // Longest-waiting first among the live ones; settled tickets fall to the end.
  const queue = [...tickets].sort((a, b) => {
    const liveA = a.status === 'open' || a.status === 'pending';
    const liveB = b.status === 'open' || b.status === 'pending';
    if (liveA !== liveB) return liveA ? -1 : 1;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return (
    <>
      <PageHeader title="Ticket inbox" description="Student questions, longest-waiting first." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Open"
          value={String(open.length)}
          trend="Needs a first reply"
          icon={<Inbox className="size-5" aria-hidden />}
          tone="bg-error-bg text-error"
        />
        <KpiCard
          label="Awaiting student"
          value={String(pending.length)}
          trend="We have replied"
          icon={<MessageCircle className="size-5" aria-hidden />}
          tone="bg-warning-bg text-warning"
        />
        <KpiCard
          label="Never answered"
          value={String(unanswered.length)}
          trend="The ones that hurt"
          icon={<Clock className="size-5" aria-hidden />}
          tone={unanswered.length > 0 ? 'bg-error-bg text-error' : 'bg-success-bg text-success'}
        />
        <KpiCard
          label="Total"
          value={String(tickets.length)}
          trend="All time"
          icon={<Inbox className="size-5" aria-hidden />}
          tone="bg-primary-light text-primary"
        />
      </div>

      <Card className="p-0">
        <CardHeader className="p-5 pb-3">
          <CardTitle>Tickets</CardTitle>
          <Badge variant="gray">{queue.length}</Badge>
        </CardHeader>

        {queue.length === 0 ? (
          <div className="p-5 pt-0">
            <EmptyState
              icon={Inbox}
              title="No tickets yet"
              description="When a student raises a support request it lands here. Nothing to do right now."
            />
          </div>
        ) : (
          <ul className="divide-line flex flex-col divide-y">
            {queue.map((ticket) => {
              const status = STATUS[ticket.status] ?? { label: ticket.status, variant: 'gray' as const };
              const waiting = !ticket.firstResponseAt && ticket.status !== 'closed';

              return (
                <li key={ticket.id}>
                  <Link href={`/support/${ticket.id}`} className="hover:bg-hover flex gap-3.5 p-4 transition">
                    <Avatar name={ticket.studentName} size="md" />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                        <p className="text-ink text-[13.5px] font-semibold">{ticket.subject}</p>
                        <span className="text-ink-muted shrink-0 font-mono text-[11px]">{ticket.ref}</span>
                      </div>

                      <p className="text-ink-muted mt-0.5 truncate text-[12.5px]">
                        {ticket.studentName} · {ticket.studentEmail}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge variant={status.variant}>{status.label}</Badge>
                        <Badge variant={PRIORITY[ticket.priority] ?? 'gray'}>{ticket.priority}</Badge>
                        {ticket.category && <Badge variant="gray">{ticket.category}</Badge>}
                        {waiting && <Badge variant="error">No reply yet</Badge>}
                        <span className="text-ink-light ml-auto text-[11.5px]">
                          {formatWhen(ticket.createdAt)}
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
