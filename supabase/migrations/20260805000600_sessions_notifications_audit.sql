-- =============================================================================
-- 0006 · Device lock, notifications, audit log
-- docs/04-SESSIONS-OTP-CALENDAR-NOTIFICATIONS.md §1 and §4
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Single active session per account.
--
-- Supabase access tokens are stateless JWTs valid for their full hour, so
-- revoking a row does NOT invalidate a token already in a browser. This table
-- is the source of truth; middleware checks it on the request path. Realtime
-- gives the fast UX kick, but middleware is the actual enforcement.
-- -----------------------------------------------------------------------------
create table if not exists public.user_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  device_id     text not null,
  device_label  text,
  user_agent    text,
  ip            inet,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  revoked_at    timestamptz,
  revoke_reason text check (revoke_reason in
    ('new_login','idle_timeout','tab_closed','manual','admin','password_change')),
  unique (user_id, device_id)
);

create index if not exists idx_sessions_active on public.user_sessions (user_id) where revoked_at is null;
create index if not exists idx_sessions_stale  on public.user_sessions (last_seen_at) where revoked_at is null;

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text unique not null,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  data       jsonb not null default '{}'::jsonb,
  category   text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notif_unread
  on public.notifications (user_id, created_at desc) where read_at is null;

create table if not exists public.notification_prefs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  type    text not null,
  in_app  boolean not null default true,
  push    boolean not null default true,
  email   boolean not null default true,
  primary key (user_id, type)
);

create table if not exists public.announcements (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid references public.courses(id) on delete cascade,
  batch_id     uuid references public.batches(id),
  title        text not null,
  body         text not null,
  audience     text not null default 'course' check (audience in ('all','course','batch')),
  created_by   uuid references public.profiles(id),
  published_at timestamptz not null default now()
);

create table if not exists public.email_log (
  id         uuid primary key default gen_random_uuid(),
  to_email   citext not null,
  template   text not null,
  subject    text,
  resend_id  text,
  status     text not null default 'queued',
  error      text,
  created_at timestamptz not null default now()
);
-- Resend's free tier allows 100/day. This index backs the daily-quota alert.
create index if not exists idx_email_log_day on public.email_log (created_at desc);

create table if not exists public.audit_logs (
  id          bigserial primary key,
  actor_id    uuid references public.profiles(id),
  actor_email text,
  action      text not null,
  entity_type text,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  ip          inet,
  user_agent  text,
  request_id  text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_audit_recent on public.audit_logs (created_at desc);

-- =============================================================================
-- Claim a device and evict every other live session, atomically.
-- =============================================================================
create or replace function public.claim_session(
  p_device_id text,
  p_label     text default null,
  p_user_agent text default null,
  p_ip        inet default null
)
returns table (session_id uuid, evicted_count int)
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_evicted int;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  update public.user_sessions
     set revoked_at = now(), revoke_reason = 'new_login'
   where user_id = v_user and device_id <> p_device_id and revoked_at is null;
  get diagnostics v_evicted = row_count;

  insert into public.user_sessions (user_id, device_id, device_label, user_agent, ip)
  values (v_user, p_device_id, p_label, p_user_agent, p_ip)
  on conflict (user_id, device_id) do update
    set revoked_at = null,
        revoke_reason = null,
        last_seen_at = now(),
        ip = excluded.ip,
        user_agent = excluded.user_agent
  returning id into v_id;

  if v_evicted > 0 then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, after)
    values (v_user, 'SESSION_EVICT', 'user_sessions', v_id,
            jsonb_build_object('evicted', v_evicted, 'device', p_label));

    insert into public.notifications (user_id, type, title, body, category)
    values (v_user, 'session.evicted', 'Signed in on a new device',
            'Your account was used on another device, so the previous one was signed out.',
            'security');
  end if;

  return query select v_id, v_evicted;
end $$;

create or replace function public.revoke_other_sessions(p_keep_device text)
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_count int;
begin
  update public.user_sessions
     set revoked_at = now(), revoke_reason = 'manual'
   where user_id = auth.uid() and device_id <> p_keep_device and revoked_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.user_sessions      enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notifications      enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.announcements      enable row level security;
alter table public.email_log          enable row level security;
alter table public.audit_logs         enable row level security;

drop policy if exists "sessions: read own or staff" on public.user_sessions;
create policy "sessions: read own or staff" on public.user_sessions
  for select using (user_id = auth.uid() or public.is_staff());

drop policy if exists "push: own only" on public.push_subscriptions;
create policy "push: own only" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "notifications: own only" on public.notifications;
create policy "notifications: own only" on public.notifications
  for select using (user_id = auth.uid());
drop policy if exists "notifications: mark own read" on public.notifications;
create policy "notifications: mark own read" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "prefs: own only" on public.notification_prefs;
create policy "prefs: own only" on public.notification_prefs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "announcements: enrolled or staff" on public.announcements;
create policy "announcements: enrolled or staff" on public.announcements
  for select using (
    audience = 'all' or course_id is null
    or public.is_enrolled(course_id) or public.is_staff()
    or exists (select 1 from public.courses c where c.id = course_id and c.created_by = auth.uid())
  );
drop policy if exists "announcements: educator publishes" on public.announcements;
create policy "announcements: educator publishes" on public.announcements
  for insert with check (public.has_role('educator') or public.has_role('admin'));

drop policy if exists "email_log: staff read" on public.email_log;
create policy "email_log: staff read" on public.email_log
  for select using (public.is_staff());

drop policy if exists "audit: staff read" on public.audit_logs;
create policy "audit: staff read" on public.audit_logs
  for select using (public.is_staff());

-- The audit trail is evidence. No role edits or deletes it, ever.
revoke update, delete on public.audit_logs from authenticated, anon;
