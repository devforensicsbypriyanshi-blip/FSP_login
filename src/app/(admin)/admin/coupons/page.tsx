import { Ticket } from 'lucide-react';
import { CouponManager } from '@/components/admin/coupon-manager';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { getCoupons } from '@/lib/data/console';

export const metadata = { title: 'Coupons' };

export default async function CouponsPage() {
  const coupons = await getCoupons();

  return (
    <>
      <PageHeader title="Coupons & offers" description="Promotional discount codes." />

      <Card>
        <CardHeader>
          <CardTitle>Codes</CardTitle>
          <Ticket className="text-primary size-[18px]" aria-hidden />
        </CardHeader>
        <CouponManager coupons={coupons} />
      </Card>

      <p className="text-ink-muted mx-auto max-w-xl text-center text-xs leading-relaxed">
        Codes are readable by staff only — before this table was locked down, every signed-in user could read
        every code, which on a paid platform is a price list anyone can forward. Discounts are recalculated
        server-side at checkout; the browser never sends a price.
      </p>
    </>
  );
}
