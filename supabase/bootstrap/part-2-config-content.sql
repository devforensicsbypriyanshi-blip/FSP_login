-- =============================================================================
-- FSP SCHEMA — PART 2 of 5: Feature flags, settings, courses, lessons, enrolments
--
-- RUN THIS AFTER PART 1. Order matters — later parts reference earlier tables.
--
-- Paste the whole file into Supabase -> SQL Editor and press Run.
-- Safe to re-run if you are unsure whether it completed.
--
-- Contains:
--   20260805000300_platform_config.sql
--   20260805000400_courses_content.sql
-- =============================================================================

begin;


-- ---------------------------------------------------------------------------
-- 20260805000300_platform_config.sql
-- ---------------------------------------------------------------------------

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


-- ---------------------------------------------------------------------------
-- 20260805000400_courses_content.sql
-- ---------------------------------------------------------------------------

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

commit;

-- Part 2 complete. Now run part 3.
select 'PART 2 OK — ' || count(*) || ' tables so far' as result
  from pg_tables where schemaname = 'public';
