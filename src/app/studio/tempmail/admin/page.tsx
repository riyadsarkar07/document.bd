'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, AlertCircle, Inbox, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Card, PageHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Toggle } from '@/components/ui/select';
import { useAuth } from '@/lib/auth/auth-context';
import { canManageUsers } from '@/lib/auth/types';
import { useToast } from '@/lib/toast/toast-provider';
import { timeAgo } from '@/lib/utils';
import {
  apiTempmailAdminLogs,
  apiTempmailAdminSettings,
  apiTempmailAdminStatus,
  type TempmailAdminLog,
  type TempmailAdminStatus,
} from '@/lib/tempmail/admin-client';

function isError(value: { ok: boolean }): value is { ok: false; error: string } {
  return value.ok === false;
}

export default function TempmailAdminPage() {
  const { role } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState<TempmailAdminStatus | null>(null);
  const [logs, setLogs] = useState<TempmailAdminLog[]>([]);
  const [note, setNote] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [statusRes, logsRes] = await Promise.all([apiTempmailAdminStatus(), apiTempmailAdminLogs()]);
    if (isError(statusRes)) {
      setError(statusRes.error);
      setStatus(null);
      setLoading(false);
      return;
    }
    setStatus(statusRes);
    if (!isError(logsRes)) {
      setLogs(logsRes.logs);
      setNote(logsRes.note);
    }
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!canManageUsers(role)) return;
    void refresh();
  }, [refresh, role]);

  const saveSettings = async (patch: Partial<TempmailAdminStatus['settings']>) => {
    setSaving(true);
    const res = await apiTempmailAdminSettings(patch);
    setSaving(false);
    if (isError(res)) {
      toast.error(res.error);
      return;
    }
    setStatus((prev) => (prev ? { ...prev, settings: res.settings } : prev));
    toast.success('Settings updated');
  };

  if (!canManageUsers(role)) {
    return (
      <EmptyState
        icon={<ShieldCheck className="h-8 w-8" />}
        title="Access restricted"
        description="Only administrators can manage CYBER TEMPMAIL."
        className="border-danger/30"
      />
    );
  }

  const provider = status?.provider;
  const connected = Boolean(provider?.connected);

  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="Temp Mail Admin"
        subtitle="Service health, provider domains, operational counters, and safe application settings. Message contents are never shown here."
        icon={<Inbox className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} loading={loading} onClick={() => void refresh()}>
              Refresh
            </Button>
            <Link href="/studio/tempmail">
              <Button variant="outline">Open inbox</Button>
            </Link>
          </div>
        }
      />

      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-2xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && !status ? (
        <div className="flex items-center gap-2 py-16 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          Checking provider health…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Card
            title="Provider status"
            subtitle={provider?.name ?? 'Privatix Temp Mail'}
            action={
              <Badge tone={connected ? 'green' : provider?.configured ? 'red' : 'warning'} dot>
                {connected ? 'Connected' : provider?.configured ? 'Unreachable' : 'Not configured'}
              </Badge>
            }
          >
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-line bg-surface-raised px-3.5 py-3">
                <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-dimm">Host</dt>
                <dd className="mt-1 break-all font-mono text-[12px] text-primary">{provider?.host ?? '—'}</dd>
              </div>
              <div className="rounded-xl border border-line bg-surface-raised px-3.5 py-3">
                <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-dimm">Subscription</dt>
                <dd className="mt-1 text-sm text-primary">{provider?.slug ?? 'Privatix/temp-mail'}</dd>
              </div>
            </dl>
            {provider?.error && (
              <p className="mt-3 text-[13px] text-danger">{provider.error}</p>
            )}
          </Card>

          <Card title="Operational counters" subtitle={status?.countersNote}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                ['Inboxes created', status?.counters.inboxesCreated ?? 0],
                ['Inbox refreshes', status?.counters.messagesListed ?? 0],
                ['Messages read', status?.counters.messagesRead ?? 0],
                ['Messages deleted', status?.counters.messagesDeleted ?? 0],
                ['Attachments', status?.counters.attachmentsFetched ?? 0],
                ['API errors', status?.counters.apiErrors ?? 0],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border border-line bg-surface-raised px-3.5 py-3">
                  <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-dimm">{label}</div>
                  <div className="mt-1 font-display text-xl font-bold text-primary">{value}</div>
                </div>
              ))}
            </div>
            {status?.counters.lastErrorAt && (
              <p className="mt-3 text-[12px] text-muted">
                Last error {timeAgo(status.counters.lastErrorAt)}
                {status.counters.lastErrorCode ? ` · ${status.counters.lastErrorCode}` : ''}
              </p>
            )}
          </Card>

          <Card title="Available domains" subtitle={connected ? `${status?.domains.length ?? 0} from provider` : 'Unavailable until the API connects'}>
            {status?.domains.length ? (
              <div className="flex flex-wrap gap-2">
                {status.domains.map((domain) => (
                  <Badge key={domain} tone="violet">
                    {domain}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No domains returned. This is not a fake list.</p>
            )}
          </Card>

          <Card title="Supported endpoints" subtitle="Verified Privatix RapidAPI paths used by this app">
            <ul className="divide-y divide-line">
              {(status?.endpoints ?? []).map((row) => (
                <li key={row.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-primary">{row.label}</div>
                    <div className="truncate font-mono text-[11px] text-dimm">
                      {row.method} {row.path}
                    </div>
                  </div>
                  <Badge tone={row.status === 'ok' ? 'green' : row.status === 'error' ? 'red' : 'muted'}>
                    {row.status}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Application settings" subtitle="Safe local settings. These do not change the RapidAPI subscription.">
            {status && (
              <div className="flex flex-col gap-4">
                <Toggle
                  checked={status.settings.attachmentsEnabled}
                  onChange={(v) => void saveSettings({ attachmentsEnabled: v })}
                  label="Allow attachment downloads"
                  description="Users can fetch attachments for messages in their own inbox"
                  disabled={saving}
                />
                <Toggle
                  checked={status.settings.sourceEnabled}
                  onChange={(v) => void saveSettings({ sourceEnabled: v })}
                  label="Allow raw source view"
                  description="Users can request the provider source for messages they own"
                  disabled={saving}
                />
              </div>
            )}
          </Card>

          <Card title="Operational logs" subtitle={note || 'No message contents or API keys are recorded.'} action={<Activity className="h-4 w-4 text-dimm" />}>
            {logs.length === 0 ? (
              <p className="text-sm text-muted">No operational events in this server instance yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {logs.slice(0, 20).map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 py-2 text-[12px]">
                    <div className="min-w-0">
                      <span className={row.ok ? 'text-primary' : 'text-danger'}>{row.kind}</span>
                      {row.inboxHash && <span className="ml-2 font-mono text-dimm">{row.inboxHash}</span>}
                    </div>
                    <span className="shrink-0 font-mono text-[10px] text-dimm">{timeAgo(row.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
