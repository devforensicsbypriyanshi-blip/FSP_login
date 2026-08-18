# FSP Platform — Part 2: Database & Storage Schema

Postgres (Supabase) · Row Level Security · indexes · triggers · scheduled jobs

Design rules applied throughout:
1. **RLS on every table. No exceptions.** A table without a policy is a table nobody can read — that is the correct default.
2. **`auth.uid()` is the only identity.** Never trust a client-supplied `user_id`.
3. **Money and audit rows are append-only.** Corrections are new rows, never `UPDATE`.
4. **`timestamptz` everywhere.** Never `timestamp`. Render in IST at the edge.
5. **Soft-delete via `deleted_at`** on user-visible content; hard delete only for GDPR/DPDP erasure.
6. **Helper functions are `SECURITY DEFINER` + `set search_path`** — otherwise they are a privilege-escalation hole.

---

## 1. Extensions, enums, helpers

```sql
create extension if not exists "pgcrypto";
create extension if not exists "pg_cron";
create extension if not exists "pg_net";
create extension if not exists "pg_trgm";      -- fuzzy search
create extension if not exists "btree_gist";   -- slot overlap exclusion

create type app_role        as enum ('student','educator','admin','support','developer');
create type course_status   as enum ('draft','pending_review','published','archived');
create type lesson_kind     as enum ('video','pdf','quiz','live','text');
create type enrollment_state as enum ('active','expired','refunded','suspended');
create type live_provider   as enum ('meet','youtube','livekit');
create type live_status     as enum ('scheduled','live','ended','cancelled');
create type order_status    as enum ('created','pending','paid','failed','refunded','partially_refunded');
create type doubt_status    as enum ('open','answered','resolved','closed');
create type ticket_status   as enum ('open','pending','resolved','closed');
create type priority_level  as enum ('low','medium','high','urgent');
```

**Helpers used by every policy** (`stable` so the planner caches them per statement):

```sql
create or replace function public.current_role_keys()
returns app_role[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(r.key), '{}') from user_roles ur
  join roles r on r.id = ur.role_id where ur.user_id = auth.uid();
$$;

create or replace function public.has_role(p app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select p = any(public.current_role_keys());
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_role_keys() && array['admin','developer','support']::app_role[];
$$;

create or replace function public.is_enrolled(p_course uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from enrollments
    where user_id = auth.uid() and course_id = p_course
      and status = 'active' and (expires_at is null or expires_at > now())
  );
$$;

-- updated_at trigger, attached to every mutable table
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
```

---

## 2. Identity & RBAC

```sql
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text not null,
  email        citext unique not null,
  phone        text unique,
  avatar_url   text,
  bio          text,
  timezone     text not null default 'Asia/Kolkata',
  locale       text not null default 'en-IN',
  onboarded_at timestamptz,
  last_seen_at timestamptz,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table roles (
  id          smallserial primary key,
  key         app_role unique not null,
  name        text not null,
  description text
);

create table permissions (
  id  serial primary key,
  key text unique not null,      -- 'course.publish', 'payment.refund', 'user.suspend'
  description text
);

create table role_permissions (
  role_id       smallint references roles(id) on delete cascade,
  permission_id int      references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table user_roles (
  user_id    uuid     references profiles(id) on delete cascade,
  role_id    smallint references roles(id)    on delete cascade,
  granted_by uuid     references profiles(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role_id)
);
```

**Auto-provision profile + default role on signup:**

```sql
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, email, avatar_url)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          new.email,
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;

  insert into user_roles (user_id, role_id)
  select new.id, id from roles where key = 'student'
  on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();
```

**Policies:**

```sql
alter table profiles     enable row level security;
alter table user_roles   enable row level security;
alter table roles        enable row level security;
alter table permissions  enable row level security;
alter table role_permissions enable row level security;

create policy "own profile: read"   on profiles for select using (id = auth.uid() or is_staff());
create policy "own profile: update" on profiles for update using (id = auth.uid())
                                                   with check (id = auth.uid());
create policy "staff manage profiles" on profiles for all using (has_role('admin'));

create policy "read own roles"    on user_roles for select using (user_id = auth.uid() or is_staff());
create policy "admin grants roles" on user_roles for all    using (has_role('admin'));

create policy "roles readable"       on roles            for select using (auth.uid() is not null);
create policy "permissions readable" on permissions      for select using (auth.uid() is not null);
create policy "rp readable"          on role_permissions for select using (auth.uid() is not null);
```

> **Trap avoided:** role lookups live in `user_roles`, *not* in the JWT. Putting roles in JWT claims means a revoked admin keeps power until their token expires. The `stable` helpers make the extra lookup effectively free within a statement.

---

## 3. Courses & content

```sql
create table courses (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  title         text not null,
  subtitle      text,
  description   text,
  category      text,
  tags          text[] default '{}',
  banner_public_id text,                    -- Cloudinary
  preview_drive_id text,
  price_inr     integer not null default 0 check (price_inr >= 0),
  mrp_inr       integer check (mrp_inr >= price_inr),
  is_free       boolean generated always as (price_inr = 0) stored,
  access_days   integer,                    -- null = lifetime
  status        course_status not null default 'draft',
  created_by    uuid references profiles(id),
  approved_by   uuid references profiles(id),
  approved_at   timestamptz,
  published_at  timestamptz,
  student_count integer not null default 0, -- denormalised, trigger-maintained
  rating_avg    numeric(3,2),
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table course_modules (
  id        uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  title     text not null,
  position  integer not null,
  unique (course_id, position) deferrable initially deferred
);

create table lessons (
  id            uuid primary key default gen_random_uuid(),
  module_id     uuid not null references course_modules(id) on delete cascade,
  course_id     uuid not null references courses(id) on delete cascade,  -- denormalised for RLS speed
  title         text not null,
  description   text,
  kind          lesson_kind not null default 'video',
  drive_file_id text,                       -- ID only, never the pasted URL
  drive_kind    text,                       -- 'file' | 'folder' | 'doc'
  banner_public_id text,                    -- Cloudinary, derived from Drive thumbnail
  duration_sec  integer,                    -- educator-entered in v1
  position      integer not null,
  is_preview    boolean not null default false,   -- viewable without enrolment
  published_at  timestamptz,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint drive_required_for_media
    check (kind not in ('video','pdf') or drive_file_id is not null)
);

create table batches (
  id        uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  name      text not null,
  starts_on date,
  ends_on   date,
  capacity  integer,
  is_active boolean not null default true
);

create table enrollments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  course_id  uuid not null references courses(id) on delete cascade,
  batch_id   uuid references batches(id),
  order_id   uuid,
  status     enrollment_state not null default 'active',
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (user_id, course_id)
);

create table lesson_progress (
  user_id      uuid not null references profiles(id) on delete cascade,
  lesson_id    uuid not null references lessons(id) on delete cascade,
  course_id    uuid not null references courses(id) on delete cascade,
  status       text not null default 'opened' check (status in ('opened','completed')),
  opened_at    timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, lesson_id)
);

-- backup Drive IDs for files that hit the daily view quota (Part 1 §6.1)
create table drive_file_mirrors (
  id            uuid primary key default gen_random_uuid(),
  lesson_id     uuid references lessons(id) on delete cascade,
  drive_file_id text not null,
  account_label text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
```

**Policies — the heart of content access:**

```sql
alter table courses enable row level security;
alter table lessons enable row level security;
alter table enrollments enable row level security;
alter table lesson_progress enable row level security;

create policy "published courses are public" on courses for select
  using (status = 'published' and deleted_at is null);
create policy "creator sees own courses"     on courses for select using (created_by = auth.uid());
create policy "staff see all courses"        on courses for select using (is_staff());
create policy "educator manages own course"  on courses for all
  using (created_by = auth.uid() and has_role('educator'))
  with check (created_by = auth.uid());
create policy "admin manages all courses"    on courses for all using (has_role('admin'));

-- a student may read a lesson only if it is a free preview or they are enrolled
create policy "lesson read" on lessons for select using (
  deleted_at is null and (
       is_preview
    or is_enrolled(course_id)
    or is_staff()
    or exists (select 1 from courses c where c.id = lessons.course_id and c.created_by = auth.uid())
  )
);

create policy "own enrollments"  on enrollments for select using (user_id = auth.uid() or is_staff());
create policy "no self-enrol"    on enrollments for insert with check (is_staff());  -- service role only
create policy "own progress"     on lesson_progress for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

> **`no self-enrol` matters.** Without it a student could `INSERT` their own enrolment row and unlock every paid course for free. Enrolments are written only by the webhook handler using the service role.

---

## 4. Live classes & calendar

```sql
create table live_sessions (
  id              uuid primary key default gen_random_uuid(),
  course_id       uuid not null references courses(id) on delete cascade,
  batch_id        uuid references batches(id),
  educator_id     uuid not null references profiles(id),
  title           text not null,
  description     text,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  provider        live_provider not null default 'meet',
  join_url        text,                    -- column-level revoked from students
  material_drive_id text,
  banner_public_id  text,
  recording_drive_id text,
  recording_url   text,
  status          live_status not null default 'scheduled',
  max_attendees   integer,
  actual_peak     integer default 0,
  reminder_24h_sent_at timestamptz,
  reminder_15m_sent_at timestamptz,
  cancelled_reason text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint sane_window check (ends_at > starts_at)
);

create table session_attendance (
  session_id   uuid not null references live_sessions(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  joined_at    timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  duration_sec integer generated always as
    (greatest(0, extract(epoch from (last_seen_at - joined_at))::int)) stored,
  primary key (session_id, user_id)
);

create table live_chat_messages (
  id         bigserial primary key,
  session_id uuid not null references live_sessions(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  body       text not null check (length(body) between 1 and 500),
  is_pinned  boolean not null default false,
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now()
);
```

**Column-level protection + the gated RPC** (full function body in Part 1 §6.3):

```sql
alter table live_sessions enable row level security;
revoke select (join_url) on live_sessions from authenticated, anon;

create policy "enrolled see sessions" on live_sessions for select
  using (is_enrolled(course_id) or educator_id = auth.uid() or is_staff());
create policy "educator manages own sessions" on live_sessions for all
  using (educator_id = auth.uid() and has_role('educator'))
  with check (educator_id = auth.uid());

alter table live_chat_messages enable row level security;
create policy "read chat if enrolled" on live_chat_messages for select using (
  not is_hidden and exists (
    select 1 from live_sessions s
    where s.id = session_id and (is_enrolled(s.course_id) or s.educator_id = auth.uid() or is_staff())
  )
);
create policy "post own chat" on live_chat_messages for insert with check (
  user_id = auth.uid() and exists (
    select 1 from live_sessions s
    where s.id = session_id and s.status = 'live' and is_enrolled(s.course_id)
  )
);
create policy "educator moderates" on live_chat_messages for update using (
  exists (select 1 from live_sessions s where s.id = session_id
          and (s.educator_id = auth.uid() or is_staff()))
);
```

**Calendar query** — the single index that makes the month view fast:

```sql
create index idx_sessions_calendar on live_sessions (course_id, starts_at)
  where status <> 'cancelled';

-- month fetch for one student
select s.* from live_sessions s
join enrollments e
  on e.course_id = s.course_id and e.user_id = auth.uid() and e.status = 'active'
where s.starts_at >= $1 and s.starts_at < $2 and s.status <> 'cancelled'
order by s.starts_at;
```

**Auto status transitions** (`pg_cron`, every minute):

```sql
select cron.schedule('live-status', '* * * * *', $$
  update live_sessions set status = 'live'
    where status = 'scheduled' and now() between starts_at and ends_at;
  update live_sessions set status = 'ended'
    where status = 'live' and now() > ends_at;
$$);
```

---

## 5. Notes, DPPs & the store

```sql
create table resources (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid references courses(id) on delete cascade,
  title         text not null,
  kind          text not null check (kind in ('note','dpp','paper','solution','syllabus')),
  storage_path  text,                     -- private Supabase bucket
  drive_file_id text,                     -- or Drive-hosted
  size_bytes    bigint,
  page_count    integer,
  is_free       boolean not null default false,
  published_at  timestamptz,
  download_count integer not null default 0,
  created_at    timestamptz not null default now(),
  constraint one_source check (num_nonnulls(storage_path, drive_file_id) = 1)
);

create table resource_downloads (        -- audit: who took what, when
  id          bigserial primary key,
  resource_id uuid not null references resources(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  ip          inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create table products (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  title       text not null,
  description text,
  kind        text not null check (kind in ('digital','physical')),
  price_inr   integer not null check (price_inr >= 0),
  mrp_inr     integer,
  image_public_id text,
  stock       integer,
  weight_g    integer,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
```

---

## 6. Payments

```sql
create table coupons (
  id          uuid primary key default gen_random_uuid(),
  code        citext unique not null,
  kind        text not null check (kind in ('percent','flat')),
  value       integer not null check (value > 0),
  max_discount_inr integer,
  min_amount_inr   integer default 0,
  max_uses    integer,
  per_user_limit integer default 1,
  used_count  integer not null default 0,
  valid_from  timestamptz not null default now(),
  valid_to    timestamptz,
  is_active   boolean not null default true,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  constraint percent_range check (kind <> 'percent' or value between 1 and 100)
);

create table orders (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(id),
  subtotal_inr     integer not null,
  discount_inr     integer not null default 0,
  tax_inr          integer not null default 0,
  total_inr        integer not null check (total_inr >= 0),
  currency         char(3) not null default 'INR',
  coupon_id        uuid references coupons(id),
  status           order_status not null default 'created',
  gateway          text not null default 'razorpay',
  gateway_order_id text unique,
  shipping_address jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references orders(id) on delete cascade,
  item_type  text not null check (item_type in ('course','product','mentorship')),
  item_id    uuid not null,
  title_snapshot text not null,          -- price/title frozen at purchase time
  unit_price_inr integer not null,
  quantity   integer not null default 1 check (quantity > 0)
);

create table payments (                   -- append-only
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references orders(id),
  gateway_payment_id text unique not null,
  amount_inr         integer not null,
  method             text,
  status             text not null,
  captured_at        timestamptz,
  raw                jsonb not null,
  created_at         timestamptz not null default now()
);

create table refunds (                    -- append-only
  id                uuid primary key default gen_random_uuid(),
  payment_id        uuid not null references payments(id),
  gateway_refund_id text unique,
  amount_inr        integer not null,
  reason            text,
  initiated_by      uuid references profiles(id),
  status            text not null default 'pending',
  created_at        timestamptz not null default now()
);

-- idempotency gate for every inbound webhook
create table webhook_events (
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
```

```sql
alter table orders   enable row level security;
alter table payments enable row level security;
alter table refunds  enable row level security;
create policy "own orders"   on orders   for select using (user_id = auth.uid() or is_staff());
create policy "own payments" on payments for select using (
  exists (select 1 from orders o where o.id = order_id and (o.user_id = auth.uid() or is_staff())));
create policy "staff refunds" on refunds for select using (is_staff());
-- no INSERT/UPDATE policies at all: writes happen only via service role
```

---

## 7. Doubts, quizzes, mentorship

```sql
create table doubts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  course_id  uuid references courses(id) on delete set null,
  subject    text,
  title      text,
  body       text not null check (length(body) between 10 and 5000),
  attachments jsonb default '[]',
  status     doubt_status not null default 'open',
  upvotes    integer not null default 0,
  is_anonymous boolean not null default false,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  search_tsv tsvector generated always as
    (to_tsvector('english', coalesce(title,'') || ' ' || body)) stored
);
create index idx_doubts_search on doubts using gin (search_tsv);

create table doubt_answers (
  id         uuid primary key default gen_random_uuid(),
  doubt_id   uuid not null references doubts(id) on delete cascade,
  user_id    uuid not null references profiles(id),
  body       text not null,
  attachments jsonb default '[]',
  is_educator_verified boolean not null default false,
  is_accepted boolean not null default false,
  upvotes    integer not null default 0,
  created_at timestamptz not null default now()
);

create table doubt_votes (
  doubt_id uuid references doubts(id) on delete cascade,
  user_id  uuid references profiles(id) on delete cascade,
  primary key (doubt_id, user_id)          -- one vote per user, enforced by the PK
);

create table quizzes (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid references courses(id) on delete cascade,
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
  created_by    uuid references profiles(id)
);

create table quiz_questions (
  id       uuid primary key default gen_random_uuid(),
  quiz_id  uuid not null references quizzes(id) on delete cascade,
  body     text not null,
  image_public_id text,
  explanation text,
  marks    numeric(4,2) not null default 1,
  negative numeric(4,2) not null default 0,
  position integer not null
);

create table quiz_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references quiz_questions(id) on delete cascade,
  body        text not null,
  is_correct  boolean not null default false,   -- never sent to the client
  position    integer not null
);

create table quiz_attempts (
  id           uuid primary key default gen_random_uuid(),
  quiz_id      uuid not null references quizzes(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  started_at   timestamptz not null default now(),
  submitted_at timestamptz,
  expires_at   timestamptz not null,            -- server-authoritative timer
  score        numeric(6,2),
  correct_count integer, wrong_count integer, skipped_count integer,
  rank         integer,
  unique (quiz_id, user_id, started_at)
);

create table quiz_responses (
  attempt_id  uuid not null references quiz_attempts(id) on delete cascade,
  question_id uuid not null references quiz_questions(id) on delete cascade,
  option_id   uuid references quiz_options(id),
  marks_awarded numeric(4,2),
  answered_at timestamptz not null default now(),
  primary key (attempt_id, question_id)
);

create table mentorship_slots (
  id          uuid primary key default gen_random_uuid(),
  educator_id uuid not null references profiles(id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  price_inr   integer not null default 0,
  is_booked   boolean not null default false,
  -- database-level guarantee of no double-booking
  exclude using gist (
    educator_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (is_booked)
);

create table mentorship_bookings (
  id       uuid primary key default gen_random_uuid(),
  slot_id  uuid not null unique references mentorship_slots(id),
  user_id  uuid not null references profiles(id),
  order_id uuid references orders(id),
  topic    text, notes text,
  meet_url text,
  status   text not null default 'confirmed'
             check (status in ('confirmed','completed','cancelled','no_show')),
  created_at timestamptz not null default now()
);
```

**Quiz security — two rules that must not be relaxed:**

```sql
alter table quiz_options enable row level security;
-- students can never select from quiz_options at all; the runner receives
-- questions + options through an RPC that strips is_correct.
create policy "options: authors and staff only" on quiz_options for select
  using (is_staff() or exists (
    select 1 from quiz_questions q join quizzes z on z.id = q.quiz_id
    where q.id = question_id and z.created_by = auth.uid()));
```
Scoring happens in `POST /api/quiz/:id/submit` against `quiz_attempts.expires_at` — a late submission is rejected by the **server clock**, not the browser's.

---

## 8. Notifications, announcements, support, audit

```sql
create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  type       text not null,          -- 'live.starting' | 'doubt.answered' | 'payment.success' …
  title      text not null,
  body       text,
  data       jsonb default '{}',     -- deep-link payload
  category   text,                   -- maps to your notif filter tabs
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index idx_notif_unread on notifications (user_id, created_at desc) where read_at is null;

create table notification_prefs (
  user_id uuid references profiles(id) on delete cascade,
  type    text not null,
  in_app  boolean not null default true,
  push    boolean not null default true,
  email   boolean not null default true,
  primary key (user_id, type)
);

create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  endpoint   text unique not null,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create table announcements (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid references courses(id) on delete cascade,
  batch_id     uuid references batches(id),
  title        text not null,
  body         text not null,
  audience     text not null default 'course'
                 check (audience in ('all','course','batch')),
  created_by   uuid references profiles(id),
  published_at timestamptz not null default now()
);

create table support_tickets (
  id          uuid primary key default gen_random_uuid(),
  ref         text unique not null default ('TCK-' || lpad((floor(random()*99999))::text, 5, '0')),
  user_id     uuid not null references profiles(id),
  subject     text not null,
  category    text,
  priority    priority_level not null default 'medium',
  status      ticket_status not null default 'open',
  assigned_to uuid references profiles(id),
  first_response_at timestamptz,
  resolved_at timestamptz,
  sla_due_at  timestamptz,
  created_at  timestamptz not null default now()
);

create table ticket_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references support_tickets(id) on delete cascade,
  sender_id   uuid not null references profiles(id),
  body        text not null,
  attachments jsonb default '[]',
  is_internal boolean not null default false,   -- staff-only notes
  created_at  timestamptz not null default now()
);
create policy "hide internal notes" on ticket_messages for select using (
  (not is_internal and exists (select 1 from support_tickets t
     where t.id = ticket_id and t.user_id = auth.uid()))
  or is_staff()
);

-- append-only, trigger-written; no UPDATE or DELETE policy ever
create table audit_logs (
  id          bigserial primary key,
  actor_id    uuid references profiles(id),
  actor_email text,
  action      text not null,          -- 'COURSE_PUBLISH','PAYOUT_REQUEST','USER_SUSPEND'
  entity_type text, entity_id uuid,
  before      jsonb, after jsonb,
  ip          inet, user_agent text,
  request_id  text,
  created_at  timestamptz not null default now()
);
create index idx_audit_recent on audit_logs (created_at desc);
create policy "staff read audit" on audit_logs for select using (is_staff());
revoke update, delete on audit_logs from authenticated, anon, service_role;

create table feature_flags (
  key             text primary key,
  enabled         boolean not null default false,
  rollout_percent smallint not null default 0 check (rollout_percent between 0 and 100),
  description     text,
  updated_by      uuid references profiles(id),
  updated_at      timestamptz not null default now()
);

create table email_log (
  id         uuid primary key default gen_random_uuid(),
  to_email   citext not null,
  template   text not null,
  subject    text,
  resend_id  text,
  status     text not null default 'queued',
  error      text,
  created_at timestamptz not null default now()
);
```

---

## 9. Indexes worth creating on day one

```sql
create index idx_enroll_user       on enrollments (user_id) where status = 'active';
create index idx_enroll_course     on enrollments (course_id) where status = 'active';
create index idx_lessons_course    on lessons (course_id, position) where deleted_at is null;
create index idx_courses_published on courses (published_at desc) where status = 'published';
create index idx_courses_slug_trgm on courses using gin (title gin_trgm_ops);
create index idx_progress_course   on lesson_progress (user_id, course_id);
create index idx_orders_user       on orders (user_id, created_at desc);
create index idx_doubts_course     on doubts (course_id, created_at desc) where status <> 'closed';
create index idx_tickets_open      on support_tickets (status, priority, created_at) where status in ('open','pending');
create index idx_attempts_user     on quiz_attempts (user_id, quiz_id);
```

**Admin KPI cards** (`₹12,48,900 revenue`, `6,240 students`…) must **not** run `count(*)` on every dashboard load. Use a materialised view refreshed every 15 min by `pg_cron`:

```sql
create materialized view mv_admin_kpis as
select
  (select coalesce(sum(total_inr),0) from orders
    where status='paid' and created_at >= date_trunc('month', now()))            as revenue_month_inr,
  (select count(*) from profiles where deleted_at is null)                        as total_users,
  (select count(*) from enrollments where status='active')                        as active_enrollments,
  (select count(distinct educator_id) from live_sessions
    where starts_at > now() - interval '30 days')                                 as active_educators,
  (select coalesce(count(*) filter (where status='refunded')::numeric
        / nullif(count(*),0) * 100, 0) from orders)                               as refund_rate_pct;

create unique index on mv_admin_kpis ((true));
select cron.schedule('kpi-refresh','*/15 * * * *',
  $$refresh materialized view concurrently mv_admin_kpis$$);
```

---

## 10. Scheduled jobs (`pg_cron` + `pg_net`)

Vercel Hobby crons fire **once per day**, which cannot deliver a T-15-minute reminder. These run in Postgres instead, free and minute-accurate.

```sql
-- T-15m class reminders
select cron.schedule('reminder-15m', '* * * * *', $$
  select net.http_post(
    url     := 'https://app.forensicbypriyanshi.com/api/cron/live-reminders',
    headers := jsonb_build_object('content-type','application/json',
                                  'x-cron-secret', current_setting('app.cron_secret')),
    body    := jsonb_build_object('window','15m')
  )
  where exists (
    select 1 from live_sessions
    where status = 'scheduled' and reminder_15m_sent_at is null
      and starts_at between now() and now() + interval '15 minutes');
$$);

select cron.schedule('reminder-24h','*/10 * * * *', $$ … window '24h' … $$);
select cron.schedule('live-status', '* * * * *',  $$ … §4 … $$);
select cron.schedule('kpi-refresh', '*/15 * * * *', $$refresh materialized view concurrently mv_admin_kpis$$);
select cron.schedule('expire-enrollments','0 1 * * *',
  $$update enrollments set status='expired' where status='active' and expires_at < now()$$);
select cron.schedule('nightly-backup','0 2 * * *',
  $$select net.http_post(url := '…/api/cron/backup', headers := …)$$);
select cron.schedule('keep-warm','0 */6 * * *', $$select 1$$);   -- defeats the 7-day pause (F5)
```

Store `app.cron_secret` via `alter database postgres set app.cron_secret = '…'` — never inline in the job body, since `cron.job` is readable.

---

## 11. Storage buckets

| Bucket | Public | Contents | Policy |
|---|---|---|---|
| `resources` | ❌ | Notes, DPPs, papers | Signed URL only, minted by API after enrolment check |
| `invoices` | ❌ | PDF invoices | Owner + admin |
| `ticket-attachments` | ❌ | Support uploads | Ticket participants + staff |
| `avatars` | ✅ | Fallback avatars | Owner writes to `{uid}/…` |

```sql
create policy "own avatar folder" on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "no direct resource reads" on storage.objects for select
  using (bucket_id = 'resources' and is_staff());   -- students go through the signing API
```

---

## 12. Migration discipline

- Every change is a timestamped file in `supabase/migrations/`. **No clicking in the Supabase dashboard for schema** — dashboard edits drift from git and break CI.
- `supabase db diff -f <name>` to author, `supabase db push` in CI to apply.
- Regenerate types on every merge: `supabase gen types typescript --linked > src/types/database.ts`.
- Every migration adding a table must, in the same file: `enable row level security`, add at least one policy, and add a pgTAP test. CI fails on an RLS-less table (Part 3 §6).
