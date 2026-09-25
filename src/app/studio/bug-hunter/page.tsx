'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Bug,
  Copy,
  EyeOff,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { AdminGuard } from '@/components/layout/admin-guard';
import {
  clearResolvedBugs,
  copyBugDetails,
  getBugHunterSummary,
  getBugReport,
  listBugReports,
  setBugStatus,
  subscribeBugHunter,
} from '@/lib/bug-hunter/api';
import {
  BUG_SEVERITIES,
  BUG_SEVERITY_LABEL,
  BUG_SEVERITY_TONE,
  BUG_STATUS_LABEL,
  BUG_STATUS_TONE,
  BUG_STATUSES,
  type BugHunterSummary,
  type BugReport,
  type BugSeverity,
  type BugStatus,
} from '@/lib/bug-hunter/types';
import { Card, PageHeader, StatCard } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldLabel, Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Pagination } from '@/components/ui/pagination';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { useToast } from '@/lib/toast/toast-provider';
import { cn, timeAgo } from '@/lib/utils';

const PAGE_SIZE = 20;

const EMPTY_SUMMARY: BugHunterSummary = {
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

function DetailRow({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="grid gap-1 border-b border-line py-2.5 sm:grid-cols-[160px_1fr]">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-dimm">{label}</div>
      <div className={cn('break-all text-sm text-primary', mono && 'font-mono text-[12px] text-muted')}>
        {value || '—'}
      </div>
    </div>
  );
}

function BugHunterPanel() {
  const toast = useToast();
  const [bugs, setBugs] = useState<BugReport[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [status, setStatus] = useState<BugStatus | ''>('');
  const [severity, setSeverity] = useState<BugSeverity | ''>('');
  const [route, setRoute] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<BugHunterSummary>(EMPTY_SUMMARY);
  const [selected, setSelected] = useState<BugReport | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list, stats] = await Promise.all([
        listBugReports({
          search: searchTerm,
          status,
          severity,
          route,
          dateFrom,
          dateTo,
          page,
          pageSize: PAGE_SIZE,
        }),
        getBugHunterSummary(),
      ]);
      setBugs(list.bugs);
      setTotal(list.total);
      setError(list.error ?? stats.error);
      setSummary(stats.summary);
    } catch (err) {
      setBugs([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : 'Could not load bugs.');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, status, severity, route, dateFrom, dateTo, page]);

  useEffect(() => {
    const t = setTimeout(() => void refresh(), 180);
    return () => clearTimeout(t);
  }, [refresh]);

  useEffect(() => {
    return subscribeBugHunter(() => {
      void refresh();
    });
  }, [refresh]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, status, severity, route, dateFrom, dateTo]);

  const openSelected = useCallback(
    async (id: string) => {
      const { bug, error: loadError } = await getBugReport(id);
      if (loadError || !bug) {
        toast.error(loadError ?? 'Bug not found.');
        return;
      }
      setSelected(bug);
    },
    [toast],
  );

  const changeStatus = useCallback(
    async (id: string, next: BugStatus) => {
      setBusy(true);
      try {
        const { bug, error: updateError } = await setBugStatus(id, next);
        if (updateError || !bug) {
          toast.error(updateError ?? 'Could not update status.');
          return;
        }
        toast.success(`Marked ${BUG_STATUS_LABEL[next]}.`);
        setSelected(bug);
        void refresh();
      } finally {
        setBusy(false);
      }
    },
    [refresh, toast],
  );

  const onClear = useCallback(async () => {
    setBusy(true);
    try {
      const { deleted, error: clearError } = await clearResolvedBugs();
      if (clearError) {
        toast.error(clearError);
        return;
      }
      toast.success(`Cleared ${deleted} resolved/ignored record${deleted === 1 ? '' : 's'}.`);
      setClearOpen(false);
      setSelected(null);
      void refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh, toast]);

  const routes = useMemo(
    () => Array.from(new Set(bugs.map((b) => b.route).filter((r): r is string => Boolean(r)))).sort(),
    [bugs],
  );

  return (
    <div>
      <PageHeader
        eyebrow="Admin tools"
        title="Bug Hunter"
        subtitle="Automatically captured application errors. Stack traces stay admin-only and never ship to normal users."
        icon={<Bug className="h-5 w-5" />}
        actions={
          <>
            <Badge tone="red">{summary.openCount} open</Badge>
            <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void refresh()}>
              Refresh
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={() => setClearOpen(true)}
            >
              Clear resolved
            </Button>
          </>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Critical" value={summary.critical} hint="Open critical" icon={<ShieldAlert className="h-5 w-5" />} tone="red" />
        <StatCard label="High" value={summary.high} hint="Open high" icon={<Bug className="h-5 w-5" />} tone="gold" />
        <StatCard label="Medium" value={summary.medium} hint="Open medium" icon={<Bug className="h-5 w-5" />} tone="blue" />
        <StatCard label="Low" value={summary.low} hint="Open low" icon={<EyeOff className="h-5 w-5" />} tone="violet" />
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Card>
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted">Open bugs</div>
          <div className="mt-1 font-display text-2xl font-bold text-primary">{summary.openCount}</div>
        </Card>
        <Card>
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted">Resolved</div>
          <div className="mt-1 font-display text-2xl font-bold text-primary">{summary.resolvedCount}</div>
        </Card>
        <Card>
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted">Most frequent</div>
          <div className="mt-2 space-y-1.5">
            {summary.frequent.length === 0 ? (
              <p className="text-xs text-dimm">No captured bugs yet.</p>
            ) : (
              summary.frequent.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void openSelected(item.id)}
                  className="block w-full truncate text-left text-xs text-primary hover:text-accent-bright"
                >
                  <span className="font-mono text-dimm">{item.bugNo}</span> · {item.title} ({item.occurrenceCount})
                </button>
              ))
            )}
          </div>
        </Card>
      </div>

      <Card className="mb-5" flush>
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[220px] flex-1">
            <FieldLabel htmlFor="bug-search">Search</FieldLabel>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dimm" />
              <Input
                id="bug-search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Bug ID, title, message, route"
                className="pl-9"
              />
            </div>
          </div>
          <div className="w-full sm:w-40">
            <FieldLabel htmlFor="bug-status">Status</FieldLabel>
            <Select
              id="bug-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as BugStatus | '')}
              options={[
                { value: '', label: 'Open' },
                ...BUG_STATUSES.map((s) => ({ value: s, label: BUG_STATUS_LABEL[s] })),
              ]}
            />
          </div>
          <div className="w-full sm:w-40">
            <FieldLabel htmlFor="bug-severity">Severity</FieldLabel>
            <Select
              id="bug-severity"
              value={severity}
              onChange={(e) => setSeverity(e.target.value as BugSeverity | '')}
              options={[
                { value: '', label: 'All severities' },
                ...BUG_SEVERITIES.map((s) => ({ value: s, label: BUG_SEVERITY_LABEL[s] })),
              ]}
            />
          </div>
          <div className="w-full sm:w-48">
            <FieldLabel htmlFor="bug-route">Route</FieldLabel>
            <Input
              id="bug-route"
              value={route}
              onChange={(e) => setRoute(e.target.value)}
              placeholder={routes[0] ?? '/studio/...'}
              list="bug-route-options"
            />
            <datalist id="bug-route-options">
              {routes.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
          <div className="w-full sm:w-40">
            <FieldLabel htmlFor="bug-from">From</FieldLabel>
            <Input id="bug-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="w-full sm:w-40">
            <FieldLabel htmlFor="bug-to">To</FieldLabel>
            <Input id="bug-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
      </Card>

      {error && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {loading && bugs.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface-raised" />
          ))}
        </div>
      ) : bugs.length === 0 ? (
        <EmptyState
          icon={<Bug className="h-7 w-7" />}
          title="No bugs captured"
          description="Runtime errors, failed APIs, RLS denials and PDF/save failures will appear here automatically."
        />
      ) : (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b border-line bg-surface-raised/70 text-[11px] uppercase tracking-wide text-dimm">
                <tr>
                  <th className="px-4 py-3 font-semibold">Bug ID</th>
                  <th className="px-4 py-3 font-semibold">Title</th>
                  <th className="px-4 py-3 font-semibold">Severity</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Route</th>
                  <th className="px-4 py-3 font-semibold">Count</th>
                  <th className="px-4 py-3 font-semibold">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {bugs.map((bug) => (
                  <tr
                    key={bug.id}
                    className="cursor-pointer border-b border-line transition hover:bg-accent/5"
                    onClick={() => void openSelected(bug.id)}
                  >
                    <td className="px-4 py-3 font-mono text-[12px] text-muted">{bug.bugNo}</td>
                    <td className="max-w-[320px] truncate px-4 py-3 text-primary">{bug.title}</td>
                    <td className="px-4 py-3">
                      <Badge tone={BUG_SEVERITY_TONE[bug.severity]}>{BUG_SEVERITY_LABEL[bug.severity]}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={BUG_STATUS_TONE[bug.status]}>{BUG_STATUS_LABEL[bug.status]}</Badge>
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-3 font-mono text-[11px] text-muted">{bug.route ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-muted">{bug.occurrenceCount}</td>
                    <td className="px-4 py-3 text-muted">{timeAgo(bug.lastSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line px-4 py-3">
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
          </div>
        </Card>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.title}
        meta={selected ? `${selected.bugNo} · ${BUG_SEVERITY_LABEL[selected.severity]}` : undefined}
        maxWidth="max-w-4xl"
        footer={
          selected ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy || selected.status === 'investigating'}
                  onClick={() => void changeStatus(selected.id, 'investigating')}
                >
                  Mark Investigating
                </Button>
                <Button
                  size="sm"
                  variant="success"
                  disabled={busy || selected.status === 'resolved'}
                  onClick={() => void changeStatus(selected.id, 'resolved')}
                >
                  Mark Resolved
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || selected.status === 'ignored'}
                  onClick={() => void changeStatus(selected.id, 'ignored')}
                >
                  Ignore
                </Button>
              </div>
              <Button
                size="sm"
                variant="outline"
                icon={<Copy className="h-3.5 w-3.5" />}
                onClick={async () => {
                  const ok = await copyBugDetails(selected);
                  if (ok) toast.success('Copied error details.');
                  else toast.error('Could not copy.');
                }}
              >
                Copy details
              </Button>
            </>
          ) : null
        }
      >
        {selected && (
          <div>
            <DetailRow label="Bug ID" value={selected.bugNo} mono />
            <DetailRow label="Status" value={BUG_STATUS_LABEL[selected.status]} />
            <DetailRow label="Severity" value={BUG_SEVERITY_LABEL[selected.severity]} />
            <DetailRow label="Error title" value={selected.title} />
            <DetailRow label="Exact error message" value={selected.message} />
            <DetailRow label="Reason" value={selected.reason} />
            <DetailRow label="Route / page" value={selected.route} mono />
            <DetailRow label="Component / module" value={selected.component} mono />
            <DetailRow label="API / RPC endpoint" value={selected.endpoint} mono />
            <DetailRow label="HTTP status" value={selected.httpStatus} mono />
            <DetailRow label="Supabase error code" value={selected.supabaseCode} mono />
            <DetailRow
              label="User / session"
              value={
                selected.userEmail
                  ? `${selected.userEmail} · ${selected.userRole ?? 'user'} · ${selected.userId ? `${selected.userId.slice(0, 8)}…` : ''}`
                  : '—'
              }
            />
            <DetailRow label="First seen" value={selected.firstSeenAt} mono />
            <DetailRow label="Last seen" value={selected.lastSeenAt} mono />
            <DetailRow label="Occurrence count" value={selected.occurrenceCount} />
            <DetailRow label="Browser" value={selected.browser} />
            <DetailRow label="Device" value={selected.device} />
            <div className="pt-3">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-dimm">Stack trace</div>
              <pre className="max-h-72 overflow-auto rounded-xl border border-line bg-canvas p-3 font-mono text-[11px] leading-relaxed text-muted">
                {selected.stack || '—'}
              </pre>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        onConfirm={() => void onClear()}
        title="Clear resolved and ignored bugs?"
        body="This permanently deletes resolved and ignored Bug Hunter records. Open and investigating bugs are kept. This cannot be undone."
        confirmLabel="Clear records"
        danger
      />
    </div>
  );
}

export default function BugHunterPage() {
  return (
    <AdminGuard>
      <BugHunterPanel />
    </AdminGuard>
  );
}
