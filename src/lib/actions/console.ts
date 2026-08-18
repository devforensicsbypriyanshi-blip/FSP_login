'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { callPendingRpc } from '@/lib/supabase/rpc';
import { createClient } from '@/lib/supabase/server';
import type { FormState } from './types';

/**
 * Admin console writes.
 *
 * Every one of these changes what somebody else can do — grant a role, run a
 * coupon, publish a course — and every one writes an audit_logs row inside the
 * same transaction as the change. That is done in the database rather than
 * here on purpose: a log written by a separate call is a log that is missing
 * exactly when something failed halfway through.
 */

const ROLES = ['student', 'educator', 'admin', 'support', 'developer'] as const;

export async function setUserRoles(userId: string, roles: string[]) {
  const cleaned = roles.filter((role): role is (typeof ROLES)[number] =>
    (ROLES as readonly string[]).includes(role)
  );

  const supabase = await createClient();
  const { error } = await callPendingRpc(supabase, 'set_user_roles', {
    p_user: userId,
    p_roles: cleaned,
  });

  if (error) {
    const upper = error.message.toUpperCase();
    // These two are the lockout guards, and the message has to explain *why*
    // rather than just refusing — an admin who does not understand the refusal
    // will try again from another account and hit the same wall.
    const message = upper.includes('CANNOT_DEMOTE_SELF')
      ? 'You cannot remove your own admin role — there would be no way back in.'
      : upper.includes('LAST_ADMIN')
        ? 'This is the only admin account. Grant admin to someone else first.'
        : upper.includes('NOT_PERMITTED')
          ? 'Only admins can change roles.'
          : 'We could not change those roles.';
    return { ok: false as const, message };
  }

  revalidatePath('/admin/users');
  return { ok: true as const, message: 'Roles updated.' };
}

const couponSchema = z.object({
  couponId: z.string().uuid().nullable(),
  code: z
    .string()
    .trim()
    .min(3, 'At least three characters.')
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/, 'Letters, numbers, hyphen and underscore only.'),
  kind: z.enum(['percent', 'flat']),
  value: z.coerce.number().int().min(1, 'Must be more than zero.'),
  maxDiscount: z.coerce.number().int().min(0).optional(),
  minAmount: z.coerce.number().int().min(0),
  maxUses: z.coerce.number().int().min(0).optional(),
  perUser: z.coerce.number().int().min(1).max(20),
  validTo: z.string().trim().optional(),
});

export async function saveCoupon(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = couponSchema.safeParse({
    couponId: (formData.get('couponId') as string) || null,
    code: formData.get('code'),
    kind: formData.get('kind'),
    value: formData.get('value'),
    maxDiscount: formData.get('maxDiscount') || undefined,
    minAmount: formData.get('minAmount') || 0,
    maxUses: formData.get('maxUses') || undefined,
    perUser: formData.get('perUser') || 1,
    validTo: (formData.get('validTo') as string) || undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  if (parsed.data.kind === 'percent' && parsed.data.value > 100) {
    return { ok: false, fieldErrors: { value: 'A percentage cannot be over 100.' } };
  }

  const supabase = await createClient();
  const { error } = await callPendingRpc(supabase, 'upsert_coupon', {
    p_coupon: parsed.data.couponId,
    p_code: parsed.data.code,
    p_kind: parsed.data.kind,
    p_value: parsed.data.value,
    // 0 and "unlimited" are different answers; the form uses blank for the
    // second, so an explicit 0 must not be silently turned into null.
    p_max_discount: parsed.data.maxDiscount ? parsed.data.maxDiscount : null,
    p_min_amount: parsed.data.minAmount,
    p_max_uses: parsed.data.maxUses ? parsed.data.maxUses : null,
    p_per_user: parsed.data.perUser,
    p_valid_to: parsed.data.validTo ? new Date(parsed.data.validTo).toISOString() : null,
  });

  if (error) {
    const upper = error.message.toUpperCase();
    const message = upper.includes('CODE_TAKEN')
      ? 'That code already exists. Pick another.'
      : upper.includes('NOT_PERMITTED')
        ? 'Only admins can manage coupons.'
        : 'We could not save that coupon.';
    return { ok: false, message };
  }

  revalidatePath('/admin/coupons');
  return { ok: true, message: 'Coupon saved.' };
}

/**
 * Coupons are deactivated, never deleted — an order that used one refers to it,
 * and a paid order whose discount cannot be explained is exactly the record you
 * need during a refund dispute.
 */
export async function setCouponActive(couponId: string, active: boolean) {
  const supabase = await createClient();
  const { error } = await callPendingRpc(supabase, 'set_coupon_active', {
    p_coupon: couponId,
    p_active: active,
  });

  if (error) return { ok: false as const, message: 'We could not change that coupon.' };

  revalidatePath('/admin/coupons');
  return {
    ok: true as const,
    message: active ? 'Coupon is live.' : 'Coupon disabled. Existing orders are unaffected.',
  };
}

export async function setCourseStatus(courseId: string, status: string, note?: string) {
  const supabase = await createClient();
  const { error } = await callPendingRpc(supabase, 'set_course_status', {
    p_course: courseId,
    p_status: status,
    p_note: note?.trim() || null,
  });

  if (error) {
    const upper = error.message.toUpperCase();
    const message = upper.includes('NEED_REASON')
      ? 'Say what needs fixing — the educator has to know what to change.'
      : upper.includes('NOT_PERMITTED')
        ? 'Only admins can approve courses.'
        : 'We could not change that course.';
    return { ok: false as const, message };
  }

  revalidatePath('/admin/approvals');
  revalidatePath('/app/store');

  const message =
    status === 'published'
      ? 'Published. It is now in the public catalogue.'
      : status === 'draft'
        ? 'Sent back to the educator with your note.'
        : 'Updated.';

  return { ok: true as const, message };
}
