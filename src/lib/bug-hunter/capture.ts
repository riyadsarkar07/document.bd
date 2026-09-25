'use client';

import { ensureFreshAccessToken } from '@/lib/supabase/client';
import { enrichDraft } from '@/lib/bug-hunter/classify';
import { bugFingerprint } from '@/lib/bug-hunter/fingerprint';
import { sanitizeDraft, sanitizeUrl } from '@/lib/bug-hunter/sanitize';
import type { BugKind, BugReportDraft } from '@/lib/bug-hunter/types';

const FLUSH_MS = 900;
const MAX_QUEUE = 40;
const SESSION_SEEN = new Map<string, { count: number; last: number }>();
const SESSION_WINDOW_MS = 15_000;
const SESSION_MAX = 80;

let queued: Array<ReturnType<typeof enrichDraft> & { fingerprint: string }> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let installed = false;
let originalFetch: typeof fetch | null = null;
let originalConsoleError: typeof console.error | null = null;

function currentRoute(): string | null {
  if (typeof window === 'undefined') return null;
  return sanitizeUrl(`${window.location.pathname}${window.location.search}`, 300) || window.location.pathname;
}

function browserInfo(): string | null {
  if (typeof navigator === 'undefined') return null;
  return navigator.userAgent || null;
}

function deviceInfo(): string | null {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|Android/i.test(ua)) return 'mobile';
  if (/Macintosh|Windows|Linux/i.test(ua)) return 'desktop';
  return 'unknown';
}

function shouldDrop(fingerprint: string): boolean {
  const now = Date.now();
  const prev = SESSION_SEEN.get(fingerprint);
  if (SESSION_SEEN.size > SESSION_MAX) {
    SESSION_SEEN.forEach((value, key) => {
      if (now - value.last > SESSION_WINDOW_MS * 4) SESSION_SEEN.delete(key);
    });
  }
  if (prev && now - prev.last < SESSION_WINDOW_MS) {
    prev.count += 1;
    prev.last = now;
    return prev.count > 3;
  }
  SESSION_SEEN.set(fingerprint, { count: 1, last: now });
  return false;
}

function isAbortError(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === 'object' && err && 'name' in err && (err as { name: string }).name === 'AbortError') {
    return true;
  }
  const msg = messageFromUnknown(err).toLowerCase();
  return msg.includes('the operation was aborted') || msg.includes('aborterror') || msg.includes('signal is aborted');
}

function isOrphanFetchNoise(raw: Partial<BugReportDraft>): boolean {
  if (raw.endpoint) return false;
  const msg = (raw.message ?? '').toLowerCase();
  return /failed to fetch|networkerror|load failed|the operation was aborted|aborterror/.test(msg);
}

function isSelfNoise(raw: Partial<BugReportDraft>): boolean {
  const endpoint = raw.endpoint ?? '';
  if (endpoint && isIgnoredUrl(endpoint)) return true;
  if (isOrphanFetchNoise(raw)) return true;
  const message = raw.message ?? '';
  return /\/api\/bug-hunter|ingest_bug_report|bug_hunter_summary/i.test(message);
}

function enqueue(raw: Partial<BugReportDraft>): void {
  try {
    if (isSelfNoise(raw)) return;
    const draft = sanitizeDraft({
      ...raw,
      route: raw.route ?? currentRoute(),
      browser: raw.browser ?? browserInfo(),
      device: raw.device ?? deviceInfo(),
    });
    if (!draft) return;
    const enriched = enrichDraft(draft);
    const fingerprint = bugFingerprint(enriched);
    if (shouldDrop(fingerprint)) return;
    const existing = queued.find((item) => item.fingerprint === fingerprint);
    if (existing) {
      existing.occurrences = (existing.occurrences ?? 1) + (enriched.occurrences ?? 1);
      return;
    }
    if (queued.length >= MAX_QUEUE) queued.shift();
    queued.push({ ...enriched, fingerprint });
    scheduleFlush();
  } catch {
    // Capture must never throw into the host application.
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushQueue();
  }, FLUSH_MS);
}

async function flushQueue(): Promise<void> {
  if (!queued.length) return;
  const batch = queued.splice(0, queued.length);
  const token = await ensureFreshAccessToken();
  if (!token) return;
  try {
    await fetch('/api/bug-hunter/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reports: batch }),
      keepalive: true,
    }).catch(() => null);
  } catch {
    // Best-effort. Drop the batch rather than retry forever.
  }
}

function messageFromUnknown(value: unknown): string {
  if (!value) return 'Unknown error';
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message || value.name || 'Error';
  if (typeof value === 'object' && value && 'message' in value && typeof (value as { message: unknown }).message === 'string') {
    return (value as { message: string }).message;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function stackFromUnknown(value: unknown): string | null {
  if (value instanceof Error && value.stack) return value.stack;
  if (typeof value === 'object' && value && 'stack' in value && typeof (value as { stack: unknown }).stack === 'string') {
    return (value as { stack: string }).stack;
  }
  return null;
}

function isIgnoredUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes('/api/bug-hunter') ||
    u.includes('/rest/v1/rpc/ingest_bug_report') ||
    u.includes('/rpc/ingest_bug_report') ||
    u.includes('/rest/v1/rpc/bug_hunter_summary') ||
    u.includes('/rpc/bug_hunter_summary') ||
    u.includes('/rest/v1/rpc/update_bug_report_status') ||
    u.includes('/rest/v1/rpc/clear_resolved_bug_reports') ||
    /\/rest\/v1\/bug_reports(?:\?|$)/.test(u)
  );
}

function kindFromFailedRequest(url: string, status: number, bodySnippet: string): BugKind {
  const lower = `${url} ${bodySnippet}`.toLowerCase();
  if (url.includes('/auth/v1') || status === 401) return 'auth';
  if (status === 403 || /row-level security|permission denied|42501/.test(lower)) return 'rls';
  if (url.includes('/rest/v1/rpc/') || url.includes('/rpc/')) return 'rpc';
  if (url.includes('supabase.co') || url.includes('/rest/v1/')) return 'supabase';
  if (/pdf|render|export/.test(lower)) return 'pdf';
  if (/save|history|vault/.test(lower)) return 'save';
  return status ? 'api' : 'network';
}

async function inspectFailedResponse(res: Response, url: string): Promise<void> {
  if (res.ok || isIgnoredUrl(url)) return;
  let snippet = '';
  try {
    const clone = res.clone();
    snippet = (await clone.text()).slice(0, 400);
  } catch {
    snippet = '';
  }
  let supabaseCode: string | null = null;
  try {
    const parsed = JSON.parse(snippet) as { code?: string; error?: string; message?: string };
    if (typeof parsed.code === 'string') supabaseCode = parsed.code;
    if (!snippet && typeof parsed.message === 'string') snippet = parsed.message;
    if (!snippet && typeof parsed.error === 'string') snippet = parsed.error;
  } catch {
    // not JSON
  }
  reportCapturedError({
    kind: kindFromFailedRequest(url, res.status, snippet),
    message: snippet || `Request failed with HTTP ${res.status}`,
    endpoint: url,
    httpStatus: res.status,
    supabaseCode,
  });
}

function patchFetch(): void {
  if (typeof window === 'undefined' || originalFetch) return;
  originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    try {
      const res = await originalFetch!(input, init);
      if (!res.ok) void inspectFailedResponse(res, url);
      return res;
    } catch (err) {
      if (!isIgnoredUrl(url) && !isAbortError(err)) {
        reportCapturedError({
          kind: 'network',
          message: messageFromUnknown(err),
          stack: stackFromUnknown(err),
          endpoint: url,
        });
      }
      throw err;
    }
  };
}

function onWindowError(event: ErrorEvent): void {
  const target = event.target;
  if (target && target !== window && 'tagName' in (target as Element)) {
    const el = target as HTMLElement;
    const src = (el as HTMLImageElement).src || (el as HTMLScriptElement).src || '';
    reportCapturedError({
      kind: 'load',
      message: `Failed to load ${el.tagName.toLowerCase()}${src ? `: ${src}` : ''}`,
      component: el.tagName.toLowerCase(),
    });
    return;
  }
  reportCapturedError({
    kind: 'javascript',
    message: event.message || messageFromUnknown(event.error),
    stack: stackFromUnknown(event.error) || event.filename || null,
    component: event.filename ? event.filename.split('/').pop() ?? null : null,
  });
}

function onUnhandledRejection(event: PromiseRejectionEvent): void {
  reportCapturedError({
    kind: 'promise',
    message: messageFromUnknown(event.reason),
    stack: stackFromUnknown(event.reason),
  });
}

function patchConsoleError(): void {
  if (typeof console === 'undefined' || originalConsoleError) return;
  originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    originalConsoleError?.(...args);
    const first = args[0];
    const text = args.map((arg) => messageFromUnknown(arg)).join(' ').slice(0, 500);
    if (!text) return;
    if (/bug hunter|bug-hunter/i.test(text)) return;
    if (/failed to fetch|networkerror|the operation was aborted|aborterror/i.test(text)) return;
    reportCapturedError({
      kind: 'exception',
      message: text,
      stack: stackFromUnknown(first),
    });
  };
}

export function reportCapturedError(raw: Partial<BugReportDraft>): void {
  enqueue(raw);
}

export function installBugHunter(): () => void {
  if (typeof window === 'undefined') return () => {};
  if (installed) return uninstallBugHunter;
  installed = true;
  window.addEventListener('error', onWindowError, true);
  window.addEventListener('unhandledrejection', onUnhandledRejection);
  patchFetch();
  patchConsoleError();
  return uninstallBugHunter;
}

export function uninstallBugHunter(): void {
  if (!installed || typeof window === 'undefined') return;
  installed = false;
  window.removeEventListener('error', onWindowError, true);
  window.removeEventListener('unhandledrejection', onUnhandledRejection);
  if (originalFetch) {
    window.fetch = originalFetch;
    originalFetch = null;
  }
  if (originalConsoleError) {
    console.error = originalConsoleError;
    originalConsoleError = null;
  }
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

export function __bugHunterTestReset(): void {
  queued = [];
  SESSION_SEEN.clear();
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}
