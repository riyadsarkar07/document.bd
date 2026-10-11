import { NextResponse } from 'next/server';
import { json } from '@/lib/publish/server-auth';
import { authorizeTempmailAdmin, errorJson, readJsonBody } from '@/lib/tempmail/auth';
import { getTempmailSettings, recordTempmailOp, updateTempmailSettings } from '@/lib/tempmail/ops';

export const runtime = 'nodejs';

export async function GET(req: Request): Promise<NextResponse> {
  const auth = await authorizeTempmailAdmin(req);
  if (!auth.ok) return auth.response;
  return json({ ok: true, settings: getTempmailSettings() });
}

export async function PATCH(req: Request): Promise<NextResponse> {
  const auth = await authorizeTempmailAdmin(req);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown> | null = null;
  try {
    body = readJsonBody(await req.json());
  } catch {
    body = null;
  }
  if (!body) {
    return errorJson({ ok: false, error: 'Invalid settings payload.', code: 'validation', status: 400 });
  }

  const settings = updateTempmailSettings({
    autoRefreshSec: typeof body.autoRefreshSec === 'number' ? body.autoRefreshSec : undefined,
    attachmentsEnabled: typeof body.attachmentsEnabled === 'boolean' ? body.attachmentsEnabled : undefined,
    sourceEnabled: typeof body.sourceEnabled === 'boolean' ? body.sourceEnabled : undefined,
    defaultInboxHours: typeof body.defaultInboxHours === 'number' ? body.defaultInboxHours : undefined,
  });
  recordTempmailOp({ kind: 'settings.update', ok: true, actorId: auth.caller.userId });
  return json({ ok: true, settings });
}
