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

drop policy if exists "flags: readable when signed in" on public.feature_flags;
create policy "flags: readable when signed in" on public.feature_flags
  for select using (auth.uid() is not null);

drop policy if exists "flags: write by role" on public.feature_flags;
create policy "flags: write by role" on public.feature_flags
  for update using (
    case
      when is_kill_switch then public.has_role('admin')
      when is_protected   then public.has_role('admin')
      else public.has_role('developer') or public.has_role('admin')
    end
  );

drop policy if exists "settings: readable when signed in" on public.app_settings;
create policy "settings: readable when signed in" on public.app_settings
  for select using (auth.uid() is not null and not is_secret);

drop policy if exists "settings: staff read secrets" on public.app_settings;
create policy "settings: staff read secrets" on public.app_settings
  for select using (public.is_staff());

drop policy if exists "settings: write by role" on public.app_settings;
create policy "settings: write by role" on public.app_settings
  for update using (
    case when is_protected then public.has_role('admin')
         else public.has_role('developer') or public.has_role('admin') end
  );

drop policy if exists "config_history: staff read" on public.config_history;
create policy "config_history: staff read" on public.config_history
  for select using (public.is_staff());

drop policy if exists "config_version: readable when signed in" on public.config_version;
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
