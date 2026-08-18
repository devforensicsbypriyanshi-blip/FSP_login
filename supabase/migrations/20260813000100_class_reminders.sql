-- =============================================================================
-- 0017 · Class reminders
--
-- The queue from 0016 had nothing filling it. This is the producer: it turns
-- "a class starts in 15 minutes" into queue rows, and it is the reason the
-- platform can claim students will not miss a class.
--
-- Idempotency comes from reminder_24h_sent_at / reminder_15m_sent_at, which
-- already existed on live_sessions and were never written. Both the stamp and
-- the enqueue happen in one statement's transaction, so a crash mid-run either
-- does both or neither — never a second reminder to the same 200 people.
--
-- Channel choice is deliberate and worth reading:
--
--   T-24h  push + email. There is time for email to matter, and it reaches
--          students who never enabled push (the majority, realistically).
--   T-15m  push ONLY. Email at fifteen minutes is a race the mail server
--          usually loses, and a "starting now" message landing after the class
--          ended is worse than no message. It would also burn the daily quota
--          on the channel least able to use it.
--
-- THE CONSTRAINT THAT BINDS: Resend's free tier is 100 emails a DAY. A 24h
-- reminder to 200 enrolled students is 200 emails from one class. Beyond ~80
-- students on a paid course, the email channel needs a paid plan or a digest.
-- The worker caps email at 40 a run precisely so sign-in codes keep headroom —
-- reminders degrade, sign-in never does.
-- =============================================================================

create or replace function public.enqueue_due_reminders()
returns table (kind text, sessions integer, recipients integer)
language plpgsql security definer set search_path = public
as $$
declare
  v_session record;
  v_sessions_24 int := 0;
  v_people_24   int := 0;
  v_sessions_15 int := 0;
  v_people_15   int := 0;
  v_added int;
begin
  -- ---------------------------------------------------------------- T-24h ---
  -- A two-hour window, not an instant: the job runs every five minutes, and a
  -- narrow window would drop any class whose moment fell in a missed run.
  -- reminder_24h_sent_at is what actually prevents duplicates.
  for v_session in
    select s.id, s.course_id, s.title, s.starts_at
      from public.live_sessions s
     where s.status = 'scheduled'
       and s.reminder_24h_sent_at is null
       and s.starts_at between now() + interval '23 hours' and now() + interval '25 hours'
     order by s.starts_at
     limit 50
     for update skip locked
  loop
    -- The subquery calls enqueue_notification() once per enrolled student;
    -- count(*) over it is how many were queued.
    select count(*)::int into v_added
      from (
        select public.enqueue_notification(
                 e.user_id,
                 'class.reminder',
                 'Tomorrow: ' || v_session.title,
                 'Your class starts at '
                   || to_char(v_session.starts_at at time zone 'Asia/Kolkata', 'FMHH12:MI AM')
                   || ' IST tomorrow.',
                 jsonb_build_object('url', '/app/live', 'session_id', v_session.id),
                 'class',
                 array['push','email'],
                 now()
               )
          from public.enrollments e
         where e.course_id = v_session.course_id and e.status = 'active'
      ) enqueued;

    update public.live_sessions
       set reminder_24h_sent_at = now()
     where id = v_session.id;

    v_sessions_24 := v_sessions_24 + 1;
    v_people_24 := v_people_24 + coalesce(v_added, 0);
  end loop;

  -- ---------------------------------------------------------------- T-15m ---
  for v_session in
    select s.id, s.course_id, s.title, s.starts_at
      from public.live_sessions s
     where s.status in ('scheduled', 'live')
       and s.reminder_15m_sent_at is null
       and s.starts_at between now() - interval '5 minutes' and now() + interval '20 minutes'
     order by s.starts_at
     limit 50
     for update skip locked
  loop
    select count(*)::int into v_added
      from (
        select public.enqueue_notification(
                 e.user_id,
                 'class.starting',
                 v_session.title || ' starts soon',
                 'The room is open now. Tap to join.',
                 jsonb_build_object('url', '/app/live', 'session_id', v_session.id),
                 'class',
                 array['push'],          -- push only; see the header
                 now()
               )
          from public.enrollments e
         where e.course_id = v_session.course_id and e.status = 'active'
      ) enqueued;

    update public.live_sessions
       set reminder_15m_sent_at = now()
     where id = v_session.id;

    v_sessions_15 := v_sessions_15 + 1;
    v_people_15 := v_people_15 + coalesce(v_added, 0);
  end loop;

  return query
    select 'reminder_24h'::text, v_sessions_24, v_people_24
    union all
    select 'reminder_15m'::text, v_sessions_15, v_people_15;
end $$;

-- -----------------------------------------------------------------------------
-- Housekeeping: the queue is append-only and would grow forever otherwise.
-- Failed rows are kept longer than sent ones — they are the ones worth reading.
-- -----------------------------------------------------------------------------
create or replace function public.prune_notification_queue()
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_count int;
begin
  delete from public.notification_queue
   where (status = 'sent'    and sent_at    < now() - interval '14 days')
      or (status = 'skipped' and created_at < now() - interval '14 days')
      or (status = 'failed'  and created_at < now() - interval '60 days');

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- -----------------------------------------------------------------------------
-- Schedule it in-database.
--
-- Producing reminders needs no network, so pg_cron does it directly rather than
-- calling out through pg_net. One less moving part, and it keeps working even
-- if the web app is down — the queue simply drains when delivery recovers.
--
-- DELIVERY still needs the external worker (Vercel Cron → /api/cron/notifications),
-- because sending push and email requires HTTP that Postgres should not be making.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed — skipping reminder scheduling (expected locally).';
    return;
  end if;

  -- unschedule first so re-running this migration does not stack duplicates
  perform cron.unschedule('enqueue-reminders') where exists (
    select 1 from cron.job where jobname = 'enqueue-reminders');
  perform cron.unschedule('prune-notification-queue') where exists (
    select 1 from cron.job where jobname = 'prune-notification-queue');

  perform cron.schedule(
    'enqueue-reminders', '*/5 * * * *',
    $job$ select public.enqueue_due_reminders(); $job$
  );

  perform cron.schedule(
    'prune-notification-queue', '30 3 * * *',
    $job$ select public.prune_notification_queue(); $job$
  );
end $$;

-- -----------------------------------------------------------------------------
-- Grants. Worker-only: both run under pg_cron (superuser) or the service role,
-- which bypass grants entirely. Nothing signed-in needs to call them, and
-- exposing enqueue_due_reminders() would let any user spam 200 inboxes.
-- -----------------------------------------------------------------------------
revoke all on function public.enqueue_due_reminders()      from public, anon, authenticated;
revoke all on function public.prune_notification_queue()   from public, anon, authenticated;
