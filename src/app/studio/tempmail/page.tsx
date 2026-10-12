'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Check,
  Copy,
  FileText,
  Inbox,
  Loader2,
  Mail,
  Paperclip,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { canManageUsers } from '@/lib/auth/types';
import { Card, PageHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/lib/toast/toast-provider';
import { cn, timeAgo } from '@/lib/utils';
import {
  apiCreateInbox,
  apiPersistInbox,
  apiRestoreInbox,
  apiDeleteMessage,
  apiGetAttachment,
  apiListAttachments,
  apiListMessages,
  apiReadMessage,
  apiSourceMessage,
  type TempmailAttachment,
  type TempmailClientError,
  type TempmailInbox,
  type TempmailMessageDetail,
  type TempmailMessageSummary,
} from '@/lib/tempmail/client';
import { decideTempmailRestore, TEMPMAIL_NO_INBOX_COPY } from '@/lib/tempmail/lifecycle';

function storageKey(userId: string): string {
  return `studio.tempmail.inbox.${userId}`;
}

type LoadState = 'idle' | 'loading' | 'ok' | 'error';

function isClientError(value: { ok: boolean }): value is TempmailClientError {
  return value.ok === false;
}

function readStoredInbox(userId: string): TempmailInbox | null {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TempmailInbox> & { userId?: unknown };
    if (parsed.userId !== userId) return null;
    if (
      typeof parsed.email === 'string' &&
      typeof parsed.domain === 'string' &&
      typeof parsed.inboxToken === 'string' &&
      typeof parsed.expiresAt === 'string'
    ) {
      return {
        email: parsed.email,
        domain: parsed.domain,
        inboxToken: parsed.inboxToken,
        expiresAt: parsed.expiresAt,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function persistInbox(userId: string, inbox: TempmailInbox | null) {
  if (typeof window === 'undefined' || !userId) return;
  try {
    const key = storageKey(userId);
    if (!inbox) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify({ ...inbox, userId }));
  } catch {
    // ignore quota / private mode
  }
}

function messageBody(detail: TempmailMessageDetail | null): string {
  if (!detail) return '';
  if (detail.text.trim()) return detail.text;
  if (detail.html.trim()) {
    return detail.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return detail.preview || 'No message body was returned by the provider.';
}

export default function CyberTempmailPage() {
  const toast = useToast();
  const { role, user, loading: authLoading } = useAuth();
  const [inbox, setInbox] = useState<TempmailInbox | null>(null);
  const [messages, setMessages] = useState<TempmailMessageSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TempmailMessageDetail | null>(null);
  const [createState, setCreateState] = useState<LoadState>('idle');
  const [restoreState, setRestoreState] = useState<LoadState>('loading');
  const [inboxState, setInboxState] = useState<LoadState>('idle');
  const [detailState, setDetailState] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [sourceState, setSourceState] = useState<LoadState>('idle');
  const [attachments, setAttachments] = useState<TempmailAttachment[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const generatingRef = useRef(false);
  const [restoreTick, setRestoreTick] = useState(0);

  const selected = useMemo(
    () => messages.find((m) => m.id === selectedId) ?? null,
    [messages, selectedId],
  );

  const refreshInbox = useCallback(
    async (current: TempmailInbox, opts?: { silent?: boolean }) => {
      if (!opts?.silent) setInboxState('loading');
      setError(null);
      const res = await apiListMessages(current.email, current.inboxToken);
      if (isClientError(res)) {
        setInboxState('error');
        setError(res.error);
        if (!opts?.silent) toast.error(res.error);
        return false;
      }
      setMessages(res.messages);
      setInboxState('ok');
      return true;
    },
    [toast],
  );

  const generateInbox = useCallback(async () => {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setCreateState('loading');
    setError(null);
    setSelectedId(null);
    setDetail(null);
    setSource(null);
    setAttachments([]);
    try {
      const res = await apiCreateInbox();
      if (isClientError(res)) {
        setCreateState('error');
        setError(res.error);
        toast.error(res.error);
        return;
      }
      setInbox(res.inbox);
      persistInbox(user?.id ?? '', res.inbox);
      setMessages([]);
      setCreateState('ok');
      setRestoreState('ok');
      await refreshInbox(res.inbox);
    } finally {
      generatingRef.current = false;
    }
  }, [refreshInbox, toast, user?.id]);

  useEffect(() => {
    if (authLoading) return;
    const userId = user?.id ?? '';
    if (!userId) {
      setInbox(null);
      setMessages([]);
      setRestoreState('idle');
      return;
    }
    let cancelled = false;

    const restore = async () => {
      setRestoreState('loading');
      setError(null);
      const stored = readStoredInbox(userId);
      if (stored) {
        setInbox(stored);
        setCreateState('ok');
        setRestoreState('ok');
        void refreshInbox(stored, { silent: true });
      }
      const res = await apiRestoreInbox();
      if (cancelled) return;
      const restoreFailed = isClientError(res);
      const serverInbox = restoreFailed ? null : res.inbox;
      const action = decideTempmailRestore({
        serverInbox,
        localInbox: stored,
        restoreFailed,
      });
      if (action === 'use_server' && serverInbox) {
        setInbox(serverInbox);
        persistInbox(userId, serverInbox);
        setCreateState('ok');
        setRestoreState('ok');
        await refreshInbox(serverInbox);
        return;
      }
      if (action === 'persist_local' && stored) {
        const persisted = await apiPersistInbox(stored.email, stored.inboxToken);
        if (cancelled) return;
        if (!isClientError(persisted)) {
          setInbox(persisted.inbox);
          persistInbox(userId, persisted.inbox);
          setCreateState('ok');
          setRestoreState('ok');
          await refreshInbox(persisted.inbox);
          return;
        }
        setInbox(stored);
        setCreateState('ok');
        setRestoreState('ok');
        return;
      }
      if (action === 'keep_local' && stored) {
        setInbox(stored);
        setCreateState('ok');
        setRestoreState('ok');
        return;
      }
      if (restoreFailed) {
        setRestoreState('error');
        setError(res.error);
        return;
      }
      setInbox(null);
      persistInbox(userId, null);
      setMessages([]);
      setCreateState('idle');
      setRestoreState('ok');
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id, refreshInbox, restoreTick]);

  const copyAddress = useCallback(async () => {
    if (!inbox?.email) return;
    try {
      await navigator.clipboard.writeText(inbox.email);
      setCopied(true);
      toast.success('Address copied');
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error('Could not copy the address.');
    }
  }, [inbox, toast]);

  const openMessage = useCallback(
    async (id: string) => {
      if (!inbox) return;
      setSelectedId(id);
      setDetailState('loading');
      setSource(null);
      setSourceState('idle');
      setAttachments([]);
      const res = await apiReadMessage(inbox.email, inbox.inboxToken, id);
      if (isClientError(res)) {
        setDetailState('error');
        setDetail(null);
        setError(res.error);
        toast.error(res.error);
        return;
      }
      setDetail(res.message);
      setAttachments(res.message.attachments ?? []);
      setDetailState('ok');
      const listed = await apiListAttachments(inbox.email, inbox.inboxToken, id);
      if (!isClientError(listed)) setAttachments(listed.attachments);
    },
    [inbox, toast],
  );

  const deleteMessage = useCallback(async () => {
    if (!inbox || !selectedId) return;
    setDeleting(true);
    const res = await apiDeleteMessage(inbox.email, inbox.inboxToken, selectedId);
    setDeleting(false);
    if (isClientError(res)) {
      toast.error(res.error);
      return;
    }
    setMessages((prev) => prev.filter((m) => m.id !== selectedId));
    setSelectedId(null);
    setDetail(null);
    setSource(null);
    setAttachments([]);
    setDetailState('idle');
    toast.success('Message deleted');
  }, [inbox, selectedId, toast]);

  const loadSource = useCallback(async () => {
    if (!inbox || !selectedId) return;
    setSourceState('loading');
    const res = await apiSourceMessage(inbox.email, inbox.inboxToken, selectedId);
    if (isClientError(res)) {
      setSourceState('error');
      toast.error(res.error);
      return;
    }
    setSource(res.source);
    setSourceState('ok');
  }, [inbox, selectedId, toast]);

  const downloadAttachment = useCallback(
    async (attachment: TempmailAttachment) => {
      if (!inbox || !selectedId) return;
      setDownloadingId(attachment.id);
      const res = await apiGetAttachment(inbox.email, inbox.inboxToken, selectedId, attachment.id);
      setDownloadingId(null);
      if (isClientError(res)) {
        toast.error(res.error);
        return;
      }
      try {
        const binary = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
        const blob = new Blob([binary], { type: res.contentType || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.filename || attachment.name || 'attachment';
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        toast.error('Could not download this attachment.');
      }
    },
    [inbox, selectedId, toast],
  );

  return (
    <div>
      <PageHeader
        eyebrow="Cyber Studio"
        title="CYBER TEMPMAIL"
        subtitle="Generate a disposable inbox, copy the address, and read incoming mail without exposing the RapidAPI key in the browser."
        icon={<Inbox className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={<RefreshCw className="h-4 w-4" />}
              loading={inboxState === 'loading'}
              disabled={!inbox || inboxState === 'loading'}
              onClick={() => inbox && void refreshInbox(inbox)}
            >
              Refresh inbox
            </Button>
            <Button
              variant="cyber"
              icon={<RotateCcw className="h-4 w-4" />}
              loading={createState === 'loading'}
              disabled={createState === 'loading'}
              onClick={() => void generateInbox()}
            >
              New address
            </Button>
            {canManageUsers(role) && (
              <Link href="/studio/tempmail/admin">
                <Button variant="outline">Temp Mail Admin</Button>
              </Link>
            )}
          </div>
        }
      />

      {error && (
        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              if (inbox) {
                void refreshInbox(inbox);
                return;
              }
              setRestoreTick((n) => n + 1);
            }}
          >
            Retry
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="flex flex-col gap-5">
          <Card
            title="Temporary address"
            subtitle="Use this inbox for one-time verification mail only."
            action={
              inboxState === 'error' ? (
                <Badge tone="red" dot>
                  Provider offline
                </Badge>
              ) : restoreState === 'error' && !inbox ? (
                <Badge tone="red">Restore failed</Badge>
              ) : inbox ? (
                <Badge tone="green" dot>
                  Live
                </Badge>
              ) : restoreState === 'loading' || (authLoading && !inbox) ? (
                <Badge tone="muted">Restoring</Badge>
              ) : (
                <Badge tone="muted">No inbox</Badge>
              )
            }
          >
            {createState === 'loading' && !inbox ? (
              <div className="flex items-center gap-3 py-8 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin text-accent" />
                Generating a disposable address…
              </div>
            ) : restoreState === 'loading' && !inbox ? (
              <div className="flex items-center gap-3 py-8 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin text-accent" />
                Restoring your saved inbox…
              </div>
            ) : inbox ? (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-raised px-4 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-dimm">
                      Inbox
                    </div>
                    <div className="mt-1 break-all font-mono text-sm text-primary sm:text-[15px]">
                      {inbox.email}
                    </div>
                  </div>
                  <Button
                    variant={copied ? 'success' : 'primary'}
                    icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    onClick={() => void copyAddress()}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                  <Badge tone="violet">{inbox.domain}</Badge>
                  <span>Session until {new Date(inbox.expiresAt).toLocaleString()}</span>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={<Mail className="h-7 w-7" />}
                title="No inbox yet"
                description={TEMPMAIL_NO_INBOX_COPY}
                action={
                  <Button variant="primary" onClick={() => void generateInbox()}>
                    New address
                  </Button>
                }
              />
            )}
          </Card>

          <Card
            title="Inbox"
            subtitle={inboxState === 'loading' ? 'Checking provider…' : `${messages.length} message${messages.length === 1 ? '' : 's'}`}
            flush
          >
            {restoreState === 'loading' && !inbox ? (
              <div className="flex items-center justify-center gap-2 px-5 py-16 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin text-accent" />
                Restoring saved inbox…
              </div>
            ) : !inbox ? (
              <EmptyState
                className="m-5"
                icon={<Inbox className="h-7 w-7" />}
                title="No inbox yet"
                description={TEMPMAIL_NO_INBOX_COPY}
              />
            ) : inboxState === 'error' ? (
              <EmptyState
                className="m-5"
                icon={<AlertCircle className="h-7 w-7" />}
                title="Provider offline"
                description={error || 'The temporary email provider could not be reached. Your saved address was not replaced.'}
                action={
                  <Button variant="secondary" onClick={() => void refreshInbox(inbox)}>
                    Retry refresh
                  </Button>
                }
              />
            ) : inboxState === 'loading' && messages.length === 0 ? (
              <div className="flex items-center justify-center gap-2 px-5 py-16 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin text-accent" />
                Refreshing inbox…
              </div>
            ) : messages.length === 0 ? (
              <EmptyState
                className="m-5"
                icon={<Inbox className="h-7 w-7" />}
                title="Inbox is empty"
                description="Waiting for incoming mail. Send a message to the address, then refresh."
                action={
                  <Button variant="secondary" onClick={() => void refreshInbox(inbox)}>
                    Refresh
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-line">
                {messages.map((message) => {
                  const active = message.id === selectedId;
                  return (
                    <li key={message.id}>
                      <button
                        type="button"
                        onClick={() => void openMessage(message.id)}
                        className={cn(
                          'flex w-full flex-col gap-1 px-5 py-4 text-left transition',
                          active ? 'bg-accent/10' : 'hover:bg-surface-hover',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 truncate text-[13px] font-semibold text-primary">
                            {message.from}
                          </div>
                          <div className="shrink-0 font-mono text-[10px] text-dimm">
                            {timeAgo(message.receivedAt)}
                          </div>
                        </div>
                        <div className="truncate text-[13px] text-secondary">{message.subject}</div>
                        {message.preview && (
                          <div className="truncate text-xs text-muted">{message.preview}</div>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <Card
          title={selected?.subject || 'Message'}
          subtitle={selected ? selected.from : 'Select a message to read its content'}
          action={
            selected ? (
              <Button
                size="sm"
                variant="danger"
                icon={<Trash2 className="h-3.5 w-3.5" />}
                loading={deleting}
                onClick={() => void deleteMessage()}
              >
                Delete
              </Button>
            ) : null
          }
        >
          {!selected ? (
            <EmptyState
              icon={<Mail className="h-7 w-7" />}
              title="No message selected"
              description="Choose a message from the inbox to view sender, subject, time, and body."
            />
          ) : detailState === 'loading' ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
              Loading message…
            </div>
          ) : detailState === 'error' ? (
            <EmptyState
              icon={<AlertCircle className="h-7 w-7" />}
              title="Could not load message"
              description={error || 'The provider did not return this message.'}
              action={
                <Button variant="secondary" onClick={() => void openMessage(selected.id)}>
                  Retry
                </Button>
              }
            />
          ) : (
            <div className="space-y-4">
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-line bg-surface-raised px-3.5 py-3">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-dimm">From</dt>
                  <dd className="mt-1 break-all text-sm text-primary">{detail?.from || selected.from}</dd>
                </div>
                <div className="rounded-xl border border-line bg-surface-raised px-3.5 py-3">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-dimm">Received</dt>
                  <dd className="mt-1 text-sm text-primary">
                    {detail?.receivedAt || selected.receivedAt
                      ? new Date(detail?.receivedAt || selected.receivedAt || '').toLocaleString()
                      : '—'}
                  </dd>
                </div>
              </dl>
              <div className="rounded-2xl border border-line bg-surface-raised p-4">
                <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-dimm">
                  Content
                </div>
                <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap break-words font-body text-[13px] leading-relaxed text-secondary">
                  {messageBody(detail)}
                </pre>
              </div>
              {attachments.length > 0 && (
                <div className="rounded-2xl border border-line bg-surface-raised p-4">
                  <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-dimm">
                    <Paperclip className="h-3.5 w-3.5" />
                    Attachments
                  </div>
                  <div className="flex flex-col gap-2">
                    {attachments.map((file) => (
                      <div key={file.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] text-primary">{file.name}</div>
                          <div className="font-mono text-[10px] text-dimm">
                            {file.contentType || 'file'}
                            {file.size != null ? ` · ${file.size} bytes` : ''}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          loading={downloadingId === file.id}
                          onClick={() => void downloadAttachment(file)}
                        >
                          Download
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  icon={<FileText className="h-3.5 w-3.5" />}
                  loading={sourceState === 'loading'}
                  onClick={() => void loadSource()}
                >
                  View source
                </Button>
              </div>
              {sourceState === 'ok' && source != null && (
                <pre className="max-h-[280px] overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-line bg-canvas p-4 font-mono text-[11px] text-muted">
                  {source}
                </pre>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
