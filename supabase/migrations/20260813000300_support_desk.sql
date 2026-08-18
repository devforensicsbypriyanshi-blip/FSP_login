-- =============================================================================
-- 0019 · Support desk
--
-- Two problems found while wiring the UI, both of which make the helpdesk
-- unusable or unsafe as it stands:
--
--   1. support_tickets has NO update policy. Staff can read tickets and
--      students can raise them, but nobody can assign one, change its priority,
--      or close it. A helpdesk that cannot resolve anything is a list.
--
--   2. `ticket_messages: post own` checks only sender_id = auth.uid(). It never
--      checks that the sender has anything to do with the ticket, so any signed-
--      in user who learns a ticket id can post into someone else's conversation.
--      Ticket ids are uuids, so this is not trivially exploitable — but "hard to
--      guess" is not an access control, and support threads carry exactly the
--      account details people should not be able to inject themselves into.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · Staff can work a ticket. Students cannot edit one after raising it —
--     changing your own priority to 'urgent' is not a feature.
-- -----------------------------------------------------------------------------
drop policy if exists "tickets: staff manage" on public.support_tickets;
create policy "tickets: staff manage" on public.support_tickets
  for update
  using (public.is_staff())
  with check (public.is_staff());

-- -----------------------------------------------------------------------------
-- 2 · A message may only be posted into a ticket you own or staff.
--
--     `is_internal` is additionally restricted: a student marking their own
--     message internal would hide it from themselves and confuse the agent
--     reading the thread.
-- -----------------------------------------------------------------------------
drop policy if exists "ticket_messages: post own" on public.ticket_messages;
create policy "ticket_messages: post own" on public.ticket_messages
  for insert
  with check (
    sender_id = auth.uid()
    and (
      public.is_staff()
      or (
        is_internal = false
        and exists (
          select 1 from public.support_tickets t
           where t.id = ticket_id and t.user_id = auth.uid()
        )
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 3 · Reply, with the bookkeeping a helpdesk needs.
--
-- Doing this in one function rather than three client writes means
-- first_response_at, the status transition and the student's notification
-- cannot drift apart — the common failure being a reply that lands but leaves
-- the ticket sitting in 'open' forever.
-- -----------------------------------------------------------------------------
create or replace function public.reply_to_ticket(
  p_ticket   uuid,
  p_body     text,
  p_internal boolean default false
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_message uuid;
  v_owner uuid;
  v_subject text;
  v_staff boolean := public.is_staff();
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if p_body is null or length(trim(p_body)) < 1 then
    raise exception 'EMPTY_MESSAGE' using errcode = '23514';
  end if;

  select user_id, subject into v_owner, v_subject
    from public.support_tickets where id = p_ticket;

  if v_owner is null then
    raise exception 'TICKET_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not v_staff and v_owner <> auth.uid() then
    raise exception 'NOT_YOUR_TICKET' using errcode = '42501';
  end if;

  -- Only staff may write an internal note.
  insert into public.ticket_messages (ticket_id, sender_id, body, is_internal)
  values (p_ticket, auth.uid(), trim(p_body), p_internal and v_staff)
  returning id into v_message;

  if v_staff then
    update public.support_tickets
       set first_response_at = coalesce(first_response_at,
             case when p_internal then first_response_at else now() end),
           -- An internal note is not an answer, so it must not move the ticket
           -- to 'pending' and start the student waiting on nothing.
           status = case
                      when p_internal then status
                      when status = 'open' then 'pending'::ticket_status
                      else status
                    end
     where id = p_ticket;

    if not p_internal then
      perform public.enqueue_notification(
        v_owner, 'support.reply', 'Support replied to your ticket',
        'Re: ' || v_subject,
        jsonb_build_object('url', '/app/support', 'ticket_id', p_ticket),
        'support', array['push','email'], now());
    end if;
  else
    -- The student came back, so it is on us again.
    update public.support_tickets
       set status = case when status = 'resolved' then 'open'::ticket_status else status end
     where id = p_ticket;
  end if;

  return v_message;
end $$;

-- -----------------------------------------------------------------------------
-- 4 · Close a ticket, notifying the student.
-- -----------------------------------------------------------------------------
create or replace function public.set_ticket_status(p_ticket uuid, p_status ticket_status)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_owner uuid; v_subject text;
begin
  if not public.is_staff() then
    raise exception 'STAFF_ONLY' using errcode = '42501';
  end if;

  select user_id, subject into v_owner, v_subject
    from public.support_tickets where id = p_ticket;

  if v_owner is null then
    raise exception 'TICKET_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.support_tickets
     set status = p_status,
         resolved_at = case when p_status in ('resolved','closed') then now() else null end
   where id = p_ticket;

  if p_status = 'resolved' then
    perform public.enqueue_notification(
      v_owner, 'support.resolved', 'Your support ticket was resolved',
      v_subject, jsonb_build_object('url', '/app/support', 'ticket_id', p_ticket),
      'support', array['email'], now());
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke all on function public.reply_to_ticket(uuid, text, boolean)   from public, anon, authenticated;
revoke all on function public.set_ticket_status(uuid, ticket_status) from public, anon, authenticated;

grant execute on function public.reply_to_ticket(uuid, text, boolean)   to authenticated;
grant execute on function public.set_ticket_status(uuid, ticket_status) to authenticated;
