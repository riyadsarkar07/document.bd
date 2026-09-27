import type { DlFieldKey, DlLayout, DrivingLicenseSnapshot, SliderSpec } from '../editor/types';
import { DL_FIELD_KEYS } from '../editor/types';

/**
 * Driving License DEMO editor constants.
 *
 * The uploaded blank template (`public/assets/Driving License.png`, 3264×1998)
 * is drawn as-is. Editable DEMO values overlay the printed labels. Artwork,
 * logos, watermark and layout of the template are never redrawn.
 */

export const DL_DOC_WIDTH = 3264;
export const DL_DOC_HEIGHT = 1998;
export const DL_TEMPLATE_SRC = '/assets/Driving License.png';
export const DL_DEMO_NOTE = 'DEMO / SAMPLE — NOT AN OFFICIAL DRIVING LICENCE';
export const DL_DEFAULT_REF_NO = 'DM347547NP501';
export const DL_AUTOSAVE_KEY_PREFIX = 'studio.autosave.driving-license.';

const DL_STALE_REF_RE = /^DL-TEST-\d+$/i;
const DL_STALE_NAMES = new Set(['DEMO HOLDER', 'DEMO FATHER', 'DEMO BRTA']);

const DL_WARNING_RE =
  /DEMO\s*\/\s*SAMPLE|NOT AN OFFICIAL DRIVING LICEN[CS]E/i;
const DL_ARTIFACT_RE =
  /^(undefined|null|NaN|\[object Object\])$|lorem ipsum|^\{\{[^{}]+\}\}$/i;

/** True when a value is explicit DEMO/SAMPLE warning copy that must not be encoded or painted as a field. */
export function isDlWarningText(value: string): boolean {
  const t = value.trim();
  return t === DL_DEMO_NOTE || DL_WARNING_RE.test(t);
}

/** True for debug/placeholder/metadata blobs that must not appear on the card canvas. */
export function isDlOverlayArtifact(value: string): boolean {
  const t = value.trim();
  if (!t) return true;
  if (isDlWarningText(t)) return true;
  if (DL_ARTIFACT_RE.test(t)) return true;
  if (/^\s*[\{\[][\s\S]*[\}\]]\s*$/.test(t) && t.includes(':')) return true;
  return false;
}

export const DL_FONT_FACES = [
  { family: 'Arial Regular', url: '/assets/arial-regular.ttf' },
  { family: 'Arial Bold MT', url: '/assets/arial-bold.ttf' },
] as const;

export const DL_FIELD_ORDER: readonly DlFieldKey[] = DL_FIELD_KEYS;

export interface DlFieldMeta {
  key: DlFieldKey;
  label: string;
}

export const DL_FIELDS: DlFieldMeta[] = [
  { key: 'name', label: 'Name' },
  { key: 'dob', label: 'Date of Birth' },
  { key: 'bloodGroup', label: 'Blood Group' },
  { key: 'fatherHusband', label: 'Father / Husband' },
  { key: 'issueDate', label: 'Issue / Renewal Date' },
  { key: 'validityDate', label: 'Validity Date' },
  { key: 'refNo', label: 'Reference Number' },
  { key: 'issuingAuthority', label: 'Issuing Authority' },
];

export const DL_FONT_OPTIONS: { value: DlLayout['fontFamily']; label: string }[] = [
  { value: 'arial', label: 'Arial Regular' },
  { value: 'arial-bold', label: 'Arial Bold' },
];

const layout = (
  x: number,
  y: number,
  fontSize: number,
  extra?: Partial<DlLayout>,
): DlLayout => ({
  fontSize,
  x,
  y,
  fontFamily: 'arial',
  ...extra,
});

/**
 * Default overlay boxes on the 3264×1998 template, aligned under the printed
 * labels so DEMO values sit in the blank gaps.
 */
export const DL_DEFAULT_LAYOUTS: Record<DlFieldKey, DlLayout> = {
  name: layout(924, 664, 62, { fontFamily: 'arial-bold' }),
  dob: layout(945, 886, 62, { fontFamily: 'arial-bold' }),
  bloodGroup: layout(942, 1097, 62, { fontFamily: 'arial-bold' }),
  fatherHusband: layout(942, 1298, 62, { fontFamily: 'arial-bold' }),
  issueDate: layout(943, 1511, 62, { fontFamily: 'arial-bold' }),
  validityDate: layout(2060, 1513, 62, { fontFamily: 'arial-bold' }),
  refNo: layout(944, 1835, 62, { fontFamily: 'arial-bold' }),
  issuingAuthority: layout(2064, 1835, 62, { fontFamily: 'arial-bold' }),
};

export const DL_PHOTO_DEFAULT = {
  x: 35,
  y: 607,
  w: 840,
  h: 928,
};

export const DL_PHOTO_RANGES: Record<'x' | 'y' | 'w' | 'h', Omit<SliderSpec, 'key'>> = {
  x: { label: 'X', min: 0, max: DL_DOC_WIDTH, default: DL_PHOTO_DEFAULT.x, mono: true },
  y: { label: 'Y', min: 0, max: DL_DOC_HEIGHT, default: DL_PHOTO_DEFAULT.y, mono: true },
  w: { label: 'Width', min: 40, max: DL_DOC_WIDTH, default: DL_PHOTO_DEFAULT.w, mono: true },
  h: { label: 'Height', min: 40, max: DL_DOC_HEIGHT, default: DL_PHOTO_DEFAULT.h, mono: true },
};

export const DL_QR_DEFAULT = {
  x: 2510,
  y: 486,
  size: 615,
};

export const DL_QR_RANGES: Record<'x' | 'y' | 'size', Omit<SliderSpec, 'key'>> = {
  x: { label: 'X', min: 0, max: DL_DOC_WIDTH, default: DL_QR_DEFAULT.x, mono: true },
  y: { label: 'Y', min: 0, max: DL_DOC_HEIGHT, default: DL_QR_DEFAULT.y, mono: true },
  size: { label: 'Size', min: 80, max: 900, default: DL_QR_DEFAULT.size, mono: true },
};

export const DL_LAYOUT_RANGES: Record<'fontSize' | 'x' | 'y', Omit<SliderSpec, 'key'>> = {
  fontSize: { label: 'Font Size', min: 8, max: 120, default: 62, mono: true },
  x: { label: 'X', min: 0, max: DL_DOC_WIDTH, default: 924, mono: true },
  y: { label: 'Y', min: 0, max: DL_DOC_HEIGHT, default: 664, mono: true },
};

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export const DL_DEFAULTS: DrivingLicenseSnapshot = {
  name: 'TEST HOLDER',
  dob: '01 Jan 1990',
  bloodGroup: 'O+',
  fatherHusband: 'TEST FATHER',
  issueDate: '01 Jan 2024',
  validityDate: '31 Dec 2028',
  refNo: DL_DEFAULT_REF_NO,
  issuingAuthority: 'DEMO ISSUING AUTHORITY',
  layouts: DL_DEFAULT_LAYOUTS,
  photoX: DL_PHOTO_DEFAULT.x,
  photoY: DL_PHOTO_DEFAULT.y,
  photoW: DL_PHOTO_DEFAULT.w,
  photoH: DL_PHOTO_DEFAULT.h,
  photoDataUrl: null,
  qrX: DL_QR_DEFAULT.x,
  qrY: DL_QR_DEFAULT.y,
  qrSize: DL_QR_DEFAULT.size,
};

export function normalizeDrivingLicenseSnapshot(
  s: Partial<DrivingLicenseSnapshot>,
): DrivingLicenseSnapshot {
  const layouts: Partial<Record<DlFieldKey, DlLayout>> = {};
  for (const key of DL_FIELD_KEYS) {
    const saved = s.layouts?.[key];
    const fontFamily: DlLayout['fontFamily'] =
      saved?.fontFamily === 'arial-bold' ? 'arial-bold' : 'arial';
    layouts[key] = {
      ...DL_DEFAULT_LAYOUTS[key],
      ...(saved ?? {}),
      fontFamily,
      fontSize: finiteNumber(
        saved?.fontSize,
        DL_DEFAULT_LAYOUTS[key].fontSize,
        DL_LAYOUT_RANGES.fontSize.min,
        DL_LAYOUT_RANGES.fontSize.max,
      ),
      x: finiteNumber(saved?.x, DL_DEFAULT_LAYOUTS[key].x, 0, DL_DOC_WIDTH),
      y: finiteNumber(saved?.y, DL_DEFAULT_LAYOUTS[key].y, 0, DL_DOC_HEIGHT),
    };
  }
  const root: Partial<DrivingLicenseSnapshot> = {};
  for (const key of DL_FIELD_KEYS) {
    if (typeof s[key] === 'string') (root as Record<string, string>)[key] = s[key] as string;
  }
  const photoDataUrl =
    typeof s.photoDataUrl === 'string' && s.photoDataUrl.startsWith('data:image/')
      ? s.photoDataUrl
      : null;
  return {
    ...DL_DEFAULTS,
    ...root,
    layouts: layouts as Record<DlFieldKey, DlLayout>,
    photoX: finiteNumber(s.photoX, DL_PHOTO_DEFAULT.x, DL_PHOTO_RANGES.x.min, DL_PHOTO_RANGES.x.max),
    photoY: finiteNumber(s.photoY, DL_PHOTO_DEFAULT.y, DL_PHOTO_RANGES.y.min, DL_PHOTO_RANGES.y.max),
    photoW: finiteNumber(s.photoW, DL_PHOTO_DEFAULT.w, DL_PHOTO_RANGES.w.min, DL_PHOTO_RANGES.w.max),
    photoH: finiteNumber(s.photoH, DL_PHOTO_DEFAULT.h, DL_PHOTO_RANGES.h.min, DL_PHOTO_RANGES.h.max),
    photoDataUrl,
    qrX: finiteNumber(s.qrX, DL_QR_DEFAULT.x, DL_QR_RANGES.x.min, DL_QR_RANGES.x.max),
    qrY: finiteNumber(s.qrY, DL_QR_DEFAULT.y, DL_QR_RANGES.y.min, DL_QR_RANGES.y.max),
    qrSize: finiteNumber(s.qrSize, DL_QR_DEFAULT.size, DL_QR_RANGES.size.min, DL_QR_RANGES.size.max),
  };
}

export function isDlFieldKey(value: string): value is DlFieldKey {
  return (DL_FIELD_KEYS as readonly string[]).includes(value);
}

export function isDrivingLicenseFreshOpen(params: {
  recordNo?: string | null;
  projectId?: string | null;
  templateName?: string | null;
}): boolean {
  return !(params.recordNo ?? '').trim() && !(params.projectId ?? '').trim() && !(params.templateName ?? '').trim();
}

/** Old factory seed from before the uploaded template became the default. */
export function isDlStaleFactorySeed(s: Partial<DrivingLicenseSnapshot> | null | undefined): boolean {
  if (!s) return false;
  const ref = String(s.refNo ?? '').trim();
  const name = String(s.name ?? '').trim();
  return DL_STALE_REF_RE.test(ref) || DL_STALE_NAMES.has(name);
}

export function drivingLicenseFreshOpenSnapshot(): DrivingLicenseSnapshot {
  return normalizeDrivingLicenseSnapshot({ ...DL_DEFAULTS });
}

/** Drop per-user / anon autosave so a fresh open cannot restore DEMO HOLDER / DL-TEST-* seeds. */
export function purgeDrivingLicenseAutosave(): void {
  if (typeof window === 'undefined') return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(DL_AUTOSAVE_KEY_PREFIX)) toRemove.push(key);
    }
    for (const key of toRemove) window.localStorage.removeItem(key);
  } catch {
    // ignore quota / private mode
  }
}

export function dlQrBox(snap: DrivingLicenseSnapshot): { x: number; y: number; w: number; h: number } {
  return { x: snap.qrX, y: snap.qrY, w: snap.qrSize, h: snap.qrSize };
}
