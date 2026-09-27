import type { DubaiFieldKey, DubaiLayout, DubaiLicenseSnapshot, SliderSpec } from '../editor/types';
import { DUBAI_FIELD_KEYS } from '../editor/types';

/**
 * Dubai Driving License DEMO editor constants.
 *
 * The uploaded blank template (`public/assets/dubai.jpg`, 12800×7990) is
 * drawn as-is onto a 3200×1998 working canvas. Editable DEMO values overlay
 * the blank gaps. Artwork, seals, printed labels and layout are never redrawn.
 */
export const DUBAI_DOC_WIDTH = 3200;
export const DUBAI_DOC_HEIGHT = 1998;
export const DUBAI_TEMPLATE_SRC = '/assets/dubai.jpg';
export const DUBAI_DEMO_NOTE = 'DEMO / SAMPLE — NOT AN OFFICIAL DRIVING LICENCE';
export const DUBAI_AUTOSAVE_KEY_PREFIX = 'studio.autosave.dubai-license.';

const DUBAI_WARNING_RE =
  /DEMO\s*\/\s*SAMPLE|NOT AN OFFICIAL DRIVING LICEN[CS]E/i;
const DUBAI_ARTIFACT_RE =
  /^(undefined|null|NaN|\[object Object\])$|lorem ipsum|^\{\{[^{}]+\}\}$/i;

export function isDubaiWarningText(value: string): boolean {
  const t = value.trim();
  return t === DUBAI_DEMO_NOTE || DUBAI_WARNING_RE.test(t);
}

export function isDubaiOverlayArtifact(value: string): boolean {
  const t = value.trim();
  if (!t) return true;
  if (isDubaiWarningText(t)) return true;
  if (DUBAI_ARTIFACT_RE.test(t)) return true;
  if (/^\s*[\{\[][\s\S]*[\}\]]\s*$/.test(t) && t.includes(':')) return true;
  return false;
}

export const DUBAI_FONT_FACES = [
  { family: 'Arial Regular', url: '/assets/arial-regular.ttf' },
  { family: 'Arial Bold MT', url: '/assets/arial-bold.ttf' },
] as const;

export const DUBAI_FIELD_ORDER: readonly DubaiFieldKey[] = DUBAI_FIELD_KEYS;

export interface DubaiFieldMeta {
  key: DubaiFieldKey;
  label: string;
  rtl?: boolean;
  textarea?: boolean;
}

export const DUBAI_FIELDS: DubaiFieldMeta[] = [
  { key: 'licenseNo', label: 'License Number' },
  { key: 'nameEn', label: 'Name (English)' },
  { key: 'nameAr', label: 'Name (Arabic)', rtl: true },
  { key: 'nationality', label: 'Nationality' },
  { key: 'dob', label: 'Date of Birth' },
  { key: 'issueDate', label: 'Issue Date' },
  { key: 'expiryDate', label: 'Expiry Date' },
  { key: 'placeOfIssue', label: 'Place of Issue' },
  { key: 'authorityText', label: 'Bottom reference / authority', textarea: true },
];

export const DUBAI_FONT_OPTIONS: { value: DubaiLayout['fontFamily']; label: string }[] = [
  { value: 'arial', label: 'Arial Regular' },
  { value: 'arial-bold', label: 'Arial Bold' },
];

const layout = (
  x: number,
  y: number,
  fontSize: number,
  extra?: Partial<DubaiLayout>,
): DubaiLayout => ({
  fontSize,
  x,
  y,
  fontFamily: 'arial',
  ...extra,
});

/**
 * Default overlay boxes on the 3200×1998 working canvas, aligned to the
 * blank gaps next to the printed English / Arabic labels.
 */
export const DUBAI_DEFAULT_LAYOUTS: Record<DubaiFieldKey, DubaiLayout> = {
  licenseNo: layout(1638, 753, 84),
  nameAr: layout(2781, 891, 84, { align: 'right' }),
  nameEn: layout(1320, 1058, 84),
  nationality: layout(1680, 1225, 48, { fontFamily: 'arial-bold' }),
  dob: layout(1622, 1389, 86),
  issueDate: layout(1601, 1548, 86),
  expiryDate: layout(1601, 1718, 86),
  placeOfIssue: layout(1680, 1872, 48, { fontFamily: 'arial-bold' }),
  authorityText: layout(369, 1705, 64, { align: 'left' }),
};

export const DUBAI_PHOTO_DEFAULT = {
  x: 104,
  y: 408,
  w: 778,
  h: 1168,
};

export const DUBAI_PHOTO_RANGES: Record<'x' | 'y' | 'w' | 'h', Omit<SliderSpec, 'key'>> = {
  x: { label: 'X', min: 0, max: DUBAI_DOC_WIDTH, default: DUBAI_PHOTO_DEFAULT.x, mono: true },
  y: { label: 'Y', min: 0, max: DUBAI_DOC_HEIGHT, default: DUBAI_PHOTO_DEFAULT.y, mono: true },
  w: { label: 'Width', min: 40, max: DUBAI_DOC_WIDTH, default: DUBAI_PHOTO_DEFAULT.w, mono: true },
  h: { label: 'Height', min: 40, max: DUBAI_DOC_HEIGHT, default: DUBAI_PHOTO_DEFAULT.h, mono: true },
};

export const DUBAI_LAYOUT_RANGES: Record<'fontSize' | 'x' | 'y', Omit<SliderSpec, 'key'>> = {
  fontSize: { label: 'Font Size', min: 8, max: 120, default: 84, mono: true },
  x: { label: 'X', min: 0, max: DUBAI_DOC_WIDTH, default: 1638, mono: true },
  y: { label: 'Y', min: 0, max: DUBAI_DOC_HEIGHT, default: 753, mono: true },
};

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export const DUBAI_DEFAULTS: DubaiLicenseSnapshot = {
  licenseNo: '784-1990-1234567-1',
  nameEn: 'ALEX MORGAN',
  nameAr: 'أليكس مورغان',
  nationality: '',
  dob: '01 JAN 1990',
  issueDate: '01 JAN 2024',
  expiryDate: '01 JAN 2028',
  placeOfIssue: '',
  authorityText: 'أليكس مورغان',
  layouts: DUBAI_DEFAULT_LAYOUTS,
  photoX: DUBAI_PHOTO_DEFAULT.x,
  photoY: DUBAI_PHOTO_DEFAULT.y,
  photoW: DUBAI_PHOTO_DEFAULT.w,
  photoH: DUBAI_PHOTO_DEFAULT.h,
  photoDataUrl: null,
};

export function normalizeDubaiLicenseSnapshot(
  s: Partial<DubaiLicenseSnapshot>,
): DubaiLicenseSnapshot {
  const layouts: Partial<Record<DubaiFieldKey, DubaiLayout>> = {};
  for (const key of DUBAI_FIELD_KEYS) {
    const saved = s.layouts?.[key];
    const fontFamily: DubaiLayout['fontFamily'] =
      saved?.fontFamily === 'arial' ? 'arial' : 'arial-bold';
    const align: DubaiLayout['align'] =
      saved?.align === 'right' || saved?.align === 'left'
        ? saved.align
        : DUBAI_DEFAULT_LAYOUTS[key].align;
    layouts[key] = {
      ...DUBAI_DEFAULT_LAYOUTS[key],
      ...(saved ?? {}),
      fontFamily: saved?.fontFamily === 'arial' || saved?.fontFamily === 'arial-bold' ? fontFamily : DUBAI_DEFAULT_LAYOUTS[key].fontFamily,
      fontSize: finiteNumber(
        saved?.fontSize,
        DUBAI_DEFAULT_LAYOUTS[key].fontSize,
        DUBAI_LAYOUT_RANGES.fontSize.min,
        DUBAI_LAYOUT_RANGES.fontSize.max,
      ),
      x: finiteNumber(saved?.x, DUBAI_DEFAULT_LAYOUTS[key].x, 0, DUBAI_DOC_WIDTH),
      y: finiteNumber(saved?.y, DUBAI_DEFAULT_LAYOUTS[key].y, 0, DUBAI_DOC_HEIGHT),
      align,
    };
  }
  const root: Partial<DubaiLicenseSnapshot> = {};
  for (const key of DUBAI_FIELD_KEYS) {
    if (typeof s[key] === 'string') (root as Record<string, string>)[key] = s[key] as string;
  }
  const photoDataUrl =
    typeof s.photoDataUrl === 'string' && s.photoDataUrl.startsWith('data:image/')
      ? s.photoDataUrl
      : null;
  return {
    ...DUBAI_DEFAULTS,
    ...root,
    layouts: layouts as Record<DubaiFieldKey, DubaiLayout>,
    photoX: finiteNumber(s.photoX, DUBAI_PHOTO_DEFAULT.x, DUBAI_PHOTO_RANGES.x.min, DUBAI_PHOTO_RANGES.x.max),
    photoY: finiteNumber(s.photoY, DUBAI_PHOTO_DEFAULT.y, DUBAI_PHOTO_RANGES.y.min, DUBAI_PHOTO_RANGES.y.max),
    photoW: finiteNumber(s.photoW, DUBAI_PHOTO_DEFAULT.w, DUBAI_PHOTO_RANGES.w.min, DUBAI_PHOTO_RANGES.w.max),
    photoH: finiteNumber(s.photoH, DUBAI_PHOTO_DEFAULT.h, DUBAI_PHOTO_RANGES.h.min, DUBAI_PHOTO_RANGES.h.max),
    photoDataUrl,
  };
}

export function isDubaiFieldKey(value: string): value is DubaiFieldKey {
  return (DUBAI_FIELD_KEYS as readonly string[]).includes(value);
}

export function isDubaiLicenseFreshOpen(params: {
  recordNo?: string | null;
  projectId?: string | null;
  templateName?: string | null;
}): boolean {
  return !(params.recordNo ?? '').trim() && !(params.projectId ?? '').trim() && !(params.templateName ?? '').trim();
}

export function dubaiLicenseFreshOpenSnapshot(): DubaiLicenseSnapshot {
  return normalizeDubaiLicenseSnapshot({});
}

export function purgeDubaiLicenseAutosave(): void {
  if (typeof window === 'undefined') return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(DUBAI_AUTOSAVE_KEY_PREFIX)) toRemove.push(key);
    }
    for (const key of toRemove) window.localStorage.removeItem(key);
  } catch {
    // ignore quota / private mode
  }
}
