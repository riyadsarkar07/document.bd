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

/**
 * PostgREST may return a jsonb RPC as an object, a one-row array, or a JSON
 * string. Direct editor open must unwrap those shapes; rejecting them leaves
 * Server 2 on built-in defaults even when UNHCR-S2-CURRENT exists.
 */
export function coerceUnhcrS2CurrentRpcRow(data: unknown): Record<string, unknown> | null {
  let row: unknown = data;
  if (typeof row === 'string') {
    const trimmed = row.trim();
    if (!trimmed) return null;
    try {
      row = JSON.parse(trimmed) as unknown;
    } catch {
      return null;
    }
  }
  if (Array.isArray(row)) row = row[0] ?? null;
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  return row as Record<string, unknown>;
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
