'use client';

import { supabase } from '@/lib/supabase/client';
import { TM_DEFAULTS } from '@/lib/constants/tm';
import { formatTimestamp } from '@/lib/utils';
import type { TMSnapshot } from '@/lib/editor/types';

export interface VaultRecord extends TMSnapshot {
  timestamp: string;
  /** UUID of the authenticated user who created/exported the record. */
  createdBy?: string | null;
  /** Resolved display email for `createdBy` (null when unknown / not visible). */
  creatorEmail?: string | null;
}

/**
 * Cloud Vault — the original app stored certificate exports in the Supabase
 * `certificates` table. Column mapping is preserved exactly.
 */
export async function commitCertificate(
  entry: TMSnapshot,
  createdBy?: string | null,
): Promise<{ error: string | null }> {
  const fallbackNumericId = Math.floor(Date.now() / 1000);
  const trademarkNo = entry.trademarkNo || 'N/A';
  const payload: Record<string, unknown> = {
    trademark_no: trademarkNo,
    reg_date: entry.regDate || '',
    name: entry.companyName || '',
    owner_name: entry.ownerName || '',
    address: entry.address || '',
    company_type: entry.compType || '',
    app_date: entry.appDate || '',
    details: entry.goodsDesc || '',
    sealed_date: entry.sealedDate || '',
    synced_at: new Date().toISOString(),
  };
  if (entry.logoDataUrl) payload.logo_data_url = entry.logoDataUrl;

  // Existing trademark_no → UPDATE the existing certificate row so repeated
  // Saves never create duplicate rows. New trademark_no → INSERT a fresh one.
  // The `id` surrogate is not exposed by the production vault schema, so the
  // trademark_no is used as the natural key.
  const existing = await supabase
    .from('certificates')
    .select('registration_no, created_by')
    .eq('trademark_no', trademarkNo)
    .limit(1);

  const existingRow = existing.data?.[0];

  // Insert path carries the creator; update path preserves the original one
  // UNLESS the existing (legacy) row has no creator yet — then adopt the
  // current user so re-saving the default/legacy TM number records who saved it.
  if (createdBy) payload.created_by = createdBy;

  let result: { error: { message: string } | null };
  if (existingRow) {
    if (existingRow.registration_no) payload.registration_no = existingRow.registration_no;
    if (existingRow.created_by) delete payload.created_by;
    result = await supabase.from('certificates').update(payload).eq('trademark_no', trademarkNo);
  } else {
    payload.registration_no = fallbackNumericId;
    result = await supabase.from('certificates').insert([payload]);
  }

  // A unique-violation on trademark_no means another account (or a legacy
  // record) already owns this number. Under RLS the row is invisible to the
  // caller, so surface a clear message instead of the raw Postgres error.
  if (
    result.error &&
    /duplicate key value violates unique constraint/i.test(result.error.message ?? '') &&
    /trademark_no/i.test(result.error.message ?? '')
  ) {
    return { error: `TM No. ${trademarkNo} is already archived in the vault. Use a different Trademark No. to save your own record.` };
  }

  // Retry without any column the schema does not have yet (e.g. created_by or
  // logo_data_url before its migration is applied) so the vault write still
  // succeeds; the creator id / image persists once the migration is run.
  let attempts = 0;
  while (result.error && attempts < 3) {
    const msg = result.error.message ?? '';
    const drops: string[] = [];
    if (/created_by/i.test(msg)) drops.push('created_by');
    if (/logo_data_url/i.test(msg)) drops.push('logo_data_url');
    if (drops.length === 0) break;
    for (const key of drops) delete payload[key];
    result = existingRow
      ? await supabase.from('certificates').update(payload).eq('trademark_no', trademarkNo)
      : await supabase.from('certificates').insert([payload]);
    attempts += 1;
  }
  return { error: result.error ? result.error.message : null };
}

/**
 * Resolve each vault record's creator id to a display email.
 *
 * Admins can read any profile (RLS `profiles_admin_select`), so every creator
 * email is resolved from the `profiles` table. Non-admins can only read their
 * own profile — those records show their own session email and everything else
 * stays null (rendered as "—"), so emails are never leaked to other roles.
 */
export async function resolveCreatorEmails(
  records: VaultRecord[],
  opts: { currentUserId?: string | null; currentUserEmail?: string | null; role?: string | null },
): Promise<VaultRecord[]> {
  const ids = Array.from(new Set(records.map((r) => r.createdBy).filter((id): id is string => Boolean(id))));
  const map = new Map<string, string>();

  // Always know the current user's own email (from the session) so their own
  // records resolve even before/without a profiles row.
  if (opts.currentUserId && opts.currentUserEmail) map.set(opts.currentUserId, opts.currentUserEmail);

  // Admins can read any profile (RLS `profiles_admin_select`), so every other
  // creator email is resolved from the `profiles` table (authoritative).
  if (opts.role === 'admin' && ids.length) {
    const { data, error } = await supabase.from('profiles').select('id, email').in('id', ids);
    if (!error && data) {
      for (const p of data) {
        if (p.id && p.email) map.set(String(p.id), String(p.email));
      }
    }
  }

  return records.map((r) => ({
    ...r,
    creatorEmail: r.createdBy && map.get(r.createdBy) ? map.get(r.createdBy)! : null,
  }));
}

export async function loadVault(): Promise<{ records: VaultRecord[]; error: string | null }> {
  const { data, error } = await supabase
    .from('certificates')
    .select('*')
    .order('synced_at', { ascending: false });
  if (error) return { records: [], error: error.message };

  const records = (data || []).map((row) => ({
    trademarkNo: row.trademark_no || '',
    regDate: row.reg_date || '',
    appDate: row.app_date || '',
    companyName: row.name || '',
    ownerName: row.owner_name || '',
    address: row.address || '',
    compType: row.company_type || '',
    openingText: TM_DEFAULTS.openingText,
    middleTextArial: TM_DEFAULTS.middleTextArial,
    goodsDesc: row.details || '',
    sealedTextPhrase: TM_DEFAULTS.sealedTextPhrase,
    sealedDate: row.sealed_date || '',
    logoText: row.name || '',
    arialSize: TM_DEFAULTS.arialSize,
    corsivSize: TM_DEFAULTS.corsivSize,
    sealSize: TM_DEFAULTS.sealSize,
    blueDateSize: TM_DEFAULTS.blueDateSize,
    tmX: TM_DEFAULTS.tmX,
    tmY: TM_DEFAULTS.tmY,
    dateX: TM_DEFAULTS.dateX,
    dateY: TM_DEFAULTS.dateY,
    paraY: TM_DEFAULTS.paraY,
    logoY: TM_DEFAULTS.logoY,
    logoSize: TM_DEFAULTS.logoSize,
    sealX: TM_DEFAULTS.sealX,
    sealY: TM_DEFAULTS.sealY,
    blueX: TM_DEFAULTS.blueX,
    blueY: TM_DEFAULTS.blueY,
    logoTextSize: TM_DEFAULTS.logoTextSize,
    logoTextX: TM_DEFAULTS.logoTextX,
    logoTextY: TM_DEFAULTS.logoTextY,
    signX: TM_DEFAULTS.signX,
    signY: TM_DEFAULTS.signY,
    signSize: TM_DEFAULTS.signSize,
    logoDataUrl: row.logo_data_url || null,
    createdBy: row.created_by || null,
    timestamp: row.synced_at ? formatTimestamp(new Date(row.synced_at)) : '—',
  })) as VaultRecord[];

  return { records, error: null };
}

/**
 * Delete a vault certificate row.
 *
 * The production `certificates` table has NO `id` column (registration_no is
 * the primary key, trademark_no has a unique constraint), so `trademark_no` is
 * used as the delete key. The `certificates_delete_own` RLS policy scopes the
 * delete to the current user's own records (`created_by = auth.uid()`, active
 * account) while admins may delete any record, so a caller can only ever
 * remove a row that the History list is allowed to show them.
 */
export async function deleteVaultRecord(
  trademarkNo: string,
): Promise<{ error: string | null }> {
  if (!trademarkNo) return { error: 'Missing Trademark No. — cannot delete the record.' };
  const { data, error } = await supabase
    .from('certificates')
    .delete()
    .eq('trademark_no', trademarkNo)
    .select('trademark_no');
  if (error) return { error: error.message };
  if (!data?.length) {
    return { error: 'Record not found or you do not have permission to delete it.' };
  }
  return { error: null };
}

/** Live verification link for a trademark number (preserved from original). */
export function liveVerifyUrl(trademarkNo: string): string | null {
  const tm = trademarkNo.replace(/^Trademark\s*No\.\s*/i, '').trim();
  return tm
    ? `https://dpdt-govbd-trademek-database.vercel.app/verify?reg_no=${encodeURIComponent(tm)}`
    : null;
}
