-- =============================================================================
-- pgTAP · Row Level Security assertions
--
-- These are the most important tests in the project. A UI bug is an annoyance;
-- an RLS gap is one student reading another student's data.
--
-- Run: supabase test db
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------
\set educator_id '11111111-1111-1111-1111-111111111111'
\set enrolled_id '22222222-2222-2222-2222-222222222222'
\set outsider_id '99999999-9999-9999-9999-999999999999'

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  (:'educator_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'edu@test.local', '{"full_name":"Test Educator"}'::jsonb, now(), now()),
  (:'enrolled_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'enrolled@test.local', '{"full_name":"Enrolled Student"}'::jsonb, now(), now()),
  (:'outsider_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'outsider@test.local', '{"full_name":"Outsider Student"}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.user_roles (user_id, role_id)
select :'educator_id', id from public.roles where key = 'educator' on conflict do nothing;

insert into public.courses (id, slug, title, status, created_by, published_at, price_inr)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'rls-test-course', 'RLS Test Course',
        'published', :'educator_id', now(), 4999)
on conflict (id) do nothing;

insert into public.course_modules (id, course_id, title, position)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Module 1', 1)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, course_id, title, kind, drive_file_id, position, is_preview)
values
  ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Paid lesson', 'video', 'DRIVEID0000000000000000001', 1, false),
  ('cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Free preview', 'video', 'DRIVEID0000000000000000002', 2, true)
on conflict (id) do nothing;

insert into public.enrollments (user_id, course_id, status)
values (:'enrolled_id', 'aaaaaaaa-0000-0000-0000-000000000001', 'active')
on conflict do nothing;

-- A future session and a currently-live one.
insert into public.live_sessions (id, course_id, educator_id, title, starts_at, ends_at, join_url, status)
values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', :'educator_id',
   'Far future class', now() + interval '3 days', now() + interval '3 days 1 hour',
   'https://meet.google.com/secret-future', 'scheduled'),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', :'educator_id',
   'Happening now', now() - interval '5 minutes', now() + interval '55 minutes',
   'https://meet.google.com/secret-now', 'live')
on conflict (id) do nothing;

insert into public.orders (id, user_id, subtotal_inr, total_inr, status)
values ('eeeeeeee-0000-0000-0000-000000000001', :'enrolled_id', 4999, 4999, 'paid')
on conflict (id) do nothing;

-- =============================================================================
-- AS THE OUTSIDER (signed in, but not enrolled)
-- =============================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

select is(
  (select count(*)::int from public.lessons where id = 'cccccccc-0000-0000-0000-000000000001'),
  0, 'outsider cannot read a paid lesson'
);

select is(
  (select count(*)::int from public.lessons where id = 'cccccccc-0000-0000-0000-000000000002'),
  1, 'outsider CAN read a free preview lesson'
);

select is(
  (select count(*)::int from public.orders where id = 'eeeeeeee-0000-0000-0000-000000000001'),
  0, 'outsider cannot read another student''s order'
);

select is(
  (select count(*)::int from public.live_sessions),
  0, 'outsider cannot see live sessions for a course they are not in'
);

select throws_ok(
  $$ select public.get_live_join_url('dddddddd-0000-0000-0000-000000000002') $$,
  '42501',
  null,
  'outsider is refused the join link of a live class'
);

-- The single most dangerous hole: self-enrolment would unlock every paid course.
select throws_ok(
  $$ insert into public.enrollments (user_id, course_id, status)
     values ('99999999-9999-9999-9999-999999999999', 'aaaaaaaa-0000-0000-0000-000000000001', 'active') $$,
  '42501',
  null,
  'student CANNOT insert their own enrolment'
);

select is(
  (select count(*)::int from public.profiles where id <> '99999999-9999-9999-9999-999999999999'),
  0, 'outsider cannot read other user profiles'
);

select is(
  (select count(*)::int from public.audit_logs), 0,
  'non-staff cannot read the audit log'
);

select is(
  (select count(*)::int from public.quiz_options), 0,
  'students cannot read quiz answer keys'
);

-- =============================================================================
-- AS THE ENROLLED STUDENT
-- =============================================================================
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.lessons where course_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  2, 'enrolled student reads all lessons in their course'
);

select is(
  (select count(*)::int from public.orders where id = 'eeeeeeee-0000-0000-0000-000000000001'),
  1, 'student reads their own order'
);

select is(
  (select count(*)::int from public.live_sessions),
  2, 'enrolled student sees their course sessions'
);

-- Time gating: enrolled, but the class is three days away.
select throws_ok(
  $$ select public.get_live_join_url('dddddddd-0000-0000-0000-000000000001') $$,
  'P0001',
  null,
  'join link is withheld before the T-15m window, even when enrolled'
);

select isnt(
  (select public.get_live_join_url('dddddddd-0000-0000-0000-000000000002')),
  null,
  'join link IS returned for a class that is live now'
);

select is(
  (select count(*)::int from public.session_attendance
    where session_id = 'dddddddd-0000-0000-0000-000000000002'
      and user_id = '22222222-2222-2222-2222-222222222222'),
  1, 'requesting the join link records attendance'
);

-- =============================================================================
-- SCHEMA-WIDE INVARIANT
-- Any table without RLS is readable by everyone. Catch it here, not in prod.
-- =============================================================================
reset role;
select is(
  (select count(*)::int
     from pg_tables t
     left join pg_class c on c.relname = t.tablename
    where t.schemaname = 'public'
      and c.relrowsecurity = false),
  0,
  'every table in public has row level security enabled'
);

select * from finish();
rollback;
