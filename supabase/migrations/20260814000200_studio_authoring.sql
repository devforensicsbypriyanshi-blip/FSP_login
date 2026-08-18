-- =============================================================================
-- 0027 · Educator studio: doubts desk, quiz builder, broadcasts
--
-- These three screens shipped as static mock-ups. This migration gives them
-- something to talk to.
--
-- One shape throughout: **educators write through functions, never through the
-- table.** quiz_questions and quiz_options have a SELECT policy and no write
-- policy at all, so RLS denies every insert by default — that is deliberate and
-- stays that way. Authoring goes through SECURITY DEFINER functions that check
-- ownership first, which means there is exactly one code path to audit rather
-- than a policy per verb.
--
-- Educators are NOT staff. is_staff() is admin/developer/support, so an educator
-- cannot read public.enrollments and cannot count their own students without a
-- function to do it for them. That is the reason get_educator_courses() exists.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Courses this user may author for, with their live student count.
--
-- Feeds the audience picker on broadcasts and the course picker on the quiz
-- builder. Both need a number the educator cannot otherwise obtain.
-- -----------------------------------------------------------------------------
create or replace function public.get_educator_courses()
returns table (
  course_id    uuid,
  title        text,
  slug         text,
  status       text,
  student_count integer
)
language sql stable security definer set search_path = public
as $$
  select c.id,
         c.title,
         c.slug,
         c.status::text,
         (select count(*)::int
            from public.enrollments e
           where e.course_id = c.id and e.status = 'active')
    from public.courses c
   where c.created_by = auth.uid() or public.is_staff()
   order by c.title;
$$;

-- -----------------------------------------------------------------------------
-- Doubts desk: close the loop on a question.
--
-- answer_doubt() already flips 'open' → 'answered'. This is the educator saying
-- "and it is finished", which is a different judgement and belongs to them.
-- -----------------------------------------------------------------------------
create or replace function public.set_doubt_status(p_doubt uuid, p_status text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_course uuid;
begin
  if p_status not in ('open', 'answered', 'resolved', 'closed') then
    raise exception 'BAD_STATUS' using errcode = '23514';
  end if;

  select course_id into v_course from public.doubts where id = p_doubt;
  if not found then
    raise exception 'DOUBT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not (public.is_staff() or exists (
    select 1 from public.courses c where c.id = v_course and c.created_by = auth.uid()
  )) then
    raise exception 'NOT_PERMITTED' using errcode = '42501';
  end if;

  update public.doubts set status = p_status::doubt_status where id = p_doubt;
end $$;

-- -----------------------------------------------------------------------------
-- Quiz builder · the quiz itself
--
-- One upsert rather than separate create/update: the builder saves continuously
-- and the caller should not have to track whether this is the first save.
-- -----------------------------------------------------------------------------
create or replace function public.upsert_quiz(
  p_quiz          uuid,
  p_course        uuid,
  p_title         text,
  p_description   text default null,
  p_duration_min  integer default 30,
  p_negative_mark numeric default 0,
  p_shuffle       boolean default true,
  p_max_attempts  integer default 1,
  p_opens_at      timestamptz default null,
  p_closes_at     timestamptz default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not (public.has_role('educator') or public.has_role('admin')) then
    raise exception 'NOT_PERMITTED' using errcode = '42501';
  end if;

  if p_title is null or length(trim(p_title)) < 3 then
    raise exception 'TITLE_TOO_SHORT' using errcode = '23514';
  end if;

  if p_duration_min is null or p_duration_min < 1 then
    raise exception 'BAD_DURATION' using errcode = '23514';
  end if;

  -- A quiz is delivered to everyone enrolled on the course, so authoring one
  -- against a course you do not own is authoring in someone else's name.
  if not (public.is_staff() or exists (
    select 1 from public.courses c where c.id = p_course and c.created_by = auth.uid()
  )) then
    raise exception 'NOT_YOUR_COURSE' using errcode = '42501';
  end if;

  if p_quiz is null then
    insert into public.quizzes
      (course_id, title, description, duration_min, negative_mark,
       shuffle, max_attempts, opens_at, closes_at, status, created_by)
    values
      (p_course, trim(p_title), nullif(trim(coalesce(p_description, '')), ''),
       p_duration_min, coalesce(p_negative_mark, 0), coalesce(p_shuffle, true),
       coalesce(p_max_attempts, 1)::smallint, p_opens_at, p_closes_at, 'draft', auth.uid())
    returning id into v_id;
    return v_id;
  end if;

  update public.quizzes
     set course_id     = p_course,
         title         = trim(p_title),
         description   = nullif(trim(coalesce(p_description, '')), ''),
         duration_min  = p_duration_min,
         negative_mark = coalesce(p_negative_mark, 0),
         shuffle       = coalesce(p_shuffle, true),
         max_attempts  = coalesce(p_max_attempts, 1)::smallint,
         opens_at      = p_opens_at,
         closes_at     = p_closes_at
   where id = p_quiz
     and (created_by = auth.uid() or public.is_staff())
  returning id into v_id;

  if v_id is null then
    raise exception 'NOT_YOUR_QUIZ' using errcode = '42501';
  end if;

  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- Quiz builder · one question and its options, atomically
--
-- Options arrive as a jsonb array: [{"body": "...", "is_correct": true}, …].
-- They are replaced wholesale rather than diffed, because a half-applied edit
-- on an exam question is worse than a redundant write — a question briefly
-- holding two correct answers, or none, would score wrongly if a student
-- submitted in that window.
-- -----------------------------------------------------------------------------
create or replace function public.upsert_question(
  p_quiz        uuid,
  p_question    uuid,
  p_body        text,
  p_options     jsonb,
  p_explanation text default null,
  p_marks       numeric default 1,
  p_negative    numeric default 0,
  p_position    integer default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id       uuid;
  v_owner    uuid;
  v_correct  int;
  v_total    int;
  v_position integer;
  v_option   jsonb;
  v_index    int := 0;
begin
  select created_by into v_owner from public.quizzes where id = p_quiz;
  if not found then
    raise exception 'QUIZ_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_owner is distinct from auth.uid() and not public.is_staff() then
    raise exception 'NOT_YOUR_QUIZ' using errcode = '42501';
  end if;

  if p_body is null or length(trim(p_body)) < 3 then
    raise exception 'EMPTY_QUESTION' using errcode = '23514';
  end if;

  v_total   := coalesce(jsonb_array_length(p_options), 0);
  select count(*) into v_correct
    from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) o
   where (o->>'is_correct')::boolean is true;

  if v_total < 2 then
    raise exception 'NEED_TWO_OPTIONS' using errcode = '23514';
  end if;

  -- Exactly one. Zero makes the question unscoreable; two makes it unfair in a
  -- way nobody notices until results are published.
  if v_correct <> 1 then
    raise exception 'NEED_ONE_CORRECT' using errcode = '23514';
  end if;

  if p_position is null then
    select coalesce(max(position), 0) + 1 into v_position
      from public.quiz_questions where quiz_id = p_quiz;
  else
    v_position := p_position;
  end if;

  if p_question is null then
    insert into public.quiz_questions (quiz_id, body, explanation, marks, negative, position)
    values (p_quiz, trim(p_body), nullif(trim(coalesce(p_explanation, '')), ''),
            coalesce(p_marks, 1), coalesce(p_negative, 0), v_position)
    returning id into v_id;
  else
    update public.quiz_questions
       set body        = trim(p_body),
           explanation = nullif(trim(coalesce(p_explanation, '')), ''),
           marks       = coalesce(p_marks, 1),
           negative    = coalesce(p_negative, 0),
           position    = v_position
     where id = p_question and quiz_id = p_quiz
    returning id into v_id;

    if v_id is null then
      raise exception 'QUESTION_NOT_FOUND' using errcode = 'P0002';
    end if;

    delete from public.quiz_options where question_id = v_id;
  end if;

  for v_option in select * from jsonb_array_elements(p_options)
  loop
    v_index := v_index + 1;
    insert into public.quiz_options (question_id, body, is_correct, position)
    values (v_id, trim(v_option->>'body'),
            coalesce((v_option->>'is_correct')::boolean, false), v_index);
  end loop;

  -- Keep the headline mark total honest without asking the educator to add up.
  update public.quizzes
     set total_marks = (select coalesce(sum(marks), 0) from public.quiz_questions where quiz_id = p_quiz)
   where id = p_quiz;

  return v_id;
end $$;

create or replace function public.delete_question(p_question uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_quiz uuid; v_owner uuid;
begin
  select q.quiz_id, z.created_by into v_quiz, v_owner
    from public.quiz_questions q join public.quizzes z on z.id = q.quiz_id
   where q.id = p_question;

  if not found then
    raise exception 'QUESTION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_owner is distinct from auth.uid() and not public.is_staff() then
    raise exception 'NOT_YOUR_QUIZ' using errcode = '42501';
  end if;

  delete from public.quiz_questions where id = p_question;

  update public.quizzes
     set total_marks = (select coalesce(sum(marks), 0) from public.quiz_questions where quiz_id = v_quiz)
   where id = v_quiz;
end $$;

-- -----------------------------------------------------------------------------
-- Quiz builder · the paper as the author sees it, is_correct included
--
-- Students cannot select quiz_options at all — the policy is authors and staff
-- only. This is the author's side of that same wall.
-- -----------------------------------------------------------------------------
create or replace function public.get_quiz_editor(p_quiz uuid)
returns table (
  question_id uuid,
  body        text,
  explanation text,
  marks       numeric,
  negative    numeric,
  q_position  integer,
  options     jsonb
)
language plpgsql security definer set search_path = public
as $$
declare v_owner uuid;
begin
  select created_by into v_owner from public.quizzes where id = p_quiz;
  if not found then
    raise exception 'QUIZ_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_owner is distinct from auth.uid() and not public.is_staff() then
    raise exception 'NOT_YOUR_QUIZ' using errcode = '42501';
  end if;

  return query
  select q.id, q.body, q.explanation, q.marks, q.negative, q.position,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id', o.id, 'body', o.body, 'is_correct', o.is_correct)
                  order by o.position)
             from public.quiz_options o where o.question_id = q.id
         ), '[]'::jsonb)
    from public.quiz_questions q
   where q.quiz_id = p_quiz
   order by q.position;
end $$;

-- -----------------------------------------------------------------------------
-- Quiz builder · publish, and refuse to publish something broken
--
-- Publishing is the irreversible-feeling step: the moment status flips, every
-- enrolled student can start an attempt. A quiz with a question that has no
-- correct answer would mark them down for something unanswerable, and by the
-- time anyone noticed the attempts would already exist.
-- -----------------------------------------------------------------------------
create or replace function public.set_quiz_status(p_quiz uuid, p_status text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_owner  uuid;
  v_course uuid;
  v_title  text;
  v_bad    int;
  v_count  int;
begin
  if p_status not in ('draft', 'published', 'archived') then
    raise exception 'BAD_STATUS' using errcode = '23514';
  end if;

  select created_by, course_id, title into v_owner, v_course, v_title
    from public.quizzes where id = p_quiz;
  if not found then
    raise exception 'QUIZ_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_owner is distinct from auth.uid() and not public.is_staff() then
    raise exception 'NOT_YOUR_QUIZ' using errcode = '42501';
  end if;

  if p_status = 'published' then
    select count(*) into v_count from public.quiz_questions where quiz_id = p_quiz;
    if v_count = 0 then
      raise exception 'NO_QUESTIONS' using errcode = '23514';
    end if;

    select count(*) into v_bad
      from public.quiz_questions q
     where q.quiz_id = p_quiz
       and (
         (select count(*) from public.quiz_options o where o.question_id = q.id) < 2
         or (select count(*) from public.quiz_options o
              where o.question_id = q.id and o.is_correct) <> 1
       );

    if v_bad > 0 then
      raise exception 'INVALID_QUESTIONS:%', v_bad using errcode = '23514';
    end if;
  end if;

  update public.quizzes set status = p_status where id = p_quiz;

  -- Tell students once, on the transition into published — not on every save
  -- of an already-published quiz.
  if p_status = 'published' and v_course is not null then
    perform public.enqueue_for_course(
      v_course, 'quiz.published', 'New test: ' || v_title,
      'A new test is now open. ' || v_count || ' questions.',
      jsonb_build_object('url', '/app/tests', 'quiz_id', p_quiz),
      'quiz');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Broadcasts · a record of what was sent
--
-- enqueue_for_course() fans out to the queue and returns a count, then forgets.
-- An educator who cannot see what they already sent will send it twice.
-- -----------------------------------------------------------------------------
create table if not exists public.broadcasts (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid references public.courses(id) on delete set null,
  sender_id   uuid not null references public.profiles(id),
  title       text not null,
  body        text,
  recipients  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists idx_broadcasts_sender on public.broadcasts (sender_id, created_at desc);

alter table public.broadcasts enable row level security;

drop policy if exists "broadcasts: sender or staff" on public.broadcasts;
create policy "broadcasts: sender or staff" on public.broadcasts
  for select using (sender_id = auth.uid() or public.is_staff());

-- No write policy: send_broadcast() is the only writer, and it is the only
-- thing that also enqueues the notifications. A row written any other way would
-- be a record of something that never sent.

create or replace function public.send_broadcast(
  p_course uuid,
  p_title  text,
  p_body   text
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_count int;
begin
  if p_title is null or length(trim(p_title)) < 3 then
    raise exception 'TITLE_TOO_SHORT' using errcode = '23514';
  end if;

  -- enqueue_for_course() re-checks ownership itself and raises NOT_PERMITTED,
  -- so this call is the authorisation as well as the delivery.
  v_count := public.enqueue_for_course(
    p_course, 'announcement', trim(p_title), nullif(trim(coalesce(p_body, '')), ''),
    jsonb_build_object('url', '/app/notifications'), 'announcement');

  insert into public.broadcasts (course_id, sender_id, title, body, recipients)
  values (p_course, auth.uid(), trim(p_title), nullif(trim(coalesce(p_body, '')), ''), v_count);

  return v_count;
end $$;

create or replace function public.get_broadcasts(p_limit integer default 20)
returns table (
  id         uuid,
  title      text,
  body       text,
  recipients integer,
  created_at timestamptz,
  course_title text
)
language sql stable security definer set search_path = public
as $$
  select b.id, b.title, b.body, b.recipients, b.created_at, c.title
    from public.broadcasts b
    left join public.courses c on c.id = b.course_id
   where b.sender_id = auth.uid() or public.is_staff()
   order by b.created_at desc
   limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke all on function public.get_educator_courses()                                            from public, anon, authenticated;
revoke all on function public.set_doubt_status(uuid, text)                                      from public, anon, authenticated;
revoke all on function public.upsert_quiz(uuid, uuid, text, text, integer, numeric, boolean, integer, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.upsert_question(uuid, uuid, text, jsonb, text, numeric, numeric, integer) from public, anon, authenticated;
revoke all on function public.delete_question(uuid)                                             from public, anon, authenticated;
revoke all on function public.get_quiz_editor(uuid)                                             from public, anon, authenticated;
revoke all on function public.set_quiz_status(uuid, text)                                       from public, anon, authenticated;
revoke all on function public.send_broadcast(uuid, text, text)                                  from public, anon, authenticated;
revoke all on function public.get_broadcasts(integer)                                           from public, anon, authenticated;

grant execute on function public.get_educator_courses()                                            to authenticated;
grant execute on function public.set_doubt_status(uuid, text)                                      to authenticated;
grant execute on function public.upsert_quiz(uuid, uuid, text, text, integer, numeric, boolean, integer, timestamptz, timestamptz) to authenticated;
grant execute on function public.upsert_question(uuid, uuid, text, jsonb, text, numeric, numeric, integer) to authenticated;
grant execute on function public.delete_question(uuid)                                             to authenticated;
grant execute on function public.get_quiz_editor(uuid)                                             to authenticated;
grant execute on function public.set_quiz_status(uuid, text)                                       to authenticated;
grant execute on function public.send_broadcast(uuid, text, text)                                  to authenticated;
grant execute on function public.get_broadcasts(integer)                                           to authenticated;

grant select on public.broadcasts to authenticated;
