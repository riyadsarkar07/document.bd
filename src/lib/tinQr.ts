'use client';

import QRCode from 'qrcode';
import type { TINSnapshot } from './editor/types';
import { TIN_DEMO_NOTE } from './constants/tin';

export interface TinQrRecord {
  demo: boolean;
  app: string;
  kind: 'tin';
  note: string;
  tin: string;
  taxpayerName: string;
  dob: string;
  fatherName: string;
  motherName: string;
  currentAddress: string;
  permanentAddress: string;
  taxZone: string;
  taxCircle: string;
  status: string;
  previousTin: string;
  deputyInfo: string;
  sealText: string;
  generatedAt: string;
}

/**
 * Builds the payload encoded into the DEMO QR code. When a phone scans the QR
 * it sees this JSON record (clearly marked as a demo). It is NOT an official
 * NBR verification payload.
 */
export function buildTinQrPayload(snap: TINSnapshot, now: Date = new Date()): string {
  const record: TinQrRecord = {
    demo: true,
    app: 'document-bd',
    kind: 'tin',
    note: TIN_DEMO_NOTE,
    tin: snap.tinNo,
    taxpayerName: snap.taxpayerName,
    dob: snap.dob,
    fatherName: snap.fatherName,
    motherName: snap.motherName,
    currentAddress: snap.currentAddress,
    permanentAddress: snap.permanentAddress,
    taxZone: snap.taxZone,
    taxCircle: snap.taxCircle,
    status: snap.status,
    previousTin: snap.previousTin,
    deputyInfo: snap.deputyInfo,
    sealText: snap.sealText,
    generatedAt: now.toISOString(),
  };
  return JSON.stringify(record);
}

/** Renders the current record as a DEMO QR code data URL. */
export async function encodeDemoQr(
  snap: TINSnapshot,
  size = 512,
): Promise<string> {
  const payload = buildTinQrPayload(snap);
  return QRCode.toDataURL(payload, {
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#0b1220', light: '#ffffff' },
  });
}

/** Parses a scanned payload back into a human-readable record. */
export function parseTinQrPayload(payload: string): TinQrRecord | null {
  try {
    const parsed = JSON.parse(payload) as TinQrRecord;
    if (parsed.kind !== 'tin') return null;
    return parsed;
  } catch {
    return null;
  }
}
