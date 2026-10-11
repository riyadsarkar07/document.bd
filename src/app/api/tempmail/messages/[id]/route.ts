import { NextResponse } from 'next/server';
import { json } from '@/lib/publish/server-auth';
import {
  authorizeInboxAccess,
  authorizeTempmail,
  errorJson,
  providerErrorResponse,
  readJsonBody,
  requireEmail,
  requireInboxToken,
  requireMailId,
} from '@/lib/tempmail/auth';
import { hashInboxEmail, recordTempmailOp } from '@/lib/tempmail/ops';
import { assertMessageOwnership } from '@/lib/tempmail/ownership';
import { requireTempmailClient } from '@/lib/tempmail/provider';

export const runtime = 'nodejs';

interface RouteContext {
  params: { id: string };
}

export async function GET(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const auth = await authorizeTempmail(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const id = requireMailId(ctx.params.id) ?? requireMailId(url.searchParams.get('id'));
  const email = requireEmail(url.searchParams.get('email'));
  const inboxToken = requireInboxToken(url.searchParams.get('inboxToken'));
  if (!id || !email || !inboxToken) {
    return errorJson({
      ok: false,
      error: 'id, email, and inboxToken are required.',
      code: 'validation',
      status: 400,
    });
  }

  const access = authorizeInboxAccess(auth.caller, inboxToken, email);
  if (!access.ok) return access.response;

  try {
    const client = requireTempmailClient();
    const message = await client.readMessage(id);
    if (!assertMessageOwnership(message, access.email)) {
      recordTempmailOp({
        kind: 'message.read',
        ok: false,
        code: 'forbidden',
        status: 403,
        actorId: auth.caller.userId,
        inboxHash: hashInboxEmail(access.email),
      });
      return errorJson({
        ok: false,
        error: 'This message does not belong to your inbox.',
        code: 'forbidden',
        status: 403,
      });
    }
    recordTempmailOp({
      kind: 'message.read',
      ok: true,
      actorId: auth.caller.userId,
      inboxHash: hashInboxEmail(access.email),
    });
    return json({ ok: true, email: access.email, message });
  } catch (err) {
    recordTempmailOp({
      kind: 'message.read',
      ok: false,
      actorId: auth.caller.userId,
    });
    return providerErrorResponse(err);
  }
}

export async function DELETE(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const auth = await authorizeTempmail(req);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown> | null = null;
  try {
    body = readJsonBody(await req.json());
  } catch {
    body = null;
  }

  const url = new URL(req.url);
  const id = requireMailId(ctx.params.id) ?? requireMailId(body?.id) ?? requireMailId(url.searchParams.get('id'));
  const email = requireEmail(body?.email) ?? requireEmail(url.searchParams.get('email'));
  const inboxToken = requireInboxToken(body?.inboxToken) ?? requireInboxToken(url.searchParams.get('inboxToken'));
  if (!id || !email || !inboxToken) {
    return errorJson({
      ok: false,
      error: 'id, email, and inboxToken are required.',
      code: 'validation',
      status: 400,
    });
  }

  const access = authorizeInboxAccess(auth.caller, inboxToken, email);
  if (!access.ok) return access.response;

  try {
    const client = requireTempmailClient();
    const message = await client.readMessage(id);
    if (!assertMessageOwnership(message, access.email)) {
      recordTempmailOp({
        kind: 'message.delete',
        ok: false,
        code: 'forbidden',
        status: 403,
        actorId: auth.caller.userId,
        inboxHash: hashInboxEmail(access.email),
      });
      return errorJson({
        ok: false,
        error: 'This message does not belong to your inbox.',
        code: 'forbidden',
        status: 403,
      });
    }
    await client.deleteMessage(id);
    recordTempmailOp({
      kind: 'message.delete',
      ok: true,
      actorId: auth.caller.userId,
      inboxHash: hashInboxEmail(access.email),
    });
    return json({ ok: true, deleted: true });
  } catch (err) {
    recordTempmailOp({
      kind: 'message.delete',
      ok: false,
      actorId: auth.caller.userId,
    });
    return providerErrorResponse(err);
  }
}
