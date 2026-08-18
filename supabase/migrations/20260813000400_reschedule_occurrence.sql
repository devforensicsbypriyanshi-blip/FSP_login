-- =============================================================================
-- 0020 · Move one class without moving every class
--
-- The recurrence engine generates live_sessions from a weekday pattern. Editing
-- the pattern to shift a single Wednesday would shift EVERY Wednesday, which is
-- the one thing an educator must never do by accident three days before an exam.
--
-- schedule_exceptions exists for exactly this: a per-date override recorded
-- against the pattern. It has been in the schema since 0005 and nothing has
-- ever written to it. This does.
--
-- Two rows change together and must not diverge:
--   - the live_sessions row students actually see, and
--   - the schedule_exceptions row that stops the nightly generator from
--     recreating the class at its original time.
--
-- Without the second, `generate-sessions` at 03:00 would helpfully restore the
-- class you just moved.
-- =============================================================================

create or replace function public.reschedule_occurrence(
  p_session   uuid,
  p_starts_at timestamptz,
  p_reason    text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_schedule uuid;
  v_occurrence date;
  v_course uuid;
  v_title text;
  v_duration interval;
  v_old_start timestamptz;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'REASON_REQUIRED' using errcode = '23514';
  end if;

  select educator_id, schedule_id, occurrence_date, course_id, title,
         (ends_at - starts_at), starts_at
    into v_owner, v_schedule, v_occurrence, v_course, v_title, v_duration, v_old_start
    from public.live_sessions
   where id = p_session;

  if v_owner is null then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_owner <> auth.uid() and not public.has_role('admin') then
    raise exception 'NOT_YOUR_SESSION' using errcode = '42501';
  end if;

  -- Moving a class that has already finished is meaningless and would send a
  -- confusing notification about a lesson people already attended.
  if v_old_start < now() then
    raise exception 'ALREADY_STARTED' using errcode = 'P0001';
  end if;

  update public.live_sessions
     set starts_at = p_starts_at,
         ends_at = p_starts_at + v_duration,
         status = 'scheduled',
         -- Reminders already sent referred to the OLD time, so they must be
         -- allowed to fire again for the new one.
         reminder_24h_sent_at = null,
         reminder_15m_sent_at = null
   where id = p_session;

  -- Only generated sessions have a pattern to override; a one-off class has
  -- schedule_id null and needs no exception row.
  if v_schedule is not null and v_occurrence is not null then
    insert into public.schedule_exceptions (schedule_id, occurrence_date, action, new_starts_at, reason)
    values (v_schedule, v_occurrence, 'rescheduled', p_starts_at, trim(p_reason))
    on conflict (schedule_id, occurrence_date) do update
      set action = 'rescheduled',
          new_starts_at = excluded.new_starts_at,
          reason = excluded.reason;
  end if;

  perform public.enqueue_notification(
    e.user_id, 'class.rescheduled', 'Class moved: ' || v_title,
    trim(p_reason) || ' — new time: '
      || to_char(p_starts_at at time zone 'Asia/Kolkata', 'FMDay FMDD FMMon, FMHH12:MI AM') || ' IST',
    jsonb_build_object('url', '/app/calendar', 'session_id', p_session),
    'class', array['push','email'], now())
  from public.enrollments e
  where e.course_id = v_course and e.status = 'active';

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), 'SESSION_RESCHEDULE', 'live_sessions', p_session,
          jsonb_build_object('starts_at', v_old_start),
          jsonb_build_object('starts_at', p_starts_at, 'reason', trim(p_reason)));
end $$;

-- -----------------------------------------------------------------------------
-- Cancelling a generated occurrence should also record the exception, or the
-- nightly generator recreates it. 0015's cancel_live_session only set status.
-- -----------------------------------------------------------------------------
create or replace function public.cancel_live_session(
  p_session uuid,
  p_reason  text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_owner uuid; v_title text; v_course uuid;
  v_schedule uuid; v_occurrence date;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'REASON_REQUIRED' using errcode = '23514';
  end if;

  select educator_id, title, course_id, schedule_id, occurrence_date
    into v_owner, v_title, v_course, v_schedule, v_occurrence
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

  -- The missing half: without this the 03:00 generator recreates the class.
  if v_schedule is not null and v_occurrence is not null then
    insert into public.schedule_exceptions (schedule_id, occurrence_date, action, reason)
    values (v_schedule, v_occurrence, 'cancelled', trim(p_reason))
    on conflict (schedule_id, occurrence_date) do update
      set action = 'cancelled', new_starts_at = null, reason = excluded.reason;
  end if;

  perform public.enqueue_notification(
    e.user_id, 'class.cancelled', 'Class cancelled: ' || v_title, trim(p_reason),
    jsonb_build_object('url', '/app/calendar', 'session_id', p_session),
    'class', array['push','email'], now())
  from public.enrollments e
  where e.course_id = v_course and e.status = 'active';

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after)
  values (auth.uid(), 'SESSION_CANCEL', 'live_sessions', p_session,
          jsonb_build_object('reason', trim(p_reason)));
end $$;

revoke all on function public.reschedule_occurrence(uuid, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.reschedule_occurrence(uuid, timestamptz, text) to authenticated;
