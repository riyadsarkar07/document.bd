import { createHmac, timingSafeEqual } from 'node:crypto';
import { INBOX_TOKEN_TTL_MS } from '@/lib/tempmail/config';

export interface InboxTokenPayload {
  userId: string;
  email: string;
  issuedAt: number;
}

function b64url(input: string | Buffer): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  return buf.toString('base64url');
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function signInboxToken(payload: InboxTokenPayload, secret: string): string {
  const body = b64url(JSON.stringify({ u: payload.userId, e: payload.email, i: payload.issuedAt }));
  return `${body}.${sign(body, secret)}`;
}

export function verifyInboxToken(
  token: string,
  secret: string,
  expectedUserId: string,
  now = Date.now(),
): { ok: true; payload: InboxTokenPayload } | { ok: false; error: string } {
  const trimmed = token.trim();
  const dot = trimmed.lastIndexOf('.');
  if (dot <= 0) return { ok: false, error: 'Invalid inbox token.' };
  const body = trimmed.slice(0, dot);
  const sig = trimmed.slice(dot + 1);
  if (!body || !sig || !safeEqual(sign(body, secret), sig)) {
    return { ok: false, error: 'Invalid inbox token.' };
  }
  let parsed: { u?: unknown; e?: unknown; i?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      u?: unknown;
      e?: unknown;
      i?: unknown;
    };
  } catch {
    return { ok: false, error: 'Invalid inbox token.' };
  }
  if (typeof parsed.u !== 'string' || typeof parsed.e !== 'string' || typeof parsed.i !== 'number') {
    return { ok: false, error: 'Invalid inbox token.' };
  }
  if (parsed.u !== expectedUserId) {
    return { ok: false, error: 'This inbox belongs to another account.' };
  }
  if (now - parsed.i > INBOX_TOKEN_TTL_MS) {
    return { ok: false, error: 'Inbox session expired. Generate a new address.' };
  }
  return { ok: true, payload: { userId: parsed.u, email: parsed.e, issuedAt: parsed.i } };
}

export function tokenExpiresAt(issuedAt: number): string {
  return new Date(issuedAt + INBOX_TOKEN_TTL_MS).toISOString();
}
