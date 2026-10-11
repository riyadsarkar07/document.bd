import { NextResponse } from 'next/server';
import { json } from '@/lib/publish/server-auth';
import { authorizeTempmailAdmin, errorJson } from '@/lib/tempmail/auth';
import type { Role, UserStatus } from '@/lib/auth/types';

export const runtime = 'nodejs';

interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  status: UserStatus;
  allowed_tools: string[] | null;
  created_at: string | null;
  max_projects: number | null;
  max_documents: number | null;
  max_exports: number | null;
  gen_limit: number | null;
  gen_period: string | null;
  can_self_publish: boolean | null;
}

export async function GET(req: Request): Promise<NextResponse> {
  const auth = await authorizeTempmailAdmin(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const view = url.searchParams.get('view') === 'admins' ? 'admins' : 'users';
  const search = (url.searchParams.get('search') ?? '').trim();
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize') ?? '20') || 20));

  let query = auth.caller.sb
    .from('profiles')
    .select(
      'id, email, full_name, role, status, allowed_tools, created_at, max_projects, max_documents, max_exports, gen_limit, gen_period, can_self_publish',
      { count: 'exact' },
    )
    .order('created_at', { ascending: true });

  if (view === 'admins') query = query.eq('role', 'admin');
  else query = query.neq('role', 'admin');

  if (search) query = query.ilike('email', `%${search.replace(/[%_]/g, '')}%`);
  query = query.range((page - 1) * pageSize, page * pageSize - 1);

  const { data, error, count } = await query;
  if (error) {
    return errorJson({
      ok: false,
      error: error.message,
      code: 'provider_error',
      status: 502,
    });
  }

  const rows = ((data ?? []) as ProfileRow[]).map((row) => ({
    id: row.id,
    email: row.email || '—',
    full_name: row.full_name,
    role: row.role,
    status: row.status,
    allowed_tools: row.allowed_tools,
    created_at: row.created_at,
    max_projects: row.max_projects,
    max_documents: row.max_documents,
    max_exports: row.max_exports,
    gen_limit: row.gen_limit,
    gen_period: row.gen_period,
    can_self_publish: Boolean(row.can_self_publish),
    tempmailAccess: row.role === 'admin' || row.allowed_tools == null || row.allowed_tools.includes('tempmail'),
  }));

  const ids = rows.map((row) => row.id);
  const inboxUsage = new Map<string, number>();
  if (ids.length) {
    const { data: usageRows } = await auth.caller.sb
      .from('activity_logs')
      .select('user_id')
      .in('user_id', ids)
      .eq('action', 'tempmail.inbox.create');
    if (Array.isArray(usageRows)) {
      for (const row of usageRows) {
        const uid = typeof row.user_id === 'string' ? row.user_id : '';
        if (!uid) continue;
        inboxUsage.set(uid, (inboxUsage.get(uid) ?? 0) + 1);
      }
    }
  }
  const accounts = rows.map((row) => ({
    ...row,
    inboxesCreated: inboxUsage.get(row.id) ?? 0,
  }));

  const { count: adminCount } = await auth.caller.sb
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('status', 'active');

  return json({
    ok: true,
    view,
    accounts,
    total: count ?? accounts.length,
    page,
    pageSize,
    activeAdminCount: adminCount ?? 0,
  });
}
