-- =============================================================================
-- 0028 · Notes: written in the app, or linked out of it
--
-- Until now a resource was a Google Drive file id and nothing else. That covers
-- a PDF an educator already has, and covers nothing else — not a set of notes
-- they want to type, not a paste out of a PDF they want students to actually be
-- able to read on a phone, not a slide deck living in Google Slides.
--
-- Three formats now:
--
--   drive  an existing PDF, shown in the watermarked viewer (unchanged)
--   text   a body written or pasted in the studio, rendered as a reading view
--   link   an external URL — Slides, Sheets, a public dataset — opened through
--          a server route so the click is logged and the URL stays off the page
--
-- WHAT IS STORED IS MARKDOWN, NOT HTML. Nothing in this database is ever
-- rendered as markup it supplied. The renderer escapes every character first
-- and then emits a fixed set of tags, so a <script> pasted into a note is text
-- by the time it reaches a student. Storing HTML would make an educator account
-- one paste away from stored XSS against every student who opens the note.
--
-- On "DRM": there is none, here or anywhere on the web. A browser cannot stop a
-- screenshot, a phone camera, or devtools. What this does is watermark every
-- view with the reader's name and email, and log every open — so a leaked copy
-- identifies the account it came from. Deter and trace. Anything stronger is a
-- claim no web platform can honour.
-- =============================================================================

alter table public.resources
  add column if not exists format       text not null default 'drive',
  add column if not exists body_md      text,
  add column if not exists external_url text,
  add column if not exists summary      text,
  add column if not exists updated_at   timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'resources_format_check'
  ) then
    alter table public.resources
      add constraint resources_format_check check (format in ('drive', 'text', 'link', 'storage'));
  end if;
end $$;

-- The original constraint demanded exactly one of (storage_path, drive_file_id),
-- which now refuses every text and link resource. Replaced with a rule that
-- matches the format column, so the table still cannot hold a resource with
-- nothing to show — the failure mode it was written to prevent.
alter table public.resources drop constraint if exists one_source;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'resources_has_content') then
    alter table public.resources
      add constraint resources_has_content check (
        (format = 'drive'   and drive_file_id is not null)
        or (format = 'storage' and storage_path is not null)
        or (format = 'text'  and body_md is not null and length(trim(body_md)) > 0)
        or (format = 'link'  and external_url is not null and external_url ~* '^https?://')
      );
  end if;
end $$;

create index if not exists idx_resources_course on public.resources (course_id, published_at desc);

-- -----------------------------------------------------------------------------
-- Reading log
--
-- The watermark identifies a leaked copy. This identifies the session it was
-- taken from — who opened what, when, from which device. Together they are the
-- whole of what a web platform can honestly offer.
-- -----------------------------------------------------------------------------
create table if not exists public.resource_views (
  id          bigserial primary key,
  resource_id uuid not null references public.resources(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  device_id   text,
  ip          inet,
  created_at  timestamptz not null default now()
);

create index if not exists idx_resource_views_resource on public.resource_views (resource_id, created_at desc);
create index if not exists idx_resource_views_user on public.resource_views (user_id, created_at desc);

alter table public.resource_views enable row level security;

-- Read-only, and only your own. Rows are written by log_resource_view() alone;
-- a row inserted any other way would be a reading that never happened, which
-- makes the log worse than useless in the one situation it exists for.
drop policy if exists "resource views: own or staff" on public.resource_views;
create policy "resource views: own or staff" on public.resource_views
  for select using (user_id = auth.uid() or public.is_staff());

-- -----------------------------------------------------------------------------
-- Authoring
-- -----------------------------------------------------------------------------
create or replace function public.upsert_resource(
  p_resource     uuid,
  p_course       uuid,
  p_title        text,
  p_kind         text,
  p_format       text,
  p_body_md      text default null,
  p_external_url text default null,
  p_drive_file_id text default null,
  p_summary      text default null,
  p_is_free      boolean default false
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

  if p_kind not in ('note', 'dpp', 'paper', 'solution', 'syllabus') then
    raise exception 'BAD_KIND' using errcode = '23514';
  end if;

  if p_format not in ('drive', 'text', 'link') then
    raise exception 'BAD_FORMAT' using errcode = '23514';
  end if;

  -- A resource is delivered to everyone enrolled on the course, so writing one
  -- against a course you do not own is publishing in someone else's name.
  if p_course is not null and not (public.is_staff() or exists (
    select 1 from public.courses c where c.id = p_course and c.created_by = auth.uid()
  )) then
    raise exception 'NOT_YOUR_COURSE' using errcode = '42501';
  end if;

  if p_format = 'text' and coalesce(length(trim(p_body_md)), 0) = 0 then
    raise exception 'EMPTY_BODY' using errcode = '23514';
  end if;

  -- Checked here as well as in the constraint, because the constraint reports a
  -- Postgres error and this reports something an educator can act on.
  if p_format = 'link' and coalesce(p_external_url, '') !~* '^https?://' then
    raise exception 'BAD_URL' using errcode = '23514';
  end if;

  if p_format = 'drive' and coalesce(length(trim(p_drive_file_id)), 0) = 0 then
    raise exception 'NO_FILE' using errcode = '23514';
  end if;

  if p_resource is null then
    insert into public.resources
      (course_id, title, kind, format, body_md, external_url, drive_file_id, summary, is_free)
    values
      (p_course, trim(p_title), p_kind, p_format,
       case when p_format = 'text' then p_body_md end,
       case when p_format = 'link' then trim(p_external_url) end,
       case when p_format = 'drive' then trim(p_drive_file_id) end,
       nullif(trim(coalesce(p_summary, '')), ''), coalesce(p_is_free, false))
    returning id into v_id;
    return v_id;
  end if;

  update public.resources
     set course_id     = p_course,
         title         = trim(p_title),
         kind          = p_kind,
         format        = p_format,
         body_md       = case when p_format = 'text' then p_body_md end,
         external_url  = case when p_format = 'link' then trim(p_external_url) end,
         drive_file_id = case when p_format = 'drive' then trim(p_drive_file_id) end,
         summary       = nullif(trim(coalesce(p_summary, '')), ''),
         is_free       = coalesce(p_is_free, false),
         updated_at    = now()
   where id = p_resource
     and (public.is_staff() or exists (
       select 1 from public.courses c where c.id = resources.course_id and c.created_by = auth.uid()
     ))
  returning id into v_id;

  if v_id is null then
    raise exception 'NOT_YOURS' using errcode = '42501';
  end if;

  return v_id;
end $$;

/*
 * Publish or unpublish.
 *
 * published_at doubles as the visibility flag — `resources: free or enrolled`
 * is filtered on it in the reading queries — so this is the switch that makes a
 * note real. Publishing notifies the course; unpublishing does not, because a
 * student who already read it does not need telling it was withdrawn.
 */
create or replace function public.set_resource_published(p_resource uuid, p_published boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_course uuid;
  v_title  text;
  v_was    timestamptz;
begin
  select course_id, title, published_at into v_course, v_title, v_was
    from public.resources where id = p_resource;

  if not found then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not (public.is_staff() or exists (
    select 1 from public.courses c where c.id = v_course and c.created_by = auth.uid()
  )) then
    raise exception 'NOT_YOURS' using errcode = '42501';
  end if;

  update public.resources
     set published_at = case when p_published then coalesce(published_at, now()) else null end,
         updated_at = now()
   where id = p_resource;

  -- Only on the transition into published. Re-publishing something that was
  -- already live would notify everyone a second time for no reason.
  if p_published and v_was is null and v_course is not null then
    perform public.enqueue_for_course(
      v_course, 'resource.published', 'New material: ' || v_title,
      'New study material has been added to your course.',
      jsonb_build_object('url', '/app/notes/' || p_resource::text, 'resource_id', p_resource),
      'resource');
  end if;
end $$;

create or replace function public.delete_resource(p_resource uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_course uuid;
begin
  select course_id into v_course from public.resources where id = p_resource;
  if not found then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not (public.is_staff() or exists (
    select 1 from public.courses c where c.id = v_course and c.created_by = auth.uid()
  )) then
    raise exception 'NOT_YOURS' using errcode = '42501';
  end if;

  delete from public.resources where id = p_resource;
end $$;

-- -----------------------------------------------------------------------------
-- Reading
-- -----------------------------------------------------------------------------

/*
 * Records one open, and returns the external URL if there is one.
 *
 * The URL is returned by this function rather than rendered into the page for
 * the same reason the Meet link is: a URL in the HTML is a URL that can be
 * forwarded to someone who never had access. Here it also means the click
 * cannot happen without the log line.
 *
 * Enrolment is re-checked rather than assumed from RLS, because this runs as
 * SECURITY DEFINER and would otherwise hand the URL to anyone who asked.
 */
create or replace function public.log_resource_view(
  p_resource  uuid,
  p_device_id text default null,
  p_ip        inet  default null
)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_course uuid;
  v_free   boolean;
  v_url    text;
  v_published timestamptz;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select course_id, is_free, external_url, published_at
    into v_course, v_free, v_url, v_published
  from public.resources where id = p_resource;

  if not found then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_published is null and not (public.is_staff() or exists (
    select 1 from public.courses c where c.id = v_course and c.created_by = auth.uid()
  )) then
    raise exception 'NOT_PUBLISHED' using errcode = '42501';
  end if;

  if not (v_free or v_course is null or public.is_enrolled(v_course) or public.is_staff()
          or exists (select 1 from public.courses c where c.id = v_course and c.created_by = auth.uid())) then
    raise exception 'NOT_ENROLLED' using errcode = '42501';
  end if;

  insert into public.resource_views (resource_id, user_id, device_id, ip)
  values (p_resource, auth.uid(), p_device_id, p_ip);

  return v_url;
end $$;

/*
 * Who has read this, and how often. Educator and staff only.
 *
 * Deliberately not a leaderboard for students. Reading counts are a signal
 * about the material as much as the reader — a note nobody opened is usually a
 * note nobody could find.
 */
create or replace function public.get_resource_readers(p_resource uuid)
returns table (
  user_id    uuid,
  full_name  text,
  email      text,
  views      integer,
  last_read  timestamptz
)
language plpgsql security definer set search_path = public
as $$
declare v_course uuid;
begin
  select course_id into v_course from public.resources where id = p_resource;
  if not found then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not (public.is_staff() or exists (
    select 1 from public.courses c where c.id = v_course and c.created_by = auth.uid()
  )) then
    raise exception 'NOT_PERMITTED' using errcode = '42501';
  end if;

  return query
  select v.user_id, p.full_name, p.email::text, count(*)::int, max(v.created_at)
    from public.resource_views v
    join public.profiles p on p.id = v.user_id
   where v.resource_id = p_resource
   group by v.user_id, p.full_name, p.email
   order by count(*) desc, p.full_name;
end $$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke all on function public.upsert_resource(uuid, uuid, text, text, text, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.set_resource_published(uuid, boolean)  from public, anon, authenticated;
revoke all on function public.delete_resource(uuid)                  from public, anon, authenticated;
revoke all on function public.log_resource_view(uuid, text, inet)    from public, anon, authenticated;
revoke all on function public.get_resource_readers(uuid)             from public, anon, authenticated;

grant execute on function public.upsert_resource(uuid, uuid, text, text, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.set_resource_published(uuid, boolean)  to authenticated;
grant execute on function public.delete_resource(uuid)                  to authenticated;
grant execute on function public.log_resource_view(uuid, text, inet)    to authenticated;
grant execute on function public.get_resource_readers(uuid)             to authenticated;

grant select on public.resource_views to authenticated;

-- external_url is revoked for the same reason join_url is: a URL rendered into
-- the page is a URL that can be forwarded to someone who never had access.
-- log_resource_view() is the only way to obtain it, and it cannot return one
-- without writing the log line first.
revoke select (external_url) on public.resources from anon, authenticated;
