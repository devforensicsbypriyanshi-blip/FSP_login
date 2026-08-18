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

drop policy if exists "email_events: staff read" on public.email_events;
create policy "email_events: staff read" on public.email_events
  for select using (public.is_staff());

drop policy if exists "suppressions: staff read" on public.email_suppressions;
create policy "suppressions: staff read" on public.email_suppressions
  for select using (public.is_staff());

drop policy if exists "suppressions: admin releases" on public.email_suppressions;
create policy "suppressions: admin releases" on public.email_suppressions
  for update using (public.has_role('admin'));

drop policy if exists "email_log: staff read" on public.email_log;
create policy "email_log: staff read" on public.email_log
  for select using (public.is_staff());

drop policy if exists "email_log: read own" on public.email_log;
create policy "email_log: read own" on public.email_log
  for select using (user_id = auth.uid());

-- The event stream is evidence of what we did and did not send.
revoke update, delete on public.email_events from authenticated, anon;
