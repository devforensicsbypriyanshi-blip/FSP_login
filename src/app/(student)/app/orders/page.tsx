import { Receipt } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { getOrders } from '@/lib/data/orders';
import { formatRupees, formatWhen } from '@/lib/format';

export const metadata = { title: 'My Orders' };

const STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'gray' }> = {
  paid: { label: 'Paid', variant: 'success' },
  pending: { label: 'Confirming', variant: 'warning' },
  created: { label: 'Not paid', variant: 'gray' },
  failed: { label: 'Failed', variant: 'error' },
  refunded: { label: 'Refunded', variant: 'gray' },
};

export default async function OrdersPage() {
  const orders = await getOrders(50);

  return (
    <>
      <PageHeader title="My orders" description="Receipts for everything you have bought." />

      {orders.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No orders yet"
          description="Anything you buy will appear here with a receipt you can refer back to."
        >
          <Button asChild size="sm">
            <Link href="/app/store">Browse courses</Link>
          </Button>
        </EmptyState>
      ) : (
        <Card className="p-0">
          <ul className="divide-line flex flex-col divide-y">
            {orders.map((order) => {
              const status = STATUS[order.status] ?? { label: order.status, variant: 'gray' as const };

              return (
                <li key={order.id}>
                  <Link href={`/app/orders/${order.id}`} className="hover:bg-hover flex gap-3 p-4 transition">
                    <span className="bg-primary-light text-primary grid size-10 shrink-0 place-items-center rounded-xl">
                      <Receipt className="size-[18px]" aria-hidden />
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-ink truncate text-[13.5px] font-semibold">
                        {order.items.map((i) => i.title).join(', ') || 'Order'}
                      </p>
                      <p className="text-ink-muted mt-0.5 text-[12px]">{formatWhen(order.createdAt)}</p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-ink text-[13.5px] font-semibold">
                        {formatRupees(order.totalInr)}
                      </span>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
