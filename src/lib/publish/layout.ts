import { TM_DEFAULTS } from '../constants/tm';
import type { TMSnapshot } from '../editor/types';

/**
 * Numeric layout keys that Instant Download reads from live editor state.
 * History View/Publish rebuild from the vault row, so these must be stored
 * or seal/signature fall back to TM_DEFAULTS and drift off the downloaded JPG.
 */
export const TM_LAYOUT_KEYS = [
  'arialSize',
  'corsivSize',
  'sealSize',
  'blueDateSize',
  'tmX',
  'tmY',
  'dateX',
  'dateY',
  'paraY',
  'logoY',
  'logoSize',
  'sealX',
  'sealY',
  'blueX',
  'blueY',
  'logoTextSize',
  'logoTextX',
  'logoTextY',
  'signX',
  'signY',
  'signSize',
] as const;

export type TMLayoutKey = (typeof TM_LAYOUT_KEYS)[number];
export type TMLayout = Pick<TMSnapshot, TMLayoutKey>;

function finiteNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

const LAYOUT_BEGIN = '\n[[TM_LAYOUT]]';
const LAYOUT_END = '[[/TM_LAYOUT]]';

function hasLayoutPayload(value: unknown): boolean {
  if (value == null || value === '') return false;
  let obj: unknown = value;
  if (typeof value === 'string') {
    try {
      obj = JSON.parse(value) as unknown;
    } catch {
      return false;
    }
  }
  return Boolean(obj && typeof obj === 'object' && !Array.isArray(obj) && Object.keys(obj as object).length > 0);
}

/**
 * Production still lacks `layout_json`, and the vault drops that column on
 * write. Embed layout in the existing `details` text so History Publish can
 * restore seal/signature even when the jsonb column is absent.
 */
export function unpackDetails(details: string | null | undefined): { goodsDesc: string; layout: unknown } {
  if (typeof details !== 'string' || !details) return { goodsDesc: details || '', layout: null };
  const start = details.lastIndexOf(LAYOUT_BEGIN);
  if (start < 0) return { goodsDesc: details, layout: null };
  const jsonStart = start + LAYOUT_BEGIN.length;
  const end = details.indexOf(LAYOUT_END, jsonStart);
  if (end < 0) return { goodsDesc: details, layout: null };
  let layout: unknown = null;
  try {
    layout = JSON.parse(details.slice(jsonStart, end)) as unknown;
  } catch {
    layout = null;
  }
  return { goodsDesc: details.slice(0, start), layout };
}

export function packDetails(goodsDesc: string, layout: TMLayout): string {
  const clean = unpackDetails(goodsDesc).goodsDesc;
  return `${clean}${LAYOUT_BEGIN}${JSON.stringify(layout)}${LAYOUT_END}`;
}

/** Prefer `layout_json`; fall back to the layout block embedded in `details`. */
export function layoutFromVaultSources(layoutJson: unknown, details: string | null | undefined): TMLayout {
  const unpacked = unpackDetails(details);
  return layoutFromVault(hasLayoutPayload(layoutJson) ? layoutJson : unpacked.layout);
}

/** Snapshot → vault payload. Every key is a finite number (never stripped). */
export function layoutFromSnapshot(entry: TMSnapshot): TMLayout {
  const out = {} as TMLayout;
  for (const key of TM_LAYOUT_KEYS) {
    out[key] = finiteNumber(entry[key], TM_DEFAULTS[key]);
  }
  return out;
}

/**
 * Vault → renderer snapshot. Missing/legacy rows keep TM_DEFAULTS so existing
 * certificates that never stored layout continue to render as they do today.
 */
export function layoutFromVault(stored: unknown): TMLayout {
  let obj: unknown = stored;
  if (typeof stored === 'string') {
    try {
      obj = JSON.parse(stored) as unknown;
    } catch {
      obj = null;
    }
  }
  const src =
    obj && typeof obj === 'object' && !Array.isArray(obj)
      ? (obj as Record<string, unknown>)
      : {};
  const out = {} as TMLayout;
  for (const key of TM_LAYOUT_KEYS) {
    out[key] = finiteNumber(src[key], TM_DEFAULTS[key]);
  }
  return out;
}
