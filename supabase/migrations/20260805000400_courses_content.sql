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

drop trigger if exists trg_courses_updated on public.courses;
create trigger trg_courses_updated before update on public.courses
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_lessons_updated on public.lessons;
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

drop policy if exists "courses: published are public" on public.courses;
create policy "courses: published are public" on public.courses
  for select using (status = 'published' and deleted_at is null);
drop policy if exists "courses: creator sees own" on public.courses;
create policy "courses: creator sees own" on public.courses
  for select using (created_by = auth.uid());
drop policy if exists "courses: staff see all" on public.courses;
create policy "courses: staff see all" on public.courses
  for select using (public.is_staff());
drop policy if exists "courses: educator manages own" on public.courses;
create policy "courses: educator manages own" on public.courses
  for all using (created_by = auth.uid() and public.has_role('educator'))
  with check (created_by = auth.uid());
drop policy if exists "courses: admin manages all" on public.courses;
create policy "courses: admin manages all" on public.courses
  for all using (public.has_role('admin')) with check (public.has_role('admin'));

drop policy if exists "modules: follow course visibility" on public.course_modules;
create policy "modules: follow course visibility" on public.course_modules
  for select using (
    exists (select 1 from public.courses c where c.id = course_id
            and (c.status = 'published' or c.created_by = auth.uid() or public.is_staff()))
  );
drop policy if exists "modules: educator manages own" on public.course_modules;
create policy "modules: educator manages own" on public.course_modules
  for all using (exists (select 1 from public.courses c where c.id = course_id and c.created_by = auth.uid()));

drop policy if exists "batches: readable when signed in" on public.batches;
create policy "batches: readable when signed in" on public.batches
  for select using (auth.uid() is not null);

-- A lesson is readable only as a free preview, or with an active enrolment.
drop policy if exists "lessons: read when preview, enrolled, owner or staff" on public.lessons;
create policy "lessons: read when preview, enrolled, owner or staff" on public.lessons
  for select using (
    deleted_at is null and (
         is_preview
      or public.is_enrolled(course_id)
      or public.is_staff()
      or exists (select 1 from public.courses c where c.id = course_id and c.created_by = auth.uid())
    )
  );
drop policy if exists "lessons: educator manages own" on public.lessons;
create policy "lessons: educator manages own" on public.lessons
  for all using (exists (select 1 from public.courses c where c.id = course_id and c.created_by = auth.uid()));

drop policy if exists "enrollments: read own or staff" on public.enrollments;
create policy "enrollments: read own or staff" on public.enrollments
  for select using (user_id = auth.uid() or public.is_staff());

-- CRITICAL: no INSERT policy for students. Without this a student could insert
-- their own enrolment row and unlock every paid course for free. Enrolments are
-- written only by the payment webhook using the service role.
drop policy if exists "enrollments: staff only writes" on public.enrollments;
create policy "enrollments: staff only writes" on public.enrollments
  for insert with check (public.is_staff());
drop policy if exists "enrollments: staff updates" on public.enrollments;
create policy "enrollments: staff updates" on public.enrollments
  for update using (public.is_staff());

drop policy if exists "progress: own only" on public.lesson_progress;
create policy "progress: own only" on public.lesson_progress
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "mirrors: staff and owners" on public.drive_file_mirrors;
create policy "mirrors: staff and owners" on public.drive_file_mirrors
  for select using (public.is_staff() or exists (
    select 1 from public.lessons l join public.courses c on c.id = l.course_id
    where l.id = lesson_id and c.created_by = auth.uid()));

drop policy if exists "resources: free or enrolled" on public.resources;
create policy "resources: free or enrolled" on public.resources
  for select using (
    is_free or public.is_enrolled(course_id) or public.is_staff()
    or exists (select 1 from public.courses c where c.id = course_id and c.created_by = auth.uid())
  );
drop policy if exists "resources: educator manages own" on public.resources;
create policy "resources: educator manages own" on public.resources
  for all using (exists (select 1 from public.courses c where c.id = course_id and c.created_by = auth.uid()));

drop policy if exists "downloads: read own or staff" on public.resource_downloads;
create policy "downloads: read own or staff" on public.resource_downloads
  for select using (user_id = auth.uid() or public.is_staff());
