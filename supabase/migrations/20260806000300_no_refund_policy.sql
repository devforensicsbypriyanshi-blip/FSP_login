-- =============================================================================
-- 0012 · No-refund policy
--
-- Client decision (2026-08-06): all sales are final. No refund window.
--
-- What this changes:
--   - Students can never self-serve a refund. The UI does not offer one.
--   - Checkout and the terms page state the policy from one setting.
--
-- What it deliberately does NOT change:
--   - Admins keep the ability to issue a refund. A "no refunds" policy is a
--     commercial stance, not a technical one — duplicate charges, failed
--     access after payment, and card chargebacks all still happen, and you
--     need the ability to return money in those cases. Removing the tool
--     would not remove the situations; it would just force you to handle
--     them manually in the Razorpay dashboard with no audit trail here.
--   - refunds/payments stay append-only, so any exception is recorded.
-- =============================================================================

update public.app_settings
set
  value         = '0',
  default_value = '0',
  description   = 'Days after purchase a student may self-serve a refund. 0 = never; all sales are final. Admins can still issue an exceptional refund for duplicate charges or failed access.',
  is_protected  = true
where key = 'payments.refund_window_days';

update public.app_settings
set
  value = '"All sales are final. Course fees are non-refundable once payment is complete, as access to course material is granted immediately. If you were charged twice or cannot access what you paid for, contact support and we will put it right."',
  default_value = '"All sales are final. Course fees are non-refundable once payment is complete, as access to course material is granted immediately. If you were charged twice or cannot access what you paid for, contact support and we will put it right."',
  description = 'Shown at checkout, on the terms page and on any refund enquiry. Must match the published policy page that Razorpay requires.'
where key = 'payments.refund_policy_text';

-- Explicit flag so the UI never has to infer intent from a number.
insert into public.feature_flags
  (key, name, description, category, enabled, default_enabled, is_protected, is_kill_switch)
values
  ('payments.self_serve_refund', 'Self-serve refunds',
   'Lets students request a refund themselves. OFF — all sales are final.',
   'Payments', false, false, true, false),

  ('payments.admin_refund', 'Admin refunds',
   'Lets an admin issue an exceptional refund (duplicate charge, failed access, chargeback avoidance). Kept ON despite the no-refund policy, because those situations occur regardless of policy.',
   'Payments', true, true, true, false)
on conflict (key) do nothing;

-- Require a reason on every refund, so an exception to a no-refund policy is
-- never anonymous. Enforced here rather than in the UI, which can be bypassed.
alter table public.refunds drop constraint if exists refunds_reason_required;
alter table public.refunds
  add constraint refunds_reason_required
  check (reason is not null and length(btrim(reason)) >= 10)
  not valid;
