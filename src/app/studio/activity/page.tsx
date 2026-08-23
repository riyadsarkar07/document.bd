'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity as ActivityIcon, ScrollText, ShieldCheck, X } from 'lucide-react';
import { listActivity } from '@/lib/workspace/store';
import { listAuditLogs, AUDIT_ACTIONS, type AuditLog } from '@/lib/workspace/audit';
import { useAuth } from '@/lib/auth/auth-context';
import type { ActivityRecord } from '@/lib/auth/types';
import { Card, PageHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Pagination } from '@/components/ui/pagination';
import { timeAgo } from '@/lib/utils';
import { cn } from '@/lib/utils';

const actionTone = (action: string) => {
  if (action.startsWith('export.') || action.startsWith('download.')) return 'text-info';
  if (action.includes('delete') || action.includes('trashed') || action.includes('suspended')) return 'text-danger';
  if (action.includes('save') || action.includes('create') || action.includes('role') || action.includes('restored')) return 'text-success';
  return 'text-accent-bright';
};

const AUDIT_PAGE_SIZE = 50;

function AuditDetail({ row }: { row: AuditLog }) {
  const entries = Object.entries(row.metadata).filter(([, v]) => v !== undefined && v !== null && v !== '');
  const parts: string[] = [];
  if (row.targetType) parts.push(`${row.targetType}${row.targetId ? ` · ${row.targetId}` : ''}`);
  for (const [k, v] of entries) parts.push(`${k}: ${String(v)}`);
  return (
    <span className="block max-w-[340px] truncate text-muted" title={parts.join('  ·  ')}>
      {parts.join('  ·  ') || '—'}
    </span>
  );
}

export default function ActivityPage() {
  const { user, role } = useAuth();
  const isAdmin = role === 'admin';

  const [tab, setTab] = useState<'user' | 'audit'>('user');
  const [logs, setLogs] = useState<ActivityRecord[]>([]);
  const [source, setSource] = useState<'supabase' | 'local'>('supabase');
  const [loading, setLoading] = useState(true);
  const [userFilter, setUserFilter] = useState<string | null>(null);

  const [auditRows, setAuditRows] = useState<AuditLog[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditAction, setAuditAction] = useState('');
  const [auditDateFrom, setAuditDateFrom] = useState('');
  const [auditDateTo, setAuditDateTo] = useState('');
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  // The Users page links here with ?user=<id> to pre-filter one account's actions.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const u = new URLSearchParams(window.location.search).get('user');
    if (u) setUserFilter(u);
  }, []);

  const refreshUserLogs = useCallback(async () => {
    const res = await listActivity(userFilter ? { userId: userFilter } : undefined);
    setLogs(res.data);
    setSource(res.source);
    setLoading(false);
  }, [userFilter]);

  useEffect(() => {
    if (tab !== 'user') return;
    void refreshUserLogs();
  }, [tab, refreshUserLogs]);

  const refreshAudit = useCallback(async () => {
    setAuditLoading(true);
    const res = await listAuditLogs({
      search: auditSearch,
      action: auditAction || undefined,
      dateFrom: auditDateFrom || undefined,
      dateTo: auditDateTo || undefined,
      page: auditPage,
      pageSize: AUDIT_PAGE_SIZE,
    });
    setAuditRows(res.rows);
    setAuditTotal(res.total);
    setAuditError(res.error);
    setAuditLoading(false);
  }, [auditSearch, auditAction, auditDateFrom, auditDateTo, auditPage]);

  useEffect(() => {
    if (tab !== 'audit') return;
    const t = setTimeout(() => void refreshAudit(), 200);
    return () => clearTimeout(t);
  }, [tab, refreshAudit]);

  return (
    <div>
      <PageHeader
        title="Activity Logs"
        subtitle="Audit trail of document, template and admin actions"
        icon={<ActivityIcon className="h-5 w-5" />}
        actions={
          <>
            <Badge tone="muted">{source === 'local' ? 'Local fallback' : 'Supabase'}</Badge>
            <Badge tone="violet">
              {tab === 'user' ? `${logs.length} events` : `${auditTotal} entries`}
            </Badge>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border border-line bg-surface-raised p-1">
          <button
            type="button"
            onClick={() => setTab('user')}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition',
              tab === 'user' ? 'bg-accent text-canvas shadow' : 'text-muted hover:text-primary',
            )}
          >
            <ActivityIcon className="h-3.5 w-3.5" />
            User Actions
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setTab('audit')}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition',
                tab === 'audit' ? 'bg-accent text-canvas shadow' : 'text-muted hover:text-primary',
              )}
            >
              <ScrollText className="h-3.5 w-3.5" />
              Audit Trail
            </button>
          )}
        </div>
      </div>

      {tab === 'user' ? (
        <>
          {userFilter && (
            <div className="mb-4 flex items-center gap-2">
              <Badge tone="violet">
                Filtered by user <span className="font-mono normal-case">{userFilter}</span>
              </Badge>
              <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={() => setUserFilter(null)}>
                Clear filter
              </Button>
            </div>
          )}

          {loading ? (
            <div className="py-16 text-center text-sm text-dimm">Loading activity…</div>
          ) : logs.length === 0 ? (
            <EmptyState
              icon={<ActivityIcon className="h-8 w-8" />}
              title={userFilter ? 'No activity for this user' : 'No activity recorded yet'}
              description={
                userFilter
                  ? 'This account has no recorded actions, or the actions predate activity logging.'
                  : 'Actions such as exports, template saves and role changes are logged here.'
              }
            />
          ) : (
            <Card className="overflow-hidden p-0" bodyClassName="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-[13px]">
                  <thead>
                    <tr className="border-b border-line bg-surface-raised text-left text-[10.5px] font-bold uppercase tracking-wider text-dimm">
                      <th className="px-4 py-3">Action</th>
                      <th className="px-4 py-3">Detail</th>
                      <th className="px-4 py-3">Actor</th>
                      <th className="px-4 py-3">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((l, i) => (
                      <tr
                        key={l.id ?? i}
                        className={cn('border-b border-line transition hover:bg-accent/5', i % 2 === 1 && 'bg-surface-raised/40')}
                      >
                        <td className="px-4 py-3">
                          <span className={cn('font-mono text-xs font-semibold', actionTone(l.action))}>
                            {l.action}
                          </span>
                        </td>
                        <td className="max-w-[320px] truncate px-4 py-3 text-muted" title={l.detail}>
                          {l.detail ?? '—'}
                        </td>
                        <td className="max-w-[200px] truncate px-4 py-3 font-mono text-xs text-dimm">
                          {l.email ?? (l.user_id === user?.id ? 'you' : l.user_id ?? 'system')}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-dimm">
                          {timeAgo(l.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      ) : (
        <>
          <div className="mb-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              placeholder="Search actor email / target / action…"
              value={auditSearch}
              onChange={(e) => {
                setAuditSearch(e.target.value);
                setAuditPage(1);
              }}
            />
            <Select
              options={[{ value: '', label: 'All actions' }, ...AUDIT_ACTIONS]}
              value={auditAction}
              onChange={(e) => {
                setAuditAction(e.target.value);
                setAuditPage(1);
              }}
            />
            <label className="flex items-center gap-2 rounded-xl border border-line bg-surface-raised px-3.5 py-2.5">
              <span className="text-[10.5px] font-semibold uppercase tracking-wide text-dimm">From</span>
              <input
                type="date"
                value={auditDateFrom}
                onChange={(e) => {
                  setAuditDateFrom(e.target.value);
                  setAuditPage(1);
                }}
                className="w-full bg-transparent text-sm text-primary outline-none"
              />
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-line bg-surface-raised px-3.5 py-2.5">
              <span className="text-[10.5px] font-semibold uppercase tracking-wide text-dimm">To</span>
              <input
                type="date"
                value={auditDateTo}
                onChange={(e) => {
                  setAuditDateTo(e.target.value);
                  setAuditPage(1);
                }}
                className="w-full bg-transparent text-sm text-primary outline-none"
              />
            </label>
          </div>

          {auditLoading ? (
            <div className="py-16 text-center text-sm text-dimm">Loading audit trail…</div>
          ) : auditError ? (
            <EmptyState
              icon={<ShieldCheck className="h-8 w-8" />}
              title="Audit trail unavailable"
              description={auditError}
              className="border-danger/30"
            />
          ) : auditRows.length === 0 ? (
            <EmptyState
              icon={<ScrollText className="h-8 w-8" />}
              title="No audit entries"
              description="Vault saves, trash actions, project/template saves and deletions are recorded here."
            />
          ) : (
            <>
              <Card className="overflow-hidden p-0" bodyClassName="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-[13px]">
                    <thead>
                      <tr className="border-b border-line bg-surface-raised text-left text-[10.5px] font-bold uppercase tracking-wider text-dimm">
                        <th className="px-4 py-3">Action</th>
                        <th className="px-4 py-3">Detail</th>
                        <th className="px-4 py-3">Actor</th>
                        <th className="px-4 py-3">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditRows.map((l, i) => (
                        <tr
                          key={l.id != null ? String(l.id) : i}
                          className={cn('border-b border-line transition hover:bg-accent/5', i % 2 === 1 && 'bg-surface-raised/40')}
                        >
                          <td className="px-4 py-3">
                            <span className={cn('font-mono text-xs font-semibold', actionTone(l.action))}>
                              {l.action}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <AuditDetail row={l} />
                          </td>
                          <td className="max-w-[200px] truncate px-4 py-3 font-mono text-xs text-dimm" title={l.actorEmail ?? l.actorId ?? ''}>
                            {l.actorEmail ?? (l.actorId === user?.id ? 'you' : l.actorId ?? 'system')}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-dimm">
                            {timeAgo(l.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              <Pagination page={auditPage} pageSize={AUDIT_PAGE_SIZE} total={auditTotal} onPageChange={setAuditPage} className="mt-4" />
            </>
          )}
        </>
      )}
    </div>
  );
}
