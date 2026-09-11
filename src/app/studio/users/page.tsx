'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Lock,
  PencilLine,
  Search,
  ShieldAlert,
  ShieldCheck,
  Unlock,
  Users,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/auth-context';
import { logActivity } from '@/lib/workspace/store';
import {
  ROLE_LABEL,
  USER_STATUS_LABEL,
  canManageUsers,
  type Profile,
  type Role,
  type UserStatus,
} from '@/lib/auth/types';
import { Card, PageHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { FieldLabel, Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { useToast } from '@/lib/toast/toast-provider';
import { cn, escapePostgrestSearch, timeAgo } from '@/lib/utils';
import { TOOL_SCOPES, TOOL_SCOPE_LABEL, type ToolScope } from '@/lib/workspace/access';

interface UserUsage {
  projects: number;
  documents: number;
  exports: number;
  generations: number;
  lastActivity?: string | null;
}

interface AdminUserRow extends Profile {
  usage?: UserUsage;
  certificateCount?: number;
}

const PAGE_SIZE = 20;

const LIMIT_FIELDS: { key: 'max_projects' | 'max_documents' | 'max_exports'; label: string; usageKey: 'projects' | 'documents' | 'exports' }[] = [
  { key: 'max_projects', label: 'Project Limit', usageKey: 'projects' },
  { key: 'max_documents', label: 'Document Limit', usageKey: 'documents' },
  { key: 'max_exports', label: 'Export Limit', usageKey: 'exports' },
];

const GEN_PERIOD_LABEL: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  unlimited: 'Unlimited',
};

const STATUS_TONE: Record<UserStatus, 'green' | 'red'> = {
  active: 'green',
  disabled: 'red',
};

export default function UsersPage() {
  const { user: currentUser, role } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminUserRow | null>(null);
  const [confirm, setConfirm] = useState<{ type: 'suspend' | 'reactivate'; target: AdminUserRow } | null>(null);
  const [limitsTarget, setLimitsTarget] = useState<AdminUserRow | null>(null);
  const [limitsForm, setLimitsForm] = useState({ max_projects: '', max_documents: '', max_exports: '', gen_limit: '', gen_period: 'unlimited' });
  const [savingLimits, setSavingLimits] = useState(false);
  const [accessTarget, setAccessTarget] = useState<AdminUserRow | null>(null);
  const [accessForm, setAccessForm] = useState<{ tools: string[]; selfPublish: boolean }>({ tools: [], selfPublish: false });
  const [savingAccess, setSavingAccess] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);

    let profileQuery = supabase.from('profiles').select('*', { count: 'exact' }).order('created_at');
    const search = escapePostgrestSearch(searchTerm);
    if (search) profileQuery = profileQuery.ilike('email', `%${search}%`);
    profileQuery = profileQuery.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    const [profilesRes, usageRes, certsRes] = await Promise.all([
      profileQuery,
      supabase.rpc('admin_user_usage'),
      supabase.rpc('admin_certificate_counts'),
    ]);

    if (profilesRes.error) {
      setError(profilesRes.error.message);
      setUsers([]);
      setLoading(false);
      return;
    }

    const usageMap = new Map<string, UserUsage>();
    if (!usageRes.error && Array.isArray(usageRes.data)) {
      for (const row of usageRes.data) {
        usageMap.set(row.user_id, {
          projects: Number(row.projects ?? 0),
          documents: Number(row.documents ?? 0),
          exports: Number(row.exports ?? 0),
          generations: Number(row.generations ?? 0),
          lastActivity: row.last_activity ?? null,
        });
      }
    }

    const certMap = new Map<string, number>();
    if (!certsRes.error && Array.isArray(certsRes.data)) {
      for (const row of certsRes.data) {
        certMap.set(row.user_id, Number(row.total ?? 0));
      }
    }

    const rows: AdminUserRow[] = (profilesRes.data ?? []).map((p) => ({
      id: p.id,
      email: p.email ?? '—',
      full_name: p.full_name,
      role: (p.role as Role) || 'viewer',
      status: (p.status as UserStatus) || 'active',
      max_projects: p.max_projects != null ? Number(p.max_projects) : null,
      max_documents: p.max_documents != null ? Number(p.max_documents) : null,
      max_exports: p.max_exports != null ? Number(p.max_exports) : null,
      allowed_tools: Array.isArray(p.allowed_tools) ? (p.allowed_tools as string[]) : null,
      gen_limit: p.gen_limit != null ? Number(p.gen_limit) : null,
      gen_period: typeof p.gen_period === 'string' ? p.gen_period : 'unlimited',
      can_self_publish: Boolean(p.can_self_publish),
      created_at: p.created_at,
      usage: usageMap.get(p.id),
      certificateCount: certMap.get(p.id),
    }));

    setUsers(rows);
    setTotal(profilesRes.count ?? rows.length);
    setError(null);
    setLoading(false);
  }, [searchTerm, page]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setStatus = async (target: AdminUserRow, status: UserStatus) => {
    const { error: err } = await supabase.from('profiles').update({ status }).eq('id', target.id);
    if (err) {
      toast.error(`Update blocked: ${err.message}`);
      return;
    }
    await logActivity({
      user_id: currentUser?.id,
      email: currentUser?.email,
      action: status === 'disabled' ? 'user.suspended' : 'user.reactivated',
      detail: `${target.email} → ${status}`,
    });
    toast.success(
      status === 'disabled' ? `${target.email} suspended` : `${target.email} reactivated`,
    );
    setConfirm(null);
    setDetail(null);
    await refresh();
  };

  const changeRole = async (target: AdminUserRow, newRole: Role) => {
    if (target.id === currentUser?.id) {
      toast.error('You cannot change your own role');
      return;
    }
    const { error: err } = await supabase.from('profiles').update({ role: newRole }).eq('id', target.id);
    if (err) {
      toast.error(`Role update blocked: ${err.message}`);
      return;
    }
    await logActivity({
      user_id: currentUser?.id,
      email: currentUser?.email,
      action: 'role.updated',
      detail: `${target.email} → ${newRole}`,
    });
    toast.success(`${target.email} is now ${ROLE_LABEL[newRole]}`);
    setDetail(null);
    await refresh();
  };

  const openLimits = (target: AdminUserRow) => {
    setLimitsTarget(target);
    setLimitsForm({
      max_projects: target.max_projects != null ? String(target.max_projects) : '',
      max_documents: target.max_documents != null ? String(target.max_documents) : '',
      max_exports: target.max_exports != null ? String(target.max_exports) : '',
      gen_limit: target.gen_limit != null ? String(target.gen_limit) : '',
      gen_period: target.gen_period ?? 'unlimited',
    });
  };

  const saveLimits = async () => {
    if (!limitsTarget) return;
    const parse = (v: string) => {
      const t = v.trim();
      if (t === '') return null;
      const n = Number(t);
      if (!Number.isInteger(n) || n < 0) return Number.NaN;
      return n;
    };
    const next = {
      max_projects: parse(limitsForm.max_projects),
      max_documents: parse(limitsForm.max_documents),
      max_exports: parse(limitsForm.max_exports),
      gen_limit: parse(limitsForm.gen_limit),
      gen_period: limitsForm.gen_period,
    };
    if (
      (next.max_projects !== null && !Number.isFinite(next.max_projects)) ||
      (next.max_documents !== null && !Number.isFinite(next.max_documents)) ||
      (next.max_exports !== null && !Number.isFinite(next.max_exports)) ||
      (next.gen_limit !== null && !Number.isFinite(next.gen_limit))
    ) {
      toast.error('Limits must be whole numbers (0 or more), or empty for unlimited');
      return;
    }

    setSavingLimits(true);
    const { error: err } = await supabase.from('profiles').update(next).eq('id', limitsTarget.id);
    setSavingLimits(false);
    if (err) {
      toast.error(`Limit update blocked: ${err.message}`);
      return;
    }
    await logActivity({
      user_id: currentUser?.id,
      email: currentUser?.email,
      action: 'limits.updated',
      detail: `${limitsTarget.email} → P:${next.max_projects ?? '∞'} D:${next.max_documents ?? '∞'} E:${next.max_exports ?? '∞'} G:${next.gen_limit ?? '∞'}/${next.gen_period}`,
    });
    toast.success(`Limits updated for ${limitsTarget.email}`);
    setLimitsTarget(null);
    setDetail(null);
    await refresh();
  };

  const openAccess = (target: AdminUserRow) => {
    setAccessTarget(target);
    setAccessForm({
      tools: target.allowed_tools ?? [...TOOL_SCOPES],
      selfPublish: Boolean(target.can_self_publish),
    });
  };

  const toggleTool = (scope: string) => {
    setAccessForm((prev) => ({
      ...prev,
      tools: prev.tools.includes(scope)
        ? prev.tools.filter((t) => t !== scope)
        : [...prev.tools, scope],
    }));
  };

  const saveAccess = async () => {
    if (!accessTarget) return;
    const allTools = accessForm.tools.length === TOOL_SCOPES.length;
    const next = {
      allowed_tools: allTools ? null : accessForm.tools,
      can_self_publish: accessForm.selfPublish,
    };
    setSavingAccess(true);
    const { error: err } = await supabase.from('profiles').update(next).eq('id', accessTarget.id);
    setSavingAccess(false);
    if (err) {
      toast.error(`Access update blocked: ${err.message}`);
      return;
    }
    await logActivity({
      user_id: currentUser?.id,
      email: currentUser?.email,
      action: 'access.updated',
      detail: `${accessTarget.email} → tools:[${allTools ? 'all' : next.allowed_tools?.join(',') || 'none'}] self-publish:${next.can_self_publish ? 'on' : 'off'}`,
    });
    toast.success(`Access updated for ${accessTarget.email}`);
    setAccessTarget(null);
    setDetail(null);
    await refresh();
  };

  if (!canManageUsers(role)) {
    return (
      <EmptyState
        icon={<ShieldAlert className="h-8 w-8" />}
        title="Access restricted"
        description="You do not have permission to view user management."
        className="border-danger/30"
      />
    );
  }

  const fmtLimit = (v: number | null | undefined) => (v == null ? '∞' : String(v));

  const remainingFor = (u: AdminUserRow, field: (typeof LIMIT_FIELDS)[number]) => {
    const usage = u.usage?.[field.usageKey];
    const max = u[field.key];
    if (usage === undefined) return '—';
    if (max == null) return 'Unlimited';
    return String(Math.max(0, max - usage));
  };

  return (
    <div>
      <PageHeader
        title="User Management"
        subtitle="View accounts, manage status and set per-user limits"
        icon={<Users className="h-5 w-5" />}
        actions={<Badge tone="violet">{total} users</Badge>}
      />

      <div className="mb-5">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            placeholder="Search by email…"
            className="pl-10"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {error ? (
        <EmptyState
          icon={<ShieldAlert className="h-8 w-8" />}
          title="Cannot load profiles"
          description={error}
          className="border-danger/30"
        />
      ) : loading ? (
        <div className="py-16 text-center text-sm text-dimm">Loading users…</div>
      ) : users.length === 0 ? (
        searchTerm.trim() ? (
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title="No matching users"
            description="No accounts match the current search."
          />
        ) : (
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title="No users yet"
            description="Registered users will appear here."
          />
        )
      ) : (
        <>
          <Card className="overflow-hidden p-0" bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-[13px]">
                <thead>
                  <tr className="border-b border-line bg-surface-raised text-left text-[10.5px] font-bold uppercase tracking-wider text-dimm">
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Joined</th>
                    <th className="px-4 py-3">Certificates</th>
                    <th className="px-4 py-3">Usage / Limits</th>
                    <th className="px-4 py-3">Last Activity</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  const isAdmin = u.role === 'admin';
                  const disabled = u.status === 'disabled';
                  return (
                    <tr key={u.id} className="border-b border-line transition hover:bg-accent/5">
                      <td className="max-w-[260px] px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold',
                              isAdmin ? 'bg-accent/20 text-accent-bright' : 'bg-surface-elevated text-muted',
                            )}
                          >
                            {(u.full_name || u.email || '?').slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium text-primary">{u.email}</span>
                              {isSelf && <Badge tone="gold">You</Badge>}
                            </div>
                            <div className="truncate font-mono text-[10px] text-dimm" title={u.id}>
                              {u.id}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5">
                              <Link
                                href={`/studio/history?createdBy=${u.id}`}
                                className="text-[10.5px] font-semibold text-accent-bright hover:underline"
                              >
                                History
                              </Link>
                              <span className="text-dimm">·</span>
                              <Link
                                href={`/studio/activity?user=${u.id}`}
                                className="text-[10.5px] font-semibold text-accent-bright hover:underline"
                              >
                                Activity
                              </Link>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {isSelf ? (
                          <Badge tone={isAdmin ? 'gold' : 'muted'}>{ROLE_LABEL[u.role]}</Badge>
                        ) : (
                          <Select
                            options={[
                              { value: 'admin', label: 'Admin' },
                              { value: 'editor', label: 'Editor' },
                              { value: 'viewer', label: 'Viewer' },
                            ]}
                            value={u.role}
                            onChange={(e) => changeRole(u, e.target.value as Role)}
                            className="w-28"
                          />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONE[u.status ?? 'active']} dot>
                          {USER_STATUS_LABEL[u.status ?? 'active']}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-dimm">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone="blue">{u.certificateCount ?? '—'}</Badge>
                      </td>
                      <td className="min-w-[170px] px-4 py-3">
                        {LIMIT_FIELDS.map((f) => {
                          const usage = u.usage?.[f.usageKey];
                          const max = u[f.key];
                          const reached = usage !== undefined && max != null && usage >= max;
                          const pct =
                            usage !== undefined && max != null && max > 0
                              ? Math.min(100, Math.round((usage / max) * 100))
                              : null;
                          const short = f.usageKey === 'projects' ? 'P' : f.usageKey === 'documents' ? 'D' : 'E';
                          return (
                            <div key={f.key} className="mb-1.5 last:mb-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-[10.5px] text-dimm">
                                  {short} <span className="text-muted">{usage ?? '—'}</span>/{fmtLimit(max)}
                                </span>
                                {pct != null && (
                                  <span className={cn('font-mono text-[9.5px]', reached ? 'text-danger' : 'text-dimm')}>
                                    {pct}%
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-surface-elevated">
                                {pct != null && (
                                  <div
                                    className={cn('h-full rounded-full transition-all', reached ? 'bg-danger' : 'bg-accent')}
                                    style={{ width: `${pct}%` }}
                                  />
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {(() => {
                          const g = u.usage?.generations;
                          const gMax = u.gen_limit;
                          const unlimited = !u.gen_period || u.gen_period === 'unlimited';
                          const gReached = g !== undefined && !unlimited && gMax != null && g >= gMax;
                          const gPct =
                            g !== undefined && !unlimited && gMax != null && gMax > 0
                              ? Math.min(100, Math.round((g / gMax) * 100))
                              : null;
                          return (
                            <div className="mb-1.5 last:mb-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-[10.5px] text-dimm">
                                  G <span className="text-muted">{g ?? '—'}</span>/{fmtLimit(gMax)}
                                  {!unlimited && (
                                    <span className="ml-1 text-[9.5px] normal-case text-dimm">· {GEN_PERIOD_LABEL[u.gen_period ?? 'unlimited']}</span>
                                  )}
                                </span>
                                {gPct != null && (
                                  <span className={cn('font-mono text-[9.5px]', gReached ? 'text-danger' : 'text-dimm')}>
                                    {gPct}%
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-surface-elevated">
                                {gPct != null && (
                                  <div
                                    className={cn('h-full rounded-full transition-all', gReached ? 'bg-danger' : 'bg-accent')}
                                    style={{ width: `${gPct}%` }}
                                  />
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-dimm">
                        {u.usage?.lastActivity ? timeAgo(u.usage.lastActivity) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => setDetail(u)}>
                            Manage
                          </Button>
                          {!isSelf && (
                            <Button size="sm" variant="outline" onClick={() => openAccess(u)}>
                              Access
                            </Button>
                          )}
                          {!isSelf && (
                            <Button size="sm" variant="outline" onClick={() => openLimits(u)}>
                              Limits
                            </Button>
                          )}
                          {!isSelf &&
                            (disabled ? (
                              <Button
                                size="sm"
                                variant="success"
                                icon={<Unlock className="h-3.5 w-3.5" />}
                                onClick={() => setConfirm({ type: 'reactivate', target: u })}
                              >
                                Reactivate
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="danger"
                                icon={<Lock className="h-3.5 w-3.5" />}
                                onClick={() => setConfirm({ type: 'suspend', target: u })}
                              >
                                Suspend
                              </Button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} className="mt-4" />
        </>
      )}

      {/* ── User detail modal ── */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title="User Details"
        meta={detail?.email ?? ''}
        maxWidth="max-w-2xl"
        footer={
          detail && (
            <div className="flex w-full flex-wrap items-center justify-end gap-2">
              {detail.id !== currentUser?.id && (
                <>
                  <Button variant="outline" icon={<ShieldCheck className="h-4 w-4" />} onClick={() => openAccess(detail)}>
                    Update Access
                  </Button>
                  <Button variant="outline" icon={<PencilLine className="h-4 w-4" />} onClick={() => openLimits(detail)}>
                    Update Limits
                  </Button>
                  {detail.status === 'disabled' ? (
                    <Button
                      variant="success"
                      icon={<Unlock className="h-4 w-4" />}
                      onClick={() => setConfirm({ type: 'reactivate', target: detail })}
                    >
                      Reactivate Account
                    </Button>
                  ) : (
                    <Button
                      variant="danger"
                      icon={<Lock className="h-4 w-4" />}
                      onClick={() => setConfirm({ type: 'suspend', target: detail })}
                    >
                      Suspend Account
                    </Button>
                  )}
                </>
              )}
            </div>
          )
        }
      >
        {detail && (
          <div className="flex flex-col gap-6">
            <div>
              <div className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-dimm">
                Account
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-line bg-surface-raised px-4 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-dimm">Email</div>
                  <div className="mt-0.5 truncate text-sm text-primary">{detail.email}</div>
                </div>
                <div className="rounded-xl border border-line bg-surface-raised px-4 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-dimm">User ID</div>
                  <div className="mt-0.5 truncate font-mono text-xs text-muted" title={detail.id}>
                    {detail.id}
                  </div>
                </div>
                <div className="rounded-xl border border-line bg-surface-raised px-4 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-dimm">Role</div>
                  <div className="mt-1">
                    {detail.id === currentUser?.id ? (
                      <Badge tone={detail.role === 'admin' ? 'gold' : 'muted'}>{ROLE_LABEL[detail.role]}</Badge>
                    ) : (
                      <Select
                        options={[
                          { value: 'admin', label: 'Admin' },
                          { value: 'editor', label: 'Editor' },
                          { value: 'viewer', label: 'Viewer' },
                        ]}
                        value={detail.role}
                        onChange={(e) => changeRole(detail, e.target.value as Role)}
                        className="w-32"
                      />
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-line bg-surface-raised px-4 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-dimm">Status</div>
                  <div className="mt-1">
                    <Badge tone={STATUS_TONE[detail.status ?? 'active']} dot>
                      {USER_STATUS_LABEL[detail.status ?? 'active']}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-dimm">
                Usage
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {LIMIT_FIELDS.map((f) => {
                  const usage = detail.usage?.[f.usageKey];
                  const max = detail[f.key];
                  const reached = usage !== undefined && max != null && usage >= max;
                  return (
                    <div
                      key={f.key}
                      className={cn(
                        'rounded-xl border px-4 py-3',
                        reached ? 'border-danger/30 bg-danger/5' : 'border-line bg-surface-raised',
                      )}
                    >
                      <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-dimm">
                        {f.label}
                      </div>
                      <div className="mt-1.5 font-display text-xl font-bold text-primary">
                        {usage ?? '—'}
                        <span className="text-sm font-medium text-dimm"> / {fmtLimit(max)}</span>
                      </div>
                      <div className="mt-1 font-mono text-[10.5px] text-dimm">
                        Remaining: <span className="text-muted">{remainingFor(detail, f)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {(() => {
                const g = detail.usage?.generations;
                const gMax = detail.gen_limit;
                const gPeriod = detail.gen_period && detail.gen_period !== 'unlimited' ? detail.gen_period : null;
                const gReached = g !== undefined && gPeriod != null && gMax != null && g >= gMax;
                return (
                  <div
                    className={cn(
                      'mt-3 rounded-xl border px-4 py-3',
                      gReached ? 'border-danger/30 bg-danger/5' : 'border-line bg-surface-raised',
                    )}
                  >
                    <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-dimm">
                      Generation Limit
                    </div>
                    <div className="mt-1.5 font-display text-xl font-bold text-primary">
                      {g ?? '—'}
                      <span className="text-sm font-medium text-dimm">
                        {' '}
                        / {fmtLimit(gMax)} {gPeriod ? `per ${gPeriod}` : '(unlimited)'}
                      </span>
                    </div>
                    <div className="mt-1 font-mono text-[10.5px] text-dimm">
                      Remaining:{' '}
                      <span className="text-muted">
                        {g === undefined ? '—' : gPeriod == null || gMax == null ? 'Unlimited' : String(Math.max(0, gMax - g))}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </Modal>

      {/* ── Update limits modal ── */}
      <Modal
        open={Boolean(limitsTarget)}
        onClose={() => setLimitsTarget(null)}
        title="Update User Limits"
        meta={limitsTarget?.email ?? ''}
        maxWidth="max-w-md"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setLimitsTarget(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={savingLimits} onClick={saveLimits}>
              Save Limits
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-xs leading-relaxed text-muted">
            Leave a field empty for unlimited. Limits are enforced server-side — when a user
            reaches a limit, the restricted action is blocked with a clear message.
          </p>
          {LIMIT_FIELDS.map((f) => (
            <div key={f.key}>
              <FieldLabel hint={f.key === 'max_projects' ? 'count of saved projects' : undefined}>
                {f.label}
              </FieldLabel>
              <Input
                type="number"
                min={0}
                placeholder="Unlimited"
                value={limitsForm[f.key]}
                onChange={(e) => setLimitsForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="rounded-xl border border-line bg-surface-raised p-4">
            <div className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-dimm">
              Generation Limit
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel hint="rolling window">Period</FieldLabel>
                <Select
                  options={[
                    { value: 'daily', label: 'Daily' },
                    { value: 'weekly', label: 'Weekly' },
                    { value: 'monthly', label: 'Monthly' },
                    { value: 'unlimited', label: 'Unlimited' },
                  ]}
                  value={limitsForm.gen_period}
                  onChange={(e) => setLimitsForm((prev) => ({ ...prev, gen_period: e.target.value }))}
                />
              </div>
              <div>
                <FieldLabel hint="empty = unlimited">Generations</FieldLabel>
                <Input
                  type="number"
                  min={0}
                  placeholder="Unlimited"
                  value={limitsForm.gen_limit}
                  onChange={(e) => setLimitsForm((prev) => ({ ...prev, gen_limit: e.target.value }))}
                />
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Tool access & self-publish modal ── */}
      <Modal
        open={Boolean(accessTarget)}
        onClose={() => setAccessTarget(null)}
        title="User Access"
        meta={accessTarget?.email ?? ''}
        maxWidth="max-w-lg"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setAccessTarget(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={savingAccess} onClick={saveAccess}>
              Save Access
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-xs leading-relaxed text-muted">
            Choose which tools/pages this user may use. Keep every tool checked for full
            access (equivalent to no restriction). Enforcement is server-side — blocked tools
            stay locked in the sidebar, redirect back to the dashboard, and are rejected by
            the database.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {TOOL_SCOPES.map((scope) => {
              const active = accessForm.tools.includes(scope);
              return (
                <button
                  key={scope}
                  type="button"
                  onClick={() => toggleTool(scope)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-[13px] font-medium transition',
                    active
                      ? 'border-accent/40 bg-accent/10 text-primary'
                      : 'border-line bg-surface-raised text-muted hover:border-line/70',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold',
                      active ? 'border-accent bg-accent text-canvas' : 'border-line bg-surface',
                    )}
                  >
                    {active ? '✓' : ''}
                  </span>
                  <span className="flex-1 truncate">{TOOL_SCOPE_LABEL[scope as ToolScope]}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-raised px-3.5 py-3">
            <input
              id="self-publish-toggle"
              type="checkbox"
              checked={accessForm.selfPublish}
              onChange={(e) => setAccessForm((prev) => ({ ...prev, selfPublish: e.target.checked }))}
              className="mt-0.5 h-4 w-4"
            />
            <label htmlFor="self-publish-toggle" className="cursor-pointer">
              <div className="text-[13px] font-semibold text-primary">Allow self-publish (purchased)</div>
              <div className="text-[11.5px] leading-snug text-muted">
                Grants this user the right to publish their own saved certificates to the public
                verification portal. They can only ever publish records they created.
              </div>
            </label>
          </div>
        </div>
      </Modal>

      {/* ── Confirmation for suspend / reactivate ── */}
      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && setStatus(confirm.target, confirm.type === 'suspend' ? 'disabled' : 'active')}
        title={confirm?.type === 'suspend' ? 'Suspend this account?' : 'Reactivate this account?'}
        body={
          confirm?.type === 'suspend'
            ? `${confirm.target.email} will be suspended from Document Studio. Their projects and documents remain intact and can be restored by reactivating.`
            : `${confirm?.target.email} will regain full access to Document Studio with their existing permissions and limits.`
        }
        confirmLabel={confirm?.type === 'suspend' ? 'Suspend Account' : 'Reactivate Account'}
        danger={confirm?.type === 'suspend'}
      />
    </div>
  );
}
