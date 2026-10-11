import { NextResponse } from 'next/server';
import { json } from '@/lib/publish/server-auth';
import {
  authorizeInboxAccess,
  authorizeTempmail,
  errorJson,
  providerErrorResponse,
  requireAttachmentId,
  requireEmail,
  requireInboxToken,
  requireMailId,
} from '@/lib/tempmail/auth';
import { getTempmailSettings, hashInboxEmail, recordTempmailOp } from '@/lib/tempmail/ops';
import { assertMessageOwnership } from '@/lib/tempmail/ownership';
import { requireTempmailClient } from '@/lib/tempmail/provider';

export const runtime = 'nodejs';

interface RouteContext {
  params: { id: string; attachmentId: string };
}

export async function GET(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const auth = await authorizeTempmail(req);
  if (!auth.ok) return auth.response;

  if (!getTempmailSettings().attachmentsEnabled) {
    return errorJson({
      ok: false,
      error: 'Attachments are disabled by an administrator.',
      code: 'forbidden',
      status: 403,
    });
  }

  const url = new URL(req.url);
  const id = requireMailId(ctx.params.id) ?? requireMailId(url.searchParams.get('id'));
  const attachmentId =
    requireAttachmentId(ctx.params.attachmentId) ?? requireAttachmentId(url.searchParams.get('attachmentId'));
  const email = requireEmail(url.searchParams.get('email'));
  const inboxToken = requireInboxToken(url.searchParams.get('inboxToken'));
  if (!id || !attachmentId || !email || !inboxToken) {
    return errorJson({
      ok: false,
      error: 'id, attachmentId, email, and inboxToken are required.',
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
        kind: 'attachment.get',
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
    const file = await client.getAttachment(id, attachmentId);
    recordTempmailOp({
      kind: 'attachment.get',
      ok: true,
      actorId: auth.caller.userId,
      inboxHash: hashInboxEmail(access.email),
    });
    return json({
      ok: true,
      email: access.email,
      id,
      attachmentId,
      filename: file.filename,
      contentType: file.contentType,
      size: file.size,
      base64: file.base64,
    });
  } catch (err) {
    recordTempmailOp({
      kind: 'attachment.get',
      ok: false,
      actorId: auth.caller.userId,
      inboxHash: hashInboxEmail(access.email),
    });
    return providerErrorResponse(err);
  }
}
