-- =============================================================================
-- FSP PLATFORM — COMPLETE DATABASE SETUP
--
-- HOW TO USE:
--   1. Select all of this file (Ctrl+A) and copy (Ctrl+C)
--   2. Open Supabase -> SQL Editor -> New query
--   3. Paste (Ctrl+V) and press Run
--
-- Creates 51 tables, 87 security policies, 15 functions and all seed data.
-- Runs as ONE transaction: if anything fails, nothing is applied and you get
-- an error message. Safe to run again after fixing.
-- =============================================================================

begin;


-- ###########################################################################
-- 20260805000100_extensions_enums_helpers.sql
-- ###########################################################################

-- =============================================================================
-- 0001 · Extensions, enums and RLS helper functions
-- docs/02-DATABASE-SCHEMA.md §1
--
-- Every helper is SECURITY DEFINER with an explicit search_path. Without the
-- search_path pin, a caller could shadow `public` and escalate privileges.
-- They are STABLE so the planner caches them per statement, which keeps the
-- extra lookup in every RLS policy effectively free.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";
create extension if not exists "pg_trgm";
create extension if not exists "btree_gist";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
do $$ begin
  create type app_role as enum ('student','educator','admin','support','developer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type course_status as enum ('draft','pending_review','published','archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lesson_kind as enum ('video','pdf','quiz','live','text');
exception when duplicate_object then null; end $$;

do $$ begin
  create type enrollment_state as enum ('active','expired','refunded','suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type live_provider as enum ('meet','youtube','livekit');
exception when duplicate_object then null; end $$;

do $$ begin
  create type live_status as enum ('scheduled','live','ended','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum ('created','pending','paid','failed','refunded','partially_refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type doubt_status as enum ('open','answered','resolved','closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_status as enum ('open','pending','resolved','closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type priority_level as enum ('low','medium','high','urgent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type setting_type as enum
    ('boolean','integer','number','string','text','enum','json','duration_minutes','color','url','email');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Shared trigger: keep updated_at honest
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

comment on function public.touch_updated_at is
  'Attach as a BEFORE UPDATE trigger on every table carrying updated_at.';


-- ###########################################################################
-- 20260805000200_identity_rbac.sql
-- ###########################################################################

-- =============================================================================
-- 0002 · Profiles, roles, permissions, RLS helpers
-- docs/02-DATABASE-SCHEMA.md §2
-- =============================================================================

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text not null,
  email        citext unique not null,
  -- Nullable and unused by auth. Collected only at checkout for physical book
  -- shipping — there is no phone OTP (docs Part 5 §2.1a).
  phone        text,
  avatar_url   text,
  bio          text,
  exam_target  text,
  referral_code text,
  timezone     text not null default 'Asia/Kolkata',
  locale       text not null default 'en-IN',
  consent_accepted_at timestamptz,
  onboarded_at timestamptz,
  last_seen_at timestamptz,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.roles (
  id          smallserial primary key,
  key         app_role unique not null,
  name        text not null,
  description text
);

create table if not exists public.permissions (
  id          serial primary key,
  key         text unique not null,
  description text
);

create table if not exists public.role_permissions (
  role_id       smallint not null references public.roles(id) on delete cascade,
  permission_id int      not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists public.user_roles (
  user_id    uuid     not null references public.profiles(id) on delete cascade,
  role_id    smallint not null references public.roles(id) on delete cascade,
  granted_by uuid     references public.profiles(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create trigger trg_profiles_updated
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- RLS helpers
--
-- Roles live in user_roles, NOT in the JWT. Putting them in JWT claims means a
-- revoked admin keeps their powers until the token expires (up to an hour).
-- -----------------------------------------------------------------------------
create or replace function public.current_role_keys()
returns app_role[]
language sql stable security definer set search_path = public
as $$
  select coalesce(array_agg(r.key), '{}'::app_role[])
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = auth.uid();
$$;

create or replace function public.has_role(p app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p = any(public.current_role_keys());
$$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.current_role_keys() && array['admin','developer','support']::app_role[];
$$;

-- -----------------------------------------------------------------------------
-- Provision a profile + default student role on signup.
--
-- Reads options.data passed to signInWithOtp, so a registration lands complete
-- in one step — no half-created accounts (docs Part 5 §2.1).
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, exam_target, referral_code, consent_accepted_at)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data->>'exam_target',
    new.raw_user_meta_data->>'referral_code',
    (new.raw_user_meta_data->>'consent_accepted_at')::timestamptz
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role_id)
  select new.id, id from public.roles where key = 'student'
  on conflict do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.roles            enable row level security;
alter table public.permissions      enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles       enable row level security;

create policy "profiles: read own or staff" on public.profiles
  for select using (id = auth.uid() or public.is_staff());

create policy "profiles: update own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy "profiles: admin manages all" on public.profiles
  for all using (public.has_role('admin')) with check (public.has_role('admin'));

create policy "roles: readable when signed in" on public.roles
  for select using (auth.uid() is not null);

create policy "permissions: readable when signed in" on public.permissions
  for select using (auth.uid() is not null);

create policy "role_permissions: readable when signed in" on public.role_permissions
  for select using (auth.uid() is not null);

create policy "user_roles: read own or staff" on public.user_roles
  for select using (user_id = auth.uid() or public.is_staff());

create policy "user_roles: admin grants" on public.user_roles
  for all using (public.has_role('admin')) with check (public.has_role('admin'));

-- -----------------------------------------------------------------------------
-- Seed roles and the permission matrix (docs Part 3 §2)
-- -----------------------------------------------------------------------------
insert into public.roles (key, name, description) values
  ('student',   'Student',        'Enrolled learner'),
  ('educator',  'Educator',       'Creates courses and teaches live classes'),
  ('admin',     'Admin',          'Full platform control'),
  ('support',   'Support',        'Helpdesk and student assistance'),
  ('developer', 'Developer',      'System configuration and diagnostics')
on conflict (key) do nothing;

insert into public.permissions (key, description) values
  ('course.view.enrolled',  'View content of enrolled courses'),
  ('course.create',         'Create courses'),
  ('course.edit.own',       'Edit own courses'),
  ('course.publish',        'Publish a course'),
  ('course.approve',        'Approve a submitted course'),
  ('lesson.upload',         'Add lessons and Drive links'),
  ('live.schedule',         'Schedule live classes'),
  ('live.broadcast',        'Host a live class'),
  ('live.join',             'Join a live class'),
  ('doubt.create',          'Post a doubt'),
  ('doubt.answer.verified', 'Post a verified educator answer'),
  ('quiz.create',           'Create quizzes'),
  ('quiz.publish',          'Publish quizzes'),
  ('quiz.attempt',          'Attempt a quiz'),
  ('payment.view.own',      'View own orders'),
  ('payment.view.all',      'View all orders'),
  ('payment.refund',        'Issue refunds'),
  ('coupon.manage',         'Manage coupons'),
  ('user.view',             'View user records'),
  ('user.suspend',          'Suspend a user'),
  ('user.role.grant',       'Grant or revoke roles'),
  ('ticket.manage',         'Manage support tickets'),
  ('apikey.manage',         'Manage API keys'),
  ('flag.toggle',           'Toggle feature flags'),
  ('webhook.replay',        'Replay webhook deliveries'),
  ('audit.view',            'View audit logs')
on conflict (key) do nothing;

-- admin holds everything
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'admin'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on true
where (r.key = 'student'  and p.key in ('course.view.enrolled','live.join','doubt.create','quiz.attempt','payment.view.own'))
   or (r.key = 'educator' and p.key in ('course.view.enrolled','course.create','course.edit.own','lesson.upload',
                                        'live.schedule','live.broadcast','live.join','doubt.answer.verified',
                                        'quiz.create','quiz.publish'))
   or (r.key = 'support'  and p.key in ('course.view.enrolled','live.join','user.view','ticket.manage',
                                        'payment.view.all','audit.view'))
   or (r.key = 'developer' and p.key in ('apikey.manage','flag.toggle','webhook.replay','audit.view'))
on conflict do nothing;


-- ###########################################################################
-- 20260805000300_platform_config.sql
-- ###########################################################################

-- =============================================================================
-- 0003 · Feature flags, settings, config history
-- docs/05-REGISTRATION-AND-PLATFORM-CONFIG.md §3
--
-- Built BEFORE the features it gates, deliberately: retrofitting flags into
-- shipped code costs several times more than building flagged from the start.
-- =============================================================================

create table if not exists public.feature_flags (
  key             text primary key,
  name            text not null,
  description     text not null,
  category        text not null,
  enabled         boolean not null default false,
  default_enabled boolean not null default false,
  rollout_percent smallint not null default 100 check (rollout_percent between 0 and 100),
  target_roles    app_role[],
  target_user_ids uuid[],
  is_protected    boolean not null default false,   -- admin + step-up re-auth
  is_kill_switch  boolean not null default false,   -- admin only; developers cannot touch
  revert_at       timestamptz,                      -- temporary change, auto-reverted by cron
  updated_by      uuid references public.profiles(id),
  updated_at      timestamptz not null default now()
);

create table if not exists public.app_settings (
  key           text primary key,
  name          text not null,
  description   text not null,
  category      text not null,
  value         jsonb not null,
  default_value jsonb not null,
  value_type    setting_type not null,
  validation    jsonb not null default '{}'::jsonb,
  unit          text,
  is_secret     boolean not null default false,
  is_protected  boolean not null default false,
  updated_by    uuid references public.profiles(id),
  updated_at    timestamptz not null default now()
);

create table if not exists public.config_history (
  id          bigserial primary key,
  entity      text not null check (entity in ('flag','setting')),
  entity_key  text not null,
  before      jsonb,
  after       jsonb,
  reason      text,
  actor_id    uuid references public.profiles(id),
  actor_email text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_config_history_key
  on public.config_history (entity_key, created_at desc);

create table if not exists public.config_version (
  singleton  boolean primary key default true check (singleton),
  version    bigint not null default 1,
  updated_at timestamptz not null default now()
);
insert into public.config_version (singleton) values (true) on conflict do nothing;

-- -----------------------------------------------------------------------------
-- History + version bump by trigger, so it cannot be bypassed by writing
-- directly to the tables.
-- -----------------------------------------------------------------------------
create or replace function public.track_config_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.config_history (entity, entity_key, before, after, actor_id, actor_email)
  values (
    tg_argv[0],
    coalesce(new.key, old.key),
    to_jsonb(old),
    to_jsonb(new),
    auth.uid(),
    (select email from public.profiles where id = auth.uid())
  );

  update public.config_version set version = version + 1, updated_at = now() where singleton;
  return new;
end $$;

drop trigger if exists trg_flag_history on public.feature_flags;
create trigger trg_flag_history
  after update on public.feature_flags
  for each row execute function public.track_config_change('flag');

drop trigger if exists trg_setting_history on public.app_settings;
create trigger trg_setting_history
  after update on public.app_settings
  for each row execute function public.track_config_change('setting');

-- -----------------------------------------------------------------------------
-- RLS
--
-- Kill switches (payments, auth, maintenance) require admin. A console that
-- lets any developer take the business offline at 2am is a liability.
-- -----------------------------------------------------------------------------
alter table public.feature_flags  enable row level security;
alter table public.app_settings   enable row level security;
alter table public.config_history enable row level security;
alter table public.config_version enable row level security;

create policy "flags: readable when signed in" on public.feature_flags
  for select using (auth.uid() is not null);

create policy "flags: write by role" on public.feature_flags
  for update using (
    case
      when is_kill_switch then public.has_role('admin')
      when is_protected   then public.has_role('admin')
      else public.has_role('developer') or public.has_role('admin')
    end
  );

create policy "settings: readable when signed in" on public.app_settings
  for select using (auth.uid() is not null and not is_secret);

create policy "settings: staff read secrets" on public.app_settings
  for select using (public.is_staff());

create policy "settings: write by role" on public.app_settings
  for update using (
    case when is_protected then public.has_role('admin')
         else public.has_role('developer') or public.has_role('admin') end
  );

create policy "config_history: staff read" on public.config_history
  for select using (public.is_staff());

create policy "config_version: readable when signed in" on public.config_version
  for select using (auth.uid() is not null);

-- History is evidence. Nobody edits it.
revoke update, delete on public.config_history from authenticated, anon;

-- -----------------------------------------------------------------------------
-- Seed: launch scope (docs Part 5 §3.5)
-- v1 ships Courses + Live Classes + Calendar. Everything else off.
-- -----------------------------------------------------------------------------
insert into public.feature_flags (key, name, description, category, enabled, default_enabled, is_protected, is_kill_switch) values
  ('module.courses',      'Courses',              'Course catalogue, lessons and the Drive player.',        'Launch scope', true,  true,  false, false),
  ('module.live_classes', 'Live classes',         'Live sessions, join links and attendance.',              'Launch scope', true,  true,  false, false),
  ('module.calendar',     'Calendar',             'Recurring schedules and the student calendar.',          'Launch scope', true,  true,  false, false),
  ('module.notes',        'Notes & DPPs',         'Private resource vault with signed downloads.',          'Launch scope', false, false, false, false),
  ('module.quizzes',      'Quizzes & mock tests', 'Timed runner with server-side scoring.',                 'Launch scope', false, false, false, false),
  ('module.doubts',       'Doubts forum',         'Student questions and verified educator answers.',       'Launch scope', false, false, false, false),
  ('module.store',        'Store & books',        'Physical and digital product catalogue.',                'Launch scope', false, false, false, false),
  ('module.mentorship',   '1:1 mentorship',       'Slot booking and paid sessions.',                        'Launch scope', false, false, false, false),
  ('module.analytics',    'Student analytics',    'Attendance and completion reporting.',                   'Launch scope', false, false, false, false),

  ('ops.maintenance_mode','Maintenance mode',     'Takes the platform offline for everyone except staff.',  'Operations',   false, false, false, true),
  ('ops.registration_open','Registration open',   'Master switch for new student signups.',                 'Operations',   true,  true,  true,  false),
  ('ops.read_only_mode',  'Read-only mode',       'Blocks all writes; reads keep working.',                 'Operations',   false, false, true,  false),
  ('ops.debug_logging',   'Debug logging',        'Verbose structured logs.',                               'Operations',   false, false, false, false),

  ('auth.email_otp_enabled','Email OTP login',    'The only login method. Disabling locks everyone out.',   'Authentication', true, true, false, true),
  ('auth.single_device_session','Single device session','A new login signs out the previous device.',       'Authentication', true, true, true,  false),
  ('auth.idle_logout_enabled','Idle auto-logout', 'Paused during live classes and quiz attempts.',          'Authentication', true, true, false, false),
  ('auth.strict_enumeration_protection','Strict enumeration protection','Hides whether an email is registered.','Authentication', false, false, false, false),
  ('auth.captcha_enabled','Captcha on OTP send',  'hCaptcha after repeated failures.',                      'Authentication', false, false, false, false),

  ('live.chat_enabled',   'In-class chat',        'Live chat during a session.',                            'Live',         true,  true,  false, false),
  ('live.attendance_tracking','Attendance tracking','Heartbeat-based attendance.',                          'Live',         true,  true,  false, false),
  ('live.recording_publish','Publish recordings', 'Turn a Meet recording into a lesson.',                   'Live',         true,  true,  false, false),
  ('live.auto_generate_sessions','Auto-generate sessions','Recurrence engine creates future classes.',      'Live',         true,  true,  false, false),

  ('content.drive_player','Drive player',         'Google Drive iframe player for video and PDF.',          'Content',      true,  true,  false, false),
  ('content.downloads_enabled','Downloads',       'Note and DPP downloads.',                                'Content',      true,  true,  false, false),
  ('content.pdf_watermark','PDF watermarking',    'Stamp each download with the student identity.',         'Content',      true,  true,  false, false),
  ('content.free_previews','Free preview lessons','Preview lessons visible before enrolment.',              'Content',      true,  true,  false, false),

  ('payments.enabled',    'Payments',             'Razorpay checkout and auto-enrolment.',                  'Payments',     false, false, false, true),
  ('payments.coupons_enabled','Coupons',          'Discount code engine.',                                  'Payments',     true,  true,  false, false),
  ('payments.emi_enabled','EMI',                  'Razorpay EMI options.',                                  'Payments',     false, false, false, false),

  ('notifications.push_enabled','Web push',       'Browser push notifications.',                            'Notifications', true, true,  false, false),
  ('notifications.email_enabled','Email',         'Transactional email via Resend.',                        'Notifications', true, true,  false, false),
  ('notifications.quiet_hours','Quiet hours',     'Suppress non-critical alerts 22:00-07:00 IST.',          'Notifications', true, true,  false, false),

  ('ui.public_hub',       'Public portal hub',    'Show the portal launcher at /. Off in production.',      'Interface',    false, false, false, false),
  ('ui.announcement_banner','Announcement banner','Sitewide banner.',                                       'Interface',    false, false, false, false),
  ('ui.dark_mode',        'Dark mode',            'Dark theme.',                                            'Interface',    false, false, false, false)
on conflict (key) do nothing;

insert into public.app_settings (key, name, description, category, value, default_value, value_type, validation, unit) values
  ('auth.otp_length',            'OTP length',            'Digits in the verification code.',        'Authentication', '6',    '6',    'integer',          '{"min":4,"max":8}',    null),
  ('auth.otp_ttl_minutes',       'OTP lifetime',          'How long a code stays valid.',            'Authentication', '10',   '10',   'duration_minutes', '{"min":1,"max":60}',   'minutes'),
  ('auth.otp_max_attempts',      'OTP max attempts',      'Verify attempts before the code burns.',  'Authentication', '5',    '5',    'integer',          '{"min":3,"max":10}',   null),
  ('auth.otp_resend_cooldown_seconds','Resend cooldown',  'Seconds before a code can be resent.',    'Authentication', '60',   '60',   'integer',          '{"min":30,"max":300}', 'seconds'),
  ('auth.idle_minutes_student',  'Student idle timeout',  'Inactivity before auto sign-out.',        'Authentication', '30',   '30',   'duration_minutes', '{"min":5,"max":180}',  'minutes'),
  ('auth.idle_minutes_admin',    'Admin idle timeout',    'Shorter — highest blast radius.',         'Authentication', '15',   '15',   'duration_minutes', '{"min":5,"max":60}',   'minutes'),
  ('auth.device_switch_limit_24h','Device switch limit',  'Switches per 24h before flagging.',       'Authentication', '5',    '5',    'integer',          '{"min":1,"max":20}',   null),
  ('auth.trusted_device_days',   'Trusted device window', 'Days a device stays trusted.',            'Authentication', '30',   '30',   'integer',          '{"min":1,"max":365}',  'days'),

  ('live.join_window_before_minutes','Join opens before', 'Minutes before start the link works.',    'Live', '15',  '15',  'duration_minutes', '{"min":0,"max":120}', 'minutes'),
  ('live.join_window_after_minutes', 'Join closes after', 'Minutes after end the link still works.', 'Live', '30',  '30',  'duration_minutes', '{"min":0,"max":180}', 'minutes'),
  ('live.reminder_offsets_minutes',  'Reminder offsets',  'Minutes before start to notify.',         'Live', '[1440,15]','[1440,15]','json',      '{}',                  null),
  ('live.generation_horizon_days',   'Generation horizon','Days ahead to create sessions.',          'Live', '60',  '60',  'integer',          '{"min":7,"max":365}', 'days'),
  ('live.default_provider',          'Default provider',  'Delivery method for new sessions.',       'Live', '"meet"','"meet"','enum',           '{"options":["meet","youtube","livekit"]}', null),

  ('content.signed_url_ttl_seconds', 'Download link lifetime','Seconds a signed URL stays valid.',   'Content', '60',  '60',  'integer', '{"min":15,"max":3600}', 'seconds'),
  ('content.drive_thumbnail_width',  'Thumbnail width',   'Pixel width pulled from Drive.',          'Content', '1600','1600','integer', '{"min":400,"max":2400}','px'),

  ('payments.gst_percent',       'GST percentage',        'Tax applied at checkout.',                'Payments', '18',   '18',   'number',  '{"min":0,"max":28}', '%'),
  ('payments.refund_window_days','Refund window',         'Days a student may request a refund.',    'Payments', '7',    '7',    'integer', '{"min":0,"max":90}', 'days'),
  ('payments.invoice_prefix',    'Invoice prefix',        'Prefix on generated invoice numbers.',    'Payments', '"FSP"','"FSP"','string',  '{"maxLength":8}',    null),

  ('notifications.quiet_start',  'Quiet hours start',     'Non-critical alerts pause from here.',    'Notifications', '"22:00"','"22:00"','string','{"pattern":"^\\\\d{2}:\\\\d{2}$"}', null),
  ('notifications.quiet_end',    'Quiet hours end',       'Non-critical alerts resume here.',        'Notifications', '"07:00"','"07:00"','string','{"pattern":"^\\\\d{2}:\\\\d{2}$"}', null),
  ('notifications.digest_hour',  'Daily digest hour',     'Hour (IST) the digest email is sent.',    'Notifications', '19',     '19',     'integer','{"min":0,"max":23}', null),

  ('ui.support_email',           'Support email',         'Shown to students needing help.',         'Interface', '"support@forensicbypriyanshi.com"','"support@forensicbypriyanshi.com"','email','{}', null),
  ('ui.announcement_banner_text','Banner text',           'Sitewide announcement copy.',             'Interface', '""','""','text','{"maxLength":280}', null)
on conflict (key) do nothing;


-- ###########################################################################
-- 20260805000400_courses_content.sql
-- ###########################################################################

-- =============================================================================
-- 0004 · Courses, modules, lessons, enrolments, progress, resources
-- docs/02-DATABASE-SCHEMA.md §3 and §5
-- =============================================================================

create table if not exists public.courses (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  title         text not null,
  subtitle      text,
  description   text,
  category      text,
  tags          text[] not null default '{}',
  banner_public_id text,                        -- Cloudinary
  preview_drive_id text,
  price_inr     integer not null default 0 check (price_inr >= 0),
  mrp_inr       integer check (mrp_inr is null or mrp_inr >= price_inr),
  is_free       boolean generated always as (price_inr = 0) stored,
  access_days   integer,                        -- null = lifetime
  status        course_status not null default 'draft',
  created_by    uuid references public.profiles(id),
  approved_by   uuid references public.profiles(id),
  approved_at   timestamptz,
  published_at  timestamptz,
  student_count integer not null default 0,
  rating_avg    numeric(3,2),
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.course_modules (
  id        uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title     text not null,
  position  integer not null
);

create table if not exists public.batches (
  id        uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  name      text not null,
  starts_on date,
  ends_on   date,
  capacity  integer,
  is_active boolean not null default true
);

create table if not exists public.lessons (
  id            uuid primary key default gen_random_uuid(),
  module_id     uuid not null references public.course_modules(id) on delete cascade,
  -- Denormalised so RLS can check enrolment without joining up two levels.
  course_id     uuid not null references public.courses(id) on delete cascade,
  title         text not null,
  description   text,
  kind          lesson_kind not null default 'video',
  -- The Drive FILE ID, never the pasted URL. URLs carry tracking params and
  -- change shape; the id is stable (docs Part 1 §6.1).
  drive_file_id text,
  drive_kind    text,
  banner_public_id text,
  duration_sec  integer,
  position      integer not null,
  is_preview    boolean not null default false,
  published_at  timestamptz,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint drive_required_for_media
    check (kind not in ('video','pdf') or drive_file_id is not null)
);

create table if not exists public.enrollments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  course_id  uuid not null references public.courses(id) on delete cascade,
  batch_id   uuid references public.batches(id),
  order_id   uuid,
  status     enrollment_state not null default 'active',
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (user_id, course_id)
);

create table if not exists public.lesson_progress (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  lesson_id    uuid not null references public.lessons(id) on delete cascade,
  course_id    uuid not null references public.courses(id) on delete cascade,
  -- Lesson-level only. The Drive iframe is cross-origin and emits no playback
  -- events, so second-level resume is impossible in v1 (docs Part 0 §F3).
  status       text not null default 'opened' check (status in ('opened','completed')),
  opened_at    timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, lesson_id)
);

-- Backup Drive ids for files that hit the per-file daily view quota.
create table if not exists public.drive_file_mirrors (
  id            uuid primary key default gen_random_uuid(),
  lesson_id     uuid references public.lessons(id) on delete cascade,
  drive_file_id text not null,
  account_label text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.resources (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid references public.courses(id) on delete cascade,
  title         text not null,
  kind          text not null check (kind in ('note','dpp','paper','solution','syllabus')),
  storage_path  text,
  drive_file_id text,
  size_bytes    bigint,
  page_count    integer,
  is_free       boolean not null default false,
  published_at  timestamptz,
  download_count integer not null default 0,
  created_at    timestamptz not null default now(),
  constraint one_source check (num_nonnulls(storage_path, drive_file_id) = 1)
);

create table if not exists public.resource_downloads (
  id          bigserial primary key,
  resource_id uuid not null references public.resources(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  ip          inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create trigger trg_courses_updated before update on public.courses
  for each row execute function public.touch_updated_at();
create trigger trg_lessons_updated before update on public.lessons
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Enrolment helper — used by nearly every content policy
-- -----------------------------------------------------------------------------
create or replace function public.is_enrolled(p_course uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.enrollments
    where user_id = auth.uid()
      and course_id = p_course
      and status = 'active'
      and (expires_at is null or expires_at > now())
  );
$$;

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------
create index if not exists idx_enroll_user   on public.enrollments (user_id) where status = 'active';
create index if not exists idx_enroll_course on public.enrollments (course_id) where status = 'active';
create index if not exists idx_lessons_course on public.lessons (course_id, position) where deleted_at is null;
create index if not exists idx_courses_published on public.courses (published_at desc) where status = 'published';
create index if not exists idx_courses_title_trgm on public.courses using gin (title gin_trgm_ops);
create index if not exists idx_progress_course on public.lesson_progress (user_id, course_id);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.courses            enable row level security;
alter table public.course_modules     enable row level security;
alter table public.batches            enable row level security;
alter table public.lessons            enable row level security;
alter table public.enrollments        enable row level security;
alter table public.lesson_progress    enable row level security;
alter table public.drive_file_mirrors enable row level security;
alter table public.resources          enable row level security;
alter table public.resource_downloads enable row level security;

create policy "courses: published are public" on public.courses
  for select using (status = 'published' and deleted_at is null);
create policy "courses: creator sees own" on public.courses
  for select using (created_by = auth.uid());
create policy "courses: staff see all" on public.courses
  for select using (public.is_staff());
create policy "courses: educator manages own" on public.courses
  for all using (created_by = auth.uid() and public.has_role('educator'))
  with check (created_by = auth.uid());
create policy "courses: admin manages all" on public.courses
  for all using (public.has_role('admin')) with check (public.has_role('admin'));

create policy "modules: follow course visibility" on public.course_modules
  for select using (
    exists (select 1 from public.courses c where c.id = course_id
            and (c.status = 'published' or c.created_by = auth.uid() or public.is_staff()))
  );
create policy "modules: educator manages own" on public.course_modules
  for all using (exists (select 1 from public.courses c where c.id = course_id and c.created_by = auth.uid()));

create policy "batches: readable when signed in" on public.batches
  for select using (auth.uid() is not null);

-- A lesson is readable only as a free preview, or with an active enrolment.
create policy "lessons: read when preview, enrolled, owner or staff" on public.lessons
  for select using (
    deleted_at is null and (
         is_preview
      or public.is_enrolled(course_id)
      or public.is_staff()
      or exists (select 1 from public.courses c where c.id = course_id and c.created_by = auth.uid())
    )
  );
create policy "lessons: educator manages own" on public.lessons
  for all using (exists (select 1 from public.courses c where c.id = course_id and c.created_by = auth.uid()));

create policy "enrollments: read own or staff" on public.enrollments
  for select using (user_id = auth.uid() or public.is_staff());

-- CRITICAL: no INSERT policy for students. Without this a student could insert
-- their own enrolment row and unlock every paid course for free. Enrolments are
-- written only by the payment webhook using the service role.
create policy "enrollments: staff only writes" on public.enrollments
  for insert with check (public.is_staff());
create policy "enrollments: staff updates" on public.enrollments
  for update using (public.is_staff());

create policy "progress: own only" on public.lesson_progress
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "mirrors: staff and owners" on public.drive_file_mirrors
  for select using (public.is_staff() or exists (
    select 1 from public.lessons l join public.courses c on c.id = l.course_id
    where l.id = lesson_id and c.created_by = auth.uid()));

create policy "resources: free or enrolled" on public.resources
  for select using (
    is_free or public.is_enrolled(course_id) or public.is_staff()
    or exists (select 1 from public.courses c where c.id = course_id and c.created_by = auth.uid())
  );
create policy "resources: educator manages own" on public.resources
  for all using (exists (select 1 from public.courses c where c.id = course_id and c.created_by = auth.uid()));

create policy "downloads: read own or staff" on public.resource_downloads
  for select using (user_id = auth.uid() or public.is_staff());


-- ###########################################################################
-- 20260805000500_live_calendar.sql
-- ###########################################################################

-- =============================================================================
-- 0005 · Live sessions, recurrence engine, time-gated join links
-- docs/01-SYSTEM-ARCHITECTURE.md §6.3 and docs/04 §3
-- =============================================================================

create table if not exists public.class_schedules (
  id               uuid primary key default gen_random_uuid(),
  course_id        uuid not null references public.courses(id) on delete cascade,
  batch_id         uuid references public.batches(id),
  educator_id      uuid not null references public.profiles(id),
  title            text not null,
  description      text,
  weekdays         smallint[] not null,          -- ISO: 1=Mon … 7=Sun
  start_time       time not null,                -- wall clock in `timezone`
  duration_min     integer not null check (duration_min between 5 and 600),
  timezone         text not null default 'Asia/Kolkata',
  starts_on        date not null,
  ends_on          date,
  default_join_url text,
  auto_generate    boolean not null default true,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  constraint weekdays_valid check (
    weekdays <@ array[1,2,3,4,5,6,7]::smallint[] and cardinality(weekdays) > 0)
);

create table if not exists public.schedule_exceptions (
  id              uuid primary key default gen_random_uuid(),
  schedule_id     uuid not null references public.class_schedules(id) on delete cascade,
  occurrence_date date not null,
  action          text not null check (action in ('cancelled','rescheduled')),
  new_starts_at   timestamptz,
  reason          text,
  unique (schedule_id, occurrence_date)
);

create table if not exists public.live_sessions (
  id                 uuid primary key default gen_random_uuid(),
  course_id          uuid not null references public.courses(id) on delete cascade,
  batch_id           uuid references public.batches(id),
  educator_id        uuid not null references public.profiles(id),
  title              text not null,
  description        text,
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  provider           live_provider not null default 'meet',
  -- Column-level revoked from students below; served only by get_live_join_url().
  join_url           text,
  material_drive_id  text,
  banner_public_id   text,
  recording_drive_id text,
  status             live_status not null default 'scheduled',
  max_attendees      integer,
  actual_peak        integer not null default 0,
  reminder_24h_sent_at timestamptz,
  reminder_15m_sent_at timestamptz,
  cancelled_reason   text,
  schedule_id        uuid references public.class_schedules(id) on delete set null,
  occurrence_date    date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint sane_window check (ends_at > starts_at),
  constraint uq_schedule_occurrence unique (schedule_id, occurrence_date)
);

create table if not exists public.session_attendance (
  session_id   uuid not null references public.live_sessions(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  joined_at    timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table if not exists public.live_chat_messages (
  id         bigserial primary key,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (length(body) between 1 and 500),
  is_pinned  boolean not null default false,
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now()
);

create trigger trg_sessions_updated before update on public.live_sessions
  for each row execute function public.touch_updated_at();

create index if not exists idx_sessions_calendar
  on public.live_sessions (course_id, starts_at) where status <> 'cancelled';
create index if not exists idx_sessions_upcoming
  on public.live_sessions (starts_at) where status = 'scheduled';

-- =============================================================================
-- Recurrence engine: schedule template -> generated sessions
-- Idempotent via unique (schedule_id, occurrence_date).
-- =============================================================================
create or replace function public.generate_sessions(p_schedule uuid, p_horizon_days int default 60)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  s public.class_schedules%rowtype;
  d date;
  v_start timestamptz;
  v_made int := 0;
begin
  select * into s from public.class_schedules
  where id = p_schedule and is_active and auto_generate;
  if not found then return 0; end if;

  for d in
    select gs::date
    from generate_series(
      greatest(s.starts_on, current_date),
      least(coalesce(s.ends_on, current_date + p_horizon_days), current_date + p_horizon_days),
      interval '1 day'
    ) gs
  loop
    continue when not (extract(isodow from d)::smallint = any(s.weekdays));
    continue when exists (
      select 1 from public.schedule_exceptions e
      where e.schedule_id = s.id and e.occurrence_date = d and e.action = 'cancelled'
    );

    -- Wall clock in the schedule's own zone -> the correct UTC instant.
    v_start := (d + s.start_time) at time zone s.timezone;

    insert into public.live_sessions (
      course_id, batch_id, educator_id, title, description,
      starts_at, ends_at, provider, join_url, schedule_id, occurrence_date
    )
    values (
      s.course_id, s.batch_id, s.educator_id, s.title, s.description,
      v_start, v_start + make_interval(mins => s.duration_min),
      'meet', s.default_join_url, s.id, d
    )
    on conflict (schedule_id, occurrence_date) do nothing;

    if found then v_made := v_made + 1; end if;
  end loop;

  return v_made;
end $$;

-- =============================================================================
-- THE security-critical function.
--
-- RLS is row-level, not column-level, so hiding join_url needs a column REVOKE
-- plus a SECURITY DEFINER accessor that enforces enrolment AND the time window.
-- =============================================================================
create or replace function public.get_live_join_url(p_session uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_url text; v_start timestamptz; v_end timestamptz;
  v_course uuid; v_educator uuid;
  v_before int; v_after int;
begin
  select join_url, starts_at, ends_at, course_id, educator_id
    into v_url, v_start, v_end, v_course, v_educator
  from public.live_sessions where id = p_session;

  if not found then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Educators open their own room whenever they like.
  if v_educator = auth.uid() or public.has_role('admin') then
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

  insert into public.session_attendance (session_id, user_id)
  values (p_session, auth.uid())
  on conflict (session_id, user_id) do update set last_seen_at = now();

  return v_url;
end $$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.class_schedules     enable row level security;
alter table public.schedule_exceptions enable row level security;
alter table public.live_sessions       enable row level security;
alter table public.session_attendance  enable row level security;
alter table public.live_chat_messages  enable row level security;

-- Students may read the session row but NOT the join_url column.
revoke select (join_url) on public.live_sessions from authenticated, anon;

create policy "sessions: enrolled, educator or staff" on public.live_sessions
  for select using (
    public.is_enrolled(course_id) or educator_id = auth.uid() or public.is_staff()
  );
create policy "sessions: educator manages own" on public.live_sessions
  for all using (educator_id = auth.uid() and public.has_role('educator'))
  with check (educator_id = auth.uid());
create policy "sessions: admin manages all" on public.live_sessions
  for all using (public.has_role('admin')) with check (public.has_role('admin'));

create policy "schedules: enrolled, educator or staff" on public.class_schedules
  for select using (
    public.is_enrolled(course_id) or educator_id = auth.uid() or public.is_staff()
  );
create policy "schedules: educator manages own" on public.class_schedules
  for all using (educator_id = auth.uid()) with check (educator_id = auth.uid());

create policy "exceptions: follow schedule" on public.schedule_exceptions
  for all using (exists (
    select 1 from public.class_schedules s
    where s.id = schedule_id and (s.educator_id = auth.uid() or public.is_staff())));

create policy "attendance: own or educator" on public.session_attendance
  for select using (
    user_id = auth.uid() or exists (
      select 1 from public.live_sessions s
      where s.id = session_id and (s.educator_id = auth.uid() or public.is_staff()))
  );

create policy "chat: read if enrolled" on public.live_chat_messages
  for select using (
    not is_hidden and exists (
      select 1 from public.live_sessions s
      where s.id = session_id
        and (public.is_enrolled(s.course_id) or s.educator_id = auth.uid() or public.is_staff()))
  );
create policy "chat: post own during a live session" on public.live_chat_messages
  for insert with check (
    user_id = auth.uid() and exists (
      select 1 from public.live_sessions s
      where s.id = session_id and s.status = 'live' and public.is_enrolled(s.course_id))
  );
create policy "chat: educator moderates" on public.live_chat_messages
  for update using (exists (
    select 1 from public.live_sessions s
    where s.id = session_id and (s.educator_id = auth.uid() or public.is_staff())));


-- ###########################################################################
-- 20260805000600_sessions_notifications_audit.sql
-- ###########################################################################

-- =============================================================================
-- 0006 · Device lock, notifications, audit log
-- docs/04-SESSIONS-OTP-CALENDAR-NOTIFICATIONS.md §1 and §4
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Single active session per account.
--
-- Supabase access tokens are stateless JWTs valid for their full hour, so
-- revoking a row does NOT invalidate a token already in a browser. This table
-- is the source of truth; middleware checks it on the request path. Realtime
-- gives the fast UX kick, but middleware is the actual enforcement.
-- -----------------------------------------------------------------------------
create table if not exists public.user_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  device_id     text not null,
  device_label  text,
  user_agent    text,
  ip            inet,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  revoked_at    timestamptz,
  revoke_reason text check (revoke_reason in
    ('new_login','idle_timeout','tab_closed','manual','admin','password_change')),
  unique (user_id, device_id)
);

create index if not exists idx_sessions_active on public.user_sessions (user_id) where revoked_at is null;
create index if not exists idx_sessions_stale  on public.user_sessions (last_seen_at) where revoked_at is null;

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text unique not null,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  data       jsonb not null default '{}'::jsonb,
  category   text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notif_unread
  on public.notifications (user_id, created_at desc) where read_at is null;

create table if not exists public.notification_prefs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  type    text not null,
  in_app  boolean not null default true,
  push    boolean not null default true,
  email   boolean not null default true,
  primary key (user_id, type)
);

create table if not exists public.announcements (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid references public.courses(id) on delete cascade,
  batch_id     uuid references public.batches(id),
  title        text not null,
  body         text not null,
  audience     text not null default 'course' check (audience in ('all','course','batch')),
  created_by   uuid references public.profiles(id),
  published_at timestamptz not null default now()
);

create table if not exists public.email_log (
  id         uuid primary key default gen_random_uuid(),
  to_email   citext not null,
  template   text not null,
  subject    text,
  resend_id  text,
  status     text not null default 'queued',
  error      text,
  created_at timestamptz not null default now()
);
-- Resend's free tier allows 100/day. This index backs the daily-quota alert.
create index if not exists idx_email_log_day on public.email_log (created_at desc);

create table if not exists public.audit_logs (
  id          bigserial primary key,
  actor_id    uuid references public.profiles(id),
  actor_email text,
  action      text not null,
  entity_type text,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  ip          inet,
  user_agent  text,
  request_id  text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_audit_recent on public.audit_logs (created_at desc);

-- =============================================================================
-- Claim a device and evict every other live session, atomically.
-- =============================================================================
create or replace function public.claim_session(
  p_device_id text,
  p_label     text default null,
  p_user_agent text default null,
  p_ip        inet default null
)
returns table (session_id uuid, evicted_count int)
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_evicted int;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  update public.user_sessions
     set revoked_at = now(), revoke_reason = 'new_login'
   where user_id = v_user and device_id <> p_device_id and revoked_at is null;
  get diagnostics v_evicted = row_count;

  insert into public.user_sessions (user_id, device_id, device_label, user_agent, ip)
  values (v_user, p_device_id, p_label, p_user_agent, p_ip)
  on conflict (user_id, device_id) do update
    set revoked_at = null,
        revoke_reason = null,
        last_seen_at = now(),
        ip = excluded.ip,
        user_agent = excluded.user_agent
  returning id into v_id;

  if v_evicted > 0 then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, after)
    values (v_user, 'SESSION_EVICT', 'user_sessions', v_id,
            jsonb_build_object('evicted', v_evicted, 'device', p_label));

    insert into public.notifications (user_id, type, title, body, category)
    values (v_user, 'session.evicted', 'Signed in on a new device',
            'Your account was used on another device, so the previous one was signed out.',
            'security');
  end if;

  return query select v_id, v_evicted;
end $$;

create or replace function public.revoke_other_sessions(p_keep_device text)
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_count int;
begin
  update public.user_sessions
     set revoked_at = now(), revoke_reason = 'manual'
   where user_id = auth.uid() and device_id <> p_keep_device and revoked_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.user_sessions      enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notifications      enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.announcements      enable row level security;
alter table public.email_log          enable row level security;
alter table public.audit_logs         enable row level security;

create policy "sessions: read own or staff" on public.user_sessions
  for select using (user_id = auth.uid() or public.is_staff());

create policy "push: own only" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "notifications: own only" on public.notifications
  for select using (user_id = auth.uid());
create policy "notifications: mark own read" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "prefs: own only" on public.notification_prefs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "announcements: enrolled or staff" on public.announcements
  for select using (
    audience = 'all' or course_id is null
    or public.is_enrolled(course_id) or public.is_staff()
    or exists (select 1 from public.courses c where c.id = course_id and c.created_by = auth.uid())
  );
create policy "announcements: educator publishes" on public.announcements
  for insert with check (public.has_role('educator') or public.has_role('admin'));

create policy "email_log: staff read" on public.email_log
  for select using (public.is_staff());

create policy "audit: staff read" on public.audit_logs
  for select using (public.is_staff());

-- The audit trail is evidence. No role edits or deletes it, ever.
revoke update, delete on public.audit_logs from authenticated, anon;


-- ###########################################################################
-- 20260805000700_payments_engagement_support.sql
-- ###########################################################################

-- =============================================================================
-- 0007 · Payments, doubts, quizzes, mentorship, support
--
-- These modules are flagged OFF for launch (docs Part 5 §3.5), but the schema
-- ships now: adding tables later is cheap, but discovering a modelling mistake
-- after 200 students have data is not.
-- =============================================================================

-- ------------------------------- PAYMENTS -----------------------------------
create table if not exists public.coupons (
  id               uuid primary key default gen_random_uuid(),
  code             citext unique not null,
  kind             text not null check (kind in ('percent','flat')),
  value            integer not null check (value > 0),
  max_discount_inr integer,
  min_amount_inr   integer not null default 0,
  max_uses         integer,
  per_user_limit   integer not null default 1,
  used_count       integer not null default 0,
  valid_from       timestamptz not null default now(),
  valid_to         timestamptz,
  is_active        boolean not null default true,
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  constraint percent_range check (kind <> 'percent' or value between 1 and 100)
);

create table if not exists public.orders (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id),
  subtotal_inr     integer not null,
  discount_inr     integer not null default 0,
  tax_inr          integer not null default 0,
  total_inr        integer not null check (total_inr >= 0),
  currency         char(3) not null default 'INR',
  coupon_id        uuid references public.coupons(id),
  status           order_status not null default 'created',
  gateway          text not null default 'razorpay',
  gateway_order_id text unique,
  shipping_address jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete cascade,
  item_type      text not null check (item_type in ('course','product','mentorship')),
  item_id        uuid not null,
  title_snapshot text not null,          -- price and title frozen at purchase time
  unit_price_inr integer not null,
  quantity       integer not null default 1 check (quantity > 0)
);

-- Append-only.
create table if not exists public.payments (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders(id),
  gateway_payment_id text unique not null,
  amount_inr         integer not null,
  method             text,
  status             text not null,
  captured_at        timestamptz,
  raw                jsonb not null,
  created_at         timestamptz not null default now()
);

create table if not exists public.refunds (
  id                uuid primary key default gen_random_uuid(),
  payment_id        uuid not null references public.payments(id),
  gateway_refund_id text unique,
  amount_inr        integer not null,
  reason            text,
  initiated_by      uuid references public.profiles(id),
  status            text not null default 'pending',
  created_at        timestamptz not null default now()
);

-- The idempotency gate. A replayed webhook can never double-enrol a student.
create table if not exists public.webhook_events (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null,
  event_id     text not null,
  event_type   text not null,
  payload      jsonb not null,
  status       text not null default 'received',
  error        text,
  attempts     smallint not null default 0,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);

create table if not exists public.products (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  title           text not null,
  description     text,
  kind            text not null check (kind in ('digital','physical')),
  price_inr       integer not null check (price_inr >= 0),
  mrp_inr         integer,
  image_public_id text,
  stock           integer,
  weight_g        integer,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- -------------------------------- DOUBTS ------------------------------------
create table if not exists public.doubts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  course_id    uuid references public.courses(id) on delete set null,
  subject      text,
  title        text,
  body         text not null check (length(body) between 10 and 5000),
  attachments  jsonb not null default '[]'::jsonb,
  status       doubt_status not null default 'open',
  upvotes      integer not null default 0,
  is_anonymous boolean not null default false,
  answered_at  timestamptz,
  created_at   timestamptz not null default now(),
  search_tsv   tsvector generated always as
    (to_tsvector('english', coalesce(title,'') || ' ' || body)) stored
);
create index if not exists idx_doubts_search on public.doubts using gin (search_tsv);

create table if not exists public.doubt_answers (
  id                   uuid primary key default gen_random_uuid(),
  doubt_id             uuid not null references public.doubts(id) on delete cascade,
  user_id              uuid not null references public.profiles(id),
  body                 text not null,
  attachments          jsonb not null default '[]'::jsonb,
  is_educator_verified boolean not null default false,
  is_accepted          boolean not null default false,
  upvotes              integer not null default 0,
  created_at           timestamptz not null default now()
);

create table if not exists public.doubt_votes (
  doubt_id uuid not null references public.doubts(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  primary key (doubt_id, user_id)     -- one vote per user, enforced by the PK
);

-- -------------------------------- QUIZZES -----------------------------------
create table if not exists public.quizzes (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid references public.courses(id) on delete cascade,
  title         text not null,
  description   text,
  duration_min  integer not null check (duration_min > 0),
  total_marks   numeric(6,2),
  negative_mark numeric(4,2) not null default 0,
  shuffle       boolean not null default true,
  max_attempts  smallint not null default 1,
  opens_at      timestamptz,
  closes_at     timestamptz,
  status        text not null default 'draft' check (status in ('draft','published','archived')),
  created_by    uuid references public.profiles(id)
);

create table if not exists public.quiz_questions (
  id              uuid primary key default gen_random_uuid(),
  quiz_id         uuid not null references public.quizzes(id) on delete cascade,
  body            text not null,
  image_public_id text,
  explanation     text,
  marks           numeric(4,2) not null default 1,
  negative        numeric(4,2) not null default 0,
  position        integer not null
);

create table if not exists public.quiz_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  body        text not null,
  is_correct  boolean not null default false,   -- never selectable by students
  position    integer not null
);

create table if not exists public.quiz_attempts (
  id            uuid primary key default gen_random_uuid(),
  quiz_id       uuid not null references public.quizzes(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  started_at    timestamptz not null default now(),
  submitted_at  timestamptz,
  expires_at    timestamptz not null,           -- server-authoritative timer
  score         numeric(6,2),
  correct_count integer,
  wrong_count   integer,
  skipped_count integer,
  rank          integer
);

create table if not exists public.quiz_responses (
  attempt_id    uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id   uuid not null references public.quiz_questions(id) on delete cascade,
  option_id     uuid references public.quiz_options(id),
  marks_awarded numeric(4,2),
  answered_at   timestamptz not null default now(),
  primary key (attempt_id, question_id)
);

-- ------------------------------ MENTORSHIP ----------------------------------
create table if not exists public.mentorship_slots (
  id          uuid primary key default gen_random_uuid(),
  educator_id uuid not null references public.profiles(id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  price_inr   integer not null default 0,
  is_booked   boolean not null default false,
  -- Database-level guarantee against double-booking the same educator.
  exclude using gist (
    educator_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (is_booked)
);

create table if not exists public.mentorship_bookings (
  id         uuid primary key default gen_random_uuid(),
  slot_id    uuid not null unique references public.mentorship_slots(id),
  user_id    uuid not null references public.profiles(id),
  order_id   uuid references public.orders(id),
  topic      text,
  notes      text,
  meet_url   text,
  status     text not null default 'confirmed'
               check (status in ('confirmed','completed','cancelled','no_show')),
  created_at timestamptz not null default now()
);

-- -------------------------------- SUPPORT -----------------------------------
create table if not exists public.support_tickets (
  id          uuid primary key default gen_random_uuid(),
  ref         text unique not null default ('TCK-' || lpad((floor(random()*99999))::text, 5, '0')),
  user_id     uuid not null references public.profiles(id),
  subject     text not null,
  category    text,
  priority    priority_level not null default 'medium',
  status      ticket_status not null default 'open',
  assigned_to uuid references public.profiles(id),
  first_response_at timestamptz,
  resolved_at timestamptz,
  sla_due_at  timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists public.ticket_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.support_tickets(id) on delete cascade,
  sender_id   uuid not null references public.profiles(id),
  body        text not null,
  attachments jsonb not null default '[]'::jsonb,
  is_internal boolean not null default false,
  created_at  timestamptz not null default now()
);

-- -------------------------------- INDEXES -----------------------------------
create index if not exists idx_orders_user   on public.orders (user_id, created_at desc);
create index if not exists idx_doubts_course on public.doubts (course_id, created_at desc) where status <> 'closed';
create index if not exists idx_attempts_user on public.quiz_attempts (user_id, quiz_id);
create index if not exists idx_tickets_open  on public.support_tickets (status, priority, created_at)
  where status in ('open','pending');

-- ---------------------------------- RLS -------------------------------------
alter table public.coupons             enable row level security;
alter table public.orders              enable row level security;
alter table public.order_items         enable row level security;
alter table public.payments            enable row level security;
alter table public.refunds             enable row level security;
alter table public.webhook_events      enable row level security;
alter table public.products            enable row level security;
alter table public.doubts              enable row level security;
alter table public.doubt_answers       enable row level security;
alter table public.doubt_votes         enable row level security;
alter table public.quizzes             enable row level security;
alter table public.quiz_questions      enable row level security;
alter table public.quiz_options        enable row level security;
alter table public.quiz_attempts       enable row level security;
alter table public.quiz_responses      enable row level security;
alter table public.mentorship_slots    enable row level security;
alter table public.mentorship_bookings enable row level security;
alter table public.support_tickets     enable row level security;
alter table public.ticket_messages     enable row level security;

create policy "coupons: active are readable" on public.coupons
  for select using (is_active or public.is_staff());
create policy "coupons: admin manages" on public.coupons
  for all using (public.has_role('admin')) with check (public.has_role('admin'));

create policy "products: active are public" on public.products
  for select using (is_active or public.is_staff());

-- No INSERT/UPDATE policies on money tables: writes happen only via the
-- service role inside the verified webhook handler.
create policy "orders: read own or staff" on public.orders
  for select using (user_id = auth.uid() or public.is_staff());
create policy "order_items: follow order" on public.order_items
  for select using (exists (
    select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_staff())));
create policy "payments: follow order" on public.payments
  for select using (exists (
    select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_staff())));
create policy "refunds: staff read" on public.refunds
  for select using (public.is_staff());
create policy "webhooks: staff read" on public.webhook_events
  for select using (public.is_staff());

create policy "doubts: readable to course members" on public.doubts
  for select using (
    public.is_enrolled(course_id) or user_id = auth.uid() or public.is_staff()
    or exists (select 1 from public.courses c where c.id = course_id and c.created_by = auth.uid()));
create policy "doubts: post own" on public.doubts
  for insert with check (user_id = auth.uid() and public.is_enrolled(course_id));
create policy "answers: readable with the doubt" on public.doubt_answers
  for select using (exists (select 1 from public.doubts d where d.id = doubt_id));
create policy "answers: post own" on public.doubt_answers
  for insert with check (user_id = auth.uid());
create policy "votes: own only" on public.doubt_votes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "quizzes: published to enrolled" on public.quizzes
  for select using (
    (status = 'published' and public.is_enrolled(course_id))
    or created_by = auth.uid() or public.is_staff());
create policy "quizzes: educator manages own" on public.quizzes
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "questions: with the quiz" on public.quiz_questions
  for select using (exists (
    select 1 from public.quizzes q where q.id = quiz_id
      and ((q.status = 'published' and public.is_enrolled(q.course_id))
           or q.created_by = auth.uid() or public.is_staff())));

-- Students can never select quiz_options at all. The runner receives options
-- through an RPC that strips is_correct; scoring happens server-side.
create policy "options: authors and staff only" on public.quiz_options
  for select using (public.is_staff() or exists (
    select 1 from public.quiz_questions q join public.quizzes z on z.id = q.quiz_id
    where q.id = question_id and z.created_by = auth.uid()));

create policy "attempts: own or staff" on public.quiz_attempts
  for select using (user_id = auth.uid() or public.is_staff());
create policy "responses: follow attempt" on public.quiz_responses
  for select using (exists (
    select 1 from public.quiz_attempts a where a.id = attempt_id
      and (a.user_id = auth.uid() or public.is_staff())));

create policy "slots: readable when signed in" on public.mentorship_slots
  for select using (auth.uid() is not null);
create policy "slots: educator manages own" on public.mentorship_slots
  for all using (educator_id = auth.uid()) with check (educator_id = auth.uid());
create policy "bookings: own or educator" on public.mentorship_bookings
  for select using (user_id = auth.uid() or exists (
    select 1 from public.mentorship_slots s where s.id = slot_id and s.educator_id = auth.uid()));

create policy "tickets: own or staff" on public.support_tickets
  for select using (user_id = auth.uid() or public.is_staff());
create policy "tickets: raise own" on public.support_tickets
  for insert with check (user_id = auth.uid());

-- Internal staff notes must never reach the student on the ticket.
create policy "ticket_messages: hide internal notes" on public.ticket_messages
  for select using (
    (not is_internal and exists (
      select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid()))
    or public.is_staff());
create policy "ticket_messages: post own" on public.ticket_messages
  for insert with check (sender_id = auth.uid());


-- ###########################################################################
-- 20260805000800_storage_and_cron.sql
-- ###########################################################################

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
create policy "resources: staff direct read only"
  on storage.objects for select
  using (bucket_id = 'resources' and public.is_staff());

create policy "avatars: public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars: write own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

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


-- ###########################################################################
-- 20260806000100_email_tracking.sql
-- ###########################################################################

-- =============================================================================
-- 0009 · Email delivery tracking
--
-- Email is the ONLY authentication channel (no SMS, no password), so an
-- undelivered message is a locked-out student. Every send is logged and every
-- Resend webhook event is recorded, which gives Support a real answer to
-- "I didn't get my code" instead of a shrug.
--
-- It also protects deliverability: continuing to email a hard bounce or a
-- spam complainer destroys sender reputation and eventually takes the whole
-- domain down. Suppressions are enforced before every send.
-- =============================================================================

-- Resend event types: https://resend.com/docs/dashboard/webhooks/event-types
do $$ begin
  create type email_event_type as enum (
    'email.sent',
    'email.delivered',
    'email.delivery_delayed',
    'email.bounced',
    'email.complained',
    'email.opened',
    'email.clicked',
    'email.failed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type email_status as enum (
    'queued','sent','delivered','delayed','bounced','complained','failed'
  );
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Extend email_log: one row per send, holding the latest known state.
-- -----------------------------------------------------------------------------
alter table public.email_log
  add column if not exists user_id       uuid references public.profiles(id) on delete set null,
  add column if not exists category      text,
  add column if not exists idempotency_key text,
  add column if not exists state         email_status not null default 'queued',
  add column if not exists sent_at       timestamptz,
  add column if not exists delivered_at  timestamptz,
  add column if not exists opened_at     timestamptz,
  add column if not exists clicked_at    timestamptz,
  add column if not exists bounced_at    timestamptz,
  add column if not exists complained_at timestamptz,
  add column if not exists bounce_type   text,
  add column if not exists open_count    integer not null default 0,
  add column if not exists click_count   integer not null default 0,
  add column if not exists last_event_at timestamptz;

create unique index if not exists uq_email_log_resend on public.email_log (resend_id)
  where resend_id is not null;
create unique index if not exists uq_email_log_idem on public.email_log (idempotency_key)
  where idempotency_key is not null;
create index if not exists idx_email_log_recipient on public.email_log (to_email, created_at desc);
create index if not exists idx_email_log_user on public.email_log (user_id, created_at desc);
create index if not exists idx_email_log_state on public.email_log (state, created_at desc);

-- -----------------------------------------------------------------------------
-- Append-only event stream. One row per webhook delivery.
-- -----------------------------------------------------------------------------
create table if not exists public.email_events (
  id           bigserial primary key,
  email_log_id uuid references public.email_log(id) on delete cascade,
  resend_id    text,
  event_type   email_event_type not null,
  -- Resend may redeliver; svix_id makes ingestion idempotent.
  svix_id      text,
  recipient    citext,
  payload      jsonb not null,
  occurred_at  timestamptz not null,
  received_at  timestamptz not null default now()
);

create unique index if not exists uq_email_events_svix on public.email_events (svix_id)
  where svix_id is not null;
create index if not exists idx_email_events_log on public.email_events (email_log_id, occurred_at desc);
create index if not exists idx_email_events_type on public.email_events (event_type, occurred_at desc);

-- -----------------------------------------------------------------------------
-- Suppression list. Never send to these addresses again.
-- -----------------------------------------------------------------------------
create table if not exists public.email_suppressions (
  email       citext primary key,
  reason      text not null check (reason in ('hard_bounce','complaint','manual','invalid')),
  detail      text,
  suppressed_at timestamptz not null default now(),
  released_at timestamptz,
  released_by uuid references public.profiles(id)
);

create index if not exists idx_suppressions_active on public.email_suppressions (email)
  where released_at is null;

create or replace function public.is_email_suppressed(p_email citext)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.email_suppressions
    where email = p_email and released_at is null
  );
$$;

-- -----------------------------------------------------------------------------
-- Fold an event into email_log's current state.
--
-- Guards against out-of-order delivery: webhooks are not ordered, so a
-- 'delivered' arriving after 'opened' must not walk the state backwards.
-- -----------------------------------------------------------------------------
create or replace function public.apply_email_event()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_rank_new int;
  v_rank_cur int;
  v_current email_status;
begin
  if new.email_log_id is null then
    return new;
  end if;

  select state into v_current from public.email_log where id = new.email_log_id;

  -- Terminal states outrank progress states; opens/clicks never regress state.
  v_rank_cur := case v_current
    when 'queued' then 0 when 'sent' then 1 when 'delayed' then 2
    when 'delivered' then 3 when 'bounced' then 4 when 'complained' then 5
    when 'failed' then 4 else 0 end;

  v_rank_new := case new.event_type
    when 'email.sent' then 1
    when 'email.delivery_delayed' then 2
    when 'email.delivered' then 3
    when 'email.failed' then 4
    when 'email.bounced' then 4
    when 'email.complained' then 5
    else -1 end;

  update public.email_log set
    state = case when v_rank_new > v_rank_cur then
        (case new.event_type
          when 'email.sent' then 'sent'
          when 'email.delivery_delayed' then 'delayed'
          when 'email.delivered' then 'delivered'
          when 'email.bounced' then 'bounced'
          when 'email.complained' then 'complained'
          when 'email.failed' then 'failed'
          else state end)::email_status
      else state end,
    sent_at       = case when new.event_type = 'email.sent'       then coalesce(sent_at, new.occurred_at) else sent_at end,
    delivered_at  = case when new.event_type = 'email.delivered'  then coalesce(delivered_at, new.occurred_at) else delivered_at end,
    bounced_at    = case when new.event_type = 'email.bounced'    then coalesce(bounced_at, new.occurred_at) else bounced_at end,
    complained_at = case when new.event_type = 'email.complained' then coalesce(complained_at, new.occurred_at) else complained_at end,
    opened_at     = case when new.event_type = 'email.opened'     then coalesce(opened_at, new.occurred_at) else opened_at end,
    clicked_at    = case when new.event_type = 'email.clicked'    then coalesce(clicked_at, new.occurred_at) else clicked_at end,
    open_count    = open_count  + case when new.event_type = 'email.opened'  then 1 else 0 end,
    click_count   = click_count + case when new.event_type = 'email.clicked' then 1 else 0 end,
    bounce_type   = case when new.event_type = 'email.bounced'
                         then coalesce(new.payload #>> '{data,bounce,type}', bounce_type) else bounce_type end,
    error         = case when new.event_type in ('email.bounced','email.failed')
                         then coalesce(new.payload #>> '{data,bounce,message}', error) else error end,
    last_event_at = greatest(coalesce(last_event_at, new.occurred_at), new.occurred_at)
  where id = new.email_log_id;

  -- Hard bounces and complaints suppress the address permanently.
  if new.event_type = 'email.complained'
     or (new.event_type = 'email.bounced'
         and coalesce(new.payload #>> '{data,bounce,type}', '') ilike '%hard%') then
    insert into public.email_suppressions (email, reason, detail)
    values (
      new.recipient,
      case when new.event_type = 'email.complained' then 'complaint' else 'hard_bounce' end,
      new.payload #>> '{data,bounce,message}'
    )
    on conflict (email) do nothing;
  end if;

  return new;
end $$;

drop trigger if exists trg_apply_email_event on public.email_events;
create trigger trg_apply_email_event
  after insert on public.email_events
  for each row execute function public.apply_email_event();

-- -----------------------------------------------------------------------------
-- Daily volume — Resend's free tier allows 100/day and this is the tightest
-- constraint on the whole platform (docs Part 6 §10).
-- -----------------------------------------------------------------------------
create or replace function public.email_quota_today()
returns table (sent_today int, daily_cap int, pct_used numeric)
language sql stable security definer set search_path = public
as $$
  select
    count(*)::int,
    100,
    round(count(*)::numeric / 100 * 100, 1)
  from public.email_log
  where created_at >= date_trunc('day', now() at time zone 'Asia/Kolkata');
$$;

-- -----------------------------------------------------------------------------
-- RLS — delivery data is staff-only; a student sees only their own.
-- -----------------------------------------------------------------------------
alter table public.email_events      enable row level security;
alter table public.email_suppressions enable row level security;

create policy "email_events: staff read" on public.email_events
  for select using (public.is_staff());

create policy "suppressions: staff read" on public.email_suppressions
  for select using (public.is_staff());

create policy "suppressions: admin releases" on public.email_suppressions
  for update using (public.has_role('admin'));

drop policy if exists "email_log: staff read" on public.email_log;
create policy "email_log: staff read" on public.email_log
  for select using (public.is_staff());

create policy "email_log: read own" on public.email_log
  for select using (user_id = auth.uid());

-- The event stream is evidence of what we did and did not send.
revoke update, delete on public.email_events from authenticated, anon;


-- ###########################################################################
-- 20260806000200_support_hours_and_commercial_settings.sql
-- ###########################################################################

-- =============================================================================
-- 0011 · Support hours and commercial policy settings
--
-- Client decisions (2026-08-06):
--   - Course price and access duration are PER COURSE, decided after launch,
--     and must be admin-editable.
--   - Refund window has no fixed policy and must be modifiable.
--   - Support hours are 11:00–19:00 IST.
--
-- Nothing here is hardcoded in application code: all of it lives in
-- app_settings or on the course row, so the client changes it from the admin
-- console without a deployment.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Support availability. Drives the "we're open / we're closed" badge, the
-- expected-reply copy shown when a student raises a ticket, and SLA timers.
-- -----------------------------------------------------------------------------
insert into public.app_settings
  (key, name, description, category, value, default_value, value_type, validation, unit)
values
  ('support.hours_start', 'Support opens', 'Start of daily support hours, local time.',
   'Support', '"11:00"', '"11:00"', 'string', '{"pattern":"^\\\\d{2}:\\\\d{2}$"}', null),

  ('support.hours_end', 'Support closes', 'End of daily support hours, local time.',
   'Support', '"19:00"', '"19:00"', 'string', '{"pattern":"^\\\\d{2}:\\\\d{2}$"}', null),

  ('support.timezone', 'Support timezone', 'Timezone the support hours are expressed in.',
   'Support', '"Asia/Kolkata"', '"Asia/Kolkata"', 'string', '{}', null),

  -- ASSUMPTION: Monday–Saturday. The client gave hours but not days; this is
  -- the common pattern for Indian coaching. Change it here if Sunday is staffed.
  ('support.working_days', 'Support working days', 'ISO weekdays support is staffed (1=Mon … 7=Sun).',
   'Support', '[1,2,3,4,5,6]', '[1,2,3,4,5,6]', 'json', '{}', null),

  ('support.sla_response_hours', 'First-response target',
   'Target hours to first reply, counted only during support hours.',
   'Support', '4', '4', 'integer', '{"min":1,"max":72}', 'hours'),

  ('support.out_of_hours_message', 'Out-of-hours message',
   'Shown when a student opens a ticket outside support hours.',
   'Support', '"We''re offline right now. Support is available 11:00–19:00 IST and we''ll reply when we reopen."',
   '"We''re offline right now. Support is available 11:00–19:00 IST and we''ll reply when we reopen."',
   'text', '{"maxLength":280}', null)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- Refunds: no fixed policy, fully modifiable.
--
-- 0 disables self-serve refund requests entirely (every request goes to an
-- admin), which is the safe default until the client sets a real policy.
-- -----------------------------------------------------------------------------
update public.app_settings
set
  description = 'Days after purchase a student may request a refund. 0 = no self-serve window; every request is reviewed by an admin.',
  value = '0',
  default_value = '0',
  validation = '{"min":0,"max":365}'
where key = 'payments.refund_window_days';

insert into public.app_settings
  (key, name, description, category, value, default_value, value_type, validation, unit)
values
  ('payments.refund_policy_text', 'Refund policy text',
   'Shown at checkout and on the refund request screen. Must match the published terms.',
   'Payments',
   '"Refunds are considered case by case. Contact support to raise a request."',
   '"Refunds are considered case by case. Contact support to raise a request."',
   'text', '{"maxLength":600}', null),

  -- Defaults applied to a NEW course only. Each course keeps its own price and
  -- duration on the courses row, so changing these never rewrites history.
  ('courses.default_price_inr', 'Default course price',
   'Pre-filled when creating a course. Per-course price always wins.',
   'Courses', '0', '0', 'integer', '{"min":0,"max":1000000}', '₹'),

  ('courses.default_access_days', 'Default access duration',
   'Pre-filled when creating a course. Leave empty on the course for lifetime access.',
   'Courses', '365', '365', 'integer', '{"min":1,"max":3650}', 'days')
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- Is support open right now? Used by the UI and by SLA calculation.
-- -----------------------------------------------------------------------------
create or replace function public.support_is_open(p_at timestamptz default now())
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v_tz    text;
  v_start time;
  v_end   time;
  v_days  jsonb;
  v_local timestamp;
begin
  select (value #>> '{}') into v_tz    from public.app_settings where key = 'support.timezone';
  select (value #>> '{}')::time into v_start from public.app_settings where key = 'support.hours_start';
  select (value #>> '{}')::time into v_end   from public.app_settings where key = 'support.hours_end';
  select value into v_days from public.app_settings where key = 'support.working_days';

  v_tz := coalesce(v_tz, 'Asia/Kolkata');
  v_local := p_at at time zone v_tz;

  if v_days is not null
     and not (v_days @> to_jsonb(extract(isodow from v_local)::int)) then
    return false;
  end if;

  return v_local::time between coalesce(v_start, '11:00') and coalesce(v_end, '19:00');
end $$;

comment on function public.support_is_open is
  'True when the current moment falls inside configured support hours and working days.';


-- ###########################################################################
-- 20260806000300_no_refund_policy.sql
-- ###########################################################################

-- =============================================================================
-- 0012 · No-refund policy
--
-- Client decision (2026-08-06): all sales are final. No refund window.
--
-- What this changes:
--   - Students can never self-serve a refund. The UI does not offer one.
--   - Checkout and the terms page state the policy from one setting.
--
-- What it deliberately does NOT change:
--   - Admins keep the ability to issue a refund. A "no refunds" policy is a
--     commercial stance, not a technical one — duplicate charges, failed
--     access after payment, and card chargebacks all still happen, and you
--     need the ability to return money in those cases. Removing the tool
--     would not remove the situations; it would just force you to handle
--     them manually in the Razorpay dashboard with no audit trail here.
--   - refunds/payments stay append-only, so any exception is recorded.
-- =============================================================================

update public.app_settings
set
  value         = '0',
  default_value = '0',
  description   = 'Days after purchase a student may self-serve a refund. 0 = never; all sales are final. Admins can still issue an exceptional refund for duplicate charges or failed access.',
  is_protected  = true
where key = 'payments.refund_window_days';

update public.app_settings
set
  value = '"All sales are final. Course fees are non-refundable once payment is complete, as access to course material is granted immediately. If you were charged twice or cannot access what you paid for, contact support and we will put it right."',
  default_value = '"All sales are final. Course fees are non-refundable once payment is complete, as access to course material is granted immediately. If you were charged twice or cannot access what you paid for, contact support and we will put it right."',
  description = 'Shown at checkout, on the terms page and on any refund enquiry. Must match the published policy page that Razorpay requires.'
where key = 'payments.refund_policy_text';

-- Explicit flag so the UI never has to infer intent from a number.
insert into public.feature_flags
  (key, name, description, category, enabled, default_enabled, is_protected, is_kill_switch)
values
  ('payments.self_serve_refund', 'Self-serve refunds',
   'Lets students request a refund themselves. OFF — all sales are final.',
   'Payments', false, false, true, false),

  ('payments.admin_refund', 'Admin refunds',
   'Lets an admin issue an exceptional refund (duplicate charge, failed access, chargeback avoidance). Kept ON despite the no-refund policy, because those situations occur regardless of policy.',
   'Payments', true, true, true, false)
on conflict (key) do nothing;

-- Require a reason on every refund, so an exception to a no-refund policy is
-- never anonymous. Enforced here rather than in the UI, which can be bypassed.
alter table public.refunds
  add constraint refunds_reason_required
  check (reason is not null and length(btrim(reason)) >= 10)
  not valid;

commit;

-- Confirmation: this should report 51 tables, all with RLS enabled.
select count(*) || ' tables created, ' ||
       count(*) filter (where c.relrowsecurity) || ' with security enabled' as result
  from pg_tables t
  join pg_class c on c.relname = t.tablename and c.relnamespace = 'public'::regnamespace
 where t.schemaname = 'public';
