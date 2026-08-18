-- =============================================================================
-- 0022 · Doubt answers inherited nothing from the doubt
--
-- The policy was:
--
--   create policy "answers: readable with the doubt" on public.doubt_answers
--     for select using (exists (select 1 from public.doubts d where d.id = doubt_id));
--
-- It checks that the parent doubt EXISTS. It never checks that the reader may
-- see it. Since every answer has a parent by definition, the condition is
-- always true — so any signed-in user could read every answer to every doubt,
-- including doubts in courses they were never enrolled in.
--
-- The doubt itself is properly protected ("readable to course members"), which
-- makes this worse rather than better: the question is hidden and the answer to
-- it is not, so paid course discussion leaks one side of the conversation.
--
-- A related family to the WITH CHECK bug in 0015/0018: a child policy that
-- *references* its parent without *inheriting* its condition.
-- =============================================================================

drop policy if exists "answers: readable with the doubt" on public.doubt_answers;
create policy "answers: readable with the doubt" on public.doubt_answers
  for select
  using (
    exists (
      select 1 from public.doubts d
       where d.id = doubt_id
         and (
           public.is_enrolled(d.course_id)
           or d.user_id = auth.uid()
           or public.is_staff()
           or exists (
             select 1 from public.courses c
              where c.id = d.course_id and c.created_by = auth.uid()
           )
         )
    )
  );

-- Same shape, same omission: votes were readable to anyone. Lower stakes, but
-- the vote count reveals which paid-course answers exist.
drop policy if exists "votes: own only" on public.doubt_votes;
create policy "votes: own only" on public.doubt_votes
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Post an answer, keeping the doubt's own bookkeeping in step.
--
-- `answered_at` on the doubt is what the UI uses to show a thread as handled.
-- Left to a separate client write it would drift the first time a request
-- failed halfway.
-- -----------------------------------------------------------------------------
create or replace function public.answer_doubt(
  p_doubt uuid,
  p_body  text
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_answer uuid;
  v_course uuid;
  v_asker uuid;
  v_educator boolean := public.has_role('educator') or public.has_role('admin');
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if p_body is null or length(trim(p_body)) < 2 then
    raise exception 'EMPTY_ANSWER' using errcode = '23514';
  end if;

  select course_id, user_id into v_course, v_asker from public.doubts where id = p_doubt;

  if v_asker is null then
    raise exception 'DOUBT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not (public.is_enrolled(v_course) or public.is_staff() or v_educator or v_asker = auth.uid()) then
    raise exception 'NOT_ENROLLED' using errcode = '42501';
  end if;

  -- The verified badge is granted by role, never claimed by the poster —
  -- see 0018, where students could set it on their own answers.
  insert into public.doubt_answers (doubt_id, user_id, body, is_educator_verified)
  values (p_doubt, auth.uid(), trim(p_body), v_educator)
  returning id into v_answer;

  if v_educator then
    update public.doubts
       set answered_at = coalesce(answered_at, now()),
           status = 'answered'
     where id = p_doubt;

    -- Don't notify someone about their own answer.
    if v_asker <> auth.uid() then
      perform public.enqueue_notification(
        v_asker, 'doubt.answered', 'Your doubt was answered',
        left(trim(p_body), 140),
        jsonb_build_object('url', '/app/doubts', 'doubt_id', p_doubt),
        'doubt', array['push','email'], now());
    end if;
  end if;

  return v_answer;
end $$;

revoke all on function public.answer_doubt(uuid, text) from public, anon, authenticated;
grant execute on function public.answer_doubt(uuid, text) to authenticated;
