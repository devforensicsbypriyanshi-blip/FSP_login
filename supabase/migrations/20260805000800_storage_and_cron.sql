-- =============================================================================
-- 0008 · Storage buckets and scheduled jobs
-- docs/02-DATABASE-SCHEMA.md §10 and §11
-- =============================================================================

-- ------------------------------- BUCKETS ------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('resources',          'resources',          false, 52428800),
  ('invoices',           'invoices',           false, 10485760),
  ('ticket-attachments', 'ticket-attachments', false, 10485760),
  ('avatars',            'avatars',            true,   2097152)
on conflict (id) do nothing;

-- Students never read `resources` directly. The API mints a short-lived signed
-- URL after checking enrolment, then writes a resource_downloads audit row.
drop policy if exists "resources: staff direct read only" on storage.objects;
create policy "resources: staff direct read only"
  on storage.objects for select
  using (bucket_id = 'resources' and public.is_staff());

drop policy if exists "avatars: public read" on storage.objects;
create policy "avatars: public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars: write own folder" on storage.objects;
create policy "avatars: write own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars: update own folder" on storage.objects;
create policy "avatars: update own folder"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ------------------------------ SCHEDULED JOBS -------------------------------
-- pg_cron exists on hosted Supabase but not in every local container, so each
-- job is guarded. Vercel Hobby crons fire only once per day, which cannot
-- deliver a T-15-minute class reminder — hence doing this in Postgres.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed — skipping job scheduling (expected locally).';
    return;
  end if;

  -- Flip sessions live/ended on the minute.
  perform cron.schedule(
    'live-status', '* * * * *',
    $job$
      update public.live_sessions set status = 'live'
        where status = 'scheduled' and now() between starts_at and ends_at;
      update public.live_sessions set status = 'ended'
        where status = 'live' and now() > ends_at;
    $job$
  );

  -- Keep a rolling horizon of generated sessions.
  perform cron.schedule(
    'generate-sessions', '0 3 * * *',
    $job$
      select public.generate_sessions(id, 60)
      from public.class_schedules where is_active and auto_generate;
    $job$
  );

  -- Reap devices that vanished without sending a close beacon.
  perform cron.schedule(
    'reap-idle-sessions', '*/5 * * * *',
    $job$
      update public.user_sessions
         set revoked_at = now(), revoke_reason = 'idle_timeout'
       where revoked_at is null and last_seen_at < now() - interval '45 minutes';
    $job$
  );

  -- Expire time-limited enrolments.
  perform cron.schedule(
    'expire-enrollments', '0 1 * * *',
    $job$
      update public.enrollments set status = 'expired'
       where status = 'active' and expires_at is not null and expires_at < now();
    $job$
  );

  -- Revert temporary config changes.
  perform cron.schedule(
    'config-auto-revert', '*/5 * * * *',
    $job$
      update public.feature_flags
         set enabled = default_enabled, revert_at = null
       where revert_at is not null and revert_at < now();
    $job$
  );

  -- Supabase free projects pause after 7 idle days. This keeps ours awake.
  perform cron.schedule('keep-warm', '0 */6 * * *', $job$ select 1 $job$);
end $$;
