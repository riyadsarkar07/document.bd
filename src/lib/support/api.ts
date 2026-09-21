'use client';

import { supabase } from '@/lib/supabase/client';
import { validateSupportAttachment } from '@/lib/uploads';
import { escapePostgrestSearch } from '@/lib/utils';
import { logAudit } from '@/lib/workspace/audit';
import {
  isSupportCategory,
  isSupportPriority,
  isSupportStatus,
  SUPPORT_ATTACHMENT_MAX_FILES,
  validateReplyBody,
  validateTicketDraft,
  type SupportAttachment,
  type SupportCategory,
  type SupportMessage,
  type SupportNote,
  type SupportPriority,
  type SupportStatus,
  type SupportTicket,
  type SupportTicketList,
  type SupportTicketQuery,
} from '@/lib/support/types';

type TicketRow = {
  id: string;
  ticket_no: string;
  user_id: string;
  user_email: string | null;
  category: string;
  subject: string;
  status: string;
  priority: string;
  assigned_admin_id: string | null;
  assigned_admin_email: string | null;
  last_reply_at: string | null;
  last_reply_by: string | null;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  ticket_id: string;
  author_id: string | null;
  author_email: string | null;
  author_role: string;
  body: string;
  created_at: string;
};

type NoteRow = {
  id: string;
  ticket_id: string;
  author_id: string | null;
  author_email: string | null;
  body: string;
  created_at: string;
};

type AttachmentRow = {
  id: string;
  ticket_id: string;
  message_id: string | null;
  uploaded_by: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  created_at: string;
};

function fail(message: string): string {
  return message.replace(/^(?:error:|ERROR:)\s*/i, '').trim() || 'Request failed.';
}

function mapTicket(row: TicketRow): SupportTicket {
  return {
    id: row.id,
    ticketNo: row.ticket_no,
    userId: row.user_id,
    userEmail: row.user_email,
    category: isSupportCategory(row.category) ? row.category : 'other',
    subject: row.subject,
    status: isSupportStatus(row.status) ? row.status : 'open',
    priority: isSupportPriority(row.priority) ? row.priority : 'normal',
    assignedAdminId: row.assigned_admin_id,
    assignedAdminEmail: row.assigned_admin_email,
    lastReplyAt: row.last_reply_at,
    lastReplyBy: row.last_reply_by === 'admin' || row.last_reply_by === 'user' ? row.last_reply_by : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: MessageRow): SupportMessage {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    authorId: row.author_id,
    authorEmail: row.author_email,
    authorRole: row.author_role === 'admin' ? 'admin' : 'user',
    body: row.body,
    createdAt: row.created_at,
  };
}

function mapNote(row: NoteRow): SupportNote {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    authorId: row.author_id,
    authorEmail: row.author_email,
    body: row.body,
    createdAt: row.created_at,
  };
}

function mapAttachment(row: AttachmentRow, url?: string | null): SupportAttachment {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    messageId: row.message_id,
    uploadedBy: row.uploaded_by,
    storagePath: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    createdAt: row.created_at,
    url: url ?? null,
  };
}

function safeFileName(name: string): string {
  const base = name.replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').replace(/^\.+/, '');
  return (base || 'file').slice(0, 120);
}

function sniffedMime(file: File): string {
  const lower = file.name.toLowerCase();
  if (file.type === 'application/pdf' || lower.endsWith('.pdf')) return 'application/pdf';
  if (file.type === 'image/png' || lower.endsWith('.png')) return 'image/png';
  if (file.type === 'image/webp' || lower.endsWith('.webp')) return 'image/webp';
  if (file.type === 'image/gif' || lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

export async function listSupportTickets(q: SupportTicketQuery = {}): Promise<SupportTicketList> {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 20));

  let query = supabase
    .from('support_tickets')
    .select(
      'id, ticket_no, user_id, user_email, category, subject, status, priority, assigned_admin_id, assigned_admin_email, last_reply_at, last_reply_by, created_at, updated_at',
      { count: 'exact' },
    );

  const search = escapePostgrestSearch(q.search ?? '');
  if (search) {
    query = query.or(
      `ticket_no.ilike.%${search}%,subject.ilike.%${search}%,user_email.ilike.%${search}%`,
    );
  }
  if (q.status) query = query.eq('status', q.status);
  if (q.category) query = query.eq('category', q.category);

  query = query
    .order('updated_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const { data, error, count } = await query;
  if (error) {
    return { tickets: [], total: 0, page, pageSize, error: fail(error.message) };
  }
  const tickets = ((data ?? []) as TicketRow[]).map(mapTicket);
  return { tickets, total: count ?? tickets.length, page, pageSize, error: null };
}

export async function getSupportTicket(id: string): Promise<{
  ticket: SupportTicket | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('support_tickets')
    .select(
      'id, ticket_no, user_id, user_email, category, subject, status, priority, assigned_admin_id, assigned_admin_email, last_reply_at, last_reply_by, created_at, updated_at',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) return { ticket: null, error: fail(error.message) };
  if (!data) return { ticket: null, error: 'Ticket not found.' };
  return { ticket: mapTicket(data as TicketRow), error: null };
}

export async function listSupportMessages(ticketId: string): Promise<{
  messages: SupportMessage[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('support_messages')
    .select('id, ticket_id, author_id, author_email, author_role, body, created_at')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  if (error) return { messages: [], error: fail(error.message) };
  return { messages: ((data ?? []) as MessageRow[]).map(mapMessage), error: null };
}

export async function listSupportNotes(ticketId: string): Promise<{
  notes: SupportNote[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('support_notes')
    .select('id, ticket_id, author_id, author_email, body, created_at')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  if (error) return { notes: [], error: fail(error.message) };
  return { notes: ((data ?? []) as NoteRow[]).map(mapNote), error: null };
}

export async function listSupportAttachments(ticketId: string): Promise<{
  attachments: SupportAttachment[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('support_attachments')
    .select(
      'id, ticket_id, message_id, uploaded_by, storage_path, file_name, mime_type, byte_size, created_at',
    )
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  if (error) return { attachments: [], error: fail(error.message) };
  const rows = (data ?? []) as AttachmentRow[];
  const attachments = await Promise.all(
    rows.map(async (row) => {
      const { data: signed } = await supabase.storage
        .from('support-attachments')
        .createSignedUrl(row.storage_path, 3600);
      return mapAttachment(row, signed?.signedUrl ?? null);
    }),
  );
  return { attachments, error: null };
}

async function uploadAttachments(ticketId: string, files: File[], messageId?: string | null): Promise<string | null> {
  if (!files.length) return null;
  if (files.length > SUPPORT_ATTACHMENT_MAX_FILES) {
    return `At most ${SUPPORT_ATTACHMENT_MAX_FILES} files can be attached.`;
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return 'Not signed in.';

  const { data: ticketRow } = await supabase
    .from('support_tickets')
    .select('user_id')
    .eq('id', ticketId)
    .maybeSingle();
  const ownerId = (ticketRow as { user_id?: string } | null)?.user_id ?? user.id;

  for (const file of files) {
    const invalid = await validateSupportAttachment(file);
    if (invalid) return invalid;
  }

  for (const file of files) {
    const mime = sniffedMime(file);
    const path = `${ownerId}/${ticketId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const { error: upErr } = await supabase.storage.from('support-attachments').upload(path, file, {
      contentType: mime,
      upsert: false,
    });
    if (upErr) return fail(upErr.message);
    const { error: rowErr } = await supabase.from('support_attachments').insert({
      ticket_id: ticketId,
      message_id: messageId ?? null,
      uploaded_by: user.id,
      storage_path: path,
      file_name: file.name.slice(0, 180),
      mime_type: mime,
      byte_size: file.size,
    });
    if (rowErr) return fail(rowErr.message);
  }
  return null;
}

export async function createSupportTicket(input: {
  category: SupportCategory;
  subject: string;
  body: string;
  files?: File[];
}): Promise<{ ticket: SupportTicket | null; error: string | null }> {
  const draftError = validateTicketDraft(input);
  if (draftError) return { ticket: null, error: draftError };
  const files = input.files ?? [];
  if (files.length > SUPPORT_ATTACHMENT_MAX_FILES) {
    return { ticket: null, error: `At most ${SUPPORT_ATTACHMENT_MAX_FILES} files can be attached.` };
  }
  for (const file of files) {
    const invalid = await validateSupportAttachment(file);
    if (invalid) return { ticket: null, error: invalid };
  }

  const { data, error } = await supabase.rpc('create_support_ticket', {
    p_category: input.category,
    p_subject: input.subject.trim(),
    p_body: input.body.trim(),
  });
  if (error || !data) {
    return { ticket: null, error: fail(error?.message ?? 'Could not create ticket.') };
  }
  const ticket = mapTicket(data as TicketRow);
  const attachErr = await uploadAttachments(ticket.id, files);
  if (attachErr) {
    return { ticket, error: `Ticket created, but a file failed to upload: ${attachErr}` };
  }
  void logAudit({
    action: 'support.ticket.created',
    targetType: 'support_ticket',
    targetId: ticket.ticketNo,
    metadata: { category: ticket.category },
  });
  return { ticket, error: null };
}

export async function replySupportTicket(input: {
  ticketId: string;
  body: string;
  files?: File[];
}): Promise<{ message: SupportMessage | null; error: string | null }> {
  const bodyError = validateReplyBody(input.body);
  if (bodyError) return { message: null, error: bodyError };
  const files = input.files ?? [];
  for (const file of files) {
    const invalid = await validateSupportAttachment(file);
    if (invalid) return { message: null, error: invalid };
  }

  const { data, error } = await supabase.rpc('reply_support_ticket', {
    p_ticket_id: input.ticketId,
    p_body: input.body.trim(),
  });
  if (error || !data) {
    return { message: null, error: fail(error?.message ?? 'Could not send reply.') };
  }
  const message = mapMessage(data as MessageRow);
  const attachErr = await uploadAttachments(input.ticketId, files, message.id);
  if (attachErr) {
    return { message, error: `Reply sent, but a file failed to upload: ${attachErr}` };
  }
  void logAudit({
    action: 'support.ticket.replied',
    targetType: 'support_ticket',
    targetId: input.ticketId,
  });
  return { message, error: null };
}

export async function markSupportTicketInReview(ticketId: string): Promise<{
  ticket: SupportTicket | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('mark_support_ticket_in_review', {
    p_ticket_id: ticketId,
  });
  if (error || !data) {
    return { ticket: null, error: fail(error?.message ?? 'Could not update ticket.') };
  }
  const ticket = mapTicket(data as TicketRow);
  if (ticket.status === 'in_review') {
    void logAudit({
      action: 'support.ticket.updated',
      targetType: 'support_ticket',
      targetId: ticket.ticketNo,
      metadata: { status: ticket.status, reason: 'admin_view' },
    });
  }
  return { ticket, error: null };
}

export async function updateSupportTicket(input: {
  ticketId: string;
  status?: SupportStatus;
  priority?: SupportPriority;
  assignSelf?: boolean;
}): Promise<{ ticket: SupportTicket | null; error: string | null }> {
  const { data, error } = await supabase.rpc('update_support_ticket', {
    p_ticket_id: input.ticketId,
    p_status: input.status ?? null,
    p_priority: input.priority ?? null,
    p_assign_self: input.assignSelf ?? null,
  });
  if (error || !data) {
    return { ticket: null, error: fail(error?.message ?? 'Could not update ticket.') };
  }
  const ticket = mapTicket(data as TicketRow);
  void logAudit({
    action: input.status === 'escalated' ? 'support.ticket.escalated' : 'support.ticket.updated',
    targetType: 'support_ticket',
    targetId: ticket.ticketNo,
    metadata: {
      status: ticket.status,
      priority: ticket.priority,
    },
  });
  return { ticket, error: null };
}

export async function addSupportNote(ticketId: string, body: string): Promise<{
  note: SupportNote | null;
  error: string | null;
}> {
  const bodyError = validateReplyBody(body);
  if (bodyError) return { note: null, error: bodyError };
  const { data, error } = await supabase.rpc('add_support_note', {
    p_ticket_id: ticketId,
    p_body: body.trim(),
  });
  if (error || !data) {
    return { note: null, error: fail(error?.message ?? 'Could not add note.') };
  }
  void logAudit({
    action: 'support.note.added',
    targetType: 'support_ticket',
    targetId: ticketId,
  });
  return { note: mapNote(data as NoteRow), error: null };
}

export function subscribeSupportInbox(onChange: () => void): () => void {
  const channel = supabase
    .channel(`support-inbox-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, onChange)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, onChange)
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeSupportTicket(ticketId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`support-ticket-${ticketId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'support_messages', filter: `ticket_id=eq.${ticketId}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'support_tickets', filter: `id=eq.${ticketId}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'support_notes', filter: `ticket_id=eq.${ticketId}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'support_attachments', filter: `ticket_id=eq.${ticketId}` },
      onChange,
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export function formatByteSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
