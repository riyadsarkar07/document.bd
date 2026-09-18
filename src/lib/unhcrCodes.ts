import QRCore from 'qrcode/lib/core/qrcode.js';
import type { UnhcrSnapshot } from './editor/types';

/** TEST-only Code 128 payload. A scan must return this string when the ID field is empty. */
export const UNHCR_BARCODE_TEST_PAYLOAD = 'TEST-UNHCR-REF-0001';

/** TEST-only QR payload. Clearly labeled sample data — not official identity. */
export const UNHCR_QR_TEST_PAYLOAD = [
  `ID: ${UNHCR_BARCODE_TEST_PAYLOAD}`,
  'Name: ',
  'DOB: ',
  'Sex: ',
  'Country: ',
  'Issued: ',
  'Expires: ',
  'Status: Valid',
].join('\n');

const START_B = 104;
const STOP = 106;
const QUIET = 10;

/**
 * Code 128 module patterns (11 modules each). Index 106 (Stop) is 13 modules.
 * Source: ISO/IEC 15417 Code 128 symbol patterns.
 */
const PATTERNS: readonly string[] = [
  '11011001100', '11001101100', '11001100110', '10010011000', '10010001100',
  '10001001100', '10011001000', '10011000100', '10001100100', '11001001000',
  '11001000100', '11000100100', '10110011100', '10011011100', '10011001110',
  '10111001100', '10011101100', '10011100110', '11001110010', '11001011100',
  '11001001110', '11011100100', '11001110100', '11101101110', '11101001100',
  '11100101100', '11100100110', '11101100100', '11100110100', '11100110010',
  '11011011000', '11011000110', '11000110110', '10100011000', '10001011000',
  '10001000110', '10110001000', '10001101000', '10001100010', '11010001000',
  '11000101000', '11000100010', '10110111000', '10110001110', '10001101110',
  '10111011000', '10111000110', '10001110110', '11101110110', '11010001110',
  '11000101110', '11011101000', '11011100010', '11011101110', '11101011000',
  '11101000110', '11100010110', '11101101000', '11101100010', '11100011010',
  '11101111010', '11001000010', '11110001010', '10100110000', '10100001100',
  '10010110000', '10010000110', '10000101100', '10000100110', '10110010000',
  '10110000100', '10011010000', '10011000010', '10000110100', '10000110010',
  '11000010010', '11001010000', '11110111010', '11000010100', '10001111010',
  '10100111100', '10010111100', '10010011110', '10111100100', '10011110100',
  '10011110010', '11110100100', '11110010100', '11110010010', '11011011110',
  '11011110110', '11110110110', '10101111000', '10100011110', '10001011110',
  '10111101000', '10111100010', '11110101000', '11110100010', '10111011110',
  '10111101110', '11101011110', '11110101110', '11010000100', '11010010000',
  '11010011100', '1100011101011',
];

function sanitizeBarcodePayload(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return UNHCR_BARCODE_TEST_PAYLOAD;
  let out = '';
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (code >= 32 && code <= 126) out += trimmed[i];
  }
  return out || UNHCR_BARCODE_TEST_PAYLOAD;
}

export function unhcrBarcodePayload(raw?: string | null): string {
  return sanitizeBarcodePayload(raw ?? UNHCR_BARCODE_TEST_PAYLOAD);
}

export function unhcrQrPayload(raw?: string | null): string {
  const trimmed = (raw ?? '').trim();
  return trimmed || UNHCR_QR_TEST_PAYLOAD;
}

function fieldText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Code 128 payload: the ID number field, or the TEST ID when empty. */
export function buildUnhcrBarcodePayload(
  snap: Pick<UnhcrSnapshot, 'unhcrNo'> | Partial<UnhcrSnapshot> | string | null | undefined,
): string {
  if (typeof snap === 'string' || snap == null) return unhcrBarcodePayload(snap);
  return unhcrBarcodePayload(fieldText(snap.unhcrNo));
}

/**
 * QR payload from identity fields, formatted as labeled plain text.
 * Empty ID falls back to the TEST reference so scans stay clearly test data.
 */
export function buildUnhcrQrPayload(
  snap: Pick<UnhcrSnapshot, 'unhcrNo' | 'name' | 'dob' | 'sex' | 'origin' | 'issuedDate' | 'expiredDate'> | Partial<UnhcrSnapshot>,
): string {
  const id = fieldText(snap.unhcrNo) || UNHCR_BARCODE_TEST_PAYLOAD;
  return [
    `ID: ${id}`,
    `Name: ${fieldText(snap.name)}`,
    `DOB: ${fieldText(snap.dob)}`,
    `Sex: ${fieldText(snap.sex)}`,
    `Country: ${fieldText(snap.origin)}`,
    `Issued: ${fieldText(snap.issuedDate)}`,
    `Expires: ${fieldText(snap.expiredDate)}`,
    'Status: Valid',
  ].join('\n');
}

export function syncUnhcrCodePayloads(snap: UnhcrSnapshot): Pick<UnhcrSnapshot, 'barcodePayload' | 'qrPayload'> {
  return {
    barcodePayload: buildUnhcrBarcodePayload(snap),
    qrPayload: buildUnhcrQrPayload(snap),
  };
}

const PATTERN_INDEX = new Map<string, number>(PATTERNS.map((pattern, i) => [pattern, i]));

/** Encodes Code 128 Subset B including quiet zones. */
export function encodeCode128Modules(payload: string): boolean[] {
  const text = unhcrBarcodePayload(payload);
  const values = [START_B];
  for (let i = 0; i < text.length; i++) {
    values.push(text.charCodeAt(i) - 32);
  }
  let sum = START_B;
  for (let i = 1; i < values.length; i++) sum += values[i] * i;
  values.push(sum % 103);
  values.push(STOP);

  const bits: boolean[] = [];
  for (let q = 0; q < QUIET; q++) bits.push(false);
  for (const value of values) {
    const pattern = PATTERNS[value];
    for (let i = 0; i < pattern.length; i++) bits.push(pattern[i] === '1');
  }
  for (let q = 0; q < QUIET; q++) bits.push(false);
  return bits;
}

function skipQuiet(bits: boolean[], i: number): number {
  while (i < bits.length && !bits[i]) i++;
  return i;
}

function readBits(bits: boolean[], start: number, len: number): string {
  let out = '';
  for (let i = 0; i < len && start + i < bits.length; i++) out += bits[start + i] ? '1' : '0';
  return out;
}

/** Decodes a Code 128 Subset B module stream back to the encoded payload string. */
export function decodeCode128Modules(bits: boolean[]): string | null {
  let i = skipQuiet(bits, 0);
  if (i >= bits.length) return null;
  const startPat = readBits(bits, i, 11);
  const startVal = PATTERN_INDEX.get(startPat);
  if (startVal !== START_B) return null;
  i += 11;
  const values = [START_B];
  while (i < bits.length) {
    const stopPat = readBits(bits, i, 13);
    if (PATTERN_INDEX.get(stopPat) === STOP) {
      i += 13;
      break;
    }
    const pat = readBits(bits, i, 11);
    const val = PATTERN_INDEX.get(pat);
    if (val === undefined) return null;
    values.push(val);
    i += 11;
  }
  if (values.length < 2) return null;
  const checksum = values[values.length - 1];
  const data = values.slice(1, -1);
  let sum = START_B;
  for (let n = 0; n < data.length; n++) sum += data[n] * (n + 1);
  if (sum % 103 !== checksum) return null;
  return data.map((v) => String.fromCharCode(v + 32)).join('');
}

export function drawUnhcrBarcode(
  ctx: CanvasRenderingContext2D,
  payload: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const width = Math.max(40, w);
  const height = Math.max(16, h);
  const modules = encodeCode128Modules(payload);
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = '#000000';
  const n = modules.length;
  for (let i = 0; i < n; i++) {
    if (!modules[i]) continue;
    const x0 = x + Math.round((i * width) / n);
    const x1 = x + Math.round(((i + 1) * width) / n);
    ctx.fillRect(x0, y, Math.max(1, x1 - x0), height);
  }
  ctx.restore();
}

/** Samples a rendered Code 128 strip at each module center. */
export function sampleBarcodeModules(
  data: Uint8ClampedArray,
  canvasWidth: number,
  x: number,
  y: number,
  w: number,
  h: number,
  moduleCount: number,
  sampleRatio = 0.5,
): boolean[] {
  const width = Math.max(40, w);
  const height = Math.max(16, h);
  const ratio = Number.isFinite(sampleRatio) ? Math.min(0.95, Math.max(0.05, sampleRatio)) : 0.5;
  const sampleY = Math.max(0, Math.round(y + height * ratio));
  const bits: boolean[] = [];
  for (let i = 0; i < moduleCount; i++) {
    const x0 = Math.round((i * width) / moduleCount);
    const x1 = Math.round(((i + 1) * width) / moduleCount);
    const px = Math.min(canvasWidth - 1, Math.max(0, Math.round(x) + (x0 === x1 ? x0 : Math.floor((x0 + x1) / 2))));
    const idx = (sampleY * canvasWidth + px) * 4;
    bits.push(data[idx] + data[idx + 1] + data[idx + 2] < 380);
  }
  return bits;
}

export interface UnhcrQrMatrix {
  size: number;
  dark: boolean[][];
}

type QrCreated = {
  modules: { size: number; get: (row: number, col: number) => boolean };
};

function createQrSymbol(payload: string): QrCreated {
  const create = (QRCore as unknown as { create: (text: string, opts?: { errorCorrectionLevel?: string }) => QrCreated }).create;
  return create(unhcrQrPayload(payload), { errorCorrectionLevel: 'M' });
}

export function createUnhcrQrMatrix(payload: string): UnhcrQrMatrix {
  const qr = createQrSymbol(payload);
  const size = qr.modules.size;
  const dark: boolean[][] = [];
  for (let row = 0; row < size; row++) {
    const line: boolean[] = [];
    for (let col = 0; col < size; col++) line.push(qr.modules.get(row, col));
    dark.push(line);
  }
  return { size, dark };
}

export function drawUnhcrQr(
  ctx: CanvasRenderingContext2D,
  payload: string,
  x: number,
  y: number,
  size: number,
): void {
  const dim = Math.max(40, size);
  const matrix = createUnhcrQrMatrix(payload);
  const quiet = 4;
  const total = matrix.size + quiet * 2;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, dim, dim);
  ctx.fillStyle = '#000000';
  for (let row = 0; row < matrix.size; row++) {
    for (let col = 0; col < matrix.size; col++) {
      if (!matrix.dark[row][col]) continue;
      const x0 = x + Math.round(((col + quiet) * dim) / total);
      const y0 = y + Math.round(((row + quiet) * dim) / total);
      const x1 = x + Math.round(((col + quiet + 1) * dim) / total);
      const y1 = y + Math.round(((row + quiet + 1) * dim) / total);
      ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
    }
  }
  ctx.restore();
}
