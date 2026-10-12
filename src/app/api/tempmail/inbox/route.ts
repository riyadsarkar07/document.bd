import { NextResponse } from 'next/server';
import { json } from '@/lib/publish/server-auth';
import {
  authorizeTempmail,
  errorJson,
  issueInbox,
  providerErrorResponse,
} from '@/lib/tempmail/auth';
import { getTempmailConfig } from '@/lib/tempmail/config';
import { hashInboxEmail, recordTempmailOp } from '@/lib/tempmail/ops';
import { requireTempmailClient } from '@/lib/tempmail/provider';

export const runtime = 'nodejs';

const creatingUsers = new Set<string>();

export async function GET() {
  return json({ ok: false, error: 'Method not allowed.', code: 'validation' }, 405, { Allow: 'POST' });
}

export async function POST(req: Request): Promise<NextResponse> {
  const auth = await authorizeTempmail(req);
  if (!auth.ok) return auth.response;

  const config = getTempmailConfig();
  if (!config.configured) {
    return errorJson({
      ok: false,
      error: config.error,
      code: 'not_configured',
      status: 503,
    });
  }

  if (creatingUsers.has(auth.caller.userId)) {
    return errorJson({
      ok: false,
      error: 'Address generation is already in progress.',
      code: 'rate_limited',
      status: 429,
    });
  }

  creatingUsers.add(auth.caller.userId);
  try {
    const client = requireTempmailClient();
    const created = await client.createInbox();
    const inbox = issueInbox(auth.caller, created.email, created.domain);
    recordTempmailOp({
      kind: 'inbox.create',
      ok: true,
      actorId: auth.caller.userId,
      inboxHash: hashInboxEmail(created.email),
    });
    await auth.caller.sb.from('activity_logs').insert({
      user_id: auth.caller.userId,
      email: auth.caller.email,
      action: 'tempmail.inbox.create',
      detail: `domain:${created.domain}`,
    });
    return json({ ok: true, inbox });
  } catch (err) {
    recordTempmailOp({
      kind: 'inbox.create',
      ok: false,
      actorId: auth.caller.userId,
    });
    return providerErrorResponse(err);
  } finally {
    creatingUsers.delete(auth.caller.userId);
  }
}
