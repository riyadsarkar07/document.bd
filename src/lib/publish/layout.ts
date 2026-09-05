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
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
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
