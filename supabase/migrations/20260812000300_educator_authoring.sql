-- =============================================================================
-- 0015 · Educator authoring
--
-- generate_sessions() was revoked from `authenticated` in migration
-- 20260811000100, and correctly so: it is SECURITY DEFINER, it writes
-- live_sessions, and it took a schedule id straight from the caller. Any
-- signed-in student could generate classes onto anyone's schedule.
--
-- But educators genuinely need to run it. The fix is not to grant it back —
-- it is to expose an ownership-checked wrapper and leave the raw function
-- internal. Same for the recording id, which must only ever be settable by the
-- educator who taught the class.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Publish a schedule: generate its live_sessions for the next N days.
-- Idempotent downstream via unique (schedule_id, occurrence_date).
-- -----------------------------------------------------------------------------
create or replace function public.publish_schedule(
  p_schedule uuid,
  p_horizon_days integer default 60
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_created integer;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  -- A horizon the caller controls is a denial-of-service knob: 100000 days
  -- would generate ~40,000 rows in one call. Clamped, not trusted.
  if p_horizon_days is null or p_horizon_days < 1 or p_horizon_days > 180 then
    p_horizon_days := 60;
  end if;

  select educator_id into v_owner from public.class_schedules where id = p_schedule;

  if v_owner is null then
    raise exception 'SCHEDULE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_owner <> auth.uid() and not public.has_role('admin') then
    raise exception 'NOT_YOUR_SCHEDULE' using errcode = '42501';
  end if;

  select public.generate_sessions(p_schedule, p_horizon_days) into v_created;
  return v_created;
end $$;

-- -----------------------------------------------------------------------------
-- Attach a recording to a finished class.
--
-- live_sessions has an educator-manages-own policy, so this could be a plain
-- UPDATE — except join_url is column-REVOKEd, which makes RETURNING and some
-- client update paths awkward. Doing it here keeps the write narrow: this
-- function can set exactly one column and nothing else.
-- -----------------------------------------------------------------------------
create or replace function public.set_session_recording(
  p_session uuid,
  p_drive_file_id text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select educator_id into v_owner from public.live_sessions where id = p_session;

  if v_owner is null then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_owner <> auth.uid() and not public.has_role('admin') then
    raise exception 'NOT_YOUR_SESSION' using errcode = '42501';
  end if;

  update public.live_sessions
     set recording_drive_id = nullif(trim(p_drive_file_id), ''),
         status = case when status = 'scheduled' and ends_at < now() then 'ended' else status end
   where id = p_session;

  -- Students asked for this specifically: they check back for days not knowing
  -- whether a recording is coming.
  insert into public.notifications (user_id, type, title, body, category)
  select e.user_id, 'course.published', 'A class recording is ready',
         'The recording for a class you are enrolled in has been uploaded.', 'course'
  from public.enrollments e
  join public.live_sessions s on s.id = p_session
  where e.course_id = s.course_id and e.status = 'active';
end $$;

-- -----------------------------------------------------------------------------
-- Cancel a class, with a reason students can see.
-- -----------------------------------------------------------------------------
create or replace function public.cancel_live_session(
  p_session uuid,
  p_reason  text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_owner uuid; v_title text; v_course uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'REASON_REQUIRED' using errcode = '23514';
  end if;

  select educator_id, title, course_id into v_owner, v_title, v_course
  from public.live_sessions where id = p_session;

  if v_owner is null then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_owner <> auth.uid() and not public.has_role('admin') then
    raise exception 'NOT_YOUR_SESSION' using errcode = '42501';
  end if;

  update public.live_sessions
     set status = 'cancelled', cancelled_reason = trim(p_reason)
   where id = p_session;

  insert into public.notifications (user_id, type, title, body, category)
  select e.user_id, 'class.cancelled', 'Class cancelled: ' || v_title, trim(p_reason), 'class'
  from public.enrollments e
  where e.course_id = v_course and e.status = 'active';

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after)
  values (auth.uid(), 'SESSION_CANCEL', 'live_sessions', p_session,
          jsonb_build_object('reason', trim(p_reason)));
end $$;

-- =============================================================================
-- SECURITY FIX · live_sessions and class_schedules were insertable by anyone
--
-- Found while building the studio write paths. The original policies read:
--
--   create policy "sessions: educator manages own" on public.live_sessions
--     for all using (educator_id = auth.uid() and public.has_role('educator'))
--     with check (educator_id = auth.uid());
--
-- For INSERT, Postgres consults WITH CHECK only — USING is not evaluated. The
-- role requirement therefore existed on read and update but NOT on insert, so
-- the whole condition for creating a class was "set educator_id to yourself".
--
-- Concretely: any signed-in student could insert a live_sessions row against
-- any course_id, with a join_url they control. Every enrolled student on that
-- course would see the class (the select policy allows enrolled users), click
-- Join, and get_live_join_url() would hand them the attacker's Meet link —
-- because for a non-creator it checks enrolment, not who created the row.
-- An in-platform phishing vector, delivered through a trusted UI.
--
-- The join_url column REVOKE does not help: it restricts SELECT, not INSERT.
--
-- Fix: require the educator or admin role in WITH CHECK as well as USING.
-- Deliberately NOT requiring course ownership — courses seeded before the first
-- educator account have created_by = null, and that stricter rule would lock
-- the real educator out of her own courses. Role is what stops the attack;
-- per-course assignment can follow when there is a table to express it.
-- =============================================================================

drop policy if exists "sessions: educator manages own" on public.live_sessions;
create policy "sessions: educator manages own" on public.live_sessions
  for all
  using (educator_id = auth.uid() and public.has_role('educator'))
  with check (
    educator_id = auth.uid()
    and (public.has_role('educator') or public.has_role('admin'))
  );

drop policy if exists "schedules: educator manages own" on public.class_schedules;
create policy "schedules: educator manages own" on public.class_schedules
  for all
  using (educator_id = auth.uid())
  with check (
    educator_id = auth.uid()
    and (public.has_role('educator') or public.has_role('admin'))
  );

-- Same shape, same gap, different table. The original read:
--   for all using (created_by = auth.uid() and public.has_role('educator'))
--        with check (created_by = auth.uid());
-- so any signed-in user could INSERT a course with themselves as creator —
-- including `status = 'published'`, which the "published are public" policy
-- then shows to every visitor. Course-catalogue defacement by any account.
drop policy if exists "courses: educator manages own" on public.courses;
create policy "courses: educator manages own" on public.courses
  for all
  using (created_by = auth.uid() and public.has_role('educator'))
  with check (
    created_by = auth.uid()
    and (public.has_role('educator') or public.has_role('admin'))
  );

-- publish_schedule() checks ownership, but ownership is now only obtainable by
-- an educator. Belt and braces: a row created before this migration by someone
-- who should not have it must not become publishable.
create or replace function public.publish_schedule(
  p_schedule uuid,
  p_horizon_days integer default 60
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_created integer;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if not (public.has_role('educator') or public.has_role('admin')) then
    raise exception 'NOT_AN_EDUCATOR' using errcode = '42501';
  end if;

  if p_horizon_days is null or p_horizon_days < 1 or p_horizon_days > 180 then
    p_horizon_days := 60;
  end if;

  select educator_id into v_owner from public.class_schedules where id = p_schedule;

  if v_owner is null then
    raise exception 'SCHEDULE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_owner <> auth.uid() and not public.has_role('admin') then
    raise exception 'NOT_YOUR_SCHEDULE' using errcode = '42501';
  end if;

  select public.generate_sessions(p_schedule, p_horizon_days) into v_created;
  return v_created;
end $$;

-- -----------------------------------------------------------------------------
-- Grants. Locked shut first — PostgREST publishes anything in `public`.
-- -----------------------------------------------------------------------------
revoke all on function public.publish_schedule(uuid, integer)      from public, anon, authenticated;
revoke all on function public.set_session_recording(uuid, text)    from public, anon, authenticated;
revoke all on function public.cancel_live_session(uuid, text)      from public, anon, authenticated;

grant execute on function public.publish_schedule(uuid, integer)   to authenticated;
grant execute on function public.set_session_recording(uuid, text) to authenticated;
grant execute on function public.cancel_live_session(uuid, text)   to authenticated;
