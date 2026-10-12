'use client';

import { ensureFreshAccessToken } from '@/lib/supabase/client';
import type {
  TempmailAttachment,
  TempmailAttachmentFileResult,
  TempmailAttachmentsResult,
  TempmailCreateResult,
  TempmailRestoreResult,
  TempmailDeleteResult,
  TempmailErrorCode,
  TempmailInbox,
  TempmailListResult,
  TempmailMessageDetail,
  TempmailMessageSummary,
  TempmailReadResult,
  TempmailSourceResult,
} from '@/lib/tempmail/types';

export type { TempmailAttachment, TempmailInbox, TempmailMessageDetail, TempmailMessageSummary };

export interface TempmailClientError {
  ok: false;
  error: string;
  code: TempmailErrorCode;
  retryAfterSec?: number;
  status: number;
}

async function authedFetch(path: string, init: RequestInit): Promise<Response | TempmailClientError> {
  const token = await ensureFreshAccessToken();
  if (!token) {
    return { ok: false, error: 'You must be signed in to use temporary email.', code: 'unauthorized', status: 401 };
  }
  try {
    return await fetch(path, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });
  } catch {
    return {
      ok: false,
      error: 'Network error — the temporary email service could not be reached.',
      code: 'provider_error',
      status: 0,
    };
  }
}

async function parseResult<T extends { ok: true }>(
  res: Response | TempmailClientError,
): Promise<T | TempmailClientError> {
  if ('ok' in res && res.ok === false && 'error' in res) return res;
  const response = res as Response;
  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      error: `Temporary email service returned HTTP ${response.status}.`,
      code: 'invalid_response',
      status: response.status,
    };
  }
  if (!response.ok || body.ok === false) {
    return {
      ok: false,
      error: typeof body.error === 'string' ? body.error : `Temporary email request failed (HTTP ${response.status}).`,
      code: (typeof body.code === 'string' ? body.code : 'provider_error') as TempmailErrorCode,
      retryAfterSec: typeof body.retryAfterSec === 'number' ? body.retryAfterSec : undefined,
      status: response.status,
    };
  }
  return body as T;
}

export async function apiCreateInbox(): Promise<TempmailCreateResult | TempmailClientError> {
  const res = await authedFetch('/api/tempmail/inbox', { method: 'POST' });
  return parseResult<TempmailCreateResult>(res);
}

export async function apiRestoreInbox(): Promise<TempmailRestoreResult | TempmailClientError> {
  const res = await authedFetch('/api/tempmail/inbox', { method: 'GET' });
  return parseResult<TempmailRestoreResult>(res);
}

export async function apiPersistInbox(
  email: string,
  inboxToken: string,
): Promise<TempmailCreateResult | TempmailClientError> {
  const res = await authedFetch('/api/tempmail/inbox', {
    method: 'PUT',
    body: JSON.stringify({ email, inboxToken }),
  });
  return parseResult<TempmailCreateResult>(res);
}

export async function apiListMessages(
  email: string,
  inboxToken: string,
): Promise<TempmailListResult | TempmailClientError> {
  const params = new URLSearchParams({ email, inboxToken });
  const res = await authedFetch(`/api/tempmail/messages?${params.toString()}`, { method: 'GET' });
  return parseResult<TempmailListResult>(res);
}

export async function apiReadMessage(
  email: string,
  inboxToken: string,
  id: string,
): Promise<TempmailReadResult | TempmailClientError> {
  const params = new URLSearchParams({ email, inboxToken, id });
  const res = await authedFetch(`/api/tempmail/messages/${encodeURIComponent(id)}?${params.toString()}`, {
    method: 'GET',
  });
  return parseResult<TempmailReadResult>(res);
}

export async function apiDeleteMessage(
  email: string,
  inboxToken: string,
  id: string,
): Promise<TempmailDeleteResult | TempmailClientError> {
  const res = await authedFetch(`/api/tempmail/messages/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    body: JSON.stringify({ email, inboxToken, id }),
  });
  return parseResult<TempmailDeleteResult>(res);
}

export async function apiSourceMessage(
  email: string,
  inboxToken: string,
  id: string,
): Promise<TempmailSourceResult | TempmailClientError> {
  const params = new URLSearchParams({ email, inboxToken, id });
  const res = await authedFetch(
    `/api/tempmail/messages/${encodeURIComponent(id)}/source?${params.toString()}`,
    { method: 'GET' },
  );
  return parseResult<TempmailSourceResult>(res);
}

export async function apiListAttachments(
  email: string,
  inboxToken: string,
  id: string,
): Promise<TempmailAttachmentsResult | TempmailClientError> {
  const params = new URLSearchParams({ email, inboxToken, id });
  const res = await authedFetch(
    `/api/tempmail/messages/${encodeURIComponent(id)}/attachments?${params.toString()}`,
    { method: 'GET' },
  );
  return parseResult<TempmailAttachmentsResult>(res);
}

export async function apiGetAttachment(
  email: string,
  inboxToken: string,
  id: string,
  attachmentId: string,
): Promise<TempmailAttachmentFileResult | TempmailClientError> {
  const params = new URLSearchParams({ email, inboxToken, id, attachmentId });
  const res = await authedFetch(
    `/api/tempmail/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}?${params.toString()}`,
    { method: 'GET' },
  );
  return parseResult<TempmailAttachmentFileResult>(res);
}
