-- =============================================================================
-- 0030 · Developer console: health, webhooks, failures
--
-- Three screens that shipped as mock-ups. One of them is deliberately not being
-- built as designed.
--
-- The mock for /dev/keys had a "Generate key" button and a list of API keys
-- with a Revoke action. This platform has no API-key system, and adding one to
-- fill a screen would mean inventing an authentication path nothing needs — a
-- second way in, with its own storage, rotation and revocation to get wrong.
-- The screen becomes what a developer actually opens it for: which integrations
-- are configured, and how much quota is left. Configuration status, never
-- values: the secrets live in Vercel and Supabase and are not readable from the
-- application, which is the property worth keeping.
--
-- What is here is the two things that genuinely need a database: what failed,
-- and what arrived.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- One number per thing that can be broken.
--
-- Counts rather than rows: the health screen answers "is anything wrong?", and
-- a page that ships a thousand rows to answer that is the wrong shape.
-- -----------------------------------------------------------------------------
create or replace function public.get_system_health()
returns table (
  emails_failed_24h        integer,
  emails_sent_24h          integer,
  notifications_failed_24h integer,
  notifications_pending    integer,
  notifications_stuck      integer,
  webhooks_failed_24h      integer,
  webhooks_received_24h    integer,
  last_webhook_at          timestamptz,
  last_email_at            timestamptz
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'NOT_PERMITTED' using errcode = '42501';
  end if;

  return query
  select
    (select count(*)::int from public.email_log
      where state = 'failed' and created_at > now() - interval '24 hours'),
    -- Anything not 'failed' left the building, including rows still 'queued' —
    -- same rule email_pool_usage() uses for quota, because the provider counted
    -- them the moment they were accepted.
    (select count(*)::int from public.email_log
      where state <> 'failed' and created_at > now() - interval '24 hours'),
    (select count(*)::int from public.notification_queue
      where status = 'failed' and created_at > now() - interval '24 hours'),
    (select count(*)::int from public.notification_queue
      where status = 'pending' and scheduled_for <= now()),
    -- Claimed over ten minutes ago means a worker took the row and died.
    -- claim_notification_batch reclaims these, so a non-zero number here is
    -- only alarming if it stays non-zero.
    (select count(*)::int from public.notification_queue
      where status = 'claimed' and claimed_at < now() - interval '10 minutes'),
    (select count(*)::int from public.webhook_events
      where status = 'failed' and received_at > now() - interval '24 hours'),
    (select count(*)::int from public.webhook_events
      where received_at > now() - interval '24 hours'),
    (select max(received_at) from public.webhook_events),
    (select max(created_at) from public.email_log);
end $$;

-- -----------------------------------------------------------------------------
-- Inbound webhook deliveries.
--
-- `webhooks: staff read` already allows selecting the table, but the payload
-- column holds whatever the provider sent — for Razorpay that includes the
-- payer's contact details. This returns everything needed to diagnose a
-- delivery and leaves the payload behind.
-- -----------------------------------------------------------------------------
create or replace function public.get_webhook_events(
  p_provider text default null,
  p_limit    integer default 50
)
returns table (
  id           uuid,
  provider     text,
  event_id     text,
  event_type   text,
  status       text,
  error        text,
  attempts     smallint,
  received_at  timestamptz,
  processed_at timestamptz
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'NOT_PERMITTED' using errcode = '42501';
  end if;

  return query
  select w.id, w.provider, w.event_id, w.event_type, w.status, w.error,
         w.attempts, w.received_at, w.processed_at
    from public.webhook_events w
   where p_provider is null or w.provider = p_provider
   order by w.received_at desc
   limit greatest(1, least(coalesce(p_limit, 50), 200));
end $$;

-- -----------------------------------------------------------------------------
-- Recent failures, across the three things that deliver something.
--
-- One list rather than three screens, because "what is broken right now" is one
-- question. Sorted by time, newest first, so a burst is visible as a burst.
-- -----------------------------------------------------------------------------
create or replace function public.get_recent_failures(p_limit integer default 100)
returns table (
  source     text,
  subject    text,
  detail     text,
  attempts   integer,
  failed_at  timestamptz
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'NOT_PERMITTED' using errcode = '42501';
  end if;

  return query
  (
    select 'email'::text,
           -- The address is the subject of an email failure and the reason
           -- someone opened this page: "did their code go out?"
           l.to_email::text,
           coalesce(l.error, 'Unknown error'),
           1,
           l.created_at
      from public.email_log l
     where l.state = 'failed'
     order by l.created_at desc
     limit 50
  )
  union all
  (
    select 'notification'::text,
           q.title,
           coalesce(q.last_error, 'Unknown error'),
           q.attempts::int,
           coalesce(q.claimed_at, q.created_at)
      from public.notification_queue q
     where q.status = 'failed'
     order by coalesce(q.claimed_at, q.created_at) desc
     limit 50
  )
  union all
  (
    select 'webhook'::text,
           w.provider || ' · ' || w.event_type,
           coalesce(w.error, 'Unknown error'),
           w.attempts::int,
           w.received_at
      from public.webhook_events w
     where w.status = 'failed'
     order by w.received_at desc
     limit 50
  )
  order by 5 desc
  limit greatest(1, least(coalesce(p_limit, 100), 300));
end $$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke all on function public.get_system_health()              from public, anon, authenticated;
revoke all on function public.get_webhook_events(text, integer) from public, anon, authenticated;
revoke all on function public.get_recent_failures(integer)      from public, anon, authenticated;

grant execute on function public.get_system_health()              to authenticated;
grant execute on function public.get_webhook_events(text, integer) to authenticated;
grant execute on function public.get_recent_failures(integer)      to authenticated;
