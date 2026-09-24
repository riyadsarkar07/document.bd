import {
  BUG_BROWSER_MAX,
  BUG_CODE_MAX,
  BUG_COMPONENT_MAX,
  BUG_ENDPOINT_MAX,
  BUG_KINDS,
  BUG_MESSAGE_MAX,
  BUG_ROUTE_MAX,
  BUG_STACK_MAX,
  isBugKind,
  type BugKind,
  type BugReportDraft,
} from '@/lib/bug-hunter/types';

const SENSITIVE_KEY =
  /^(authorization|cookie|set-cookie|x-api-key|api[-_]?key|apikey|access[-_]?token|refresh[-_]?token|id[-_]?token|token|jwt|password|passwd|secret|private[-_]?key|service[-_]?role|service[-_]?key|x-supabase-key|sb-access-token|sb-refresh-token|card[-_]?number|cvv|cvc|pin)$/i;

const SENSITIVE_ASSIGN =
  /(?:password|passwd|secret|token|jwt|bearer|api[_-]?key|apikey|authorization|service[_-]?role|service[_-]?key|private[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|card[_-]?number|cvv|cvc|pin)\s*[=:]\s*([^\s&;,]+)/gi;

const SENSITIVE_QUERY =
  /([?&](?:password|passwd|secret|token|jwt|api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|id[_-]?token|authorization|key|auth)=)[^&]*/gi;

const SENSITIVE_JSON =
  /"(password|passwd|secret|token|jwt|api[_-]?key|apikey|authorization|service[_-]?role|service[_-]?key|private[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|card[_-]?number|cvv|cvc|pin)"\s*:\s*"(?:\\.|[^"\\])*"/gi;

const JWT_RE = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

const BEARER_RE = /Bearer\s+\S+/gi;

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key.trim());
}

export function redactSensitive(value: string, max = BUG_STACK_MAX): string {
  if (!value) return '';
  let text = String(value);
  JWT_RE.lastIndex = 0;
  BEARER_RE.lastIndex = 0;
  SENSITIVE_JSON.lastIndex = 0;
  SENSITIVE_ASSIGN.lastIndex = 0;
  SENSITIVE_QUERY.lastIndex = 0;
  text = text.replace(JWT_RE, '[REDACTED_JWT]');
  text = text.replace(BEARER_RE, 'Bearer [REDACTED]');
  text = text.replace(SENSITIVE_JSON, '"$1":"[REDACTED]"');
  text = text.replace(SENSITIVE_ASSIGN, (full, val: string) => full.slice(0, full.length - String(val).length) + '[REDACTED]');
  text = text.replace(SENSITIVE_QUERY, '$1[REDACTED]');
  if (text.length > max) text = text.slice(0, max);
  return text;
}

export function sanitizeUrl(raw: string, max = BUG_ENDPOINT_MAX): string {
  if (!raw) return '';
  let url = String(raw).trim();
  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'https://studio.local');
    const params = parsed.searchParams;
    const keys = Array.from(params.keys());
    for (const key of keys) {
      if (isSensitiveKey(key) || /token|secret|key|auth|jwt|password/i.test(key)) {
        params.set(key, '[REDACTED]');
      } else {
        params.set(key, redactSensitive(params.get(key) ?? '', 80));
      }
    }
    url = parsed.pathname + (parsed.search ? parsed.search : '');
  } catch {
    url = redactSensitive(url, max);
  }
  return redactSensitive(url, max);
}

export function sanitizeHeaders(headers: Record<string, string> | Headers | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  const entries: Array<[string, string]> =
    typeof (headers as Headers).forEach === 'function'
      ? Array.from((headers as Headers).entries())
      : Object.entries(headers as Record<string, string>);
  for (const [key, value] of entries) {
    if (isSensitiveKey(key)) {
      out[key.toLowerCase()] = '[REDACTED]';
    } else {
      out[key.toLowerCase()] = redactSensitive(String(value ?? ''), 120);
    }
  }
  return out;
}

export function clip(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.replace(/\u0000/g, '').trim();
  if (!trimmed) return '';
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export function sanitizeUserAgent(value: string | null | undefined): string | null {
  const text = clip(value, BUG_BROWSER_MAX);
  return text ? redactSensitive(text, BUG_BROWSER_MAX) : null;
}

export function normalizeMessage(message: string): string {
  return clip(message, BUG_MESSAGE_MAX)
    .toLowerCase()
    .replace(UUID_RE, '{id}')
    .replace(/\b\d+\b/g, '0')
    .replace(/\s+/g, ' ')
    .slice(0, 400);
}

function asKind(value: unknown): BugKind {
  return isBugKind(value) ? value : 'exception';
}

function asStatus(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 100 && value <= 599) {
    return Math.round(value);
  }
  return null;
}

export function sanitizeDraft(input: Partial<BugReportDraft> & { message?: unknown; kind?: unknown }): BugReportDraft | null {
  const message = redactSensitive(clip(input.message, BUG_MESSAGE_MAX), BUG_MESSAGE_MAX);
  if (!message) return null;
  const kind = asKind(input.kind);
  if (!(BUG_KINDS as readonly string[]).includes(kind)) return null;
  const occurrences =
    typeof input.occurrences === 'number' && Number.isFinite(input.occurrences)
      ? Math.min(50, Math.max(1, Math.round(input.occurrences)))
      : 1;
  return {
    kind,
    message,
    stack: redactSensitive(clip(input.stack, BUG_STACK_MAX), BUG_STACK_MAX) || null,
    route: sanitizeUrl(clip(input.route, BUG_ROUTE_MAX), BUG_ROUTE_MAX) || null,
    component: clip(input.component, BUG_COMPONENT_MAX) || null,
    endpoint: sanitizeUrl(clip(input.endpoint, BUG_ENDPOINT_MAX), BUG_ENDPOINT_MAX) || null,
    httpStatus: asStatus(input.httpStatus),
    supabaseCode: clip(input.supabaseCode, BUG_CODE_MAX) || null,
    browser: sanitizeUserAgent(input.browser ?? null),
    device: clip(input.device, 80) || null,
    occurrences,
  };
}

export function containsSensitive(value: string): boolean {
  if (!value) return false;
  JWT_RE.lastIndex = 0;
  if (JWT_RE.test(value)) return true;
  JWT_RE.lastIndex = 0;
  if (/Bearer\s+[A-Za-z0-9\-._~+/]+=*/i.test(value) && !/Bearer \[REDACTED\]/i.test(value)) return true;
  if (/(password|access_token|refresh_token|service_role|api_key)\s*[=:]\s*(?!\[REDACTED\])\S+/i.test(value)) {
    return true;
  }
  return false;
}
