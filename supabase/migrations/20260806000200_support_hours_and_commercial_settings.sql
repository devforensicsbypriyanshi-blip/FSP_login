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
