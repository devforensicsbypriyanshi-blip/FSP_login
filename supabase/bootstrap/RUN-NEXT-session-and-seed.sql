-- =============================================================================
-- FSP · RUN THIS IN THE SUPABASE SQL EDITOR
--
-- Nineteen migrations, in order.
--
-- SAFE TO RE-RUN — and this is now CHECKED, not claimed.
--
--   npm run db:check
--
-- That was asserted twice by hand and wrong twice, both times landing on you
-- mid-deploy as a bare Postgres error:
--
--   ERROR: 42710: policy "push tokens: own only" already exists
--   ERROR: 42710: policy "enrollments: admin updates" already exists
--
-- The second slipped past a manual audit because the audit matched drops to
-- creates by ADJACENCY. The statement was a drop directly above a create — for
-- a different policy name. It reads as guarded and is not. Only matching the
-- exact (name, table) pair catches that, which a script does reliably and a
-- person does not. scripts/check-migrations.mjs now runs in `npm run verify`.
--
-- So: create-or-replace for functions, if-not-exists for tables and indexes,
-- drop-if-exists before every policy and trigger, and a pg_constraint check
-- before every constraint. If a run fails partway, fix the cause and paste the
-- whole file again; the parts that already applied reapply harmlessly.
--
--   0013 session_lifecycle      heartbeat, sign-out, mark-all-read
--   0014 launch_content_seed    courses, lessons, schedule, grant_course_access()
--   0015 educator_authoring     scheduling RPCs + RLS SECURITY FIXES
--   0016 notification_queue     queue, FCM tokens, enqueue + worker functions
--   0017 class_reminders        24h/15m reminder producer + pg_cron schedule
--   0018 rls_insert_hardening   MORE SECURITY FIXES + audit_policy_asymmetry()
--   0019 support_desk           ticket update policy, reply + status functions
--   0020 reschedule_occurrence  move one class without moving the pattern
--   0021 quiz_engine            attempt lifecycle, server-side scoring
--   0022 doubts_visibility      SECURITY FIX: answers leaked past the doubt
--   0023 checkout               orders, coupons, webhook fulfilment + coupon fix
--   0024 email_pools            per-key send tracking
--   0025 email_pool_monthly     daily AND monthly quota per key
--   0026 attendance            join counts, devices, and the class register
--   0027 studio_authoring      doubts desk, quiz builder, broadcasts
--   0028 notes_authoring       text/link resources, reading log, watermarking
--   0029 admin_console         roles, coupons, approvals, audit reads
--   0030 dev_console           health counters, webhook deliveries, failures
--   0031 mentorship            slot holds, atomic booking, paid confirmation
--
-- Afterwards run: npm run db:types
-- =============================================================================

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


-- =============================================================================
-- 0014 · Launch content seed + manual enrolment helper
--
-- Two problems this solves:
--   1. The wired pages have nothing to render, so every screen is an empty
--      state and nobody can tell working code from broken code.
--   2. Payments ship disabled, so granting access by hand is the ONLY way a
--      student gets into a course at launch.
--
-- Idempotent throughout: safe to run twice. Courses key off `slug`, lessons off
-- (module_id, position), so re-running updates rather than duplicating.
--
-- Lessons are seeded as kind='text' deliberately. The drive_required_for_media
-- constraint demands a real Drive file id for 'video' and 'pdf', and inventing
-- one would produce a lesson that renders a broken iframe. Set the id and flip
-- the kind together when the real recording exists — see §3 at the bottom.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · Courses
-- -----------------------------------------------------------------------------
insert into public.courses (slug, title, subtitle, description, category, tags, price_inr, mrp_inr, status, published_at)
values
  (
    'ugc-net-forensic-science-2026',
    'UGC NET Forensic Science Masterclass 2026',
    'Complete Paper I + Paper II coverage with live classes',
    'Full syllabus coverage for the UGC NET Forensic Science paper, taught live with recordings, notes and previous-year analysis.',
    'UGC NET 2026',
    array['ugc-net','paper-ii','live'],
    0, null, 'published', now()
  ),
  (
    'forensic-ballistics-gsr',
    'Forensic Ballistics & GSR Micro-Analysis',
    'Firearms, ammunition and gunshot residue interpretation',
    'Internal, external and terminal ballistics, plus SEM-EDX interpretation of gunshot residue, worked through real case studies.',
    'Specialisation',
    array['ballistics','gsr','self-paced'],
    0, null, 'published', now()
  ),
  (
    'digital-cyber-forensics',
    'Digital & Cyber Forensics Masterclass',
    'Disk, memory and mobile forensics end to end',
    'Acquisition, imaging, file-system analysis and mobile extraction, with the chain-of-custody practice that makes evidence admissible.',
    'Specialisation',
    array['digital','cyber','self-paced'],
    0, null, 'published', now()
  )
on conflict (slug) do update
  set title = excluded.title,
      subtitle = excluded.subtitle,
      description = excluded.description,
      category = excluded.category,
      status = excluded.status;

-- -----------------------------------------------------------------------------
-- 2 · Modules and lessons
-- -----------------------------------------------------------------------------
do $$
declare
  v_course uuid;
  v_module uuid;
begin
  -- ---------- UGC NET Masterclass ----------
  select id into v_course from public.courses where slug = 'ugc-net-forensic-science-2026';

  insert into public.course_modules (course_id, title, position)
  values (v_course, 'Unit 1 · Foundations of Forensic Science', 1)
  on conflict do nothing;
  select id into v_module from public.course_modules
    where course_id = v_course and position = 1;

  insert into public.lessons (module_id, course_id, title, description, kind, position, is_preview, published_at)
  values
    (v_module, v_course, 'History, scope and the Locard exchange principle',
     'Where the discipline came from and the single principle every case rests on.', 'text', 1, true, now()),
    (v_module, v_course, 'Crime scene management and evidence collection',
     'Securing a scene, sequencing collection, and the mistakes that destroy a case before the lab sees it.', 'text', 2, false, now()),
    (v_module, v_course, 'Chain of custody and admissibility',
     'What makes evidence stand up in court, and what quietly disqualifies it.', 'text', 3, false, now())
  on conflict do nothing;

  insert into public.course_modules (course_id, title, position)
  values (v_course, 'Unit 8 · Forensic Toxicology', 2)
  on conflict do nothing;
  select id into v_module from public.course_modules
    where course_id = v_course and position = 2;

  insert into public.lessons (module_id, course_id, title, description, kind, position, is_preview, published_at)
  values
    (v_module, v_course, 'Classification of poisons',
     'Corrosives, irritants, neurotics — and how classification drives the analysis you choose.', 'text', 1, false, now()),
    (v_module, v_course, 'Viscera preservation and extraction',
     'Sampling, preservatives, and the extraction methods examiners ask about most.', 'text', 2, false, now()),
    (v_module, v_course, 'Instrumental detection: GC-MS and HPLC',
     'Reading a chromatogram and defending the interpretation.', 'text', 3, false, now())
  on conflict do nothing;

  -- ---------- Ballistics ----------
  select id into v_course from public.courses where slug = 'forensic-ballistics-gsr';

  insert into public.course_modules (course_id, title, position)
  values (v_course, 'Firearms and ammunition', 1)
  on conflict do nothing;
  select id into v_module from public.course_modules
    where course_id = v_course and position = 1;

  insert into public.lessons (module_id, course_id, title, description, kind, position, is_preview, published_at)
  values
    (v_module, v_course, 'Firearm classification and mechanisms',
     'Rifled versus smooth-bore, and what each leaves behind.', 'text', 1, true, now()),
    (v_module, v_course, 'Internal, external and terminal ballistics',
     'The three phases of a projectile, and which one your evidence speaks to.', 'text', 2, false, now())
  on conflict do nothing;

  insert into public.course_modules (course_id, title, position)
  values (v_course, 'Gunshot residue', 2)
  on conflict do nothing;
  select id into v_module from public.course_modules
    where course_id = v_course and position = 2;

  insert into public.lessons (module_id, course_id, title, description, kind, position, is_preview, published_at)
  values
    (v_module, v_course, 'GSR formation and deposition',
     'How residue forms, where it lands, and how quickly it disappears.', 'text', 1, false, now()),
    (v_module, v_course, 'SEM-EDX interpretation',
     'Characteristic versus consistent particles, and the limits of the conclusion.', 'text', 2, false, now())
  on conflict do nothing;

  -- ---------- Digital forensics ----------
  select id into v_course from public.courses where slug = 'digital-cyber-forensics';

  insert into public.course_modules (course_id, title, position)
  values (v_course, 'Acquisition and imaging', 1)
  on conflict do nothing;
  select id into v_module from public.course_modules
    where course_id = v_course and position = 1;

  insert into public.lessons (module_id, course_id, title, description, kind, position, is_preview, published_at)
  values
    (v_module, v_course, 'Write blockers and forensic imaging',
     'Producing a copy that is defensible, and proving it did not change.', 'text', 1, true, now()),
    (v_module, v_course, 'Hashing and integrity verification',
     'Why two hashes, and what a mismatch actually means.', 'text', 2, false, now()),
    (v_module, v_course, 'Mobile device extraction',
     'Logical, file-system and physical extraction, and when each is possible.', 'text', 3, false, now())
  on conflict do nothing;
end $$;

-- -----------------------------------------------------------------------------
-- 3 · Live schedule
--
-- Skipped entirely when no profile exists yet, because live_sessions.educator_id
-- is NOT NULL and profiles are created by the auth trigger. Re-run this file
-- after the first educator account exists and the schedule will be created.
-- -----------------------------------------------------------------------------
do $$
declare
  v_educator uuid;
  v_course uuid;
  v_schedule uuid;
begin
  -- Prefer a real educator; fall back to the first account (the owner's).
  select p.id into v_educator
  from public.profiles p
  join public.user_roles ur on ur.user_id = p.id
  join public.roles r on r.id = ur.role_id
  where r.key in ('educator','admin')
  order by p.created_at
  limit 1;

  if v_educator is null then
    select id into v_educator from public.profiles order by created_at limit 1;
  end if;

  if v_educator is null then
    raise notice 'No profiles yet — skipping live schedule. Re-run this file after the first account is created.';
    return;
  end if;

  select id into v_course from public.courses where slug = 'ugc-net-forensic-science-2026';

  insert into public.class_schedules
    (course_id, educator_id, title, description, weekdays, start_time, duration_min, starts_on, auto_generate)
  values
    (v_course, v_educator, 'UGC NET 2026 · Live class',
     'Live syllabus class with doubt clearing at the end.',
     array[1,3,5]::smallint[], '16:00', 90, current_date, true)
  on conflict do nothing
  returning id into v_schedule;

  if v_schedule is null then
    select id into v_schedule from public.class_schedules
    where course_id = v_course and educator_id = v_educator
    limit 1;
  end if;

  -- Fills the next 60 days. Idempotent via unique (schedule_id, occurrence_date).
  if v_schedule is not null then
    perform public.generate_sessions(v_schedule, 60);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 4 · Manual enrolment helper
--
-- Payments are disabled at launch, so this is how a student actually gets in.
-- Admin-only: the guard is inside the function because SECURITY DEFINER means
-- RLS will NOT stop the caller.
-- -----------------------------------------------------------------------------
create or replace function public.grant_course_access(
  p_email  citext,
  p_slug   text,
  p_reason text,
  p_days   integer default null      -- null = lifetime
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid;
  v_course uuid;
  v_enrolment uuid;
begin
  if not public.has_role('admin') then
    raise exception 'ADMIN_ONLY' using errcode = '42501';
  end if;

  -- Free access to paid material should never be anonymous; the reason is read
  -- back out of the audit log months later when someone asks "who let them in?".
  if p_reason is null or length(trim(p_reason)) < 10 then
    raise exception 'REASON_REQUIRED' using errcode = '23514';
  end if;

  select id into v_user from public.profiles where email = p_email;
  if v_user is null then
    raise exception 'NO_SUCH_USER' using errcode = 'P0002';
  end if;

  select id into v_course from public.courses where slug = p_slug;
  if v_course is null then
    raise exception 'NO_SUCH_COURSE' using errcode = 'P0002';
  end if;

  insert into public.enrollments (user_id, course_id, status, expires_at)
  values (v_user, v_course, 'active',
          case when p_days is null then null else now() + make_interval(days => p_days) end)
  on conflict (user_id, course_id) do update
    set status = 'active',
        expires_at = excluded.expires_at
  returning id into v_enrolment;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after)
  values (auth.uid(), 'ENROLMENT_GRANT', 'enrollments', v_enrolment,
          jsonb_build_object('email', p_email, 'course', p_slug, 'reason', p_reason, 'days', p_days));

  insert into public.notifications (user_id, type, title, body, category)
  values (v_user, 'course.published', 'You have been given course access',
          'You now have access to ' || p_slug || '. It is waiting in My Courses.', 'course');

  return v_enrolment;
end $$;

revoke all on function public.grant_course_access(citext, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.grant_course_access(citext, text, text, integer) to authenticated;


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


-- =============================================================================
-- 0016 · Notification queue + Firebase Cloud Messaging tokens
--
-- Why a queue rather than sending inline:
--
--   A class reminder to 200 students is 200 push calls and 200 emails. Doing
--   that inside the request that triggered it means the educator's "schedule
--   class" click hangs for a minute and half of it fails silently. Worse,
--   Resend's free tier is 100 emails A DAY — a burst has to be shaped, not
--   fired.
--
--   So: writing a notification is a fast INSERT. Delivery is a separate worker
--   draining this table, which can retry, back off, respect quotas, and be
--   restarted without losing anything.
--
-- Idempotency is the property that matters. A worker that crashes mid-batch
-- must not re-send what already went out, hence the explicit status machine and
-- `claimed_at` rather than a plain "pending/sent" boolean.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Device push tokens (FCM).
--
-- Separate from push_subscriptions, which holds raw Web Push (VAPID) keys.
-- Both can coexist: FCM is the transport we send through, and the VAPID table
-- stays for the self-hosted fallback described in docs Part 4 §4.
-- -----------------------------------------------------------------------------
create table if not exists public.push_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  provider     text not null default 'fcm' check (provider in ('fcm', 'webpush')),
  token        text not null,
  device_label text,
  user_agent   text,
  -- Consecutive delivery failures. FCM returns UNREGISTERED for tokens that are
  -- dead for good; those are deleted outright. This counts the softer failures.
  failure_count integer not null default 0,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  unique (provider, token)
);

create index if not exists idx_push_tokens_user on public.push_tokens (user_id);

-- -----------------------------------------------------------------------------
-- The queue.
-- -----------------------------------------------------------------------------
create table if not exists public.notification_queue (
  id              bigserial primary key,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  notification_id uuid references public.notifications(id) on delete cascade,
  channel         text not null check (channel in ('push', 'email')),
  title           text not null,
  body            text,
  data            jsonb not null default '{}'::jsonb,
  status          text not null default 'pending'
                    check (status in ('pending', 'claimed', 'sent', 'failed', 'skipped')),
  attempts        smallint not null default 0,
  -- Lets a reminder be written now and delivered at the right moment.
  scheduled_for   timestamptz not null default now(),
  claimed_at      timestamptz,
  sent_at         timestamptz,
  last_error      text,
  created_at      timestamptz not null default now()
);

-- The worker's read path: due, not yet done, oldest first.
create index if not exists idx_queue_due
  on public.notification_queue (scheduled_for)
  where status in ('pending', 'claimed');

create index if not exists idx_queue_user on public.notification_queue (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Enqueue.
--
-- Writes the in-app notification row AND one queue row per channel the user has
-- not switched off. In-app is never queued: the row IS the delivery.
--
-- Channel preferences default to ON when no notification_prefs row exists, so a
-- brand-new account still gets its class reminders.
-- -----------------------------------------------------------------------------
create or replace function public.enqueue_notification(
  p_user      uuid,
  p_type      text,
  p_title     text,
  p_body      text default null,
  p_data      jsonb default '{}'::jsonb,
  p_category  text default null,
  p_channels  text[] default array['push','email'],
  p_send_at   timestamptz default now()
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_notification uuid;
  v_prefs record;
  v_channel text;
begin
  insert into public.notifications (user_id, type, title, body, data, category)
  values (p_user, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb), p_category)
  returning id into v_notification;

  select * into v_prefs
  from public.notification_prefs
  where user_id = p_user and type = p_type;

  foreach v_channel in array coalesce(p_channels, array[]::text[]) loop
    -- `found` is false when the user has no row for this type, which means
    -- "not configured" and therefore "on".
    continue when v_channel = 'push'  and found and not v_prefs.push;
    continue when v_channel = 'email' and found and not v_prefs.email;

    -- Never mail an address that hard-bounced or complained; continuing to do
    -- so damages sender reputation for everyone.
    continue when v_channel = 'email'
      and public.is_email_suppressed((select email from public.profiles where id = p_user));

    insert into public.notification_queue
      (user_id, notification_id, channel, title, body, data, scheduled_for)
    values
      (p_user, v_notification, v_channel, p_title, p_body,
       coalesce(p_data, '{}'::jsonb), coalesce(p_send_at, now()));
  end loop;

  return v_notification;
end $$;

-- -----------------------------------------------------------------------------
-- Fan out to everyone enrolled in a course. One statement, not a client loop of
-- 200 round-trips.
-- -----------------------------------------------------------------------------
create or replace function public.enqueue_for_course(
  p_course   uuid,
  p_type     text,
  p_title    text,
  p_body     text default null,
  p_data     jsonb default '{}'::jsonb,
  p_category text default null,
  p_send_at  timestamptz default now()
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_count int := 0; v_user uuid;
begin
  if not (public.is_staff() or exists (
    select 1 from public.courses c where c.id = p_course and c.created_by = auth.uid()
  )) then
    raise exception 'NOT_PERMITTED' using errcode = '42501';
  end if;

  for v_user in
    select user_id from public.enrollments where course_id = p_course and status = 'active'
  loop
    perform public.enqueue_notification(
      v_user, p_type, p_title, p_body, p_data, p_category, array['push','email'], p_send_at);
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

-- -----------------------------------------------------------------------------
-- Worker: claim a batch atomically.
--
-- FOR UPDATE SKIP LOCKED is what makes this safe to run concurrently — two
-- workers claim disjoint rows instead of fighting over the same ones. Rows
-- stuck in 'claimed' for over 10 minutes are reclaimed, which covers a worker
-- that died mid-batch.
-- -----------------------------------------------------------------------------
create or replace function public.claim_notification_batch(p_channel text, p_limit integer default 50)
returns setof public.notification_queue
language plpgsql security definer set search_path = public
as $$
begin
  return query
  update public.notification_queue q
     set status = 'claimed', claimed_at = now(), attempts = q.attempts + 1
   where q.id in (
     select id from public.notification_queue
      where channel = p_channel
        and scheduled_for <= now()
        and attempts < 5
        and (status = 'pending' or (status = 'claimed' and claimed_at < now() - interval '10 minutes'))
      order by scheduled_for
      limit greatest(1, least(p_limit, 200))
      for update skip locked
   )
  returning q.*;
end $$;

create or replace function public.complete_notification(
  p_id      bigint,
  p_status  text,
  p_error   text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_status not in ('sent', 'failed', 'skipped') then
    raise exception 'BAD_STATUS' using errcode = '23514';
  end if;

  update public.notification_queue
     set status = p_status,
         sent_at = case when p_status = 'sent' then now() else sent_at end,
         last_error = p_error
   where id = p_id;
end $$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.push_tokens        enable row level security;
alter table public.notification_queue enable row level security;

-- `create policy` has no IF NOT EXISTS form, so the drop is what makes
-- re-running this file safe after a partial failure further down.
drop policy if exists "push tokens: own only" on public.push_tokens;
create policy "push tokens: own only" on public.push_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Read-only, and only your own. The queue is written by enqueue_notification()
-- and drained by the worker under the service role — never by a browser.
drop policy if exists "queue: read own" on public.notification_queue;
create policy "queue: read own" on public.notification_queue
  for select using (user_id = auth.uid() or public.is_staff());

-- -----------------------------------------------------------------------------
-- Grants. Everything shut, then opened deliberately.
--
-- claim_notification_batch and complete_notification are NOT granted to
-- authenticated: they are worker-only and run under the service role, which
-- bypasses these grants. Exposing them would let any signed-in user mark
-- another person's notifications as sent.
-- -----------------------------------------------------------------------------
revoke all on function public.enqueue_notification(uuid, text, text, text, jsonb, text, text[], timestamptz)
  from public, anon, authenticated;
revoke all on function public.enqueue_for_course(uuid, text, text, text, jsonb, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.claim_notification_batch(text, integer)
  from public, anon, authenticated;
revoke all on function public.complete_notification(bigint, text, text)
  from public, anon, authenticated;

grant execute on function public.enqueue_for_course(uuid, text, text, text, jsonb, text, timestamptz)
  to authenticated;


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


-- =============================================================================
-- 0018 · RLS insert hardening — the rest of the class found in 0015
--
-- 0015 fixed live_sessions and courses. This is the systematic sweep for the
-- same bug elsewhere, plus one variant of it.
--
-- The pattern being hunted: a policy that decides WHO you are in `USING` but
-- only WHO YOU CLAIM TO BE in `WITH CHECK`. Postgres consults WITH CHECK alone
-- on INSERT, so any condition missing from it is unenforced at creation time.
--
-- IMPORTANT: feature flags do NOT mitigate any of this. Quizzes, doubts and
-- mentorship all ship switched off, but a flag hides the UI — PostgREST still
-- serves /rest/v1/quizzes to any signed-in user. RLS is the only control.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · quizzes
--
-- Was: for all using (created_by = auth.uid()) with check (created_by = auth.uid())
--
-- Any signed-in student could insert a quiz against any course_id with
-- status = 'published'. The select policy is
--   (status = 'published' and is_enrolled(course_id)) or created_by = auth.uid()
-- so the fake quiz becomes visible to every enrolled student on that course.
-- On an exam-prep platform, a fabricated quiz is not vandalism — it is
-- misinformation delivered with the platform's authority behind it.
-- -----------------------------------------------------------------------------
drop policy if exists "quizzes: educator manages own" on public.quizzes;
create policy "quizzes: educator manages own" on public.quizzes
  for all
  using (created_by = auth.uid())
  with check (
    created_by = auth.uid()
    and (public.has_role('educator') or public.has_role('admin'))
  );

-- Questions and options follow the quiz, so they inherit the fix. Their
-- existing policies already require owning the parent quiz.

-- -----------------------------------------------------------------------------
-- 2 · mentorship_slots
--
-- Was: for all using (educator_id = auth.uid()) with check (educator_id = auth.uid())
--
-- `slots: readable when signed in` shows every slot to every signed-in user, so
-- a student could advertise fabricated 1:1 sessions — including a price — to
-- the entire student body.
-- -----------------------------------------------------------------------------
drop policy if exists "slots: educator manages own" on public.mentorship_slots;
create policy "slots: educator manages own" on public.mentorship_slots
  for all
  using (educator_id = auth.uid())
  with check (
    educator_id = auth.uid()
    and (public.has_role('educator') or public.has_role('admin'))
  );

-- -----------------------------------------------------------------------------
-- 3 · doubt_answers — a variant, and the most damaging of the three
--
-- Was: for insert with check (user_id = auth.uid())
--
-- The row carries `is_educator_verified`, which the UI renders as an official,
-- educator-endorsed answer. Nothing stopped the poster setting it themselves.
-- Any student could publish a wrong answer wearing the platform's badge of
-- authority, to an audience revising for an exam.
--
-- `is_accepted` is the same story, one notch less severe.
--
-- Ownership of the flag belongs to the role, not the author: an educator
-- answering their own doubt may set it; everyone else must post it false and
-- let an educator promote it later.
-- -----------------------------------------------------------------------------
drop policy if exists "answers: post own" on public.doubt_answers;
create policy "answers: post own" on public.doubt_answers
  for insert
  with check (
    user_id = auth.uid()
    and (
      (is_educator_verified = false and is_accepted = false)
      or public.has_role('educator')
      or public.has_role('admin')
    )
  );

-- There was no UPDATE policy at all, which meant a verified answer could never
-- be marked after the fact — an educator had to get it right on first post.
-- Educators and staff may now promote an existing answer.
drop policy if exists "answers: educator verifies" on public.doubt_answers;
create policy "answers: educator verifies" on public.doubt_answers
  for update
  using (public.has_role('educator') or public.has_role('admin'))
  with check (public.has_role('educator') or public.has_role('admin'));

-- -----------------------------------------------------------------------------
-- 4 · enrollments — narrow writes to admin, matching the documented matrix
--
-- Was: for update using (public.is_staff())
--
-- is_staff() is admin OR developer OR support. So a developer — whose documented
-- permissions are api keys, feature flags, webhooks and audit logs — could
-- revoke a paying student's course access, and a support agent could grant
-- themselves a paid course by flipping a suspended row back to active.
--
-- Neither is in the RBAC matrix in docs Part 3 §2, and grant_course_access()
-- already requires admin. This makes the UPDATE path agree with the INSERT path
-- instead of quietly being three roles wider.
--
-- Support keeps READ access — "is this student actually enrolled?" is the most
-- common question on the helpdesk, and answering it needs no write.
-- -----------------------------------------------------------------------------
drop policy if exists "enrollments: staff updates" on public.enrollments;
drop policy if exists "enrollments: admin updates" on public.enrollments;
create policy "enrollments: admin updates" on public.enrollments
  for update
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

-- -----------------------------------------------------------------------------
-- 5 · A standing check for the whole class of bug.
--
-- Returns every FOR ALL policy whose WITH CHECK differs from its USING. Not
-- every result is a bug — an intentionally asymmetric policy is legitimate —
-- but each one deserves a human read, and the two real vulnerabilities found so
-- far both showed up here. Run it after any migration that touches policies.
--
--   select * from public.audit_policy_asymmetry();
-- -----------------------------------------------------------------------------
create or replace function public.audit_policy_asymmetry()
returns table (table_name text, policy_name text, using_expr text, check_expr text)
language sql stable security definer set search_path = public, pg_catalog
as $$
  select (schemaname || '.' || tablename)::text,
         policyname::text,
         qual::text,
         with_check::text
    from pg_policies
   where schemaname = 'public'
     and cmd = 'ALL'
     and qual is not null
     and with_check is not null
     and qual::text is distinct from with_check::text
   order by tablename, policyname;
$$;

-- Staff-only: the output is a map of exactly where the authorisation logic is
-- asymmetric, which is a gift to anyone probing.
revoke all on function public.audit_policy_asymmetry() from public, anon, authenticated;


-- =============================================================================
-- 0019 · Support desk
--
-- Two problems found while wiring the UI, both of which make the helpdesk
-- unusable or unsafe as it stands:
--
--   1. support_tickets has NO update policy. Staff can read tickets and
--      students can raise them, but nobody can assign one, change its priority,
--      or close it. A helpdesk that cannot resolve anything is a list.
--
--   2. `ticket_messages: post own` checks only sender_id = auth.uid(). It never
--      checks that the sender has anything to do with the ticket, so any signed-
--      in user who learns a ticket id can post into someone else's conversation.
--      Ticket ids are uuids, so this is not trivially exploitable — but "hard to
--      guess" is not an access control, and support threads carry exactly the
--      account details people should not be able to inject themselves into.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · Staff can work a ticket. Students cannot edit one after raising it —
--     changing your own priority to 'urgent' is not a feature.
-- -----------------------------------------------------------------------------
drop policy if exists "tickets: staff manage" on public.support_tickets;
create policy "tickets: staff manage" on public.support_tickets
  for update
  using (public.is_staff())
  with check (public.is_staff());

-- -----------------------------------------------------------------------------
-- 2 · A message may only be posted into a ticket you own or staff.
--
--     `is_internal` is additionally restricted: a student marking their own
--     message internal would hide it from themselves and confuse the agent
--     reading the thread.
-- -----------------------------------------------------------------------------
drop policy if exists "ticket_messages: post own" on public.ticket_messages;
create policy "ticket_messages: post own" on public.ticket_messages
  for insert
  with check (
    sender_id = auth.uid()
    and (
      public.is_staff()
      or (
        is_internal = false
        and exists (
          select 1 from public.support_tickets t
           where t.id = ticket_id and t.user_id = auth.uid()
        )
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 3 · Reply, with the bookkeeping a helpdesk needs.
--
-- Doing this in one function rather than three client writes means
-- first_response_at, the status transition and the student's notification
-- cannot drift apart — the common failure being a reply that lands but leaves
-- the ticket sitting in 'open' forever.
-- -----------------------------------------------------------------------------
create or replace function public.reply_to_ticket(
  p_ticket   uuid,
  p_body     text,
  p_internal boolean default false
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_message uuid;
  v_owner uuid;
  v_subject text;
  v_staff boolean := public.is_staff();
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if p_body is null or length(trim(p_body)) < 1 then
    raise exception 'EMPTY_MESSAGE' using errcode = '23514';
  end if;

  select user_id, subject into v_owner, v_subject
    from public.support_tickets where id = p_ticket;

  if v_owner is null then
    raise exception 'TICKET_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not v_staff and v_owner <> auth.uid() then
    raise exception 'NOT_YOUR_TICKET' using errcode = '42501';
  end if;

  -- Only staff may write an internal note.
  insert into public.ticket_messages (ticket_id, sender_id, body, is_internal)
  values (p_ticket, auth.uid(), trim(p_body), p_internal and v_staff)
  returning id into v_message;

  if v_staff then
    update public.support_tickets
       set first_response_at = coalesce(first_response_at,
             case when p_internal then first_response_at else now() end),
           -- An internal note is not an answer, so it must not move the ticket
           -- to 'pending' and start the student waiting on nothing.
           status = case
                      when p_internal then status
                      when status = 'open' then 'pending'::ticket_status
                      else status
                    end
     where id = p_ticket;

    if not p_internal then
      perform public.enqueue_notification(
        v_owner, 'support.reply', 'Support replied to your ticket',
        'Re: ' || v_subject,
        jsonb_build_object('url', '/app/support', 'ticket_id', p_ticket),
        'support', array['push','email'], now());
    end if;
  else
    -- The student came back, so it is on us again.
    update public.support_tickets
       set status = case when status = 'resolved' then 'open'::ticket_status else status end
     where id = p_ticket;
  end if;

  return v_message;
end $$;

-- -----------------------------------------------------------------------------
-- 4 · Close a ticket, notifying the student.
-- -----------------------------------------------------------------------------
create or replace function public.set_ticket_status(p_ticket uuid, p_status ticket_status)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_owner uuid; v_subject text;
begin
  if not public.is_staff() then
    raise exception 'STAFF_ONLY' using errcode = '42501';
  end if;

  select user_id, subject into v_owner, v_subject
    from public.support_tickets where id = p_ticket;

  if v_owner is null then
    raise exception 'TICKET_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.support_tickets
     set status = p_status,
         resolved_at = case when p_status in ('resolved','closed') then now() else null end
   where id = p_ticket;

  if p_status = 'resolved' then
    perform public.enqueue_notification(
      v_owner, 'support.resolved', 'Your support ticket was resolved',
      v_subject, jsonb_build_object('url', '/app/support', 'ticket_id', p_ticket),
      'support', array['email'], now());
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke all on function public.reply_to_ticket(uuid, text, boolean)   from public, anon, authenticated;
revoke all on function public.set_ticket_status(uuid, ticket_status) from public, anon, authenticated;

grant execute on function public.reply_to_ticket(uuid, text, boolean)   to authenticated;
grant execute on function public.set_ticket_status(uuid, ticket_status) to authenticated;


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


-- =============================================================================
-- 0021 · Quiz engine
--
-- quiz_attempts and quiz_responses have SELECT policies and nothing else, so a
-- student cannot create an attempt or save an answer by any direct write. That
-- is correct and deliberate — the entire lifecycle runs through the functions
-- below, because every step has a rule that a client must not be trusted with:
--
--   start   enrolment, quiz window, max_attempts, and the expiry clock
--   read    the paper WITHOUT is_correct
--   save    only before submission, only before expiry
--   submit  scoring, server-side, from the database's own answer key
--
-- The single most important property: `is_correct` never leaves the server
-- while an attempt is open. A client that receives the answer key has no quiz,
-- only a formality — and `quiz_options` is REVOKEd from students precisely so
-- that no accidental select can leak it. get_quiz_paper() is the only read
-- path, and it does not return the column.
--
-- The timer is `expires_at` on the attempt row, set at start from the quiz's
-- duration. A countdown in the browser is a display of that value, never the
-- authority — closing the laptop must not buy extra minutes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Start an attempt.
-- -----------------------------------------------------------------------------
create or replace function public.start_quiz_attempt(p_quiz uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_course uuid;
  v_duration integer;
  v_max smallint;
  v_status text;
  v_opens timestamptz;
  v_closes timestamptz;
  v_used integer;
  v_open_attempt uuid;
  v_attempt uuid;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select course_id, duration_min, max_attempts, status, opens_at, closes_at
    into v_course, v_duration, v_max, v_status, v_opens, v_closes
  from public.quizzes where id = p_quiz;

  if v_course is null then
    raise exception 'QUIZ_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_status <> 'published' then
    raise exception 'QUIZ_NOT_PUBLISHED' using errcode = 'P0001';
  end if;

  if not (public.is_enrolled(v_course) or public.is_staff()) then
    raise exception 'NOT_ENROLLED' using errcode = '42501';
  end if;

  if v_opens is not null and now() < v_opens then
    raise exception 'QUIZ_NOT_OPEN' using errcode = 'P0001';
  end if;

  if v_closes is not null and now() > v_closes then
    raise exception 'QUIZ_CLOSED' using errcode = 'P0001';
  end if;

  -- Resume rather than start a second attempt. A dropped connection mid-quiz is
  -- common on mobile, and burning one of three attempts for it would be cruel.
  select id into v_open_attempt
    from public.quiz_attempts
   where quiz_id = p_quiz and user_id = v_user and submitted_at is null and expires_at > now()
   order by started_at desc
   limit 1;

  if v_open_attempt is not null then
    return v_open_attempt;
  end if;

  select count(*) into v_used
    from public.quiz_attempts where quiz_id = p_quiz and user_id = v_user;

  if v_used >= v_max then
    raise exception 'NO_ATTEMPTS_LEFT' using errcode = 'P0001';
  end if;

  insert into public.quiz_attempts (quiz_id, user_id, expires_at)
  values (p_quiz, v_user, now() + make_interval(mins => v_duration))
  returning id into v_attempt;

  return v_attempt;
end $$;

-- -----------------------------------------------------------------------------
-- The paper. Questions and options, WITHOUT is_correct.
--
-- Option order is shuffled per attempt when the quiz asks for it, seeded by the
-- attempt id so a refresh does not reshuffle and disorient the candidate.
-- -----------------------------------------------------------------------------
create or replace function public.get_quiz_paper(p_attempt uuid)
returns table (
  question_id text,
  body        text,
  marks       numeric,
  negative    numeric,
  -- NOT `position`: it is a reserved word in a RETURNS TABLE clause, even
  -- though it is a perfectly legal column name on a table (which is why
  -- quiz_questions.position works). The parser rejects it here.
  q_position  integer,
  options     jsonb,
  chosen      text
)
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_quiz uuid;
  v_owner uuid;
  v_shuffle boolean;
begin
  select a.quiz_id, a.user_id, q.shuffle
    into v_quiz, v_owner, v_shuffle
  from public.quiz_attempts a
  join public.quizzes q on q.id = a.quiz_id
  where a.id = p_attempt;

  if v_quiz is null then
    raise exception 'ATTEMPT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_owner <> v_user then
    raise exception 'NOT_YOUR_ATTEMPT' using errcode = '42501';
  end if;

  return query
  select
    qq.id::text,
    qq.body,
    qq.marks,
    qq.negative,
    qq.position,
    (
      select jsonb_agg(jsonb_build_object('id', o.id, 'body', o.body) order by o.ord)
      from (
        select qo.id, qo.body,
               case when v_shuffle
                    then md5(qo.id::text || p_attempt::text)
                    else lpad(qo.position::text, 6, '0')
               end as ord
        from public.quiz_options qo
        where qo.question_id = qq.id
      ) o
    ) as options,
    (select r.option_id::text from public.quiz_responses r
      where r.attempt_id = p_attempt and r.question_id = qq.id)
  from public.quiz_questions qq
  where qq.quiz_id = v_quiz
  order by qq.position;
end $$;

-- -----------------------------------------------------------------------------
-- Save one answer. Null option_id clears it, which is how "unanswer" works.
-- -----------------------------------------------------------------------------
create or replace function public.save_quiz_response(
  p_attempt  uuid,
  p_question uuid,
  p_option   uuid
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_submitted timestamptz;
  v_expires timestamptz;
  v_quiz uuid;
begin
  select user_id, submitted_at, expires_at, quiz_id
    into v_owner, v_submitted, v_expires, v_quiz
  from public.quiz_attempts where id = p_attempt;

  if v_owner is null then
    raise exception 'ATTEMPT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_owner <> auth.uid() then
    raise exception 'NOT_YOUR_ATTEMPT' using errcode = '42501';
  end if;

  if v_submitted is not null then
    raise exception 'ALREADY_SUBMITTED' using errcode = 'P0001';
  end if;

  -- The clock is here, not in the browser. A tab left open past the deadline
  -- can still send saves; they are refused.
  if now() > v_expires then
    raise exception 'TIME_EXPIRED' using errcode = 'P0001';
  end if;

  -- The question must belong to this attempt's quiz, and the option to that
  -- question. Without both checks a crafted request could answer question A
  -- with an option from question B.
  if not exists (select 1 from public.quiz_questions where id = p_question and quiz_id = v_quiz) then
    raise exception 'QUESTION_NOT_IN_QUIZ' using errcode = '23514';
  end if;

  if p_option is not null
     and not exists (select 1 from public.quiz_options where id = p_option and question_id = p_question) then
    raise exception 'OPTION_NOT_IN_QUESTION' using errcode = '23514';
  end if;

  if p_option is null then
    delete from public.quiz_responses where attempt_id = p_attempt and question_id = p_question;
    return;
  end if;

  insert into public.quiz_responses (attempt_id, question_id, option_id)
  values (p_attempt, p_question, p_option)
  on conflict (attempt_id, question_id) do update
    set option_id = excluded.option_id, answered_at = now();
end $$;

-- -----------------------------------------------------------------------------
-- Submit and score.
--
-- Scoring reads the answer key directly; the client sends nothing but the
-- attempt id. Also callable after expiry, which is how an abandoned attempt is
-- finalised — otherwise a student who closed the tab would have no result at all.
-- -----------------------------------------------------------------------------
create or replace function public.submit_quiz_attempt(p_attempt uuid)
returns table (score numeric, correct integer, wrong integer, skipped integer, total integer)
language plpgsql security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_submitted timestamptz;
  v_quiz uuid;
  v_score numeric := 0;
  v_correct int := 0;
  v_wrong int := 0;
  v_total int := 0;
begin
  select user_id, submitted_at, quiz_id into v_owner, v_submitted, v_quiz
    from public.quiz_attempts where id = p_attempt;

  if v_owner is null then
    raise exception 'ATTEMPT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_owner <> auth.uid() and not public.is_staff() then
    raise exception 'NOT_YOUR_ATTEMPT' using errcode = '42501';
  end if;

  -- Idempotent: a double-tap on Submit, or a retry after a dropped response,
  -- must return the same result rather than rescore or error.
  if v_submitted is not null then
    return query
      select a.score, a.correct_count, a.wrong_count, a.skipped_count,
             (select count(*)::int from public.quiz_questions where quiz_id = a.quiz_id)
      from public.quiz_attempts a where a.id = p_attempt;
    return;
  end if;

  select count(*) into v_total from public.quiz_questions where quiz_id = v_quiz;

  -- Mark each response, storing the per-question award for the review screen.
  update public.quiz_responses r
     set marks_awarded = case when o.is_correct then qq.marks else -qq.negative end
    from public.quiz_options o
    join public.quiz_questions qq on qq.id = o.question_id
   where r.attempt_id = p_attempt and r.option_id = o.id and r.question_id = qq.id;

  select
    coalesce(sum(r.marks_awarded), 0),
    coalesce(sum(case when r.marks_awarded > 0 then 1 else 0 end), 0),
    coalesce(sum(case when r.marks_awarded <= 0 then 1 else 0 end), 0)
    into v_score, v_correct, v_wrong
  from public.quiz_responses r
  where r.attempt_id = p_attempt and r.option_id is not null;

  update public.quiz_attempts
     set submitted_at = now(),
         score = v_score,
         correct_count = v_correct,
         wrong_count = v_wrong,
         skipped_count = greatest(0, v_total - v_correct - v_wrong)
   where id = p_attempt;

  return query select v_score, v_correct, v_wrong, greatest(0, v_total - v_correct - v_wrong), v_total;
end $$;

-- -----------------------------------------------------------------------------
-- The review screen. Correct answers and explanations — ONLY after submission.
--
-- This is the one place is_correct is allowed out, and the guard below is the
-- entire reason it is safe. Fetching this mid-attempt returns nothing.
-- -----------------------------------------------------------------------------
create or replace function public.get_quiz_review(p_attempt uuid)
returns table (
  question_id  text,
  body         text,
  explanation  text,
  marks        numeric,
  awarded      numeric,
  chosen       text,
  correct      text,
  options      jsonb
)
language plpgsql security definer set search_path = public
as $$
declare v_owner uuid; v_submitted timestamptz; v_quiz uuid;
begin
  select user_id, submitted_at, quiz_id into v_owner, v_submitted, v_quiz
    from public.quiz_attempts where id = p_attempt;

  if v_owner is null then
    raise exception 'ATTEMPT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_owner <> auth.uid() and not public.is_staff() then
    raise exception 'NOT_YOUR_ATTEMPT' using errcode = '42501';
  end if;

  if v_submitted is null then
    raise exception 'NOT_SUBMITTED' using errcode = 'P0001';
  end if;

  return query
  select
    qq.id::text,
    qq.body,
    qq.explanation,
    qq.marks,
    r.marks_awarded,
    r.option_id::text,
    (select o.id::text from public.quiz_options o where o.question_id = qq.id and o.is_correct limit 1),
    (
      select jsonb_agg(jsonb_build_object('id', o.id, 'body', o.body, 'correct', o.is_correct)
                       order by o.position)
      from public.quiz_options o where o.question_id = qq.id
    )
  from public.quiz_questions qq
  left join public.quiz_responses r on r.question_id = qq.id and r.attempt_id = p_attempt
  where qq.quiz_id = v_quiz
  order by qq.position;
end $$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke all on function public.start_quiz_attempt(uuid)              from public, anon, authenticated;
revoke all on function public.get_quiz_paper(uuid)                  from public, anon, authenticated;
revoke all on function public.save_quiz_response(uuid, uuid, uuid)  from public, anon, authenticated;
revoke all on function public.submit_quiz_attempt(uuid)             from public, anon, authenticated;
revoke all on function public.get_quiz_review(uuid)                 from public, anon, authenticated;

grant execute on function public.start_quiz_attempt(uuid)             to authenticated;
grant execute on function public.get_quiz_paper(uuid)                 to authenticated;
grant execute on function public.save_quiz_response(uuid, uuid, uuid) to authenticated;
grant execute on function public.submit_quiz_attempt(uuid)            to authenticated;
grant execute on function public.get_quiz_review(uuid)                to authenticated;


-- =============================================================================
-- 0022 · Doubt answers inherited nothing from the doubt
--
-- The policy was:
--
--   create policy "answers: readable with the doubt" on public.doubt_answers
--     for select using (exists (select 1 from public.doubts d where d.id = doubt_id));
--
-- It checks that the parent doubt EXISTS. It never checks that the reader may
-- see it. Since every answer has a parent by definition, the condition is
-- always true — so any signed-in user could read every answer to every doubt,
-- including doubts in courses they were never enrolled in.
--
-- The doubt itself is properly protected ("readable to course members"), which
-- makes this worse rather than better: the question is hidden and the answer to
-- it is not, so paid course discussion leaks one side of the conversation.
--
-- A related family to the WITH CHECK bug in 0015/0018: a child policy that
-- *references* its parent without *inheriting* its condition.
-- =============================================================================

drop policy if exists "answers: readable with the doubt" on public.doubt_answers;
create policy "answers: readable with the doubt" on public.doubt_answers
  for select
  using (
    exists (
      select 1 from public.doubts d
       where d.id = doubt_id
         and (
           public.is_enrolled(d.course_id)
           or d.user_id = auth.uid()
           or public.is_staff()
           or exists (
             select 1 from public.courses c
              where c.id = d.course_id and c.created_by = auth.uid()
           )
         )
    )
  );

-- Same shape, same omission: votes were readable to anyone. Lower stakes, but
-- the vote count reveals which paid-course answers exist.
drop policy if exists "votes: own only" on public.doubt_votes;
create policy "votes: own only" on public.doubt_votes
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Post an answer, keeping the doubt's own bookkeeping in step.
--
-- `answered_at` on the doubt is what the UI uses to show a thread as handled.
-- Left to a separate client write it would drift the first time a request
-- failed halfway.
-- -----------------------------------------------------------------------------
create or replace function public.answer_doubt(
  p_doubt uuid,
  p_body  text
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_answer uuid;
  v_course uuid;
  v_asker uuid;
  v_educator boolean := public.has_role('educator') or public.has_role('admin');
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if p_body is null or length(trim(p_body)) < 2 then
    raise exception 'EMPTY_ANSWER' using errcode = '23514';
  end if;

  select course_id, user_id into v_course, v_asker from public.doubts where id = p_doubt;

  if v_asker is null then
    raise exception 'DOUBT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not (public.is_enrolled(v_course) or public.is_staff() or v_educator or v_asker = auth.uid()) then
    raise exception 'NOT_ENROLLED' using errcode = '42501';
  end if;

  -- The verified badge is granted by role, never claimed by the poster —
  -- see 0018, where students could set it on their own answers.
  insert into public.doubt_answers (doubt_id, user_id, body, is_educator_verified)
  values (p_doubt, auth.uid(), trim(p_body), v_educator)
  returning id into v_answer;

  if v_educator then
    update public.doubts
       set answered_at = coalesce(answered_at, now()),
           status = 'answered'
     where id = p_doubt;

    -- Don't notify someone about their own answer.
    if v_asker <> auth.uid() then
      perform public.enqueue_notification(
        v_asker, 'doubt.answered', 'Your doubt was answered',
        left(trim(p_body), 140),
        jsonb_build_object('url', '/app/doubts', 'doubt_id', p_doubt),
        'doubt', array['push','email'], now());
    end if;
  end if;

  return v_answer;
end $$;

revoke all on function public.answer_doubt(uuid, text) from public, anon, authenticated;
grant execute on function public.answer_doubt(uuid, text) to authenticated;


-- =============================================================================
-- 0023 · Checkout
--
-- The money path. Three rules it exists to enforce, none of which a client can
-- be trusted with:
--
--   1. THE PRICE COMES FROM THE DATABASE. The browser sends item ids, never
--      amounts. A checkout that accepts a client-supplied total is a checkout
--      where a ₹5,000 course costs ₹1.
--   2. ENROLMENT FOLLOWS THE WEBHOOK, NOT THE BROWSER. Razorpay's client
--      handler firing "success" proves nothing — it is JavaScript on a machine
--      the buyer controls. Access is granted only by the signature-verified
--      server-to-server webhook.
--   3. THE PAID AMOUNT IS RE-CHECKED AGAINST THE ORDER. Even a genuine webhook
--      is matched against what we asked for, so a tampered or partial capture
--      cannot unlock a course.
--
-- Idempotency lives in webhook_events (provider, event_id), so a replayed
-- delivery — which Razorpay does on any non-2xx — cannot double-enrol or
-- double-count a coupon.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SECURITY FIX · coupon codes were readable by every signed-in user
--
-- Was: for select using (is_active or public.is_staff())
--
-- So `select code from coupons` returned every live discount code to any
-- student who asked. Codes are a marketing instrument — a launch discount, a
-- scholarship code given to one college — and publishing the list defeats them
-- entirely. There is no way to "use RLS carefully" here: if the row is
-- readable, the code is readable.
--
-- Coupons are now staff-only to read, and validated by code through the
-- function below, which returns the discount without ever returning the row.
-- -----------------------------------------------------------------------------
drop policy if exists "coupons: active are readable" on public.coupons;
drop policy if exists "coupons: staff read" on public.coupons;
create policy "coupons: staff read" on public.coupons
  for select using (public.is_staff());

-- -----------------------------------------------------------------------------
-- Validate a coupon against an amount. Returns the discount, not the coupon.
-- -----------------------------------------------------------------------------
create or replace function public.validate_coupon(p_code citext, p_amount_inr integer)
returns table (valid boolean, discount_inr integer, reason text)
language plpgsql security definer set search_path = public
as $$
declare c record; v_used integer; v_discount integer;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into c from public.coupons where code = p_code;

  -- Deliberately the same message for "no such code" and "expired": a distinct
  -- error for each turns this into an oracle for enumerating valid codes.
  if not found or not c.is_active
     or now() < c.valid_from
     or (c.valid_to is not null and now() > c.valid_to) then
    return query select false, 0, 'That code is not valid.'::text;
    return;
  end if;

  if c.max_uses is not null and c.used_count >= c.max_uses then
    return query select false, 0, 'That code has been fully used.'::text;
    return;
  end if;

  select count(*)::int into v_used
    from public.orders o
   where o.user_id = auth.uid() and o.coupon_id = c.id and o.status = 'paid';

  if v_used >= c.per_user_limit then
    return query select false, 0, 'You have already used that code.'::text;
    return;
  end if;

  if p_amount_inr < c.min_amount_inr then
    return query select false, 0,
      ('That code needs a minimum order of ₹' || c.min_amount_inr)::text;
    return;
  end if;

  v_discount := case
    when c.kind = 'percent' then least(
      (p_amount_inr * c.value) / 100,
      coalesce(c.max_discount_inr, p_amount_inr)
    )
    else c.value
  end;

  -- Never discount below zero; a negative total would be a refund.
  v_discount := least(v_discount, p_amount_inr);

  return query select true, v_discount, null::text;
end $$;

-- -----------------------------------------------------------------------------
-- Create an order. Prices are read from the catalogue, never from the caller.
-- -----------------------------------------------------------------------------
create or replace function public.create_order(p_course_ids uuid[], p_coupon citext default null)
returns table (order_id uuid, total_inr integer, subtotal_inr integer, discount_inr integer)
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_order uuid;
  v_subtotal integer := 0;
  v_discount integer := 0;
  v_coupon uuid;
  v_valid boolean;
  v_reason text;
  c record;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if p_course_ids is null or cardinality(p_course_ids) = 0 then
    raise exception 'EMPTY_CART' using errcode = '23514';
  end if;

  insert into public.orders (user_id, subtotal_inr, total_inr, status)
  values (v_user, 0, 0, 'created')
  returning id into v_order;

  for c in
    select id, title, price_inr
      from public.courses
     where id = any(p_course_ids)
       and status = 'published'
       and deleted_at is null
  loop
    -- Already own it? Charging twice for the same course is the complaint that
    -- costs a refund and a review, and refunds are not offered here.
    if exists (
      select 1 from public.enrollments
       where user_id = v_user and course_id = c.id and status = 'active'
    ) then
      raise exception 'ALREADY_ENROLLED' using errcode = 'P0001';
    end if;

    insert into public.order_items (order_id, item_type, item_id, title_snapshot, unit_price_inr)
    values (v_order, 'course', c.id, c.title, c.price_inr);

    v_subtotal := v_subtotal + c.price_inr;
  end loop;

  if v_subtotal = 0 and not exists (select 1 from public.order_items where order_id = v_order) then
    raise exception 'NO_PURCHASABLE_ITEMS' using errcode = 'P0002';
  end if;

  if p_coupon is not null and length(trim(p_coupon::text)) > 0 then
    select v.valid, v.discount_inr, v.reason into v_valid, v_discount, v_reason
      from public.validate_coupon(p_coupon, v_subtotal) v;

    if not v_valid then
      raise exception 'COUPON_REJECTED: %', v_reason using errcode = 'P0001';
    end if;

    select id into v_coupon from public.coupons where code = p_coupon;
  end if;

  update public.orders
     set subtotal_inr = v_subtotal,
         discount_inr = coalesce(v_discount, 0),
         total_inr = greatest(0, v_subtotal - coalesce(v_discount, 0)),
         coupon_id = v_coupon
   where id = v_order;

  return query
    select o.id, o.total_inr, o.subtotal_inr, o.discount_inr
      from public.orders o where o.id = v_order;
end $$;

-- -----------------------------------------------------------------------------
-- Attach the gateway's order id. Called by the server after creating the
-- Razorpay order, so the webhook can find our row from theirs.
-- -----------------------------------------------------------------------------
create or replace function public.attach_gateway_order(p_order uuid, p_gateway_order_id text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.orders
     set gateway_order_id = p_gateway_order_id,
         status = 'pending',
         updated_at = now()
   where id = p_order
     and (user_id = auth.uid() or auth.uid() is null);  -- null = service role

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Fulfilment. Service-role only — reached from the verified webhook.
--
-- Everything here is idempotent, because Razorpay retries any non-2xx and will
-- happily deliver the same event twice.
-- -----------------------------------------------------------------------------
create or replace function public.fulfil_order(
  p_gateway_order_id   text,
  p_gateway_payment_id text,
  p_amount_inr         integer,
  p_method             text,
  p_raw                jsonb
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_order record;
  v_item record;
  v_days integer;
begin
  select * into v_order from public.orders where gateway_order_id = p_gateway_order_id;

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Rule 3: a genuine webhook for the wrong amount is still the wrong amount.
  -- Underpayment must never unlock the course.
  if p_amount_inr < v_order.total_inr then
    update public.orders set status = 'failed', updated_at = now() where id = v_order.id;
    raise exception 'AMOUNT_MISMATCH: expected % got %', v_order.total_inr, p_amount_inr
      using errcode = 'P0001';
  end if;

  insert into public.payments (order_id, gateway_payment_id, amount_inr, method, status, captured_at, raw)
  values (v_order.id, p_gateway_payment_id, p_amount_inr, p_method, 'captured', now(), p_raw)
  on conflict (gateway_payment_id) do nothing;

  -- Already fulfilled by an earlier delivery of this event: stop here rather
  -- than re-granting access and re-incrementing the coupon.
  if v_order.status = 'paid' then
    return v_order.id;
  end if;

  update public.orders set status = 'paid', updated_at = now() where id = v_order.id;

  for v_item in
    select item_id, title_snapshot from public.order_items
     where order_id = v_order.id and item_type = 'course'
  loop
    select access_days into v_days from public.courses where id = v_item.item_id;

    insert into public.enrollments (user_id, course_id, order_id, status, expires_at)
    values (
      v_order.user_id, v_item.item_id, v_order.id, 'active',
      case when v_days is null then null else now() + make_interval(days => v_days) end
    )
    on conflict (user_id, course_id) do update
      set status = 'active',
          order_id = excluded.order_id,
          expires_at = excluded.expires_at;

    update public.courses
       set student_count = student_count + 1
     where id = v_item.item_id;

    perform public.enqueue_notification(
      v_order.user_id, 'course.published', 'You are enrolled: ' || v_item.title_snapshot,
      'Your payment went through and the course is ready in My Courses.',
      jsonb_build_object('url', '/app/learning'),
      'course', array['push','email'], now());
  end loop;

  if v_order.coupon_id is not null then
    update public.coupons set used_count = used_count + 1 where id = v_order.coupon_id;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after)
  values (v_order.user_id, 'ORDER_PAID', 'orders', v_order.id,
          jsonb_build_object('amount', p_amount_inr, 'payment', p_gateway_payment_id));

  return v_order.id;
end $$;

create or replace function public.fail_order(p_gateway_order_id text, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.orders
     set status = case when status = 'paid' then status else 'failed' end,
         updated_at = now()
   where gateway_order_id = p_gateway_order_id;
end $$;

-- -----------------------------------------------------------------------------
-- Grants.
--
-- fulfil_order and fail_order are NOT granted to authenticated. They are
-- reached only with the service role from the signature-verified webhook —
-- granting them would let any signed-in user enrol themselves for free.
-- -----------------------------------------------------------------------------
revoke all on function public.validate_coupon(citext, integer)              from public, anon, authenticated;
revoke all on function public.create_order(uuid[], citext)                  from public, anon, authenticated;
revoke all on function public.attach_gateway_order(uuid, text)              from public, anon, authenticated;
revoke all on function public.fulfil_order(text, text, integer, text, jsonb) from public, anon, authenticated;
revoke all on function public.fail_order(text, text)                        from public, anon, authenticated;

grant execute on function public.validate_coupon(citext, integer) to authenticated;
grant execute on function public.create_order(uuid[], citext)     to authenticated;


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


-- =============================================================================
-- 0027 · Educator studio: doubts desk, quiz builder, broadcasts
--
-- These three screens shipped as static mock-ups. This migration gives them
-- something to talk to.
--
-- One shape throughout: **educators write through functions, never through the
-- table.** quiz_questions and quiz_options have a SELECT policy and no write
-- policy at all, so RLS denies every insert by default — that is deliberate and
-- stays that way. Authoring goes through SECURITY DEFINER functions that check
-- ownership first, which means there is exactly one code path to audit rather
-- than a policy per verb.
--
-- Educators are NOT staff. is_staff() is admin/developer/support, so an educator
-- cannot read public.enrollments and cannot count their own students without a
-- function to do it for them. That is the reason get_educator_courses() exists.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Courses this user may author for, with their live student count.
--
-- Feeds the audience picker on broadcasts and the course picker on the quiz
-- builder. Both need a number the educator cannot otherwise obtain.
-- -----------------------------------------------------------------------------
create or replace function public.get_educator_courses()
returns table (
  course_id    uuid,
  title        text,
  slug         text,
  status       text,
  student_count integer
)
language sql stable security definer set search_path = public
as $$
  select c.id,
         c.title,
         c.slug,
         c.status::text,
         (select count(*)::int
            from public.enrollments e
           where e.course_id = c.id and e.status = 'active')
    from public.courses c
   where c.created_by = auth.uid() or public.is_staff()
   order by c.title;
$$;

-- -----------------------------------------------------------------------------
-- Doubts desk: close the loop on a question.
--
-- answer_doubt() already flips 'open' → 'answered'. This is the educator saying
-- "and it is finished", which is a different judgement and belongs to them.
-- -----------------------------------------------------------------------------
create or replace function public.set_doubt_status(p_doubt uuid, p_status text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_course uuid;
begin
  if p_status not in ('open', 'answered', 'resolved', 'closed') then
    raise exception 'BAD_STATUS' using errcode = '23514';
  end if;

  select course_id into v_course from public.doubts where id = p_doubt;
  if not found then
    raise exception 'DOUBT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not (public.is_staff() or exists (
    select 1 from public.courses c where c.id = v_course and c.created_by = auth.uid()
  )) then
    raise exception 'NOT_PERMITTED' using errcode = '42501';
  end if;

  update public.doubts set status = p_status::doubt_status where id = p_doubt;
end $$;

-- -----------------------------------------------------------------------------
-- Quiz builder · the quiz itself
--
-- One upsert rather than separate create/update: the builder saves continuously
-- and the caller should not have to track whether this is the first save.
-- -----------------------------------------------------------------------------
create or replace function public.upsert_quiz(
  p_quiz          uuid,
  p_course        uuid,
  p_title         text,
  p_description   text default null,
  p_duration_min  integer default 30,
  p_negative_mark numeric default 0,
  p_shuffle       boolean default true,
  p_max_attempts  integer default 1,
  p_opens_at      timestamptz default null,
  p_closes_at     timestamptz default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not (public.has_role('educator') or public.has_role('admin')) then
    raise exception 'NOT_PERMITTED' using errcode = '42501';
  end if;

  if p_title is null or length(trim(p_title)) < 3 then
    raise exception 'TITLE_TOO_SHORT' using errcode = '23514';
  end if;

  if p_duration_min is null or p_duration_min < 1 then
    raise exception 'BAD_DURATION' using errcode = '23514';
  end if;

  -- A quiz is delivered to everyone enrolled on the course, so authoring one
  -- against a course you do not own is authoring in someone else's name.
  if not (public.is_staff() or exists (
    select 1 from public.courses c where c.id = p_course and c.created_by = auth.uid()
  )) then
    raise exception 'NOT_YOUR_COURSE' using errcode = '42501';
  end if;

  if p_quiz is null then
    insert into public.quizzes
      (course_id, title, description, duration_min, negative_mark,
       shuffle, max_attempts, opens_at, closes_at, status, created_by)
    values
      (p_course, trim(p_title), nullif(trim(coalesce(p_description, '')), ''),
       p_duration_min, coalesce(p_negative_mark, 0), coalesce(p_shuffle, true),
       coalesce(p_max_attempts, 1)::smallint, p_opens_at, p_closes_at, 'draft', auth.uid())
    returning id into v_id;
    return v_id;
  end if;

  update public.quizzes
     set course_id     = p_course,
         title         = trim(p_title),
         description   = nullif(trim(coalesce(p_description, '')), ''),
         duration_min  = p_duration_min,
         negative_mark = coalesce(p_negative_mark, 0),
         shuffle       = coalesce(p_shuffle, true),
         max_attempts  = coalesce(p_max_attempts, 1)::smallint,
         opens_at      = p_opens_at,
         closes_at     = p_closes_at
   where id = p_quiz
     and (created_by = auth.uid() or public.is_staff())
  returning id into v_id;

  if v_id is null then
    raise exception 'NOT_YOUR_QUIZ' using errcode = '42501';
  end if;

  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- Quiz builder · one question and its options, atomically
--
-- Options arrive as a jsonb array: [{"body": "...", "is_correct": true}, …].
-- They are replaced wholesale rather than diffed, because a half-applied edit
-- on an exam question is worse than a redundant write — a question briefly
-- holding two correct answers, or none, would score wrongly if a student
-- submitted in that window.
-- -----------------------------------------------------------------------------
create or replace function public.upsert_question(
  p_quiz        uuid,
  p_question    uuid,
  p_body        text,
  p_options     jsonb,
  p_explanation text default null,
  p_marks       numeric default 1,
  p_negative    numeric default 0,
  p_position    integer default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id       uuid;
  v_owner    uuid;
  v_correct  int;
  v_total    int;
  v_position integer;
  v_option   jsonb;
  v_index    int := 0;
begin
  select created_by into v_owner from public.quizzes where id = p_quiz;
  if not found then
    raise exception 'QUIZ_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_owner is distinct from auth.uid() and not public.is_staff() then
    raise exception 'NOT_YOUR_QUIZ' using errcode = '42501';
  end if;

  if p_body is null or length(trim(p_body)) < 3 then
    raise exception 'EMPTY_QUESTION' using errcode = '23514';
  end if;

  v_total   := coalesce(jsonb_array_length(p_options), 0);
  select count(*) into v_correct
    from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) o
   where (o->>'is_correct')::boolean is true;

  if v_total < 2 then
    raise exception 'NEED_TWO_OPTIONS' using errcode = '23514';
  end if;

  -- Exactly one. Zero makes the question unscoreable; two makes it unfair in a
  -- way nobody notices until results are published.
  if v_correct <> 1 then
    raise exception 'NEED_ONE_CORRECT' using errcode = '23514';
  end if;

  if p_position is null then
    select coalesce(max(position), 0) + 1 into v_position
      from public.quiz_questions where quiz_id = p_quiz;
  else
    v_position := p_position;
  end if;

  if p_question is null then
    insert into public.quiz_questions (quiz_id, body, explanation, marks, negative, position)
    values (p_quiz, trim(p_body), nullif(trim(coalesce(p_explanation, '')), ''),
            coalesce(p_marks, 1), coalesce(p_negative, 0), v_position)
    returning id into v_id;
  else
    update public.quiz_questions
       set body        = trim(p_body),
           explanation = nullif(trim(coalesce(p_explanation, '')), ''),
           marks       = coalesce(p_marks, 1),
           negative    = coalesce(p_negative, 0),
           position    = v_position
     where id = p_question and quiz_id = p_quiz
    returning id into v_id;

    if v_id is null then
      raise exception 'QUESTION_NOT_FOUND' using errcode = 'P0002';
    end if;

    delete from public.quiz_options where question_id = v_id;
  end if;

  for v_option in select * from jsonb_array_elements(p_options)
  loop
    v_index := v_index + 1;
    insert into public.quiz_options (question_id, body, is_correct, position)
    values (v_id, trim(v_option->>'body'),
            coalesce((v_option->>'is_correct')::boolean, false), v_index);
  end loop;

  -- Keep the headline mark total honest without asking the educator to add up.
  update public.quizzes
     set total_marks = (select coalesce(sum(marks), 0) from public.quiz_questions where quiz_id = p_quiz)
   where id = p_quiz;

  return v_id;
end $$;

create or replace function public.delete_question(p_question uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_quiz uuid; v_owner uuid;
begin
  select q.quiz_id, z.created_by into v_quiz, v_owner
    from public.quiz_questions q join public.quizzes z on z.id = q.quiz_id
   where q.id = p_question;

  if not found then
    raise exception 'QUESTION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_owner is distinct from auth.uid() and not public.is_staff() then
    raise exception 'NOT_YOUR_QUIZ' using errcode = '42501';
  end if;

  delete from public.quiz_questions where id = p_question;

  update public.quizzes
     set total_marks = (select coalesce(sum(marks), 0) from public.quiz_questions where quiz_id = v_quiz)
   where id = v_quiz;
end $$;

-- -----------------------------------------------------------------------------
-- Quiz builder · the paper as the author sees it, is_correct included
--
-- Students cannot select quiz_options at all — the policy is authors and staff
-- only. This is the author's side of that same wall.
-- -----------------------------------------------------------------------------
create or replace function public.get_quiz_editor(p_quiz uuid)
returns table (
  question_id uuid,
  body        text,
  explanation text,
  marks       numeric,
  negative    numeric,
  q_position  integer,
  options     jsonb
)
language plpgsql security definer set search_path = public
as $$
declare v_owner uuid;
begin
  select created_by into v_owner from public.quizzes where id = p_quiz;
  if not found then
    raise exception 'QUIZ_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_owner is distinct from auth.uid() and not public.is_staff() then
    raise exception 'NOT_YOUR_QUIZ' using errcode = '42501';
  end if;

  return query
  select q.id, q.body, q.explanation, q.marks, q.negative, q.position,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id', o.id, 'body', o.body, 'is_correct', o.is_correct)
                  order by o.position)
             from public.quiz_options o where o.question_id = q.id
         ), '[]'::jsonb)
    from public.quiz_questions q
   where q.quiz_id = p_quiz
   order by q.position;
end $$;

-- -----------------------------------------------------------------------------
-- Quiz builder · publish, and refuse to publish something broken
--
-- Publishing is the irreversible-feeling step: the moment status flips, every
-- enrolled student can start an attempt. A quiz with a question that has no
-- correct answer would mark them down for something unanswerable, and by the
-- time anyone noticed the attempts would already exist.
-- -----------------------------------------------------------------------------
create or replace function public.set_quiz_status(p_quiz uuid, p_status text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_owner  uuid;
  v_course uuid;
  v_title  text;
  v_bad    int;
  v_count  int;
begin
  if p_status not in ('draft', 'published', 'archived') then
    raise exception 'BAD_STATUS' using errcode = '23514';
  end if;

  select created_by, course_id, title into v_owner, v_course, v_title
    from public.quizzes where id = p_quiz;
  if not found then
    raise exception 'QUIZ_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_owner is distinct from auth.uid() and not public.is_staff() then
    raise exception 'NOT_YOUR_QUIZ' using errcode = '42501';
  end if;

  if p_status = 'published' then
    select count(*) into v_count from public.quiz_questions where quiz_id = p_quiz;
    if v_count = 0 then
      raise exception 'NO_QUESTIONS' using errcode = '23514';
    end if;

    select count(*) into v_bad
      from public.quiz_questions q
     where q.quiz_id = p_quiz
       and (
         (select count(*) from public.quiz_options o where o.question_id = q.id) < 2
         or (select count(*) from public.quiz_options o
              where o.question_id = q.id and o.is_correct) <> 1
       );

    if v_bad > 0 then
      raise exception 'INVALID_QUESTIONS:%', v_bad using errcode = '23514';
    end if;
  end if;

  update public.quizzes set status = p_status where id = p_quiz;

  -- Tell students once, on the transition into published — not on every save
  -- of an already-published quiz.
  if p_status = 'published' and v_course is not null then
    perform public.enqueue_for_course(
      v_course, 'quiz.published', 'New test: ' || v_title,
      'A new test is now open. ' || v_count || ' questions.',
      jsonb_build_object('url', '/app/tests', 'quiz_id', p_quiz),
      'quiz');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Broadcasts · a record of what was sent
--
-- enqueue_for_course() fans out to the queue and returns a count, then forgets.
-- An educator who cannot see what they already sent will send it twice.
-- -----------------------------------------------------------------------------
create table if not exists public.broadcasts (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid references public.courses(id) on delete set null,
  sender_id   uuid not null references public.profiles(id),
  title       text not null,
  body        text,
  recipients  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists idx_broadcasts_sender on public.broadcasts (sender_id, created_at desc);

alter table public.broadcasts enable row level security;

drop policy if exists "broadcasts: sender or staff" on public.broadcasts;
create policy "broadcasts: sender or staff" on public.broadcasts
  for select using (sender_id = auth.uid() or public.is_staff());

-- No write policy: send_broadcast() is the only writer, and it is the only
-- thing that also enqueues the notifications. A row written any other way would
-- be a record of something that never sent.

create or replace function public.send_broadcast(
  p_course uuid,
  p_title  text,
  p_body   text
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_count int;
begin
  if p_title is null or length(trim(p_title)) < 3 then
    raise exception 'TITLE_TOO_SHORT' using errcode = '23514';
  end if;

  -- enqueue_for_course() re-checks ownership itself and raises NOT_PERMITTED,
  -- so this call is the authorisation as well as the delivery.
  v_count := public.enqueue_for_course(
    p_course, 'announcement', trim(p_title), nullif(trim(coalesce(p_body, '')), ''),
    jsonb_build_object('url', '/app/notifications'), 'announcement');

  insert into public.broadcasts (course_id, sender_id, title, body, recipients)
  values (p_course, auth.uid(), trim(p_title), nullif(trim(coalesce(p_body, '')), ''), v_count);

  return v_count;
end $$;

create or replace function public.get_broadcasts(p_limit integer default 20)
returns table (
  id         uuid,
  title      text,
  body       text,
  recipients integer,
  created_at timestamptz,
  course_title text
)
language sql stable security definer set search_path = public
as $$
  select b.id, b.title, b.body, b.recipients, b.created_at, c.title
    from public.broadcasts b
    left join public.courses c on c.id = b.course_id
   where b.sender_id = auth.uid() or public.is_staff()
   order by b.created_at desc
   limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke all on function public.get_educator_courses()                                            from public, anon, authenticated;
revoke all on function public.set_doubt_status(uuid, text)                                      from public, anon, authenticated;
revoke all on function public.upsert_quiz(uuid, uuid, text, text, integer, numeric, boolean, integer, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.upsert_question(uuid, uuid, text, jsonb, text, numeric, numeric, integer) from public, anon, authenticated;
revoke all on function public.delete_question(uuid)                                             from public, anon, authenticated;
revoke all on function public.get_quiz_editor(uuid)                                             from public, anon, authenticated;
revoke all on function public.set_quiz_status(uuid, text)                                       from public, anon, authenticated;
revoke all on function public.send_broadcast(uuid, text, text)                                  from public, anon, authenticated;
revoke all on function public.get_broadcasts(integer)                                           from public, anon, authenticated;

grant execute on function public.get_educator_courses()                                            to authenticated;
grant execute on function public.set_doubt_status(uuid, text)                                      to authenticated;
grant execute on function public.upsert_quiz(uuid, uuid, text, text, integer, numeric, boolean, integer, timestamptz, timestamptz) to authenticated;
grant execute on function public.upsert_question(uuid, uuid, text, jsonb, text, numeric, numeric, integer) to authenticated;
grant execute on function public.delete_question(uuid)                                             to authenticated;
grant execute on function public.get_quiz_editor(uuid)                                             to authenticated;
grant execute on function public.set_quiz_status(uuid, text)                                       to authenticated;
grant execute on function public.send_broadcast(uuid, text, text)                                  to authenticated;
grant execute on function public.get_broadcasts(integer)                                           to authenticated;

grant select on public.broadcasts to authenticated;


-- =============================================================================
-- 0028 · Notes: written in the app, or linked out of it
--
-- Until now a resource was a Google Drive file id and nothing else. That covers
-- a PDF an educator already has, and covers nothing else — not a set of notes
-- they want to type, not a paste out of a PDF they want students to actually be
-- able to read on a phone, not a slide deck living in Google Slides.
--
-- Three formats now:
--
--   drive  an existing PDF, shown in the watermarked viewer (unchanged)
--   text   a body written or pasted in the studio, rendered as a reading view
--   link   an external URL — Slides, Sheets, a public dataset — opened through
--          a server route so the click is logged and the URL stays off the page
--
-- WHAT IS STORED IS MARKDOWN, NOT HTML. Nothing in this database is ever
-- rendered as markup it supplied. The renderer escapes every character first
-- and then emits a fixed set of tags, so a <script> pasted into a note is text
-- by the time it reaches a student. Storing HTML would make an educator account
-- one paste away from stored XSS against every student who opens the note.
--
-- On "DRM": there is none, here or anywhere on the web. A browser cannot stop a
-- screenshot, a phone camera, or devtools. What this does is watermark every
-- view with the reader's name and email, and log every open — so a leaked copy
-- identifies the account it came from. Deter and trace. Anything stronger is a
-- claim no web platform can honour.
-- =============================================================================

alter table public.resources
  add column if not exists format       text not null default 'drive',
  add column if not exists body_md      text,
  add column if not exists external_url text,
  add column if not exists summary      text,
  add column if not exists updated_at   timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'resources_format_check'
  ) then
    alter table public.resources
      add constraint resources_format_check check (format in ('drive', 'text', 'link', 'storage'));
  end if;
end $$;

-- The original constraint demanded exactly one of (storage_path, drive_file_id),
-- which now refuses every text and link resource. Replaced with a rule that
-- matches the format column, so the table still cannot hold a resource with
-- nothing to show — the failure mode it was written to prevent.
alter table public.resources drop constraint if exists one_source;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'resources_has_content') then
    alter table public.resources
      add constraint resources_has_content check (
        (format = 'drive'   and drive_file_id is not null)
        or (format = 'storage' and storage_path is not null)
        or (format = 'text'  and body_md is not null and length(trim(body_md)) > 0)
        or (format = 'link'  and external_url is not null and external_url ~* '^https?://')
      );
  end if;
end $$;

create index if not exists idx_resources_course on public.resources (course_id, published_at desc);

-- -----------------------------------------------------------------------------
-- Reading log
--
-- The watermark identifies a leaked copy. This identifies the session it was
-- taken from — who opened what, when, from which device. Together they are the
-- whole of what a web platform can honestly offer.
-- -----------------------------------------------------------------------------
create table if not exists public.resource_views (
  id          bigserial primary key,
  resource_id uuid not null references public.resources(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  device_id   text,
  ip          inet,
  created_at  timestamptz not null default now()
);

create index if not exists idx_resource_views_resource on public.resource_views (resource_id, created_at desc);
create index if not exists idx_resource_views_user on public.resource_views (user_id, created_at desc);

alter table public.resource_views enable row level security;

-- Read-only, and only your own. Rows are written by log_resource_view() alone;
-- a row inserted any other way would be a reading that never happened, which
-- makes the log worse than useless in the one situation it exists for.
drop policy if exists "resource views: own or staff" on public.resource_views;
create policy "resource views: own or staff" on public.resource_views
  for select using (user_id = auth.uid() or public.is_staff());

-- -----------------------------------------------------------------------------
-- Authoring
-- -----------------------------------------------------------------------------
create or replace function public.upsert_resource(
  p_resource     uuid,
  p_course       uuid,
  p_title        text,
  p_kind         text,
  p_format       text,
  p_body_md      text default null,
  p_external_url text default null,
  p_drive_file_id text default null,
  p_summary      text default null,
  p_is_free      boolean default false
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not (public.has_role('educator') or public.has_role('admin')) then
    raise exception 'NOT_PERMITTED' using errcode = '42501';
  end if;

  if p_title is null or length(trim(p_title)) < 3 then
    raise exception 'TITLE_TOO_SHORT' using errcode = '23514';
  end if;

  if p_kind not in ('note', 'dpp', 'paper', 'solution', 'syllabus') then
    raise exception 'BAD_KIND' using errcode = '23514';
  end if;

  if p_format not in ('drive', 'text', 'link') then
    raise exception 'BAD_FORMAT' using errcode = '23514';
  end if;

  -- A resource is delivered to everyone enrolled on the course, so writing one
  -- against a course you do not own is publishing in someone else's name.
  if p_course is not null and not (public.is_staff() or exists (
    select 1 from public.courses c where c.id = p_course and c.created_by = auth.uid()
  )) then
    raise exception 'NOT_YOUR_COURSE' using errcode = '42501';
  end if;

  if p_format = 'text' and coalesce(length(trim(p_body_md)), 0) = 0 then
    raise exception 'EMPTY_BODY' using errcode = '23514';
  end if;

  -- Checked here as well as in the constraint, because the constraint reports a
  -- Postgres error and this reports something an educator can act on.
  if p_format = 'link' and coalesce(p_external_url, '') !~* '^https?://' then
    raise exception 'BAD_URL' using errcode = '23514';
  end if;

  if p_format = 'drive' and coalesce(length(trim(p_drive_file_id)), 0) = 0 then
    raise exception 'NO_FILE' using errcode = '23514';
  end if;

  if p_resource is null then
    insert into public.resources
      (course_id, title, kind, format, body_md, external_url, drive_file_id, summary, is_free)
    values
      (p_course, trim(p_title), p_kind, p_format,
       case when p_format = 'text' then p_body_md end,
       case when p_format = 'link' then trim(p_external_url) end,
       case when p_format = 'drive' then trim(p_drive_file_id) end,
       nullif(trim(coalesce(p_summary, '')), ''), coalesce(p_is_free, false))
    returning id into v_id;
    return v_id;
  end if;

  update public.resources
     set course_id     = p_course,
         title         = trim(p_title),
         kind          = p_kind,
         format        = p_format,
         body_md       = case when p_format = 'text' then p_body_md end,
         external_url  = case when p_format = 'link' then trim(p_external_url) end,
         drive_file_id = case when p_format = 'drive' then trim(p_drive_file_id) end,
         summary       = nullif(trim(coalesce(p_summary, '')), ''),
         is_free       = coalesce(p_is_free, false),
         updated_at    = now()
   where id = p_resource
     and (public.is_staff() or exists (
       select 1 from public.courses c where c.id = resources.course_id and c.created_by = auth.uid()
     ))
  returning id into v_id;

  if v_id is null then
    raise exception 'NOT_YOURS' using errcode = '42501';
  end if;

  return v_id;
end $$;

/*
 * Publish or unpublish.
 *
 * published_at doubles as the visibility flag — `resources: free or enrolled`
 * is filtered on it in the reading queries — so this is the switch that makes a
 * note real. Publishing notifies the course; unpublishing does not, because a
 * student who already read it does not need telling it was withdrawn.
 */
create or replace function public.set_resource_published(p_resource uuid, p_published boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_course uuid;
  v_title  text;
  v_was    timestamptz;
begin
  select course_id, title, published_at into v_course, v_title, v_was
    from public.resources where id = p_resource;

  if not found then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not (public.is_staff() or exists (
    select 1 from public.courses c where c.id = v_course and c.created_by = auth.uid()
  )) then
    raise exception 'NOT_YOURS' using errcode = '42501';
  end if;

  update public.resources
     set published_at = case when p_published then coalesce(published_at, now()) else null end,
         updated_at = now()
   where id = p_resource;

  -- Only on the transition into published. Re-publishing something that was
  -- already live would notify everyone a second time for no reason.
  if p_published and v_was is null and v_course is not null then
    perform public.enqueue_for_course(
      v_course, 'resource.published', 'New material: ' || v_title,
      'New study material has been added to your course.',
      jsonb_build_object('url', '/app/notes/' || p_resource::text, 'resource_id', p_resource),
      'resource');
  end if;
end $$;

create or replace function public.delete_resource(p_resource uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_course uuid;
begin
  select course_id into v_course from public.resources where id = p_resource;
  if not found then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not (public.is_staff() or exists (
    select 1 from public.courses c where c.id = v_course and c.created_by = auth.uid()
  )) then
    raise exception 'NOT_YOURS' using errcode = '42501';
  end if;

  delete from public.resources where id = p_resource;
end $$;

-- -----------------------------------------------------------------------------
-- Reading
-- -----------------------------------------------------------------------------

/*
 * Records one open, and returns the external URL if there is one.
 *
 * The URL is returned by this function rather than rendered into the page for
 * the same reason the Meet link is: a URL in the HTML is a URL that can be
 * forwarded to someone who never had access. Here it also means the click
 * cannot happen without the log line.
 *
 * Enrolment is re-checked rather than assumed from RLS, because this runs as
 * SECURITY DEFINER and would otherwise hand the URL to anyone who asked.
 */
create or replace function public.log_resource_view(
  p_resource  uuid,
  p_device_id text default null,
  p_ip        inet  default null
)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_course uuid;
  v_free   boolean;
  v_url    text;
  v_published timestamptz;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select course_id, is_free, external_url, published_at
    into v_course, v_free, v_url, v_published
  from public.resources where id = p_resource;

  if not found then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_published is null and not (public.is_staff() or exists (
    select 1 from public.courses c where c.id = v_course and c.created_by = auth.uid()
  )) then
    raise exception 'NOT_PUBLISHED' using errcode = '42501';
  end if;

  if not (v_free or v_course is null or public.is_enrolled(v_course) or public.is_staff()
          or exists (select 1 from public.courses c where c.id = v_course and c.created_by = auth.uid())) then
    raise exception 'NOT_ENROLLED' using errcode = '42501';
  end if;

  insert into public.resource_views (resource_id, user_id, device_id, ip)
  values (p_resource, auth.uid(), p_device_id, p_ip);

  return v_url;
end $$;

/*
 * Who has read this, and how often. Educator and staff only.
 *
 * Deliberately not a leaderboard for students. Reading counts are a signal
 * about the material as much as the reader — a note nobody opened is usually a
 * note nobody could find.
 */
create or replace function public.get_resource_readers(p_resource uuid)
returns table (
  user_id    uuid,
  full_name  text,
  email      text,
  views      integer,
  last_read  timestamptz
)
language plpgsql security definer set search_path = public
as $$
declare v_course uuid;
begin
  select course_id into v_course from public.resources where id = p_resource;
  if not found then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not (public.is_staff() or exists (
    select 1 from public.courses c where c.id = v_course and c.created_by = auth.uid()
  )) then
    raise exception 'NOT_PERMITTED' using errcode = '42501';
  end if;

  return query
  select v.user_id, p.full_name, p.email::text, count(*)::int, max(v.created_at)
    from public.resource_views v
    join public.profiles p on p.id = v.user_id
   where v.resource_id = p_resource
   group by v.user_id, p.full_name, p.email
   order by count(*) desc, p.full_name;
end $$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke all on function public.upsert_resource(uuid, uuid, text, text, text, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.set_resource_published(uuid, boolean)  from public, anon, authenticated;
revoke all on function public.delete_resource(uuid)                  from public, anon, authenticated;
revoke all on function public.log_resource_view(uuid, text, inet)    from public, anon, authenticated;
revoke all on function public.get_resource_readers(uuid)             from public, anon, authenticated;

grant execute on function public.upsert_resource(uuid, uuid, text, text, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.set_resource_published(uuid, boolean)  to authenticated;
grant execute on function public.delete_resource(uuid)                  to authenticated;
grant execute on function public.log_resource_view(uuid, text, inet)    to authenticated;
grant execute on function public.get_resource_readers(uuid)             to authenticated;

grant select on public.resource_views to authenticated;

-- external_url is revoked for the same reason join_url is: a URL rendered into
-- the page is a URL that can be forwarded to someone who never had access.
-- log_resource_view() is the only way to obtain it, and it cannot return one
-- without writing the log line first.
revoke select (external_url) on public.resources from anon, authenticated;


-- =============================================================================
-- 0029 · Admin console: users, roles, coupons, approvals, audit
--
-- Four screens that shipped as mock-ups, and one thing they have in common:
-- every write here changes what somebody else can do. Granting a role, running
-- a coupon, publishing a course — none of these are undone by an "undo" button,
-- and all of them belong in the audit log.
--
-- So every function below writes an audit_logs row in the same transaction as
-- the change. Not afterwards, not from the application: in the transaction. A
-- log written by a separate call is a log that is missing precisely when
-- something went wrong mid-operation.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Users
--
-- Admin-only. Returns roles as an array rather than one row per role, because
-- the screen shows one row per person and reassembling it client-side is an
-- invitation to get the count wrong.
-- -----------------------------------------------------------------------------
create or replace function public.admin_list_users(
  p_query text default null,
  p_limit integer default 100
)
returns table (
  user_id      uuid,
  full_name    text,
  email        text,
  roles        text[],
  enrollments  integer,
  created_at   timestamptz,
  last_seen_at timestamptz
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.has_role('admin') then
    raise exception 'NOT_PERMITTED' using errcode = '42501';
  end if;

  return query
  select p.id,
         p.full_name,
         p.email::text,
         coalesce(array_agg(r.key::text order by r.key) filter (where r.key is not null), '{}'),
         (select count(*)::int from public.enrollments e
           where e.user_id = p.id and e.status = 'active'),
         p.created_at,
         (select max(s.last_seen_at) from public.user_sessions s where s.user_id = p.id)
    from public.profiles p
    left join public.user_roles ur on ur.user_id = p.id
    left join public.roles r on r.id = ur.role_id
   where p_query is null
      or p.email::text ilike '%' || p_query || '%'
      or p.full_name ilike '%' || p_query || '%'
   group by p.id, p.full_name, p.email, p.created_at
   order by p.created_at desc
   limit greatest(1, least(coalesce(p_limit, 100), 500));
end $$;

/*
 * Replaces a user's role set.
 *
 * Two guards that matter more than they look:
 *
 *   1. You cannot remove your own admin role. There is no other way back in —
 *      role grants require admin — so a mis-click would lock the platform's
 *      owner out of their own console permanently.
 *   2. The last admin cannot be demoted by anyone. Same failure, one step
 *      removed: an admin demoting the only other admin, then losing their own
 *      account, leaves nobody who can grant the role back.
 *
 * 'student' is always kept. Every account is a student first; stripping it
 * would leave someone with an educator role and no enrolments they can read.
 */
create or replace function public.set_user_roles(p_user uuid, p_roles text[])
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_before text[];
  v_after  text[];
  v_role   text;
  v_admins int;
begin
  if not public.has_role('admin') then
    raise exception 'NOT_PERMITTED' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_after := array(select distinct unnest(coalesce(p_roles, '{}') || array['student']));

  foreach v_role in array v_after loop
    if v_role not in ('student', 'educator', 'admin', 'support', 'developer') then
      raise exception 'BAD_ROLE:%', v_role using errcode = '23514';
    end if;
  end loop;

  select coalesce(array_agg(r.key::text order by r.key), '{}') into v_before
    from public.user_roles ur join public.roles r on r.id = ur.role_id
   where ur.user_id = p_user;

  if p_user = auth.uid() and 'admin' = any(v_before) and not ('admin' = any(v_after)) then
    raise exception 'CANNOT_DEMOTE_SELF' using errcode = '42501';
  end if;

  if 'admin' = any(v_before) and not ('admin' = any(v_after)) then
    select count(distinct ur.user_id) into v_admins
      from public.user_roles ur join public.roles r on r.id = ur.role_id
     where r.key = 'admin';

    if v_admins <= 1 then
      raise exception 'LAST_ADMIN' using errcode = '42501';
    end if;
  end if;

  delete from public.user_roles where user_id = p_user;

  insert into public.user_roles (user_id, role_id, granted_by)
  select p_user, r.id, auth.uid()
    from public.roles r
   where r.key::text = any(v_after);

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), 'ROLES_CHANGED', 'profile', p_user,
          jsonb_build_object('roles', v_before), jsonb_build_object('roles', v_after));
end $$;

-- -----------------------------------------------------------------------------
-- Coupons
--
-- `coupons: staff read` already keeps the codes off the student side (0023 —
-- before that, every signed-in user could read every code). Writes are admin.
-- -----------------------------------------------------------------------------
create or replace function public.upsert_coupon(
  p_coupon       uuid,
  p_code         text,
  p_kind         text,
  p_value        integer,
  p_max_discount integer default null,
  p_min_amount   integer default 0,
  p_max_uses     integer default null,
  p_per_user     integer default 1,
  p_valid_to     timestamptz default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not public.has_role('admin') then
    raise exception 'NOT_PERMITTED' using errcode = '42501';
  end if;

  if p_code is null or length(trim(p_code)) < 3 then
    raise exception 'CODE_TOO_SHORT' using errcode = '23514';
  end if;

  if p_kind not in ('percent', 'flat') then
    raise exception 'BAD_KIND' using errcode = '23514';
  end if;

  if p_value is null or p_value <= 0 then
    raise exception 'BAD_VALUE' using errcode = '23514';
  end if;

  -- The table's own CHECK catches this too, but a percentage over 100 is worth
  -- an error that names the problem rather than a constraint violation.
  if p_kind = 'percent' and p_value > 100 then
    raise exception 'PERCENT_OVER_100' using errcode = '23514';
  end if;

  if p_coupon is null then
    insert into public.coupons
      (code, kind, value, max_discount_inr, min_amount_inr, max_uses, per_user_limit, valid_to, created_by)
    values
      (upper(trim(p_code)), p_kind, p_value, p_max_discount, coalesce(p_min_amount, 0),
       p_max_uses, greatest(1, coalesce(p_per_user, 1)), p_valid_to, auth.uid())
    returning id into v_id;
  else
    -- used_count is deliberately not settable. It is the record of what was
    -- actually redeemed, and an editable one is not a record.
    update public.coupons
       set code             = upper(trim(p_code)),
           kind             = p_kind,
           value            = p_value,
           max_discount_inr = p_max_discount,
           min_amount_inr   = coalesce(p_min_amount, 0),
           max_uses         = p_max_uses,
           per_user_limit   = greatest(1, coalesce(p_per_user, 1)),
           valid_to         = p_valid_to
     where id = p_coupon
    returning id into v_id;

    if v_id is null then
      raise exception 'COUPON_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after)
  values (auth.uid(), 'COUPON_SAVED', 'coupon', v_id,
          jsonb_build_object('code', upper(trim(p_code)), 'kind', p_kind, 'value', p_value));

  return v_id;
exception
  when unique_violation then
    raise exception 'CODE_TAKEN' using errcode = '23505';
end $$;

/*
 * Coupons are deactivated, never deleted.
 *
 * An order that used one refers to it. Deleting the row would leave a paid
 * order whose discount cannot be explained, which is exactly the record you
 * need during a refund dispute.
 */
create or replace function public.set_coupon_active(p_coupon uuid, p_active boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.has_role('admin') then
    raise exception 'NOT_PERMITTED' using errcode = '42501';
  end if;

  update public.coupons set is_active = p_active where id = p_coupon;

  if not found then
    raise exception 'COUPON_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after)
  values (auth.uid(), case when p_active then 'COUPON_ENABLED' else 'COUPON_DISABLED' end,
          'coupon', p_coupon, jsonb_build_object('is_active', p_active));
end $$;

-- -----------------------------------------------------------------------------
-- Course approvals
--
-- Educators write courses in 'draft' and submit for review; publishing is the
-- admin's call. The point of the gate is that publishing puts a course in the
-- public catalogue with a price on it.
-- -----------------------------------------------------------------------------
create or replace function public.submit_course_for_review(p_course uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_owner uuid; v_status course_status;
begin
  select created_by, status into v_owner, v_status from public.courses where id = p_course;
  if not found then
    raise exception 'COURSE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_owner is distinct from auth.uid() and not public.has_role('admin') then
    raise exception 'NOT_YOURS' using errcode = '42501';
  end if;

  if v_status = 'published' then
    raise exception 'ALREADY_PUBLISHED' using errcode = '23514';
  end if;

  update public.courses set status = 'pending_review' where id = p_course;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after)
  values (auth.uid(), 'COURSE_SUBMITTED', 'course', p_course, jsonb_build_object('status', 'pending_review'));
end $$;

create or replace function public.set_course_status(p_course uuid, p_status text, p_note text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_before course_status; v_title text;
begin
  if not public.has_role('admin') then
    raise exception 'NOT_PERMITTED' using errcode = '42501';
  end if;

  if p_status not in ('draft', 'pending_review', 'published', 'archived') then
    raise exception 'BAD_STATUS' using errcode = '23514';
  end if;

  select status, title into v_before, v_title from public.courses where id = p_course;
  if not found then
    raise exception 'COURSE_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Sending a course back needs a reason. The educator has to know what to fix,
  -- and "rejected" on its own guarantees a second submission of the same thing.
  if p_status = 'draft' and v_before = 'pending_review'
     and coalesce(length(trim(p_note)), 0) < 10 then
    raise exception 'NEED_REASON' using errcode = '23514';
  end if;

  update public.courses set status = p_status::course_status where id = p_course;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), 'COURSE_STATUS', 'course', p_course,
          jsonb_build_object('status', v_before),
          jsonb_build_object('status', p_status, 'note', p_note, 'title', v_title));
end $$;

-- -----------------------------------------------------------------------------
-- Audit log
--
-- `audit: staff read` covers the table; this exists to join the actor's name in
-- (profiles is staff-readable, but the join is worth doing once here) and to
-- cap the row count so the page cannot be asked for everything.
-- -----------------------------------------------------------------------------
create or replace function public.get_audit_logs(
  p_action text default null,
  p_limit  integer default 100
)
returns table (
  id          bigint,
  actor_name  text,
  actor_email text,
  action      text,
  entity_type text,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  ip          inet,
  created_at  timestamptz
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'NOT_PERMITTED' using errcode = '42501';
  end if;

  return query
  select a.id,
         coalesce(p.full_name, 'System'),
         coalesce(a.actor_email, p.email::text, '—'),
         a.action,
         a.entity_type,
         a.entity_id,
         a.before,
         a.after,
         a.ip,
         a.created_at
    from public.audit_logs a
    left join public.profiles p on p.id = a.actor_id
   where p_action is null or a.action = p_action
   order by a.created_at desc
   limit greatest(1, least(coalesce(p_limit, 100), 500));
end $$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke all on function public.admin_list_users(text, integer)                                     from public, anon, authenticated;
revoke all on function public.set_user_roles(uuid, text[])                                        from public, anon, authenticated;
revoke all on function public.upsert_coupon(uuid, text, text, integer, integer, integer, integer, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.set_coupon_active(uuid, boolean)                                    from public, anon, authenticated;
revoke all on function public.submit_course_for_review(uuid)                                      from public, anon, authenticated;
revoke all on function public.set_course_status(uuid, text, text)                                 from public, anon, authenticated;
revoke all on function public.get_audit_logs(text, integer)                                       from public, anon, authenticated;

grant execute on function public.admin_list_users(text, integer)                                     to authenticated;
grant execute on function public.set_user_roles(uuid, text[])                                        to authenticated;
grant execute on function public.upsert_coupon(uuid, text, text, integer, integer, integer, integer, integer, timestamptz) to authenticated;
grant execute on function public.set_coupon_active(uuid, boolean)                                    to authenticated;
grant execute on function public.submit_course_for_review(uuid)                                      to authenticated;
grant execute on function public.set_course_status(uuid, text, text)                                 to authenticated;
grant execute on function public.get_audit_logs(text, integer)                                       to authenticated;


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


-- =============================================================================
-- 0031 · Mentorship booking
--
-- The tables have existed since 0007, including a GiST exclusion constraint
-- that makes overlapping confirmed slots for one educator impossible at the
-- storage layer. What was missing was every path between them.
--
-- The hard part of booking is not the form. It is that two students tapping the
-- same slot within the same second must produce one booking and one clear
-- refusal — never two bookings, and never a slot silently held by nobody.
--
-- Two mechanisms:
--
--   * The claim is a single guarded UPDATE. `where id = ? and is_booked = false`
--     either affects one row or zero, and Postgres serialises the two writers.
--     Reading first and then writing would leave a window between them; there
--     is no window here.
--
--   * A paid slot is HELD, not booked, until payment lands. The hold expires,
--     and expired holds are released lazily by the two functions that are the
--     only way to see or take a slot. Nothing can observe a stale hold without
--     first clearing it, so this needs no cron and cannot drift.
-- =============================================================================

alter table public.mentorship_slots
  add column if not exists reserved_until timestamptz,
  add column if not exists topic_hint     text;

alter table public.mentorship_bookings
  add column if not exists price_inr integer not null default 0;

-- 'pending_payment' did not exist: every booking was born confirmed, which is
-- only true when the slot is free.
alter table public.mentorship_bookings drop constraint if exists mentorship_bookings_status_check;
alter table public.mentorship_bookings
  add constraint mentorship_bookings_status_check
  check (status in ('pending_payment', 'confirmed', 'completed', 'cancelled', 'no_show'));

create index if not exists idx_slots_open
  on public.mentorship_slots (educator_id, starts_at)
  where not is_booked;

-- -----------------------------------------------------------------------------
-- Release holds that were never paid for.
--
-- Called at the top of the two functions that read or take a slot, which are
-- the only ways to reach one. A hold cannot be observed without this running
-- first, so an abandoned checkout frees the slot for the next student without a
-- scheduled job to forget about.
-- -----------------------------------------------------------------------------
create or replace function public.release_expired_slot_holds()
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_count int;
begin
  with expired as (
    select s.id, b.id as booking_id
      from public.mentorship_slots s
      join public.mentorship_bookings b on b.slot_id = s.id
     where s.is_booked
       and s.reserved_until is not null
       and s.reserved_until < now()
       and b.status = 'pending_payment'
  ),
  cancelled as (
    update public.mentorship_bookings
       set status = 'cancelled'
     where id in (select booking_id from expired)
    returning slot_id
  )
  update public.mentorship_slots
     set is_booked = false, reserved_until = null
   where id in (select slot_id from cancelled);

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- -----------------------------------------------------------------------------
-- Who is available to book.
--
-- Only educators with at least one open slot in the window. A mentor list that
-- includes people with no availability is a list of dead ends.
-- -----------------------------------------------------------------------------
create or replace function public.get_mentors()
returns table (
  educator_id uuid,
  full_name   text,
  avatar_url  text,
  headline    text,
  open_slots  integer,
  from_price  integer,
  next_slot   timestamptz
)
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  perform public.release_expired_slot_holds();

  return query
  select p.id,
         p.full_name,
         p.avatar_url,
         p.bio,
         count(s.id)::int,
         min(s.price_inr)::int,
         min(s.starts_at)
    from public.mentorship_slots s
    join public.profiles p on p.id = s.educator_id
   where not s.is_booked
     and s.starts_at > now() + interval '1 hour'
   group by p.id, p.full_name, p.avatar_url, p.bio
   order by min(s.starts_at);
end $$;

-- -----------------------------------------------------------------------------
-- Open slots, optionally for one mentor.
--
-- The one-hour floor is deliberate. A slot starting in four minutes is
-- technically bookable and practically useless — neither person will be ready,
-- and the no-show lands on the educator's record.
-- -----------------------------------------------------------------------------
create or replace function public.get_open_slots(p_educator uuid default null, p_days integer default 21)
returns table (
  slot_id     uuid,
  educator_id uuid,
  educator    text,
  starts_at   timestamptz,
  ends_at     timestamptz,
  price_inr   integer,
  topic_hint  text
)
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  perform public.release_expired_slot_holds();

  return query
  select s.id, s.educator_id, p.full_name, s.starts_at, s.ends_at, s.price_inr, s.topic_hint
    from public.mentorship_slots s
    join public.profiles p on p.id = s.educator_id
   where not s.is_booked
     and s.starts_at > now() + interval '1 hour'
     and s.starts_at < now() + make_interval(days => greatest(1, least(coalesce(p_days, 21), 90)))
     and (p_educator is null or s.educator_id = p_educator)
   order by s.starts_at
   limit 200;
end $$;

-- -----------------------------------------------------------------------------
-- Take a slot.
--
-- Returns the booking id and, when the slot costs money, the order id the
-- caller must take to checkout. A free slot is confirmed immediately; a paid
-- one is held for fifteen minutes.
-- -----------------------------------------------------------------------------
create or replace function public.book_slot(
  p_slot  uuid,
  p_topic text default null,
  p_notes text default null
)
returns table (booking_id uuid, order_id uuid, price_inr integer, hold_expires timestamptz)
language plpgsql security definer set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_slot     record;
  v_booking  uuid;
  v_order    uuid;
  v_hold     timestamptz;
  v_educator text;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  perform public.release_expired_slot_holds();

  select * into v_slot from public.mentorship_slots where id = p_slot;
  if not found then
    raise exception 'SLOT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_slot.educator_id = v_user then
    raise exception 'OWN_SLOT' using errcode = '23514';
  end if;

  if v_slot.starts_at < now() + interval '1 hour' then
    raise exception 'TOO_LATE' using errcode = 'P0001';
  end if;

  -- One student, one pending booking. Without this, tapping Book on six slots
  -- and paying for none holds an educator's whole week hostage for 15 minutes.
  if exists (
    select 1 from public.mentorship_bookings
     where user_id = v_user and status = 'pending_payment'
  ) then
    raise exception 'HOLD_ALREADY_OPEN' using errcode = '23505';
  end if;

  v_hold := case when v_slot.price_inr > 0 then now() + interval '15 minutes' end;

  -- THE claim. One guarded UPDATE: `is_booked = false` in the WHERE means two
  -- concurrent callers cannot both succeed, because Postgres serialises them
  -- and the loser sees the row already changed. Reading then writing would
  -- leave a window between the two statements; this has none.
  update public.mentorship_slots
     set is_booked = true, reserved_until = v_hold
   where id = p_slot and not is_booked;

  if not found then
    raise exception 'SLOT_TAKEN' using errcode = '23505';
  end if;

  insert into public.mentorship_bookings (slot_id, user_id, topic, notes, price_inr, status)
  values (p_slot, v_user, nullif(trim(coalesce(p_topic, '')), ''),
          nullif(trim(coalesce(p_notes, '')), ''), v_slot.price_inr,
          case when v_slot.price_inr > 0 then 'pending_payment' else 'confirmed' end)
  returning id into v_booking;

  if v_slot.price_inr > 0 then
    select full_name into v_educator from public.profiles where id = v_slot.educator_id;

    insert into public.orders (user_id, subtotal_inr, discount_inr, total_inr, status)
    values (v_user, v_slot.price_inr, 0, v_slot.price_inr, 'created')
    returning id into v_order;

    -- item_type 'mentorship' was already allowed by the CHECK on order_items;
    -- this is the first thing to use it.
    insert into public.order_items (order_id, item_type, item_id, title_snapshot, unit_price_inr)
    values (v_order, 'mentorship', p_slot,
            '1:1 session with ' || coalesce(v_educator, 'your mentor'), v_slot.price_inr);

    update public.mentorship_bookings set order_id = v_order where id = v_booking;
  else
    -- Free sessions are real bookings straight away, so both people are told.
    perform public.enqueue_notification(
      v_slot.educator_id, 'mentorship.booked', 'New 1:1 booking',
      'A student booked your slot.',
      jsonb_build_object('url', '/studio/mentorship', 'booking_id', v_booking),
      'mentorship', array['push', 'email'], now());
  end if;

  return query select v_booking, v_order, v_slot.price_inr, v_hold;
end $$;

-- -----------------------------------------------------------------------------
-- Confirm a mentorship booking once its order is paid.
--
-- fulfil_order() handles course items. This is the mentorship half, called from
-- the same place, so a paid session is confirmed by the webhook rather than by
-- the browser — same rule as enrolment, and for the same reason: the success
-- handler is JavaScript on the buyer's machine.
-- -----------------------------------------------------------------------------
create or replace function public.confirm_mentorship_for_order(p_order uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_count int := 0;
  v_row   record;
begin
  for v_row in
    select b.id, b.user_id, s.educator_id, s.starts_at
      from public.mentorship_bookings b
      join public.mentorship_slots s on s.id = b.slot_id
     where b.order_id = p_order and b.status = 'pending_payment'
  loop
    update public.mentorship_bookings set status = 'confirmed' where id = v_row.id;

    -- The hold becomes permanent: is_booked stays true, the expiry is dropped
    -- so release_expired_slot_holds() will never look at it again.
    update public.mentorship_slots
       set reserved_until = null
     where id = (select slot_id from public.mentorship_bookings where id = v_row.id);

    perform public.enqueue_notification(
      v_row.educator_id, 'mentorship.booked', 'New 1:1 booking',
      'A student booked and paid for your slot.',
      jsonb_build_object('url', '/studio/mentorship', 'booking_id', v_row.id),
      'mentorship', array['push', 'email'], now());

    perform public.enqueue_notification(
      v_row.user_id, 'mentorship.confirmed', 'Your 1:1 session is confirmed',
      'The join link appears on the session an hour before it starts.',
      jsonb_build_object('url', '/app/mentorship', 'booking_id', v_row.id),
      'mentorship', array['push', 'email'], now());

    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

-- Extend fulfil_order to call it. Replaced wholesale rather than patched
-- because create-or-replace is the only idempotent form.
create or replace function public.fulfil_order(
  p_gateway_order_id   text,
  p_gateway_payment_id text,
  p_amount_inr         integer,
  p_method             text,
  p_raw                jsonb
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_order record;
  v_item record;
  v_days integer;
begin
  select * into v_order from public.orders where gateway_order_id = p_gateway_order_id;

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- A genuine webhook for the wrong amount is still the wrong amount.
  -- Underpayment must never unlock the course.
  if p_amount_inr < v_order.total_inr then
    update public.orders set status = 'failed', updated_at = now() where id = v_order.id;
    raise exception 'AMOUNT_MISMATCH: expected % got %', v_order.total_inr, p_amount_inr
      using errcode = 'P0001';
  end if;

  insert into public.payments (order_id, gateway_payment_id, amount_inr, method, status, captured_at, raw)
  values (v_order.id, p_gateway_payment_id, p_amount_inr, p_method, 'captured', now(), p_raw)
  on conflict (gateway_payment_id) do nothing;

  -- Already fulfilled by an earlier delivery of this event: stop here rather
  -- than re-granting access and re-incrementing the coupon.
  if v_order.status = 'paid' then
    return v_order.id;
  end if;

  update public.orders set status = 'paid', updated_at = now() where id = v_order.id;

  for v_item in
    select item_id, title_snapshot from public.order_items
     where order_id = v_order.id and item_type = 'course'
  loop
    select access_days into v_days from public.courses where id = v_item.item_id;

    insert into public.enrollments (user_id, course_id, order_id, status, expires_at)
    values (
      v_order.user_id, v_item.item_id, v_order.id, 'active',
      case when v_days is null then null else now() + make_interval(days => v_days) end
    )
    on conflict (user_id, course_id) do update
      set status = 'active',
          order_id = excluded.order_id,
          expires_at = excluded.expires_at;

    update public.courses
       set student_count = student_count + 1
     where id = v_item.item_id;

    perform public.enqueue_notification(
      v_order.user_id, 'course.published', 'You are enrolled: ' || v_item.title_snapshot,
      'Your payment went through and the course is ready in My Courses.',
      jsonb_build_object('url', '/app/learning'),
      'course', array['push','email'], now());
  end loop;

  -- 0031: mentorship slots held pending payment become real bookings here, for
  -- the same reason enrolment does — the browser's success handler is
  -- JavaScript on the buyer's machine and can be called from a console.
  perform public.confirm_mentorship_for_order(v_order.id);

  if v_order.coupon_id is not null then
    update public.coupons set used_count = used_count + 1 where id = v_order.coupon_id;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after)
  values (v_order.user_id, 'ORDER_PAID', 'orders', v_order.id,
          jsonb_build_object('amount', p_amount_inr, 'payment', p_gateway_payment_id));

  return v_order.id;
end $$;

-- -----------------------------------------------------------------------------
-- My bookings, and the educator's own list.
-- -----------------------------------------------------------------------------
create or replace function public.get_my_bookings()
returns table (
  booking_id  uuid,
  slot_id     uuid,
  counterpart text,
  starts_at   timestamptz,
  ends_at     timestamptz,
  status      text,
  topic       text,
  price_inr   integer,
  is_mine     boolean
)
language plpgsql security definer set search_path = public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  perform public.release_expired_slot_holds();

  return query
  select b.id,
         s.id,
         -- The student sees the educator's name; the educator sees the
         -- student's. Same query, opposite side.
         case when b.user_id = v_user then educator.full_name else student.full_name end,
         s.starts_at,
         s.ends_at,
         b.status,
         b.topic,
         b.price_inr,
         b.user_id = v_user
    from public.mentorship_bookings b
    join public.mentorship_slots s on s.id = b.slot_id
    join public.profiles educator on educator.id = s.educator_id
    join public.profiles student on student.id = b.user_id
   where b.user_id = v_user or s.educator_id = v_user
   order by s.starts_at desc
   limit 100;
end $$;

/*
 * The join link, issued the same way a live class link is.
 *
 * Not stored in the page, not in the RSC payload. Returned only to the two
 * people on the booking, only when the booking is confirmed, and only inside
 * the window — a link that works a week early is a link that gets forwarded.
 */
create or replace function public.get_booking_join_url(p_booking uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row  record;
begin
  select b.meet_url, b.status, b.user_id, s.educator_id, s.starts_at, s.ends_at
    into v_row
    from public.mentorship_bookings b
    join public.mentorship_slots s on s.id = b.slot_id
   where b.id = p_booking;

  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_row.user_id <> v_user and v_row.educator_id <> v_user then
    raise exception 'NOT_YOURS' using errcode = '42501';
  end if;

  if v_row.status <> 'confirmed' then
    raise exception 'NOT_CONFIRMED' using errcode = 'P0001';
  end if;

  if v_row.meet_url is null then
    raise exception 'NO_LINK_YET' using errcode = 'P0002';
  end if;

  if now() < v_row.starts_at - interval '1 hour' then
    raise exception 'TOO_EARLY' using errcode = 'P0001';
  end if;

  if now() > v_row.ends_at + interval '30 minutes' then
    raise exception 'SESSION_ENDED' using errcode = 'P0001';
  end if;

  return v_row.meet_url;
end $$;

-- -----------------------------------------------------------------------------
-- Educator side: publish slots, attach the link, cancel.
-- -----------------------------------------------------------------------------
create or replace function public.create_slots(
  p_starts    timestamptz[],
  p_minutes   integer default 45,
  p_price_inr integer default 0,
  p_topic     text default null
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_start timestamptz; v_count int := 0;
begin
  if not (public.has_role('educator') or public.has_role('admin')) then
    raise exception 'NOT_PERMITTED' using errcode = '42501';
  end if;

  if coalesce(p_minutes, 0) < 10 or p_minutes > 240 then
    raise exception 'BAD_DURATION' using errcode = '23514';
  end if;

  foreach v_start in array coalesce(p_starts, '{}')
  loop
    if v_start <= now() then
      continue;
    end if;

    -- Skip rather than fail: an educator pasting a week of times should not
    -- lose the whole batch because one clashes with a slot they already made.
    if exists (
      select 1 from public.mentorship_slots s
       where s.educator_id = auth.uid()
         and tstzrange(s.starts_at, s.ends_at) && tstzrange(v_start, v_start + make_interval(mins => p_minutes))
    ) then
      continue;
    end if;

    insert into public.mentorship_slots (educator_id, starts_at, ends_at, price_inr, topic_hint)
    values (auth.uid(), v_start, v_start + make_interval(mins => p_minutes),
            greatest(0, coalesce(p_price_inr, 0)), nullif(trim(coalesce(p_topic, '')), ''));

    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

create or replace function public.set_booking_meet_url(p_booking uuid, p_url text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_educator uuid; v_student uuid;
begin
  select s.educator_id, b.user_id into v_educator, v_student
    from public.mentorship_bookings b
    join public.mentorship_slots s on s.id = b.slot_id
   where b.id = p_booking;

  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_educator <> auth.uid() and not public.is_staff() then
    raise exception 'NOT_YOURS' using errcode = '42501';
  end if;

  if coalesce(p_url, '') !~* '^https://' then
    raise exception 'BAD_URL' using errcode = '23514';
  end if;

  update public.mentorship_bookings set meet_url = trim(p_url) where id = p_booking;

  perform public.enqueue_notification(
    v_student, 'mentorship.confirmed', 'Your 1:1 link is ready',
    'Open it from Mentorship an hour before the session.',
    jsonb_build_object('url', '/app/mentorship', 'booking_id', p_booking),
    'mentorship', array['push', 'email'], now());
end $$;

create or replace function public.cancel_booking(p_booking uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_row record;
begin
  select b.user_id, b.slot_id, b.status, s.educator_id, s.starts_at
    into v_row
    from public.mentorship_bookings b
    join public.mentorship_slots s on s.id = b.slot_id
   where b.id = p_booking;

  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_row.user_id <> auth.uid() and v_row.educator_id <> auth.uid() and not public.is_staff() then
    raise exception 'NOT_YOURS' using errcode = '42501';
  end if;

  update public.mentorship_bookings set status = 'cancelled' where id = p_booking;

  -- The slot goes back on sale. It is somebody's paid working hour, and leaving
  -- it dark because a booking was cancelled loses money for no reason.
  update public.mentorship_slots
     set is_booked = false, reserved_until = null
   where id = v_row.slot_id and starts_at > now();

  perform public.enqueue_notification(
    case when v_row.user_id = auth.uid() then v_row.educator_id else v_row.user_id end,
    'mentorship.cancelled', '1:1 session cancelled',
    coalesce(nullif(trim(p_reason), ''), 'The other person cancelled this session.'),
    jsonb_build_object('url', '/app/mentorship'),
    'mentorship', array['push', 'email'], now());
end $$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke all on function public.release_expired_slot_holds()                    from public, anon, authenticated;
revoke all on function public.get_mentors()                                   from public, anon, authenticated;
revoke all on function public.get_open_slots(uuid, integer)                   from public, anon, authenticated;
revoke all on function public.book_slot(uuid, text, text)                     from public, anon, authenticated;
revoke all on function public.confirm_mentorship_for_order(uuid)              from public, anon, authenticated;
revoke all on function public.get_my_bookings()                               from public, anon, authenticated;
revoke all on function public.get_booking_join_url(uuid)                      from public, anon, authenticated;
revoke all on function public.create_slots(timestamptz[], integer, integer, text) from public, anon, authenticated;
revoke all on function public.set_booking_meet_url(uuid, text)                from public, anon, authenticated;
revoke all on function public.cancel_booking(uuid, text)                      from public, anon, authenticated;

-- release_expired_slot_holds and confirm_mentorship_for_order stay ungranted:
-- both are internal, called by the functions above under the definer's rights.
-- Exposing the second would let anyone confirm an unpaid booking.
grant execute on function public.get_mentors()                                   to authenticated;
grant execute on function public.get_open_slots(uuid, integer)                   to authenticated;
grant execute on function public.book_slot(uuid, text, text)                     to authenticated;
grant execute on function public.get_my_bookings()                               to authenticated;
grant execute on function public.get_booking_join_url(uuid)                      to authenticated;
grant execute on function public.create_slots(timestamptz[], integer, integer, text) to authenticated;
grant execute on function public.set_booking_meet_url(uuid, text)                to authenticated;
grant execute on function public.cancel_booking(uuid, text)                      to authenticated;

-- meet_url is revoked for the same reason live_sessions.join_url is: a link in
-- the page is a link that can be forwarded. get_booking_join_url() is the only
-- way to obtain one, and it checks both identity and the time window.
revoke select (meet_url) on public.mentorship_bookings from anon, authenticated;
