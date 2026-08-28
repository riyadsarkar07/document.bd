/**
 * Server-side validation & sanitization for the publish pipeline.
 *
 * Everything that reaches the public verification portal passes through here.
 * The `regNo` is used verbatim as a `data.json` key AND as the certificate
 * filename on the target repository, so it is strictly constrained to prevent
 * path traversal or markup injection.
 */

export const DEFAULT_AUTHORITY = 'Department of Patents, Designs & Trademarks';

export interface PublishFields {
  regNo: string;
  name: string;
  authority: string;
  applicationDate: string;
  /** Full `data:image/jpeg;base64,...` data URL (publish action only). */
  imageDataUrl: string | null;
}

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/** Max raw payload accepted before we even parse it (guards the body). */
export const MAX_BODY_BYTES = 4 * 1024 * 1024;

const REG_NO_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/;
const DATE_RE = /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/(19|20)\d{2}$/;

/**
 * Normalize a raw trademark input into a publish-safe `regNo`.
 * Strips an optional `Trademark No.` prefix and surrounding whitespace.
 * Returns `null` when the value is not publishable.
 */
export function sanitizeRegNo(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const cleaned = input.trim().replace(/^Trademark\s*No\.?\s*/i, '').trim();
  if (!REG_NO_RE.test(cleaned)) return null;
  return cleaned;
}

function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [month, day, year] = value.split('/').map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function cleanText(input: unknown, maxLen: number): string | null {
  if (typeof input !== 'string') return null;
  if (/<\s*script/i.test(input)) return null;
  const value = input.replace(/<[^>]*>/g, '').trim();
  if (!value) return null;
  if (value.length > maxLen) return null;
  return value;
}

/**
 * Validate and sanitize a publish payload. Returns a discriminated result so
 * the route can respond with a precise error message.
 */
export function validatePublishPayload(
  body: Record<string, unknown>,
): { ok: true; fields: PublishFields } | { ok: false; error: string } {
  const regNo = sanitizeRegNo(body.regNo);
  if (!regNo) {
    return { ok: false, error: 'Invalid Trademark No. — use 1–32 alphanumeric characters or dashes.' };
  }

  const name = cleanText(body.name, 200);
  if (!name) {
    return { ok: false, error: 'Invalid company / brand name.' };
  }

  const authority =
    typeof body.authority === 'string' && body.authority.trim()
      ? cleanText(body.authority, 120)
      : DEFAULT_AUTHORITY;
  if (!authority) {
    return { ok: false, error: 'Invalid issuing authority.' };
  }

  const applicationDate = typeof body.applicationDate === 'string' ? body.applicationDate.trim() : '';
  if (!isValidDate(applicationDate)) {
    return { ok: false, error: 'Invalid application date — expected MM/DD/YYYY.' };
  }

  const imageDataUrl = typeof body.imageDataUrl === 'string' ? body.imageDataUrl : '';
  if (imageDataUrl) {
    if (!imageDataUrl.startsWith('data:image/jpeg;base64,')) {
      return { ok: false, error: 'Certificate must be a JPEG image.' };
    }
    const base64 = imageDataUrl.slice('data:image/jpeg;base64,'.length);
    let bytes: Buffer;
    try {
      bytes = Buffer.from(base64, 'base64');
    } catch {
      return { ok: false, error: 'Certificate image could not be decoded.' };
    }
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
      return { ok: false, error: `Certificate image must be 1 byte to ${Math.round(MAX_IMAGE_BYTES / 1024)} KB.` };
    }
    // JPEG magic bytes: FF D8 FF
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
      return { ok: false, error: 'Certificate image is not a valid JPEG.' };
    }
  } else if (!body.imageDataUrl) {
    return { ok: false, error: 'Certificate image is required.' };
  }

  return {
    ok: true,
    fields: { regNo, name, authority, applicationDate, imageDataUrl },
  };
}

/**
 * Validate an unpublish request — only the registry number is needed.
 */
export function validateUnpublishPayload(
  body: Record<string, unknown>,
): { ok: true; regNo: string } | { ok: false; error: string } {
  const regNo = sanitizeRegNo(body.regNo);
  if (!regNo) {
    return { ok: false, error: 'Invalid Trademark No.' };
  }
  return { ok: true, regNo };
}
