'use client';

import { supabase } from '@/lib/supabase/client';
import { TM_DEFAULTS } from '@/lib/constants/tm';
import { formatTimestamp } from '@/lib/utils';
import type { TMSnapshot } from '@/lib/editor/types';

export interface VaultRecord extends TMSnapshot {
  id?: string | number;
  timestamp: string;
}

/**
 * Cloud Vault — the original app stored certificate exports in the Supabase
 * `certificates` table. Column mapping is preserved exactly.
 */
export async function commitCertificate(
  entry: TMSnapshot,
): Promise<{ error: string | null }> {
  const fallbackNumericId = Math.floor(Date.now() / 1000);
  const payload = {
    registration_no: fallbackNumericId,
    trademark_no: entry.trademarkNo || 'N/A',
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
  const { error } = await supabase.from('certificates').insert([payload]);
  return { error: error ? error.message : null };
}

export async function loadVault(): Promise<{ records: VaultRecord[]; error: string | null }> {
  const { data, error } = await supabase
    .from('certificates')
    .select('*')
    .order('synced_at', { ascending: false });
  if (error) return { records: [], error: error.message };

  const records = (data || []).map((row) => ({
    id: row.id || '',
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
    logoDataUrl: null,
    timestamp: row.synced_at ? formatTimestamp(new Date(row.synced_at)) : '—',
  })) as VaultRecord[];

  return { records, error: null };
}

export async function deleteVaultRecord(
  id: string | number,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('certificates').delete().eq('id', id);
  return { error: error ? error.message : null };
}

/** Live verification link for a trademark number (preserved from original). */
export function liveVerifyUrl(trademarkNo: string): string | null {
  const tm = trademarkNo.replace(/^Trademark\s*No\.\s*/i, '').trim();
  return tm
    ? `https://dpdt-govbd-trademek-database.vercel.app/verify?reg_no=${encodeURIComponent(tm)}`
    : null;
}
