-- =============================================================================
-- 0024 · Email sending pools
--
-- One provider account is a single point of failure for a platform whose ONLY
-- authentication channel is email. If it hits a cap, is rate-limited, or is
-- suspended, nobody can sign in — not "degraded", locked out.
--
-- So sends are routed across named pools, and each send records which pool
-- carried it. That gives three things the previous single-key setup could not:
--
--   - a real per-pool daily count, so budgets are enforced against what was
--     actually sent rather than what we assumed
--   - automatic failover, because "is this pool exhausted?" is answerable
--   - an answer to "why did this student not get their code?" that names the
--     account it went through
-- =============================================================================

alter table public.email_log
  add column if not exists pool_id text;

-- The worker asks "how much has each pool sent today?" on every send, so this
-- index is the difference between a fast lookup and a daily table scan.
create index if not exists idx_email_log_pool_day
  on public.email_log (pool_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Usage per pool for the current day.
--
-- Day boundary is IST, not UTC: the caps these budgets track reset on the
-- provider's clock, and reasoning about "today" in two timezones is how a
-- budget silently doubles at 05:30.
-- -----------------------------------------------------------------------------
create or replace function public.email_pool_usage_today()
returns table (pool_id text, sent_count integer)
language sql stable security definer set search_path = public
as $$
  select coalesce(l.pool_id, 'default')::text, count(*)::int
    from public.email_log l
   where l.created_at >= date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'
     and l.state <> 'failed'
   group by 1;
$$;

revoke all on function public.email_pool_usage_today() from public, anon, authenticated;
