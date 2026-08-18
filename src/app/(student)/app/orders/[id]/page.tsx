import { ArrowLeft, CheckCircle2, Clock, Receipt, XCircle } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { getOrder } from '@/lib/data/orders';
import { formatRupees, formatWhen } from '@/lib/format';

export const metadata = { title: 'Order' };

/**
 * The receipt, and the page a student lands on straight after paying.
 *
 * At that moment the order is usually still `pending`: the browser has finished
 * but Razorpay's webhook may be a second or two behind. So a pending order is
 * presented as "confirming", not "failed" — and the page refreshes itself until
 * it settles, rather than leaving someone who has just paid staring at an
 * ambiguous screen.
 */

const STATUS: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'error' | 'gray'; note: string }
> = {
  paid: {
    label: 'Paid',
    variant: 'success',
    note: 'Your enrolment is active — the course is in My Courses now.',
  },
  pending: {
    label: 'Confirming',
    variant: 'warning',
    note: 'We are waiting for the payment provider to confirm. This usually takes a few seconds.',
  },
  created: {
    label: 'Not paid',
    variant: 'gray',
    note: 'This order was started but never paid. Nothing was charged.',
  },
  failed: {
    label: 'Failed',
    variant: 'error',
    note: 'The payment did not go through. Nothing was charged — you can try again from the course page.',
  },
  refunded: { label: 'Refunded', variant: 'gray', note: 'This order was refunded.' },
};

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrder(id);

  if (!order) notFound();

  const status = STATUS[order.status] ?? {
    label: order.status,
    variant: 'gray' as const,
    note: '',
  };

  const settling = order.status === 'pending';

  return (
    <>
      {/* Only while settling, and only every 5s — a permanent poll on a paid
          receipt would be pointless load. */}
      {settling && <meta httpEquiv="refresh" content="5" />}

      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link href="/app/orders">
            <ArrowLeft className="size-4" aria-hidden /> All orders
          </Link>
        </Button>
        <h1 className="font-display text-ink text-xl font-bold md:text-2xl">Order receipt</h1>
        <p className="text-ink-muted mt-1 font-mono text-[12px]">{order.id}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <Badge variant={status.variant} dot={settling} pulse={settling}>
            {status.label}
          </Badge>
        </CardHeader>

        <p className="text-ink-secondary flex items-start gap-2.5 text-[13.5px] leading-relaxed">
          {order.status === 'paid' ? (
            <CheckCircle2 className="text-success mt-px size-4 shrink-0" aria-hidden />
          ) : order.status === 'failed' ? (
            <XCircle className="text-error mt-px size-4 shrink-0" aria-hidden />
          ) : (
            <Clock className="text-warning mt-px size-4 shrink-0" aria-hidden />
          )}
          {status.note}
        </p>

        {order.status === 'paid' && (
          <Button asChild size="sm" className="mt-4 self-start">
            <Link href="/app/learning">Go to my courses</Link>
          </Button>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
          <Receipt className="text-ink-muted size-[18px]" aria-hidden />
        </CardHeader>

        <ul className="divide-line flex flex-col divide-y">
          {order.items.map((item, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-3 first:pt-0">
              <span className="text-ink text-[13.5px]">{item.title}</span>
              <span className="text-ink-secondary shrink-0 text-[13.5px]">
                {formatRupees(item.unitPriceInr)}
              </span>
            </li>
          ))}
        </ul>

        <dl className="border-line mt-3 flex flex-col gap-1.5 border-t pt-3 text-[13px]">
          <div className="flex justify-between">
            <dt className="text-ink-muted">Subtotal</dt>
            <dd className="text-ink-secondary">{formatRupees(order.subtotalInr)}</dd>
          </div>
          {order.discountInr > 0 && (
            <div className="flex justify-between">
              <dt className="text-ink-muted">Discount</dt>
              <dd className="text-success">−{formatRupees(order.discountInr)}</dd>
            </div>
          )}
          <div className="border-line flex justify-between border-t pt-1.5">
            <dt className="text-ink font-semibold">Total</dt>
            <dd className="font-display text-ink text-base font-bold">{formatRupees(order.totalInr)}</dd>
          </div>
        </dl>

        <p className="text-ink-light mt-4 text-[11.5px]">
          Placed {formatWhen(order.createdAt)}
          {order.paymentId && ` · Payment ${order.paymentId}`}
          {order.method && ` · ${order.method}`}
        </p>
      </Card>

      <p className="text-ink-muted text-center text-[12px] leading-relaxed">
        All sales are final. If something is wrong with this order, contact support and quote the order id
        above.
      </p>
    </>
  );
}
