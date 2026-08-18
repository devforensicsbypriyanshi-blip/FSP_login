-- =============================================================================
-- 0013 · Session lifecycle helpers
--
-- user_sessions is deliberately SELECT-only under RLS: a client that can write
-- its own session row can un-revoke itself and defeat the device lock. So every
-- mutation goes through a SECURITY DEFINER function that decides for itself
-- which row it may touch, derived from auth.uid() and never from an argument.
--
-- Each function is revoked from PUBLIC first. PostgREST exposes everything in
-- `public` at /rest/v1/rpc/<name> and Postgres grants EXECUTE to PUBLIC by
-- default, so a new function is internet-facing the moment it is created —
-- see migration 20260811000100.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Heartbeat. Returns true while this device still holds the active session.
--
-- Doubles as the liveness signal: last_seen_at drives the idle-timeout sweep,
-- so a browser that stops calling this is eventually reaped by cron.
-- -----------------------------------------------------------------------------
create or replace function public.touch_session(p_device_id text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_active boolean;
begin
  if auth.uid() is null then
    return false;
  end if;

  update public.user_sessions
     set last_seen_at = now()
   where user_id = auth.uid()
     and device_id = p_device_id
     and revoked_at is null;

  -- FOUND is false when the row is missing OR already revoked; both mean
  -- "this device is no longer the active one", which is the same answer.
  v_active := found;
  return v_active;
end $$;

-- -----------------------------------------------------------------------------
-- Explicit sign-out. Marks only the calling device, so signing out on a phone
-- does not disturb a session the user may legitimately start elsewhere.
-- -----------------------------------------------------------------------------
create or replace function public.end_session(p_device_id text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  update public.user_sessions
     set revoked_at = now(), revoke_reason = 'manual'
   where user_id = auth.uid()
     and device_id = p_device_id
     and revoked_at is null;
end $$;

-- -----------------------------------------------------------------------------
-- Mark the whole notification list read in one statement.
-- The equivalent client-side UPDATE would be an unbounded write over a table
-- the user can already read; scoping it here keeps that impossible to widen.
-- -----------------------------------------------------------------------------
create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_count int;
begin
  if auth.uid() is null then
    return 0;
  end if;

  update public.notifications
     set read_at = now()
   where user_id = auth.uid() and read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- -----------------------------------------------------------------------------
-- Grants: locked shut, then opened only to signed-in users.
-- -----------------------------------------------------------------------------
revoke all on function public.touch_session(text)             from public, anon, authenticated;
revoke all on function public.end_session(text)               from public, anon, authenticated;
revoke all on function public.mark_all_notifications_read()   from public, anon, authenticated;

grant execute on function public.touch_session(text)           to authenticated;
grant execute on function public.end_session(text)             to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
