-- =============================================================================
-- 0026 · Live class attendance
--
-- get_live_join_url() already recorded ONE row per student per session. That
-- answers "did they open it at all" and nothing else — not how many times, not
-- when, not from where. Which means it cannot answer the question that actually
-- matters commercially: is this one student, or one account being shared?
--
-- A shared account looks exactly like a diligent student in the old model. It
-- looks quite different once you can see twelve joins from four devices.
--
-- The Meet URL is still never exposed. Students click a button, the server
-- checks enrolment and the time window, records the attempt, and only then
-- returns the link. The credential is never in the page, never in the client
-- bundle, and never in a link anyone can forward.
-- =============================================================================

alter table public.session_attendance
  add column if not exists join_count      integer not null default 1,
  add column if not exists first_joined_at timestamptz,
  add column if not exists last_ip         inet,
  add column if not exists last_user_agent text,
  -- Distinct devices seen for this student on this session. The number that
  -- distinguishes "watched twice" from "two people".
  add column if not exists device_ids      text[] not null default '{}';

-- Backfill so existing rows are not silently reported as never-joined.
update public.session_attendance
   set first_joined_at = coalesce(first_joined_at, joined_at)
 where first_joined_at is null;

create index if not exists idx_attendance_session on public.session_attendance (session_id);

-- -----------------------------------------------------------------------------
-- Join a class.
--
-- Supersedes get_live_join_url() for the app. That function stays for
-- compatibility, but this is the one the API calls: same checks, plus the
-- recording.
--
-- Everything is decided here rather than in the route because the route is a
-- public HTTP endpoint. Enrolment, the time window and the recording must not
-- be things a crafted request can skip.
-- -----------------------------------------------------------------------------
create or replace function public.join_live_session(
  p_session    uuid,
  p_device_id  text default null,
  p_ip         inet default null,
  p_user_agent text default null
)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_url text;
  v_start timestamptz;
  v_end timestamptz;
  v_course uuid;
  v_educator uuid;
  v_before int;
  v_after int;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select join_url, starts_at, ends_at, course_id, educator_id
    into v_url, v_start, v_end, v_course, v_educator
  from public.live_sessions where id = p_session;

  if not found then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Educators and admins open their own room whenever they like, and their
  -- visit is not recorded as student attendance.
  if v_educator = v_user or public.has_role('admin') then
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

  insert into public.session_attendance
    (session_id, user_id, joined_at, first_joined_at, last_seen_at,
     join_count, last_ip, last_user_agent, device_ids)
  values
    (p_session, v_user, now(), now(), now(),
     1, p_ip, p_user_agent,
     case when p_device_id is null then '{}'::text[] else array[p_device_id] end)
  on conflict (session_id, user_id) do update
    set last_seen_at     = now(),
        join_count       = public.session_attendance.join_count + 1,
        last_ip          = coalesce(excluded.last_ip, public.session_attendance.last_ip),
        last_user_agent  = coalesce(excluded.last_user_agent, public.session_attendance.last_user_agent),
        -- Union, not append: rejoining from the same device must not inflate
        -- the count and make an honest student look like a shared account.
        device_ids       = (
          select array(
            select distinct unnest(
              public.session_attendance.device_ids ||
              case when p_device_id is null then '{}'::text[] else array[p_device_id] end
            )
          )
        );

  return v_url;
end $$;

-- -----------------------------------------------------------------------------
-- The register for one class. Educator and staff only.
--
-- Returns every actively enrolled student, not just the ones who turned up.
-- Absentees come back with join_count 0 and null timestamps, because "who is
-- missing" is the question an educator actually opens this screen to answer,
-- and a list of attendees cannot answer it.
--
-- Educators are deliberately NOT staff (is_staff() is admin/developer/support),
-- so they cannot read public.enrollments directly. This function is the only
-- way they see the roster, and only for a class that is theirs.
-- -----------------------------------------------------------------------------
create or replace function public.get_session_attendance(p_session uuid)
returns table (
  user_id      uuid,
  full_name    text,
  email        text,
  first_joined timestamptz,
  last_seen    timestamptz,
  join_count   integer,
  device_count integer
)
language plpgsql security definer set search_path = public
as $$
declare
  v_educator uuid;
  v_course   uuid;
begin
  select educator_id, course_id into v_educator, v_course
    from public.live_sessions where id = p_session;

  if not found then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_educator is distinct from auth.uid() and not public.is_staff() then
    raise exception 'NOT_PERMITTED' using errcode = '42501';
  end if;

  return query
  select e.user_id,
         p.full_name,
         p.email::text,
         a.first_joined_at,
         a.last_seen_at,
         coalesce(a.join_count, 0),
         coalesce(cardinality(a.device_ids), 0)
  from public.enrollments e
  join public.profiles p on p.id = e.user_id
  left join public.session_attendance a
         on a.session_id = p_session and a.user_id = e.user_id
  where e.course_id = v_course
    and e.status = 'active'
  -- Attendees first, most-joined at the top: the rows worth a second look
  -- (many joins, many devices) surface without sorting by hand.
  order by (a.user_id is null), a.join_count desc nulls last, p.full_name;
end $$;

-- -----------------------------------------------------------------------------
-- A student's own attendance across a course.
--
-- `held` counts only classes that have already finished — counting a class
-- scheduled for next week as "missed" would show every student a falling
-- attendance rate for no reason.
-- -----------------------------------------------------------------------------
create or replace function public.get_my_attendance(p_course uuid default null)
returns table (
  course_id    uuid,
  course_title text,
  held         integer,
  attended     integer
)
language sql stable security definer set search_path = public
as $$
  select c.id,
         c.title,
         count(distinct s.id) filter (where s.ends_at < now() and s.status <> 'cancelled')::int,
         count(distinct a.session_id)::int
    from public.enrollments e
    join public.courses c on c.id = e.course_id
    left join public.live_sessions s on s.course_id = c.id
    left join public.session_attendance a
           on a.session_id = s.id and a.user_id = auth.uid()
   where e.user_id = auth.uid()
     and e.status = 'active'
     and (p_course is null or c.id = p_course)
   group by c.id, c.title
   order by c.title;
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke all on function public.join_live_session(uuid, text, inet, text) from public, anon, authenticated;
revoke all on function public.get_session_attendance(uuid)              from public, anon, authenticated;
revoke all on function public.get_my_attendance(uuid)                   from public, anon, authenticated;

grant execute on function public.join_live_session(uuid, text, inet, text) to authenticated;
grant execute on function public.get_session_attendance(uuid)              to authenticated;
grant execute on function public.get_my_attendance(uuid)                   to authenticated;

-- The old get_live_join_url() must stop being reachable by students, or the
-- tracking is opt-out. It is still granted to `authenticated`, and PostgREST
-- exposes every granted function at /rest/v1/rpc/<name> — so anyone who did not
-- want to be counted could call it with their own JWT and get the same URL with
-- no join_count, no device id, no IP.
--
-- That is not a data leak: the function still checks enrolment and the window.
-- It is worse in a quieter way — it makes the register wrong, and wrong for
-- exactly the accounts worth watching.
--
-- The function itself stays (service role and the seed scripts use it); only
-- the client-reachable grant goes.
revoke execute on function public.get_live_join_url(uuid) from authenticated;
