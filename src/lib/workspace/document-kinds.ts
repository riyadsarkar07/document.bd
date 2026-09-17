/**
 * Unified History document kinds.
 *
 * Every Studio editor saves into the same Cloud Vault (`certificates` table).
 * A record's `docKind` is embedded in the packed `details` payload so History
 * can label the row and reopen it in the exact editor that produced it.
 *
 * This module is dependency-free so it can be imported from both the vault
 * layer and the UI without creating an import cycle.
 */

export type DocumentKind =
  | 'tm'
  | 'youtube-trademark'
  | 'nid'
  | 'tin'
  | 'pdf'
  | 'page-recover'
  | 'business-manager';

/** Mirrors the `Badge` component tones without importing UI into the data layer. */
export type DocumentBadgeTone = 'gold' | 'blue' | 'red' | 'green' | 'violet' | 'muted' | 'warning';

export interface DocumentKindMeta {
  kind: DocumentKind;
  /** Full human label, e.g. "TM Certificate". */
  label: string;
  /** Compact badge label, e.g. "TM". */
  short: string;
  /** Studio editor route that owns and reopens this document. */
  editorPath: string;
  badgeTone: DocumentBadgeTone;
  /** Prefix used when generating a stable record id. */
  recordPrefix: string;
  /** Whether History renders the record as a TM certificate image. */
  certificate: boolean;
}

export const DOCUMENT_KINDS: Record<DocumentKind, DocumentKindMeta> = {
  tm: {
    kind: 'tm',
    label: 'TM Certificate',
    short: 'TM',
    editorPath: '/studio/editor/tm',
    badgeTone: 'gold',
    recordPrefix: 'TM',
    certificate: true,
  },
  'youtube-trademark': {
    kind: 'youtube-trademark',
    label: 'YouTube Trademark',
    short: 'YouTube',
    editorPath: '/studio/editor/youtube-trademark',
    badgeTone: 'red',
    recordPrefix: 'YT',
    certificate: true,
  },
  nid: {
    kind: 'nid',
    label: 'NID Card',
    short: 'NID',
    editorPath: '/studio/editor/nid',
    badgeTone: 'blue',
    recordPrefix: 'NID',
    certificate: false,
  },
  tin: {
    kind: 'tin',
    label: 'TIN Record',
    short: 'TIN',
    editorPath: '/studio/editor/tin',
    badgeTone: 'green',
    recordPrefix: 'TIN',
    certificate: false,
  },
  pdf: {
    kind: 'pdf',
    label: 'PDF Document',
    short: 'PDF',
    editorPath: '/studio/editor/pdf',
    badgeTone: 'violet',
    recordPrefix: 'PDF',
    certificate: false,
  },
  'page-recover': {
    kind: 'page-recover',
    label: 'Hacked Page Recover',
    short: 'Recover',
    editorPath: '/studio/editor/page-recover',
    badgeTone: 'warning',
    recordPrefix: 'RECOVER',
    certificate: false,
  },
  'business-manager': {
    kind: 'business-manager',
    label: 'Business Manager Access',
    short: 'Business',
    editorPath: '/studio/editor/business-manager',
    badgeTone: 'violet',
    recordPrefix: 'BM',
    certificate: false,
  },
};

/** Stable display order for filters / menus. */
export const DOCUMENT_KIND_ORDER: DocumentKind[] = [
  'tm',
  'youtube-trademark',
  'nid',
  'tin',
  'pdf',
  'page-recover',
  'business-manager',
];

export function isDocumentKind(value: unknown): value is DocumentKind {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(DOCUMENT_KINDS, value);
}

/** Metadata for a record's kind; unknown/legacy rows fall back to TM. */
export function documentKindMeta(kind: DocumentKind | undefined | null): DocumentKindMeta {
  if (kind && isDocumentKind(kind)) return DOCUMENT_KINDS[kind];
  return DOCUMENT_KINDS.tm;
}

/**
 * Generate a stable, collision-resistant record id for editors whose content
 * has no natural key (PDF, service records). Callers persist the returned id so
 * subsequent saves update the same vault row instead of creating a new one.
 */
export function newRecordId(kind: DocumentKind): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${DOCUMENT_KINDS[kind].recordPrefix}-${random}`;
}
