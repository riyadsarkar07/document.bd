'use client';

import {
  settleWithTimeout,
  supabaseData,
  timedOutQuery,
  WORKSPACE_QUERY_TIMEOUT_MS,
} from '@/lib/supabase/client';
import { escapePostgrestSearch } from '@/lib/utils';
import { logAudit } from '@/lib/workspace/audit';
import {
  isBugKind,
  isBugSeverity,
  isBugStatus,
  OPEN_BUG_STATUSES,
  type BugHunterList,
  type BugHunterQuery,
  type BugHunterSummary,
  type BugReport,
  type BugSeverity,
  type BugStatus,
} from '@/lib/bug-hunter/types';

type BugRow = {
  id: string;
  bug_no: string;
  fingerprint: string;
  status: string;
  severity: string;
  kind: string;
  title: string;
  message: string;
  reason: string;
  route: string | null;
  component: string | null;
  endpoint: string | null;
  http_status: number | null;
  supabase_code: string | null;
  user_id: string | null;
  user_email: string | null;
  user_role: string | null;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  browser: string | null;
  device: string | null;
  stack: string | null;
  created_at: string;
  updated_at: string;
};

function fail(message: string): string {
  return message.replace(/^(?:error:|ERROR:)\s*/i, '').trim() || 'Request failed.';
}

function mapBug(row: BugRow): BugReport {
  return {
    id: row.id,
    bugNo: row.bug_no,
    fingerprint: row.fingerprint,
    status: isBugStatus(row.status) ? row.status : 'new',
    severity: isBugSeverity(row.severity) ? row.severity : 'medium',
    kind: isBugKind(row.kind) ? row.kind : 'exception',
    title: row.title,
    message: row.message,
    reason: row.reason,
    route: row.route,
    component: row.component,
    endpoint: row.endpoint,
    httpStatus: row.http_status,
    supabaseCode: row.supabase_code,
    userId: row.user_id,
    userEmail: row.user_email,
    userRole: row.user_role,
    occurrenceCount: row.occurrence_count,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    browser: row.browser,
    device: row.device,
    stack: row.stack,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLS =
  'id, bug_no, fingerprint, status, severity, kind, title, message, reason, route, component, endpoint, http_status, supabase_code, user_id, user_email, user_role, occurrence_count, first_seen_at, last_seen_at, browser, device, stack, created_at, updated_at';

export async function listBugReports(q: BugHunterQuery = {}): Promise<BugHunterList> {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 20));

  let query = supabaseData.from('bug_reports').select(SELECT_COLS, { count: 'exact' });
  const search = escapePostgrestSearch(q.search ?? '');
  if (search) {
    query = query.or(
      `bug_no.ilike.%${search}%,title.ilike.%${search}%,message.ilike.%${search}%,route.ilike.%${search}%,endpoint.ilike.%${search}%`,
    );
  }
  if (q.status) query = query.eq('status', q.status);
  else query = query.in('status', OPEN_BUG_STATUSES);
  if (q.severity) query = query.eq('severity', q.severity);
  if (q.route) query = query.ilike('route', `${escapePostgrestSearch(q.route)}%`);
  if (q.dateFrom) query = query.gte('last_seen_at', new Date(`${q.dateFrom}T00:00:00`).toISOString());
  if (q.dateTo) query = query.lte('last_seen_at', new Date(`${q.dateTo}T23:59:59.999`).toISOString());

  query = query.order('last_seen_at', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);

  const { data, error, count } = await settleWithTimeout(
    query,
    timedOutQuery('Bug Hunter request timed out.'),
    WORKSPACE_QUERY_TIMEOUT_MS,
  );
  if (error) {
    return { bugs: [], total: 0, page, pageSize, error: fail(error.message) };
  }
  const bugs = ((data ?? []) as BugRow[]).map(mapBug);
  return { bugs, total: count ?? bugs.length, page, pageSize, error: null };
}

export async function getBugReport(id: string): Promise<{ bug: BugReport | null; error: string | null }> {
  const { data, error } = await settleWithTimeout(
    supabaseData.from('bug_reports').select(SELECT_COLS).eq('id', id).maybeSingle(),
    timedOutQuery('Bug Hunter request timed out.'),
    WORKSPACE_QUERY_TIMEOUT_MS,
  );
  if (error) return { bug: null, error: fail(error.message) };
  if (!data) return { bug: null, error: 'Bug not found.' };
  return { bug: mapBug(data as BugRow), error: null };
}

export async function getBugHunterSummary(): Promise<{ summary: BugHunterSummary; error: string | null }> {
  const empty: BugHunterSummary = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    openCount: 0,
    resolvedCount: 0,
    ignoredCount: 0,
    total: 0,
    frequent: [],
  };
  const { data, error } = await settleWithTimeout(
    supabaseData.rpc('bug_hunter_summary'),
    timedOutQuery('Bug Hunter summary timed out.'),
    WORKSPACE_QUERY_TIMEOUT_MS,
  );
  if (error) return { summary: empty, error: fail(error.message) };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { summary: empty, error: null };
  const record = row as Record<string, unknown>;
  const frequentRaw = Array.isArray(record.frequent) ? record.frequent : [];
  return {
    summary: {
      critical: Number(record.critical ?? 0),
      high: Number(record.high ?? 0),
      medium: Number(record.medium ?? 0),
      low: Number(record.low ?? 0),
      openCount: Number(record.open_count ?? 0),
      resolvedCount: Number(record.resolved_count ?? 0),
      ignoredCount: Number(record.ignored_count ?? 0),
      total: Number(record.total ?? 0),
      frequent: frequentRaw.map((item) => {
        const r = item as Record<string, unknown>;
        return {
          id: String(r.id ?? ''),
          bugNo: String(r.bug_no ?? ''),
          title: String(r.title ?? ''),
          severity: (isBugSeverity(r.severity) ? r.severity : 'medium') as BugSeverity,
          occurrenceCount: Number(r.occurrence_count ?? 0),
          route: typeof r.route === 'string' ? r.route : null,
        };
      }),
    },
    error: null,
  };
}

export async function setBugStatus(
  id: string,
  status: BugStatus,
): Promise<{ bug: BugReport | null; error: string | null }> {
  const { data, error } = await supabaseData.rpc('update_bug_report_status', {
    p_id: id,
    p_status: status,
  });
  if (error || !data) {
    return { bug: null, error: fail(error?.message ?? 'Could not update bug.') };
  }
  const bug = mapBug(data as BugRow);
  void logAudit({
    action: `bug.${status}`,
    targetType: 'bug_report',
    targetId: bug.bugNo,
    metadata: { status, severity: bug.severity },
  });
  return { bug, error: null };
}

export async function clearResolvedBugs(): Promise<{ deleted: number; error: string | null }> {
  const { data, error } = await supabaseData.rpc('clear_resolved_bug_reports');
  if (error) return { deleted: 0, error: fail(error.message) };
  const deleted = typeof data === 'number' ? data : Number(data ?? 0);
  void logAudit({
    action: 'bug.cleared',
    targetType: 'bug_report',
    metadata: { deleted },
  });
  return { deleted, error: null };
}

export function subscribeBugHunter(onChange: () => void): () => void {
  const channel = supabaseData
    .channel(`bug-hunter-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bug_reports' }, onChange)
    .subscribe();
  return () => {
    void supabaseData.removeChannel(channel);
  };
}

export function formatBugDetails(bug: BugReport): string {
  return [
    `Bug ID: ${bug.bugNo}`,
    `Status: ${bug.status}`,
    `Severity: ${bug.severity}`,
    `Kind: ${bug.kind}`,
    `Title: ${bug.title}`,
    `Message: ${bug.message}`,
    `Reason: ${bug.reason}`,
    `Route: ${bug.route ?? '—'}`,
    `Component: ${bug.component ?? '—'}`,
    `Endpoint: ${bug.endpoint ?? '—'}`,
    `HTTP status: ${bug.httpStatus ?? '—'}`,
    `Supabase code: ${bug.supabaseCode ?? '—'}`,
    `User: ${bug.userEmail ?? '—'} (${bug.userRole ?? '—'})`,
    `Occurrences: ${bug.occurrenceCount}`,
    `First seen: ${bug.firstSeenAt}`,
    `Last seen: ${bug.lastSeenAt}`,
    `Browser: ${bug.browser ?? '—'}`,
    `Device: ${bug.device ?? '—'}`,
    `Stack:`,
    bug.stack ?? '—',
  ].join('\n');
}

export async function copyBugDetails(bug: BugReport): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(formatBugDetails(bug));
    return true;
  } catch {
    return false;
  }
}

export function listDistinctRoutes(bugs: BugReport[]): string[] {
  return Array.from(new Set(bugs.map((b) => b.route).filter((r): r is string => Boolean(r)))).sort();
}