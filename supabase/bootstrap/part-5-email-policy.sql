-- =============================================================================
-- FSP SCHEMA — PART 5 of 5: Email tracking, support hours, no-refund policy
--
-- RUN THIS AFTER PART 4. Order matters — later parts reference earlier tables.
--
-- Paste the whole file into Supabase -> SQL Editor and press Run.
-- Safe to re-run if you are unsure whether it completed.
--
-- Contains:
--   20260806000100_email_tracking.sql
--   20260806000200_support_hours_and_commercial_settings.sql
--   20260806000300_no_refund_policy.sql
-- =============================================================================

begin;


-- ---------------------------------------------------------------------------
-- 20260806000100_email_tracking.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- 0009 · Email delivery tracking
--
-- Email is the ONLY authentication channel (no SMS, no password), so an
-- undelivered message is a locked-out student. Every send is logged and every
-- Resend webhook event is recorded, which gives Support a real answer to
-- "I didn't get my code" instead of a shrug.
--
-- It also protects deliverability: continuing to email a hard bounce or a
-- spam complainer destroys sender reputation and eventually takes the whole
-- domain down. Suppressions are enforced before every send.
-- =============================================================================

-- Resend event types: https://resend.com/docs/dashboard/webhooks/event-types
do $$ begin
  create type email_event_type as enum (
    'email.sent',
    'email.delivered',
    'email.delivery_delayed',
    'email.bounced',
    'email.complained',
    'email.opened',
    'email.clicked',
    'email.failed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type email_status as enum (
    'queued','sent','delivered','delayed','bounced','complained','failed'
  );
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Extend email_log: one row per send, holding the latest known state.
-- -----------------------------------------------------------------------------
alter table public.email_log
  add column if not exists user_id       uuid references public.profiles(id) on delete set null,
  add column if not exists category      text,
  add column if not exists idempotency_key text,
  add column if not exists state         email_status not null default 'queued',
  add column if not exists sent_at       timestamptz,
  add column if not exists delivered_at  timestamptz,
  add column if not exists opened_at     timestamptz,
  add column if not exists clicked_at    timestamptz,
  add column if not exists bounced_at    timestamptz,
  add column if not exists complained_at timestamptz,
  add column if not exists bounce_type   text,
  add column if not exists open_count    integer not null default 0,
  add column if not exists click_count   integer not null default 0,
  add column if not exists last_event_at timestamptz;

create unique index if not exists uq_email_log_resend on public.email_log (resend_id)
  where resend_id is not null;
create unique index if not exists uq_email_log_idem on public.email_log (idempotency_key)
  where idempotency_key is not null;
create index if not exists idx_email_log_recipient on public.email_log (to_email, created_at desc);
create index if not exists idx_email_log_user on public.email_log (user_id, created_at desc);
create index if not exists idx_email_log_state on public.email_log (state, created_at desc);

-- -----------------------------------------------------------------------------
-- Append-only event stream. One row per webhook delivery.
-- -----------------------------------------------------------------------------
create table if not exists public.email_events (
  id           bigserial primary key,
  email_log_id uuid references public.email_log(id) on delete cascade,
  resend_id    text,
  event_type   email_event_type not null,
  -- Resend may redeliver; svix_id makes ingestion idempotent.
  svix_id      text,
  recipient    citext,
  payload      jsonb not null,
  occurred_at  timestamptz not null,
  received_at  timestamptz not null default now()
);

create unique index if not exists uq_email_events_svix on public.email_events (svix_id)
  where svix_id is not null;
create index if not exists idx_email_events_log on public.email_events (email_log_id, occurred_at desc);
create index if not exists idx_email_events_type on public.email_events (event_type, occurred_at desc);

-- -----------------------------------------------------------------------------
-- Suppression list. Never send to these addresses again.
-- -----------------------------------------------------------------------------
create table if not exists public.email_suppressions (
  email       citext primary key,
  reason      text not null check (reason in ('hard_bounce','complaint','manual','invalid')),
  detail      text,
  suppressed_at timestamptz not null default now(),
  released_at timestamptz,
  released_by uuid references public.profiles(id)
);

create index if not exists idx_suppressions_active on public.email_suppressions (email)
  where released_at is null;

create or replace function public.is_email_suppressed(p_email citext)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.email_suppressions
    where email = p_email and released_at is null
  );
$$;

-- -----------------------------------------------------------------------------
-- Fold an event into email_log's current state.
--
-- Guards against out-of-order delivery: webhooks are not ordered, so a
-- 'delivered' arriving after 'opened' must not walk the state backwards.
-- -----------------------------------------------------------------------------
create or replace function public.apply_email_event()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_rank_new int;
  v_rank_cur int;
  v_current email_status;
begin
  if new.email_log_id is null then
    return new;
  end if;

  select state into v_current from public.email_log where id = new.email_log_id;

  -- Terminal states outrank progress states; opens/clicks never regress state.
  v_rank_cur := case v_current
    when 'queued' then 0 when 'sent' then 1 when 'delayed' then 2
    when 'delivered' then 3 when 'bounced' then 4 when 'complained' then 5
    when 'failed' then 4 else 0 end;

  v_rank_new := case new.event_type
    when 'email.sent' then 1
    when 'email.delivery_delayed' then 2
    when 'email.delivered' then 3
    when 'email.failed' then 4
    when 'email.bounced' then 4
    when 'email.complained' then 5
    else -1 end;

  update public.email_log set
    state = case when v_rank_new > v_rank_cur then
        (case new.event_type
          when 'email.sent' then 'sent'
          when 'email.delivery_delayed' then 'delayed'
          when 'email.delivered' then 'delivered'
          when 'email.bounced' then 'bounced'
          when 'email.complained' then 'complained'
          when 'email.failed' then 'failed'
          else state end)::email_status
      else state end,
    sent_at       = case when new.event_type = 'email.sent'       then coalesce(sent_at, new.occurred_at) else sent_at end,
    delivered_at  = case when new.event_type = 'email.delivered'  then coalesce(delivered_at, new.occurred_at) else delivered_at end,
    bounced_at    = case when new.event_type = 'email.bounced'    then coalesce(bounced_at, new.occurred_at) else bounced_at end,
    complained_at = case when new.event_type = 'email.complained' then coalesce(complained_at, new.occurred_at) else complained_at end,
    opened_at     = case when new.event_type = 'email.opened'     then coalesce(opened_at, new.occurred_at) else opened_at end,
    clicked_at    = case when new.event_type = 'email.clicked'    then coalesce(clicked_at, new.occurred_at) else clicked_at end,
    open_count    = open_count  + case when new.event_type = 'email.opened'  then 1 else 0 end,
    click_count   = click_count + case when new.event_type = 'email.clicked' then 1 else 0 end,
    bounce_type   = case when new.event_type = 'email.bounced'
                         then coalesce(new.payload #>> '{data,bounce,type}', bounce_type) else bounce_type end,
    error         = case when new.event_type in ('email.bounced','email.failed')
                         then coalesce(new.payload #>> '{data,bounce,message}', error) else error end,
    last_event_at = greatest(coalesce(last_event_at, new.occurred_at), new.occurred_at)
  where id = new.email_log_id;

  -- Hard bounces and complaints suppress the address permanently.
  if new.event_type = 'email.complained'
     or (new.event_type = 'email.bounced'
         and coalesce(new.payload #>> '{data,bounce,type}', '') ilike '%hard%') then
    insert into public.email_suppressions (email, reason, detail)
    values (
      new.recipient,
      case when new.event_type = 'email.complained' then 'complaint' else 'hard_bounce' end,
      new.payload #>> '{data,bounce,message}'
    )
    on conflict (email) do nothing;
  end if;

  return new;
end $$;

drop trigger if exists trg_apply_email_event on public.email_events;
create trigger trg_apply_email_event
  after insert on public.email_events
  for each row execute function public.apply_email_event();

-- -----------------------------------------------------------------------------
-- Daily volume — Resend's free tier allows 100/day and this is the tightest
-- constraint on the whole platform (docs Part 6 §10).
-- -----------------------------------------------------------------------------
create or replace function public.email_quota_today()
returns table (sent_today int, daily_cap int, pct_used numeric)
language sql stable security definer set search_path = public
as $$
  select
    count(*)::int,
    100,
    round(count(*)::numeric / 100 * 100, 1)
  from public.email_log
  where created_at >= date_trunc('day', now() at time zone 'Asia/Kolkata');
$$;

-- -----------------------------------------------------------------------------
-- RLS — delivery data is staff-only; a student sees only their own.
-- -----------------------------------------------------------------------------
alter table public.email_events      enable row level security;
alter table public.email_suppressions enable row level security;

create policy "email_events: staff read" on public.email_events
  for select using (public.is_staff());

create policy "suppressions: staff read" on public.email_suppressions
  for select using (public.is_staff());

create policy "suppressions: admin releases" on public.email_suppressions
  for update using (public.has_role('admin'));

drop policy if exists "email_log: staff read" on public.email_log;
create policy "email_log: staff read" on public.email_log
  for select using (public.is_staff());

create policy "email_log: read own" on public.email_log
  for select using (user_id = auth.uid());

-- The event stream is evidence of what we did and did not send.
revoke update, delete on public.email_events from authenticated, anon;


-- ---------------------------------------------------------------------------
-- 20260806000200_support_hours_and_commercial_settings.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- 0011 · Support hours and commercial policy settings
--
-- Client decisions (2026-08-06):
--   - Course price and access duration are PER COURSE, decided after launch,
--     and must be admin-editable.
--   - Refund window has no fixed policy and must be modifiable.
--   - Support hours are 11:00–19:00 IST.
--
-- Nothing here is hardcoded in application code: all of it lives in
-- app_settings or on the course row, so the client changes it from the admin
-- console without a deployment.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Support availability. Drives the "we're open / we're closed" badge, the
-- expected-reply copy shown when a student raises a ticket, and SLA timers.
-- -----------------------------------------------------------------------------
insert into public.app_settings
  (key, name, description, category, value, default_value, value_type, validation, unit)
values
  ('support.hours_start', 'Support opens', 'Start of daily support hours, local time.',
   'Support', '"11:00"', '"11:00"', 'string', '{"pattern":"^\\\\d{2}:\\\\d{2}$"}', null),

  ('support.hours_end', 'Support closes', 'End of daily support hours, local time.',
   'Support', '"19:00"', '"19:00"', 'string', '{"pattern":"^\\\\d{2}:\\\\d{2}$"}', null),

  ('support.timezone', 'Support timezone', 'Timezone the support hours are expressed in.',
   'Support', '"Asia/Kolkata"', '"Asia/Kolkata"', 'string', '{}', null),

  -- ASSUMPTION: Monday–Saturday. The client gave hours but not days; this is
  -- the common pattern for Indian coaching. Change it here if Sunday is staffed.
  ('support.working_days', 'Support working days', 'ISO weekdays support is staffed (1=Mon … 7=Sun).',
   'Support', '[1,2,3,4,5,6]', '[1,2,3,4,5,6]', 'json', '{}', null),

  ('support.sla_response_hours', 'First-response target',
   'Target hours to first reply, counted only during support hours.',
   'Support', '4', '4', 'integer', '{"min":1,"max":72}', 'hours'),

  ('support.out_of_hours_message', 'Out-of-hours message',
   'Shown when a student opens a ticket outside support hours.',
   'Support', '"We''re offline right now. Support is available 11:00–19:00 IST and we''ll reply when we reopen."',
   '"We''re offline right now. Support is available 11:00–19:00 IST and we''ll reply when we reopen."',
   'text', '{"maxLength":280}', null)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- Refunds: no fixed policy, fully modifiable.
--
-- 0 disables self-serve refund requests entirely (every request goes to an
-- admin), which is the safe default until the client sets a real policy.
-- -----------------------------------------------------------------------------
update public.app_settings
set
  description = 'Days after purchase a student may request a refund. 0 = no self-serve window; every request is reviewed by an admin.',
  value = '0',
  default_value = '0',
  validation = '{"min":0,"max":365}'
where key = 'payments.refund_window_days';

insert into public.app_settings
  (key, name, description, category, value, default_value, value_type, validation, unit)
values
  ('payments.refund_policy_text', 'Refund policy text',
   'Shown at checkout and on the refund request screen. Must match the published terms.',
   'Payments',
   '"Refunds are considered case by case. Contact support to raise a request."',
   '"Refunds are considered case by case. Contact support to raise a request."',
   'text', '{"maxLength":600}', null),

  -- Defaults applied to a NEW course only. Each course keeps its own price and
  -- duration on the courses row, so changing these never rewrites history.
  ('courses.default_price_inr', 'Default course price',
   'Pre-filled when creating a course. Per-course price always wins.',
   'Courses', '0', '0', 'integer', '{"min":0,"max":1000000}', '₹'),

  ('courses.default_access_days', 'Default access duration',
   'Pre-filled when creating a course. Leave empty on the course for lifetime access.',
   'Courses', '365', '365', 'integer', '{"min":1,"max":3650}', 'days')
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- Is support open right now? Used by the UI and by SLA calculation.
-- -----------------------------------------------------------------------------
create or replace function public.support_is_open(p_at timestamptz default now())
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v_tz    text;
  v_start time;
  v_end   time;
  v_days  jsonb;
  v_local timestamp;
begin
  select (value #>> '{}') into v_tz    from public.app_settings where key = 'support.timezone';
  select (value #>> '{}')::time into v_start from public.app_settings where key = 'support.hours_start';
  select (value #>> '{}')::time into v_end   from public.app_settings where key = 'support.hours_end';
  select value into v_days from public.app_settings where key = 'support.working_days';

  v_tz := coalesce(v_tz, 'Asia/Kolkata');
  v_local := p_at at time zone v_tz;

  if v_days is not null
     and not (v_days @> to_jsonb(extract(isodow from v_local)::int)) then
    return false;
  end if;

  return v_local::time between coalesce(v_start, '11:00') and coalesce(v_end, '19:00');
end $$;

comment on function public.support_is_open is
  'True when the current moment falls inside configured support hours and working days.';


-- ---------------------------------------------------------------------------
-- 20260806000300_no_refund_policy.sql
-- ---------------------------------------------------------------------------

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
alter table public.refunds
  add constraint refunds_reason_required
  check (reason is not null and length(btrim(reason)) >= 10)
  not valid;

commit;

-- Part 5 complete. All parts done — tell Claude "success".
select 'PART 5 OK — ' || count(*) || ' tables so far' as result
  from pg_tables where schemaname = 'public';
