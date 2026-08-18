-- =============================================================================
-- 0021 · Quiz engine
--
-- quiz_attempts and quiz_responses have SELECT policies and nothing else, so a
-- student cannot create an attempt or save an answer by any direct write. That
-- is correct and deliberate — the entire lifecycle runs through the functions
-- below, because every step has a rule that a client must not be trusted with:
--
--   start   enrolment, quiz window, max_attempts, and the expiry clock
--   read    the paper WITHOUT is_correct
--   save    only before submission, only before expiry
--   submit  scoring, server-side, from the database's own answer key
--
-- The single most important property: `is_correct` never leaves the server
-- while an attempt is open. A client that receives the answer key has no quiz,
-- only a formality — and `quiz_options` is REVOKEd from students precisely so
-- that no accidental select can leak it. get_quiz_paper() is the only read
-- path, and it does not return the column.
--
-- The timer is `expires_at` on the attempt row, set at start from the quiz's
-- duration. A countdown in the browser is a display of that value, never the
-- authority — closing the laptop must not buy extra minutes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Start an attempt.
-- -----------------------------------------------------------------------------
create or replace function public.start_quiz_attempt(p_quiz uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_course uuid;
  v_duration integer;
  v_max smallint;
  v_status text;
  v_opens timestamptz;
  v_closes timestamptz;
  v_used integer;
  v_open_attempt uuid;
  v_attempt uuid;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select course_id, duration_min, max_attempts, status, opens_at, closes_at
    into v_course, v_duration, v_max, v_status, v_opens, v_closes
  from public.quizzes where id = p_quiz;

  if v_course is null then
    raise exception 'QUIZ_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_status <> 'published' then
    raise exception 'QUIZ_NOT_PUBLISHED' using errcode = 'P0001';
  end if;

  if not (public.is_enrolled(v_course) or public.is_staff()) then
    raise exception 'NOT_ENROLLED' using errcode = '42501';
  end if;

  if v_opens is not null and now() < v_opens then
    raise exception 'QUIZ_NOT_OPEN' using errcode = 'P0001';
  end if;

  if v_closes is not null and now() > v_closes then
    raise exception 'QUIZ_CLOSED' using errcode = 'P0001';
  end if;

  -- Resume rather than start a second attempt. A dropped connection mid-quiz is
  -- common on mobile, and burning one of three attempts for it would be cruel.
  select id into v_open_attempt
    from public.quiz_attempts
   where quiz_id = p_quiz and user_id = v_user and submitted_at is null and expires_at > now()
   order by started_at desc
   limit 1;

  if v_open_attempt is not null then
    return v_open_attempt;
  end if;

  select count(*) into v_used
    from public.quiz_attempts where quiz_id = p_quiz and user_id = v_user;

  if v_used >= v_max then
    raise exception 'NO_ATTEMPTS_LEFT' using errcode = 'P0001';
  end if;

  insert into public.quiz_attempts (quiz_id, user_id, expires_at)
  values (p_quiz, v_user, now() + make_interval(mins => v_duration))
  returning id into v_attempt;

  return v_attempt;
end $$;

-- -----------------------------------------------------------------------------
-- The paper. Questions and options, WITHOUT is_correct.
--
-- Option order is shuffled per attempt when the quiz asks for it, seeded by the
-- attempt id so a refresh does not reshuffle and disorient the candidate.
-- -----------------------------------------------------------------------------
create or replace function public.get_quiz_paper(p_attempt uuid)
returns table (
  question_id text,
  body        text,
  marks       numeric,
  negative    numeric,
  -- NOT `position`: it is a reserved word in a RETURNS TABLE clause, even
  -- though it is a perfectly legal column name on a table (which is why
  -- quiz_questions.position works). The parser rejects it here.
  q_position  integer,
  options     jsonb,
  chosen      text
)
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_quiz uuid;
  v_owner uuid;
  v_shuffle boolean;
begin
  select a.quiz_id, a.user_id, q.shuffle
    into v_quiz, v_owner, v_shuffle
  from public.quiz_attempts a
  join public.quizzes q on q.id = a.quiz_id
  where a.id = p_attempt;

  if v_quiz is null then
    raise exception 'ATTEMPT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_owner <> v_user then
    raise exception 'NOT_YOUR_ATTEMPT' using errcode = '42501';
  end if;

  return query
  select
    qq.id::text,
    qq.body,
    qq.marks,
    qq.negative,
    qq.position,
    (
      select jsonb_agg(jsonb_build_object('id', o.id, 'body', o.body) order by o.ord)
      from (
        select qo.id, qo.body,
               case when v_shuffle
                    then md5(qo.id::text || p_attempt::text)
                    else lpad(qo.position::text, 6, '0')
               end as ord
        from public.quiz_options qo
        where qo.question_id = qq.id
      ) o
    ) as options,
    (select r.option_id::text from public.quiz_responses r
      where r.attempt_id = p_attempt and r.question_id = qq.id)
  from public.quiz_questions qq
  where qq.quiz_id = v_quiz
  order by qq.position;
end $$;

-- -----------------------------------------------------------------------------
-- Save one answer. Null option_id clears it, which is how "unanswer" works.
-- -----------------------------------------------------------------------------
create or replace function public.save_quiz_response(
  p_attempt  uuid,
  p_question uuid,
  p_option   uuid
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_submitted timestamptz;
  v_expires timestamptz;
  v_quiz uuid;
begin
  select user_id, submitted_at, expires_at, quiz_id
    into v_owner, v_submitted, v_expires, v_quiz
  from public.quiz_attempts where id = p_attempt;

  if v_owner is null then
    raise exception 'ATTEMPT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_owner <> auth.uid() then
    raise exception 'NOT_YOUR_ATTEMPT' using errcode = '42501';
  end if;

  if v_submitted is not null then
    raise exception 'ALREADY_SUBMITTED' using errcode = 'P0001';
  end if;

  -- The clock is here, not in the browser. A tab left open past the deadline
  -- can still send saves; they are refused.
  if now() > v_expires then
    raise exception 'TIME_EXPIRED' using errcode = 'P0001';
  end if;

  -- The question must belong to this attempt's quiz, and the option to that
  -- question. Without both checks a crafted request could answer question A
  -- with an option from question B.
  if not exists (select 1 from public.quiz_questions where id = p_question and quiz_id = v_quiz) then
    raise exception 'QUESTION_NOT_IN_QUIZ' using errcode = '23514';
  end if;

  if p_option is not null
     and not exists (select 1 from public.quiz_options where id = p_option and question_id = p_question) then
    raise exception 'OPTION_NOT_IN_QUESTION' using errcode = '23514';
  end if;

  if p_option is null then
    delete from public.quiz_responses where attempt_id = p_attempt and question_id = p_question;
    return;
  end if;

  insert into public.quiz_responses (attempt_id, question_id, option_id)
  values (p_attempt, p_question, p_option)
  on conflict (attempt_id, question_id) do update
    set option_id = excluded.option_id, answered_at = now();
end $$;

-- -----------------------------------------------------------------------------
-- Submit and score.
--
-- Scoring reads the answer key directly; the client sends nothing but the
-- attempt id. Also callable after expiry, which is how an abandoned attempt is
-- finalised — otherwise a student who closed the tab would have no result at all.
-- -----------------------------------------------------------------------------
create or replace function public.submit_quiz_attempt(p_attempt uuid)
returns table (score numeric, correct integer, wrong integer, skipped integer, total integer)
language plpgsql security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_submitted timestamptz;
  v_quiz uuid;
  v_score numeric := 0;
  v_correct int := 0;
  v_wrong int := 0;
  v_total int := 0;
begin
  select user_id, submitted_at, quiz_id into v_owner, v_submitted, v_quiz
    from public.quiz_attempts where id = p_attempt;

  if v_owner is null then
    raise exception 'ATTEMPT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_owner <> auth.uid() and not public.is_staff() then
    raise exception 'NOT_YOUR_ATTEMPT' using errcode = '42501';
  end if;

  -- Idempotent: a double-tap on Submit, or a retry after a dropped response,
  -- must return the same result rather than rescore or error.
  if v_submitted is not null then
    return query
      select a.score, a.correct_count, a.wrong_count, a.skipped_count,
             (select count(*)::int from public.quiz_questions where quiz_id = a.quiz_id)
      from public.quiz_attempts a where a.id = p_attempt;
    return;
  end if;

  select count(*) into v_total from public.quiz_questions where quiz_id = v_quiz;

  -- Mark each response, storing the per-question award for the review screen.
  update public.quiz_responses r
     set marks_awarded = case when o.is_correct then qq.marks else -qq.negative end
    from public.quiz_options o
    join public.quiz_questions qq on qq.id = o.question_id
   where r.attempt_id = p_attempt and r.option_id = o.id and r.question_id = qq.id;

  select
    coalesce(sum(r.marks_awarded), 0),
    coalesce(sum(case when r.marks_awarded > 0 then 1 else 0 end), 0),
    coalesce(sum(case when r.marks_awarded <= 0 then 1 else 0 end), 0)
    into v_score, v_correct, v_wrong
  from public.quiz_responses r
  where r.attempt_id = p_attempt and r.option_id is not null;

  update public.quiz_attempts
     set submitted_at = now(),
         score = v_score,
         correct_count = v_correct,
         wrong_count = v_wrong,
         skipped_count = greatest(0, v_total - v_correct - v_wrong)
   where id = p_attempt;

  return query select v_score, v_correct, v_wrong, greatest(0, v_total - v_correct - v_wrong), v_total;
end $$;

-- -----------------------------------------------------------------------------
-- The review screen. Correct answers and explanations — ONLY after submission.
--
-- This is the one place is_correct is allowed out, and the guard below is the
-- entire reason it is safe. Fetching this mid-attempt returns nothing.
-- -----------------------------------------------------------------------------
create or replace function public.get_quiz_review(p_attempt uuid)
returns table (
  question_id  text,
  body         text,
  explanation  text,
  marks        numeric,
  awarded      numeric,
  chosen       text,
  correct      text,
  options      jsonb
)
language plpgsql security definer set search_path = public
as $$
declare v_owner uuid; v_submitted timestamptz; v_quiz uuid;
begin
  select user_id, submitted_at, quiz_id into v_owner, v_submitted, v_quiz
    from public.quiz_attempts where id = p_attempt;

  if v_owner is null then
    raise exception 'ATTEMPT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_owner <> auth.uid() and not public.is_staff() then
    raise exception 'NOT_YOUR_ATTEMPT' using errcode = '42501';
  end if;

  if v_submitted is null then
    raise exception 'NOT_SUBMITTED' using errcode = 'P0001';
  end if;

  return query
  select
    qq.id::text,
    qq.body,
    qq.explanation,
    qq.marks,
    r.marks_awarded,
    r.option_id::text,
    (select o.id::text from public.quiz_options o where o.question_id = qq.id and o.is_correct limit 1),
    (
      select jsonb_agg(jsonb_build_object('id', o.id, 'body', o.body, 'correct', o.is_correct)
                       order by o.position)
      from public.quiz_options o where o.question_id = qq.id
    )
  from public.quiz_questions qq
  left join public.quiz_responses r on r.question_id = qq.id and r.attempt_id = p_attempt
  where qq.quiz_id = v_quiz
  order by qq.position;
end $$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke all on function public.start_quiz_attempt(uuid)              from public, anon, authenticated;
revoke all on function public.get_quiz_paper(uuid)                  from public, anon, authenticated;
revoke all on function public.save_quiz_response(uuid, uuid, uuid)  from public, anon, authenticated;
revoke all on function public.submit_quiz_attempt(uuid)             from public, anon, authenticated;
revoke all on function public.get_quiz_review(uuid)                 from public, anon, authenticated;

grant execute on function public.start_quiz_attempt(uuid)             to authenticated;
grant execute on function public.get_quiz_paper(uuid)                 to authenticated;
grant execute on function public.save_quiz_response(uuid, uuid, uuid) to authenticated;
grant execute on function public.submit_quiz_attempt(uuid)            to authenticated;
grant execute on function public.get_quiz_review(uuid)                to authenticated;
