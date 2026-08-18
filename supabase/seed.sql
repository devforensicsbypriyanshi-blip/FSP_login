-- =============================================================================
-- Local development seed. Never run against production.
--
-- Creates one educator and two students with a published course, a recurring
-- schedule, and generated live sessions — enough to exercise the launch scope
-- (courses + live classes + calendar) end to end.
-- =============================================================================

do $$
declare
  v_educator uuid := '11111111-1111-1111-1111-111111111111';
  v_student  uuid := '22222222-2222-2222-2222-222222222222';
  v_student2 uuid := '33333333-3333-3333-3333-333333333333';
  v_course   uuid := '44444444-4444-4444-4444-444444444444';
  v_module   uuid := '55555555-5555-5555-5555-555555555555';
  v_batch    uuid := '66666666-6666-6666-6666-666666666666';
  v_schedule uuid := '77777777-7777-7777-7777-777777777777';
begin
  -- auth.users rows, so the handle_new_user trigger creates profiles for us.
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values
    (v_educator, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'priyanshi.verma@forensics.org',
     '{"full_name":"Priyanshi Verma","exam_target":"ugc_net"}'::jsonb, now(), now()),
    (v_student, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'ananya.sharma@gmail.com',
     '{"full_name":"Ananya Sharma","exam_target":"ugc_net"}'::jsonb, now(), now()),
    (v_student2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'rohan.k@gmail.com',
     '{"full_name":"Rohan Kapoor","exam_target":"msc"}'::jsonb, now(), now())
  on conflict (id) do nothing;

  -- Promote Priyanshi to educator + admin.
  insert into public.user_roles (user_id, role_id)
  select v_educator, id from public.roles where key in ('educator','admin')
  on conflict do nothing;

  insert into public.courses (id, slug, title, subtitle, description, category,
                              price_inr, mrp_inr, status, created_by, published_at)
  values (v_course, 'ugc-net-forensic-science-2026',
          'UGC NET Forensic Science Masterclass 2026',
          'Complete Paper 1 + Paper 2 preparation',
          'Full syllabus coverage with live classes, recorded lectures and mock tests.',
          'UGC NET', 4999, 7999, 'published', v_educator, now())
  on conflict (id) do nothing;

  insert into public.batches (id, course_id, name, starts_on, is_active)
  values (v_batch, v_course, 'UGC NET 2026 Core', current_date - 30, true)
  on conflict (id) do nothing;

  insert into public.course_modules (id, course_id, title, position)
  values (v_module, v_course, 'Unit 3 — Forensic Serology & DNA', 1)
  on conflict (id) do nothing;

  -- Drive file ids here are illustrative; replace with real shared files.
  insert into public.lessons (module_id, course_id, title, kind, drive_file_id, position, is_preview, published_at)
  values
    (v_module, v_course, 'Lesson 1: Introduction to Forensic Serology', 'video',
     '1A2b3C4d5E6f7G8h9I0jKlMnOpQrStUvWx', 1, true,  now()),
    (v_module, v_course, 'Lesson 2: Blood Group Antigens', 'video',
     '1B2c3D4e5F6g7H8i9J0kLmNoPqRsTuVwXy', 2, false, now()),
    (v_module, v_course, 'Lesson 3: STR DNA Profiling & PCR', 'video',
     '1C2d3E4f5G6h7I8j9K0lMnOpQrStUvWxYz', 3, false, now())
  on conflict do nothing;

  -- Enrol both students (service-role path — students cannot self-enrol).
  insert into public.enrollments (user_id, course_id, batch_id, status)
  values (v_student, v_course, v_batch, 'active'),
         (v_student2, v_course, v_batch, 'active')
  on conflict (user_id, course_id) do nothing;

  -- Recurring class: Mon / Wed / Fri at 16:00 IST for 90 minutes.
  insert into public.class_schedules (id, course_id, batch_id, educator_id, title,
                                      weekdays, start_time, duration_min, starts_on, ends_on,
                                      default_join_url)
  values (v_schedule, v_course, v_batch, v_educator,
          'UGC NET 2026 Core — main lecture',
          array[1,3,5]::smallint[], '16:00', 90,
          current_date - 30, current_date + 90,
          'https://meet.google.com/abc-defg-hij')
  on conflict (id) do nothing;

  -- Materialise the next 60 days of sessions from that pattern.
  perform public.generate_sessions(v_schedule, 60);

  -- One session happening right now, so the "LIVE" state is testable.
  insert into public.live_sessions (course_id, batch_id, educator_id, title, description,
                                    starts_at, ends_at, provider, join_url, status)
  values (v_course, v_batch, v_educator,
          'Forensic Toxicology: Poisons & Viscera Extraction',
          'Live interactive session with doubt moderation.',
          now() - interval '15 minutes', now() + interval '75 minutes',
          'meet', 'https://meet.google.com/live-demo-now', 'live')
  on conflict do nothing;

  raise notice 'Seed complete: 1 educator, 2 students, 1 course, 3 lessons, recurring schedule.';
end $$;
