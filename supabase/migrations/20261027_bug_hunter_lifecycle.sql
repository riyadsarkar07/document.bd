-- Bug Hunter lifecycle: keep resolved fingerprints closed on ingest,
-- record who/when resolved a row, and let admins close stale Open bugs
-- without deleting history or auto-resolving later recurrences.
--
-- Apply in the Supabase SQL editor (or `supabase db push` / migration runner)
-- against the production project. Safe to re-run.

alter table public.bug_reports add column if not exists resolved_at timestamptz;
alter table public.bug_reports add column if not exists resolved_by uuid references auth.users (id) on delete set null;

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
          when public.bug_reports.status = 'resolved' then 'resolved'
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
         updated_at = now(),
         resolved_at = case
           when p_status = 'resolved' then now()
           else null
         end,
         resolved_by = case
           when p_status = 'resolved' then auth.uid()
           else null
         end
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

create or replace function public.resolve_stale_bug_reports(p_before timestamptz)
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
  if p_before is null then
    raise exception 'cutoff required';
  end if;
  update public.bug_reports
     set status = 'resolved',
         updated_at = now(),
         resolved_at = coalesce(resolved_at, now()),
         resolved_by = coalesce(resolved_by, auth.uid())
   where status in ('new', 'investigating')
     and last_seen_at < p_before;
  get diagnostics n = row_count;
  return coalesce(n, 0);
end;
$$;

revoke all on function public.resolve_stale_bug_reports(timestamptz) from public;
grant execute on function public.resolve_stale_bug_reports(timestamptz) to authenticated;

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
   where status in ('resolved', 'ignored');
  get diagnostics n = row_count;
  return coalesce(n, 0);
end;
$$;

revoke all on function public.clear_resolved_bug_reports() from public;
grant execute on function public.clear_resolved_bug_reports() to authenticated;

update public.bug_reports
   set status = 'resolved',
       updated_at = now(),
       resolved_at = coalesce(resolved_at, now())
 where status in ('new', 'investigating')
   and last_seen_at < timestamptz '2026-10-27 00:00:00+00'
   and (
     bug_no in (
       'BUG-20260924-0001',
       'BUG-20260924-0002',
       'BUG-20260924-0003',
       'BUG-20260924-0004',
       'BUG-20260924-0005',
       'BUG-20260924-0006'
     )
     or supabase_code in ('PGRST301', 'PGRST303')
   );
