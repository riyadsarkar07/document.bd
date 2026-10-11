import { json } from '@/lib/publish/server-auth';
import { createClient } from '@supabase/supabase-js';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { hasToolAccess } from '@/lib/workspace/access';
import { NextResponse } from 'next/server';
import { getTempmailConfig } from '@/lib/tempmail/config';
import { isValidMailId, isValidTempmailAddress } from '@/lib/tempmail/hash';
import { signInboxToken, tokenExpiresAt, verifyInboxToken } from '@/lib/tempmail/token';
import { TempmailProviderError } from '@/lib/tempmail/provider';
import type { TempmailErrorShape, TempmailInbox } from '@/lib/tempmail/types';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jlxccewipidsnjdzirtf.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_ozaVEDyu9IqtKRU1r_b3HA_PPlVPJyQ';

export interface TempmailCaller {
  userId: string;
  email: string;
  role: string;
}

function authed(token: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export function bearerToken(req: Request): string | null {
  const authz = req.headers.get('authorization') ?? '';
  if (!authz.startsWith('Bearer ')) return null;
  const token = authz.slice('Bearer '.length).trim();
  return token || null;
}

export function errorJson(shape: TempmailErrorShape, extraHeaders?: HeadersInit): NextResponse {
  const headers: Record<string, string> = {};
  if (shape.retryAfterSec) headers['Retry-After'] = String(shape.retryAfterSec);
  return json(
    { ok: false, error: shape.error, code: shape.code, retryAfterSec: shape.retryAfterSec },
    shape.status,
    extraHeaders ? { ...headers, ...(extraHeaders as Record<string, string>) } : headers,
  );
}

export function providerErrorResponse(err: unknown): NextResponse {
  if (err instanceof TempmailProviderError) return errorJson(err.toShape());
  const message = err instanceof Error ? err.message : 'Temporary email provider error.';
  return errorJson({
    ok: false,
    error: message,
    code: 'invalid_response',
    status: 502,
  });
}

export async function authorizeTempmail(
  req: Request,
): Promise<{ ok: true; caller: TempmailCaller } | { ok: false; response: NextResponse }> {
  const ip = clientIp(req);
  const ipLimit = rateLimit(`tempmail-ip:${ip}`, 40, 60_000);
  if (!ipLimit.ok) {
    return {
      ok: false,
      response: errorJson({
        ok: false,
        error: 'Too many temporary email requests.',
        code: 'rate_limited',
        status: 429,
        retryAfterSec: ipLimit.retryAfterSec,
      }),
    };
  }

  const token = bearerToken(req);
  if (!token) {
    return {
      ok: false,
      response: errorJson({
        ok: false,
        error: 'Missing authorization token.',
        code: 'unauthorized',
        status: 401,
      }),
    };
  }

  const sb = authed(token);
  const {
    data: { user },
    error,
  } = await sb.auth.getUser(token);
  if (error || !user) {
    return {
      ok: false,
      response: errorJson({
        ok: false,
        error: 'Invalid or expired session.',
        code: 'unauthorized',
        status: 401,
      }),
    };
  }

  const userLimit = rateLimit(`tempmail-user:${user.id}`, 30, 60_000);
  if (!userLimit.ok) {
    return {
      ok: false,
      response: errorJson({
        ok: false,
        error: 'Too many temporary email requests.',
        code: 'rate_limited',
        status: 429,
        retryAfterSec: userLimit.retryAfterSec,
      }),
    };
  }

  const { data: profile } = await sb
    .from('profiles')
    .select('email, role, status, allowed_tools')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.status === 'disabled') {
    return {
      ok: false,
      response: errorJson({
        ok: false,
        error: 'This account is suspended.',
        code: 'forbidden',
        status: 403,
      }),
    };
  }

  const allowed = hasToolAccess(
    {
      role: (profile?.role as string | undefined) ?? undefined,
      allowed_tools: Array.isArray(profile?.allowed_tools) ? (profile?.allowed_tools as string[]) : null,
    },
    'tempmail',
  );
  if (!allowed) {
    return {
      ok: false,
      response: errorJson({
        ok: false,
        error: 'You do not have access to CYBER TEMPMAIL.',
        code: 'forbidden',
        status: 403,
      }),
    };
  }

  return {
    ok: true,
    caller: {
      userId: user.id,
      email: (typeof profile?.email === 'string' && profile.email) || user.email || '',
      role: (profile?.role as string) || 'viewer',
    },
  };
}

export function issueInbox(caller: TempmailCaller, email: string, domain: string): TempmailInbox {
  const config = getTempmailConfig();
  const secret = config.configured ? config.inboxSecret : 'unconfigured';
  const issuedAt = Date.now();
  return {
    email,
    domain,
    inboxToken: signInboxToken({ userId: caller.userId, email, issuedAt }, secret),
    expiresAt: tokenExpiresAt(issuedAt),
  };
}

export function authorizeInboxAccess(
  caller: TempmailCaller,
  inboxToken: string,
  email?: string,
): { ok: true; email: string } | { ok: false; response: NextResponse } {
  const config = getTempmailConfig();
  const secret = config.configured ? config.inboxSecret : '';
  if (!secret) {
    return {
      ok: false,
      response: errorJson({
        ok: false,
        error: 'Temporary email is not configured.',
        code: 'not_configured',
        status: 503,
      }),
    };
  }
  const verified = verifyInboxToken(inboxToken, secret, caller.userId);
  if (!verified.ok) {
    return {
      ok: false,
      response: errorJson({
        ok: false,
        error: verified.error,
        code: verified.error.includes('another account') ? 'forbidden' : 'unauthorized',
        status: verified.error.includes('another account') ? 403 : 401,
      }),
    };
  }
  if (email && email.trim().toLowerCase() !== verified.payload.email) {
    return {
      ok: false,
      response: errorJson({
        ok: false,
        error: 'Inbox token does not match this address.',
        code: 'forbidden',
        status: 403,
      }),
    };
  }
  return { ok: true, email: verified.payload.email };
}

export function readJsonBody(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function requireEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return isValidTempmailAddress(email) ? email : null;
}

export function requireMailId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  return isValidMailId(id) ? id : null;
}

export function requireInboxToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  return token.length >= 16 && token.length <= 1024 ? token : null;
}
