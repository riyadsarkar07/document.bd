import type { UnhcrS2Snapshot } from './editor/types';
import {
  UNHCR_DEFAULTS,
  UNHCR_TEST_BARCODE_TEXT_DEFAULT,
  UNHCR_TEST_REF_NO_DEFAULT,
  UNHCR_TEST_REF_NO_DEFAULT_VALUE,
  normalizeUnhcrSnapshot,
} from './constants/unhcr-s2';

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
  hasServer1CurrentState?: boolean;
  currentStateError?: boolean;
}): UnhcrS2EditorLoadSource {
  const recordNo = (params.recordNo ?? '').trim();
  if (recordNo && !isUnhcrS2CurrentRecordId(recordNo)) return 'history-record';
  if ((params.projectId ?? '').trim()) return 'project';
  if ((params.templateName ?? '').trim()) return 'template';
  if (params.hasCurrentState) return 'current-state';
  if (params.currentStateError) return 'defaults';
  return 'defaults';
}

export type UnhcrS2DirectOpenAction = 'apply-current' | 'init-defaults' | 'defaults' | 'load-error';

/**
 * Direct open must apply saved Server 2 current state when the row exists.
 * Missing current is initialized from Server 2 TEST defaults, not Server 1.
 * A load error must not be treated as "empty" or Server 1 will overwrite S2.
 */
export function decideUnhcrS2DirectOpenAction(params: {
  currentError?: string | null;
  hasCurrentRecord?: boolean;
  hasServer1Record?: boolean;
}): UnhcrS2DirectOpenAction {
  if (params.hasCurrentRecord) return 'apply-current';
  if (params.currentError) return 'load-error';
  return 'init-defaults';
}

const LEGACY_TEST_REF_NO = { x: 2478, h: 1560, fontSize: 28 };
const LEGACY_TEST_BARCODE = { h: 56, fontSize: 28 };

export function hasUnhcrS2TestTemplate(snap: UnhcrS2Snapshot): boolean {
  return (
    snap.testBarcodeTextH === UNHCR_TEST_BARCODE_TEXT_DEFAULT.h &&
    snap.testBarcodeTextFontSize === UNHCR_TEST_BARCODE_TEXT_DEFAULT.fontSize &&
    snap.testRefNo === UNHCR_TEST_REF_NO_DEFAULT_VALUE &&
    snap.testRefNoX === UNHCR_TEST_REF_NO_DEFAULT.x &&
    snap.testRefNoY === UNHCR_TEST_REF_NO_DEFAULT.y &&
    snap.testRefNoH === UNHCR_TEST_REF_NO_DEFAULT.h &&
    snap.testRefNoFontSize === UNHCR_TEST_REF_NO_DEFAULT.fontSize &&
    snap.testRefNoOrientation === UNHCR_TEST_REF_NO_DEFAULT.orientation
  );
}

/** Pre-template S2 current rows still have empty/legacy TEST overlays from the Server 1 seed. */
export function needsUnhcrS2TestTemplate(snap: UnhcrS2Snapshot): boolean {
  if (hasUnhcrS2TestTemplate(snap)) return false;
  const legacyRef =
    !snap.testRefNo.trim() ||
    snap.testRefNoX === LEGACY_TEST_REF_NO.x ||
    snap.testRefNoH === LEGACY_TEST_REF_NO.h ||
    snap.testRefNoFontSize === LEGACY_TEST_REF_NO.fontSize;
  const legacyBarcode =
    snap.testBarcodeTextH === LEGACY_TEST_BARCODE.h ||
    snap.testBarcodeTextFontSize === LEGACY_TEST_BARCODE.fontSize;
  return legacyRef || legacyBarcode;
}

export function applyUnhcrS2TestTemplate(snap: UnhcrS2Snapshot): UnhcrS2Snapshot {
  return {
    ...snap,
    testBarcodeTextH: UNHCR_TEST_BARCODE_TEXT_DEFAULT.h,
    testBarcodeTextFontSize: UNHCR_TEST_BARCODE_TEXT_DEFAULT.fontSize,
    testRefNo: UNHCR_TEST_REF_NO_DEFAULT_VALUE,
    testRefNoX: UNHCR_TEST_REF_NO_DEFAULT.x,
    testRefNoY: UNHCR_TEST_REF_NO_DEFAULT.y,
    testRefNoH: UNHCR_TEST_REF_NO_DEFAULT.h,
    testRefNoFontSize: UNHCR_TEST_REF_NO_DEFAULT.fontSize,
    testRefNoOrientation: UNHCR_TEST_REF_NO_DEFAULT.orientation,
  };
}

export function hydrateUnhcrS2CurrentSnapshot(doc: unknown): { snapshot: UnhcrS2Snapshot; upgraded: boolean } {
  const snapshot = snapshotFromUnhcrS2VaultDoc(doc);
  if (!needsUnhcrS2TestTemplate(snapshot)) return { snapshot, upgraded: false };
  return { snapshot: applyUnhcrS2TestTemplate(snapshot), upgraded: true };
}

export function unhcrS2InitialCurrentSnapshot(): UnhcrS2Snapshot {
  return applyUnhcrS2TestTemplate({ ...UNHCR_DEFAULTS, layouts: { ...UNHCR_DEFAULTS.layouts } });
}

/**
 * One-time copy of Server 1 workspace configuration into an independent
 * Server 2 snapshot. S2-only overlays stay on Server 2 defaults. Mutating
 * the result must not change the Server 1 source.
 */
export function copyUnhcrServer1SnapshotToServer2(doc: unknown): UnhcrS2Snapshot {
  const raw = (doc ?? {}) as Record<string, unknown>;
  const cloned: Record<string, unknown> = { ...raw };
  if (raw.layouts && typeof raw.layouts === 'object' && !Array.isArray(raw.layouts)) {
    const layouts: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw.layouts as Record<string, unknown>)) {
      layouts[key] = value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : value;
    }
    cloned.layouts = layouts;
  }
  return normalizeUnhcrSnapshot(cloned as Partial<UnhcrS2Snapshot>);
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
