'use client';

import { CreditCard, Tag } from 'lucide-react';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { formatRupees } from '@/lib/format';

/**
 * Razorpay checkout.
 *
 * What this component is NOT allowed to do, and why:
 *
 *   It does not send an amount. The request carries course ids; the server
 *   prices them. Anything else and the price is whatever the buyer's devtools
 *   say it is.
 *
 *   It does not grant access on success. The handler below fires on the buyer's
 *   own machine and can be called by hand from a console. It only navigates to
 *   a page that reads the real order status — access comes from the webhook.
 *
 * The checkout script loads lazily on click rather than on page load, so
 * students browsing the catalogue never pay for 100 KB they may not use.
 */

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export function CheckoutButton({
  courseIds,
  priceInr,
  label = 'Buy now',
  student,
}: {
  courseIds: string[];
  priceInr: number;
  label?: string;
  student: { name: string; email: string };
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [scriptReady, setScriptReady] = useState(false);
  const [loadScript, setLoadScript] = useState(false);
  const [pending, setPending] = useState(false);
  const [coupon, setCoupon] = useState('');
  const [showCoupon, setShowCoupon] = useState(false);

  async function checkout() {
    setPending(true);
    setLoadScript(true);

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ courseIds, coupon: coupon.trim() || undefined }),
      });

      const body = (await response.json()) as {
        error?: string;
        free?: boolean;
        orderId?: string;
        gatewayOrderId?: string;
        amountInr?: number;
        keyId?: string;
      };

      if (!response.ok) {
        toast({ tone: 'error', message: body.error ?? 'We could not start that checkout.' });
        setPending(false);
        return;
      }

      if (body.free) {
        toast({ tone: 'success', message: 'Order placed — no payment needed.' });
        router.push(`/app/orders/${body.orderId}`);
        return;
      }

      // Wait for the SDK if the click beat the download.
      if (!window.Razorpay) {
        await new Promise<void>((resolve) => {
          const poll = setInterval(() => {
            if (window.Razorpay) {
              clearInterval(poll);
              resolve();
            }
          }, 100);
          setTimeout(() => {
            clearInterval(poll);
            resolve();
          }, 8000);
        });
      }

      if (!window.Razorpay) {
        toast({ tone: 'error', message: 'The payment window could not load. Check your connection.' });
        setPending(false);
        return;
      }

      const checkoutInstance = new window.Razorpay({
        key: body.keyId,
        order_id: body.gatewayOrderId,
        amount: (body.amountInr ?? 0) * 100,
        currency: 'INR',
        name: 'Forensic Science by Priyanshi',
        description: courseIds.length > 1 ? `${courseIds.length} courses` : 'Course enrolment',
        prefill: { name: student.name, email: student.email },
        theme: { color: '#1a2b4a' },
        handler: () => {
          // Deliberately does not mark anything paid. The order page reads the
          // real status, which the webhook sets a moment later.
          toast({ tone: 'success', message: 'Payment received — confirming your enrolment…' });
          router.push(`/app/orders/${body.orderId}`);
          router.refresh();
        },
        modal: {
          ondismiss: () => {
            setPending(false);
            toast({ tone: 'info', message: 'Checkout cancelled. Nothing was charged.' });
          },
        },
      });

      checkoutInstance.open();
    } catch {
      toast({ tone: 'error', message: 'You appear to be offline. Please try again.' });
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {loadScript && (
        <Script
          src="https://checkout.razorpay.com/v1/checkout.js"
          onLoad={() => setScriptReady(true)}
          onError={() =>
            toast({ tone: 'error', message: 'The payment window could not load. Check your connection.' })
          }
        />
      )}

      {showCoupon && (
        <div className="flex gap-2">
          <Input
            value={coupon}
            onChange={(e) => setCoupon(e.target.value.toUpperCase())}
            placeholder="Discount code"
            aria-label="Discount code"
            className="max-w-[12rem] font-mono uppercase"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={checkout} loading={pending}>
          <CreditCard className="size-4" aria-hidden /> {label} · {formatRupees(priceInr)}
        </Button>

        {!showCoupon && (
          <Button variant="ghost" size="sm" onClick={() => setShowCoupon(true)}>
            <Tag className="size-4" aria-hidden /> Have a code?
          </Button>
        )}
      </div>

      <p className="text-ink-muted text-[11.5px]">
        {scriptReady ? 'Secure payment by Razorpay.' : 'Payments are processed securely by Razorpay.'} All
        sales are final — please review the course before buying.
      </p>
    </div>
  );
}
