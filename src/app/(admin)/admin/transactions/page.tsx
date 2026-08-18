import { AlertTriangle, IndianRupee, Receipt, TrendingUp, XCircle } from 'lucide-react';
import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { KpiCard } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { getOrders } from '@/lib/data/orders';
import { formatRupees, formatWhen } from '@/lib/format';

export const metadata = { title: 'Payments' };

const STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'gray' }> = {
  paid: { label: 'Paid', variant: 'success' },
  pending: { label: 'Confirming', variant: 'warning' },
  created: { label: 'Abandoned', variant: 'gray' },
  failed: { label: 'Failed', variant: 'error' },
  refunded: { label: 'Refunded', variant: 'gray' },
};

/**
 * Transactions.
 *
 * "Stuck" is the number worth watching: an order that has been pending for more
 * than a few minutes means the webhook did not arrive or did not succeed, and
 * somewhere a student has paid and has no access. That is the one payment
 * failure a customer definitely notices.
 */
export default async function AdminTransactionsPage() {
  const orders = await getOrders(200);

  const paid = orders.filter((o) => o.status === 'paid');
  const failed = orders.filter((o) => o.status === 'failed');
  const revenue = paid.reduce((sum, o) => sum + o.totalInr, 0);

  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  const stuck = orders.filter(
    (o) => o.status === 'pending' && new Date(o.createdAt).getTime() < tenMinutesAgo
  );

  return (
    <>
      <PageHeader title="Payments" description="Orders, captures and anything that needs a human." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Revenue"
          value={formatRupees(revenue)}
          trend={`${paid.length} paid orders`}
          icon={<IndianRupee className="size-5" aria-hidden />}
          tone="bg-success-bg text-success"
        />
        <KpiCard
          label="Paid"
          value={String(paid.length)}
          trend="Completed"
          icon={<TrendingUp className="size-5" aria-hidden />}
          tone="bg-primary-light text-primary"
        />
        <KpiCard
          label="Failed"
          value={String(failed.length)}
          trend="Nothing charged"
          icon={<XCircle className="size-5" aria-hidden />}
          tone="bg-error-bg text-error"
        />
        <KpiCard
          label="Stuck"
          value={String(stuck.length)}
          trend="Pending over 10 min"
          icon={<AlertTriangle className="size-5" aria-hidden />}
          tone={stuck.length > 0 ? 'bg-error-bg text-error' : 'bg-success-bg text-success'}
        />
      </div>

      {stuck.length > 0 && (
        <div className="border-error-border bg-error-bg text-error flex items-start gap-2.5 rounded-xl border p-4 text-[13px]">
          <AlertTriangle className="mt-px size-4 shrink-0" aria-hidden />
          <p className="leading-relaxed">
            <strong>
              {stuck.length} order{stuck.length === 1 ? '' : 's'} stuck at confirming.
            </strong>{' '}
            The webhook did not arrive or failed. Check Razorpay&rsquo;s dashboard for the payment, then check{' '}
            <code className="font-mono">webhook_events</code> for a failed row. If the money was taken, enrol
            the student by hand from Enrolments — do not make them pay twice.
          </p>
        </div>
      )}

      <Card className="p-0">
        <CardHeader className="p-5 pb-3">
          <CardTitle>All orders</CardTitle>
          <Badge variant="gray">{orders.length}</Badge>
        </CardHeader>

        {orders.length === 0 ? (
          <div className="p-5 pt-0">
            <EmptyState
              icon={Receipt}
              title="No orders yet"
              description="Orders appear here once payments are switched on and a student buys a course."
            />
          </div>
        ) : (
          <ul className="divide-line flex flex-col divide-y">
            {orders.map((order) => {
              const status = STATUS[order.status] ?? { label: order.status, variant: 'gray' as const };

              return (
                <li key={order.id} className="flex items-center gap-3.5 p-4">
                  <Avatar name={order.buyerName ?? 'Unknown'} size="md" />

                  <div className="min-w-0 flex-1">
                    <p className="text-ink text-[13.5px] font-semibold">{order.buyerName ?? 'Unknown'}</p>
                    <p className="text-ink-muted truncate text-[12px]">{order.buyerEmail}</p>
                    <p className="text-ink-secondary mt-1 truncate text-[12.5px]">
                      {order.items.map((i) => i.title).join(', ') || '—'}
                    </p>
                    <p className="text-ink-light mt-0.5 font-mono text-[11px]">
                      {formatWhen(order.createdAt)}
                      {order.paymentId && ` · ${order.paymentId}`}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-ink text-[13.5px] font-semibold">
                      {formatRupees(order.totalInr)}
                    </span>
                    <Badge variant={status.variant}>{status.label}</Badge>
                    <Link
                      href={`/app/orders/${order.id}`}
                      className="text-primary text-[11.5px] font-semibold hover:underline"
                    >
                      Receipt
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <p className="text-ink-muted text-center text-[12px] leading-relaxed">
        Refunds are not offered — all sales are final. The refunds table exists for exceptional cases and
        requires a written reason of at least ten characters.
      </p>
    </>
  );
}
