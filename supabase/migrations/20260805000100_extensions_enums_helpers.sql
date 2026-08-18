-- =============================================================================
-- 0001 · Extensions, enums and RLS helper functions
-- docs/02-DATABASE-SCHEMA.md §1
--
-- Every helper is SECURITY DEFINER with an explicit search_path. Without the
-- search_path pin, a caller could shadow `public` and escalate privileges.
-- They are STABLE so the planner caches them per statement, which keeps the
-- extra lookup in every RLS policy effectively free.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";
create extension if not exists "pg_trgm";
create extension if not exists "btree_gist";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
do $$ begin
  create type app_role as enum ('student','educator','admin','support','developer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type course_status as enum ('draft','pending_review','published','archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lesson_kind as enum ('video','pdf','quiz','live','text');
exception when duplicate_object then null; end $$;

do $$ begin
  create type enrollment_state as enum ('active','expired','refunded','suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type live_provider as enum ('meet','youtube','livekit');
exception when duplicate_object then null; end $$;

do $$ begin
  create type live_status as enum ('scheduled','live','ended','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum ('created','pending','paid','failed','refunded','partially_refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type doubt_status as enum ('open','answered','resolved','closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_status as enum ('open','pending','resolved','closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type priority_level as enum ('low','medium','high','urgent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type setting_type as enum
    ('boolean','integer','number','string','text','enum','json','duration_minutes','color','url','email');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Shared trigger: keep updated_at honest
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

comment on function public.touch_updated_at is
  'Attach as a BEFORE UPDATE trigger on every table carrying updated_at.';
