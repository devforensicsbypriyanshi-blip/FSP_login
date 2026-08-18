-- =============================================================================
-- FSP SCHEMA — PART 4 of 5: Payments, doubts, quizzes, mentorship, support, storage, cron
--
-- RUN THIS AFTER PART 3. Order matters — later parts reference earlier tables.
--
-- Paste the whole file into Supabase -> SQL Editor and press Run.
-- Safe to re-run if you are unsure whether it completed.
--
-- Contains:
--   20260805000700_payments_engagement_support.sql
--   20260805000800_storage_and_cron.sql
-- =============================================================================

begin;


-- ---------------------------------------------------------------------------
-- 20260805000700_payments_engagement_support.sql
-- ---------------------------------------------------------------------------

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


-- ---------------------------------------------------------------------------
-- 20260805000800_storage_and_cron.sql
-- ---------------------------------------------------------------------------

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

commit;

-- Part 4 complete. Now run part 5.
select 'PART 4 OK — ' || count(*) || ' tables so far' as result
  from pg_tables where schemaname = 'public';
