import { ScrollText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { getAuditLog, type AuditEntry } from '@/lib/data/console';
import { formatWhen } from '@/lib/format';

export const metadata = { title: 'Audit Logs' };

/**
 * The audit log is append-only by grant: UPDATE and DELETE are revoked from
 * `authenticated` and `anon` on the table itself (0006). An audit trail the
 * people being audited can edit is decoration.
 *
 * Rows are written *inside* the transaction that made the change, not by the
 * application afterwards — a log written by a second call is a log that is
 * missing exactly when an operation failed halfway through.
 */

const TONE: Record<string, 'warning' | 'error' | 'success' | 'purple' | 'gray'> = {
  ROLES_CHANGED: 'error',
  COURSE_STATUS: 'purple',
  COURSE_SUBMITTED: 'gray',
  COUPON_SAVED: 'warning',
  COUPON_ENABLED: 'warning',
  COUPON_DISABLED: 'gray',
  ENROLMENT_GRANTED: 'success',
  ORDER_FULFILLED: 'success',
  SESSION_EVICTED: 'gray',
};

/** Renders the interesting part of a jsonb blob without dumping the whole thing. */
function summarise(entry: AuditEntry): string {
  const after = entry.after ?? {};
  const before = entry.before ?? {};

  if (Array.isArray(after.roles)) {
    const from = Array.isArray(before.roles) ? before.roles.join(', ') : '—';
    return `${from} → ${(after.roles as string[]).join(', ')}`;
  }

  if (typeof after.status === 'string') {
    const from = typeof before.status === 'string' ? before.status : '—';
    const note = typeof after.note === 'string' && after.note ? ` · ${after.note}` : '';
    const title = typeof after.title === 'string' ? `${after.title}: ` : '';
    return `${title}${from} → ${after.status}${note}`;
  }

  if (typeof after.code === 'string') {
    return `${after.code} · ${after.kind === 'percent' ? `${after.value}%` : `₹${after.value}`}`;
  }

  const first = Object.entries(after)[0];
  return first ? `${first[0]}: ${String(first[1])}` : '—';
}

const columns: Column<AuditEntry>[] = [
  {
    key: 'action',
    header: 'Action',
    primary: true,
    render: (entry) => (
      <div className="min-w-0">
        <Badge variant={TONE[entry.action] ?? 'gray'}>{entry.action}</Badge>
        <p className="text-ink-secondary mt-1 truncate text-[12.5px]">{summarise(entry)}</p>
      </div>
    ),
  },
  {
    key: 'actor',
    header: 'Who',
    render: (entry) => (
      <div className="min-w-0">
        <p className="text-ink truncate text-[13px] font-medium">{entry.actorName}</p>
        <p className="text-ink-muted truncate text-[12px]">{entry.actorEmail}</p>
      </div>
    ),
  },
  {
    key: 'when',
    header: 'When',
    render: (entry) => <span className="text-ink-secondary">{formatWhen(entry.createdAt)}</span>,
  },
  {
    key: 'ip',
    header: 'IP',
    hideOnMobile: true,
    render: (entry) => <span className="text-ink-muted font-mono text-[12px]">{entry.ip ?? '—'}</span>,
  },
];

export default async function AuditPage() {
  const entries = await getAuditLog();

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every privileged action, who took it, and what it changed."
      />

      <Card>
        <CardHeader>
          <CardTitle>
            Recent activity
            <span className="text-ink-muted ml-2 text-[13px] font-normal">{entries.length}</span>
          </CardTitle>
          <ScrollText className="text-primary size-[18px]" aria-hidden />
        </CardHeader>

        <DataTable
          columns={columns}
          rows={entries}
          empty={
            <EmptyState
              icon={ScrollText}
              title="Nothing logged yet"
              description="Role changes, course approvals, coupons and manual enrolments appear here."
            />
          }
        />
      </Card>

      <p className="text-ink-muted mx-auto max-w-xl text-center text-xs leading-relaxed">
        Append-only: UPDATE and DELETE are revoked on this table. Entries are written inside the same
        transaction as the change they describe.
      </p>
    </>
  );
}
