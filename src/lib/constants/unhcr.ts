import type { SliderSpec, UnhcrCodeKey, UnhcrFieldKey, UnhcrLayout, UnhcrSnapshot } from '../editor/types';
import { UNHCR_CODE_KEYS, UNHCR_FIELD_KEYS } from '../editor/types';
import { syncUnhcrCodePayloads, UNHCR_BARCODE_TEST_PAYLOAD, UNHCR_QR_TEST_PAYLOAD } from '../unhcrCodes';

/**
 * UNHCR ID-style editor constants.
 *
 * Identity values stay empty by default — this editor does not invent official
 * document data. Layout boxes sit on the uploaded template
 * (`public/assets/Unchar.png`, 2560×1800) so operators can overlay case notes
 * at the printed labels and save/restore font + position settings.
 */

export const UNHCR_DOC_WIDTH = 2560;
export const UNHCR_DOC_HEIGHT = 1800;
export const UNHCR_BACKGROUND = '/assets/Unchar.png';
export const UNHCR_CASE_LABEL = 'Facebook Imposter';

export const UNHCR_FONT_FACES = [
  { family: 'Arial Regular', url: '/assets/arial-regular.ttf' },
  { family: 'Arial Bold MT', url: '/assets/arial-bold.ttf' },
] as const;

export const UNHCR_FIELD_ORDER: readonly UnhcrFieldKey[] = UNHCR_FIELD_KEYS;

export interface UnhcrFieldMeta {
  key: UnhcrFieldKey;
  label: string;
}

export const UNHCR_FIELDS: UnhcrFieldMeta[] = [
  { key: 'unhcrNo', label: 'UNHCR No:' },
  { key: 'name', label: 'Name / Nama:' },
  { key: 'dob', label: 'Date of Birth / Tarikh Lahir:' },
  { key: 'sex', label: 'Sex / Jantina:' },
  { key: 'origin', label: 'Country of Origin / Negara Asal:' },
  { key: 'issuedDate', label: 'Issued Date:' },
  { key: 'expiredDate', label: 'Expired Date / Tarikh Pembaharuan:' },
];

export const UNHCR_FONT_OPTIONS: { value: UnhcrLayout['fontFamily']; label: string }[] = [
  { value: 'arial', label: 'Arial' },
  { value: 'arial-bold', label: 'Arial Bold' },
];

const layout = (
  x: number,
  y: number,
  fontSize: number,
  extra?: Partial<UnhcrLayout>,
): UnhcrLayout => ({
  fontSize,
  x,
  y,
  fontFamily: 'arial',
  ...extra,
});

/**
 * Default overlay boxes on the 2560×1800 template, aligned under the printed
 * labels. Operators can nudge each field independently.
 */
export const UNHCR_DEFAULT_LAYOUTS: Record<UnhcrFieldKey, UnhcrLayout> = {
  unhcrNo: layout(1288, 178, 36, { fontFamily: 'arial-bold' }),
  name: layout(852, 478, 36, { fontFamily: 'arial-bold' }),
  dob: layout(893, 760, 32),
  sex: layout(1865, 770, 50, { fontFamily: 'arial-bold' }),
  origin: layout(852, 918, 46, { fontFamily: 'arial-bold' }),
  issuedDate: layout(852, 1188, 32),
  expiredDate: layout(1605, 1251, 32),
};

export const UNHCR_PHOTO_DEFAULT = {
  x: 62,
  y: 91,
  w: 748,
  h: 900,
};

export const UNHCR_PHOTO_RANGES: Record<'x' | 'y' | 'w' | 'h', Omit<SliderSpec, 'key'>> = {
  x: { label: 'X', min: 0, max: UNHCR_DOC_WIDTH, default: UNHCR_PHOTO_DEFAULT.x, mono: true },
  y: { label: 'Y', min: 0, max: UNHCR_DOC_HEIGHT, default: UNHCR_PHOTO_DEFAULT.y, mono: true },
  w: { label: 'Width', min: 40, max: UNHCR_DOC_WIDTH, default: UNHCR_PHOTO_DEFAULT.w, mono: true },
  h: { label: 'Height', min: 40, max: UNHCR_DOC_HEIGHT, default: UNHCR_PHOTO_DEFAULT.h, mono: true },
};

export const UNHCR_BARCODE_DEFAULT = {
  w: 752,
  h: 121,
};

export const UNHCR_BARCODE1_DEFAULT = {
  x: 54,
  y: 1028,
  w: 752,
  h: 121,
};

export const UNHCR_BARCODE2_DEFAULT = {
  x: 1724,
  y: 99,
  w: 750,
  h: 121,
};

export const UNHCR_QR_DEFAULT = {
  x: 1467,
  y: 1369,
  size: 263,
};

export const UNHCR_CODE_LABELS: Record<UnhcrCodeKey, string> = {
  barcode1: 'Barcode 1',
  barcode2: 'Barcode 2',
  qr: 'QR Code',
};

export const UNHCR_BARCODE_RANGES: Record<'x' | 'y' | 'w' | 'h', Omit<SliderSpec, 'key'>> = {
  x: { label: 'X', min: 0, max: UNHCR_DOC_WIDTH, default: UNHCR_BARCODE1_DEFAULT.x, mono: true },
  y: { label: 'Y', min: 0, max: UNHCR_DOC_HEIGHT, default: UNHCR_BARCODE1_DEFAULT.y, mono: true },
  w: { label: 'Width', min: 80, max: UNHCR_DOC_WIDTH, default: UNHCR_BARCODE_DEFAULT.w, mono: true },
  h: { label: 'Height', min: 32, max: 400, default: UNHCR_BARCODE_DEFAULT.h, mono: true },
};

export const UNHCR_QR_RANGES: Record<'x' | 'y' | 'size', Omit<SliderSpec, 'key'>> = {
  x: { label: 'X', min: 0, max: UNHCR_DOC_WIDTH, default: UNHCR_QR_DEFAULT.x, mono: true },
  y: { label: 'Y', min: 0, max: UNHCR_DOC_HEIGHT, default: UNHCR_QR_DEFAULT.y, mono: true },
  size: { label: 'Size', min: 80, max: 720, default: UNHCR_QR_DEFAULT.size, mono: true },
};

export function isUnhcrCodeKey(value: string): value is UnhcrCodeKey {
  return (UNHCR_CODE_KEYS as readonly string[]).includes(value);
}

export function unhcrCodeBox(snap: UnhcrSnapshot, key: UnhcrCodeKey): { x: number; y: number; w: number; h: number } {
  if (key === 'barcode1') return { x: snap.barcode1X, y: snap.barcode1Y, w: snap.barcode1W, h: snap.barcode1H };
  if (key === 'barcode2') return { x: snap.barcode2X, y: snap.barcode2Y, w: snap.barcode2W, h: snap.barcode2H };
  return { x: snap.qrX, y: snap.qrY, w: snap.qrSize, h: snap.qrSize };
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export const UNHCR_DEFAULTS: UnhcrSnapshot = {
  unhcrNo: '',
  name: '',
  dob: '',
  sex: '',
  origin: '',
  issuedDate: '',
  expiredDate: '',
  layouts: UNHCR_DEFAULT_LAYOUTS,
  photoX: UNHCR_PHOTO_DEFAULT.x,
  photoY: UNHCR_PHOTO_DEFAULT.y,
  photoW: UNHCR_PHOTO_DEFAULT.w,
  photoH: UNHCR_PHOTO_DEFAULT.h,
  photoDataUrl: null,
  barcodePayload: UNHCR_BARCODE_TEST_PAYLOAD,
  barcode1X: UNHCR_BARCODE1_DEFAULT.x,
  barcode1Y: UNHCR_BARCODE1_DEFAULT.y,
  barcode1W: UNHCR_BARCODE1_DEFAULT.w,
  barcode1H: UNHCR_BARCODE1_DEFAULT.h,
  barcode2X: UNHCR_BARCODE2_DEFAULT.x,
  barcode2Y: UNHCR_BARCODE2_DEFAULT.y,
  barcode2W: UNHCR_BARCODE2_DEFAULT.w,
  barcode2H: UNHCR_BARCODE2_DEFAULT.h,
  qrPayload: UNHCR_QR_TEST_PAYLOAD,
  qrX: UNHCR_QR_DEFAULT.x,
  qrY: UNHCR_QR_DEFAULT.y,
  qrSize: UNHCR_QR_DEFAULT.size,
};

export function normalizeUnhcrSnapshot(s: Partial<UnhcrSnapshot>): UnhcrSnapshot {
  const layouts: Partial<Record<UnhcrFieldKey, UnhcrLayout>> = {};
  for (const key of UNHCR_FIELD_KEYS) {
    const saved = s.layouts?.[key];
    layouts[key] = {
      ...UNHCR_DEFAULT_LAYOUTS[key],
      ...(saved ?? {}),
    };
  }
  const root: Partial<UnhcrSnapshot> = {};
  for (const key of UNHCR_FIELD_KEYS) {
    if (typeof s[key] === 'string') (root as Record<string, string>)[key] = s[key] as string;
  }
  const photoDataUrl = typeof s.photoDataUrl === 'string' && s.photoDataUrl.startsWith('data:image/')
    ? s.photoDataUrl
    : null;
  const next: UnhcrSnapshot = {
    ...UNHCR_DEFAULTS,
    ...root,
    layouts: layouts as Record<UnhcrFieldKey, UnhcrLayout>,
    photoX: finiteNumber(s.photoX, UNHCR_PHOTO_DEFAULT.x, UNHCR_PHOTO_RANGES.x.min, UNHCR_PHOTO_RANGES.x.max),
    photoY: finiteNumber(s.photoY, UNHCR_PHOTO_DEFAULT.y, UNHCR_PHOTO_RANGES.y.min, UNHCR_PHOTO_RANGES.y.max),
    photoW: finiteNumber(s.photoW, UNHCR_PHOTO_DEFAULT.w, UNHCR_PHOTO_RANGES.w.min, UNHCR_PHOTO_RANGES.w.max),
    photoH: finiteNumber(s.photoH, UNHCR_PHOTO_DEFAULT.h, UNHCR_PHOTO_RANGES.h.min, UNHCR_PHOTO_RANGES.h.max),
    photoDataUrl,
    barcode1X: finiteNumber(s.barcode1X, UNHCR_BARCODE1_DEFAULT.x, UNHCR_BARCODE_RANGES.x.min, UNHCR_BARCODE_RANGES.x.max),
    barcode1Y: finiteNumber(s.barcode1Y, UNHCR_BARCODE1_DEFAULT.y, UNHCR_BARCODE_RANGES.y.min, UNHCR_BARCODE_RANGES.y.max),
    barcode1W: finiteNumber(s.barcode1W, UNHCR_BARCODE1_DEFAULT.w, UNHCR_BARCODE_RANGES.w.min, UNHCR_BARCODE_RANGES.w.max),
    barcode1H: finiteNumber(s.barcode1H, UNHCR_BARCODE1_DEFAULT.h, UNHCR_BARCODE_RANGES.h.min, UNHCR_BARCODE_RANGES.h.max),
    barcode2X: finiteNumber(s.barcode2X, UNHCR_BARCODE2_DEFAULT.x, UNHCR_BARCODE_RANGES.x.min, UNHCR_BARCODE_RANGES.x.max),
    barcode2Y: finiteNumber(s.barcode2Y, UNHCR_BARCODE2_DEFAULT.y, UNHCR_BARCODE_RANGES.y.min, UNHCR_BARCODE_RANGES.y.max),
    barcode2W: finiteNumber(s.barcode2W, UNHCR_BARCODE2_DEFAULT.w, UNHCR_BARCODE_RANGES.w.min, UNHCR_BARCODE_RANGES.w.max),
    barcode2H: finiteNumber(s.barcode2H, UNHCR_BARCODE2_DEFAULT.h, UNHCR_BARCODE_RANGES.h.min, UNHCR_BARCODE_RANGES.h.max),
    qrX: finiteNumber(s.qrX, UNHCR_QR_DEFAULT.x, UNHCR_QR_RANGES.x.min, UNHCR_QR_RANGES.x.max),
    qrY: finiteNumber(s.qrY, UNHCR_QR_DEFAULT.y, UNHCR_QR_RANGES.y.min, UNHCR_QR_RANGES.y.max),
    qrSize: finiteNumber(s.qrSize, UNHCR_QR_DEFAULT.size, UNHCR_QR_RANGES.size.min, UNHCR_QR_RANGES.size.max),
  };
  return { ...next, ...syncUnhcrCodePayloads(next) };
}

export const UNHCR_LAYOUT_RANGES: Record<'fontSize' | 'x' | 'y', Omit<SliderSpec, 'key'>> = {
  fontSize: { label: 'Font Size', min: 8, max: 120, default: 32, mono: true },
  x: { label: 'X', min: 0, max: UNHCR_DOC_WIDTH, default: 852, mono: true },
  y: { label: 'Y', min: 0, max: UNHCR_DOC_HEIGHT, default: 478, mono: true },
};
