import { CheckCircle2, Webhook } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { getWebhookEvents, type WebhookEvent } from '@/lib/data/system';
import { formatWhen } from '@/lib/format';

export const metadata = { title: 'Webhooks' };

/**
 * Inbound webhook deliveries.
 *
 * Payloads are not shown and not returned by the function. Razorpay's carry the
 * payer's contact details, and a screen that prints them turns a debugging tool
 * into a personal-data viewer that everyone with the developer role can read.
 *
 * There is no "send test payload" button. A test payload would have to be
 * signed with the real webhook secret to reach the handler at all — so the
 * button either does not exercise the verification (and proves nothing) or
 * requires the server to sign arbitrary input with the production secret. Both
 * are worse than testing from the provider's own dashboard.
 */

const ENDPOINTS = [
  {
    provider: 'razorpay',
    path: 'POST /api/webhooks/razorpay',
    events: 'order.paid · payment.captured · payment.failed · refund.processed',
    note: 'Signature verified before the body is parsed. Enrolment follows this, never the browser.',
  },
  {
    provider: 'ses',
    path: 'POST /api/webhooks/ses',
    events: 'Bounce · Complaint · Delivery, via SNS',
    note: 'Three gates: certificate host, signature, topic ARN. The ARN check is what stops a stranger filing bounces against our students.',
  },
  {
    provider: 'resend',
    path: 'POST /api/webhooks/resend',
    events: 'email.delivered · email.bounced · email.complained · email.opened',
    note: 'Svix signature, tried against every configured secret so keys can rotate without downtime.',
  },
];

const STATUS: Record<string, 'success' | 'warning' | 'error' | 'gray'> = {
  processed: 'success',
  received: 'warning',
  failed: 'error',
  ignored: 'gray',
  duplicate: 'gray',
};

const columns: Column<WebhookEvent>[] = [
  {
    key: 'event',
    header: 'Event',
    primary: true,
    render: (event) => (
      <div className="min-w-0">
        <p className="text-ink truncate font-semibold">{event.eventType}</p>
        <p className="text-ink-muted truncate font-mono text-[12px]">{event.eventId}</p>
      </div>
    ),
  },
  {
    key: 'provider',
    header: 'From',
    render: (event) => <span className="text-ink-secondary">{event.provider}</span>,
  },
  {
    key: 'status',
    header: 'Status',
    render: (event) => (
      <div className="flex flex-col items-end gap-1 md:items-start">
        <Badge variant={STATUS[event.status] ?? 'gray'}>{event.status}</Badge>
        {event.error && (
          <span className="text-error max-w-[240px] truncate text-[12px]" title={event.error}>
            {event.error}
          </span>
        )}
      </div>
    ),
  },
  {
    key: 'received',
    header: 'Received',
    render: (event) => <span className="text-ink-secondary">{formatWhen(event.receivedAt)}</span>,
  },
  {
    key: 'attempts',
    header: 'Tries',
    hideOnMobile: true,
    render: (event) => <span className="tabular-nums">{event.attempts}</span>,
  },
];

export default async function DevWebhooksPage() {
  const events = await getWebhookEvents();

  const failed = events.filter((event) => event.status === 'failed').length;
  const providers = new Set(events.map((event) => event.provider));

  return (
    <>
      <PageHeader title="Webhooks" description="Inbound event endpoints and what they delivered." />

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {ENDPOINTS.map((endpoint) => (
          <Card key={endpoint.provider}>
            <CardHeader>
              <CardTitle className="capitalize">{endpoint.provider}</CardTitle>
              {providers.has(endpoint.provider) ? (
                <Badge variant="success">
                  <CheckCircle2 className="size-3.5" aria-hidden /> Receiving
                </Badge>
              ) : (
                <Badge variant="gray">No events yet</Badge>
              )}
            </CardHeader>

            <div className="flex flex-col gap-2">
              <code className="text-ink font-mono text-[12.5px] break-all">{endpoint.path}</code>
              <p className="text-ink-muted text-[12.5px]">{endpoint.events}</p>
              <p className="text-ink-secondary text-[12.5px] leading-relaxed">{endpoint.note}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Recent deliveries
            <span className="text-ink-muted ml-2 text-[13px] font-normal">{events.length}</span>
          </CardTitle>
          {failed > 0 ? (
            <Badge variant="error">{failed} failed</Badge>
          ) : (
            <Webhook className="text-primary size-[18px]" aria-hidden />
          )}
        </CardHeader>

        <DataTable
          columns={columns}
          rows={events}
          empty={
            <EmptyState
              icon={Webhook}
              title="Nothing received yet"
              description="Deliveries appear here as providers send them. An empty list on a live site means the endpoint URL is wrong at the provider's end."
            />
          }
        />
      </Card>

      <p className="text-ink-muted mx-auto max-w-xl text-center text-xs leading-relaxed">
        Events are deduplicated on <code className="font-mono">(provider, event_id)</code>, so a replay can
        never double-enrol a student. Payloads are not displayed — Razorpay&apos;s contain the payer&apos;s
        contact details.
      </p>
    </>
  );
}
