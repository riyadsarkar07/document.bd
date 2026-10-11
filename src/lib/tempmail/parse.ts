import { normalizeDomain } from '@/lib/tempmail/hash';
import type {
  TempmailAttachment,
  TempmailMessageDetail,
  TempmailMessageSummary,
} from '@/lib/tempmail/types';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function pickString(record: Record<string, unknown> | null, keys: string[]): string {
  if (!record) return '';
  for (const key of keys) {
    const found = asString(record[key]);
    if (found) return found;
  }
  return '';
}

function unwrapList(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  if (!record) return null;
  for (const key of ['messages', 'mail', 'mails', 'email', 'emails', 'data', 'result', 'list']) {
    const inner = record[key];
    if (Array.isArray(inner)) return inner;
  }
  return null;
}

function isEmptyMailbox(payload: unknown): boolean {
  if (payload == null) return true;
  if (Array.isArray(payload) && payload.length === 0) return true;
  if (typeof payload === 'string') {
    const lower = payload.toLowerCase();
    return /no emails|empty|not found|there are no/.test(lower);
  }
  const record = asRecord(payload);
  if (!record) return false;
  const msg = pickString(record, ['error', 'message', 'detail', 'info']).toLowerCase();
  return /no emails|empty|not found|there are no/.test(msg);
}

export function parseDomains(payload: unknown): string[] {
  const list = unwrapList(payload);
  const source = list ?? (typeof payload === 'string' ? [payload] : null);
  if (!source) {
    throw new Error('Provider returned an unrecognized domains payload.');
  }
  const domains = source
    .map((item) => {
      if (typeof item === 'string') return normalizeDomain(item);
      const record = asRecord(item);
      return normalizeDomain(pickString(record, ['domain', 'name', 'value', 'host']));
    })
    .filter((d) => /^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/.test(d));
  const unique = Array.from(new Set(domains));
  if (unique.length === 0) {
    throw new Error('Provider returned no usable email domains.');
  }
  return unique;
}

function normalizeReceivedAt(value: string): string | null {
  if (!value) return null;
  if (/^\d{10,13}$/.test(value)) {
    const n = Number(value);
    const ms = value.length <= 10 ? n * 1000 : n;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? value : d.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function previewFrom(text: string, html: string): string {
  const raw = text || html.replace(/<[^>]+>/g, ' ');
  return raw.replace(/\s+/g, ' ').trim().slice(0, 180);
}

export function parseMessageSummary(value: unknown): TempmailMessageSummary | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = pickString(record, ['mail_id', 'mailId', '_id', 'id', 'message_id', 'messageId']);
  if (!id) return null;
  const from = pickString(record, ['mail_from', 'mailFrom', 'from', 'sender', 'from_email']);
  const subject = pickString(record, ['mail_subject', 'mailSubject', 'subject', 'title']) || '(no subject)';
  const receivedRaw = pickString(record, [
    'mail_timestamp',
    'mailTimestamp',
    'mail_date',
    'mailDate',
    'created_at',
    'createdAt',
    'date',
    'timestamp',
    'receivedAt',
  ]);
  const text = pickString(record, ['mail_text_only', 'mail_text', 'mailText', 'text', 'body_text', 'bodyText', 'preview']);
  const html = pickString(record, ['mail_html', 'mailHtml', 'html', 'body_html', 'bodyHtml']);
  return {
    id,
    from: from || 'Unknown sender',
    subject,
    receivedAt: normalizeReceivedAt(receivedRaw),
    preview: previewFrom(text, html),
  };
}

export function parseMessageList(payload: unknown): TempmailMessageSummary[] {
  if (isEmptyMailbox(payload)) return [];
  const list = unwrapList(payload);
  if (!list) {
    const single = parseMessageSummary(payload);
    if (single) return [single];
    throw new Error('Provider returned an unrecognized inbox payload.');
  }
  return list.map(parseMessageSummary).filter((row): row is TempmailMessageSummary => Boolean(row));
}

export function parseAttachment(value: unknown): TempmailAttachment | null {
  if (typeof value === 'string') {
    const id = value.trim();
    return id ? { id, name: id, size: null, contentType: null } : null;
  }
  const record = asRecord(value);
  if (!record) return null;
  const id = pickString(record, ['id', 'attachment_id', 'attachmentId', '_id', 'file_id', 'fileId']);
  if (!id) return null;
  const name = pickString(record, ['name', 'filename', 'file_name', 'fileName', 'original_name']) || id;
  const sizeRaw = record.size ?? record.byte_size ?? record.bytes ?? record.length;
  const size =
    typeof sizeRaw === 'number' && Number.isFinite(sizeRaw)
      ? sizeRaw
      : typeof sizeRaw === 'string' && /^\d+$/.test(sizeRaw)
        ? Number(sizeRaw)
        : null;
  const contentType = pickString(record, ['contentType', 'content_type', 'mime', 'mime_type', 'type']) || null;
  return { id, name, size, contentType };
}

export function parseAttachments(payload: unknown): TempmailAttachment[] {
  if (payload == null) return [];
  if (typeof payload === 'string') {
    const lower = payload.toLowerCase();
    if (/no attachment|empty|not found|there are no/.test(lower)) return [];
  }
  const list = unwrapList(payload);
  if (!list) {
    const record = asRecord(payload);
    if (record) {
      for (const key of ['attachments', 'files', 'mail_attachments']) {
        const inner = record[key];
        if (Array.isArray(inner)) {
          return inner.map(parseAttachment).filter((row): row is TempmailAttachment => Boolean(row));
        }
      }
      const single = parseAttachment(payload);
      return single ? [single] : [];
    }
    return [];
  }
  return list.map(parseAttachment).filter((row): row is TempmailAttachment => Boolean(row));
}

function attachmentsFromMessage(source: Record<string, unknown> | null): TempmailAttachment[] {
  if (!source) return [];
  for (const key of ['mail_attachments', 'attachments', 'files']) {
    const value = source[key];
    if (Array.isArray(value)) {
      return value.map(parseAttachment).filter((row): row is TempmailAttachment => Boolean(row));
    }
  }
  return [];
}

export function parseMessageDetail(payload: unknown, fallbackId = ''): TempmailMessageDetail {
  const record = asRecord(payload);
  const nested = record ? unwrapList(record)?.[0] : null;
  const summary = parseMessageSummary(nested ?? payload);
  if (!summary && !fallbackId) {
    throw new Error('Provider returned an unrecognized message payload.');
  }
  const source = asRecord(nested) ?? record;
  const text = pickString(source, ['mail_text_only', 'mail_text', 'mailText', 'text', 'body_text', 'bodyText']);
  const html = pickString(source, ['mail_html', 'mailHtml', 'html', 'body_html', 'bodyHtml']);
  return {
    id: summary?.id || fallbackId,
    from: summary?.from || pickString(source, ['mail_from', 'from']) || 'Unknown sender',
    subject: summary?.subject || '(no subject)',
    receivedAt: summary?.receivedAt ?? null,
    preview: summary?.preview || previewFrom(text, html),
    to: pickString(source, ['mail_to', 'mailTo', 'to', 'recipient']),
    text,
    html,
    attachments: attachmentsFromMessage(source),
  };
}

export function parseSourceMessage(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  const record = asRecord(payload);
  if (!record) return payload == null ? '' : JSON.stringify(payload);
  return (
    pickString(record, ['data', 'source', 'raw', 'mail_source', 'body', 'message', 'result']) ||
    JSON.stringify(payload)
  );
}

export function parseAttachmentFile(
  payload: unknown,
  fallbackId: string,
): { filename: string; contentType: string; size: number; base64: string } {
  const record = asRecord(payload);
  const nested = record ? asRecord(record.data) ?? asRecord(record.file) ?? record : null;
  const base64 =
    pickString(nested, ['body', 'content', 'data', 'file', 'base64', 'attachment']) ||
    (typeof payload === 'string' && !payload.trim().startsWith('{') ? payload.trim() : '');
  if (!base64) {
    throw new Error('Provider returned an unrecognized attachment payload.');
  }
  const filename = pickString(nested, ['name', 'filename', 'file_name', 'fileName']) || fallbackId;
  const contentType = pickString(nested, ['contentType', 'content_type', 'mime', 'mime_type', 'type']) || 'application/octet-stream';
  const sizeRaw = nested?.size ?? nested?.byte_size ?? nested?.bytes;
  const size =
    typeof sizeRaw === 'number' && Number.isFinite(sizeRaw)
      ? sizeRaw
      : Math.ceil((base64.replace(/\s+/g, '').length * 3) / 4);
  return { filename, contentType, size, base64: base64.replace(/\s+/g, '') };
}

export function parseDeleteResult(payload: unknown): boolean {
  if (payload == null) return true;
  if (typeof payload === 'boolean') return payload;
  if (typeof payload === 'string') {
    const lower = payload.toLowerCase();
    if (/error|fail/.test(lower) && !/ok|success|deleted/.test(lower)) return false;
    return true;
  }
  const record = asRecord(payload);
  if (!record) return true;
  const msg = pickString(record, ['error', 'message', 'status', 'result']).toLowerCase();
  if (/error|fail/.test(msg) && !/ok|success|deleted/.test(msg)) return false;
  return true;
}
