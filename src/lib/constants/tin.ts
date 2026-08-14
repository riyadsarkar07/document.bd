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
 * bottom-left area of the template. A circle/seal area is rendered over the
 * officer block at the bottom right. DEMO disclosure lives in the app UI and in
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
  { key: 'dob', label: 'DOB / Date' },
  { key: 'fatherName', label: "Father's Name" },
  { key: 'motherName', label: "Mother's Name" },
  { key: 'currentAddress', label: 'Current Address', textarea: true },
  { key: 'permanentAddress', label: 'Permanent Address', textarea: true },
  { key: 'previousTin', label: 'Previous TIN' },
  { key: 'status', label: 'Status' },
  { key: 'taxCircle', label: 'Tax Circle' },
  { key: 'taxZone', label: 'Tax Zone' },
  { key: 'deputyInfo', label: 'Office Information', textarea: true },
  { key: 'sealText', label: 'Circle / Seal', textarea: true },
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
  tinNo: layout(1140, 880, 1050, 45, 34, { fontWeight: 'bold' }),
  // Name rendered inline inside "This is to Certify that __ is a Registered…".
  taxpayerName: layout(445, 1066, 630, 44, 32),
  // Inline sentence — "Taxes Circle-__," (blank gap between the printed label and comma).
  taxCircle: layout(778, 1136, 92, 40, 28),
  // Inline sentence — "Taxes Zone __".
  taxZone: layout(1115, 1136, 235, 40, 28),
  // "Date : __" line.
  dob: layout(335, 2097, 540, 42, 30),
  fatherName: layout(555, 1398, 1650, 44, 30),
  motherName: layout(565, 1491, 1650, 44, 30),
  currentAddress: layout(620, 1576, 1650, 44, 30, { lineHeight: 1.4 }),
  permanentAddress: layout(685, 1669, 1650, 44, 30, { lineHeight: 1.4 }),
  previousTin: layout(530, 1763, 700, 44, 30),
  status: layout(408, 1850, 700, 44, 30),
  // Officer info — blank strip just above the printed officer block (right side).
  deputyInfo: layout(1630, 2330, 680, 70, 27, { lineHeight: 1.3 }),
  // Seal circle — overlaps the printed officer block (bottom right).
  sealText: layout(1780, 2400, 340, 340, 34, { lineHeight: 1.3, align: 'center' }),
};

export const TIN_DEFAULTS: TINSnapshot = {
  tinNo: '1234567890',
  taxpayerName: 'Md. Riyad Sarkar',
  dob: '',
  fatherName: 'Md. Abdul Karim',
  motherName: 'Rahila Begum',
  currentAddress: 'House 12, Road 5, Dhanmondi, Dhaka-1205',
  permanentAddress: "Village: Demo Para, Post: Demo, Thana: Teknaf, District: Cox's Bazar",
  previousTin: '',
  status: '',
  taxCircle: '019',
  taxZone: 'Gazipur',
  deputyInfo: '',
  sealText: '',
  layouts: TIN_DEFAULT_LAYOUTS,
  qrSize: 440,
  qrX: 200,
  qrY: 2680,
};

/** Merges a (possibly older) saved snapshot so every field has a layout box. */
export function normalizeTinSnapshot(s: Partial<TINSnapshot>): TINSnapshot {
  return {
    ...TIN_DEFAULTS,
    ...s,
    layouts: { ...TIN_DEFAULT_LAYOUTS, ...(s.layouts ?? {}) },
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
  taxCircle: { x: 778, y: 1136, w: 92, h: 40 },
  taxZone: { x: 1115, y: 1136, w: 235, h: 40 },
  dob: { x: 335, y: 2097, w: 540, h: 42 },
  fatherName: { x: 555, y: 1398, w: 1650, h: 44 },
  motherName: { x: 565, y: 1491, w: 1650, h: 44 },
  currentAddress: { x: 620, y: 1576, w: 1650, h: 44 },
  permanentAddress: { x: 685, y: 1669, w: 1650, h: 44 },
  previousTin: { x: 530, y: 1763, w: 700, h: 44 },
  status: { x: 408, y: 1850, w: 700, h: 44 },
  deputyInfo: { x: 1630, y: 2330, w: 680, h: 70 },
  sealText: { x: 1780, y: 2400, w: 340, h: 340 },
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
  { key: 'qrSize', label: 'QR Size', min: 80, max: 1200, default: 440, mono: true },
  { key: 'qrX', label: 'QR X', min: 0, max: 2480, default: 200, mono: true },
  { key: 'qrY', label: 'QR Y', min: 0, max: 3508, default: 2680, mono: true },
];

export function tinTextValue(snap: TINSnapshot, key: TinFieldKey): string {
  return snap[key];
}
