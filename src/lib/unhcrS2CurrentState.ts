import type { UnhcrS2Snapshot } from './editor/types';
import { normalizeUnhcrSnapshot } from './constants/unhcr-s2';

/**
 * Dedicated vault id for the UNHCR Server 2 editor's shared current workspace.
 * Independent of Server 1 (`UNHCR-CURRENT`) and of History case ids (`UNHCR-S2-…`).
 */
export const UNHCR_S2_CURRENT_RECORD_ID = 'UNHCR-S2-CURRENT';

export type UnhcrS2EditorLoadSource =
  | 'history-record'
  | 'project'
  | 'template'
  | 'current-state'
  | 'defaults';

export function isUnhcrS2CurrentRecordId(value: string | null | undefined): boolean {
  return (value ?? '').trim() === UNHCR_S2_CURRENT_RECORD_ID;
}

function parseJsonValue(value: string): unknown | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

function rowTrademarkNo(row: Record<string, unknown>): string {
  const raw = row.trademark_no ?? row.trademarkNo;
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * PostgREST may wrap a jsonb RPC as an object, one-row array, JSON string, or
 * `{ get_unhcr_s2_current_state: row }`. Direct editor open must unwrap those
 * shapes; rejecting them leaves Server 2 on built-in defaults.
 */
export function coerceUnhcrS2CurrentRpcRow(data: unknown): Record<string, unknown> | null {
  let row: unknown = data;
  for (let i = 0; i < 4; i += 1) {
    if (typeof row === 'string') {
      const parsed = parseJsonValue(row);
      if (parsed === undefined) return null;
      row = parsed;
      continue;
    }
    if (Array.isArray(row)) {
      row = row[0] ?? null;
      continue;
    }
    if (!row || typeof row !== 'object') return null;
    const rec = row as Record<string, unknown>;
    if (rowTrademarkNo(rec)) {
      if (!rec.trademark_no) rec.trademark_no = rowTrademarkNo(rec);
      return rec;
    }
    const keys = Object.keys(rec);
    if (keys.length === 1) {
      row = rec[keys[0]];
      continue;
    }
    return null;
  }
  return null;
}

/**
 * `to_jsonb` / PostgREST may return packed `details` as a string, a JSON
 * string, or the already-parsed layout object. unpackDetails only accepts a
 * packed string, so coerce first or Server 2 hydrates as empty defaults.
 */
export function coerceUnhcrS2Details(details: unknown): string | null {
  if (details == null) return null;
  if (typeof details === 'string') {
    if (details.includes('[[TM_LAYOUT]]')) {
      return details.includes('\n[[TM_LAYOUT]]') ? details : details.replace('[[TM_LAYOUT]]', '\n[[TM_LAYOUT]]');
    }
    const parsed = parseJsonValue(details);
    if (parsed === undefined) return details.trim() ? details : null;
    return coerceUnhcrS2Details(parsed);
  }
  if (Array.isArray(details)) return coerceUnhcrS2Details(details[0]);
  if (typeof details !== 'object') return null;
  const obj = details as Record<string, unknown>;
  if ('details' in obj && !('doc' in obj) && !('docKind' in obj) && !('layouts' in obj)) {
    const nested = coerceUnhcrS2Details(obj.details);
    if (nested) return nested;
  }
  if ('docKind' in obj || 'doc' in obj) {
    return `\n[[TM_LAYOUT]]${JSON.stringify(obj)}[[/TM_LAYOUT]]`;
  }
  if ('layouts' in obj || 'unhcrNo' in obj) {
    return `\n[[TM_LAYOUT]]${JSON.stringify({ docKind: 'unhcr-s2', doc: obj })}[[/TM_LAYOUT]]`;
  }
  return null;
}

export function resolveUnhcrS2EditorLoadSource(params: {
  recordNo?: string | null;
  projectId?: string | null;
  templateName?: string | null;
  hasCurrentState?: boolean;
}): UnhcrS2EditorLoadSource {
  const recordNo = (params.recordNo ?? '').trim();
  if (recordNo && !isUnhcrS2CurrentRecordId(recordNo)) return 'history-record';
  if ((params.projectId ?? '').trim()) return 'project';
  if ((params.templateName ?? '').trim()) return 'template';
  if (params.hasCurrentState) return 'current-state';
  return 'defaults';
}

/**
 * History case ids stay independent of the shared current-state row.
 * Opening the editor on UNHCR-S2-CURRENT must not bind later Saves to that id.
 */
export function unhcrS2HistoryRecordIdForSave(
  historyRecordId: string | null | undefined,
  unhcrNo: string,
  generatedId: string,
): string {
  const existing = (historyRecordId ?? '').trim();
  if (existing && !isUnhcrS2CurrentRecordId(existing)) return existing;
  const idNo = unhcrNo.trim();
  if (idNo) return `UNHCR-S2-${idNo}`;
  return generatedId;
}

export function snapshotFromUnhcrS2VaultDoc(doc: unknown): UnhcrS2Snapshot {
  return normalizeUnhcrSnapshot((doc ?? {}) as Partial<UnhcrS2Snapshot>);
}
