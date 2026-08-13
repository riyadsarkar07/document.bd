'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity as ActivityIcon } from 'lucide-react';
import { listActivity } from '@/lib/workspace/store';
import { useAuth } from '@/lib/auth/auth-context';
import type { ActivityRecord } from '@/lib/auth/types';
import { Card, PageHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { timeAgo } from '@/lib/utils';
import { cn } from '@/lib/utils';

const actionTone = (action: string) => {
  if (action.startsWith('export.') || action.startsWith('download.')) return 'text-info';
  if (action.includes('delete')) return 'text-danger';
  if (action.includes('save') || action.includes('create') || action.includes('role')) return 'text-success';
  return 'text-accent-bright';
};

export default function ActivityPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<ActivityRecord[]>([]);
  const [source, setSource] = useState<'supabase' | 'local'>('supabase');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await listActivity();
    setLogs(res.data);
    setSource(res.source);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div>
      <PageHeader
        title="Activity Logs"
        subtitle="Audit trail of document, template and admin actions"
        icon={<ActivityIcon className="h-5 w-5" />}
        actions={
          <>
            <Badge tone="muted">{source === 'local' ? 'Local fallback' : 'Supabase'}</Badge>
            <Badge tone="violet">{logs.length} events</Badge>
          </>
        }
      />

      {loading ? (
        <div className="py-16 text-center text-sm text-dimm">Loading activity…</div>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={<ActivityIcon className="h-8 w-8" />}
          title="No activity recorded yet"
          description="Actions such as exports, template saves and role changes are logged here."
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
    </div>
  );
}
