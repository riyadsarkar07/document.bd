'use client';

import { supabase } from '@/lib/supabase/client';
import type { PublishStatus } from '@/lib/workspace/vault';

export type PublishAction = 'publish' | 'unpublish';

export interface PublishRequest {
  regNo: string;
  name?: string;
  applicationDate?: string;
  authority?: string;
  /** Full `data:image/jpeg;base64,...` data URL (publish action only). */
  imageDataUrl?: string;
  action?: PublishAction;
}

export interface PublishResult {
  ok: boolean;
  status?: PublishStatus;
  sha?: string;
  verifyUrl?: string | null;
  error?: string;
}

/**
 * Call the server-side publish pipeline. The Supabase access token is sent
 * as a bearer token and verified server-side — no GitHub credential ever
 * reaches this client code.
 */
export async function apiPublish(request: PublishRequest): Promise<PublishResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    return { ok: false, error: 'You must be signed in to publish.' };
  }

  let res: Response;
  try {
    res = await fetch('/api/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(request),
    });
  } catch {
    return { ok: false, error: 'Network error — the publish service could not be reached.' };
  }

  let body: Record<string, unknown>;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: `Publish service returned HTTP ${res.status}.` };
  }

  if (!res.ok) {
    return { ok: false, error: typeof body.error === 'string' ? body.error : `Publish failed (HTTP ${res.status}).` };
  }

  return {
    ok: true,
    status: (body.status as PublishStatus) ?? 'pending',
    sha: typeof body.sha === 'string' ? body.sha : undefined,
    verifyUrl: body.verifyUrl === null ? null : typeof body.verifyUrl === 'string' ? body.verifyUrl : undefined,
  };
}

export interface PreflightCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface PreflightResult {
  ok: boolean;
  checks?: PreflightCheck[];
  caller?: { email?: string; role?: string };
  target?: { owner?: string; repo?: string; branch?: string; verifyBaseUrl?: string };
  error?: string;
}

/**
 * Run the non-destructive publish preflight check. Confirms the GitHub
 * repo/branch/token, Supabase schema, and public verification URL are all
 * ready before the first real publish. No commits, no writes.
 */
export async function apiPreflight(): Promise<PreflightResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    return { ok: false, error: 'You must be signed in to run the preflight check.' };
  }

  let res: Response;
  try {
    res = await fetch('/api/publish/preflight', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    return { ok: false, error: 'Network error — the preflight service could not be reached.' };
  }

  let body: Record<string, unknown>;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: `Preflight service returned HTTP ${res.status}.` };
  }

  if (!res.ok) {
    return {
      ok: false,
      error: typeof body.error === 'string' ? body.error : `Preflight failed (HTTP ${res.status}).`,
      checks: Array.isArray(body.checks) ? (body.checks as PreflightCheck[]) : undefined,
    };
  }

  return {
    ok: body.ok === true,
    checks: Array.isArray(body.checks) ? (body.checks as PreflightCheck[]) : undefined,
    caller: typeof body.caller === 'object' && body.caller ? (body.caller as PreflightResult['caller']) : undefined,
    target: typeof body.target === 'object' && body.target ? (body.target as PreflightResult['target']) : undefined,
  };
}
