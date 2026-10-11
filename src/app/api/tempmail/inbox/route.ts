import { NextResponse } from 'next/server';
import { json } from '@/lib/publish/server-auth';
import {
  authorizeTempmail,
  errorJson,
  issueInbox,
  providerErrorResponse,
} from '@/lib/tempmail/auth';
import { getTempmailConfig } from '@/lib/tempmail/config';
import { requireTempmailClient } from '@/lib/tempmail/provider';

export const runtime = 'nodejs';

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

  try {
    const client = requireTempmailClient();
    const created = await client.createInbox();
    const inbox = issueInbox(auth.caller, created.email, created.domain);
    return json({ ok: true, inbox });
  } catch (err) {
    return providerErrorResponse(err);
  }
}
