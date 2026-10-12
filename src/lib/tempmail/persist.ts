import type { TempmailCaller } from '@/lib/tempmail/auth';
import { isValidTempmailAddress, normalizeDomain } from '@/lib/tempmail/hash';

export interface SavedTempmailInbox {
  email: string;
  domain: string;
}

function parseSavedInbox(row: { email?: unknown; domain?: unknown } | null): SavedTempmailInbox | null {
  if (!row) return null;
  if (typeof row.email !== 'string' || typeof row.domain !== 'string') return null;
  const email = row.email.trim().toLowerCase();
  const domain = normalizeDomain(row.domain);
  if (!isValidTempmailAddress(email) || !domain) return null;
  if (!email.endsWith(`@${domain}`)) return null;
  return { email, domain };
}

export async function loadSavedInbox(
  caller: TempmailCaller,
): Promise<{ ok: true; inbox: SavedTempmailInbox | null } | { ok: false; error: string }> {
  const { data, error } = await caller.sb
    .from('tempmail_inboxes')
    .select('email, domain')
    .eq('user_id', caller.userId)
    .maybeSingle();
  if (error) {
    return { ok: false, error: 'Could not restore the saved inbox for this account.' };
  }
  return { ok: true, inbox: parseSavedInbox(data) };
}

export async function saveInboxAssociation(
  caller: TempmailCaller,
  email: string,
  domain: string,
): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedDomain = normalizeDomain(domain);
  const now = new Date().toISOString();
  const { error } = await caller.sb.from('tempmail_inboxes').upsert(
    {
      user_id: caller.userId,
      email: normalizedEmail,
      domain: normalizedDomain,
      updated_at: now,
    },
    { onConflict: 'user_id' },
  );
  return !error;
}
