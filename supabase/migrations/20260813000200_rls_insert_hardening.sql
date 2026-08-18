-- =============================================================================
-- 0018 · RLS insert hardening — the rest of the class found in 0015
--
-- 0015 fixed live_sessions and courses. This is the systematic sweep for the
-- same bug elsewhere, plus one variant of it.
--
-- The pattern being hunted: a policy that decides WHO you are in `USING` but
-- only WHO YOU CLAIM TO BE in `WITH CHECK`. Postgres consults WITH CHECK alone
-- on INSERT, so any condition missing from it is unenforced at creation time.
--
-- IMPORTANT: feature flags do NOT mitigate any of this. Quizzes, doubts and
-- mentorship all ship switched off, but a flag hides the UI — PostgREST still
-- serves /rest/v1/quizzes to any signed-in user. RLS is the only control.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · quizzes
--
-- Was: for all using (created_by = auth.uid()) with check (created_by = auth.uid())
--
-- Any signed-in student could insert a quiz against any course_id with
-- status = 'published'. The select policy is
--   (status = 'published' and is_enrolled(course_id)) or created_by = auth.uid()
-- so the fake quiz becomes visible to every enrolled student on that course.
-- On an exam-prep platform, a fabricated quiz is not vandalism — it is
-- misinformation delivered with the platform's authority behind it.
-- -----------------------------------------------------------------------------
drop policy if exists "quizzes: educator manages own" on public.quizzes;
create policy "quizzes: educator manages own" on public.quizzes
  for all
  using (created_by = auth.uid())
  with check (
    created_by = auth.uid()
    and (public.has_role('educator') or public.has_role('admin'))
  );

-- Questions and options follow the quiz, so they inherit the fix. Their
-- existing policies already require owning the parent quiz.

-- -----------------------------------------------------------------------------
-- 2 · mentorship_slots
--
-- Was: for all using (educator_id = auth.uid()) with check (educator_id = auth.uid())
--
-- `slots: readable when signed in` shows every slot to every signed-in user, so
-- a student could advertise fabricated 1:1 sessions — including a price — to
-- the entire student body.
-- -----------------------------------------------------------------------------
drop policy if exists "slots: educator manages own" on public.mentorship_slots;
create policy "slots: educator manages own" on public.mentorship_slots
  for all
  using (educator_id = auth.uid())
  with check (
    educator_id = auth.uid()
    and (public.has_role('educator') or public.has_role('admin'))
  );

-- -----------------------------------------------------------------------------
-- 3 · doubt_answers — a variant, and the most damaging of the three
--
-- Was: for insert with check (user_id = auth.uid())
--
-- The row carries `is_educator_verified`, which the UI renders as an official,
-- educator-endorsed answer. Nothing stopped the poster setting it themselves.
-- Any student could publish a wrong answer wearing the platform's badge of
-- authority, to an audience revising for an exam.
--
-- `is_accepted` is the same story, one notch less severe.
--
-- Ownership of the flag belongs to the role, not the author: an educator
-- answering their own doubt may set it; everyone else must post it false and
-- let an educator promote it later.
-- -----------------------------------------------------------------------------
drop policy if exists "answers: post own" on public.doubt_answers;
create policy "answers: post own" on public.doubt_answers
  for insert
  with check (
    user_id = auth.uid()
    and (
      (is_educator_verified = false and is_accepted = false)
      or public.has_role('educator')
      or public.has_role('admin')
    )
  );

-- There was no UPDATE policy at all, which meant a verified answer could never
-- be marked after the fact — an educator had to get it right on first post.
-- Educators and staff may now promote an existing answer.
drop policy if exists "answers: educator verifies" on public.doubt_answers;
create policy "answers: educator verifies" on public.doubt_answers
  for update
  using (public.has_role('educator') or public.has_role('admin'))
  with check (public.has_role('educator') or public.has_role('admin'));

-- -----------------------------------------------------------------------------
-- 4 · enrollments — narrow writes to admin, matching the documented matrix
--
-- Was: for update using (public.is_staff())
--
-- is_staff() is admin OR developer OR support. So a developer — whose documented
-- permissions are api keys, feature flags, webhooks and audit logs — could
-- revoke a paying student's course access, and a support agent could grant
-- themselves a paid course by flipping a suspended row back to active.
--
-- Neither is in the RBAC matrix in docs Part 3 §2, and grant_course_access()
-- already requires admin. This makes the UPDATE path agree with the INSERT path
-- instead of quietly being three roles wider.
--
-- Support keeps READ access — "is this student actually enrolled?" is the most
-- common question on the helpdesk, and answering it needs no write.
-- -----------------------------------------------------------------------------
drop policy if exists "enrollments: staff updates" on public.enrollments;
drop policy if exists "enrollments: admin updates" on public.enrollments;
create policy "enrollments: admin updates" on public.enrollments
  for update
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

-- -----------------------------------------------------------------------------
-- 5 · A standing check for the whole class of bug.
--
-- Returns every FOR ALL policy whose WITH CHECK differs from its USING. Not
-- every result is a bug — an intentionally asymmetric policy is legitimate —
-- but each one deserves a human read, and the two real vulnerabilities found so
-- far both showed up here. Run it after any migration that touches policies.
--
--   select * from public.audit_policy_asymmetry();
-- -----------------------------------------------------------------------------
create or replace function public.audit_policy_asymmetry()
returns table (table_name text, policy_name text, using_expr text, check_expr text)
language sql stable security definer set search_path = public, pg_catalog
as $$
  select (schemaname || '.' || tablename)::text,
         policyname::text,
         qual::text,
         with_check::text
    from pg_policies
   where schemaname = 'public'
     and cmd = 'ALL'
     and qual is not null
     and with_check is not null
     and qual::text is distinct from with_check::text
   order by tablename, policyname;
$$;

-- Staff-only: the output is a map of exactly where the authorisation logic is
-- asymmetric, which is a gift to anyone probing.
revoke all on function public.audit_policy_asymmetry() from public, anon, authenticated;
