'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { LifeBuoy, Plus, Search } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { canManageUsers } from '@/lib/auth/types';
import {
  createSupportTicket,
  listSupportTickets,
  subscribeSupportInbox,
} from '@/lib/support/api';
import {
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABEL,
  SUPPORT_PRIORITY_LABEL,
  SUPPORT_PRIORITY_TONE,
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABEL,
  SUPPORT_STATUS_TONE,
  SUPPORT_ATTACHMENT_MAX_FILES,
  type SupportCategory,
  type SupportStatus,
  type SupportTicket,
} from '@/lib/support/types';
import { Card, PageHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldLabel, Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Pagination } from '@/components/ui/pagination';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/lib/toast/toast-provider';
import { timeAgo } from '@/lib/utils';

const PAGE_SIZE = 20;

export default function SupportInboxPage() {
  const { role } = useAuth();
  const toast = useToast();
  const isAdmin = canManageUsers(role);

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [status, setStatus] = useState<SupportStatus | ''>('');
  const [category, setCategory] = useState<SupportCategory | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await listSupportTickets({
      search: searchTerm,
      status,
      category,
      page,
      pageSize: PAGE_SIZE,
    });
    setTickets(res.tickets);
    setTotal(res.total);
    setError(res.error);
    setLoading(false);
  }, [searchTerm, status, category, page]);

  useEffect(() => {
    const t = setTimeout(() => void refresh(), 180);
    return () => clearTimeout(t);
  }, [refresh]);

  useEffect(() => {
    return subscribeSupportInbox(() => {
      void refresh();
    });
  }, [refresh]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, status, category]);

  const openCount = useMemo(
    () => tickets.filter((t) => t.status !== 'closed' && t.status !== 'resolved').length,
    [tickets],
  );

  return (
    <div>
      <PageHeader
        title={isAdmin ? 'Support Inbox' : 'My Support Tickets'}
        subtitle={
          isAdmin
            ? 'Search, reply, escalate, and resolve tickets from every user.'
            : 'Create a ticket and follow replies from the support team.'
        }
        icon={<LifeBuoy className="h-5 w-5" />}
        actions={
          <>
            <Badge tone="gold">{openCount} open on this page</Badge>
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setComposeOpen(true)}>
              New ticket
            </Button>
          </>
        }
      />

      <Card className="mb-5" flush>
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[220px] flex-1">
            <FieldLabel htmlFor="support-search">Search</FieldLabel>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dimm" />
              <Input
                id="support-search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={isAdmin ? 'Ticket no, subject, or email' : 'Ticket no or subject'}
                className="pl-9"
              />
            </div>
          </div>
          <div className="w-full sm:w-44">
            <FieldLabel htmlFor="support-status">Status</FieldLabel>
            <Select
              id="support-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as SupportStatus | '')}
              options={[
                { value: '', label: 'All statuses' },
                ...SUPPORT_STATUSES.map((s) => ({ value: s, label: SUPPORT_STATUS_LABEL[s] })),
              ]}
            />
          </div>
          <div className="w-full sm:w-52">
            <FieldLabel htmlFor="support-category">Category</FieldLabel>
            <Select
              id="support-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as SupportCategory | '')}
              options={[
                { value: '', label: 'All categories' },
                ...SUPPORT_CATEGORIES.map((c) => ({ value: c, label: SUPPORT_CATEGORY_LABEL[c] })),
              ]}
            />
          </div>
        </div>
      </Card>

      {error && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {loading && tickets.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface-raised" />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <EmptyState
          icon={<LifeBuoy className="h-7 w-7" />}
          title="No tickets yet"
          description={
            isAdmin
              ? 'When users open tickets they will appear here in realtime.'
              : 'Open a ticket if something is broken, billed incorrectly, or needs a human reply.'
          }
          action={
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setComposeOpen(true)}>
              New ticket
            </Button>
          }
        />
      ) : (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-line bg-surface-raised/70 text-[11px] uppercase tracking-wide text-dimm">
                <tr>
                  <th className="px-4 py-3 font-semibold">Ticket</th>
                  <th className="px-4 py-3 font-semibold">Subject</th>
                  {isAdmin && <th className="px-4 py-3 font-semibold">User</th>}
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.id} className="border-b border-line last:border-0 hover:bg-surface-raised/50">
                    <td className="px-4 py-3">
                      <Link href={`/studio/support/${ticket.id}`} className="font-mono text-xs text-accent-bright hover:underline">
                        {ticket.ticketNo}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/studio/support/${ticket.id}`} className="block max-w-[320px] truncate font-medium text-primary hover:text-accent-bright">
                        {ticket.subject}
                      </Link>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <span className="block max-w-[180px] truncate text-xs text-muted">{ticket.userEmail || '—'}</span>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted">{SUPPORT_CATEGORY_LABEL[ticket.category]}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <Badge tone={SUPPORT_STATUS_TONE[ticket.status]}>{SUPPORT_STATUS_LABEL[ticket.status]}</Badge>
                        {ticket.priority !== 'normal' && (
                          <Badge tone={SUPPORT_PRIORITY_TONE[ticket.priority]}>{SUPPORT_PRIORITY_LABEL[ticket.priority]}</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-dimm">
                      {timeAgo(ticket.lastReplyAt || ticket.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line px-4 py-3">
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
          </div>
        </Card>
      )}

      <ComposeTicketModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onCreated={(ticket) => {
          setComposeOpen(false);
          toast.success(`Ticket ${ticket.ticketNo} opened`);
          void refresh();
        }}
      />
    </div>
  );
}

function ComposeTicketModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (ticket: SupportTicket) => void;
}) {
  const toast = useToast();
  const [category, setCategory] = useState<SupportCategory>('bug');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCategory('bug');
    setSubject('');
    setBody('');
    setFiles([]);
    setSaving(false);
  }, [open]);

  const submit = async () => {
    setSaving(true);
    const res = await createSupportTicket({ category, subject, body, files });
    setSaving(false);
    if (!res.ticket) {
      toast.error(res.error ?? 'Could not create ticket.');
      return;
    }
    if (res.error) toast.error(res.error);
    onCreated(res.ticket);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New support ticket"
      meta="Screenshots and PDFs up to 8 MB"
      maxWidth="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void submit()}>
            Submit ticket
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <FieldLabel htmlFor="new-ticket-category">Category</FieldLabel>
          <Select
            id="new-ticket-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as SupportCategory)}
            options={SUPPORT_CATEGORIES.map((c) => ({ value: c, label: SUPPORT_CATEGORY_LABEL[c] }))}
          />
        </div>
        <div>
          <FieldLabel htmlFor="new-ticket-subject" hint={`${subject.trim().length}/160`}>
            Subject
          </FieldLabel>
          <Input
            id="new-ticket-subject"
            value={subject}
            maxLength={160}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Short summary of the issue"
          />
        </div>
        <div>
          <FieldLabel htmlFor="new-ticket-body" hint={`${body.trim().length}/8000`}>
            Description
          </FieldLabel>
          <Textarea
            id="new-ticket-body"
            rows={7}
            value={body}
            maxLength={8000}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What happened, what you expected, and any ticket or document numbers."
          />
        </div>
        <div>
          <FieldLabel htmlFor="new-ticket-files">Attachments</FieldLabel>
          <Input
            id="new-ticket-files"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, SUPPORT_ATTACHMENT_MAX_FILES))}
          />
          {files.length > 0 && (
            <p className="mt-1.5 text-xs text-muted">
              {files.length} file{files.length === 1 ? '' : 's'} selected
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
