-- =============================================================================
-- 0025 · Monthly quota per pool
--
-- Resend's free tier is TWO limits, not one: 100 a day AND 3,000 a month.
-- Tracking only the daily figure means a key that has spent its month still
-- looks healthy every morning — it passes the daily check, gets chosen, and
-- fails at the API. Repeatedly, for the rest of the month.
--
-- This returns both counts in one round trip, so selection can respect both.
--
-- Boundaries are IST for the day and the calendar month, matching how the
-- budgets are reasoned about locally. Resend's own month may reset on a billing
-- date instead — if so the caps below should be set slightly conservative
-- rather than the boundary being made clever, because a cap that is 5% low
-- costs nothing and a cap that is 5% high costs delivery failures.
-- =============================================================================

create or replace function public.email_pool_usage()
returns table (pool_id text, sent_today integer, sent_month integer)
language sql stable security definer set search_path = public
as $$
  with bounds as (
    select
      date_trunc('day',   (now() at time zone 'Asia/Kolkata')) as day_start,
      date_trunc('month', (now() at time zone 'Asia/Kolkata')) as month_start
  )
  select
    coalesce(l.pool_id, 'default')::text,
    count(*) filter (
      where (l.created_at at time zone 'Asia/Kolkata') >= b.day_start
    )::int,
    count(*)::int
  from public.email_log l
  cross join bounds b
  where (l.created_at at time zone 'Asia/Kolkata') >= b.month_start
    -- A failed send never left, so it never counted against the provider quota.
    and l.state <> 'failed'
  group by 1;
$$;

revoke all on function public.email_pool_usage() from public, anon, authenticated;

-- Staff read this on the deliverability screen; the underlying table is already
-- staff-only, so exposing the aggregate to them leaks nothing new.
grant execute on function public.email_pool_usage() to authenticated;
