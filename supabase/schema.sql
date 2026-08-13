-- ═══════════════════════════════════════════════════════════════════════
-- Document Studio — Supabase Schema
-- Run this in the Supabase SQL editor to enable the admin system.
-- The original `certificates` table is preserved as-is.
-- ═══════════════════════════════════════════════════════════════════════

-- ────────────────────────── profiles ──────────────────────────
-- Maps auth.users -> role (admin / editor / viewer)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Anyone signed in can read profiles (needed for user listing)
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

-- Users can read the whole directory (self-service listing)
create policy "profiles_select_directory" on public.profiles
  for select using (auth.role() = 'authenticated');

-- A user can insert their own profile row on first sign-in
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- Admins can update roles (admin determined via profiles.role)
create policy "profiles_admin_update" on public.profiles
  for update using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "profiles_admin_delete" on public.profiles
  for delete using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ────────────────────────── templates ──────────────────────────
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('tm', 'nid', 'tin')),
  description text,
  state jsonb not null default '{}'::jsonb,
  thumbnail text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upgrade older databases whose check constraint only allowed ('tm','nid')
do $$
begin
  alter table public.templates drop constraint if exists templates_kind_check;
  alter table public.templates add constraint templates_kind_check
    check (kind in ('tm', 'nid', 'tin'));
exception when others then
  raise notice 'templates_kind_check upgrade skipped: %', sqlerrm;
end $$;

alter table public.templates enable row level security;

create policy "templates_read" on public.templates
  for select using (auth.role() = 'authenticated');

create policy "templates_write" on public.templates
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  );

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

-- Upgrade older databases whose check constraint only allowed ('tm','nid')
do $$
begin
  alter table public.projects drop constraint if exists projects_kind_check;
  alter table public.projects add constraint projects_kind_check
    check (kind in ('tm', 'nid', 'tin'));
exception when others then
  raise notice 'projects_kind_check upgrade skipped: %', sqlerrm;
end $$;

alter table public.projects enable row level security;

create policy "projects_read_own" on public.projects
  for select using (auth.uid() = owner_id);

create policy "projects_write_own" on public.projects
  for all using (auth.uid() = owner_id);

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

-- Signed-in users can write logs
create policy "activity_logs_insert" on public.activity_logs
  for insert with check (auth.role() = 'authenticated');

-- Admins can read the full audit trail
create policy "activity_logs_admin_read" on public.activity_logs
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

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
--   synced_at timestamptz not null default now()
-- );
--
-- Note: if you recreate this table you must restore the anon insert/select/delete
-- policies used by the original application (RLS off or permissive) so the vault
-- still works.

-- ────────────────────────── indexes ──────────────────────────
create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists activity_logs_created_idx on public.activity_logs (created_at desc);
create index if not exists templates_kind_idx on public.templates (kind);
create index if not exists projects_owner_idx on public.projects (owner_id);
