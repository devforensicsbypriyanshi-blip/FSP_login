import { Activity, AlertTriangle, CheckCircle2, Clock, Mail, Webhook } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { DataTable, KpiCard, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { getRecentFailures, getSystemHealth, type Failure } from '@/lib/data/system';
import { formatWhen } from '@/lib/format';

export const metadata = { title: 'Failures & Health' };

/**
 * What broke, across everything that delivers something.
 *
 * One list rather than three screens, because "what is wrong right now" is one
 * question and answering it by visiting three pages means the third one gets
 * skipped.
 *
 * This is not an HTTP request log. Vercel already keeps those, with more detail
 * and better retention than anything worth rebuilding here — and every request
 * this application serves would have to be written to Postgres to produce one,
 * which is a write amplification nobody asked for. What Vercel does *not* know
 * is which email bounced, which notification exhausted its retries and which
 * webhook was rejected. That is what this is.
 */

const SOURCE: Record<string, { icon: typeof Mail; label: string }> = {
  email: { icon: Mail, label: 'Email' },
  notification: { icon: Activity, label: 'Notification' },
  webhook: { icon: Webhook, label: 'Webhook' },
};

const columns: Column<Failure>[] = [
  {
    key: 'what',
    header: 'What failed',
    primary: true,
    render: (failure) => {
      const source = SOURCE[failure.source] ?? { icon: AlertTriangle, label: failure.source };
      const Icon = source.icon;

      return (
        <div className="flex min-w-0 items-start gap-2">
          <Icon className="text-ink-muted mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="text-ink truncate font-semibold">{failure.subject}</p>
            <p className="text-ink-muted truncate text-[12px]">{source.label}</p>
          </div>
        </div>
      );
    },
  },
  {
    key: 'why',
    header: 'Reason',
    render: (failure) => (
      <span className="text-error line-clamp-2 text-[12.5px]" title={failure.detail}>
        {failure.detail}
      </span>
    ),
  },
  {
    key: 'tries',
    header: 'Tries',
    hideOnMobile: true,
    render: (failure) => <span className="tabular-nums">{failure.attempts}</span>,
  },
  {
    key: 'when',
    header: 'When',
    render: (failure) => <span className="text-ink-secondary">{formatWhen(failure.failedAt)}</span>,
  },
];

export default async function DevLogsPage() {
  const [health, failures] = await Promise.all([getSystemHealth(), getRecentFailures()]);

  const quiet = failures.length === 0;

  return (
    <>
      <PageHeader
        title="Failures & health"
        description="Everything that tried to deliver something and could not."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Emails, last 24h"
          value={String(health.emailsSent24h)}
          trend={health.emailsFailed24h > 0 ? `${health.emailsFailed24h} failed` : 'None failed'}
          icon={<Mail className="size-5" aria-hidden />}
          tone={health.emailsFailed24h > 0 ? 'bg-error-bg text-error' : 'bg-primary-light text-primary'}
        />
        <KpiCard
          label="Queue waiting"
          value={String(health.notificationsPending)}
          trend={
            health.notificationsStuck > 0
              ? `${health.notificationsStuck} claimed over 10 min ago`
              : 'Nothing stuck'
          }
          icon={<Clock className="size-5" aria-hidden />}
          tone={
            health.notificationsStuck > 0 ? 'bg-warning-bg text-warning' : 'bg-primary-light text-primary'
          }
        />
        <KpiCard
          label="Webhooks, last 24h"
          value={String(health.webhooksReceived24h)}
          trend={health.webhooksFailed24h > 0 ? `${health.webhooksFailed24h} failed` : 'None failed'}
          icon={<Webhook className="size-5" aria-hidden />}
          tone={health.webhooksFailed24h > 0 ? 'bg-error-bg text-error' : 'bg-primary-light text-primary'}
        />
        <KpiCard
          label="Last activity"
          value={health.lastEmailAt ? formatWhen(health.lastEmailAt) : 'Never'}
          trend={health.lastWebhookAt ? `Webhook ${formatWhen(health.lastWebhookAt)}` : 'No webhooks yet'}
          icon={<Activity className="size-5" aria-hidden />}
        />
      </div>

      {health.notificationsStuck > 0 && (
        <div className="border-warning-border bg-warning-bg rounded-2xl border p-4">
          <p className="text-warning text-[13.5px] leading-relaxed">
            <strong>
              {health.notificationsStuck} notification{health.notificationsStuck === 1 ? '' : 's'} claimed
              over ten minutes ago.
            </strong>{' '}
            That means a worker took them and died mid-batch. The next run reclaims them automatically — this
            is only worth acting on if the number stays put.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            Recent failures
            <span className="text-ink-muted ml-2 text-[13px] font-normal">{failures.length}</span>
          </CardTitle>
          {quiet ? (
            <Badge variant="success">
              <CheckCircle2 className="size-3.5" aria-hidden /> All clear
            </Badge>
          ) : (
            <Badge variant="error">{failures.length}</Badge>
          )}
        </CardHeader>

        <DataTable
          columns={columns}
          rows={failures}
          empty={
            <EmptyState
              icon={CheckCircle2}
              title="Nothing has failed"
              description="Failed emails, exhausted notifications and rejected webhooks would appear here."
            />
          }
        />
      </Card>

      <p className="text-ink-muted mx-auto max-w-xl text-center text-xs leading-relaxed">
        HTTP request logs live in Vercel, which keeps them with more detail than a Postgres table could. This
        page covers what Vercel cannot see: which email bounced, which notification gave up, which webhook was
        rejected.
      </p>
    </>
  );
}
