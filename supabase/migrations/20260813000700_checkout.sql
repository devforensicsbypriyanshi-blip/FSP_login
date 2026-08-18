-- =============================================================================
-- 0023 · Checkout
--
-- The money path. Three rules it exists to enforce, none of which a client can
-- be trusted with:
--
--   1. THE PRICE COMES FROM THE DATABASE. The browser sends item ids, never
--      amounts. A checkout that accepts a client-supplied total is a checkout
--      where a ₹5,000 course costs ₹1.
--   2. ENROLMENT FOLLOWS THE WEBHOOK, NOT THE BROWSER. Razorpay's client
--      handler firing "success" proves nothing — it is JavaScript on a machine
--      the buyer controls. Access is granted only by the signature-verified
--      server-to-server webhook.
--   3. THE PAID AMOUNT IS RE-CHECKED AGAINST THE ORDER. Even a genuine webhook
--      is matched against what we asked for, so a tampered or partial capture
--      cannot unlock a course.
--
-- Idempotency lives in webhook_events (provider, event_id), so a replayed
-- delivery — which Razorpay does on any non-2xx — cannot double-enrol or
-- double-count a coupon.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SECURITY FIX · coupon codes were readable by every signed-in user
--
-- Was: for select using (is_active or public.is_staff())
--
-- So `select code from coupons` returned every live discount code to any
-- student who asked. Codes are a marketing instrument — a launch discount, a
-- scholarship code given to one college — and publishing the list defeats them
-- entirely. There is no way to "use RLS carefully" here: if the row is
-- readable, the code is readable.
--
-- Coupons are now staff-only to read, and validated by code through the
-- function below, which returns the discount without ever returning the row.
-- -----------------------------------------------------------------------------
drop policy if exists "coupons: active are readable" on public.coupons;
drop policy if exists "coupons: staff read" on public.coupons;
create policy "coupons: staff read" on public.coupons
  for select using (public.is_staff());

-- -----------------------------------------------------------------------------
-- Validate a coupon against an amount. Returns the discount, not the coupon.
-- -----------------------------------------------------------------------------
create or replace function public.validate_coupon(p_code citext, p_amount_inr integer)
returns table (valid boolean, discount_inr integer, reason text)
language plpgsql security definer set search_path = public
as $$
declare c record; v_used integer; v_discount integer;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into c from public.coupons where code = p_code;

  -- Deliberately the same message for "no such code" and "expired": a distinct
  -- error for each turns this into an oracle for enumerating valid codes.
  if not found or not c.is_active
     or now() < c.valid_from
     or (c.valid_to is not null and now() > c.valid_to) then
    return query select false, 0, 'That code is not valid.'::text;
    return;
  end if;

  if c.max_uses is not null and c.used_count >= c.max_uses then
    return query select false, 0, 'That code has been fully used.'::text;
    return;
  end if;

  select count(*)::int into v_used
    from public.orders o
   where o.user_id = auth.uid() and o.coupon_id = c.id and o.status = 'paid';

  if v_used >= c.per_user_limit then
    return query select false, 0, 'You have already used that code.'::text;
    return;
  end if;

  if p_amount_inr < c.min_amount_inr then
    return query select false, 0,
      ('That code needs a minimum order of ₹' || c.min_amount_inr)::text;
    return;
  end if;

  v_discount := case
    when c.kind = 'percent' then least(
      (p_amount_inr * c.value) / 100,
      coalesce(c.max_discount_inr, p_amount_inr)
    )
    else c.value
  end;

  -- Never discount below zero; a negative total would be a refund.
  v_discount := least(v_discount, p_amount_inr);

  return query select true, v_discount, null::text;
end $$;

-- -----------------------------------------------------------------------------
-- Create an order. Prices are read from the catalogue, never from the caller.
-- -----------------------------------------------------------------------------
create or replace function public.create_order(p_course_ids uuid[], p_coupon citext default null)
returns table (order_id uuid, total_inr integer, subtotal_inr integer, discount_inr integer)
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_order uuid;
  v_subtotal integer := 0;
  v_discount integer := 0;
  v_coupon uuid;
  v_valid boolean;
  v_reason text;
  c record;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if p_course_ids is null or cardinality(p_course_ids) = 0 then
    raise exception 'EMPTY_CART' using errcode = '23514';
  end if;

  insert into public.orders (user_id, subtotal_inr, total_inr, status)
  values (v_user, 0, 0, 'created')
  returning id into v_order;

  for c in
    select id, title, price_inr
      from public.courses
     where id = any(p_course_ids)
       and status = 'published'
       and deleted_at is null
  loop
    -- Already own it? Charging twice for the same course is the complaint that
    -- costs a refund and a review, and refunds are not offered here.
    if exists (
      select 1 from public.enrollments
       where user_id = v_user and course_id = c.id and status = 'active'
    ) then
      raise exception 'ALREADY_ENROLLED' using errcode = 'P0001';
    end if;

    insert into public.order_items (order_id, item_type, item_id, title_snapshot, unit_price_inr)
    values (v_order, 'course', c.id, c.title, c.price_inr);

    v_subtotal := v_subtotal + c.price_inr;
  end loop;

  if v_subtotal = 0 and not exists (select 1 from public.order_items where order_id = v_order) then
    raise exception 'NO_PURCHASABLE_ITEMS' using errcode = 'P0002';
  end if;

  if p_coupon is not null and length(trim(p_coupon::text)) > 0 then
    select v.valid, v.discount_inr, v.reason into v_valid, v_discount, v_reason
      from public.validate_coupon(p_coupon, v_subtotal) v;

    if not v_valid then
      raise exception 'COUPON_REJECTED: %', v_reason using errcode = 'P0001';
    end if;

    select id into v_coupon from public.coupons where code = p_coupon;
  end if;

  update public.orders
     set subtotal_inr = v_subtotal,
         discount_inr = coalesce(v_discount, 0),
         total_inr = greatest(0, v_subtotal - coalesce(v_discount, 0)),
         coupon_id = v_coupon
   where id = v_order;

  return query
    select o.id, o.total_inr, o.subtotal_inr, o.discount_inr
      from public.orders o where o.id = v_order;
end $$;

-- -----------------------------------------------------------------------------
-- Attach the gateway's order id. Called by the server after creating the
-- Razorpay order, so the webhook can find our row from theirs.
-- -----------------------------------------------------------------------------
create or replace function public.attach_gateway_order(p_order uuid, p_gateway_order_id text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.orders
     set gateway_order_id = p_gateway_order_id,
         status = 'pending',
         updated_at = now()
   where id = p_order
     and (user_id = auth.uid() or auth.uid() is null);  -- null = service role

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Fulfilment. Service-role only — reached from the verified webhook.
--
-- Everything here is idempotent, because Razorpay retries any non-2xx and will
-- happily deliver the same event twice.
-- -----------------------------------------------------------------------------
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

  -- Rule 3: a genuine webhook for the wrong amount is still the wrong amount.
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

  if v_order.coupon_id is not null then
    update public.coupons set used_count = used_count + 1 where id = v_order.coupon_id;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after)
  values (v_order.user_id, 'ORDER_PAID', 'orders', v_order.id,
          jsonb_build_object('amount', p_amount_inr, 'payment', p_gateway_payment_id));

  return v_order.id;
end $$;

create or replace function public.fail_order(p_gateway_order_id text, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.orders
     set status = case when status = 'paid' then status else 'failed' end,
         updated_at = now()
   where gateway_order_id = p_gateway_order_id;
end $$;

-- -----------------------------------------------------------------------------
-- Grants.
--
-- fulfil_order and fail_order are NOT granted to authenticated. They are
-- reached only with the service role from the signature-verified webhook —
-- granting them would let any signed-in user enrol themselves for free.
-- -----------------------------------------------------------------------------
revoke all on function public.validate_coupon(citext, integer)              from public, anon, authenticated;
revoke all on function public.create_order(uuid[], citext)                  from public, anon, authenticated;
revoke all on function public.attach_gateway_order(uuid, text)              from public, anon, authenticated;
revoke all on function public.fulfil_order(text, text, integer, text, jsonb) from public, anon, authenticated;
revoke all on function public.fail_order(text, text)                        from public, anon, authenticated;

grant execute on function public.validate_coupon(citext, integer) to authenticated;
grant execute on function public.create_order(uuid[], citext)     to authenticated;
