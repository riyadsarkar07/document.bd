-- One active Privatix mailbox association per authenticated user.
-- Restored on sign-in across devices. Messages stay with the provider.
-- HMAC inbox tokens are re-issued on restore and are never stored here.
--
-- Apply in the Supabase SQL editor (or `supabase db push` / migration runner)
-- against the production project. Safe to re-run.

create table if not exists public.tempmail_inboxes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  domain text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tempmail_inboxes enable row level security;

create index if not exists tempmail_inboxes_email_idx on public.tempmail_inboxes (email);

revoke all on table public.tempmail_inboxes from anon, public;
grant select, insert, update on table public.tempmail_inboxes to authenticated;

drop policy if exists "tempmail_inboxes_select_own" on public.tempmail_inboxes;
create policy "tempmail_inboxes_select_own" on public.tempmail_inboxes
  for select using (
    user_id = auth.uid()
    and public.is_active_user(auth.uid())
    and public.has_tool_access(auth.uid(), 'tempmail')
  );

drop policy if exists "tempmail_inboxes_insert_own" on public.tempmail_inboxes;
create policy "tempmail_inboxes_insert_own" on public.tempmail_inboxes
  for insert with check (
    user_id = auth.uid()
    and public.is_active_user(auth.uid())
    and public.has_tool_access(auth.uid(), 'tempmail')
  );

drop policy if exists "tempmail_inboxes_update_own" on public.tempmail_inboxes;
create policy "tempmail_inboxes_update_own" on public.tempmail_inboxes
  for update using (
    user_id = auth.uid()
    and public.is_active_user(auth.uid())
    and public.has_tool_access(auth.uid(), 'tempmail')
  ) with check (
    user_id = auth.uid()
    and public.is_active_user(auth.uid())
    and public.has_tool_access(auth.uid(), 'tempmail')
  );
