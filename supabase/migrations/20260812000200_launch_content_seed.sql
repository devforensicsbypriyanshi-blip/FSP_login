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
