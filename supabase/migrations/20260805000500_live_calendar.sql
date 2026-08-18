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

drop trigger if exists trg_sessions_updated on public.live_sessions;
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

drop policy if exists "sessions: enrolled, educator or staff" on public.live_sessions;
create policy "sessions: enrolled, educator or staff" on public.live_sessions
  for select using (
    public.is_enrolled(course_id) or educator_id = auth.uid() or public.is_staff()
  );
drop policy if exists "sessions: educator manages own" on public.live_sessions;
create policy "sessions: educator manages own" on public.live_sessions
  for all using (educator_id = auth.uid() and public.has_role('educator'))
  with check (educator_id = auth.uid());
drop policy if exists "sessions: admin manages all" on public.live_sessions;
create policy "sessions: admin manages all" on public.live_sessions
  for all using (public.has_role('admin')) with check (public.has_role('admin'));

drop policy if exists "schedules: enrolled, educator or staff" on public.class_schedules;
create policy "schedules: enrolled, educator or staff" on public.class_schedules
  for select using (
    public.is_enrolled(course_id) or educator_id = auth.uid() or public.is_staff()
  );
drop policy if exists "schedules: educator manages own" on public.class_schedules;
create policy "schedules: educator manages own" on public.class_schedules
  for all using (educator_id = auth.uid()) with check (educator_id = auth.uid());

drop policy if exists "exceptions: follow schedule" on public.schedule_exceptions;
create policy "exceptions: follow schedule" on public.schedule_exceptions
  for all using (exists (
    select 1 from public.class_schedules s
    where s.id = schedule_id and (s.educator_id = auth.uid() or public.is_staff())));

drop policy if exists "attendance: own or educator" on public.session_attendance;
create policy "attendance: own or educator" on public.session_attendance
  for select using (
    user_id = auth.uid() or exists (
      select 1 from public.live_sessions s
      where s.id = session_id and (s.educator_id = auth.uid() or public.is_staff()))
  );

drop policy if exists "chat: read if enrolled" on public.live_chat_messages;
create policy "chat: read if enrolled" on public.live_chat_messages
  for select using (
    not is_hidden and exists (
      select 1 from public.live_sessions s
      where s.id = session_id
        and (public.is_enrolled(s.course_id) or s.educator_id = auth.uid() or public.is_staff()))
  );
drop policy if exists "chat: post own during a live session" on public.live_chat_messages;
create policy "chat: post own during a live session" on public.live_chat_messages
  for insert with check (
    user_id = auth.uid() and exists (
      select 1 from public.live_sessions s
      where s.id = session_id and s.status = 'live' and public.is_enrolled(s.course_id))
  );
drop policy if exists "chat: educator moderates" on public.live_chat_messages;
create policy "chat: educator moderates" on public.live_chat_messages
  for update using (exists (
    select 1 from public.live_sessions s
    where s.id = session_id and (s.educator_id = auth.uid() or public.is_staff())));
