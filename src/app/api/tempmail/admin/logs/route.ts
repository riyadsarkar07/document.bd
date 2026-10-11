import { NextResponse } from 'next/server';
import { json } from '@/lib/publish/server-auth';
import { authorizeTempmailAdmin } from '@/lib/tempmail/auth';
import { listTempmailOps } from '@/lib/tempmail/ops';

export const runtime = 'nodejs';

export async function GET(req: Request): Promise<NextResponse> {
  const auth = await authorizeTempmailAdmin(req);
  if (!auth.ok) return auth.response;
  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get('limit') ?? '50');
  const limit = Number.isFinite(limitRaw) ? limitRaw : 50;
  return json({
    ok: true,
    logs: listTempmailOps(limit),
    note: 'Operational events only. API keys, inbox tokens, addresses, and message contents are never stored.',
  });
}
