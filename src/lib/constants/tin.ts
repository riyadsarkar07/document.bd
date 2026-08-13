import type {
  SliderSpec,
  TinAlign,
  TinFieldKey,
  TinLayout,
  TINSnapshot,
} from '../editor/types';
import { TIN_FIELD_KEYS } from '../editor/types';

/**
 * TIN Information — DEMO editor constants.
 *
 * This document is an original DEMO layout inspired loosely by the layout of a
 * TIN registration record. It is NOT a reproduction of an official NBR
 * certificate and carries an explicit "DEMO RECORD — NOT OFFICIAL NBR
 * VERIFICATION" watermark on every render and export.
 */

export const TIN_DOC_WIDTH = 2480;
export const TIN_DOC_HEIGHT = 3508;
export const TIN_DPI = 300;
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
  { key: 'dob', label: 'Date of Birth' },
  { key: 'fatherName', label: "Father's Name" },
  { key: 'motherName', label: "Mother's Name" },
  { key: 'currentAddress', label: 'Current Address', textarea: true },
  { key: 'permanentAddress', label: 'Permanent Address', textarea: true },
  { key: 'previousTin', label: 'Previous TIN' },
  { key: 'status', label: 'Status' },
  { key: 'taxZone', label: 'Tax Zone' },
  { key: 'taxCircle', label: 'Tax Circle' },
  { key: 'date', label: 'Date' },
  { key: 'deputyInfo', label: 'Deputy / Office Information', textarea: true },
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
  lineHeight: 1.4,
  align: 'left',
  fontWeight: 'normal',
  ...extra,
});

const defaultLayouts: Record<TinFieldKey, TinLayout> = {
  tinNo: layout(808, 622, 1404, 58, 46, { lineHeight: 1.3, fontWeight: 'bold' }),
  taxpayerName: layout(808, 732, 1404, 58, 44, { lineHeight: 1.3, fontWeight: 'bold' }),
  dob: layout(808, 842, 1404, 58, 40),
  fatherName: layout(808, 952, 1404, 58, 40),
  motherName: layout(808, 1062, 1404, 58, 40),
  previousTin: layout(808, 1172, 1404, 58, 40),
  status: layout(808, 1282, 1404, 58, 40),
  taxZone: layout(808, 1392, 1404, 58, 40),
  taxCircle: layout(808, 1502, 1404, 58, 40),
  date: layout(808, 1612, 1404, 58, 40),
  currentAddress: layout(808, 1726, 1404, 130, 40, { lineHeight: 1.5 }),
  permanentAddress: layout(808, 1926, 1404, 130, 40, { lineHeight: 1.5 }),
  deputyInfo: layout(808, 2128, 1404, 90, 34, { lineHeight: 1.5 }),
};

export const TIN_DEFAULTS: TINSnapshot = {
  tinNo: '1234567890',
  taxpayerName: 'Md. Riyad Sarkar (DEMO)',
  dob: '01 January 1990',
  fatherName: 'Md. Abdul Karim (DEMO)',
  motherName: 'Rahila Begum (DEMO)',
  currentAddress: 'House 12, Road 5, Dhanmondi, Dhaka-1205 (DEMO)',
  permanentAddress: "Village: Demo Para, Post: Demo, Thana: Teknaf, District: Cox's Bazar (DEMO)",
  previousTin: '0987654321',
  status: 'Active',
  taxZone: 'Dhaka Zone-1',
  taxCircle: 'Circle-153 (Demo)',
  date: '13 August 2026',
  deputyInfo: 'Deputy Commissioner of Taxes (DEMO) — Office of the DCT, Dhaka Zone-1',
  layouts: defaultLayouts,
  qrSize: 440,
  qrX: 240,
  qrY: 2360,
};

/** Static labels rendered on the document (not editable) — original DEMO layout. */
export const TIN_LABELS: Record<TinFieldKey, string> = {
  tinNo: 'TIN Number',
  taxpayerName: 'Taxpayer Name',
  dob: 'Date of Birth',
  fatherName: "Father's Name",
  motherName: "Mother's Name",
  currentAddress: 'Current Address',
  permanentAddress: 'Permanent Address',
  previousTin: 'Previous TIN',
  status: 'Status',
  taxZone: 'Tax Zone',
  taxCircle: 'Tax Circle',
  date: 'Date',
  deputyInfo: 'Deputy / Office Information',
};

export const TIN_LAYOUT_RANGES: Record<'fontSize' | 'x' | 'y' | 'width' | 'height' | 'lineHeight', Omit<SliderSpec, 'key'>> = {
  fontSize: { label: 'Font Size', min: 10, max: 120, default: 40, mono: true },
  x: { label: 'X', min: 0, max: 2480, default: 808, mono: true },
  y: { label: 'Y', min: 0, max: 3508, default: 600, mono: true },
  width: { label: 'Width', min: 60, max: 2480, default: 1404, mono: true },
  height: { label: 'Height', min: 24, max: 3508, default: 58, mono: true },
  lineHeight: { label: 'Line Height', min: 0.8, max: 2.5, step: 0.05, default: 1.4, mono: true },
};

export const TIN_QR_SLIDERS: SliderSpec[] = [
  { key: 'qrSize', label: 'QR Size', min: 80, max: 1200, default: 440, mono: true },
  { key: 'qrX', label: 'QR X', min: 0, max: 2480, default: 240, mono: true },
  { key: 'qrY', label: 'QR Y', min: 0, max: 3508, default: 2360, mono: true },
];

export function tinTextValue(snap: TINSnapshot, key: TinFieldKey): string {
  return snap[key];
}
