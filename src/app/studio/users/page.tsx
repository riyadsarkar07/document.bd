'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Lock,
  PencilLine,
  ShieldAlert,
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
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { FieldLabel, Input } from '@/components/ui/input';
import { useToast } from '@/lib/toast/toast-provider';
import { cn } from '@/lib/utils';

interface UserUsage {
  projects: number;
  documents: number;
  exports: number;
}

interface AdminUserRow extends Profile {
  usage?: UserUsage;
}

const LIMIT_FIELDS: { key: 'max_projects' | 'max_documents' | 'max_exports'; label: string; usageKey: 'projects' | 'documents' | 'exports' }[] = [
  { key: 'max_projects', label: 'Project Limit', usageKey: 'projects' },
  { key: 'max_documents', label: 'Document Limit', usageKey: 'documents' },
  { key: 'max_exports', label: 'Export Limit', usageKey: 'exports' },
];

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
  const [limitsForm, setLimitsForm] = useState({ max_projects: '', max_documents: '', max_exports: '' });
  const [savingLimits, setSavingLimits] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [profilesRes, usageRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at'),
      supabase.rpc('admin_user_usage'),
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
        });
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
      created_at: p.created_at,
      usage: usageMap.get(p.id),
    }));

    setUsers(rows);
    setError(null);
    setLoading(false);
  }, []);

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
    };
    if (
      (next.max_projects !== null && !Number.isFinite(next.max_projects)) ||
      (next.max_documents !== null && !Number.isFinite(next.max_documents)) ||
      (next.max_exports !== null && !Number.isFinite(next.max_exports))
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
      detail: `${limitsTarget.email} → P:${next.max_projects ?? '∞'} D:${next.max_documents ?? '∞'} E:${next.max_exports ?? '∞'}`,
    });
    toast.success(`Limits updated for ${limitsTarget.email}`);
    setLimitsTarget(null);
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
        actions={<Badge tone="violet">{users.length} users</Badge>}
      />

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
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="No users yet"
          description="Registered users will appear here."
        />
      ) : (
        <Card className="overflow-hidden p-0" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-[13px]">
              <thead>
                <tr className="border-b border-line bg-surface-raised text-left text-[10.5px] font-bold uppercase tracking-wider text-dimm">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3">Usage / Limits</th>
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
                      <td className="px-4 py-3 font-mono text-[10.5px] leading-relaxed text-dimm">
                        <div>
                          P <span className="text-muted">{u.usage?.projects ?? '—'}</span>/
                          {fmtLimit(u.max_projects)}
                        </div>
                        <div>
                          D <span className="text-muted">{u.usage?.documents ?? '—'}</span>/
                          {fmtLimit(u.max_documents)}
                        </div>
                        <div>
                          E <span className="text-muted">{u.usage?.exports ?? '—'}</span>/
                          {fmtLimit(u.max_exports)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => setDetail(u)}>
                            Manage
                          </Button>
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
