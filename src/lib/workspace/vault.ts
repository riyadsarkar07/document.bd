'use client';

import { settleWithTimeout, supabaseData, timedOutQuery, WORKSPACE_QUERY_TIMEOUT_MS } from '@/lib/supabase/client';
import { TM_DEFAULTS } from '@/lib/constants/tm';
import { escapePostgrestSearch, formatTimestamp } from '@/lib/utils';
import { logAudit } from '@/lib/workspace/audit';
import { reportCapturedError } from '@/lib/bug-hunter/capture';
import { VERIFY_BASE_URL } from '@/lib/verify-base';
import { sealedTextFromVault } from '@/lib/publish/sealed-text';
import { layoutFromSnapshot, layoutFromVaultSources, packDetails, unpackDetails } from '@/lib/publish/layout';
import type { TMSnapshot } from '@/lib/editor/types';
import {
  DOCUMENT_KINDS,
  isDocumentKind,
  type DocumentKind,
} from '@/lib/workspace/document-kinds';
import { isUnhcrCurrentRecordId, UNHCR_CURRENT_RECORD_ID } from '@/lib/unhcrCurrentState';
import {
  coerceUnhcrS2CurrentRpcRow,
  coerceUnhcrS2Details,
  isUnhcrS2CurrentRecordId,
  UNHCR_S2_CURRENT_RECORD_ID,
} from '@/lib/unhcrS2CurrentState';

/** Publication state of a vault record against the public verification portal. */
export type PublishStatus = 'published' | 'pending' | 'failed' | 'unpublished';

/** Certificate-family kinds that reuse the TM canvas/renderer. */
export type CertificateDocKind = 'tm' | 'youtube-trademark';

export interface VaultRecord extends TMSnapshot {
  timestamp: string;
  docKind?: DocumentKind;
  /**
   * Generic editor payload for non-certificate vault rows (NID, TIN, PDF,
   * service records). `null`/absent for TM and YouTube certificate rows.
   */
  doc?: unknown;
  /** UUID of the authenticated user who created/exported the record. */
  createdBy?: string | null;
  /** Resolved display email for `createdBy` (null when unknown / not visible). */
  creatorEmail?: string | null;
  /** Publish pipeline state (undefined = never published). */
  publishStatus?: PublishStatus | null;
  /** When the record was last confirmed live on the portal. */
  publishedAt?: string | null;
  /** Last GitHub commit SHA that published/unpublished the record. */
  publishCommitSha?: string | null;
  /** Human-readable error from the last failed publish attempt. */
  publishError?: string | null;
}

/** Raw `certificates` row columns the vault reads (kept optional because the
 * legacy table may predate `created_by`, `deleted_at` etc.). */
interface VaultRow {
  trademark_no?: string | null;
  reg_date?: string | null;
  app_date?: string | null;
  name?: string | null;
  owner_name?: string | null;
  address?: string | null;
  company_type?: string | null;
  details?: string | null;
  sealed_date?: string | null;
  sealed_text_phrase?: string | null;
  opening_text?: string | null;
  middle_text_arial?: string | null;
  logo_text?: string | null;
  layout_json?: unknown;
  logo_data_url?: string | null;
  created_by?: string | null;
  synced_at?: string | null;
  deleted_at?: string | null;
  publish_status?: string | null;
  published_at?: string | null;
  publish_commit_sha?: string | null;
  publish_error?: string | null;
}

function mapVaultRow(row: VaultRow): VaultRecord {
  const unpacked = unpackDetails(row.details);
  return {
    trademarkNo: row.trademark_no || '',
    regDate: row.reg_date || '',
    appDate: row.app_date || '',
    companyName: row.name || '',
    ownerName: row.owner_name || '',
    address: row.address || '',
    compType: row.company_type || '',
    openingText:
      typeof row.opening_text === 'string' && row.opening_text.length
        ? row.opening_text
        : unpacked.openingText && unpacked.openingText.length
          ? unpacked.openingText
          : TM_DEFAULTS.openingText,
    middleTextArial:
      typeof row.middle_text_arial === 'string' && row.middle_text_arial.length
        ? row.middle_text_arial
        : unpacked.middleTextArial && unpacked.middleTextArial.length
          ? unpacked.middleTextArial
          : TM_DEFAULTS.middleTextArial,
    goodsDesc: unpacked.goodsDesc,
    sealedTextPhrase: sealedTextFromVault(row.sealed_text_phrase, TM_DEFAULTS.sealedTextPhrase),
    sealedDate: row.sealed_date || '',
    logoText:
      typeof row.logo_text === 'string'
        ? row.logo_text
        : typeof unpacked.logoText === 'string'
          ? unpacked.logoText
          : '',
    ...layoutFromVaultSources(row.layout_json, row.details),
    logoDataUrl: row.logo_data_url || null,
    docKind: isDocumentKind(unpacked.docKind) ? unpacked.docKind : 'tm',
    doc: unpacked.doc ?? null,
    createdBy: row.created_by || null,
    timestamp: row.synced_at ? formatTimestamp(new Date(row.synced_at)) : '—',
    publishStatus: (row.publish_status as PublishStatus) || null,
    publishedAt: row.published_at ? formatTimestamp(new Date(row.published_at)) : null,
    publishCommitSha: row.publish_commit_sha || null,
    publishError: row.publish_error || null,
  } as VaultRecord;
}

/** True when Postgres rejected the query for a `deleted_at` column that the
 * deployment does not have yet (migration pending). */
function isMissingDeletedAt(err: { message?: string } | null): boolean {
  return /column .*deleted_at.*does not exist/i.test(err?.message ?? '');
}

/**
 * Shared vault upsert keyed by the natural `trademark_no`.
 *
 * Finds the existing row, preserves its `registration_no` and original creator,
 * inserts a fresh row when absent, and retries without any column an older
 * deployment is missing (the extra data persists once its migration is run).
 * Re-saving a trashed record also clears `deleted_at` so it returns to the
 * active vault.
 */
async function writeVaultRow(
  trademarkNo: string,
  payload: Record<string, unknown>,
  createdBy?: string | null,
): Promise<{ error: { message: string } | null }> {
  const existing = await supabaseData
    .from('certificates')
    .select('registration_no, created_by')
    .eq('trademark_no', trademarkNo)
    .limit(1);

  const existingRow = existing.data?.[0];

  // Insert path carries the creator; update path preserves the original one
  // UNLESS the existing (legacy) row has no creator yet — then adopt the
  // current user so re-saving the default/legacy record captures who saved it.
  if (createdBy) payload.created_by = createdBy;

  let result: { error: { message: string } | null };
  if (existingRow) {
    if (existingRow.registration_no) payload.registration_no = existingRow.registration_no;
    if (existingRow.created_by) delete payload.created_by;
    result = await supabaseData.from('certificates').update(payload).eq('trademark_no', trademarkNo);
  } else {
    payload.registration_no = Math.floor(Date.now() / 1000);
    result = await supabaseData.from('certificates').insert([payload]);
  }

  let attempts = 0;
  while (result.error && attempts < 5) {
    const msg = result.error.message ?? '';
    const drops: string[] = [];
    if (/created_by/i.test(msg)) drops.push('created_by');
    if (/logo_data_url/i.test(msg)) drops.push('logo_data_url');
    if (/deleted_at/i.test(msg)) drops.push('deleted_at');
    if (/sealed_text_phrase/i.test(msg)) drops.push('sealed_text_phrase');
    if (/layout_json/i.test(msg)) drops.push('layout_json');
    if (/opening_text/i.test(msg)) drops.push('opening_text');
    if (/middle_text_arial/i.test(msg)) drops.push('middle_text_arial');
    if (/logo_text/i.test(msg)) drops.push('logo_text');
    if (drops.length === 0) break;
    for (const key of drops) delete payload[key];
    result = existingRow
      ? await supabaseData.from('certificates').update(payload).eq('trademark_no', trademarkNo)
      : await supabaseData.from('certificates').insert([payload]);
    attempts += 1;
  }

  return result;
}

/**
 * Cloud Vault — the original app stored certificate exports in the Supabase
 * `certificates` table. Column mapping is preserved exactly.
 */
export async function commitCertificate(
  entry: TMSnapshot,
  createdBy?: string | null,
  options?: { docKind?: CertificateDocKind },
): Promise<{ error: string | null }> {
  const trademarkNo = entry.trademarkNo || 'N/A';
  const docKind: CertificateDocKind =
    options?.docKind === 'youtube-trademark' || entry.docKind === 'youtube-trademark'
      ? 'youtube-trademark'
      : 'tm';
  const payload: Record<string, unknown> = {
    trademark_no: trademarkNo,
    reg_date: entry.regDate || '',
    name: entry.companyName || '',
    owner_name: entry.ownerName || '',
    address: entry.address || '',
    company_type: entry.compType || '',
    app_date: entry.appDate || '',
    details: packDetails(entry.goodsDesc || '', layoutFromSnapshot(entry), {
      openingText: typeof entry.openingText === 'string' ? entry.openingText : TM_DEFAULTS.openingText,
      middleTextArial:
        typeof entry.middleTextArial === 'string' ? entry.middleTextArial : TM_DEFAULTS.middleTextArial,
      logoText: typeof entry.logoText === 'string' ? entry.logoText : '',
      docKind,
    }),
    sealed_date: entry.sealedDate || '',
    sealed_text_phrase:
      typeof entry.sealedTextPhrase === 'string' ? entry.sealedTextPhrase : TM_DEFAULTS.sealedTextPhrase,
    opening_text: typeof entry.openingText === 'string' ? entry.openingText : TM_DEFAULTS.openingText,
    middle_text_arial:
      typeof entry.middleTextArial === 'string' ? entry.middleTextArial : TM_DEFAULTS.middleTextArial,
    logo_text: typeof entry.logoText === 'string' ? entry.logoText : '',
    layout_json: layoutFromSnapshot(entry),
    synced_at: new Date().toISOString(),
    // Re-saving a trashed record brings it back into the active vault.
    deleted_at: null,
  };
  if (entry.logoDataUrl) payload.logo_data_url = entry.logoDataUrl;

  // Existing trademark_no → UPDATE the existing row so repeated saves never
  // create duplicate rows. New trademark_no → INSERT a fresh one. The `id`
  // surrogate is not exposed by the production vault schema, so the
  // trademark_no is used as the natural key.
  const result = await writeVaultRow(trademarkNo, payload, createdBy);

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

  if (!result.error) {
    void logAudit({
      action: 'vault.saved',
      targetType: 'certificate',
      targetId: trademarkNo,
      metadata: { name: entry.companyName || '', owner: entry.ownerName || '' },
    });
  } else {
    reportCapturedError({
      kind: 'save',
      message: result.error.message,
      component: 'vault.commitCertificate',
      endpoint: 'certificates',
    });
  }

  return { error: result.error ? result.error.message : null };
}

export interface DocumentCommitInput {
  docKind: DocumentKind;
  /** Stable natural key / record id; the same id updates the same row. */
  recordId: string;
  /** Display title shown in the History "Company" column. */
  title: string;
  /** Optional secondary line shown in the History "Owner" column. */
  subtitle?: string;
  /** Editor snapshot restored verbatim when the record is reopened. */
  payload: unknown;
  createdBy?: string | null;
}

/**
 * Persist any Studio document (NID, TIN, PDF, service records, and the
 * certificate family) into the same Cloud Vault used by History. The editor
 * snapshot travels in the packed `details` payload together with its
 * `docKind`, so History can reopen the record in the editor that created it.
 */
export async function commitDocument(
  input: DocumentCommitInput,
): Promise<{ error: string | null; recordId: string | null }> {
  const recordId = input.recordId.trim();
  if (!recordId) return { error: 'Missing record id.', recordId: null };

  const layout = layoutFromSnapshot(TM_DEFAULTS);
  const kindMeta = DOCUMENT_KINDS[input.docKind];
  const payload: Record<string, unknown> = {
    trademark_no: recordId,
    reg_date: '',
    name: input.title || '',
    owner_name: input.subtitle || '',
    address: '',
    company_type: kindMeta.label,
    app_date: '',
    details: packDetails('', layout, { docKind: input.docKind, doc: input.payload }),
    sealed_date: '',
    sealed_text_phrase: TM_DEFAULTS.sealedTextPhrase,
    opening_text: TM_DEFAULTS.openingText,
    middle_text_arial: TM_DEFAULTS.middleTextArial,
    logo_text: '',
    layout_json: layout,
    synced_at: new Date().toISOString(),
    deleted_at: null,
  };

  const result = await writeVaultRow(recordId, payload, input.createdBy);

  if (
    result.error &&
    /duplicate key value violates unique constraint/i.test(result.error.message ?? '') &&
    /trademark_no/i.test(result.error.message ?? '')
  ) {
    return {
      error: `Record "${recordId}" is already archived by another account. Save with a different id.`,
      recordId: null,
    };
  }

  if (!result.error) {
    void logAudit({
      action: 'vault.saved',
      targetType: input.docKind,
      targetId: recordId,
      metadata: { name: input.title || '', kind: input.docKind },
    });
  } else {
    reportCapturedError({
      kind: 'save',
      message: result.error.message,
      component: 'vault.commitDocument',
      endpoint: 'certificates',
    });
  }

  return { error: result.error ? result.error.message : null, recordId: result.error ? null : recordId };
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
    const { data, error } = await supabaseData.from('profiles').select('id, email').in('id', ids);
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

export interface VaultListQuery {
  search?: string;
  company?: string;
  owner?: string;
  type?: string;
  createdBy?: string | null;
  /** Inclusive lower bound on the archive date (`YYYY-MM-DD`). */
  dateFrom?: string;
  /** Inclusive upper bound on the archive date (`YYYY-MM-DD`). */
  dateTo?: string;
  /** `active` (default) hides trashed records; `trashed` shows only them. */
  status?: 'active' | 'trashed';
  page?: number;
  pageSize?: number;
}

export interface VaultListResult {
  records: VaultRecord[];
  total: number;
  page: number;
  pageSize: number;
  error: string | null;
}

/**
 * List vault records with search / filters / trash scope and server-side
 * pagination. If the `deleted_at` migration has not been applied yet the
 * trash filter is skipped so the vault keeps working.
 */
export async function listVaultRecords(q: VaultListQuery = {}): Promise<VaultListResult> {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, q.pageSize ?? 50));
  const status = q.status ?? 'active';

  try {
    const build = (withTrash: boolean) => {
      let query = supabaseData
        .from('certificates')
        .select('*', { count: 'exact' })
        .neq('trademark_no', UNHCR_CURRENT_RECORD_ID)
        .neq('trademark_no', UNHCR_S2_CURRENT_RECORD_ID);
      if (withTrash) {
        query = status === 'trashed' ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null);
      }
      const search = escapePostgrestSearch(q.search ?? '');
      if (search) {
        query = query.or(`trademark_no.ilike.%${search}%,name.ilike.%${search}%,owner_name.ilike.%${search}%`);
      }
      if (q.company?.trim()) query = query.ilike('name', `%${escapePostgrestSearch(q.company)}%`);
      if (q.owner?.trim()) query = query.ilike('owner_name', `%${escapePostgrestSearch(q.owner)}%`);
      if (q.type?.trim()) query = query.ilike('company_type', `%${escapePostgrestSearch(q.type)}%`);
      if (q.createdBy) query = query.eq('created_by', q.createdBy);
      if (q.dateFrom) query = query.gte('synced_at', new Date(`${q.dateFrom}T00:00:00`).toISOString());
      if (q.dateTo) query = query.lte('synced_at', new Date(`${q.dateTo}T23:59:59.999`).toISOString());
      return query.order('synced_at', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
    };

    const timedOut = timedOutQuery('Vault request timed out.');
    let { data, error, count } = await settleWithTimeout(build(true), timedOut);
    if (error && isMissingDeletedAt(error)) {
      const fallback = await settleWithTimeout(build(false), timedOut);
      data = fallback.data;
      error = fallback.error;
      count = fallback.count;
    }

    if (error) return { records: [], total: 0, page, pageSize, error: error.message };
    const records = (data ?? []).map(mapVaultRow);
    return { records, total: count ?? records.length, page, pageSize, error: null };
  } catch (err) {
    return {
      records: [],
      total: 0,
      page,
      pageSize,
      error: err instanceof Error ? err.message : 'Could not load vault records.',
    };
  }
}

/** Load one vault certificate by trademark number for History → editor reopen. */
export async function getVaultRecord(
  trademarkNo: string,
): Promise<{ record: VaultRecord | null; error: string | null }> {
  const tm = trademarkNo.trim();
  if (!tm) return { record: null, error: 'Missing Trademark No.' };
  if (isUnhcrCurrentRecordId(tm) || isUnhcrS2CurrentRecordId(tm)) return { record: null, error: 'Record not found.' };
  const { data, error } = await settleWithTimeout(
    supabaseData.from('certificates').select('*').eq('trademark_no', tm).limit(1),
    timedOutQuery('Vault record request timed out.'),
    WORKSPACE_QUERY_TIMEOUT_MS,
  );
  if (error) return { record: null, error: error.message };
  const row = data?.[0];
  if (!row) return { record: null, error: 'Record not found.' };
  return { record: mapVaultRow(row as VaultRow), error: null };
}

function isMissingUnhcrCurrentRpc(message: string | undefined): boolean {
  return /could not find the function|schema cache|does not exist/i.test(message ?? '');
}

function mapUnhcrCurrentRow(data: unknown): VaultRecord | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const mapped = mapVaultRow(data as VaultRow);
  if (!isUnhcrCurrentRecordId(mapped.trademarkNo) || mapped.docKind !== 'unhcr') return null;
  return mapped;
}

/**
 * UNHCR editor shared current workspace state (`UNHCR-CURRENT`).
 * Loaded via SECURITY DEFINER RPC so every user with `unhcr` access gets the
 * same workspace row. Private History cases stay behind certificates RLS.
 */
export async function getUnhcrCurrentState(): Promise<{ record: VaultRecord | null; error: string | null }> {
  const { data, error } = await supabaseData.rpc('get_unhcr_current_state');
  if (!error) return { record: mapUnhcrCurrentRow(data), error: null };
  if (!isMissingUnhcrCurrentRpc(error.message)) return { record: null, error: error.message };
  const fallback = await supabaseData
    .from('certificates')
    .select('*')
    .eq('trademark_no', UNHCR_CURRENT_RECORD_ID)
    .limit(1);
  if (fallback.error) return { record: null, error: fallback.error.message };
  return { record: mapUnhcrCurrentRow(fallback.data?.[0] ?? null), error: null };
}

/**
 * Upsert the UNHCR shared current editor state for every authorized user.
 * Falls back to the vault write path only when the RPC is not deployed yet.
 */
export async function saveUnhcrCurrentState(input: {
  snapshot: unknown;
  title: string;
  subtitle?: string;
  createdBy?: string | null;
}): Promise<{ error: string | null; skipped: boolean }> {
  const layout = layoutFromSnapshot(TM_DEFAULTS);
  const details = packDetails('', layout, { docKind: 'unhcr', doc: input.snapshot });
  const { error } = await supabaseData.rpc('save_unhcr_current_state', {
    p_title: input.title || 'UNHCR ID',
    p_subtitle: input.subtitle ?? '',
    p_details: details,
  });
  if (!error) return { error: null, skipped: false };
  if (!isMissingUnhcrCurrentRpc(error.message)) return { error: error.message, skipped: false };
  const res = await commitDocument({
    docKind: 'unhcr',
    recordId: UNHCR_CURRENT_RECORD_ID,
    title: input.title || 'UNHCR ID',
    subtitle: input.subtitle,
    payload: input.snapshot,
    createdBy: input.createdBy,
  });
  if (!res.error) return { error: null, skipped: false };
  if (/already archived by another account/i.test(res.error)) return { error: null, skipped: true };
  return { error: res.error, skipped: false };
}

function mapUnhcrS2CurrentRow(data: unknown): VaultRecord | null {
  const row = coerceUnhcrS2CurrentRpcRow(data);
  if (!row) return null;
  const details = coerceUnhcrS2Details(row.details);
  if (details != null) row.details = details;
  const mapped = mapVaultRow(row as VaultRow);
  if (!isUnhcrS2CurrentRecordId(mapped.trademarkNo)) return null;
  if (mapped.docKind !== 'unhcr-s2' && mapped.doc == null) return null;
  return mapped;
}

/**
 * UNHCR Server 2 shared current workspace (`UNHCR-S2-CURRENT`).
 * Independent of Server 1 (`UNHCR-CURRENT`). Same `unhcr` tool access.
 */
export async function getUnhcrS2CurrentState(): Promise<{ record: VaultRecord | null; error: string | null }> {
  const { data, error } = await settleWithTimeout(
    supabaseData.rpc('get_unhcr_s2_current_state'),
    timedOutQuery('Server 2 current-state request timed out.'),
    WORKSPACE_QUERY_TIMEOUT_MS,
  );
  if (error && !isMissingUnhcrCurrentRpc(error.message)) {
    return { record: null, error: error.message };
  }
  if (!error) {
    const record = mapUnhcrS2CurrentRow(data);
    if (record) return { record, error: null };
  }
  const fallback = await settleWithTimeout(
    supabaseData
      .from('certificates')
      .select('*')
      .eq('trademark_no', UNHCR_S2_CURRENT_RECORD_ID)
      .limit(1),
    timedOutQuery('Server 2 current-state fallback timed out.'),
    WORKSPACE_QUERY_TIMEOUT_MS,
  );
  if (fallback.error) {
    const rpcRecord = mapUnhcrS2CurrentRow(data);
    return { record: rpcRecord, error: rpcRecord ? null : fallback.error.message };
  }
  const fallbackRecord = mapUnhcrS2CurrentRow(fallback.data?.[0] ?? data);
  if (fallbackRecord) return { record: fallbackRecord, error: null };
  const rowPresent =
    coerceUnhcrS2CurrentRpcRow(data) != null || coerceUnhcrS2CurrentRpcRow(fallback.data?.[0]) != null;
  if (rowPresent) return { record: null, error: 'Could not restore Server 2 editor state' };
  return { record: null, error: null };
}

export async function saveUnhcrS2CurrentState(input: {
  snapshot: unknown;
  title: string;
  subtitle?: string;
  createdBy?: string | null;
}): Promise<{ error: string | null; skipped: boolean }> {
  const layout = layoutFromSnapshot(TM_DEFAULTS);
  const details = packDetails('', layout, { docKind: 'unhcr-s2', doc: input.snapshot });
  const { error } = await supabaseData.rpc('save_unhcr_s2_current_state', {
    p_title: input.title || 'UNHCR ID Server 2',
    p_subtitle: input.subtitle ?? '',
    p_details: details,
  });
  if (!error) return { error: null, skipped: false };
  if (!isMissingUnhcrCurrentRpc(error.message)) return { error: error.message, skipped: false };
  const res = await commitDocument({
    docKind: 'unhcr-s2',
    recordId: UNHCR_S2_CURRENT_RECORD_ID,
    title: input.title || 'UNHCR ID Server 2',
    subtitle: input.subtitle,
    payload: input.snapshot,
    createdBy: input.createdBy,
  });
  if (!res.error) return { error: null, skipped: false };
  if (/already archived by another account/i.test(res.error)) return { error: null, skipped: true };
  return { error: res.error, skipped: false };
}

/**
 * Legacy loader used by the studio dashboard and NID/TIN editors. Same active
 * (non-trashed) view as `listVaultRecords` with no pagination.
 */
export async function loadVault(): Promise<{ records: VaultRecord[]; error: string | null }> {
  try {
    const build = (withTrash: boolean) => {
      let query = supabaseData
        .from('certificates')
        .select('*')
        .neq('trademark_no', UNHCR_CURRENT_RECORD_ID)
        .neq('trademark_no', UNHCR_S2_CURRENT_RECORD_ID);
      if (withTrash) query = query.is('deleted_at', null);
      return query.order('synced_at', { ascending: false });
    };

    const timedOut = timedOutQuery('Vault request timed out.');
    let { data, error } = await settleWithTimeout(build(true), timedOut);
    if (error && isMissingDeletedAt(error)) {
      const fallback = await settleWithTimeout(build(false), timedOut);
      data = fallback.data;
      error = fallback.error;
    }

    if (error) return { records: [], error: error.message };
    const records = (data || []).map(mapVaultRow);
    return { records, error: null };
  } catch (err) {
    return { records: [], error: err instanceof Error ? err.message : 'Could not load vault records.' };
  }
}

/**
 * Distinct vault creators for the "Created By" owner filter. Relies on the
 * admin `profiles` read policy; non-admin callers receive an empty list.
 */
export async function listVaultOwnerOptions(): Promise<{
  options: { id: string; email: string }[];
  error: string | null;
}> {
  const { data, error } = await settleWithTimeout(
    supabaseData.from('profiles').select('id, email'),
    timedOutQuery('Vault owner list timed out.'),
    WORKSPACE_QUERY_TIMEOUT_MS,
  );
  if (error) return { options: [], error: error.message };
  const options = (data ?? [])
    .filter((p): p is { id: string; email: string } => Boolean(p.id && p.email))
    .map((p) => ({ id: String(p.id), email: String(p.email) }))
    .sort((a, b) => a.email.localeCompare(b.email));
  return { options, error: null };
}

/** Soft-delete a vault record (move to Trash). Re-save restores it. */
export async function trashVaultRecord(trademarkNo: string): Promise<{ error: string | null }> {
  if (!trademarkNo) return { error: 'Missing Trademark No. — cannot trash the record.' };
  if (isUnhcrCurrentRecordId(trademarkNo)) return { error: 'Shared UNHCR editor state cannot be moved to History trash.' };
  const { data, error } = await supabaseData
    .from('certificates')
    .update({ deleted_at: new Date().toISOString() })
    .eq('trademark_no', trademarkNo)
    .is('deleted_at', null)
    .select('trademark_no');
  if (error) return { error: error.message };
  if (!data?.length) return { error: 'Record not found or already in the trash.' };
  void logAudit({ action: 'vault.trashed', targetType: 'certificate', targetId: trademarkNo });
  return { error: null };
}

/** Restore a soft-deleted vault record back to the active view. */
export async function restoreVaultRecord(trademarkNo: string): Promise<{ error: string | null }> {
  if (!trademarkNo) return { error: 'Missing Trademark No. — cannot restore the record.' };
  if (isUnhcrCurrentRecordId(trademarkNo)) return { error: 'Shared UNHCR editor state is not a History record.' };
  const { data, error } = await supabaseData
    .from('certificates')
    .update({ deleted_at: null })
    .eq('trademark_no', trademarkNo)
    .not('deleted_at', 'is', null)
    .select('trademark_no');
  if (error) return { error: error.message };
  if (!data?.length) return { error: 'Record not found or not in the trash.' };
  void logAudit({ action: 'vault.restored', targetType: 'certificate', targetId: trademarkNo });
  return { error: null };
}

/**
 * Permanently delete a vault record — only allowed from the Trash view
 * (the row must already be soft-deleted) and ADMIN-ONLY. The
 * `certificates_delete_admin` RLS policy rejects the hard DELETE for every
 * non-admin caller, so a normal user can only ever soft-delete (trash) or
 * restore their own records — never destroy them. Admins may permanently
 * delete any trashed record.
 */
export async function permanentDeleteVaultRecord(trademarkNo: string): Promise<{ error: string | null }> {
  if (!trademarkNo) return { error: 'Missing Trademark No. — cannot delete the record.' };
  if (isUnhcrCurrentRecordId(trademarkNo)) return { error: 'Shared UNHCR editor state cannot be deleted from History.' };
  const { data, error } = await supabaseData
    .from('certificates')
    .delete()
    .eq('trademark_no', trademarkNo)
    .not('deleted_at', 'is', null)
    .select('trademark_no');
  if (error) return { error: error.message };
  if (!data?.length) {
    return { error: 'Record not found, already removed, or only admins can permanently delete vault records.' };
  }
  void logAudit({ action: 'vault.deleted', targetType: 'certificate', targetId: trademarkNo });
  return { error: null };
}

/** Live verification link for a trademark number (preserved from original). */
export function liveVerifyUrl(trademarkNo: string): string | null {
  const tm = trademarkNo.replace(/^Trademark\s*No\.\s*/i, '').trim();
  return tm ? `${VERIFY_BASE_URL}/verify?reg_no=${encodeURIComponent(tm)}` : null;
}
