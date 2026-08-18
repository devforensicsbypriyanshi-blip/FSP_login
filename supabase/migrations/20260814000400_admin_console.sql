-- =============================================================================
-- 0029 · Admin console: users, roles, coupons, approvals, audit
--
-- Four screens that shipped as mock-ups, and one thing they have in common:
-- every write here changes what somebody else can do. Granting a role, running
-- a coupon, publishing a course — none of these are undone by an "undo" button,
-- and all of them belong in the audit log.
--
-- So every function below writes an audit_logs row in the same transaction as
-- the change. Not afterwards, not from the application: in the transaction. A
-- log written by a separate call is a log that is missing precisely when
-- something went wrong mid-operation.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Users
--
-- Admin-only. Returns roles as an array rather than one row per role, because
-- the screen shows one row per person and reassembling it client-side is an
-- invitation to get the count wrong.
-- -----------------------------------------------------------------------------
create or replace function public.admin_list_users(
  p_query text default null,
  p_limit integer default 100
)
returns table (
  user_id      uuid,
  full_name    text,
  email        text,
  roles        text[],
  enrollments  integer,
  created_at   timestamptz,
  last_seen_at timestamptz
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.has_role('admin') then
    raise exception 'NOT_PERMITTED' using errcode = '42501';
  end if;

  return query
  select p.id,
         p.full_name,
         p.email::text,
         coalesce(array_agg(r.key::text order by r.key) filter (where r.key is not null), '{}'),
         (select count(*)::int from public.enrollments e
           where e.user_id = p.id and e.status = 'active'),
         p.created_at,
         (select max(s.last_seen_at) from public.user_sessions s where s.user_id = p.id)
    from public.profiles p
    left join public.user_roles ur on ur.user_id = p.id
    left join public.roles r on r.id = ur.role_id
   where p_query is null
      or p.email::text ilike '%' || p_query || '%'
      or p.full_name ilike '%' || p_query || '%'
   group by p.id, p.full_name, p.email, p.created_at
   order by p.created_at desc
   limit greatest(1, least(coalesce(p_limit, 100), 500));
end $$;

/*
 * Replaces a user's role set.
 *
 * Two guards that matter more than they look:
 *
 *   1. You cannot remove your own admin role. There is no other way back in —
 *      role grants require admin — so a mis-click would lock the platform's
 *      owner out of their own console permanently.
 *   2. The last admin cannot be demoted by anyone. Same failure, one step
 *      removed: an admin demoting the only other admin, then losing their own
 *      account, leaves nobody who can grant the role back.
 *
 * 'student' is always kept. Every account is a student first; stripping it
 * would leave someone with an educator role and no enrolments they can read.
 */
create or replace function public.set_user_roles(p_user uuid, p_roles text[])
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_before text[];
  v_after  text[];
  v_role   text;
  v_admins int;
begin
  if not public.has_role('admin') then
    raise exception 'NOT_PERMITTED' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_after := array(select distinct unnest(coalesce(p_roles, '{}') || array['student']));

  foreach v_role in array v_after loop
    if v_role not in ('student', 'educator', 'admin', 'support', 'developer') then
      raise exception 'BAD_ROLE:%', v_role using errcode = '23514';
    end if;
  end loop;

  select coalesce(array_agg(r.key::text order by r.key), '{}') into v_before
    from public.user_roles ur join public.roles r on r.id = ur.role_id
   where ur.user_id = p_user;

  if p_user = auth.uid() and 'admin' = any(v_before) and not ('admin' = any(v_after)) then
    raise exception 'CANNOT_DEMOTE_SELF' using errcode = '42501';
  end if;

  if 'admin' = any(v_before) and not ('admin' = any(v_after)) then
    select count(distinct ur.user_id) into v_admins
      from public.user_roles ur join public.roles r on r.id = ur.role_id
     where r.key = 'admin';

    if v_admins <= 1 then
      raise exception 'LAST_ADMIN' using errcode = '42501';
    end if;
  end if;

  delete from public.user_roles where user_id = p_user;

  insert into public.user_roles (user_id, role_id, granted_by)
  select p_user, r.id, auth.uid()
    from public.roles r
   where r.key::text = any(v_after);

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), 'ROLES_CHANGED', 'profile', p_user,
          jsonb_build_object('roles', v_before), jsonb_build_object('roles', v_after));
end $$;

-- -----------------------------------------------------------------------------
-- Coupons
--
-- `coupons: staff read` already keeps the codes off the student side (0023 —
-- before that, every signed-in user could read every code). Writes are admin.
-- -----------------------------------------------------------------------------
create or replace function public.upsert_coupon(
  p_coupon       uuid,
  p_code         text,
  p_kind         text,
  p_value        integer,
  p_max_discount integer default null,
  p_min_amount   integer default 0,
  p_max_uses     integer default null,
  p_per_user     integer default 1,
  p_valid_to     timestamptz default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not public.has_role('admin') then
    raise exception 'NOT_PERMITTED' using errcode = '42501';
  end if;

  if p_code is null or length(trim(p_code)) < 3 then
    raise exception 'CODE_TOO_SHORT' using errcode = '23514';
  end if;

  if p_kind not in ('percent', 'flat') then
    raise exception 'BAD_KIND' using errcode = '23514';
  end if;

  if p_value is null or p_value <= 0 then
    raise exception 'BAD_VALUE' using errcode = '23514';
  end if;

  -- The table's own CHECK catches this too, but a percentage over 100 is worth
  -- an error that names the problem rather than a constraint violation.
  if p_kind = 'percent' and p_value > 100 then
    raise exception 'PERCENT_OVER_100' using errcode = '23514';
  end if;

  if p_coupon is null then
    insert into public.coupons
      (code, kind, value, max_discount_inr, min_amount_inr, max_uses, per_user_limit, valid_to, created_by)
    values
      (upper(trim(p_code)), p_kind, p_value, p_max_discount, coalesce(p_min_amount, 0),
       p_max_uses, greatest(1, coalesce(p_per_user, 1)), p_valid_to, auth.uid())
    returning id into v_id;
  else
    -- used_count is deliberately not settable. It is the record of what was
    -- actually redeemed, and an editable one is not a record.
    update public.coupons
       set code             = upper(trim(p_code)),
           kind             = p_kind,
           value            = p_value,
           max_discount_inr = p_max_discount,
           min_amount_inr   = coalesce(p_min_amount, 0),
           max_uses         = p_max_uses,
           per_user_limit   = greatest(1, coalesce(p_per_user, 1)),
           valid_to         = p_valid_to
     where id = p_coupon
    returning id into v_id;

    if v_id is null then
      raise exception 'COUPON_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after)
  values (auth.uid(), 'COUPON_SAVED', 'coupon', v_id,
          jsonb_build_object('code', upper(trim(p_code)), 'kind', p_kind, 'value', p_value));

  return v_id;
exception
  when unique_violation then
    raise exception 'CODE_TAKEN' using errcode = '23505';
end $$;

/*
 * Coupons are deactivated, never deleted.
 *
 * An order that used one refers to it. Deleting the row would leave a paid
 * order whose discount cannot be explained, which is exactly the record you
 * need during a refund dispute.
 */
create or replace function public.set_coupon_active(p_coupon uuid, p_active boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.has_role('admin') then
    raise exception 'NOT_PERMITTED' using errcode = '42501';
  end if;

  update public.coupons set is_active = p_active where id = p_coupon;

  if not found then
    raise exception 'COUPON_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after)
  values (auth.uid(), case when p_active then 'COUPON_ENABLED' else 'COUPON_DISABLED' end,
          'coupon', p_coupon, jsonb_build_object('is_active', p_active));
end $$;

-- -----------------------------------------------------------------------------
-- Course approvals
--
-- Educators write courses in 'draft' and submit for review; publishing is the
-- admin's call. The point of the gate is that publishing puts a course in the
-- public catalogue with a price on it.
-- -----------------------------------------------------------------------------
create or replace function public.submit_course_for_review(p_course uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_owner uuid; v_status course_status;
begin
  select created_by, status into v_owner, v_status from public.courses where id = p_course;
  if not found then
    raise exception 'COURSE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_owner is distinct from auth.uid() and not public.has_role('admin') then
    raise exception 'NOT_YOURS' using errcode = '42501';
  end if;

  if v_status = 'published' then
    raise exception 'ALREADY_PUBLISHED' using errcode = '23514';
  end if;

  update public.courses set status = 'pending_review' where id = p_course;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after)
  values (auth.uid(), 'COURSE_SUBMITTED', 'course', p_course, jsonb_build_object('status', 'pending_review'));
end $$;

create or replace function public.set_course_status(p_course uuid, p_status text, p_note text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_before course_status; v_title text;
begin
  if not public.has_role('admin') then
    raise exception 'NOT_PERMITTED' using errcode = '42501';
  end if;

  if p_status not in ('draft', 'pending_review', 'published', 'archived') then
    raise exception 'BAD_STATUS' using errcode = '23514';
  end if;

  select status, title into v_before, v_title from public.courses where id = p_course;
  if not found then
    raise exception 'COURSE_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Sending a course back needs a reason. The educator has to know what to fix,
  -- and "rejected" on its own guarantees a second submission of the same thing.
  if p_status = 'draft' and v_before = 'pending_review'
     and coalesce(length(trim(p_note)), 0) < 10 then
    raise exception 'NEED_REASON' using errcode = '23514';
  end if;

  update public.courses set status = p_status::course_status where id = p_course;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), 'COURSE_STATUS', 'course', p_course,
          jsonb_build_object('status', v_before),
          jsonb_build_object('status', p_status, 'note', p_note, 'title', v_title));
end $$;

-- -----------------------------------------------------------------------------
-- Audit log
--
-- `audit: staff read` covers the table; this exists to join the actor's name in
-- (profiles is staff-readable, but the join is worth doing once here) and to
-- cap the row count so the page cannot be asked for everything.
-- -----------------------------------------------------------------------------
create or replace function public.get_audit_logs(
  p_action text default null,
  p_limit  integer default 100
)
returns table (
  id          bigint,
  actor_name  text,
  actor_email text,
  action      text,
  entity_type text,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  ip          inet,
  created_at  timestamptz
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'NOT_PERMITTED' using errcode = '42501';
  end if;

  return query
  select a.id,
         coalesce(p.full_name, 'System'),
         coalesce(a.actor_email, p.email::text, '—'),
         a.action,
         a.entity_type,
         a.entity_id,
         a.before,
         a.after,
         a.ip,
         a.created_at
    from public.audit_logs a
    left join public.profiles p on p.id = a.actor_id
   where p_action is null or a.action = p_action
   order by a.created_at desc
   limit greatest(1, least(coalesce(p_limit, 100), 500));
end $$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke all on function public.admin_list_users(text, integer)                                     from public, anon, authenticated;
revoke all on function public.set_user_roles(uuid, text[])                                        from public, anon, authenticated;
revoke all on function public.upsert_coupon(uuid, text, text, integer, integer, integer, integer, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.set_coupon_active(uuid, boolean)                                    from public, anon, authenticated;
revoke all on function public.submit_course_for_review(uuid)                                      from public, anon, authenticated;
revoke all on function public.set_course_status(uuid, text, text)                                 from public, anon, authenticated;
revoke all on function public.get_audit_logs(text, integer)                                       from public, anon, authenticated;

grant execute on function public.admin_list_users(text, integer)                                     to authenticated;
grant execute on function public.set_user_roles(uuid, text[])                                        to authenticated;
grant execute on function public.upsert_coupon(uuid, text, text, integer, integer, integer, integer, integer, timestamptz) to authenticated;
grant execute on function public.set_coupon_active(uuid, boolean)                                    to authenticated;
grant execute on function public.submit_course_for_review(uuid)                                      to authenticated;
grant execute on function public.set_course_status(uuid, text, text)                                 to authenticated;
grant execute on function public.get_audit_logs(text, integer)                                       to authenticated;
