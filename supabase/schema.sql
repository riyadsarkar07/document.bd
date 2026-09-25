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

-- ────────────────────────── profiles — tool access & generation limits ──────────────────────────
-- Per-user tool/page access + generation limits (admin-managed). All columns
-- default to the "no restriction" state so existing users keep full access:
--   allowed_tools   explicit list of tool scopes the user may use; NULL = all tools.
--   gen_period      rolling window for the generation cap ('daily'/'weekly'/'monthly');
--                   'unlimited' (default) disables the period cap regardless of gen_limit.
--   gen_limit       max generations (certificate exports) inside the window; NULL = unlimited.
--   can_self_publish  the user has purchased/paid and may publish their OWN vault
--                     records to the public verification portal (server-enforced).
alter table public.profiles add column if not exists allowed_tools text[];
alter table public.profiles add column if not exists gen_period text not null default 'unlimited'
  check (gen_period in ('daily', 'weekly', 'monthly', 'unlimited'));
alter table public.profiles add column if not exists gen_limit int;
alter table public.profiles add column if not exists can_self_publish boolean not null default false;

alter table public.profiles enable row level security;

-- ────────────────────────── templates ──────────────────────────
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('tm', 'nid', 'tin', 'unhcr')),
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
  kind text not null check (kind in ('tm', 'nid', 'tin', 'unhcr')),
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

-- ────────────────────────── audit_logs ──────────────────────────
-- Immutable admin audit trail for vault lifecycle + user management.
-- Differs from activity_logs: it records an actor plus a target and metadata
-- (vault trademark no, project id, etc.) and is write-only to the app — only
-- admins may read it. Used by the Activity > Audit Trail tab.
create table if not exists public.audit_logs (
  id bigint generated by default as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  actor_email text,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

-- ────────────────────────── support tickets ──────────────────────────
-- User/admin Support Inbox. Ticket numbers are generated server-side
-- (SUP-YYYYMMDD-XXXX). Users only ever see their own tickets; admins see
-- every ticket. Internal notes live in a separate table so they cannot leak
-- through the public message thread.
create table if not exists public.support_ticket_counters (
  day date primary key,
  last_n int not null default 0
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_no text not null unique,
  user_id uuid not null references auth.users (id) on delete cascade,
  user_email text,
  category text not null check (category in (
    'bug',
    'account',
    'document-editor',
    'pdf-editor',
    'payment',
    'other'
  )),
  subject text not null,
  status text not null default 'open' check (status in (
    'open',
    'in_review',
    'waiting_for_user',
    'escalated',
    'resolved',
    'closed'
  )),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_admin_id uuid references auth.users (id) on delete set null,
  assigned_admin_email text,
  last_reply_at timestamptz,
  last_reply_by text check (last_reply_by in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  author_email text,
  author_role text not null check (author_role in ('user', 'admin')),
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.support_notes (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  author_email text,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.support_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  message_id uuid references public.support_messages (id) on delete set null,
  uploaded_by uuid references auth.users (id) on delete set null,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  byte_size int not null check (byte_size > 0 and byte_size <= 8388608),
  created_at timestamptz not null default now()
);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_notes enable row level security;
alter table public.support_attachments enable row level security;
alter table public.support_ticket_counters enable row level security;

-- ═══════════════════════════════════════════════════════════════════════
-- STEP 2 — indexes / constraints
-- ═══════════════════════════════════════════════════════════════════════

-- Upgrade older databases whose check constraint only allowed ('tm','nid')
-- so both templates and projects accept 'tin' (newest document kind).
do $$
begin
  alter table public.templates drop constraint if exists templates_kind_check;
  alter table public.templates add constraint templates_kind_check
    check (kind in ('tm', 'nid', 'tin', 'unhcr'));
exception when others then
  raise notice 'templates_kind_check upgrade skipped: %', sqlerrm;
end $$;

do $$
begin
  alter table public.projects drop constraint if exists projects_kind_check;
  alter table public.projects add constraint projects_kind_check
    check (kind in ('tm', 'nid', 'tin', 'unhcr'));
exception when others then
  raise notice 'projects_kind_check upgrade skipped: %', sqlerrm;
end $$;

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_status_idx on public.profiles (status);
create index if not exists activity_logs_created_idx on public.activity_logs (created_at desc);
create index if not exists activity_logs_action_idx on public.activity_logs (action);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id);
create index if not exists audit_logs_action_idx on public.audit_logs (action);
create index if not exists audit_logs_target_idx on public.audit_logs (target_type, target_id);
create index if not exists templates_kind_idx on public.templates (kind);
create index if not exists templates_owner_idx on public.templates (owner_id);
create index if not exists projects_owner_idx on public.projects (owner_id);
create index if not exists support_tickets_user_idx on public.support_tickets (user_id, created_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets (status, created_at desc);
create index if not exists support_tickets_category_idx on public.support_tickets (category);
create index if not exists support_tickets_assigned_idx on public.support_tickets (assigned_admin_id);
create index if not exists support_tickets_no_idx on public.support_tickets (ticket_no);
create index if not exists support_messages_ticket_idx on public.support_messages (ticket_id, created_at);
create index if not exists support_notes_ticket_idx on public.support_notes (ticket_id, created_at);
create index if not exists support_attachments_ticket_idx on public.support_attachments (ticket_id);

-- ═══════════════════════════════════════════════════════════════════════
-- STEP 3 — helper functions / RPCs
-- All columns referenced below were created in STEP 1.
-- ═══════════════════════════════════════════════════════════════════════

-- Is the current request authenticated as an active admin?
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
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
set search_path = public
as $$
  select case
    when uid is distinct from auth.uid() and not public.is_admin() then false
    else coalesce((select p.status = 'active' from public.profiles p where p.id = uid), true)
  end;
$$;

-- Map a generation/save activity action to the tool scope it belongs to
-- ('tm' / 'nid' / 'tin' / 'unhcr' / 'projects'). Returns NULL for actions that are not
-- tool-bound (e.g. 'publish.ui').
create or replace function public.action_scope(action text)
returns text
language sql immutable
as $$
  select case
    when action like 'export.tm.%' or action like 'save.tm.%' then 'tm'
    when action like 'export.nid.%' or action like 'save.nid.%' then 'nid'
    when action like 'export.tin.%' or action like 'save.tin.%' then 'tin'
    when action like 'export.unhcr.%' or action like 'save.unhcr.%' then 'unhcr'
    when action = 'project.save' then 'projects'
    else null
  end;
$$;

-- May this user use the given tool scope? Admins always pass; a NULL
-- allowed_tools (unset) grants every tool for backward compatibility.
create or replace function public.has_tool_access(uid uuid, scope text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select case
    when uid is distinct from auth.uid() and not public.is_admin() then false
    else coalesce((
      select
        p.status = 'active'
        and (p.role = 'admin' or p.allowed_tools is null or coalesce(scope = any(p.allowed_tools), false))
      from public.profiles p
      where p.id = uid
    ), false)
  end;
$$;

-- Number of generations (certificate exports) logged by the user inside the
-- rolling window for `period`. Any period other than daily/weekly/monthly
-- returns the lifetime count (used when the cap is disabled).
create or replace function public.generation_count_in_period(uid uuid, period text)
returns bigint
language sql stable security definer
set search_path = public
as $$
  select case
    when uid is distinct from auth.uid() and not public.is_admin() then 0::bigint
    else (
      select count(*) from public.activity_logs a
      where a.user_id = uid
        and a.action like 'export.%'
        and case period
          when 'daily' then a.created_at >= now() - interval '1 day'
          when 'weekly' then a.created_at >= now() - interval '1 week'
          when 'monthly' then a.created_at >= now() - interval '1 month'
          else true
        end
    )
  end;
$$;

-- May this user generate a certificate right now? Enforces the per-user
-- generation cap (gen_limit over the rolling gen_period window). Admins and
-- 'unlimited' periods are always allowed.
create or replace function public.can_generate(uid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select case
    when uid is distinct from auth.uid() and not public.is_admin() then false
    else coalesce((
      select
        p.status = 'active'
        and (
          p.role = 'admin'
          or p.gen_period = 'unlimited'
          or p.gen_limit is null
          or p.gen_limit > public.generation_count_in_period(uid, p.gen_period)
        )
      from public.profiles p
      where p.id = uid
    ), true)
  end;
$$;

-- May this user create a new project row (enforces max_projects)?
create or replace function public.can_create_project(uid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select case
    when uid is distinct from auth.uid() and not public.is_admin() then false
    else coalesce((
      select p.status = 'active'
        and (p.max_projects is null or p.max_projects > (select count(*) from public.projects pr where pr.owner_id = uid))
      from public.profiles p
      where p.id = uid
    ), true)
  end;
$$;

-- May this user record an activity action?
--   export.*   -> max_exports (lifetime) AND generation cap (gen_limit over the
--                rolling gen_period window) AND access to the exporting tool.
--   save.*     -> max_documents (lifetime) AND access to the saving tool.
-- Tool access + generation limits are enforced HERE (server-side RLS gate),
-- not only in the UI.
create or replace function public.can_log_action(uid uuid, action text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select case
    when uid is distinct from auth.uid() and not public.is_admin() then false
    else coalesce((
      select
        case
          when action like 'export.%' then
            (p.max_exports is null
              or p.max_exports > (select count(*) from public.activity_logs a where a.user_id = uid and a.action like 'export.%'))
            and public.can_generate(uid)
            and public.has_tool_access(uid, coalesce(public.action_scope(action), 'tm'))
          when action like 'save.%' or action = 'project.save' then
            (p.max_documents is null
              or p.max_documents > (select count(*) from public.activity_logs a where a.user_id = uid and (a.action like 'save.%' or a.action = 'project.save')))
            and public.has_tool_access(uid, coalesce(public.action_scope(action), 'tm'))
          else true
        end
      from public.profiles p
      where p.id = uid
    ), true)
  end;
$$;

-- Current user's own usage + configured limits (RPC: my_usage)
-- PostgreSQL forbids changing a function's return row type via CREATE OR REPLACE
-- (ERROR 42P13), so the existing function is dropped first. No tables, views or
-- policies depend on this RPC; EXECUTE privilege reverts to PUBLIC on recreation.
drop function if exists public.my_usage();

create or replace function public.my_usage()
returns table (
  projects bigint,
  documents bigint,
  exports bigint,
  generations bigint,
  max_projects int,
  max_documents int,
  max_exports int,
  gen_limit int,
  gen_period text,
  allowed_tools text[],
  can_self_publish boolean,
  status text
)
language sql stable security definer
set search_path = public
as $$
  select
    (select count(*) from public.projects pr where pr.owner_id = auth.uid()),
    (select count(*) from public.activity_logs a where a.user_id = auth.uid() and (a.action like 'save.%' or a.action = 'project.save')),
    (select count(*) from public.activity_logs a where a.user_id = auth.uid() and a.action like 'export.%'),
    public.generation_count_in_period(auth.uid(), p.gen_period),
    p.max_projects,
    p.max_documents,
    p.max_exports,
    p.gen_limit,
    p.gen_period,
    p.allowed_tools,
    p.can_self_publish,
    p.status
  from public.profiles p
  where p.id = auth.uid();
$$;

-- Per-user usage for the admin panel (RPC: admin_user_usage, admin only)
-- `last_activity` = most recent activity_logs entry (saves / exports / admin).
-- PostgreSQL forbids changing a function's return row type via CREATE OR REPLACE
-- (ERROR 42P13 "cannot change return type of existing function"), so the
-- existing function is dropped before the new signature (with `last_activity`)
-- is created. No tables, views, or policies depend on this RPC, and its
-- EXECUTE privilege reverts to the default (PUBLIC) on recreation, matching
-- the original definition.
drop function if exists public.admin_user_usage();

create or replace function public.admin_user_usage()
returns table (
  user_id uuid,
  projects bigint,
  documents bigint,
  exports bigint,
  generations bigint,
  last_activity timestamptz
)
language sql stable security definer
set search_path = public
as $$
  select
    p.id,
    (select count(*) from public.projects pr where pr.owner_id = p.id),
    (select count(*) from public.activity_logs a where a.user_id = p.id and (a.action like 'save.%' or a.action = 'project.save')),
    (select count(*) from public.activity_logs a where a.user_id = p.id and a.action like 'export.%'),
    public.generation_count_in_period(p.id, p.gen_period),
    (select max(a.created_at) from public.activity_logs a where a.user_id = p.id)
  from public.profiles p
  where public.is_admin();
$$;

-- Active (non-trashed) certificate vault count per user for the admin panel.
-- (RPC: admin_certificate_counts, admin only.) Uses dynamic SQL because the
-- legacy `certificates` table may not exist in every environment.
create or replace function public.admin_certificate_counts()
returns table (user_id uuid, total bigint)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    return;
  end if;
  if to_regclass('public.certificates') is null then
    return;
  end if;
  return query execute
    'select created_by::uuid, count(*) from public.certificates
      where deleted_at is null and created_by is not null
        and trademark_no is distinct from ''UNHCR-CURRENT''
      group by created_by';
end $$;

-- Helper RPCs used by RLS stay callable by authenticated sessions only.
-- Admin-only RPCs remain executable (they no-op unless is_admin()).
revoke all on function public.is_admin() from public;
revoke all on function public.is_active_user(uuid) from public;
revoke all on function public.has_tool_access(uuid, text) from public;
revoke all on function public.generation_count_in_period(uuid, text) from public;
revoke all on function public.can_generate(uuid) from public;
revoke all on function public.can_create_project(uuid) from public;
revoke all on function public.can_log_action(uuid, text) from public;
revoke all on function public.my_usage() from public;
revoke all on function public.admin_user_usage() from public;
revoke all on function public.admin_certificate_counts() from public;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active_user(uuid) to authenticated;
grant execute on function public.has_tool_access(uuid, text) to authenticated;
grant execute on function public.generation_count_in_period(uuid, text) to authenticated;
grant execute on function public.can_generate(uuid) to authenticated;
grant execute on function public.can_create_project(uuid) to authenticated;
grant execute on function public.can_log_action(uuid, text) to authenticated;
grant execute on function public.my_usage() to authenticated;
grant execute on function public.admin_user_usage() to authenticated;
grant execute on function public.admin_certificate_counts() to authenticated;

-- Allocate the next unique Support ticket number (SUP-YYYYMMDD-XXXX).
-- SECURITY DEFINER so the counter table stays hidden from clients; the
-- caller must still be an authenticated active user.
create or replace function public.next_support_ticket_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'utc')::date;
  n int;
  stamp text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_active_user(auth.uid()) then
    raise exception 'account is not active';
  end if;
  insert into public.support_ticket_counters (day, last_n)
  values (today, 1)
  on conflict (day) do update
    set last_n = public.support_ticket_counters.last_n + 1
  returning last_n into n;
  stamp := to_char(today, 'YYYYMMDD');
  return 'SUP-' || stamp || '-' || lpad(n::text, 4, '0');
end;
$$;

revoke all on function public.next_support_ticket_no() from public;
grant execute on function public.next_support_ticket_no() to authenticated;

-- Does the current user own this ticket, or are they an admin?
create or replace function public.can_access_support_ticket(tid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1 from public.support_tickets t
      where t.id = tid
        and t.user_id = auth.uid()
        and public.is_active_user(auth.uid())
    );
$$;

revoke all on function public.can_access_support_ticket(uuid) from public;
grant execute on function public.can_access_support_ticket(uuid) to authenticated;

-- Bump last_reply_* whenever a public message is posted. Runs as definer so
-- users never need UPDATE on support_tickets (they must not change status).
create or replace function public.touch_support_ticket_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.support_tickets
     set last_reply_at = new.created_at,
         last_reply_by = new.author_role,
         updated_at = now()
   where id = new.ticket_id;
  return new;
end;
$$;

drop trigger if exists support_messages_touch_ticket on public.support_messages;
create trigger support_messages_touch_ticket
  after insert on public.support_messages
  for each row execute function public.touch_support_ticket_on_message();

-- Create a ticket + opening message. Locks user_id to auth.uid() and
-- generates ticket_no server-side so the client cannot impersonate.
create or replace function public.create_support_ticket(
  p_category text,
  p_subject text,
  p_body text
)
returns public.support_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  email text;
  ticket public.support_tickets;
  subj text := trim(p_subject);
  body text := trim(p_body);
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_active_user(uid) then
    raise exception 'account is not active';
  end if;
  if p_category not in ('bug', 'account', 'document-editor', 'pdf-editor', 'payment', 'other') then
    raise exception 'invalid category';
  end if;
  if char_length(subj) < 3 or char_length(subj) > 160 then
    raise exception 'subject must be 3–160 characters';
  end if;
  if char_length(body) < 8 or char_length(body) > 8000 then
    raise exception 'description must be 8–8000 characters';
  end if;

  select p.email into email from public.profiles p where p.id = uid;

  insert into public.support_tickets (
    ticket_no, user_id, user_email, category, subject, status, priority
  ) values (
    public.next_support_ticket_no(), uid, email, p_category, subj, 'open', 'normal'
  )
  returning * into ticket;

  insert into public.support_messages (ticket_id, author_id, author_email, author_role, body)
  values (ticket.id, uid, email, 'user', body);

  select * into ticket from public.support_tickets where id = ticket.id;
  return ticket;
end;
$$;

revoke all on function public.create_support_ticket(text, text, text) from public;
grant execute on function public.create_support_ticket(text, text, text) to authenticated;

-- Post a public reply. Locks author_id / author_role server-side.
create or replace function public.reply_support_ticket(p_ticket_id uuid, p_body text)
returns public.support_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  email text;
  role_label text;
  ticket public.support_tickets;
  msg public.support_messages;
  body text := trim(p_body);
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.can_access_support_ticket(p_ticket_id) then
    raise exception 'ticket not found';
  end if;
  if char_length(body) < 1 or char_length(body) > 8000 then
    raise exception 'reply must be 1–8000 characters';
  end if;

  select * into ticket from public.support_tickets where id = p_ticket_id;
  if ticket.status = 'closed' and not public.is_admin() then
    raise exception 'this ticket is closed';
  end if;

  select p.email into email from public.profiles p where p.id = uid;
  role_label := case when public.is_admin() then 'admin' else 'user' end;
  if role_label = 'user' and ticket.user_id is distinct from uid then
    raise exception 'ticket not found';
  end if;

  insert into public.support_messages (ticket_id, author_id, author_email, author_role, body)
  values (p_ticket_id, uid, email, role_label, body)
  returning * into msg;

  return msg;
end;
$$;

revoke all on function public.reply_support_ticket(uuid, text) from public;
grant execute on function public.reply_support_ticket(uuid, text) to authenticated;

-- Admin-only status / priority / assignment updates. Never trusts a
-- client-supplied user_id or ticket_no.
create or replace function public.update_support_ticket(
  p_ticket_id uuid,
  p_status text default null,
  p_priority text default null,
  p_assign_self boolean default null
)
returns public.support_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  email text;
  ticket public.support_tickets;
begin
  if not public.is_admin() then
    raise exception 'admin required';
  end if;
  select * into ticket from public.support_tickets where id = p_ticket_id;
  if ticket.id is null then
    raise exception 'ticket not found';
  end if;
  if p_status is not null and p_status not in ('open', 'in_review', 'waiting_for_user', 'escalated', 'resolved', 'closed') then
    raise exception 'invalid status';
  end if;
  if p_priority is not null and p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'invalid priority';
  end if;

  select p.email into email from public.profiles p where p.id = uid;

  update public.support_tickets
     set status = coalesce(p_status, status),
         priority = coalesce(p_priority, priority),
         assigned_admin_id = case
           when p_assign_self is true then uid
           when p_assign_self is false then assigned_admin_id
           else assigned_admin_id
         end,
         assigned_admin_email = case
           when p_assign_self is true then email
           else assigned_admin_email
         end,
         updated_at = now()
   where id = p_ticket_id
  returning * into ticket;

  return ticket;
end;
$$;

revoke all on function public.update_support_ticket(uuid, text, text, boolean) from public;
grant execute on function public.update_support_ticket(uuid, text, text, boolean) to authenticated;

-- Admin view of an Open ticket moves it to In Review. Other statuses
-- (waiting_for_user / escalated / resolved / closed / in_review) are unchanged.
create or replace function public.mark_support_ticket_in_review(p_ticket_id uuid)
returns public.support_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  ticket public.support_tickets;
begin
  if not public.is_admin() then
    raise exception 'admin required';
  end if;
  update public.support_tickets
     set status = 'in_review',
         updated_at = now()
   where id = p_ticket_id
     and status = 'open'
  returning * into ticket;
  if ticket.id is null then
    select * into ticket from public.support_tickets where id = p_ticket_id;
    if ticket.id is null then
      raise exception 'ticket not found';
    end if;
  end if;
  return ticket;
end;
$$;

revoke all on function public.mark_support_ticket_in_review(uuid) from public;
grant execute on function public.mark_support_ticket_in_review(uuid) to authenticated;

-- Admin-only internal note. Never visible through support_messages.
create or replace function public.add_support_note(p_ticket_id uuid, p_body text)
returns public.support_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  email text;
  note public.support_notes;
  body text := trim(p_body);
begin
  if not public.is_admin() then
    raise exception 'admin required';
  end if;
  if not exists (select 1 from public.support_tickets where id = p_ticket_id) then
    raise exception 'ticket not found';
  end if;
  if char_length(body) < 1 or char_length(body) > 8000 then
    raise exception 'note must be 1–8000 characters';
  end if;
  select p.email into email from public.profiles p where p.id = uid;
  insert into public.support_notes (ticket_id, author_id, author_email, body)
  values (p_ticket_id, uid, email, body)
  returning * into note;
  return note;
end;
$$;

revoke all on function public.add_support_note(uuid, text) from public;
grant execute on function public.add_support_note(uuid, text) to authenticated;

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
-- user's private templates never surface for another user. Access to the
-- Templates tool itself is gated server-side by has_tool_access(..,'templates').
drop policy if exists "templates_read" on public.templates;
drop policy if exists "templates_write" on public.templates;
drop policy if exists "templates_select_own" on public.templates;
create policy "templates_select_own" on public.templates
  for select using (
    (owner_id = auth.uid() and public.is_active_user(auth.uid()) and public.has_tool_access(auth.uid(), 'templates'))
    or public.is_admin()
  );

-- Active admins/editors can create templates, always attributed to themselves.
drop policy if exists "templates_insert_own" on public.templates;
create policy "templates_insert_own" on public.templates
  for insert with check (
    public.is_active_user(auth.uid())
    and public.has_tool_access(auth.uid(), 'templates')
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
    and public.has_tool_access(auth.uid(), 'templates')
    and (owner_id = auth.uid() or public.is_admin())
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  );

-- Active users can delete their own templates; admins can delete any.
drop policy if exists "templates_delete_own" on public.templates;
create policy "templates_delete_own" on public.templates
  for delete using (
    (owner_id = auth.uid() and public.is_active_user(auth.uid()) and public.has_tool_access(auth.uid(), 'templates'))
    or public.is_admin()
  );

-- ────────────────────────── projects ──────────────────────────

-- Active users can read/update/delete their OWN projects (admins can access
-- every project); new project creation is gated by max_projects server-side.
-- The Projects tool itself is gated server-side by has_tool_access(..,'projects').
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
  for select using ((auth.uid() = owner_id and public.is_active_user(auth.uid()) and public.has_tool_access(auth.uid(), 'projects')) or public.is_admin());
create policy "projects_insert_own" on public.projects
  for insert with check (auth.uid() = owner_id and public.has_tool_access(auth.uid(), 'projects') and (public.can_create_project(auth.uid()) or public.is_admin()));
create policy "projects_update_own" on public.projects
  for update using ((auth.uid() = owner_id and public.is_active_user(auth.uid()) and public.has_tool_access(auth.uid(), 'projects')) or public.is_admin());
create policy "projects_delete_own" on public.projects
  for delete using ((auth.uid() = owner_id and public.is_active_user(auth.uid()) and public.has_tool_access(auth.uid(), 'projects')) or public.is_admin());

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

-- ────────────────────────── audit_logs ──────────────────────────
-- Write-only to the app: any authenticated active user may insert an audit
-- entry about their own action (actor_id is locked to the caller). Only
-- admins may read the trail back.
drop policy if exists "audit_logs_insert" on public.audit_logs;
create policy "audit_logs_insert" on public.audit_logs
  for insert with check (
    auth.role() = 'authenticated'
    and public.is_active_user(auth.uid())
    and actor_id = auth.uid()
  );

drop policy if exists "audit_logs_admin_read" on public.audit_logs;
create policy "audit_logs_admin_read" on public.audit_logs
  for select using (public.is_admin());

-- ────────────────────────── certificates (cloud vault) ──────────────────────────
-- The vault was originally readable/writable by everyone (legacy permissive
-- policies). It is now locked to per-user records: normal users can only see
-- and manage certificates they created (created_by = auth.uid()); admins can
-- see and manage everything. Legacy rows with created_by NULL become invisible
-- to normal users, so no certificate leaks across accounts.
--
-- Trash / restore are soft operations (UPDATE on `deleted_at`) and are allowed
-- for the record owner (or any admin). Permanent delete is a hard DELETE and is
-- ADMIN-ONLY (policy `certificates_delete_admin` below), so a normal user can
-- never destroy vault rows — even their own.
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

  -- Permanent (hard) delete is ADMIN-ONLY. Trash / restore are UPDATEs on
  -- `deleted_at` (handled by the update policy above), so owners can still
  -- soft-delete and restore their own records; only a hard DELETE that removes
  -- the row is restricted to admins. This stops normal users from destroying
  -- their own vault history while the admin audit trail stays authoritative.
  execute $sql$
    create policy "certificates_delete_admin" on public.certificates
    for delete using (public.is_admin())
  $sql$;
end $$;

-- Shared UNHCR editor workspace (`UNHCR-CURRENT`). Certificates RLS stays
-- owner-or-admin so private History cases never leak. These SECURITY DEFINER
-- RPCs expose only the singleton current-state row to users who already have
-- the `unhcr` tool (admins included). History listing must not use them.
create or replace function public.get_unhcr_current_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  row jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.has_tool_access(auth.uid(), 'unhcr') then
    raise exception 'unhcr access required';
  end if;
  if to_regclass('public.certificates') is null then
    return null;
  end if;
  select to_jsonb(c) into row
    from public.certificates c
   where c.trademark_no = 'UNHCR-CURRENT'
   limit 1;
  if row is not null and row ? 'deleted_at' and row->>'deleted_at' is not null then
    return null;
  end if;
  return row;
end;
$$;

revoke all on function public.get_unhcr_current_state() from public;
grant execute on function public.get_unhcr_current_state() to authenticated;

create or replace function public.save_unhcr_current_state(
  p_title text,
  p_subtitle text,
  p_details text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  result jsonb;
  title text := coalesce(nullif(trim(p_title), ''), 'UNHCR ID');
  subtitle text := coalesce(p_subtitle, '');
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.has_tool_access(uid, 'unhcr') then
    raise exception 'unhcr access required';
  end if;
  if to_regclass('public.certificates') is null then
    raise exception 'certificates table absent';
  end if;
  if p_details is null or char_length(p_details) = 0 then
    raise exception 'missing editor state';
  end if;
  if char_length(p_details) > 20000000 then
    raise exception 'editor state too large';
  end if;

  update public.certificates
     set name = title,
         owner_name = subtitle,
         details = p_details,
         company_type = 'UNHCR ID',
         synced_at = now(),
         deleted_at = null
   where trademark_no = 'UNHCR-CURRENT';

  if not found then
    begin
      insert into public.certificates (
        trademark_no, registration_no, reg_date, name, owner_name, address,
        company_type, app_date, details, sealed_date, synced_at, created_by, deleted_at
      ) values (
        'UNHCR-CURRENT',
        floor(extract(epoch from now()))::bigint,
        '',
        title,
        subtitle,
        '',
        'UNHCR ID',
        '',
        p_details,
        '',
        now(),
        uid,
        null
      );
    exception
      when unique_violation then
        update public.certificates
           set name = title,
               owner_name = subtitle,
               details = p_details,
               company_type = 'UNHCR ID',
               synced_at = now(),
               deleted_at = null
         where trademark_no = 'UNHCR-CURRENT';
    end;
  end if;

  select to_jsonb(c) into result
    from public.certificates c
   where c.trademark_no = 'UNHCR-CURRENT'
   limit 1;
  return result;
end;
$$;

revoke all on function public.save_unhcr_current_state(text, text, text) from public;
grant execute on function public.save_unhcr_current_state(text, text, text) to authenticated;

-- Shared UNHCR Server 2 editor workspace (`UNHCR-S2-CURRENT`). Independent of
-- Server 1 (`UNHCR-CURRENT`). Same `unhcr` tool access; History listing must
-- not use these RPCs.
create or replace function public.get_unhcr_s2_current_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  row jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.has_tool_access(auth.uid(), 'unhcr') then
    raise exception 'unhcr access required';
  end if;
  if to_regclass('public.certificates') is null then
    return null;
  end if;
  select to_jsonb(c) into row
    from public.certificates c
   where c.trademark_no = 'UNHCR-S2-CURRENT'
   limit 1;
  if row is not null and row ? 'deleted_at' and row->>'deleted_at' is not null then
    return null;
  end if;
  return row;
end;
$$;

revoke all on function public.get_unhcr_s2_current_state() from public;
grant execute on function public.get_unhcr_s2_current_state() to authenticated;

create or replace function public.save_unhcr_s2_current_state(
  p_title text,
  p_subtitle text,
  p_details text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  result jsonb;
  title text := coalesce(nullif(trim(p_title), ''), 'UNHCR ID Server 2');
  subtitle text := coalesce(p_subtitle, '');
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.has_tool_access(uid, 'unhcr') then
    raise exception 'unhcr access required';
  end if;
  if to_regclass('public.certificates') is null then
    raise exception 'certificates table absent';
  end if;
  if p_details is null or char_length(p_details) = 0 then
    raise exception 'missing editor state';
  end if;
  if char_length(p_details) > 20000000 then
    raise exception 'editor state too large';
  end if;

  update public.certificates
     set name = title,
         owner_name = subtitle,
         details = p_details,
         company_type = 'UNHCR ID Server 2',
         synced_at = now(),
         deleted_at = null
   where trademark_no = 'UNHCR-S2-CURRENT';

  if not found then
    begin
      insert into public.certificates (
        trademark_no, registration_no, reg_date, name, owner_name, address,
        company_type, app_date, details, sealed_date, synced_at, created_by, deleted_at
      ) values (
        'UNHCR-S2-CURRENT',
        floor(extract(epoch from now()))::bigint,
        '',
        title,
        subtitle,
        '',
        'UNHCR ID Server 2',
        '',
        p_details,
        '',
        now(),
        uid,
        null
      );
    exception
      when unique_violation then
        update public.certificates
           set name = title,
               owner_name = subtitle,
               details = p_details,
               company_type = 'UNHCR ID Server 2',
               synced_at = now(),
               deleted_at = null
         where trademark_no = 'UNHCR-S2-CURRENT';
    end;
  end if;

  select to_jsonb(c) into result
    from public.certificates c
   where c.trademark_no = 'UNHCR-S2-CURRENT'
   limit 1;
  return result;
end;
$$;

revoke all on function public.save_unhcr_s2_current_state(text, text, text) from public;
grant execute on function public.save_unhcr_s2_current_state(text, text, text) to authenticated;

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

-- Persist the sealed statement phrase as typed (including consecutive periods
-- such as `....day of....Month.......`). History publish re-renders from the
-- vault row, so this must be stored verbatim or the dots are lost.
alter table if exists public.certificates add column if not exists sealed_text_phrase text;

-- Persist seal/signature (and other) layout coordinates so History View/Publish
-- re-renders with the same anchors Instant Download used. Legacy rows stay NULL
-- and keep TM_DEFAULTS, so existing certificates are unchanged.
alter table if exists public.certificates add column if not exists layout_json jsonb;

-- Persist the uploaded logo image with vault records so History can restore it.
-- `if exists` guards environments where the legacy vault table is absent.
alter table if exists public.certificates add column if not exists logo_data_url text;

-- Track which user created/exported each vault record so the History view can
-- show the real creator's email (profiles.email). Legacy rows stay NULL and
-- render as "—". `on delete set null` keeps History readable if a user is removed.
alter table if exists public.certificates add column if not exists created_by uuid references auth.users (id) on delete set null;

-- Soft-delete flag for the vault trash flow. NULL = active record;
-- a timestamp = record moved to Trash (hidden from normal views, restorable).
alter table if exists public.certificates add column if not exists deleted_at timestamptz;

-- Publish pipeline state for the public verification portal
-- (dpdt-govbd-main). NULL publish_status = never published.
--   'published'  -> committed to GitHub AND confirmed live on Vercel
--   'pending'    -> committed to GitHub but not yet confirmed on the live site
--   'failed'     -> the publish attempt failed (GitHub/validation), record intact
--   'unpublished'-> removed from the portal (vault record retained for republish)
alter table if exists public.certificates add column if not exists publish_status text;
alter table if exists public.certificates add column if not exists published_at timestamptz;
alter table if exists public.certificates add column if not exists publish_commit_sha text;
alter table if exists public.certificates add column if not exists publish_error text;

-- Index only applies to databases that actually have the legacy vault table
-- (some fresh environments do not create it, so the columns above use `if exists`).
do $$
begin
  if to_regclass('public.certificates') is not null then
    create index if not exists certificates_created_by_idx on public.certificates (created_by);
    create index if not exists certificates_deleted_idx on public.certificates (deleted_at);
  end if;
end $$;

-- ────────────────────────── support tickets (RLS) ──────────────────────────
-- Users can only see and write their own tickets. Admins can see every
-- ticket. Ticket numbers, user_id, and status transitions are locked by
-- WITH CHECK so the client cannot impersonate another user or invent ids.
-- Internal notes are admin-only. Attachments inherit ticket access.

revoke all on table public.support_tickets from anon, public;
revoke all on table public.support_messages from anon, public;
revoke all on table public.support_notes from anon, public;
revoke all on table public.support_attachments from anon, public;
revoke all on table public.support_ticket_counters from anon, public, authenticated;
grant select on table public.support_tickets to authenticated;
grant select on table public.support_messages to authenticated;
grant select on table public.support_notes to authenticated;
grant select, insert on table public.support_attachments to authenticated;

drop policy if exists "support_tickets_select" on public.support_tickets;
create policy "support_tickets_select" on public.support_tickets
  for select using (
    (user_id = auth.uid() and public.is_active_user(auth.uid()))
    or public.is_admin()
  );

drop policy if exists "support_tickets_insert" on public.support_tickets;
create policy "support_tickets_insert" on public.support_tickets
  for insert with check (
    auth.uid() = user_id
    and public.is_active_user(auth.uid())
    and status = 'open'
    and assigned_admin_id is null
    and ticket_no ~ '^SUP-[0-9]{8}-[0-9]{4}$'
  );

-- Users never UPDATE tickets (status/assignment/last_reply are owned by
-- RPCs and the message trigger). Admins may update any ticket.
drop policy if exists "support_tickets_update_user" on public.support_tickets;
drop policy if exists "support_tickets_update_admin" on public.support_tickets;
create policy "support_tickets_update_admin" on public.support_tickets
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "support_messages_select" on public.support_messages;
create policy "support_messages_select" on public.support_messages
  for select using (public.can_access_support_ticket(ticket_id));

drop policy if exists "support_messages_insert" on public.support_messages;
create policy "support_messages_insert" on public.support_messages
  for insert with check (
    public.can_access_support_ticket(ticket_id)
    and author_id = auth.uid()
    and (
      (author_role = 'user' and exists (
        select 1 from public.support_tickets t
        where t.id = ticket_id and t.user_id = auth.uid() and t.status not in ('closed')
      ))
      or (author_role = 'admin' and public.is_admin())
    )
  );

drop policy if exists "support_notes_select" on public.support_notes;
create policy "support_notes_select" on public.support_notes
  for select using (public.is_admin());

drop policy if exists "support_notes_insert" on public.support_notes;
create policy "support_notes_insert" on public.support_notes
  for insert with check (public.is_admin() and author_id = auth.uid());

drop policy if exists "support_attachments_select" on public.support_attachments;
create policy "support_attachments_select" on public.support_attachments
  for select using (public.can_access_support_ticket(ticket_id));

drop policy if exists "support_attachments_insert" on public.support_attachments;
create policy "support_attachments_insert" on public.support_attachments
  for insert with check (
    public.can_access_support_ticket(ticket_id)
    and uploaded_by = auth.uid()
    and byte_size > 0
    and byte_size <= 8388608
    and mime_type in (
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'application/pdf'
    )
  );

-- Counter table is only touched by next_support_ticket_no() (security definer).
drop policy if exists "support_counters_deny" on public.support_ticket_counters;
create policy "support_counters_deny" on public.support_ticket_counters
  for all using (false) with check (false);

-- ────────────────────────── support attachments storage ──────────────────────────
-- Private bucket. Object path is `<user_id>/<ticket_id>/<filename>` so users
-- can only upload/read under their own prefix; admins can read everything.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-attachments',
  'support-attachments',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 8388608,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

drop policy if exists "support_storage_select" on storage.objects;
create policy "support_storage_select" on storage.objects
  for select using (
    bucket_id = 'support-attachments'
    and (
      public.is_admin()
      or (auth.uid() is not null and (storage.foldername(name))[1] = auth.uid()::text)
    )
  );

drop policy if exists "support_storage_insert" on storage.objects;
create policy "support_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'support-attachments'
    and auth.uid() is not null
    and public.is_active_user(auth.uid())
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

-- Realtime: new messages / ticket status changes stream to open inboxes.
-- FULL replica identity is required so postgres_changes filters on ticket_id work.
alter table public.support_tickets replica identity full;
alter table public.support_messages replica identity full;
alter table public.support_notes replica identity full;
alter table public.support_attachments replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.support_tickets;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.support_messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.support_notes;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.support_attachments;
  exception when duplicate_object then null;
  end;
end $$;

-- ────────────────────────── Bug Hunter ──────────────────────────
-- Admin-only application error log. Clients cannot INSERT/UPDATE/DELETE
-- rows directly. Authenticated sessions submit sanitized payloads through
-- ingest_bug_report(), which locks user_id to auth.uid(), recomputes the
-- fingerprint, and upserts so identical errors increment occurrence_count
-- instead of creating thousands of duplicate rows. Stack traces and
-- internal details are never selectable except by is_admin().

create table if not exists public.bug_report_counters (
  day date primary key,
  last_n int not null default 0
);

create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  bug_no text not null unique,
  fingerprint text not null unique,
  status text not null default 'new' check (status in ('new', 'investigating', 'resolved', 'ignored')),
  severity text not null check (severity in ('critical', 'high', 'medium', 'low')),
  kind text not null check (kind in (
    'javascript',
    'promise',
    'api',
    'supabase',
    'auth',
    'rls',
    'rpc',
    'network',
    'load',
    'pdf',
    'save',
    'exception'
  )),
  title text not null,
  message text not null,
  reason text not null,
  route text,
  component text,
  endpoint text,
  http_status int,
  supabase_code text,
  user_id uuid references auth.users (id) on delete set null,
  user_email text,
  user_role text,
  occurrence_count int not null default 1 check (occurrence_count > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  browser text,
  device text,
  stack text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bug_reports enable row level security;
alter table public.bug_report_counters enable row level security;

create index if not exists bug_reports_status_idx on public.bug_reports (status, last_seen_at desc);
create index if not exists bug_reports_severity_idx on public.bug_reports (severity, last_seen_at desc);
create index if not exists bug_reports_route_idx on public.bug_reports (route);
create index if not exists bug_reports_last_seen_idx on public.bug_reports (last_seen_at desc);
create index if not exists bug_reports_user_idx on public.bug_reports (user_id);

create or replace function public.next_bug_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'utc')::date;
  n int;
  stamp text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.bug_report_counters (day, last_n)
  values (today, 1)
  on conflict (day) do update
    set last_n = public.bug_report_counters.last_n + 1
  returning last_n into n;
  stamp := to_char(today, 'YYYYMMDD');
  return 'BUG-' || stamp || '-' || lpad(n::text, 4, '0');
end;
$$;

revoke all on function public.next_bug_no() from public;
grant execute on function public.next_bug_no() to authenticated;

-- Server-side ingest. Recomputes fingerprint, locks the actor to auth.uid(),
-- and never trusts client-supplied user_id / status / bug_no.
-- Resolved fingerprints stay historical until the same error recurs, then
-- reopen as new. Ignored fingerprints stay ignored. Occurrence count and
-- first_seen_at are preserved for audit.
create or replace function public.ingest_bug_report(
  p_fingerprint text,
  p_kind text,
  p_severity text,
  p_title text,
  p_message text,
  p_reason text,
  p_route text default null,
  p_component text default null,
  p_endpoint text default null,
  p_http_status int default null,
  p_supabase_code text default null,
  p_browser text default null,
  p_device text default null,
  p_stack text default null,
  p_occurrences int default 1
)
returns public.bug_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  email text;
  role_label text;
  occ int := greatest(1, least(coalesce(p_occurrences, 1), 50));
  msg text := left(trim(coalesce(p_message, '')), 2000);
  title text := left(trim(coalesce(p_title, '')), 160);
  reason text := left(trim(coalesce(p_reason, '')), 400);
  kind text := coalesce(p_kind, 'exception');
  severity text := coalesce(p_severity, 'medium');
  fp text := left(trim(coalesce(p_fingerprint, '')), 32);
  row public.bug_reports;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_active_user(uid) then
    raise exception 'account is not active';
  end if;
  if char_length(msg) < 1 then
    raise exception 'message required';
  end if;
  if kind not in (
    'javascript','promise','api','supabase','auth','rls','rpc','network','load','pdf','save','exception'
  ) then
    kind := 'exception';
  end if;
  if severity not in ('critical', 'high', 'medium', 'low') then
    severity := 'medium';
  end if;
  if char_length(fp) < 4 then
    raise exception 'invalid fingerprint';
  end if;
  if char_length(title) < 1 then
    title := left(kind || ': ' || msg, 160);
  end if;
  if char_length(reason) < 1 then
    reason := 'An unexpected application exception was captured by Bug Hunter.';
  end if;

  select p.email, p.role into email, role_label from public.profiles p where p.id = uid;

  insert into public.bug_reports (
    bug_no, fingerprint, status, severity, kind, title, message, reason,
    route, component, endpoint, http_status, supabase_code,
    user_id, user_email, user_role, occurrence_count,
    first_seen_at, last_seen_at, browser, device, stack
  ) values (
    public.next_bug_no(), fp, 'new', severity, kind, title, msg, reason,
    nullif(left(trim(coalesce(p_route, '')), 300), ''),
    nullif(left(trim(coalesce(p_component, '')), 200), ''),
    nullif(left(trim(coalesce(p_endpoint, '')), 400), ''),
    case when p_http_status between 100 and 599 then p_http_status else null end,
    nullif(left(trim(coalesce(p_supabase_code, '')), 64), ''),
    uid, email, role_label, occ,
    now(), now(),
    nullif(left(trim(coalesce(p_browser, '')), 240), ''),
    nullif(left(trim(coalesce(p_device, '')), 80), ''),
    nullif(left(trim(coalesce(p_stack, '')), 8000), '')
  )
  on conflict (fingerprint) do update
    set occurrence_count = public.bug_reports.occurrence_count + occ,
        last_seen_at = now(),
        updated_at = now(),
        status = case
          when public.bug_reports.status = 'ignored' then 'ignored'
          when public.bug_reports.status = 'resolved' then 'new'
          else public.bug_reports.status
        end,
        message = excluded.message,
        reason = excluded.reason,
        title = excluded.title,
        severity = excluded.severity,
        kind = excluded.kind,
        route = excluded.route,
        component = excluded.component,
        endpoint = excluded.endpoint,
        http_status = excluded.http_status,
        supabase_code = excluded.supabase_code,
        browser = excluded.browser,
        device = excluded.device,
        stack = excluded.stack,
        user_id = excluded.user_id,
        user_email = excluded.user_email,
        user_role = excluded.user_role
  returning * into row;

  return row;
end;
$$;

revoke all on function public.ingest_bug_report(
  text, text, text, text, text, text, text, text, text, int, text, text, text, text, int
) from public;
grant execute on function public.ingest_bug_report(
  text, text, text, text, text, text, text, text, text, int, text, text, text, text, int
) to authenticated;

create or replace function public.update_bug_report_status(p_id uuid, p_status text)
returns public.bug_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.bug_reports;
begin
  if not public.is_admin() then
    raise exception 'admin required';
  end if;
  if p_status not in ('new', 'investigating', 'resolved', 'ignored') then
    raise exception 'invalid status';
  end if;
  update public.bug_reports
     set status = p_status,
         updated_at = now()
   where id = p_id
  returning * into row;
  if row.id is null then
    raise exception 'bug not found';
  end if;
  return row;
end;
$$;

revoke all on function public.update_bug_report_status(uuid, text) from public;
grant execute on function public.update_bug_report_status(uuid, text) to authenticated;

create or replace function public.clear_resolved_bug_reports()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if not public.is_admin() then
    raise exception 'admin required';
  end if;
  delete from public.bug_reports
   where status in ('resolved', 'ignored')
  returning 1 into n;
  get diagnostics n = row_count;
  return coalesce(n, 0);
end;
$$;

revoke all on function public.clear_resolved_bug_reports() from public;
grant execute on function public.clear_resolved_bug_reports() to authenticated;

drop function if exists public.bug_hunter_summary();

create or replace function public.bug_hunter_summary()
returns table (
  critical bigint,
  high bigint,
  medium bigint,
  low bigint,
  open_count bigint,
  resolved_count bigint,
  ignored_count bigint,
  total bigint,
  frequent jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.bug_reports b where b.severity = 'critical' and b.status in ('new', 'investigating')),
    (select count(*) from public.bug_reports b where b.severity = 'high' and b.status in ('new', 'investigating')),
    (select count(*) from public.bug_reports b where b.severity = 'medium' and b.status in ('new', 'investigating')),
    (select count(*) from public.bug_reports b where b.severity = 'low' and b.status in ('new', 'investigating')),
    (select count(*) from public.bug_reports b where b.status in ('new', 'investigating')),
    (select count(*) from public.bug_reports b where b.status = 'resolved'),
    (select count(*) from public.bug_reports b where b.status = 'ignored'),
    (select count(*) from public.bug_reports),
    coalesce((
      select jsonb_agg(item)
      from (
        select jsonb_build_object(
          'id', b.id,
          'bug_no', b.bug_no,
          'title', b.title,
          'severity', b.severity,
          'occurrence_count', b.occurrence_count,
          'route', b.route
        ) as item
        from public.bug_reports b
        where public.is_admin()
          and b.status in ('new', 'investigating')
        order by b.occurrence_count desc, b.last_seen_at desc
        limit 5
      ) ranked
    ), '[]'::jsonb)
  where public.is_admin();
$$;

revoke all on function public.bug_hunter_summary() from public;
grant execute on function public.bug_hunter_summary() to authenticated;

revoke all on table public.bug_reports from anon, public;
revoke all on table public.bug_report_counters from anon, public, authenticated;
grant select on table public.bug_reports to authenticated;

drop policy if exists "bug_reports_admin_select" on public.bug_reports;
create policy "bug_reports_admin_select" on public.bug_reports
  for select using (public.is_admin());

drop policy if exists "bug_reports_deny_insert" on public.bug_reports;
create policy "bug_reports_deny_insert" on public.bug_reports
  for insert with check (false);
drop policy if exists "bug_reports_deny_update" on public.bug_reports;
create policy "bug_reports_deny_update" on public.bug_reports
  for update using (false);
drop policy if exists "bug_reports_deny_delete" on public.bug_reports;
create policy "bug_reports_deny_delete" on public.bug_reports
  for delete using (false);

drop policy if exists "bug_counters_deny" on public.bug_report_counters;
create policy "bug_counters_deny" on public.bug_report_counters
  for all using (false) with check (false);

alter table public.bug_reports replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.bug_reports;
  exception when duplicate_object then null;
  end;
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
