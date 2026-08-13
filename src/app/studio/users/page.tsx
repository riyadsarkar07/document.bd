'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/auth-context';
import { logActivity } from '@/lib/workspace/store';
import { ROLE_LABEL, type Role } from '@/lib/auth/types';
import { Card, PageHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { useToast } from '@/lib/toast/toast-provider';
import { cn } from '@/lib/utils';

interface UserRow {
  id: string;
  email: string;
  full_name?: string | null;
  role: Role;
  created_at?: string;
}

export default function UsersPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase.from('profiles').select('*').order('created_at');
    if (err) {
      setError(err.message);
      setUsers([]);
    } else {
      setUsers((data ?? []) as UserRow[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const changeRole = async (target: UserRow, role: Role) => {
    const { error: err } = await supabase.from('profiles').update({ role }).eq('id', target.id);
    if (err) {
      toast.error(`Role update blocked: ${err.message}`);
      return;
    }
    await logActivity({
      user_id: user?.id,
      email: user?.email,
      action: `role.updated`,
      detail: `${target.email} → ${role}`,
    });
    toast.success(`${target.email} is now ${ROLE_LABEL[role]}`);
    await refresh();
  };

  return (
    <div>
      <PageHeader
        title="User Management"
        subtitle="Assign Admin, Editor and Viewer roles"
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
      ) : (
        <Card className="overflow-hidden p-0" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr className="border-b border-line bg-surface-raised text-left text-[10.5px] font-bold uppercase tracking-wider text-dimm">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === user?.id;
                  const isAdmin = u.role === 'admin';
                  return (
                    <tr key={u.id} className="border-b border-line transition hover:bg-accent/5">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              'flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold',
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
                            {u.full_name && (
                              <span className="text-xs text-muted">{u.full_name}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={isAdmin ? 'gold' : u.role === 'editor' ? 'blue' : 'muted'}>
                          {ROLE_LABEL[u.role]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-dimm">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {isSelf ? (
                            <span className="flex items-center gap-1 text-xs text-dimm">
                              <ShieldCheck className="h-3.5 w-3.5" /> self
                            </span>
                          ) : (
                            <>
                              <Select
                                options={[
                                  { value: 'admin', label: 'Admin' },
                                  { value: 'editor', label: 'Editor' },
                                  { value: 'viewer', label: 'Viewer' },
                                ]}
                                value={u.role}
                                onChange={(e) => changeRole(u, e.target.value as Role)}
                                className="w-32"
                              />
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={async () => {
                                  const { error: delErr } = await supabase
                                    .from('profiles')
                                    .delete()
                                    .eq('id', u.id);
                                  if (delErr) toast.error(delErr.message);
                                  else {
                                    toast.info(`Removed ${u.email}`);
                                    await refresh();
                                  }
                                }}
                              >
                                Remove
                              </Button>
                            </>
                          )}
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
    </div>
  );
}
