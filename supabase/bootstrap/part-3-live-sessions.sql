-- =============================================================================
-- FSP SCHEMA — PART 3 of 5: Live classes, recurrence engine, device lock, notifications, audit
--
-- RUN THIS AFTER PART 2. Order matters — later parts reference earlier tables.
--
-- Paste the whole file into Supabase -> SQL Editor and press Run.
-- Safe to re-run if you are unsure whether it completed.
--
-- Contains:
--   20260805000500_live_calendar.sql
--   20260805000600_sessions_notifications_audit.sql
-- =============================================================================

begin;


-- ---------------------------------------------------------------------------
-- 20260805000500_live_calendar.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- 0005 · Live sessions, recurrence engine, time-gated join links
-- docs/01-SYSTEM-ARCHITECTURE.md §6.3 and docs/04 §3
-- =============================================================================

create table if not exists public.class_schedules (
  id               uuid primary key default gen_random_uuid(),
  course_id        uuid not null references public.courses(id) on delete cascade,
  batch_id         uuid references public.batches(id),
  educator_id      uuid not null references public.profiles(id),
  title            text not null,
  description      text,
  weekdays         smallint[] not null,          -- ISO: 1=Mon … 7=Sun
  start_time       time not null,                -- wall clock in `timezone`
  duration_min     integer not null check (duration_min between 5 and 600),
  timezone         text not null default 'Asia/Kolkata',
  starts_on        date not null,
  ends_on          date,
  default_join_url text,
  auto_generate    boolean not null default true,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  constraint weekdays_valid check (
    weekdays <@ array[1,2,3,4,5,6,7]::smallint[] and cardinality(weekdays) > 0)
);

create table if not exists public.schedule_exceptions (
  id              uuid primary key default gen_random_uuid(),
  schedule_id     uuid not null references public.class_schedules(id) on delete cascade,
  occurrence_date date not null,
  action          text not null check (action in ('cancelled','rescheduled')),
  new_starts_at   timestamptz,
  reason          text,
  unique (schedule_id, occurrence_date)
);

create table if not exists public.live_sessions (
  id                 uuid primary key default gen_random_uuid(),
  course_id          uuid not null references public.courses(id) on delete cascade,
  batch_id           uuid references public.batches(id),
  educator_id        uuid not null references public.profiles(id),
  title              text not null,
  description        text,
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  provider           live_provider not null default 'meet',
  -- Column-level revoked from students below; served only by get_live_join_url().
  join_url           text,
  material_drive_id  text,
  banner_public_id   text,
  recording_drive_id text,
  status             live_status not null default 'scheduled',
  max_attendees      integer,
  actual_peak        integer not null default 0,
  reminder_24h_sent_at timestamptz,
  reminder_15m_sent_at timestamptz,
  cancelled_reason   text,
  schedule_id        uuid references public.class_schedules(id) on delete set null,
  occurrence_date    date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint sane_window check (ends_at > starts_at),
  constraint uq_schedule_occurrence unique (schedule_id, occurrence_date)
);

create table if not exists public.session_attendance (
  session_id   uuid not null references public.live_sessions(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  joined_at    timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table if not exists public.live_chat_messages (
  id         bigserial primary key,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (length(body) between 1 and 500),
  is_pinned  boolean not null default false,
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now()
);

create trigger trg_sessions_updated before update on public.live_sessions
  for each row execute function public.touch_updated_at();

create index if not exists idx_sessions_calendar
  on public.live_sessions (course_id, starts_at) where status <> 'cancelled';
create index if not exists idx_sessions_upcoming
  on public.live_sessions (starts_at) where status = 'scheduled';

-- =============================================================================
-- Recurrence engine: schedule template -> generated sessions
-- Idempotent via unique (schedule_id, occurrence_date).
-- =============================================================================
create or replace function public.generate_sessions(p_schedule uuid, p_horizon_days int default 60)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  s public.class_schedules%rowtype;
  d date;
  v_start timestamptz;
  v_made int := 0;
begin
  select * into s from public.class_schedules
  where id = p_schedule and is_active and auto_generate;
  if not found then return 0; end if;

  for d in
    select gs::date
    from generate_series(
      greatest(s.starts_on, current_date),
      least(coalesce(s.ends_on, current_date + p_horizon_days), current_date + p_horizon_days),
      interval '1 day'
    ) gs
  loop
    continue when not (extract(isodow from d)::smallint = any(s.weekdays));
    continue when exists (
      select 1 from public.schedule_exceptions e
      where e.schedule_id = s.id and e.occurrence_date = d and e.action = 'cancelled'
    );

    -- Wall clock in the schedule's own zone -> the correct UTC instant.
    v_start := (d + s.start_time) at time zone s.timezone;

    insert into public.live_sessions (
      course_id, batch_id, educator_id, title, description,
      starts_at, ends_at, provider, join_url, schedule_id, occurrence_date
    )
    values (
      s.course_id, s.batch_id, s.educator_id, s.title, s.description,
      v_start, v_start + make_interval(mins => s.duration_min),
      'meet', s.default_join_url, s.id, d
    )
    on conflict (schedule_id, occurrence_date) do nothing;

    if found then v_made := v_made + 1; end if;
  end loop;

  return v_made;
end $$;

-- =============================================================================
-- THE security-critical function.
--
-- RLS is row-level, not column-level, so hiding join_url needs a column REVOKE
-- plus a SECURITY DEFINER accessor that enforces enrolment AND the time window.
-- =============================================================================
create or replace function public.get_live_join_url(p_session uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_url text; v_start timestamptz; v_end timestamptz;
  v_course uuid; v_educator uuid;
  v_before int; v_after int;
begin
  select join_url, starts_at, ends_at, course_id, educator_id
    into v_url, v_start, v_end, v_course, v_educator
  from public.live_sessions where id = p_session;

  if not found then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Educators open their own room whenever they like.
  if v_educator = auth.uid() or public.has_role('admin') then
    return v_url;
  end if;

  if not public.is_enrolled(v_course) then
    raise exception 'NOT_ENROLLED' using errcode = '42501';
  end if;

  select coalesce((value)::int, 15) into v_before
    from public.app_settings where key = 'live.join_window_before_minutes';
  select coalesce((value)::int, 30) into v_after
    from public.app_settings where key = 'live.join_window_after_minutes';

  if now() < v_start - make_interval(mins => coalesce(v_before, 15)) then
    raise exception 'TOO_EARLY' using errcode = 'P0001';
  end if;

  if now() > v_end + make_interval(mins => coalesce(v_after, 30)) then
    raise exception 'SESSION_ENDED' using errcode = 'P0001';
  end if;

  insert into public.session_attendance (session_id, user_id)
  values (p_session, auth.uid())
  on conflict (session_id, user_id) do update set last_seen_at = now();

  return v_url;
end $$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.class_schedules     enable row level security;
alter table public.schedule_exceptions enable row level security;
alter table public.live_sessions       enable row level security;
alter table public.session_attendance  enable row level security;
alter table public.live_chat_messages  enable row level security;

-- Students may read the session row but NOT the join_url column.
revoke select (join_url) on public.live_sessions from authenticated, anon;

create policy "sessions: enrolled, educator or staff" on public.live_sessions
  for select using (
    public.is_enrolled(course_id) or educator_id = auth.uid() or public.is_staff()
  );
create policy "sessions: educator manages own" on public.live_sessions
  for all using (educator_id = auth.uid() and public.has_role('educator'))
  with check (educator_id = auth.uid());
create policy "sessions: admin manages all" on public.live_sessions
  for all using (public.has_role('admin')) with check (public.has_role('admin'));

create policy "schedules: enrolled, educator or staff" on public.class_schedules
  for select using (
    public.is_enrolled(course_id) or educator_id = auth.uid() or public.is_staff()
  );
create policy "schedules: educator manages own" on public.class_schedules
  for all using (educator_id = auth.uid()) with check (educator_id = auth.uid());

create policy "exceptions: follow schedule" on public.schedule_exceptions
  for all using (exists (
    select 1 from public.class_schedules s
    where s.id = schedule_id and (s.educator_id = auth.uid() or public.is_staff())));

create policy "attendance: own or educator" on public.session_attendance
  for select using (
    user_id = auth.uid() or exists (
      select 1 from public.live_sessions s
      where s.id = session_id and (s.educator_id = auth.uid() or public.is_staff()))
  );

create policy "chat: read if enrolled" on public.live_chat_messages
  for select using (
    not is_hidden and exists (
      select 1 from public.live_sessions s
      where s.id = session_id
        and (public.is_enrolled(s.course_id) or s.educator_id = auth.uid() or public.is_staff()))
  );
create policy "chat: post own during a live session" on public.live_chat_messages
  for insert with check (
    user_id = auth.uid() and exists (
      select 1 from public.live_sessions s
      where s.id = session_id and s.status = 'live' and public.is_enrolled(s.course_id))
  );
create policy "chat: educator moderates" on public.live_chat_messages
  for update using (exists (
    select 1 from public.live_sessions s
    where s.id = session_id and (s.educator_id = auth.uid() or public.is_staff())));


-- ---------------------------------------------------------------------------
-- 20260805000600_sessions_notifications_audit.sql
-- ---------------------------------------------------------------------------

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

create policy "sessions: read own or staff" on public.user_sessions
  for select using (user_id = auth.uid() or public.is_staff());

create policy "push: own only" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "notifications: own only" on public.notifications
  for select using (user_id = auth.uid());
create policy "notifications: mark own read" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "prefs: own only" on public.notification_prefs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "announcements: enrolled or staff" on public.announcements
  for select using (
    audience = 'all' or course_id is null
    or public.is_enrolled(course_id) or public.is_staff()
    or exists (select 1 from public.courses c where c.id = course_id and c.created_by = auth.uid())
  );
create policy "announcements: educator publishes" on public.announcements
  for insert with check (public.has_role('educator') or public.has_role('admin'));

create policy "email_log: staff read" on public.email_log
  for select using (public.is_staff());

create policy "audit: staff read" on public.audit_logs
  for select using (public.is_staff());

-- The audit trail is evidence. No role edits or deletes it, ever.
revoke update, delete on public.audit_logs from authenticated, anon;

commit;

-- Part 3 complete. Now run part 4.
select 'PART 3 OK — ' || count(*) || ' tables so far' as result
  from pg_tables where schemaname = 'public';
