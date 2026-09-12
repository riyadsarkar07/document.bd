const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const PDF_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) return false;
  return sig.every((value, i) => bytes[i] === value);
}

function isJpeg(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0xff, 0xd8, 0xff]);
}

function isPng(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

function isGif(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0x47, 0x49, 0x46, 0x38]);
}

function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

function isPdf(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0x25, 0x50, 0x44, 0x46]);
}

async function sniff(file: File, n = 16): Promise<Uint8Array> {
  const buf = await file.slice(0, n).arrayBuffer();
  return new Uint8Array(buf);
}

export async function validateImageFile(
  file: File,
  opts?: { maxBytes?: number },
): Promise<string | null> {
  const maxBytes = opts?.maxBytes ?? IMAGE_MAX_BYTES;
  if (file.type && !IMAGE_TYPES.has(file.type)) {
    return 'Please choose a JPEG, PNG, WebP, or GIF image.';
  }
  if (file.size > maxBytes) {
    return `Image is larger than ${Math.round(maxBytes / (1024 * 1024))} MB.`;
  }
  const bytes = await sniff(file);
  if (isJpeg(bytes) || isPng(bytes) || isGif(bytes) || isWebp(bytes)) return null;
  return 'File content is not a valid image.';
}

export async function validatePdfFile(file: File, maxBytes: number): Promise<string | null> {
  const namedPdf = file.name.toLowerCase().endsWith('.pdf');
  if (file.type !== 'application/pdf' && !namedPdf) {
    return 'Please choose a PDF file.';
  }
  if (file.size > maxBytes) {
    return `PDF is larger than ${Math.round(maxBytes / (1024 * 1024))} MB.`;
  }
  const bytes = await sniff(file);
  if (!isPdf(bytes)) return 'File content is not a valid PDF.';
  return null;
}

export const PDF_OVERLAY_IMAGE_MAX_BYTES = PDF_IMAGE_MAX_BYTES;
