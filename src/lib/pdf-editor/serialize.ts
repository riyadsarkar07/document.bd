import type { PdfAnnotation, PdfPageMeta } from '@/lib/pdf-editor/types';

/**
 * Shape persisted in the Cloud Vault for a PDF Editor History record.
 *
 * `sourceDataUrl` holds the original uploaded PDF (base64 data URL) so the
 * record can be reopened with its editable annotation state intact, rather
 * than the flattened export where edits are baked in.
 */
export interface PdfVaultPayload {
  fileName: string;
  pages: PdfPageMeta[];
  annotations: PdfAnnotation[];
  sourceDataUrl: string | null;
}

/** Encode raw PDF bytes as a base64 data URL (chunked to avoid stack limits). */
export function bytesToPdfDataUrl(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const end = Math.min(i + chunk, bytes.length);
    let part = '';
    for (let j = i; j < end; j += 1) part += String.fromCharCode(bytes[j]);
    binary += part;
  }
  return `data:application/pdf;base64,${btoa(binary)}`;
}

const PDF_DATA_URL_PREFIX = 'data:application/pdf;base64,';

/** Decode a base64 PDF data URL back into bytes; null when malformed. */
export function pdfDataUrlToBytes(dataUrl: string): Uint8Array | null {
  if (!dataUrl.startsWith(PDF_DATA_URL_PREFIX)) return null;
  try {
    const binary = atob(dataUrl.slice(PDF_DATA_URL_PREFIX.length));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}
