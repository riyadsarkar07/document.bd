import { NextResponse } from 'next/server';
import { json } from '@/lib/publish/server-auth';
import {
  authorizeInboxAccess,
  authorizeTempmail,
  errorJson,
  providerErrorResponse,
  requireEmail,
  requireInboxToken,
  requireMailId,
} from '@/lib/tempmail/auth';
import { getTempmailSettings, hashInboxEmail, recordTempmailOp } from '@/lib/tempmail/ops';
import { assertMessageOwnership } from '@/lib/tempmail/ownership';
import { requireTempmailClient } from '@/lib/tempmail/provider';

export const runtime = 'nodejs';

interface RouteContext {
  params: { id: string };
}

export async function GET(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const auth = await authorizeTempmail(req);
  if (!auth.ok) return auth.response;

  if (!getTempmailSettings().sourceEnabled) {
    return errorJson({
      ok: false,
      error: 'Raw message source is disabled by an administrator.',
      code: 'forbidden',
      status: 403,
    });
  }

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
        kind: 'message.source',
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
    const source = await client.sourceMessage(id);
    recordTempmailOp({
      kind: 'message.source',
      ok: true,
      actorId: auth.caller.userId,
      inboxHash: hashInboxEmail(access.email),
    });
    return json({ ok: true, email: access.email, id, source });
  } catch (err) {
    recordTempmailOp({
      kind: 'message.source',
      ok: false,
      code: err instanceof Error ? err.name : 'provider_error',
      actorId: auth.caller.userId,
      inboxHash: hashInboxEmail(access.email),
    });
    return providerErrorResponse(err);
  }
}
