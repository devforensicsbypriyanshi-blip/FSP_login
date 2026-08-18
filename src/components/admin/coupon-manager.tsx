'use client';

import { Plus, Power, PowerOff, Ticket, X } from 'lucide-react';
import { useActionState, useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input, Select } from '@/components/ui/field';
import { saveCoupon, setCouponActive } from '@/lib/actions/console';
import { IDLE_FORM_STATE } from '@/lib/actions/types';
import { formatDate } from '@/lib/format';
import type { Coupon } from '@/lib/data/console';

/**
 * Coupon codes.
 *
 * Codes are disabled, never deleted. An order that used one refers to it, and a
 * paid order whose discount cannot be explained is precisely the record needed
 * during a refund dispute — so the destructive-looking button is a toggle.
 *
 * `used_count` is displayed but never editable. It is the record of what was
 * actually redeemed, and an editable record is not one.
 */
export function CouponManager({ coupons }: { coupons: Coupon[] }) {
  const [state, action, saving] = useActionState(saveCoupon, IDLE_FORM_STATE);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [kind, setKind] = useState<string>('percent');
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  function toggle(coupon: Coupon) {
    startTransition(async () => {
      setFeedback(await setCouponActive(coupon.id, !coupon.isActive));
    });
  }

  function edit(coupon: Coupon) {
    setEditing(coupon);
    setKind(coupon.kind);
    setOpen(true);
  }

  const showing = open || editing;

  return (
    <div className="flex flex-col gap-4">
      {feedback && (
        <p
          className={
            feedback.ok
              ? 'border-success-border bg-success-bg text-success rounded-xl border p-3 text-[13px]'
              : 'border-error-border bg-error-bg text-error rounded-xl border p-3 text-[13px]'
          }
          role={feedback.ok ? 'status' : 'alert'}
        >
          {feedback.message}
        </p>
      )}

      {showing ? (
        <form
          action={action}
          className="border-primary bg-surface flex flex-col gap-3 rounded-2xl border-2 p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-ink font-semibold">{editing ? `Edit ${editing.code}` : 'New coupon'}</p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label="Close"
              onClick={() => {
                setOpen(false);
                setEditing(null);
              }}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>

          {state.message && (
            <p
              className={
                state.ok
                  ? 'border-success-border bg-success-bg text-success rounded-xl border p-3 text-[13px]'
                  : 'border-error-border bg-error-bg text-error rounded-xl border p-3 text-[13px]'
              }
              role={state.ok ? 'status' : 'alert'}
            >
              {state.message}
            </p>
          )}

          <input type="hidden" name="couponId" value={editing?.id ?? ''} />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Code"
              htmlFor="code"
              error={state.fieldErrors?.code}
              hint="Shown to students exactly as typed."
            >
              <Input
                id="code"
                name="code"
                defaultValue={editing?.code}
                placeholder="EARLYBIRD"
                className="font-mono uppercase"
                required
              />
            </Field>

            <Field label="Type" htmlFor="kind">
              <Select id="kind" name="kind" value={kind} onChange={(event) => setKind(event.target.value)}>
                <option value="percent">Percentage off</option>
                <option value="flat">Flat amount off</option>
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={kind === 'percent' ? 'Percent off' : 'Rupees off'}
              htmlFor="value"
              error={state.fieldErrors?.value}
            >
              <Input
                id="value"
                name="value"
                type="number"
                min={1}
                max={kind === 'percent' ? 100 : undefined}
                defaultValue={editing?.value ?? (kind === 'percent' ? 20 : 500)}
                required
              />
            </Field>

            {kind === 'percent' && (
              <Field label="Cap the discount at (₹)" htmlFor="maxDiscount" hint="Blank for no cap.">
                <Input
                  id="maxDiscount"
                  name="maxDiscount"
                  type="number"
                  min={0}
                  defaultValue={editing?.maxDiscountInr ?? ''}
                />
              </Field>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Minimum order (₹)" htmlFor="minAmount">
              <Input
                id="minAmount"
                name="minAmount"
                type="number"
                min={0}
                defaultValue={editing?.minAmountInr ?? 0}
              />
            </Field>
            <Field label="Total uses" htmlFor="maxUses" hint="Blank for unlimited.">
              <Input
                id="maxUses"
                name="maxUses"
                type="number"
                min={1}
                defaultValue={editing?.maxUses ?? ''}
              />
            </Field>
            <Field label="Per student" htmlFor="perUser">
              <Input
                id="perUser"
                name="perUser"
                type="number"
                min={1}
                max={20}
                defaultValue={editing?.perUserLimit ?? 1}
              />
            </Field>
          </div>

          <Field label="Expires" htmlFor="validTo" hint="Blank for no expiry.">
            <Input
              id="validTo"
              name="validTo"
              type="date"
              defaultValue={editing?.validTo ? editing.validTo.slice(0, 10) : ''}
            />
          </Field>

          <Button type="submit" size="sm" className="self-start" loading={saving}>
            {editing ? 'Save changes' : 'Create coupon'}
          </Button>
        </form>
      ) : (
        <Button size="sm" variant="outline" className="self-start" onClick={() => setOpen(true)}>
          <Plus className="size-4" aria-hidden /> New coupon
        </Button>
      )}

      {coupons.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title="No coupons yet"
          description="Discount codes appear here once you create one."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {coupons.map((coupon) => {
            const expired = coupon.validTo ? new Date(coupon.validTo) < new Date() : false;
            const exhausted = coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses;
            const live = coupon.isActive && !expired && !exhausted;

            return (
              <div
                key={coupon.id}
                className={
                  live
                    ? 'border-primary bg-primary-ultra rounded-2xl border border-dashed p-4'
                    : 'border-line-medium bg-hover rounded-2xl border border-dashed p-4'
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <p
                    className={
                      live
                        ? 'text-primary font-mono text-lg font-bold'
                        : 'text-ink-muted font-mono text-lg font-bold'
                    }
                  >
                    {coupon.code}
                  </p>
                  <Badge variant={live ? 'success' : 'gray'}>
                    {!coupon.isActive ? 'Disabled' : expired ? 'Expired' : exhausted ? 'Used up' : 'Live'}
                  </Badge>
                </div>

                <p className="text-ink mt-1 text-[13px] font-semibold">
                  {coupon.kind === 'percent'
                    ? `${coupon.value}% off${coupon.maxDiscountInr ? ` (max ₹${coupon.maxDiscountInr})` : ''}`
                    : `₹${coupon.value} off`}
                </p>

                <p className="text-ink-muted mt-1 text-[12px]">
                  {coupon.usedCount} {coupon.maxUses ? `of ${coupon.maxUses}` : ''} uses
                  {coupon.validTo ? ` · to ${formatDate(coupon.validTo)}` : ' · no expiry'}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => edit(coupon)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="outline" loading={pending} onClick={() => toggle(coupon)}>
                    {coupon.isActive ? (
                      <>
                        <PowerOff className="size-4" aria-hidden /> Disable
                      </>
                    ) : (
                      <>
                        <Power className="size-4" aria-hidden /> Enable
                      </>
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
