/**
 * `data.json` transformations for the publish pipeline.
 *
 * The portal's data file is a flat object keyed by TM number:
 *   { "<regNo>": { name, authority, application_date }, ... }
 *
 * These helpers operate on the *raw existing file content* so all real
 * records are preserved and the file is re-serialized server-side only.
 */

export interface PortalRecord {
  name: string;
  authority: string;
  application_date: string;
}

/** Publish-safe key pattern — matches `sanitizeRegNo` in schema.ts. */
const RECORD_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/;

/**
 * Placeholder keys the portal shipped with (e.g. ~24 duplicate `Num` rows).
 * They are not real TM numbers; dropped whenever `data.json` is rewritten.
 */
const PLACEHOLDER_KEYS = new Set(['num', 'Num', 'name', 'Name', 'number', 'Number', 'no', 'No']);

/**
 * Parse existing content and drop placeholder keys that are not real TM
 * numbers. Real numeric/alphanumeric records are always preserved.
 */
function parseRecords(dataJson: string | null): Record<string, PortalRecord> {
  const records: Record<string, PortalRecord> = dataJson ? JSON.parse(dataJson) : {};
  for (const key of Object.keys(records)) {
    if (PLACEHOLDER_KEYS.has(key) || !RECORD_KEY_RE.test(key)) delete records[key];
  }
  return records;
}

/**
 * Merge a record into the existing `data.json` content. Returns the new
 * file content (pretty-printed, trailing newline). Duplicate `regNo` keys
 * overwrite the previous record for that number.
 */
export function withRecord(
  dataJson: string | null,
  regNo: string,
  record: PortalRecord,
): string {
  const records = parseRecords(dataJson);
  records[regNo] = record;
  return JSON.stringify(records, null, 2) + '\n';
}

/**
 * Remove a record from the existing `data.json` content. Idempotent — a
 * missing key is simply not present in the output.
 */
export function withoutRecord(dataJson: string | null, regNo: string): string {
  const records = parseRecords(dataJson);
  delete records[regNo];
  return JSON.stringify(records, null, 2) + '\n';
}
