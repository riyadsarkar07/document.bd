import { NextResponse } from 'next/server';
import { json } from '@/lib/publish/server-auth';
import {
  authorizeInboxAccess,
  authorizeTempmail,
  errorJson,
  issueInbox,
  providerErrorResponse,
  readJsonBody,
  requireEmail,
  requireInboxToken,
} from '@/lib/tempmail/auth';
import { getTempmailConfig } from '@/lib/tempmail/config';
import { hashInboxEmail, recordTempmailOp } from '@/lib/tempmail/ops';
import { loadSavedInbox, saveInboxAssociation } from '@/lib/tempmail/persist';
import { requireTempmailClient } from '@/lib/tempmail/provider';

export const runtime = 'nodejs';

const creatingUsers = new Set<string>();

export async function GET(req: Request): Promise<NextResponse> {
  const auth = await authorizeTempmail(req);
  if (!auth.ok) return auth.response;

  const saved = await loadSavedInbox(auth.caller);
  if (!saved.ok) {
    recordTempmailOp({
      kind: 'inbox.restore',
      ok: false,
      actorId: auth.caller.userId,
    });
    return errorJson({
      ok: false,
      error: saved.error,
      code: 'provider_error',
      status: 500,
    });
  }
  if (!saved.inbox) {
    recordTempmailOp({
      kind: 'inbox.restore',
      ok: true,
      actorId: auth.caller.userId,
    });
    return json({ ok: true, inbox: null });
  }

  const inbox = issueInbox(auth.caller, saved.inbox.email, saved.inbox.domain);
  recordTempmailOp({
    kind: 'inbox.restore',
    ok: true,
    actorId: auth.caller.userId,
    inboxHash: hashInboxEmail(saved.inbox.email),
  });
  return json({ ok: true, inbox });
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
    await saveInboxAssociation(auth.caller, created.email, created.domain);
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

export async function PUT(req: Request): Promise<NextResponse> {
  const auth = await authorizeTempmail(req);
  if (!auth.ok) return auth.response;

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const parsed = readJsonBody(body);
  const email = requireEmail(parsed?.email);
  const inboxToken = requireInboxToken(parsed?.inboxToken);
  if (!email || !inboxToken) {
    return errorJson({
      ok: false,
      error: 'email and inboxToken are required.',
      code: 'validation',
      status: 400,
    });
  }

  const access = authorizeInboxAccess(auth.caller, inboxToken, email, true);
  if (!access.ok) return access.response;

  const existing = await loadSavedInbox(auth.caller);
  if (existing.ok && existing.inbox && existing.inbox.email !== access.email) {
    return errorJson({
      ok: false,
      error: 'This account already has a saved inbox.',
      code: 'forbidden',
      status: 403,
    });
  }

  const domain = access.email.split('@')[1] ?? '';
  const saved = await saveInboxAssociation(auth.caller, access.email, domain);
  if (!saved) {
    recordTempmailOp({
      kind: 'inbox.persist',
      ok: false,
      actorId: auth.caller.userId,
      inboxHash: hashInboxEmail(access.email),
    });
    return errorJson({
      ok: false,
      error: 'Could not save the inbox association for this account.',
      code: 'provider_error',
      status: 500,
    });
  }

  const inbox = issueInbox(auth.caller, access.email, domain);
  recordTempmailOp({
    kind: 'inbox.persist',
    ok: true,
    actorId: auth.caller.userId,
    inboxHash: hashInboxEmail(access.email),
  });
  return json({ ok: true, inbox });
}
