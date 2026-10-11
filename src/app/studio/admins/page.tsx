'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { Card, PageHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { ConfirmDialog } from '@/components/ui/modal';
import { useAuth } from '@/lib/auth/auth-context';
import { ROLE_LABEL, USER_STATUS_LABEL, canManageUsers, type Role } from '@/lib/auth/types';
import { useToast } from '@/lib/toast/toast-provider';
import { apiAdminAccounts, apiPatchAccount, type AdminAccountRow } from '@/lib/tempmail/admin-client';

function isError(value: { ok: boolean }): value is { ok: false; error: string } {
  return value.ok === false;
}

export default function AdminsPage() {
  const { user, role } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<AdminAccountRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adminCount, setAdminCount] = useState(0);
  const [confirm, setConfirm] = useState<AdminAccountRow | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await apiAdminAccounts('admins', search, page);
    if (isError(res)) {
      setError(res.error);
      setRows([]);
      setLoading(false);
      return;
    }
    setRows(res.accounts);
    setTotal(res.total);
    setAdminCount(res.activeAdminCount);
    setError(null);
    setLoading(false);
  }, [search, page]);

  useEffect(() => {
    if (!canManageUsers(role)) return;
    void refresh();
  }, [refresh, role]);

  const changeRole = async (target: AdminAccountRow, next: Role) => {
    const res = await apiPatchAccount(target.id, { role: next });
    if (isError(res)) {
      toast.error(res.error);
      return;
    }
    toast.success(`${target.email} is now ${ROLE_LABEL[next]}`);
    await refresh();
  };

  if (!canManageUsers(role)) {
    return (
      <EmptyState
        icon={<ShieldAlert className="h-8 w-8" />}
        title="Access restricted"
        description="Only administrators can view the admin directory."
        className="border-danger/30"
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Admins"
        subtitle="Verified accounts with the admin role. The last remaining admin cannot be demoted."
        icon={<ShieldCheck className="h-5 w-5" />}
        actions={<Badge tone="gold">{adminCount} active</Badge>}
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
        <EmptyState icon={<ShieldAlert className="h-8 w-8" />} title="Cannot load admins" description={error} className="border-danger/30" />
      ) : loading ? (
        <div className="py-16 text-center text-sm text-dimm">Loading admins…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<ShieldCheck className="h-8 w-8" />} title="No admin accounts" description="No verified admin profiles match this view." />
      ) : (
        <>
          <Card className="overflow-hidden p-0" bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-[13px]">
                <thead>
                  <tr className="border-b border-line bg-surface-raised text-left text-[10.5px] font-bold uppercase tracking-wider text-dimm">
                    <th className="px-4 py-3">Account</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Joined</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const isSelf = row.id === user?.id;
                    const lastAdmin = adminCount <= 1 && row.status === 'active';
                    return (
                      <tr key={row.id} className="border-b border-line">
                        <td className="px-4 py-3">
                          <div className="font-medium text-primary">{row.email}</div>
                          <div className="font-mono text-[10px] text-dimm">{row.id}</div>
                        </td>
                        <td className="px-4 py-3">
                          {isSelf || lastAdmin ? (
                            <Badge tone="gold">{ROLE_LABEL[row.role]}</Badge>
                          ) : (
                            <Select
                              options={[
                                { value: 'admin', label: 'Admin' },
                                { value: 'editor', label: 'Editor' },
                                { value: 'viewer', label: 'Viewer' },
                              ]}
                              value={row.role}
                              onChange={(e) => void changeRole(row, e.target.value as Role)}
                              className="w-28"
                            />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={row.status === 'active' ? 'green' : 'red'} dot>
                            {USER_STATUS_LABEL[row.status]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-dimm">
                          {row.created_at ? new Date(row.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {!isSelf && !lastAdmin && (
                            <Button size="sm" variant="danger" onClick={() => setConfirm(row)}>
                              Demote
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
        onConfirm={() => {
          if (confirm) void changeRole(confirm, 'viewer');
          setConfirm(null);
        }}
        title="Demote this admin?"
        body={`${confirm?.email ?? ''} will become a viewer. The last remaining admin cannot be demoted.`}
        confirmLabel="Demote"
        danger
      />
    </div>
  );
}
