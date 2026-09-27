'use client';

import QRCode from 'qrcode';
import type { DrivingLicenseSnapshot } from './editor/types';
import { DL_DEMO_NOTE } from './constants/driving-license';

/** Readable labels encoded into the DEMO QR — never internal field keys. */
const QR_LABELS: { key: keyof DrivingLicenseSnapshot; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'dob', label: 'Date of Birth' },
  { key: 'issueDate', label: 'Issue / Renewal Date' },
  { key: 'validityDate', label: 'Validity Date' },
  { key: 'refNo', label: 'Reference Number' },
];

/**
 * Builds the DEMO QR payload as human-readable plain text.
 * Empty fields are omitted. This is NOT an official verification code.
 */
export function buildDrivingLicenseQrPayload(snap: DrivingLicenseSnapshot): string {
  const lines: string[] = [DL_DEMO_NOTE, ''];
  for (const { key, label } of QR_LABELS) {
    const value = String(snap[key] ?? '').trim();
    if (value) lines.push(`${label} : ${value}`);
  }
  return lines.join('\n').trimEnd();
}

/** Renders the current DEMO record as a QR code data URL. */
export async function encodeDrivingLicenseQr(
  snap: DrivingLicenseSnapshot,
  size = 512,
): Promise<string> {
  const payload = buildDrivingLicenseQrPayload(snap);
  return QRCode.toDataURL(payload, {
    width: size,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#0b1220', light: '#ffffff' },
  });
}
