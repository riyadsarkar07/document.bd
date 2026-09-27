'use client';

import QRCode from 'qrcode';
import { isDlWarningText } from './constants/driving-license';
import type { DrivingLicenseSnapshot } from './editor/types';

/** Readable labels encoded into the QR — never internal field keys or warning copy. */
const QR_LABELS: { key: keyof DrivingLicenseSnapshot; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'dob', label: 'Date of Birth' },
  { key: 'bloodGroup', label: 'Blood Group' },
  { key: 'fatherHusband', label: 'Father / Husband' },
  { key: 'issueDate', label: 'Issue / Renewal Date' },
  { key: 'validityDate', label: 'Validity Date' },
  { key: 'refNo', label: 'Reference Number' },
  { key: 'issuingAuthority', label: 'Issuing Authority' },
];

/**
 * Builds the QR payload as structured profile text only.
 * Empty fields and explicit DEMO/SAMPLE warning lines are omitted.
 */
export function buildDrivingLicenseQrPayload(snap: DrivingLicenseSnapshot): string {
  const lines: string[] = [];
  for (const { key, label } of QR_LABELS) {
    const value = String(snap[key] ?? '').trim();
    if (!value || isDlWarningText(value)) continue;
    lines.push(`${label} : ${value}`);
  }
  return lines.join('\n');
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
