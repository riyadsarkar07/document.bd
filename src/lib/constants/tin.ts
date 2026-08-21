import type {
  SliderSpec,
  TinAlign,
  TinFieldKey,
  TinLayout,
  TINSnapshot,
} from '../editor/types';
import { TIN_FIELD_KEYS } from '../editor/types';

/**
 * TIN Information editor constants.
 *
 * The editor uses the uploaded reference certificate
 * (`public/assets/E TIN.jpg`, 1653×2339 px) as the actual template. The page is
 * rendered as A4 portrait (2480×3508 @ 300 DPI) and the reference is scaled to
 * fill it (the proportions match, 2480/1653 ≈ 3508/2339). Editable record values
 * are overlaid on the template at the positions below — every layout was derived
 * from the reference by OCR box mapping × 1.5.
 *
 * The QR code is regenerated from the current record and placed on the blank
 * bottom-left area of the template. DEMO disclosure lives in the app UI and in
 * the QR scan payload — the template image itself is kept exactly as uploaded.
 */

export const TIN_DOC_WIDTH = 2480;
export const TIN_DOC_HEIGHT = 3508;
export const TIN_DPI = 300;
export const TIN_TEMPLATE_SRC = '/assets/E TIN.jpg';
export const TIN_DEMO_NOTE = 'DEMO RECORD — NOT OFFICIAL NBR VERIFICATION';

export const TIN_FIELD_ORDER: readonly TinFieldKey[] = TIN_FIELD_KEYS;

export interface TinFieldMeta {
  key: TinFieldKey;
  label: string;
  textarea?: boolean;
}

export const TIN_FIELDS: TinFieldMeta[] = [
  { key: 'tinNo', label: 'TIN Number' },
  { key: 'taxpayerName', label: 'Taxpayer Name' },
  { key: 'name', label: 'Name' },
  { key: 'dob', label: 'DOB / Date' },
  { key: 'fatherName', label: "Father's Name" },
  { key: 'motherName', label: "Mother's Name" },
  { key: 'currentAddress', label: 'Current Address', textarea: true },
  { key: 'permanentAddress', label: 'Permanent Address', textarea: true },
  { key: 'taxCircle', label: 'Tax Circle' },
  { key: 'taxZone', label: 'Tax Zone' },
];

export const TIN_ALIGNMENTS: { value: TinAlign; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
  { value: 'justify', label: 'Justify' },
];

const layout = (
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
  extra?: Partial<TinLayout>,
): TinLayout => ({
  fontSize,
  x,
  y,
  width,
  height,
  lineHeight: 1.3,
  align: 'left',
  fontWeight: 'normal',
  ...extra,
});

/**
 * Default layout boxes on the 2480×3508 canvas. These were derived from the
 * uploaded reference (1653×2339) via OCR box mapping × 1.5 so the overlaid
 * values sit exactly where the certificate expects them.
 */
export const TIN_DEFAULT_LAYOUTS: Record<TinFieldKey, TinLayout> = {
  // Header TIN value — right after the printed "TIN:" label.
  tinNo: layout(1140, 874, 1050, 45, 68, { fontWeight: 'bold' }),
  // Name rendered inline inside "This is to Certify that __ is a Registered…".
  taxpayerName: layout(645, 1068, 630, 44, 50, { fontWeight: 'bold' }),
  // "1) Name :" row in the Taxpayer's Particulars list.
  name: layout(417, 1312, 1650, 44, 44, { fontWeight: 'bold' }),
  // Inline sentence — "Taxes Circle-__," (blank gap between the printed label and comma).
  taxCircle: layout(789, 1136, 92, 40, 45),
  // Inline sentence — "Taxes Zone __".
  taxZone: layout(1132, 1136, 235, 40, 45),
  // "Date : __" line.
  dob: layout(335, 2097, 540, 42, 30),
  fatherName: layout(565, 1401, 1650, 44, 44, { fontWeight: 'bold' }),
  motherName: layout(566, 1488, 1650, 44, 44, { fontWeight: 'bold' }),
  currentAddress: layout(633, 1576, 1650, 44, 45, { fontWeight: 'bold', lineHeight: 1.4 }),
  permanentAddress: layout(692, 1669, 1650, 44, 45, { fontWeight: 'bold', lineHeight: 1.4 }),
};

export const TIN_DEFAULTS: TINSnapshot = {
  tinNo: '1234567890',
  taxpayerName: 'Md. Riyad Sarkar',
  name: 'Md. Riyad Sarkar',
  dob: '',
  fatherName: 'Md. Abdul Karim',
  motherName: 'Rahila Begum',
  currentAddress: 'House 12, Road 5, Dhanmondi, Dhaka-1205',
  permanentAddress: "Village: Demo Para, Post: Demo, Thana: Teknaf, District: Cox's Bazar",
  taxCircle: '019',
  taxZone: 'Gazipur',
  layouts: TIN_DEFAULT_LAYOUTS,
  qrSize: 656,
  qrX: 910,
  qrY: 2196,
};

/**
 * Merges a (possibly older) saved snapshot so every field has a layout box.
 * Layout keys and root fields that no longer exist (removed fields) are
 * stripped so they can never resurface after refresh, save/reopen or import.
 */
export function normalizeTinSnapshot(s: Partial<TINSnapshot>): TINSnapshot {
  const layouts: Partial<Record<TinFieldKey, TinLayout>> = {};
  for (const key of TIN_FIELD_KEYS) {
    layouts[key] = s.layouts?.[key] ?? TIN_DEFAULT_LAYOUTS[key];
  }
  const root: Partial<TINSnapshot> = {};
  for (const key of TIN_FIELD_KEYS) {
    if (key in s) (root as Record<string, string>)[key] = s[key] as string;
  }
  return {
    ...TIN_DEFAULTS,
    ...root,
    qrSize: s.qrSize ?? TIN_DEFAULTS.qrSize,
    qrX: s.qrX ?? TIN_DEFAULTS.qrX,
    qrY: s.qrY ?? TIN_DEFAULTS.qrY,
    layouts: layouts as Record<TinFieldKey, TinLayout>,
  };
}

/**
 * Static boxes (canvas coordinates) where each value sits on the template —
 * used for reference/debugging and tests. The renderer itself reads the
 * user-adjustable `layouts` from the snapshot.
 */
export const TIN_ROW_BOXES: Record<TinFieldKey, { x: number; y: number; w: number; h: number }> = {
  tinNo: { x: 1140, y: 880, w: 1050, h: 45 },
  taxpayerName: { x: 445, y: 1066, w: 630, h: 44 },
  name: { x: 680, y: 1238, w: 1650, h: 44 },
  taxCircle: { x: 778, y: 1136, w: 92, h: 40 },
  taxZone: { x: 1115, y: 1136, w: 235, h: 40 },
  dob: { x: 335, y: 2097, w: 540, h: 42 },
  fatherName: { x: 555, y: 1398, w: 1650, h: 44 },
  motherName: { x: 565, y: 1491, w: 1650, h: 44 },
  currentAddress: { x: 620, y: 1576, w: 1650, h: 44 },
  permanentAddress: { x: 685, y: 1669, w: 1650, h: 44 },
};

export const TIN_LAYOUT_RANGES: Record<
  'fontSize' | 'x' | 'y' | 'width' | 'height' | 'lineHeight',
  Omit<SliderSpec, 'key'>
> = {
  fontSize: { label: 'Font Size', min: 10, max: 1000, default: 30, mono: true },
  x: { label: 'X', min: 0, max: 2480, default: 560, mono: true },
  y: { label: 'Y', min: 0, max: 3508, default: 1400, mono: true },
  width: { label: 'Width', min: 40, max: 2480, default: 1000, mono: true },
  height: { label: 'Height', min: 20, max: 1000, default: 44, mono: true },
  lineHeight: { label: 'Line Height', min: 0.8, max: 2.5, step: 0.05, default: 1.3, mono: true },
};

export const TIN_QR_SLIDERS: SliderSpec[] = [
  { key: 'qrSize', label: 'QR Size', min: 80, max: 1200, default: 656, mono: true },
  { key: 'qrX', label: 'QR X', min: 0, max: 2480, default: 910, mono: true },
  { key: 'qrY', label: 'QR Y', min: 0, max: 3508, default: 2196, mono: true },
];

export function tinTextValue(snap: TINSnapshot, key: TinFieldKey): string {
  return snap[key];
}
