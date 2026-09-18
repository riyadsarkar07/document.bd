import type { UnhcrSnapshot } from './editor/types';
import { normalizeUnhcrSnapshot } from './constants/unhcr';

/**
 * Dedicated vault id for the UNHCR editor's shared current workspace state.
 * Separate from individual History records (`UNHCR-…` case ids).
 */
export const UNHCR_CURRENT_RECORD_ID = 'UNHCR-CURRENT';

export type UnhcrEditorLoadSource =
  | 'history-record'
  | 'project'
  | 'template'
  | 'current-state'
  | 'defaults';

export function isUnhcrCurrentRecordId(value: string | null | undefined): boolean {
  return (value ?? '').trim() === UNHCR_CURRENT_RECORD_ID;
}

/**
 * Direct editor open loads the shared current state only when no History
 * record / project / template was explicitly requested.
 */
export function resolveUnhcrEditorLoadSource(params: {
  recordNo?: string | null;
  projectId?: string | null;
  templateName?: string | null;
  hasCurrentState?: boolean;
}): UnhcrEditorLoadSource {
  if ((params.recordNo ?? '').trim()) return 'history-record';
  if ((params.projectId ?? '').trim()) return 'project';
  if ((params.templateName ?? '').trim()) return 'template';
  if (params.hasCurrentState) return 'current-state';
  return 'defaults';
}

/**
 * History case ids stay independent of the shared current-state row.
 * Opening the editor on UNHCR-CURRENT must not bind later Saves to that id.
 */
export function unhcrHistoryRecordIdForSave(
  historyRecordId: string | null | undefined,
  unhcrNo: string,
  generatedId: string,
): string {
  const existing = (historyRecordId ?? '').trim();
  if (existing && !isUnhcrCurrentRecordId(existing)) return existing;
  const idNo = unhcrNo.trim();
  if (idNo) return `UNHCR-${idNo}`;
  return generatedId;
}

export function snapshotFromUnhcrVaultDoc(doc: unknown): UnhcrSnapshot {
  return normalizeUnhcrSnapshot((doc ?? {}) as Partial<UnhcrSnapshot>);
}
