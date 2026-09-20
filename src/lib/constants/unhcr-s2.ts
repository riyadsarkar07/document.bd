import type {
  SliderSpec,
  UnhcrCodeKey,
  UnhcrFieldKey,
  UnhcrLayout,
  UnhcrS2Snapshot,
  UnhcrTestOverlayKey,
  UnhcrTextOrientation,
} from '../editor/types';
import { UNHCR_CODE_KEYS, UNHCR_FIELD_KEYS, UNHCR_TEST_OVERLAY_KEYS } from '../editor/types';
import { syncUnhcrCodePayloads, UNHCR_BARCODE_TEST_PAYLOAD, UNHCR_QR_TEST_PAYLOAD } from '../unhcrCodes';

/**
 * UNHCR Server 2 editor constants (independent of Server 1).
 *
 * Identity values stay empty by default — this editor does not invent official
 * document data. Layout boxes sit on the uploaded template
 * (`public/assets/Unchar.png`, 2560×1800) so operators can overlay case notes
 * at the printed labels and save/restore font + position settings.
 *
 * Barcode-value and vertical reference-number overlays exist only here.
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

export const UNHCR_TEST_BARCODE_TEXT_DEFAULT_VALUE = '';

export const UNHCR_TEST_REF_NO_DEFAULT_VALUE = '';

export const UNHCR_TEST_BARCODE_TEXT_DEFAULT = {
  x: 54,
  y: 1160,
  w: 752,
  h: 56,
  fontSize: 28,
};

export const UNHCR_TEST_REF_NO_DEFAULT = {
  x: 2478,
  y: 120,
  w: 56,
  h: 1560,
  fontSize: 28,
  orientation: 'vertical' as UnhcrTextOrientation,
};

export const UNHCR_TEST_OVERLAY_LABELS: Record<UnhcrTestOverlayKey, string> = {
  testBarcodeText: 'Barcode Value',
  testRefNo: 'Reference Number',
};

export const UNHCR_TEST_BOX_RANGES: Record<'x' | 'y' | 'w' | 'h' | 'fontSize', Omit<SliderSpec, 'key'>> = {
  x: { label: 'X', min: 0, max: UNHCR_DOC_WIDTH, default: UNHCR_TEST_BARCODE_TEXT_DEFAULT.x, mono: true },
  y: { label: 'Y', min: 0, max: UNHCR_DOC_HEIGHT, default: UNHCR_TEST_BARCODE_TEXT_DEFAULT.y, mono: true },
  w: { label: 'Width', min: 24, max: UNHCR_DOC_WIDTH, default: UNHCR_TEST_BARCODE_TEXT_DEFAULT.w, mono: true },
  h: { label: 'Height', min: 24, max: UNHCR_DOC_HEIGHT, default: UNHCR_TEST_BARCODE_TEXT_DEFAULT.h, mono: true },
  fontSize: { label: 'Font Size', min: 8, max: 120, default: 28, mono: true },
};

/** Vertical TEST reference number may extend well past the card so Height can grow downward. */
export const UNHCR_TEST_REF_NO_HEIGHT_MAX = 4800;

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

export function isUnhcrTestOverlayKey(value: string): value is UnhcrTestOverlayKey {
  return (UNHCR_TEST_OVERLAY_KEYS as readonly string[]).includes(value);
}

/** Keep the barcode-value overlay in sync with the ID number. Reference number stays independent. */
export function syncUnhcrS2IdOverlays(snap: Pick<UnhcrS2Snapshot, 'unhcrNo'>): Pick<UnhcrS2Snapshot, 'testBarcodeText'> {
  return { testBarcodeText: typeof snap.unhcrNo === 'string' ? snap.unhcrNo : '' };
}

export function unhcrCodeBox(snap: UnhcrS2Snapshot, key: UnhcrCodeKey): { x: number; y: number; w: number; h: number } {
  if (key === 'barcode1') return { x: snap.barcode1X, y: snap.barcode1Y, w: snap.barcode1W, h: snap.barcode1H };
  if (key === 'barcode2') return { x: snap.barcode2X, y: snap.barcode2Y, w: snap.barcode2W, h: snap.barcode2H };
  return { x: snap.qrX, y: snap.qrY, w: snap.qrSize, h: snap.qrSize };
}

export function unhcrTestOverlayBox(
  snap: UnhcrS2Snapshot,
  key: UnhcrTestOverlayKey,
): { x: number; y: number; w: number; h: number } {
  if (key === 'testBarcodeText') {
    return {
      x: snap.testBarcodeTextX,
      y: snap.testBarcodeTextY,
      w: snap.testBarcodeTextW,
      h: snap.testBarcodeTextH,
    };
  }
  return {
    x: snap.testRefNoX,
    y: snap.testRefNoY,
    w: snap.testRefNoW,
    h: snap.testRefNoH,
  };
}

function finiteText(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function textOrientation(value: unknown, fallback: UnhcrTextOrientation): UnhcrTextOrientation {
  return value === 'vertical' || value === 'horizontal' ? value : fallback;
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export const UNHCR_DEFAULTS: UnhcrS2Snapshot = {
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
  testBarcodeText: UNHCR_TEST_BARCODE_TEXT_DEFAULT_VALUE,
  testBarcodeTextX: UNHCR_TEST_BARCODE_TEXT_DEFAULT.x,
  testBarcodeTextY: UNHCR_TEST_BARCODE_TEXT_DEFAULT.y,
  testBarcodeTextW: UNHCR_TEST_BARCODE_TEXT_DEFAULT.w,
  testBarcodeTextH: UNHCR_TEST_BARCODE_TEXT_DEFAULT.h,
  testBarcodeTextFontSize: UNHCR_TEST_BARCODE_TEXT_DEFAULT.fontSize,
  testRefNo: UNHCR_TEST_REF_NO_DEFAULT_VALUE,
  testRefNoX: UNHCR_TEST_REF_NO_DEFAULT.x,
  testRefNoY: UNHCR_TEST_REF_NO_DEFAULT.y,
  testRefNoW: UNHCR_TEST_REF_NO_DEFAULT.w,
  testRefNoH: UNHCR_TEST_REF_NO_DEFAULT.h,
  testRefNoFontSize: UNHCR_TEST_REF_NO_DEFAULT.fontSize,
  testRefNoOrientation: UNHCR_TEST_REF_NO_DEFAULT.orientation,
};

export function normalizeUnhcrSnapshot(s: Partial<UnhcrS2Snapshot>): UnhcrS2Snapshot {
  const layouts: Partial<Record<UnhcrFieldKey, UnhcrLayout>> = {};
  for (const key of UNHCR_FIELD_KEYS) {
    const saved = s.layouts?.[key];
    layouts[key] = {
      ...UNHCR_DEFAULT_LAYOUTS[key],
      ...(saved ?? {}),
    };
  }
  const root: Partial<UnhcrS2Snapshot> = {};
  for (const key of UNHCR_FIELD_KEYS) {
    if (typeof s[key] === 'string') (root as Record<string, string>)[key] = s[key] as string;
  }
  const photoDataUrl = typeof s.photoDataUrl === 'string' && s.photoDataUrl.startsWith('data:image/')
    ? s.photoDataUrl
    : null;
  const next: UnhcrS2Snapshot = {
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
    testBarcodeText: finiteText(
      s.testBarcodeText,
      typeof s.unhcrNo === 'string' ? s.unhcrNo : UNHCR_TEST_BARCODE_TEXT_DEFAULT_VALUE,
    ),
    testBarcodeTextX: finiteNumber(
      s.testBarcodeTextX,
      UNHCR_TEST_BARCODE_TEXT_DEFAULT.x,
      UNHCR_TEST_BOX_RANGES.x.min,
      UNHCR_TEST_BOX_RANGES.x.max,
    ),
    testBarcodeTextY: finiteNumber(
      s.testBarcodeTextY,
      UNHCR_TEST_BARCODE_TEXT_DEFAULT.y,
      UNHCR_TEST_BOX_RANGES.y.min,
      UNHCR_TEST_BOX_RANGES.y.max,
    ),
    testBarcodeTextW: finiteNumber(
      s.testBarcodeTextW,
      UNHCR_TEST_BARCODE_TEXT_DEFAULT.w,
      UNHCR_TEST_BOX_RANGES.w.min,
      UNHCR_TEST_BOX_RANGES.w.max,
    ),
    testBarcodeTextH: finiteNumber(
      s.testBarcodeTextH,
      UNHCR_TEST_BARCODE_TEXT_DEFAULT.h,
      UNHCR_TEST_BOX_RANGES.h.min,
      UNHCR_TEST_BOX_RANGES.h.max,
    ),
    testBarcodeTextFontSize: finiteNumber(
      s.testBarcodeTextFontSize,
      UNHCR_TEST_BARCODE_TEXT_DEFAULT.fontSize,
      UNHCR_TEST_BOX_RANGES.fontSize.min,
      UNHCR_TEST_BOX_RANGES.fontSize.max,
    ),
    testRefNo: finiteText(s.testRefNo, UNHCR_TEST_REF_NO_DEFAULT_VALUE),
    testRefNoX: finiteNumber(
      s.testRefNoX,
      UNHCR_TEST_REF_NO_DEFAULT.x,
      UNHCR_TEST_BOX_RANGES.x.min,
      UNHCR_TEST_BOX_RANGES.x.max,
    ),
    testRefNoY: finiteNumber(
      s.testRefNoY,
      UNHCR_TEST_REF_NO_DEFAULT.y,
      UNHCR_TEST_BOX_RANGES.y.min,
      UNHCR_TEST_BOX_RANGES.y.max,
    ),
    testRefNoW: finiteNumber(
      s.testRefNoW,
      UNHCR_TEST_REF_NO_DEFAULT.w,
      UNHCR_TEST_BOX_RANGES.w.min,
      UNHCR_TEST_BOX_RANGES.w.max,
    ),
    testRefNoH: finiteNumber(
      s.testRefNoH,
      UNHCR_TEST_REF_NO_DEFAULT.h,
      UNHCR_TEST_BOX_RANGES.h.min,
      UNHCR_TEST_REF_NO_HEIGHT_MAX,
    ),
    testRefNoFontSize: finiteNumber(
      s.testRefNoFontSize,
      UNHCR_TEST_REF_NO_DEFAULT.fontSize,
      UNHCR_TEST_BOX_RANGES.fontSize.min,
      UNHCR_TEST_BOX_RANGES.fontSize.max,
    ),
    testRefNoOrientation: textOrientation(s.testRefNoOrientation, UNHCR_TEST_REF_NO_DEFAULT.orientation),
  };
  return { ...next, ...syncUnhcrCodePayloads(next) };
}

export const UNHCR_LAYOUT_RANGES: Record<'fontSize' | 'x' | 'y', Omit<SliderSpec, 'key'>> = {
  fontSize: { label: 'Font Size', min: 8, max: 120, default: 32, mono: true },
  x: { label: 'X', min: 0, max: UNHCR_DOC_WIDTH, default: 852, mono: true },
  y: { label: 'Y', min: 0, max: UNHCR_DOC_HEIGHT, default: 478, mono: true },
};
