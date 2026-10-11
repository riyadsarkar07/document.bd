'use client';

import { useCallback, useEffect, useState } from 'react';
import { Lock, ShieldAlert, Unlock, Users } from 'lucide-react';
import { Card, PageHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { ConfirmDialog } from '@/components/ui/modal';
import { useAuth } from '@/lib/auth/auth-context';
import { ROLE_LABEL, USER_STATUS_LABEL, canManageUsers, type UserStatus } from '@/lib/auth/types';
import { useToast } from '@/lib/toast/toast-provider';
import { apiAdminAccounts, apiPatchAccount, type AdminAccountRow } from '@/lib/tempmail/admin-client';

function isError(value: { ok: boolean }): value is { ok: false; error: string } {
  return value.ok === false;
}

export default function RegularUsersPage() {
  const { role } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<AdminAccountRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ type: 'disable' | 'enable'; target: AdminAccountRow } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await apiAdminAccounts('users', search, page);
    if (isError(res)) {
      setError(res.error);
      setRows([]);
      setLoading(false);
      return;
    }
    setRows(res.accounts);
    setTotal(res.total);
    setError(null);
    setLoading(false);
  }, [search, page]);

  useEffect(() => {
    if (!canManageUsers(role)) return;
    void refresh();
  }, [refresh, role]);

  const setStatus = async (target: AdminAccountRow, status: UserStatus) => {
    const res = await apiPatchAccount(target.id, { status });
    if (isError(res)) {
      toast.error(res.error);
      return;
    }
    toast.success(status === 'disabled' ? `${target.email} disabled` : `${target.email} re-enabled`);
    setConfirm(null);
    await refresh();
  };

  const setTempmail = async (target: AdminAccountRow, enabled: boolean) => {
    const res = await apiPatchAccount(target.id, { tempmailAccess: enabled });
    if (isError(res)) {
      toast.error(res.error);
      return;
    }
    toast.success(enabled ? 'CYBER TEMPMAIL enabled' : 'CYBER TEMPMAIL disabled');
    await refresh();
  };

  if (!canManageUsers(role)) {
    return (
      <EmptyState
        icon={<ShieldAlert className="h-8 w-8" />}
        title="Access restricted"
        description="Only administrators can view registered users."
        className="border-danger/30"
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Regular registered accounts, inbox usage, and access controls. Role promotion is not available from this view."
        icon={<Users className="h-5 w-5" />}
        actions={<Badge tone="violet">{total} users</Badge>}
      />

      <div className="mb-5 max-w-sm">
        <Input
          placeholder="Search by email…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {error ? (
        <EmptyState icon={<ShieldAlert className="h-8 w-8" />} title="Cannot load users" description={error} className="border-danger/30" />
      ) : loading ? (
        <div className="py-16 text-center text-sm text-dimm">Loading users…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Users className="h-8 w-8" />} title="No regular users" description="Registered non-admin accounts will appear here." />
      ) : (
        <>
          <Card className="overflow-hidden p-0" bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-[13px]">
                <thead>
                  <tr className="border-b border-line bg-surface-raised text-left text-[10.5px] font-bold uppercase tracking-wider text-dimm">
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Inboxes</th>
                    <th className="px-4 py-3">Temp Mail</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const disabled = row.status === 'disabled';
                    return (
                      <tr key={row.id} className="border-b border-line">
                        <td className="px-4 py-3">
                          <div className="font-medium text-primary">{row.email}</div>
                          <div className="font-mono text-[10px] text-dimm">{row.id}</div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone="muted">{ROLE_LABEL[row.role]}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={disabled ? 'red' : 'green'} dot>
                            {USER_STATUS_LABEL[row.status]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-mono text-[12px]">{row.inboxesCreated}</td>
                        <td className="px-4 py-3">
                          <Button size="sm" variant="outline" onClick={() => void setTempmail(row, !row.tempmailAccess)}>
                            {row.tempmailAccess ? 'Enabled' : 'Disabled'}
                          </Button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {disabled ? (
                            <Button
                              size="sm"
                              variant="success"
                              icon={<Unlock className="h-3.5 w-3.5" />}
                              onClick={() => setConfirm({ type: 'enable', target: row })}
                            >
                              Enable
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="danger"
                              icon={<Lock className="h-3.5 w-3.5" />}
                              onClick={() => setConfirm({ type: 'disable', target: row })}
                            >
                              Disable
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          <Pagination page={page} pageSize={20} total={total} onPageChange={setPage} className="mt-4" />
        </>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && void setStatus(confirm.target, confirm.type === 'disable' ? 'disabled' : 'active')}
        title={confirm?.type === 'disable' ? 'Disable this user?' : 'Re-enable this user?'}
        body={
          confirm?.type === 'disable'
            ? `${confirm.target.email} will lose access until an admin re-enables the account.`
            : `${confirm?.target.email} will regain access.`
        }
        confirmLabel={confirm?.type === 'disable' ? 'Disable' : 'Enable'}
        danger={confirm?.type === 'disable'}
      />
    </div>
  );
}
