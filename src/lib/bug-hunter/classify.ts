import {
  BUG_KIND_LABEL,
  BUG_REASON_MAX,
  BUG_TITLE_MAX,
  type BugKind,
  type BugReportDraft,
  type BugSeverity,
} from '@/lib/bug-hunter/types';

const RLS_CODES = new Set(['42501', 'PGRST301', 'PGRST103', 'PGRST116', 'PGRST301']);

const AUTH_CODES = new Set([
  'invalid_grant',
  'invalid_token',
  'session_not_found',
  'bad_jwt',
  'PGRST301',
  'PGRST303',
]);

export function classifyKind(input: {
  kind?: BugKind;
  message?: string;
  endpoint?: string | null;
  httpStatus?: number | null;
  supabaseCode?: string | null;
}): BugKind {
  if (input.kind && input.kind !== 'exception' && input.kind !== 'api') {
    return input.kind;
  }
  const message = (input.message ?? '').toLowerCase();
  const endpoint = (input.endpoint ?? '').toLowerCase();
  const code = (input.supabaseCode ?? '').trim();
  const status = input.httpStatus ?? 0;

  if (code && RLS_CODES.has(code)) return 'rls';
  if (code && AUTH_CODES.has(code)) return 'auth';
  if (status === 401 || status === 403) {
    if (endpoint.includes('/auth/')) return 'auth';
    if (code === '42501' || message.includes('row-level security') || message.includes('permission denied')) {
      return 'rls';
    }
    return status === 401 ? 'auth' : 'rls';
  }
  if (
    code === 'PGRST303' ||
    endpoint.includes('/auth/v1') ||
    message.includes('jwt') ||
    message.includes('not authenticated')
  ) {
    return 'auth';
  }
  if (endpoint.includes('/rest/v1/rpc/') || endpoint.includes('/rpc/')) return 'rpc';
  if (endpoint.includes('supabase.co') || endpoint.includes('/rest/v1/')) return 'supabase';
  if (message.includes('row-level security') || message.includes('permission denied for')) return 'rls';
  if (/\bpdf\b|jspdf|pdf-lib|pdfjs/.test(message) || endpoint.includes('/editor/pdf')) return 'pdf';
  if (/\bsave\b|\bhistory\b|vault/.test(message)) return 'save';
  if (input.kind === 'api') return 'api';
  if (status >= 400) return 'api';
  return input.kind ?? 'exception';
}

export function classifySeverity(input: {
  kind: BugKind;
  httpStatus?: number | null;
  supabaseCode?: string | null;
  message?: string;
}): BugSeverity {
  const status = input.httpStatus ?? 0;
  const code = input.supabaseCode ?? '';
  if (input.kind === 'auth' || input.kind === 'rls' || code === '42501') return 'critical';
  if (status >= 500 || input.kind === 'supabase' || input.kind === 'rpc') return 'high';
  if (input.kind === 'pdf' || input.kind === 'save') return 'high';
  if (status === 429 || status === 408) return 'medium';
  if (input.kind === 'network' || input.kind === 'load' || input.kind === 'javascript' || input.kind === 'promise') {
    return 'medium';
  }
  if (status >= 400) return 'medium';
  if (input.kind === 'api') return 'medium';
  return 'low';
}

export function humanReason(input: {
  kind: BugKind;
  httpStatus?: number | null;
  supabaseCode?: string | null;
  endpoint?: string | null;
}): string {
  const status = input.httpStatus;
  const code = input.supabaseCode;
  switch (input.kind) {
    case 'javascript':
      return 'A browser runtime exception was thrown and interrupted the current view.';
    case 'promise':
      return 'A Promise rejected without a handler. The original operation failed silently in the UI.';
    case 'api':
      return status
        ? `An application API request failed with HTTP ${status}.`
        : 'An application API request failed before a valid response was received.';
    case 'supabase':
      return code
        ? `A Supabase/database request failed (${code}).`
        : 'A Supabase/database request failed. Check the endpoint, schema, and row filters.';
    case 'auth':
      return 'The session is missing, expired, or rejected. The user may need to sign in again.';
    case 'rls':
      return 'Row-level security or a permission policy denied this query. The caller is not allowed to read or write the target row.';
    case 'rpc':
      return code
        ? `A Postgres RPC call failed (${code}).`
        : 'A Postgres RPC call failed. The function may have raised or the caller lacks EXECUTE.';
    case 'network':
      return 'The browser could not complete a network request (offline, DNS, CORS, or aborted).';
    case 'load':
      return 'A page or React component failed while rendering or loading its data.';
    case 'pdf':
      return 'PDF rendering, parsing, or export threw before the file could be generated.';
    case 'save':
      return 'Saving a document or writing History/vault state failed, so the latest edit may not be persisted.';
    default:
      return 'An unexpected application exception was captured by Bug Hunter.';
  }
}

export function bugTitle(input: { kind: BugKind; message: string; httpStatus?: number | null }): string {
  const prefix = BUG_KIND_LABEL[input.kind];
  const status = input.httpStatus ? ` HTTP ${input.httpStatus}` : '';
  const first = input.message.split('\n')[0]?.trim() || 'Unknown error';
  const title = `${prefix}${status}: ${first}`;
  return title.length > BUG_TITLE_MAX ? `${title.slice(0, BUG_TITLE_MAX - 1)}…` : title;
}

export function enrichDraft(draft: BugReportDraft): BugReportDraft & { title: string; reason: string; severity: BugSeverity; kind: BugKind } {
  const kind = classifyKind(draft);
  const severity = classifySeverity({ ...draft, kind });
  const title = bugTitle({ kind, message: draft.message, httpStatus: draft.httpStatus });
  const reason = humanReason({ kind, httpStatus: draft.httpStatus, supabaseCode: draft.supabaseCode, endpoint: draft.endpoint }).slice(
    0,
    BUG_REASON_MAX,
  );
  return { ...draft, kind, severity, title, reason };
}
