/**
 * Server-only helpers shared by the publish / unpublish / preflight routes.
 *
 * Every route authenticates the caller the same way: the Supabase access
 * token is sent as a bearer header, verified with `getUser`, then the
 * caller's `profiles` row is checked for admin/editor + active status.
 * RLS (per-user policies) keeps all table access scoped to the caller.
 *
 * IMPORTANT: This module reads Supabase credentials from the server
 * environment and must NEVER be imported from any client component.
 */
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { DEFAULT_VERIFY_BASE_URL } from '@/lib/verify-base';

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jlxccewipidsnjdzirtf.supabase.co';
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_ozaVEDyu9IqtKRU1r_b3HA_PPlVPJyQ';

export const PUBLIC_VERIFY_BASE_URL =
  process.env.PUBLIC_VERIFY_BASE_URL || DEFAULT_VERIFY_BASE_URL;

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export interface Caller {
  sb: ReturnType<typeof authedClient>;
  userId: string;
  email: string;
  role: string;
}

/** Supabase client that carries the caller's access token so RLS applies. */
export function authedClient(token: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function authorize(
  token: string | null,
): Promise<{ ok: true; caller: Caller } | { ok: false; status: number; error: string }> {
  if (!token) return { ok: false, status: 401, error: 'Missing authorization token.' };
  const sb = authedClient(token);
  const {
    data: { user },
    error,
  } = await sb.auth.getUser();
  if (error || !user) return { ok: false, status: 401, error: 'Invalid or expired session.' };

  const { data: profile } = await sb
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .maybeSingle();

  const role = profile?.role ?? null;
  if (!role || (role !== 'admin' && role !== 'editor')) {
    return { ok: false, status: 403, error: 'Only authorized admins/editors can publish.' };
  }
  if (profile?.status !== 'active') {
    return { ok: false, status: 403, error: 'This account is suspended.' };
  }

  return {
    ok: true,
    caller: { sb, userId: user.id, email: user.email ?? '', role },
  };
}
