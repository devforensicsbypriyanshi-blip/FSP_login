import { AlertTriangle, CheckCircle2, Mail } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Per-key quota, so exhaustion is visible days before it bites.
 *
 * Both budgets are shown because the monthly one is the easier to miss: it
 * creeps up over weeks while every daily figure looks healthy, then everything
 * stops at once on the 24th.
 *
 * Keys themselves are never rendered — only the pool id. This screen is for
 * seeing headroom, not for reading secrets.
 */

export interface PoolStatus {
  id: string;
  provider: string;
  from: string;
  categories: string | null;
  sentToday: number;
  dailyCap: number;
  sentMonth: number;
  monthlyCap: number;
}

function Bar({ used, cap }: { used: number; cap: number }) {
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 100;
  const tone = pct >= 100 ? 'bg-error' : pct >= 80 ? 'bg-warning' : 'bg-success';

  return (
    <div className="flex items-center gap-2">
      <div className="bg-hover h-1.5 w-full overflow-hidden rounded-full">
        <div className={cn('h-full rounded-full', tone)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-ink-muted shrink-0 text-[11px] tabular-nums">
        {used}/{cap}
      </span>
    </div>
  );
}

export function PoolUsageTable({ pools }: { pools: PoolStatus[] }) {
  if (pools.length === 0) {
    return (
      <p className="text-ink-muted text-[13px] leading-relaxed">
        No sending pools configured. Set <code className="font-mono text-[12px]">EMAIL_POOLS</code>, or the
        single <code className="font-mono text-[12px]">RESEND_API_KEY</code>, and each key&rsquo;s remaining
        quota appears here.
      </p>
    );
  }

  const totalToday = pools.reduce((n, p) => n + p.sentToday, 0);
  const totalDaily = pools.reduce((n, p) => n + p.dailyCap, 0);
  const totalMonth = pools.reduce((n, p) => n + p.sentMonth, 0);
  const totalMonthly = pools.reduce((n, p) => n + p.monthlyCap, 0);

  const exhausted = pools.filter((p) => p.sentToday >= p.dailyCap || p.sentMonth >= p.monthlyCap);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="border-line-medium rounded-xl border p-3">
          <p className="text-ink-muted text-[11px] font-semibold tracking-wide uppercase">Today</p>
          <p className="font-display text-ink mt-1 text-lg font-bold">
            {totalToday} <span className="text-ink-light text-[13px] font-normal">/ {totalDaily}</span>
          </p>
        </div>
        <div className="border-line-medium rounded-xl border p-3">
          <p className="text-ink-muted text-[11px] font-semibold tracking-wide uppercase">This month</p>
          <p className="font-display text-ink mt-1 text-lg font-bold">
            {totalMonth} <span className="text-ink-light text-[13px] font-normal">/ {totalMonthly}</span>
          </p>
        </div>
      </div>

      {exhausted.length > 0 && (
        <p
          className="border-warning-border bg-warning-bg text-warning flex items-start gap-2 rounded-xl border p-3 text-[12.5px] leading-relaxed"
          role="status"
        >
          <AlertTriangle className="mt-px size-4 shrink-0" aria-hidden />
          <span>
            <strong>
              {exhausted.length} key{exhausted.length === 1 ? '' : 's'} at a limit
            </strong>{' '}
            ({exhausted.map((p) => p.id).join(', ')}). Sending has already switched to the others. Sign-in
            codes still go out regardless — only reminders and digests are held back.
          </span>
        </p>
      )}

      <ul className="divide-line flex flex-col divide-y">
        {pools.map((p) => {
          const dayFull = p.sentToday >= p.dailyCap;
          const monthFull = p.sentMonth >= p.monthlyCap;

          return (
            <li key={p.id} className="flex flex-col gap-2 py-3.5 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-ink flex items-center gap-2 text-[13.5px] font-semibold">
                  <Mail className="text-ink-muted size-4" aria-hidden />
                  {p.id}
                  <Badge variant="gray">{p.provider}</Badge>
                  {dayFull || monthFull ? (
                    <Badge variant="error">{monthFull ? 'Month spent' : 'Day spent'}</Badge>
                  ) : (
                    <Badge variant="success">
                      <CheckCircle2 className="size-3" aria-hidden /> Available
                    </Badge>
                  )}
                </p>
                {p.categories && <span className="text-ink-muted text-[11.5px]">{p.categories}</span>}
              </div>

              <p className="text-ink-light font-mono text-[11px]">{p.from}</p>

              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="text-ink-muted mb-1 text-[10.5px] tracking-wide uppercase">Today</p>
                  <Bar used={p.sentToday} cap={p.dailyCap} />
                </div>
                <div>
                  <p className="text-ink-muted mb-1 text-[10.5px] tracking-wide uppercase">This month</p>
                  <Bar used={p.sentMonth} cap={p.monthlyCap} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
