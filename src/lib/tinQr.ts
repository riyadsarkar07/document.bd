'use client';

import QRCode from 'qrcode';
import type { TINSnapshot } from './editor/types';

/** Readable, human-facing payload labels — never internal field keys. */
const QR_LABELS: { key: keyof TINSnapshot; label: string }[] = [
  { key: 'taxpayerName', label: "Taxpayer's Name" },
  { key: 'dob', label: 'DOB' },
  { key: 'fatherName', label: "Father's Name" },
  { key: 'motherName', label: "Mother's Name" },
  { key: 'tinNo', label: 'TIN' },
  { key: 'currentAddress', label: 'Current Address' },
  { key: 'permanentAddress', label: 'Permanent Address' },
  { key: 'taxZone', label: 'Zone' },
  { key: 'taxCircle', label: 'Circle' },
];

/**
 * Builds the payload encoded into the DEMO QR code as simple human-readable
 * plain text (`Label : value`), derived live from the current editor record.
 * Empty fields are omitted. It is NOT an official NBR verification payload.
 */
export function buildTinQrPayload(snap: TINSnapshot): string {
  const lines: string[] = [];
  for (const { key, label } of QR_LABELS) {
    const value = String(snap[key] ?? '').trim();
    if (value) lines.push(`${label} : ${value}`);
  }
  return lines.join('\n');
}

/** Renders the current record as a DEMO QR code data URL. */
export async function encodeDemoQr(
  snap: TINSnapshot,
  size = 512,
): Promise<string> {
  const payload = buildTinQrPayload(snap);
  return QRCode.toDataURL(payload, {
    width: size,
    margin: 4,
    errorCorrectionLevel: 'M',
    color: { dark: '#0b1220', light: '#ffffff' },
  });
}
