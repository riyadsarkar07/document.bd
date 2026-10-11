'use client';

import { ensureFreshAccessToken } from '@/lib/supabase/client';
import type { Role, UserStatus } from '@/lib/auth/types';
import type { TempmailErrorCode } from '@/lib/tempmail/types';

export interface AdminClientError {
  ok: false;
  error: string;
  code?: TempmailErrorCode | string;
  status: number;
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response | AdminClientError> {
  const token = await ensureFreshAccessToken();
  if (!token) {
    return { ok: false, error: 'You must be signed in.', status: 401 };
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
    return { ok: false, error: 'Network error.', status: 0 };
  }
}

async function parseResult<T extends { ok: true }>(res: Response | AdminClientError): Promise<T | AdminClientError> {
  if ('ok' in res && res.ok === false && 'error' in res) return res;
  const response = res as Response;
  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: `Request failed (HTTP ${response.status}).`, status: response.status };
  }
  if (!response.ok || body.ok === false) {
    return {
      ok: false,
      error: typeof body.error === 'string' ? body.error : `Request failed (HTTP ${response.status}).`,
      code: typeof body.code === 'string' ? body.code : undefined,
      status: response.status,
    };
  }
  return body as T;
}

export interface TempmailAdminStatus {
  ok: true;
  provider: {
    name: string;
    slug: string;
    host: string;
    configured: boolean;
    connected: boolean;
    error: string | null;
    code?: string;
    status?: number;
  };
  domains: string[];
  endpoints: Array<{
    id: string;
    method: string;
    path: string;
    label: string;
    implemented: boolean;
    probe: string;
    status: string;
  }>;
  counters: {
    inboxesCreated: number;
    messagesListed: number;
    messagesRead: number;
    messagesDeleted: number;
    attachmentsFetched: number;
    apiErrors: number;
    lastErrorAt: string | null;
    lastErrorCode: string | null;
  };
  countersNote: string;
  settings: {
    autoRefreshSec: number;
    attachmentsEnabled: boolean;
    sourceEnabled: boolean;
    defaultInboxHours: number;
  };
}

export interface TempmailAdminLog {
  id: string;
  at: string;
  kind: string;
  ok: boolean;
  code?: string;
  status?: number;
  actorId?: string;
  inboxHash?: string;
}

export interface AdminAccountRow {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  status: UserStatus;
  allowed_tools: string[] | null;
  created_at: string | null;
  tempmailAccess: boolean;
  inboxesCreated: number;
}

export async function apiTempmailAdminStatus(): Promise<TempmailAdminStatus | AdminClientError> {
  const res = await authedFetch('/api/tempmail/admin/status');
  return parseResult<TempmailAdminStatus>(res);
}

export async function apiTempmailAdminLogs(): Promise<{ ok: true; logs: TempmailAdminLog[]; note: string } | AdminClientError> {
  const res = await authedFetch('/api/tempmail/admin/logs?limit=50');
  return parseResult<{ ok: true; logs: TempmailAdminLog[]; note: string }>(res);
}

export async function apiTempmailAdminSettings(
  patch: Partial<TempmailAdminStatus['settings']>,
): Promise<{ ok: true; settings: TempmailAdminStatus['settings'] } | AdminClientError> {
  const res = await authedFetch('/api/tempmail/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return parseResult<{ ok: true; settings: TempmailAdminStatus['settings'] }>(res);
}

export async function apiAdminAccounts(view: 'admins' | 'users', search = '', page = 1) {
  const params = new URLSearchParams({ view, search, page: String(page), pageSize: '20' });
  const res = await authedFetch(`/api/admin/accounts?${params.toString()}`);
  return parseResult<{
    ok: true;
    view: 'admins' | 'users';
    accounts: AdminAccountRow[];
    total: number;
    page: number;
    pageSize: number;
    activeAdminCount: number;
  }>(res);
}

export async function apiPatchAccount(
  id: string,
  patch: { role?: Role; status?: UserStatus; tempmailAccess?: boolean },
) {
  const res = await authedFetch(`/api/admin/accounts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return parseResult<{ ok: true; id: string; updated: string[] }>(res);
}
