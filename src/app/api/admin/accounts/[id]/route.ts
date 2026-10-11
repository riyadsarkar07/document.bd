import { NextResponse } from 'next/server';
import { json } from '@/lib/publish/server-auth';
import { TOOL_SCOPES } from '@/lib/workspace/access';
import { evaluateAccountMutation, toolsWithTempmail, toolsWithoutTempmail } from '@/lib/auth/roles';
import { authorizeTempmailAdmin, errorJson, readJsonBody } from '@/lib/tempmail/auth';
import { recordTempmailOp } from '@/lib/tempmail/ops';

export const runtime = 'nodejs';

interface RouteContext {
  params: { id: string };
}

export async function PATCH(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const auth = await authorizeTempmailAdmin(req);
  if (!auth.ok) return auth.response;

  const targetId = ctx.params.id?.trim();
  if (!targetId) {
    return errorJson({ ok: false, error: 'Account id is required.', code: 'validation', status: 400 });
  }

  let body: Record<string, unknown> | null = null;
  try {
    body = readJsonBody(await req.json());
  } catch {
    body = null;
  }
  if (!body) {
    return errorJson({ ok: false, error: 'Invalid payload.', code: 'validation', status: 400 });
  }

  const { data: target, error: loadError } = await auth.caller.sb
    .from('profiles')
    .select('id, email, role, status, allowed_tools')
    .eq('id', targetId)
    .maybeSingle();

  if (loadError || !target) {
    return errorJson({
      ok: false,
      error: 'Account was not found.',
      code: 'not_found',
      status: 404,
    });
  }

  const { count } = await auth.caller.sb
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('status', 'active');

  const mutation = evaluateAccountMutation({
    actorId: auth.caller.userId,
    actorRole: auth.caller.role,
    targetId: target.id,
    targetRole: String(target.role ?? ''),
    targetStatus: String(target.status ?? ''),
    nextRole: typeof body.role === 'string' ? body.role : undefined,
    nextStatus: typeof body.status === 'string' ? body.status : undefined,
    activeAdminCount: count ?? 0,
  });
  if (!mutation.ok) {
    return errorJson({
      ok: false,
      error: mutation.error,
      code: mutation.status === 409 ? 'validation' : 'forbidden',
      status: mutation.status,
    });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.role === 'string') patch.role = body.role;
  if (typeof body.status === 'string') patch.status = body.status;
  if (typeof body.tempmailAccess === 'boolean') {
    const current = Array.isArray(target.allowed_tools) ? (target.allowed_tools as string[]) : null;
    patch.allowed_tools = body.tempmailAccess
      ? toolsWithTempmail(current, TOOL_SCOPES)
      : toolsWithoutTempmail(current, TOOL_SCOPES);
  }

  if (Object.keys(patch).length === 0) {
    return errorJson({ ok: false, error: 'No account changes were provided.', code: 'validation', status: 400 });
  }

  const { error: updateError } = await auth.caller.sb.from('profiles').update(patch).eq('id', targetId);
  if (updateError) {
    return errorJson({
      ok: false,
      error: updateError.message,
      code: 'forbidden',
      status: 403,
    });
  }

  recordTempmailOp({
    kind: 'access.update',
    ok: true,
    actorId: auth.caller.userId,
  });

  return json({
    ok: true,
    id: targetId,
    updated: Object.keys(patch),
  });
}
