-- =============================================================================
-- 0012 · Harden function exposure
--
-- Fixes raised by the Supabase security advisor after the first real run.
-- All were genuine; none were caught by our own CI, which only checks that
-- tables have RLS.
--
-- Two classes of problem:
--
--   1. `touch_updated_at` did not pin search_path. Every other helper does.
--      Without the pin a caller can shadow `public` and have the function
--      resolve to their own objects — the standard SECURITY DEFINER
--      escalation. This one is SECURITY INVOKER so the risk is lower, but
--      there is no reason to leave it unpinned.
--
--   2. PostgREST exposes every function in `public` as an RPC endpoint at
--      /rest/v1/rpc/<name>, and Postgres grants EXECUTE to PUBLIC by default.
--      That means trigger-only and internal functions were callable over HTTP
--      by anyone. SECURITY DEFINER makes that worse: they run with the
--      definer's rights, bypassing RLS.
--
-- The fix is least privilege: revoke by default, grant back only what a
-- signed-in user genuinely needs to call.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Pin the missing search_path.
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Trigger-only functions must never be callable over HTTP.
--
-- These take no meaningful arguments and rely on trigger context (NEW / OLD /
-- TG_ARGV). Called directly they would error or, worse, act on a null record.
-- Nothing outside the trigger system should reach them.
-- -----------------------------------------------------------------------------
revoke all on function public.touch_updated_at()      from public, anon, authenticated;
revoke all on function public.handle_new_user()       from public, anon, authenticated;
revoke all on function public.apply_email_event()     from public, anon, authenticated;
revoke all on function public.track_config_change()   from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Privileged operations — service role and cron only.
--
-- generate_sessions() is SECURITY DEFINER and writes live_sessions. Left
-- exposed, any signed-in student could call it with an arbitrary schedule id
-- and create class rows. It belongs to the educator flow (through an API
-- route that checks ownership) and to the nightly cron job.
-- -----------------------------------------------------------------------------
revoke all on function public.generate_sessions(uuid, integer) from public, anon, authenticated;

-- Operational data, not student data: how close we are to the email cap, and
-- whether a given address is suppressed. `is_email_suppressed` in particular
-- would let any signed-in user probe which addresses have bounced.
revoke all on function public.email_quota_today()                  from public, anon, authenticated;
revoke all on function public.is_email_suppressed(citext)          from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. RLS helpers — usable by the policy engine, not by HTTP callers.
--
-- These are invoked inside policy expressions, which run as the definer
-- regardless of who holds EXECUTE. Revoking them removes a set of probe
-- endpoints without affecting policy evaluation at all.
-- -----------------------------------------------------------------------------
revoke all on function public.current_role_keys()      from public, anon, authenticated;
revoke all on function public.has_role(public.app_role) from public, anon, authenticated;
revoke all on function public.is_staff()               from public, anon, authenticated;
revoke all on function public.is_enrolled(uuid)        from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Functions signed-in users SHOULD be able to call.
--
-- Each performs its own authorisation using auth.uid(), so being callable is
-- the point. anon is excluded everywhere: none of these mean anything without
-- a session, and leaving them open to anon only invites probing.
-- -----------------------------------------------------------------------------
revoke all on function public.get_live_join_url(uuid)                        from public, anon;
revoke all on function public.claim_session(text, text, text, inet)          from public, anon;
revoke all on function public.revoke_other_sessions(text)                    from public, anon;

grant execute on function public.get_live_join_url(uuid)               to authenticated;
grant execute on function public.claim_session(text, text, text, inet) to authenticated;
grant execute on function public.revoke_other_sessions(text)           to authenticated;

-- support_is_open() reveals nothing sensitive and the sign-in page shows
-- support hours before a user has authenticated, so anon keeps access.
revoke all on function public.support_is_open(timestamptz) from public;
grant execute on function public.support_is_open(timestamptz) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Note on the remaining advisor warnings
--
-- `citext`, `pg_trgm` and `btree_gist` are installed in `public` rather than a
-- dedicated `extensions` schema. Deliberately left alone: `citext` is used as
-- a COLUMN TYPE on profiles.email, coupons.code and email_log.to_email, and
-- relocating a type that columns depend on requires rewriting those columns.
-- The warning is about tidiness, not a vulnerability, and the migration risk
-- outweighs the benefit on a live database.
--
-- `rls_auto_enable()` also appears in the advisor output. It is NOT ours — it
-- does not exist anywhere in supabase/migrations. It was created by Supabase
-- tooling, so it is left untouched.
-- =============================================================================
