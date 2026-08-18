import { AlertTriangle, Ban, CheckCircle2, Mail, MailWarning, Server } from 'lucide-react';
import { PoolUsageTable, type PoolStatus } from '@/components/admin/pool-usage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { DataTable, KpiCard, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { getPools } from '@/lib/email/pools';
import { formatDate } from '@/lib/format';
import { callPendingRpc } from '@/lib/supabase/rpc';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Email Deliverability' };

/**
 * Email is the only authentication channel, so its health IS platform health.
 * An undelivered message is a locked-out student.
 *
 * The per-key table is the part to watch. Resend's free tier is TWO limits —
 * 100 a day AND 3,000 a month — and the monthly one is the easier to miss: it
 * creeps up over weeks while every daily figure looks fine, then everything
 * stops at once. Sending switches keys automatically; this is where you see it
 * happening before students do.
 */

interface Suppressed {
  id: string;
  email: string;
  reason: string;
  since: string;
  detail: string;
}

const REASON_LABEL: Record<string, string> = {
  hard_bounce: 'Hard bounce',
  complaint: 'Complaint',
  manual: 'Blocked by staff',
  invalid: 'Invalid address',
};

const columns: Column<Suppressed>[] = [
  { key: 'email', header: 'Address', primary: true, render: (s) => s.email },
  {
    key: 'reason',
    header: 'Reason',
    render: (s) => <Badge variant={s.reason === 'Complaint' ? 'error' : 'warning'}>{s.reason}</Badge>,
  },
  { key: 'detail', header: 'Detail', render: (s) => s.detail },
  { key: 'since', header: 'Since', render: (s) => s.since },
  {
    key: 'actions',
    header: 'Actions',
    render: () => (
      <Button variant="outline" size="sm">
        Release
      </Button>
    ),
  },
];

export default async function AdminEmailsPage() {
  const supabase = await createClient();

  // Today's total comes from the pool figures below rather than a separate
  // count, so the headline number and the per-key bars can never disagree.
  const [{ data: usageRows }, { data: suppressions }] = await Promise.all([
    callPendingRpc(supabase, 'email_pool_usage', {}),
    supabase
      .from('email_suppressions')
      .select('email, reason, detail, suppressed_at')
      .is('released_at', null)
      .order('suppressed_at', { ascending: false })
      .limit(50),
  ]);

  const usage = new Map((usageRows ?? []).map((r) => [r.pool_id, r]));

  // Keys are read from config but never rendered — only pool ids and budgets.
  const pools: PoolStatus[] = getPools().map((p) => {
    const u = usage.get(p.id);
    return {
      id: p.id,
      provider: p.provider,
      from: p.from,
      categories: p.categories?.join(', ') ?? 'all categories',
      sentToday: u?.sent_today ?? 0,
      dailyCap: p.dailyCap,
      sentMonth: u?.sent_month ?? 0,
      monthlyCap: p.monthlyCap,
    };
  });

  const totalDaily = pools.reduce((n, p) => n + p.dailyCap, 0) || 100;
  const usedToday = pools.reduce((n, p) => n + p.sentToday, 0);
  const pct = Math.round((usedToday / totalDaily) * 100);

  const blocked: Suppressed[] = (suppressions ?? []).map((s, i) => ({
    id: String(i),
    email: s.email,
    reason: REASON_LABEL[s.reason] ?? s.reason,
    since: formatDate(s.suppressed_at),
    detail: s.detail ?? '—',
  }));

  const monthTotal = pools.reduce((n, p) => n + p.sentMonth, 0);
  const monthCap = pools.reduce((n, p) => n + p.monthlyCap, 0) || 3000;

  return (
    <>
      <PageHeader
        title="Email deliverability"
        description="Email is the only way students sign in — this is platform health."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Sent today"
          value={`${usedToday} / ${totalDaily}`}
          trend={`${pct}% of the daily budget`}
          icon={<Mail className="size-5" aria-hidden />}
          tone={pct >= 80 ? 'bg-error-bg text-error' : 'bg-primary-light text-primary'}
        />
        <KpiCard
          label="This month"
          value={`${monthTotal} / ${monthCap}`}
          trend={`${Math.round((monthTotal / monthCap) * 100)}% of the monthly budget`}
          icon={<Mail className="size-5" aria-hidden />}
          tone={monthTotal >= monthCap * 0.8 ? 'bg-warning-bg text-warning' : 'bg-success-bg text-success'}
        />
        <KpiCard
          label="Sending keys"
          value={String(pools.length)}
          trend={`${pools.filter((p) => p.sentToday < p.dailyCap && p.sentMonth < p.monthlyCap).length} with headroom`}
          icon={<Server className="size-5" aria-hidden />}
          tone="bg-info-bg text-info"
        />
        <KpiCard
          label="Blocked addresses"
          value={String(blocked.length)}
          trend="Bounced or complained"
          icon={<MailWarning className="size-5" aria-hidden />}
          tone={blocked.length > 0 ? 'bg-warning-bg text-warning' : 'bg-success-bg text-success'}
        />
      </div>

      {pct >= 80 && (
        <div className="border-error-border bg-error-bg text-error flex items-start gap-2.5 rounded-xl border p-4 text-[13px]">
          <AlertTriangle className="mt-px size-4 shrink-0" aria-hidden />
          <p className="leading-relaxed">
            <strong>Approaching the daily budget.</strong> Sign-in codes always send; reminders and digests
            start being held back. Add a key or raise a cap before the next class reminder.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Sending keys</CardTitle>
          <CheckCircle2 className="text-success size-[18px]" aria-hidden />
        </CardHeader>
        <p className="text-ink-muted mb-4 text-[12.5px] leading-relaxed">
          Sending picks the key with the most headroom and switches automatically when one fills up. Both
          budgets matter — a key can be fine today and out of monthly quota, which is the case that catches
          people out.
        </p>
        <PoolUsageTable pools={pools} />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Blocked addresses</CardTitle>
          <Badge variant="gray">{blocked.length}</Badge>
        </CardHeader>
        <p className="text-ink-muted mb-4 text-[13px] leading-relaxed">
          Addresses that hard-bounced or reported us as spam. We stop sending automatically — continuing to
          mail a dead address damages sender reputation and eventually stops our mail reaching anyone.
        </p>

        {blocked.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="Nothing blocked"
            description="No address has bounced or complained. That is the healthy state."
          />
        ) : (
          <DataTable columns={columns} rows={blocked} />
        )}
      </Card>

      <p className="text-ink-muted flex items-center justify-center gap-1.5 text-center text-xs">
        <Ban className="size-3.5" aria-hidden />
        Release a block only after confirming the address is correct with the student.
      </p>
    </>
  );
}
