-- ═══════════════════════════════════════════════════════════════════════
-- Document Studio — Supabase Schema (idempotent, ordered migration)
-- Run this in the Supabase SQL editor to enable the admin system.
--
-- ORDER MATTERS: everything is laid out so that a referenced object
-- always exists before it is used.
--   STEP 1 — Required schema/columns   (tables + new columns + RLS enabled)
--   STEP 2 — indexes / constraints
--   STEP 3 — helper functions / RPCs   (validated against STEP 1 columns)
--   STEP 4 — RLS policies              (validated against STEP 3 functions)
--   STEP 5 — Admin bootstrap / update  (existing admin UUID profile)
--
-- Safe to re-run: columns use `add column if not exists`, policies are
-- dropped before being recreated, functions use `create or replace`, and
-- indexes use `create index if not exists`.
-- The original `certificates` table schema is preserved as-is; STEP 4 adds
-- per-user RLS isolation to the vault so users only see their own records.
-- ═══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════
-- STEP 1 — Required schema / columns
-- ═══════════════════════════════════════════════════════════════════════

-- ────────────────────────── profiles ──────────────────────────
-- Maps auth.users -> role (admin / editor / viewer), account status and limits.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  max_projects int,
  max_documents int,
  max_exports int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upgrade existing databases that predate the admin system.
alter table public.profiles add column if not exists status text not null default 'active' check (status in ('active', 'disabled'));
alter table public.profiles add column if not exists max_projects int;
alter table public.profiles add column if not exists max_documents int;
alter table public.profiles add column if not exists max_exports int;

alter table public.profiles enable row level security;

-- ────────────────────────── templates ──────────────────────────
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('tm', 'nid', 'tin')),
  description text,
  state jsonb not null default '{}'::jsonb,
  thumbnail text,
  created_by text,
  owner_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.templates enable row level security;

-- Upgrade older databases that predate per-user template ownership so the
-- RLS "own template" policies below can match on owner_id.
alter table public.templates add column if not exists owner_id uuid references auth.users (id) on delete set null;

-- ────────────────────────── projects ──────────────────────────
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('tm', 'nid', 'tin')),
  state jsonb not null default '{}'::jsonb,
  owner_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;

-- ────────────────────────── activity_logs ──────────────────────────
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  email text,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

alter table public.activity_logs enable row level security;

-- ═══════════════════════════════════════════════════════════════════════
-- STEP 2 — indexes / constraints
-- ═══════════════════════════════════════════════════════════════════════

-- Upgrade older databases whose check constraint only allowed ('tm','nid')
-- so both templates and projects accept 'tin' (newest document kind).
do $$
begin
  alter table public.templates drop constraint if exists templates_kind_check;
  alter table public.templates add constraint templates_kind_check
    check (kind in ('tm', 'nid', 'tin'));
exception when others then
  raise notice 'templates_kind_check upgrade skipped: %', sqlerrm;
end $$;

do $$
begin
  alter table public.projects drop constraint if exists projects_kind_check;
  alter table public.projects add constraint projects_kind_check
    check (kind in ('tm', 'nid', 'tin'));
exception when others then
  raise notice 'projects_kind_check upgrade skipped: %', sqlerrm;
end $$;

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_status_idx on public.profiles (status);
create index if not exists activity_logs_created_idx on public.activity_logs (created_at desc);
create index if not exists activity_logs_action_idx on public.activity_logs (action);
create index if not exists templates_kind_idx on public.templates (kind);
create index if not exists templates_owner_idx on public.templates (owner_id);
create index if not exists projects_owner_idx on public.projects (owner_id);

-- ═══════════════════════════════════════════════════════════════════════
-- STEP 3 — helper functions / RPCs
-- All columns referenced below were created in STEP 1.
-- ═══════════════════════════════════════════════════════════════════════

-- Is the current request authenticated as an active admin?
create or replace function public.is_admin()
returns boolean
language sql stable security definer
as $$
  select coalesce(
    (select p.role = 'admin' and p.status = 'active' from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

-- Is this user account in the active state? (used to gate data access)
create or replace function public.is_active_user(uid uuid)
returns boolean
language sql stable security definer
as $$
  select coalesce((select p.status = 'active' from public.profiles p where p.id = uid), true);
$$;

-- May this user create a new project row (enforces max_projects)?
create or replace function public.can_create_project(uid uuid)
returns boolean
language sql stable security definer
as $$
  select coalesce((
    select p.status = 'active'
      and (p.max_projects is null or p.max_projects > (select count(*) from public.projects pr where pr.owner_id = uid))
    from public.profiles p
    where p.id = uid
  ), true);
$$;

-- May this user record an activity action (enforces max_documents / max_exports)?
create or replace function public.can_log_action(uid uuid, action text)
returns boolean
language sql stable security definer
as $$
  select coalesce((
    select
      case
        when action like 'export.%' then
          p.max_exports is null
            or p.max_exports > (select count(*) from public.activity_logs a where a.user_id = uid and a.action like 'export.%')
        when action like 'save.%' or action = 'project.save' then
          p.max_documents is null
            or p.max_documents > (select count(*) from public.activity_logs a where a.user_id = uid and (a.action like 'save.%' or a.action = 'project.save'))
        else true
      end
    from public.profiles p
    where p.id = uid
  ), true);
$$;

-- Current user's own usage + configured limits (RPC: my_usage)
create or replace function public.my_usage()
returns table (
  projects bigint,
  documents bigint,
  exports bigint,
  max_projects int,
  max_documents int,
  max_exports int,
  status text
)
language sql stable security definer
as $$
  select
    (select count(*) from public.projects pr where pr.owner_id = auth.uid()),
    (select count(*) from public.activity_logs a where a.user_id = auth.uid() and (a.action like 'save.%' or a.action = 'project.save')),
    (select count(*) from public.activity_logs a where a.user_id = auth.uid() and a.action like 'export.%'),
    p.max_projects,
    p.max_documents,
    p.max_exports,
    p.status
  from public.profiles p
  where p.id = auth.uid();
$$;

-- Per-user usage for the admin panel (RPC: admin_user_usage, admin only)
create or replace function public.admin_user_usage()
returns table (
  user_id uuid,
  projects bigint,
  documents bigint,
  exports bigint
)
language sql stable security definer
as $$
  select
    p.id,
    (select count(*) from public.projects pr where pr.owner_id = p.id),
    (select count(*) from public.activity_logs a where a.user_id = p.id and (a.action like 'save.%' or a.action = 'project.save')),
    (select count(*) from public.activity_logs a where a.user_id = p.id and a.action like 'export.%')
  from public.profiles p
  where public.is_admin();
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- STEP 4 — RLS policies
-- All functions referenced below were created in STEP 3.
-- ═══════════════════════════════════════════════════════════════════════

-- ────────────────────────── profiles ──────────────────────────

-- Users can read their own profile (needed for auth/profile bootstrap)
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

-- Only admins can read the full user directory (user management).
-- The old open directory policy is removed so the directory is never
-- exposed to non-admin users.
drop policy if exists "profiles_select_directory" on public.profiles;
drop policy if exists "profiles_admin_select" on public.profiles;
create policy "profiles_admin_select" on public.profiles
  for select using (public.is_admin());

-- A user can insert their own profile row on first sign-in.
-- Non-admin users may only self-register as 'viewer'; the allowlisted admin
-- UUID may self-register as 'admin'. This prevents role self-escalation.
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (
    auth.uid() = id
    and status = 'active'
    and (
      role = 'viewer'
      or (id = 'c2b13e27-3845-48e6-ad41-07a398ea9d60' and role = 'admin')
    )
  );

-- Admins can update any other profile (roles, status, limits) but never
-- their own account (prevents self-disable / self-demotion).
drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
  for update using (
    public.is_admin() and id <> auth.uid()
  ) with check (
    public.is_admin() and id <> auth.uid()
  );

-- Admins can remove a profile row but never their own.
drop policy if exists "profiles_admin_delete" on public.profiles;
create policy "profiles_admin_delete" on public.profiles
  for delete using (public.is_admin() and id <> auth.uid());

-- ────────────────────────── templates ──────────────────────────

-- Active users can read their OWN templates; admins can read every template.
-- The previous "any active user reads all templates" policy is removed so one
-- user's private templates never surface for another user.
drop policy if exists "templates_read" on public.templates;
drop policy if exists "templates_write" on public.templates;
drop policy if exists "templates_select_own" on public.templates;
create policy "templates_select_own" on public.templates
  for select using (
    (owner_id = auth.uid() and public.is_active_user(auth.uid()))
    or public.is_admin()
  );

-- Active admins/editors can create templates, always attributed to themselves.
drop policy if exists "templates_insert_own" on public.templates;
create policy "templates_insert_own" on public.templates
  for insert with check (
    public.is_active_user(auth.uid())
    and (owner_id = auth.uid() or public.is_admin())
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  );

-- Active admins/editors can update their own templates; admins can update any.
drop policy if exists "templates_update_own" on public.templates;
create policy "templates_update_own" on public.templates
  for update using (
    (owner_id = auth.uid() and public.is_active_user(auth.uid()))
    or public.is_admin()
  ) with check (
    public.is_active_user(auth.uid())
    and (owner_id = auth.uid() or public.is_admin())
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  );

-- Active users can delete their own templates; admins can delete any.
drop policy if exists "templates_delete_own" on public.templates;
create policy "templates_delete_own" on public.templates
  for delete using (
    (owner_id = auth.uid() and public.is_active_user(auth.uid()))
    or public.is_admin()
  );

-- ────────────────────────── projects ──────────────────────────

-- Active users can read/update/delete their OWN projects (admins can access
-- every project); new project creation is gated by max_projects server-side.
drop policy if exists "projects_read_own" on public.projects;
drop policy if exists "projects_write_own" on public.projects;
drop policy if exists "projects_select" on public.projects;
drop policy if exists "projects_insert" on public.projects;
drop policy if exists "projects_update" on public.projects;
drop policy if exists "projects_delete" on public.projects;
drop policy if exists "projects_read_active_own" on public.projects;
drop policy if exists "projects_insert_own" on public.projects;
drop policy if exists "projects_update_own" on public.projects;
drop policy if exists "projects_delete_own" on public.projects;
create policy "projects_read_active_own" on public.projects
  for select using ((auth.uid() = owner_id and public.is_active_user(auth.uid())) or public.is_admin());
create policy "projects_insert_own" on public.projects
  for insert with check (auth.uid() = owner_id and (public.can_create_project(auth.uid()) or public.is_admin()));
create policy "projects_update_own" on public.projects
  for update using ((auth.uid() = owner_id and public.is_active_user(auth.uid())) or public.is_admin());
create policy "projects_delete_own" on public.projects
  for delete using ((auth.uid() = owner_id and public.is_active_user(auth.uid())) or public.is_admin());

-- ────────────────────────── activity_logs ──────────────────────────

-- Active users can write logs about themselves; export/save actions are gated
-- by limits. user_id is locked to the caller so nobody can log activity as
-- another user through a direct API request.
drop policy if exists "activity_logs_insert" on public.activity_logs;
create policy "activity_logs_insert" on public.activity_logs
  for insert with check (
    auth.role() = 'authenticated'
    and public.is_active_user(auth.uid())
    and user_id = auth.uid()
    and public.can_log_action(auth.uid(), action)
  );

-- Active users can read their own activity only.
drop policy if exists "activity_logs_select_own" on public.activity_logs;
create policy "activity_logs_select_own" on public.activity_logs
  for select using (user_id = auth.uid() and public.is_active_user(auth.uid()));

-- Admins can read the full audit trail
drop policy if exists "activity_logs_admin_read" on public.activity_logs;
create policy "activity_logs_admin_read" on public.activity_logs
  for select using (public.is_admin());

-- ────────────────────────── certificates (cloud vault) ──────────────────────────
-- The vault was originally readable/writable by everyone (legacy permissive
-- policies). It is now locked to per-user records: normal users can only see
-- and manage certificates they created (created_by = auth.uid()); admins can
-- see and manage everything. Legacy rows with created_by NULL become invisible
-- to normal users, so no certificate leaks across accounts.
--
-- Guarded by a table-existence check because some environments do not create
-- the legacy vault table at all (schema.sql uses `alter table if exists` for it).
do $$
declare
  pol record;
begin
  if to_regclass('public.certificates') is null then
    raise notice 'certificates table absent — vault RLS skipped';
    return;
  end if;

  alter table public.certificates enable row level security;

  -- Drop every pre-existing certificate policy (unknown legacy / permissive /
  -- anon rules) so the per-user rules below are the only authority on the table.
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'certificates'
  loop
    execute format('drop policy if exists %I on public.certificates', pol.policyname);
  end loop;

  -- Revoke legacy anon access; the app writes through authenticated sessions.
  execute 'revoke all on table public.certificates from anon';
  execute 'grant select, insert, update, delete on table public.certificates to authenticated';

  execute $sql$
    create policy "certificates_select_own" on public.certificates
    for select using (
      (created_by = auth.uid() and public.is_active_user(auth.uid()))
      or public.is_admin()
    )
  $sql$;

  execute $sql$
    create policy "certificates_insert_own" on public.certificates
    for insert with check (
      auth.role() = 'authenticated'
      and public.is_active_user(auth.uid())
      and (created_by = auth.uid() or public.is_admin())
    )
  $sql$;

  execute $sql$
    create policy "certificates_update_own" on public.certificates
    for update using (
      (created_by = auth.uid() and public.is_active_user(auth.uid()))
      or public.is_admin()
    ) with check (
      (created_by = auth.uid() and public.is_active_user(auth.uid()))
      or public.is_admin()
    )
  $sql$;

  execute $sql$
    create policy "certificates_delete_own" on public.certificates
    for delete using (
      (created_by = auth.uid() and public.is_active_user(auth.uid()))
      or public.is_admin()
    )
  $sql$;
end $$;

-- ═══════════════════════════════════════════════════════════════════════
-- STEP 5 — Admin bootstrap / update for the existing UUID
-- ═══════════════════════════════════════════════════════════════════════

-- ────────────────────────── certificates (preserved) ──────────────────────────
-- The original vault table. Columns must match the legacy writer exactly.
-- create table if not exists public.certificates (
--   id bigint generated by default as identity primary key,
--   registration_no bigint,
--   trademark_no text,
--   reg_date text,
--   name text,
--   owner_name text,
--   address text,
--   company_type text,
--   app_date text,
--   details text,
--   sealed_date text,
--   synced_at timestamptz not null default now(),
--   logo_data_url text
-- );
--
-- Note: if you recreate this table you must restore the per-user RLS policies
-- defined in STEP 4 (own-or-admin) so the isolated vault keeps working.

-- Persist the uploaded logo image with vault records so History can restore it.
-- `if exists` guards environments where the legacy vault table is absent.
alter table if exists public.certificates add column if not exists logo_data_url text;

-- Track which user created/exported each vault record so the History view can
-- show the real creator's email (profiles.email). Legacy rows stay NULL and
-- render as "—". `on delete set null` keeps History readable if a user is removed.
alter table if exists public.certificates add column if not exists created_by uuid references auth.users (id) on delete set null;

-- Index only applies to databases that actually have the legacy vault table
-- (some fresh environments do not create it, so the columns above use `if exists`).
do $$
begin
  if to_regclass('public.certificates') is not null then
    create index if not exists certificates_created_by_idx on public.certificates (created_by);
  end if;
end $$;

-- Recognize the authorized admin account (UUID allowlist).
-- If the auth user already has a profile, promote it to admin/active.
-- If the auth user does not exist yet, the profile is created as admin on
-- first sign-in (the insert policy allowlists this UUID for role='admin').
do $$
begin
  update public.profiles
     set role = 'admin', status = 'active', email = 'riyadsarkar1243@gmail.com'
   where id = 'c2b13e27-3845-48e6-ad41-07a398ea9d60';

  if not found then
    if exists (select 1 from auth.users where id = 'c2b13e27-3845-48e6-ad41-07a398ea9d60') then
      insert into public.profiles (id, email, role, status)
      values ('c2b13e27-3845-48e6-ad41-07a398ea9d60', 'riyadsarkar1243@gmail.com', 'admin', 'active');
    else
      raise notice 'Admin auth user does not exist yet — profile will be created as admin on first sign-in';
    end if;
  end if;
end $$;
