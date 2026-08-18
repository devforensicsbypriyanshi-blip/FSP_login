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

drop trigger if exists trg_profiles_updated on public.profiles;
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

drop policy if exists "profiles: read own or staff" on public.profiles;
create policy "profiles: read own or staff" on public.profiles
  for select using (id = auth.uid() or public.is_staff());

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "profiles: admin manages all" on public.profiles;
create policy "profiles: admin manages all" on public.profiles
  for all using (public.has_role('admin')) with check (public.has_role('admin'));

drop policy if exists "roles: readable when signed in" on public.roles;
create policy "roles: readable when signed in" on public.roles
  for select using (auth.uid() is not null);

drop policy if exists "permissions: readable when signed in" on public.permissions;
create policy "permissions: readable when signed in" on public.permissions
  for select using (auth.uid() is not null);

drop policy if exists "role_permissions: readable when signed in" on public.role_permissions;
create policy "role_permissions: readable when signed in" on public.role_permissions
  for select using (auth.uid() is not null);

drop policy if exists "user_roles: read own or staff" on public.user_roles;
create policy "user_roles: read own or staff" on public.user_roles
  for select using (user_id = auth.uid() or public.is_staff());

drop policy if exists "user_roles: admin grants" on public.user_roles;
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
