'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, LifeBuoy, Lock, Paperclip, Send } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { canManageUsers } from '@/lib/auth/types';
import {
  addSupportNote,
  formatByteSize,
  getSupportTicket,
  listSupportAttachments,
  listSupportMessages,
  listSupportNotes,
  replySupportTicket,
  subscribeSupportTicket,
  updateSupportTicket,
} from '@/lib/support/api';
import {
  SUPPORT_ATTACHMENT_MAX_FILES,
  SUPPORT_CATEGORY_LABEL,
  SUPPORT_PRIORITIES,
  SUPPORT_PRIORITY_LABEL,
  SUPPORT_PRIORITY_TONE,
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABEL,
  SUPPORT_STATUS_TONE,
  type SupportAttachment,
  type SupportMessage,
  type SupportNote,
  type SupportPriority,
  type SupportStatus,
  type SupportTicket,
} from '@/lib/support/types';
import { Card, PageHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldLabel, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/lib/toast/toast-provider';
import { cn, timeAgo } from '@/lib/utils';

export default function SupportTicketPage() {
  const params = useParams<{ id: string }>();
  const ticketId = params.id;
  const { role } = useAuth();
  const toast = useToast();
  const isAdmin = canManageUsers(role);

  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [notes, setNotes] = useState<SupportNote[]>([]);
  const [attachments, setAttachments] = useState<SupportAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [noteBody, setNoteBody] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);

  const load = useCallback(async () => {
    const [ticketRes, msgRes, attRes, noteRes] = await Promise.all([
      getSupportTicket(ticketId),
      listSupportMessages(ticketId),
      listSupportAttachments(ticketId),
      isAdmin ? listSupportNotes(ticketId) : Promise.resolve({ notes: [] as SupportNote[], error: null }),
    ]);
    if (ticketRes.error || !ticketRes.ticket) {
      setTicket(null);
      setError(ticketRes.error ?? 'Ticket not found.');
      setLoading(false);
      return;
    }
    setTicket(ticketRes.ticket);
    setMessages(msgRes.messages);
    setAttachments(attRes.attachments);
    setNotes(noteRes.notes);
    setError(msgRes.error || attRes.error || noteRes.error);
    setLoading(false);
  }, [ticketId, isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return subscribeSupportTicket(ticketId, () => {
      void load();
    });
  }, [ticketId, load]);

  const attachmentsByMessage = useMemo(() => {
    const map = new Map<string, SupportAttachment[]>();
    const unlinked: SupportAttachment[] = [];
    for (const att of attachments) {
      if (!att.messageId) {
        unlinked.push(att);
        continue;
      }
      const list = map.get(att.messageId) ?? [];
      list.push(att);
      map.set(att.messageId, list);
    }
    return { map, unlinked };
  }, [attachments]);

  const userClosed = ticket?.status === 'closed' && !isAdmin;

  const sendReply = async () => {
    if (!ticket) return;
    setSending(true);
    const res = await replySupportTicket({ ticketId: ticket.id, body: reply, files });
    setSending(false);
    if (!res.message) {
      toast.error(res.error ?? 'Could not send reply.');
      return;
    }
    if (res.error) toast.error(res.error);
    setReply('');
    setFiles([]);
    toast.success('Reply sent');
    void load();
  };

  const saveMeta = async (patch: {
    status?: SupportStatus;
    priority?: SupportPriority;
    assignSelf?: boolean;
  }) => {
    if (!ticket) return;
    setSavingMeta(true);
    const res = await updateSupportTicket({ ticketId: ticket.id, ...patch });
    setSavingMeta(false);
    if (!res.ticket) {
      toast.error(res.error ?? 'Could not update ticket.');
      return;
    }
    setTicket(res.ticket);
    toast.success('Ticket updated');
  };

  const saveNote = async () => {
    if (!ticket) return;
    setSavingNote(true);
    const res = await addSupportNote(ticket.id, noteBody);
    setSavingNote(false);
    if (!res.note) {
      toast.error(res.error ?? 'Could not add note.');
      return;
    }
    setNoteBody('');
    toast.success('Internal note saved');
    void load();
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-16 animate-pulse rounded-2xl bg-surface-raised" />
        <div className="h-72 animate-pulse rounded-2xl bg-surface-raised" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <EmptyState
        icon={<LifeBuoy className="h-7 w-7" />}
        title="Ticket not found"
        description={error ?? 'This ticket is missing or you do not have access.'}
        action={
          <Link href="/studio/support">
            <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />}>
              Back to inbox
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <div>
      <PageHeader
        title={ticket.subject}
        subtitle={`${SUPPORT_CATEGORY_LABEL[ticket.category]} · opened ${timeAgo(ticket.createdAt)}`}
        icon={<LifeBuoy className="h-5 w-5" />}
        eyebrow={ticket.ticketNo}
        actions={
          <Link href="/studio/support">
            <Button variant="secondary" size="sm" icon={<ArrowLeft className="h-4 w-4" />}>
              Inbox
            </Button>
          </Link>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge tone={SUPPORT_STATUS_TONE[ticket.status]}>{SUPPORT_STATUS_LABEL[ticket.status]}</Badge>
        <Badge tone={SUPPORT_PRIORITY_TONE[ticket.priority]}>{SUPPORT_PRIORITY_LABEL[ticket.priority]}</Badge>
        {isAdmin && ticket.userEmail && <Badge tone="muted">{ticket.userEmail}</Badge>}
        {ticket.assignedAdminEmail && <Badge tone="blue">Assigned {ticket.assignedAdminEmail}</Badge>}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className={cn('grid grid-cols-1 gap-5', isAdmin && 'xl:grid-cols-[minmax(0,1fr)_320px]')}>
        <div className="space-y-5">
          <Card title="Conversation" subtitle="Public thread visible to the ticket owner">
            {attachmentsByMessage.unlinked.length > 0 && (
              <div className="mb-4 rounded-xl border border-line bg-surface-raised p-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Opening attachments</div>
                <AttachmentList items={attachmentsByMessage.unlinked} />
              </div>
            )}
            <div className="space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    'rounded-2xl border px-4 py-3',
                    msg.authorRole === 'admin'
                      ? 'border-info/25 bg-info/5'
                      : 'border-line bg-surface-raised',
                  )}
                >
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-primary">
                      {msg.authorRole === 'admin' ? 'Support' : msg.authorEmail || 'You'}
                    </div>
                    <div className="font-mono text-[10.5px] text-dimm">{timeAgo(msg.createdAt)}</div>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-secondary">{msg.body}</p>
                  <AttachmentList items={attachmentsByMessage.map.get(msg.id) ?? []} />
                </div>
              ))}
            </div>
          </Card>

          <Card title="Reply" subtitle={userClosed ? 'This ticket is closed' : 'Visible to the ticket owner'}>
            {userClosed ? (
              <p className="text-sm text-muted">Only support can reopen or add another public reply.</p>
            ) : (
              <div className="space-y-3">
                <Textarea
                  rows={5}
                  value={reply}
                  maxLength={8000}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Write a reply…"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                    onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, SUPPORT_ATTACHMENT_MAX_FILES))}
                    className="max-w-full text-xs text-muted"
                  />
                  <Button
                    variant="primary"
                    loading={sending}
                    icon={<Send className="h-4 w-4" />}
                    onClick={() => void sendReply()}
                  >
                    Send reply
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>

        {isAdmin && (
          <div className="space-y-5">
            <Card title="Admin controls" subtitle="Status, assignment, and priority">
              <div className="space-y-3">
                <div>
                  <FieldLabel>Status</FieldLabel>
                  <Select
                    value={ticket.status}
                    disabled={savingMeta}
                    onChange={(e) => void saveMeta({ status: e.target.value as SupportStatus })}
                    options={SUPPORT_STATUSES.map((s) => ({ value: s, label: SUPPORT_STATUS_LABEL[s] }))}
                  />
                </div>
                <div>
                  <FieldLabel>Priority</FieldLabel>
                  <Select
                    value={ticket.priority}
                    disabled={savingMeta}
                    onChange={(e) => void saveMeta({ priority: e.target.value as SupportPriority })}
                    options={SUPPORT_PRIORITIES.map((p) => ({ value: p, label: SUPPORT_PRIORITY_LABEL[p] }))}
                  />
                </div>
                <Button
                  variant="soft"
                  className="w-full"
                  loading={savingMeta}
                  onClick={() => void saveMeta({ assignSelf: true })}
                >
                  Assign to me
                </Button>
                <Button
                  variant="danger"
                  className="w-full"
                  loading={savingMeta}
                  onClick={() => void saveMeta({ status: 'escalated', assignSelf: true })}
                >
                  Escalate
                </Button>
              </div>
            </Card>

            <Card
              title="Internal notes"
              subtitle="Never shown to the user"
              action={<Lock className="h-4 w-4 text-dimm" />}
            >
              <div className="mb-3 space-y-2">
                {notes.length === 0 && <p className="text-xs text-muted">No internal notes yet.</p>}
                {notes.map((note) => (
                  <div key={note.id} className="rounded-xl border border-warning/25 bg-warning/5 px-3 py-2">
                    <div className="mb-1 flex items-center justify-between gap-2 text-[10.5px] text-dimm">
                      <span>{note.authorEmail || 'Admin'}</span>
                      <span className="font-mono">{timeAgo(note.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-xs text-secondary">{note.body}</p>
                  </div>
                ))}
              </div>
              <Textarea
                rows={4}
                value={noteBody}
                maxLength={8000}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder="Private note for other admins…"
              />
              <Button className="mt-3 w-full" loading={savingNote} onClick={() => void saveNote()}>
                Save note
              </Button>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function AttachmentList({ items }: { items: SupportAttachment[] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-3 space-y-1.5">
      {items.map((att) => (
        <li key={att.id}>
          {att.url ? (
            <a
              href={att.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center gap-1.5 truncate text-xs text-accent-bright hover:underline"
            >
              <Paperclip className="h-3.5 w-3.5 shrink-0" />
              {att.fileName}
              <span className="font-mono text-[10px] text-dimm">{formatByteSize(att.byteSize)}</span>
            </a>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <Paperclip className="h-3.5 w-3.5" />
              {att.fileName}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
