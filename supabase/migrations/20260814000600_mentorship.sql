-- =============================================================================
-- 0031 · Mentorship booking
--
-- The tables have existed since 0007, including a GiST exclusion constraint
-- that makes overlapping confirmed slots for one educator impossible at the
-- storage layer. What was missing was every path between them.
--
-- The hard part of booking is not the form. It is that two students tapping the
-- same slot within the same second must produce one booking and one clear
-- refusal — never two bookings, and never a slot silently held by nobody.
--
-- Two mechanisms:
--
--   * The claim is a single guarded UPDATE. `where id = ? and is_booked = false`
--     either affects one row or zero, and Postgres serialises the two writers.
--     Reading first and then writing would leave a window between them; there
--     is no window here.
--
--   * A paid slot is HELD, not booked, until payment lands. The hold expires,
--     and expired holds are released lazily by the two functions that are the
--     only way to see or take a slot. Nothing can observe a stale hold without
--     first clearing it, so this needs no cron and cannot drift.
-- =============================================================================

alter table public.mentorship_slots
  add column if not exists reserved_until timestamptz,
  add column if not exists topic_hint     text;

alter table public.mentorship_bookings
  add column if not exists price_inr integer not null default 0;

-- 'pending_payment' did not exist: every booking was born confirmed, which is
-- only true when the slot is free.
alter table public.mentorship_bookings drop constraint if exists mentorship_bookings_status_check;
alter table public.mentorship_bookings
  add constraint mentorship_bookings_status_check
  check (status in ('pending_payment', 'confirmed', 'completed', 'cancelled', 'no_show'));

create index if not exists idx_slots_open
  on public.mentorship_slots (educator_id, starts_at)
  where not is_booked;

-- -----------------------------------------------------------------------------
-- Release holds that were never paid for.
--
-- Called at the top of the two functions that read or take a slot, which are
-- the only ways to reach one. A hold cannot be observed without this running
-- first, so an abandoned checkout frees the slot for the next student without a
-- scheduled job to forget about.
-- -----------------------------------------------------------------------------
create or replace function public.release_expired_slot_holds()
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_count int;
begin
  with expired as (
    select s.id, b.id as booking_id
      from public.mentorship_slots s
      join public.mentorship_bookings b on b.slot_id = s.id
     where s.is_booked
       and s.reserved_until is not null
       and s.reserved_until < now()
       and b.status = 'pending_payment'
  ),
  cancelled as (
    update public.mentorship_bookings
       set status = 'cancelled'
     where id in (select booking_id from expired)
    returning slot_id
  )
  update public.mentorship_slots
     set is_booked = false, reserved_until = null
   where id in (select slot_id from cancelled);

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- -----------------------------------------------------------------------------
-- Who is available to book.
--
-- Only educators with at least one open slot in the window. A mentor list that
-- includes people with no availability is a list of dead ends.
-- -----------------------------------------------------------------------------
create or replace function public.get_mentors()
returns table (
  educator_id uuid,
  full_name   text,
  avatar_url  text,
  headline    text,
  open_slots  integer,
  from_price  integer,
  next_slot   timestamptz
)
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  perform public.release_expired_slot_holds();

  return query
  select p.id,
         p.full_name,
         p.avatar_url,
         p.bio,
         count(s.id)::int,
         min(s.price_inr)::int,
         min(s.starts_at)
    from public.mentorship_slots s
    join public.profiles p on p.id = s.educator_id
   where not s.is_booked
     and s.starts_at > now() + interval '1 hour'
   group by p.id, p.full_name, p.avatar_url, p.bio
   order by min(s.starts_at);
end $$;

-- -----------------------------------------------------------------------------
-- Open slots, optionally for one mentor.
--
-- The one-hour floor is deliberate. A slot starting in four minutes is
-- technically bookable and practically useless — neither person will be ready,
-- and the no-show lands on the educator's record.
-- -----------------------------------------------------------------------------
create or replace function public.get_open_slots(p_educator uuid default null, p_days integer default 21)
returns table (
  slot_id     uuid,
  educator_id uuid,
  educator    text,
  starts_at   timestamptz,
  ends_at     timestamptz,
  price_inr   integer,
  topic_hint  text
)
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  perform public.release_expired_slot_holds();

  return query
  select s.id, s.educator_id, p.full_name, s.starts_at, s.ends_at, s.price_inr, s.topic_hint
    from public.mentorship_slots s
    join public.profiles p on p.id = s.educator_id
   where not s.is_booked
     and s.starts_at > now() + interval '1 hour'
     and s.starts_at < now() + make_interval(days => greatest(1, least(coalesce(p_days, 21), 90)))
     and (p_educator is null or s.educator_id = p_educator)
   order by s.starts_at
   limit 200;
end $$;

-- -----------------------------------------------------------------------------
-- Take a slot.
--
-- Returns the booking id and, when the slot costs money, the order id the
-- caller must take to checkout. A free slot is confirmed immediately; a paid
-- one is held for fifteen minutes.
-- -----------------------------------------------------------------------------
create or replace function public.book_slot(
  p_slot  uuid,
  p_topic text default null,
  p_notes text default null
)
returns table (booking_id uuid, order_id uuid, price_inr integer, hold_expires timestamptz)
language plpgsql security definer set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_slot     record;
  v_booking  uuid;
  v_order    uuid;
  v_hold     timestamptz;
  v_educator text;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  perform public.release_expired_slot_holds();

  select * into v_slot from public.mentorship_slots where id = p_slot;
  if not found then
    raise exception 'SLOT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_slot.educator_id = v_user then
    raise exception 'OWN_SLOT' using errcode = '23514';
  end if;

  if v_slot.starts_at < now() + interval '1 hour' then
    raise exception 'TOO_LATE' using errcode = 'P0001';
  end if;

  -- One student, one pending booking. Without this, tapping Book on six slots
  -- and paying for none holds an educator's whole week hostage for 15 minutes.
  if exists (
    select 1 from public.mentorship_bookings
     where user_id = v_user and status = 'pending_payment'
  ) then
    raise exception 'HOLD_ALREADY_OPEN' using errcode = '23505';
  end if;

  v_hold := case when v_slot.price_inr > 0 then now() + interval '15 minutes' end;

  -- THE claim. One guarded UPDATE: `is_booked = false` in the WHERE means two
  -- concurrent callers cannot both succeed, because Postgres serialises them
  -- and the loser sees the row already changed. Reading then writing would
  -- leave a window between the two statements; this has none.
  update public.mentorship_slots
     set is_booked = true, reserved_until = v_hold
   where id = p_slot and not is_booked;

  if not found then
    raise exception 'SLOT_TAKEN' using errcode = '23505';
  end if;

  insert into public.mentorship_bookings (slot_id, user_id, topic, notes, price_inr, status)
  values (p_slot, v_user, nullif(trim(coalesce(p_topic, '')), ''),
          nullif(trim(coalesce(p_notes, '')), ''), v_slot.price_inr,
          case when v_slot.price_inr > 0 then 'pending_payment' else 'confirmed' end)
  returning id into v_booking;

  if v_slot.price_inr > 0 then
    select full_name into v_educator from public.profiles where id = v_slot.educator_id;

    insert into public.orders (user_id, subtotal_inr, discount_inr, total_inr, status)
    values (v_user, v_slot.price_inr, 0, v_slot.price_inr, 'created')
    returning id into v_order;

    -- item_type 'mentorship' was already allowed by the CHECK on order_items;
    -- this is the first thing to use it.
    insert into public.order_items (order_id, item_type, item_id, title_snapshot, unit_price_inr)
    values (v_order, 'mentorship', p_slot,
            '1:1 session with ' || coalesce(v_educator, 'your mentor'), v_slot.price_inr);

    update public.mentorship_bookings set order_id = v_order where id = v_booking;
  else
    -- Free sessions are real bookings straight away, so both people are told.
    perform public.enqueue_notification(
      v_slot.educator_id, 'mentorship.booked', 'New 1:1 booking',
      'A student booked your slot.',
      jsonb_build_object('url', '/studio/mentorship', 'booking_id', v_booking),
      'mentorship', array['push', 'email'], now());
  end if;

  return query select v_booking, v_order, v_slot.price_inr, v_hold;
end $$;

-- -----------------------------------------------------------------------------
-- Confirm a mentorship booking once its order is paid.
--
-- fulfil_order() handles course items. This is the mentorship half, called from
-- the same place, so a paid session is confirmed by the webhook rather than by
-- the browser — same rule as enrolment, and for the same reason: the success
-- handler is JavaScript on the buyer's machine.
-- -----------------------------------------------------------------------------
create or replace function public.confirm_mentorship_for_order(p_order uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_count int := 0;
  v_row   record;
begin
  for v_row in
    select b.id, b.user_id, s.educator_id, s.starts_at
      from public.mentorship_bookings b
      join public.mentorship_slots s on s.id = b.slot_id
     where b.order_id = p_order and b.status = 'pending_payment'
  loop
    update public.mentorship_bookings set status = 'confirmed' where id = v_row.id;

    -- The hold becomes permanent: is_booked stays true, the expiry is dropped
    -- so release_expired_slot_holds() will never look at it again.
    update public.mentorship_slots
       set reserved_until = null
     where id = (select slot_id from public.mentorship_bookings where id = v_row.id);

    perform public.enqueue_notification(
      v_row.educator_id, 'mentorship.booked', 'New 1:1 booking',
      'A student booked and paid for your slot.',
      jsonb_build_object('url', '/studio/mentorship', 'booking_id', v_row.id),
      'mentorship', array['push', 'email'], now());

    perform public.enqueue_notification(
      v_row.user_id, 'mentorship.confirmed', 'Your 1:1 session is confirmed',
      'The join link appears on the session an hour before it starts.',
      jsonb_build_object('url', '/app/mentorship', 'booking_id', v_row.id),
      'mentorship', array['push', 'email'], now());

    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

-- Extend fulfil_order to call it. Replaced wholesale rather than patched
-- because create-or-replace is the only idempotent form.
create or replace function public.fulfil_order(
  p_gateway_order_id   text,
  p_gateway_payment_id text,
  p_amount_inr         integer,
  p_method             text,
  p_raw                jsonb
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_order record;
  v_item record;
  v_days integer;
begin
  select * into v_order from public.orders where gateway_order_id = p_gateway_order_id;

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- A genuine webhook for the wrong amount is still the wrong amount.
  -- Underpayment must never unlock the course.
  if p_amount_inr < v_order.total_inr then
    update public.orders set status = 'failed', updated_at = now() where id = v_order.id;
    raise exception 'AMOUNT_MISMATCH: expected % got %', v_order.total_inr, p_amount_inr
      using errcode = 'P0001';
  end if;

  insert into public.payments (order_id, gateway_payment_id, amount_inr, method, status, captured_at, raw)
  values (v_order.id, p_gateway_payment_id, p_amount_inr, p_method, 'captured', now(), p_raw)
  on conflict (gateway_payment_id) do nothing;

  -- Already fulfilled by an earlier delivery of this event: stop here rather
  -- than re-granting access and re-incrementing the coupon.
  if v_order.status = 'paid' then
    return v_order.id;
  end if;

  update public.orders set status = 'paid', updated_at = now() where id = v_order.id;

  for v_item in
    select item_id, title_snapshot from public.order_items
     where order_id = v_order.id and item_type = 'course'
  loop
    select access_days into v_days from public.courses where id = v_item.item_id;

    insert into public.enrollments (user_id, course_id, order_id, status, expires_at)
    values (
      v_order.user_id, v_item.item_id, v_order.id, 'active',
      case when v_days is null then null else now() + make_interval(days => v_days) end
    )
    on conflict (user_id, course_id) do update
      set status = 'active',
          order_id = excluded.order_id,
          expires_at = excluded.expires_at;

    update public.courses
       set student_count = student_count + 1
     where id = v_item.item_id;

    perform public.enqueue_notification(
      v_order.user_id, 'course.published', 'You are enrolled: ' || v_item.title_snapshot,
      'Your payment went through and the course is ready in My Courses.',
      jsonb_build_object('url', '/app/learning'),
      'course', array['push','email'], now());
  end loop;

  -- 0031: mentorship slots held pending payment become real bookings here, for
  -- the same reason enrolment does — the browser's success handler is
  -- JavaScript on the buyer's machine and can be called from a console.
  perform public.confirm_mentorship_for_order(v_order.id);

  if v_order.coupon_id is not null then
    update public.coupons set used_count = used_count + 1 where id = v_order.coupon_id;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after)
  values (v_order.user_id, 'ORDER_PAID', 'orders', v_order.id,
          jsonb_build_object('amount', p_amount_inr, 'payment', p_gateway_payment_id));

  return v_order.id;
end $$;

-- -----------------------------------------------------------------------------
-- My bookings, and the educator's own list.
-- -----------------------------------------------------------------------------
create or replace function public.get_my_bookings()
returns table (
  booking_id  uuid,
  slot_id     uuid,
  counterpart text,
  starts_at   timestamptz,
  ends_at     timestamptz,
  status      text,
  topic       text,
  price_inr   integer,
  is_mine     boolean
)
language plpgsql security definer set search_path = public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  perform public.release_expired_slot_holds();

  return query
  select b.id,
         s.id,
         -- The student sees the educator's name; the educator sees the
         -- student's. Same query, opposite side.
         case when b.user_id = v_user then educator.full_name else student.full_name end,
         s.starts_at,
         s.ends_at,
         b.status,
         b.topic,
         b.price_inr,
         b.user_id = v_user
    from public.mentorship_bookings b
    join public.mentorship_slots s on s.id = b.slot_id
    join public.profiles educator on educator.id = s.educator_id
    join public.profiles student on student.id = b.user_id
   where b.user_id = v_user or s.educator_id = v_user
   order by s.starts_at desc
   limit 100;
end $$;

/*
 * The join link, issued the same way a live class link is.
 *
 * Not stored in the page, not in the RSC payload. Returned only to the two
 * people on the booking, only when the booking is confirmed, and only inside
 * the window — a link that works a week early is a link that gets forwarded.
 */
create or replace function public.get_booking_join_url(p_booking uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row  record;
begin
  select b.meet_url, b.status, b.user_id, s.educator_id, s.starts_at, s.ends_at
    into v_row
    from public.mentorship_bookings b
    join public.mentorship_slots s on s.id = b.slot_id
   where b.id = p_booking;

  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_row.user_id <> v_user and v_row.educator_id <> v_user then
    raise exception 'NOT_YOURS' using errcode = '42501';
  end if;

  if v_row.status <> 'confirmed' then
    raise exception 'NOT_CONFIRMED' using errcode = 'P0001';
  end if;

  if v_row.meet_url is null then
    raise exception 'NO_LINK_YET' using errcode = 'P0002';
  end if;

  if now() < v_row.starts_at - interval '1 hour' then
    raise exception 'TOO_EARLY' using errcode = 'P0001';
  end if;

  if now() > v_row.ends_at + interval '30 minutes' then
    raise exception 'SESSION_ENDED' using errcode = 'P0001';
  end if;

  return v_row.meet_url;
end $$;

-- -----------------------------------------------------------------------------
-- Educator side: publish slots, attach the link, cancel.
-- -----------------------------------------------------------------------------
create or replace function public.create_slots(
  p_starts    timestamptz[],
  p_minutes   integer default 45,
  p_price_inr integer default 0,
  p_topic     text default null
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_start timestamptz; v_count int := 0;
begin
  if not (public.has_role('educator') or public.has_role('admin')) then
    raise exception 'NOT_PERMITTED' using errcode = '42501';
  end if;

  if coalesce(p_minutes, 0) < 10 or p_minutes > 240 then
    raise exception 'BAD_DURATION' using errcode = '23514';
  end if;

  foreach v_start in array coalesce(p_starts, '{}')
  loop
    if v_start <= now() then
      continue;
    end if;

    -- Skip rather than fail: an educator pasting a week of times should not
    -- lose the whole batch because one clashes with a slot they already made.
    if exists (
      select 1 from public.mentorship_slots s
       where s.educator_id = auth.uid()
         and tstzrange(s.starts_at, s.ends_at) && tstzrange(v_start, v_start + make_interval(mins => p_minutes))
    ) then
      continue;
    end if;

    insert into public.mentorship_slots (educator_id, starts_at, ends_at, price_inr, topic_hint)
    values (auth.uid(), v_start, v_start + make_interval(mins => p_minutes),
            greatest(0, coalesce(p_price_inr, 0)), nullif(trim(coalesce(p_topic, '')), ''));

    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

create or replace function public.set_booking_meet_url(p_booking uuid, p_url text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_educator uuid; v_student uuid;
begin
  select s.educator_id, b.user_id into v_educator, v_student
    from public.mentorship_bookings b
    join public.mentorship_slots s on s.id = b.slot_id
   where b.id = p_booking;

  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_educator <> auth.uid() and not public.is_staff() then
    raise exception 'NOT_YOURS' using errcode = '42501';
  end if;

  if coalesce(p_url, '') !~* '^https://' then
    raise exception 'BAD_URL' using errcode = '23514';
  end if;

  update public.mentorship_bookings set meet_url = trim(p_url) where id = p_booking;

  perform public.enqueue_notification(
    v_student, 'mentorship.confirmed', 'Your 1:1 link is ready',
    'Open it from Mentorship an hour before the session.',
    jsonb_build_object('url', '/app/mentorship', 'booking_id', p_booking),
    'mentorship', array['push', 'email'], now());
end $$;

create or replace function public.cancel_booking(p_booking uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_row record;
begin
  select b.user_id, b.slot_id, b.status, s.educator_id, s.starts_at
    into v_row
    from public.mentorship_bookings b
    join public.mentorship_slots s on s.id = b.slot_id
   where b.id = p_booking;

  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_row.user_id <> auth.uid() and v_row.educator_id <> auth.uid() and not public.is_staff() then
    raise exception 'NOT_YOURS' using errcode = '42501';
  end if;

  update public.mentorship_bookings set status = 'cancelled' where id = p_booking;

  -- The slot goes back on sale. It is somebody's paid working hour, and leaving
  -- it dark because a booking was cancelled loses money for no reason.
  update public.mentorship_slots
     set is_booked = false, reserved_until = null
   where id = v_row.slot_id and starts_at > now();

  perform public.enqueue_notification(
    case when v_row.user_id = auth.uid() then v_row.educator_id else v_row.user_id end,
    'mentorship.cancelled', '1:1 session cancelled',
    coalesce(nullif(trim(p_reason), ''), 'The other person cancelled this session.'),
    jsonb_build_object('url', '/app/mentorship'),
    'mentorship', array['push', 'email'], now());
end $$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke all on function public.release_expired_slot_holds()                    from public, anon, authenticated;
revoke all on function public.get_mentors()                                   from public, anon, authenticated;
revoke all on function public.get_open_slots(uuid, integer)                   from public, anon, authenticated;
revoke all on function public.book_slot(uuid, text, text)                     from public, anon, authenticated;
revoke all on function public.confirm_mentorship_for_order(uuid)              from public, anon, authenticated;
revoke all on function public.get_my_bookings()                               from public, anon, authenticated;
revoke all on function public.get_booking_join_url(uuid)                      from public, anon, authenticated;
revoke all on function public.create_slots(timestamptz[], integer, integer, text) from public, anon, authenticated;
revoke all on function public.set_booking_meet_url(uuid, text)                from public, anon, authenticated;
revoke all on function public.cancel_booking(uuid, text)                      from public, anon, authenticated;

-- release_expired_slot_holds and confirm_mentorship_for_order stay ungranted:
-- both are internal, called by the functions above under the definer's rights.
-- Exposing the second would let anyone confirm an unpaid booking.
grant execute on function public.get_mentors()                                   to authenticated;
grant execute on function public.get_open_slots(uuid, integer)                   to authenticated;
grant execute on function public.book_slot(uuid, text, text)                     to authenticated;
grant execute on function public.get_my_bookings()                               to authenticated;
grant execute on function public.get_booking_join_url(uuid)                      to authenticated;
grant execute on function public.create_slots(timestamptz[], integer, integer, text) to authenticated;
grant execute on function public.set_booking_meet_url(uuid, text)                to authenticated;
grant execute on function public.cancel_booking(uuid, text)                      to authenticated;

-- meet_url is revoked for the same reason live_sessions.join_url is: a link in
-- the page is a link that can be forwarded. get_booking_join_url() is the only
-- way to obtain one, and it checks both identity and the time window.
revoke select (meet_url) on public.mentorship_bookings from anon, authenticated;
