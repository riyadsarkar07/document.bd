import { NextResponse } from 'next/server';
import { json } from '@/lib/publish/server-auth';
import {
  authorizeInboxAccess,
  authorizeTempmail,
  errorJson,
  providerErrorResponse,
  requireEmail,
  requireInboxToken,
} from '@/lib/tempmail/auth';
import { hashInboxEmail, recordTempmailOp } from '@/lib/tempmail/ops';
import { requireTempmailClient } from '@/lib/tempmail/provider';

export const runtime = 'nodejs';

function credentialsFrom(req: Request): { email: string | null; inboxToken: string | null } {
  const url = new URL(req.url);
  return {
    email: requireEmail(url.searchParams.get('email')),
    inboxToken: requireInboxToken(url.searchParams.get('inboxToken')),
  };
}

export async function GET(req: Request): Promise<NextResponse> {
  const auth = await authorizeTempmail(req);
  if (!auth.ok) return auth.response;

  const { email, inboxToken } = credentialsFrom(req);
  if (!email || !inboxToken) {
    return errorJson({
      ok: false,
      error: 'email and inboxToken are required.',
      code: 'validation',
      status: 400,
    });
  }

  const access = authorizeInboxAccess(auth.caller, inboxToken, email);
  if (!access.ok) return access.response;

  try {
    const client = requireTempmailClient();
    const messages = await client.listMessages(access.email);
    recordTempmailOp({
      kind: 'inbox.list',
      ok: true,
      actorId: auth.caller.userId,
      inboxHash: hashInboxEmail(access.email),
    });
    return json({ ok: true, email: access.email, messages });
  } catch (err) {
    recordTempmailOp({
      kind: 'inbox.list',
      ok: false,
      actorId: auth.caller.userId,
      inboxHash: hashInboxEmail(email),
    });
    return providerErrorResponse(err);
  }
}

export async function POST() {
  return json({ ok: false, error: 'Method not allowed.', code: 'validation' }, 405, { Allow: 'GET' });
}
