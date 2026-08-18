-- =============================================================================
-- 0016 · Notification queue + Firebase Cloud Messaging tokens
--
-- Why a queue rather than sending inline:
--
--   A class reminder to 200 students is 200 push calls and 200 emails. Doing
--   that inside the request that triggered it means the educator's "schedule
--   class" click hangs for a minute and half of it fails silently. Worse,
--   Resend's free tier is 100 emails A DAY — a burst has to be shaped, not
--   fired.
--
--   So: writing a notification is a fast INSERT. Delivery is a separate worker
--   draining this table, which can retry, back off, respect quotas, and be
--   restarted without losing anything.
--
-- Idempotency is the property that matters. A worker that crashes mid-batch
-- must not re-send what already went out, hence the explicit status machine and
-- `claimed_at` rather than a plain "pending/sent" boolean.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Device push tokens (FCM).
--
-- Separate from push_subscriptions, which holds raw Web Push (VAPID) keys.
-- Both can coexist: FCM is the transport we send through, and the VAPID table
-- stays for the self-hosted fallback described in docs Part 4 §4.
-- -----------------------------------------------------------------------------
create table if not exists public.push_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  provider     text not null default 'fcm' check (provider in ('fcm', 'webpush')),
  token        text not null,
  device_label text,
  user_agent   text,
  -- Consecutive delivery failures. FCM returns UNREGISTERED for tokens that are
  -- dead for good; those are deleted outright. This counts the softer failures.
  failure_count integer not null default 0,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  unique (provider, token)
);

create index if not exists idx_push_tokens_user on public.push_tokens (user_id);

-- -----------------------------------------------------------------------------
-- The queue.
-- -----------------------------------------------------------------------------
create table if not exists public.notification_queue (
  id              bigserial primary key,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  notification_id uuid references public.notifications(id) on delete cascade,
  channel         text not null check (channel in ('push', 'email')),
  title           text not null,
  body            text,
  data            jsonb not null default '{}'::jsonb,
  status          text not null default 'pending'
                    check (status in ('pending', 'claimed', 'sent', 'failed', 'skipped')),
  attempts        smallint not null default 0,
  -- Lets a reminder be written now and delivered at the right moment.
  scheduled_for   timestamptz not null default now(),
  claimed_at      timestamptz,
  sent_at         timestamptz,
  last_error      text,
  created_at      timestamptz not null default now()
);

-- The worker's read path: due, not yet done, oldest first.
create index if not exists idx_queue_due
  on public.notification_queue (scheduled_for)
  where status in ('pending', 'claimed');

create index if not exists idx_queue_user on public.notification_queue (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Enqueue.
--
-- Writes the in-app notification row AND one queue row per channel the user has
-- not switched off. In-app is never queued: the row IS the delivery.
--
-- Channel preferences default to ON when no notification_prefs row exists, so a
-- brand-new account still gets its class reminders.
-- -----------------------------------------------------------------------------
create or replace function public.enqueue_notification(
  p_user      uuid,
  p_type      text,
  p_title     text,
  p_body      text default null,
  p_data      jsonb default '{}'::jsonb,
  p_category  text default null,
  p_channels  text[] default array['push','email'],
  p_send_at   timestamptz default now()
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_notification uuid;
  v_prefs record;
  v_channel text;
begin
  insert into public.notifications (user_id, type, title, body, data, category)
  values (p_user, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb), p_category)
  returning id into v_notification;

  select * into v_prefs
  from public.notification_prefs
  where user_id = p_user and type = p_type;

  foreach v_channel in array coalesce(p_channels, array[]::text[]) loop
    -- `found` is false when the user has no row for this type, which means
    -- "not configured" and therefore "on".
    continue when v_channel = 'push'  and found and not v_prefs.push;
    continue when v_channel = 'email' and found and not v_prefs.email;

    -- Never mail an address that hard-bounced or complained; continuing to do
    -- so damages sender reputation for everyone.
    continue when v_channel = 'email'
      and public.is_email_suppressed((select email from public.profiles where id = p_user));

    insert into public.notification_queue
      (user_id, notification_id, channel, title, body, data, scheduled_for)
    values
      (p_user, v_notification, v_channel, p_title, p_body,
       coalesce(p_data, '{}'::jsonb), coalesce(p_send_at, now()));
  end loop;

  return v_notification;
end $$;

-- -----------------------------------------------------------------------------
-- Fan out to everyone enrolled in a course. One statement, not a client loop of
-- 200 round-trips.
-- -----------------------------------------------------------------------------
create or replace function public.enqueue_for_course(
  p_course   uuid,
  p_type     text,
  p_title    text,
  p_body     text default null,
  p_data     jsonb default '{}'::jsonb,
  p_category text default null,
  p_send_at  timestamptz default now()
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_count int := 0; v_user uuid;
begin
  if not (public.is_staff() or exists (
    select 1 from public.courses c where c.id = p_course and c.created_by = auth.uid()
  )) then
    raise exception 'NOT_PERMITTED' using errcode = '42501';
  end if;

  for v_user in
    select user_id from public.enrollments where course_id = p_course and status = 'active'
  loop
    perform public.enqueue_notification(
      v_user, p_type, p_title, p_body, p_data, p_category, array['push','email'], p_send_at);
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

-- -----------------------------------------------------------------------------
-- Worker: claim a batch atomically.
--
-- FOR UPDATE SKIP LOCKED is what makes this safe to run concurrently — two
-- workers claim disjoint rows instead of fighting over the same ones. Rows
-- stuck in 'claimed' for over 10 minutes are reclaimed, which covers a worker
-- that died mid-batch.
-- -----------------------------------------------------------------------------
create or replace function public.claim_notification_batch(p_channel text, p_limit integer default 50)
returns setof public.notification_queue
language plpgsql security definer set search_path = public
as $$
begin
  return query
  update public.notification_queue q
     set status = 'claimed', claimed_at = now(), attempts = q.attempts + 1
   where q.id in (
     select id from public.notification_queue
      where channel = p_channel
        and scheduled_for <= now()
        and attempts < 5
        and (status = 'pending' or (status = 'claimed' and claimed_at < now() - interval '10 minutes'))
      order by scheduled_for
      limit greatest(1, least(p_limit, 200))
      for update skip locked
   )
  returning q.*;
end $$;

create or replace function public.complete_notification(
  p_id      bigint,
  p_status  text,
  p_error   text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_status not in ('sent', 'failed', 'skipped') then
    raise exception 'BAD_STATUS' using errcode = '23514';
  end if;

  update public.notification_queue
     set status = p_status,
         sent_at = case when p_status = 'sent' then now() else sent_at end,
         last_error = p_error
   where id = p_id;
end $$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.push_tokens        enable row level security;
alter table public.notification_queue enable row level security;

-- `create policy` has no IF NOT EXISTS form, so the drop is what makes
-- re-running this file safe after a partial failure further down.
drop policy if exists "push tokens: own only" on public.push_tokens;
create policy "push tokens: own only" on public.push_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Read-only, and only your own. The queue is written by enqueue_notification()
-- and drained by the worker under the service role — never by a browser.
drop policy if exists "queue: read own" on public.notification_queue;
create policy "queue: read own" on public.notification_queue
  for select using (user_id = auth.uid() or public.is_staff());

-- -----------------------------------------------------------------------------
-- Grants. Everything shut, then opened deliberately.
--
-- claim_notification_batch and complete_notification are NOT granted to
-- authenticated: they are worker-only and run under the service role, which
-- bypasses these grants. Exposing them would let any signed-in user mark
-- another person's notifications as sent.
-- -----------------------------------------------------------------------------
revoke all on function public.enqueue_notification(uuid, text, text, text, jsonb, text, text[], timestamptz)
  from public, anon, authenticated;
revoke all on function public.enqueue_for_course(uuid, text, text, text, jsonb, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.claim_notification_batch(text, integer)
  from public, anon, authenticated;
revoke all on function public.complete_notification(bigint, text, text)
  from public, anon, authenticated;

grant execute on function public.enqueue_for_course(uuid, text, text, text, jsonb, text, timestamptz)
  to authenticated;
