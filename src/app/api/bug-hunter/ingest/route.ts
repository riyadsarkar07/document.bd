import { NextResponse } from 'next/server';
import { json } from '@/lib/publish/server-auth';
import { createClient } from '@supabase/supabase-js';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { enrichDraft } from '@/lib/bug-hunter/classify';
import { bugFingerprint } from '@/lib/bug-hunter/fingerprint';
import { containsSensitive, sanitizeDraft } from '@/lib/bug-hunter/sanitize';
import type { BugReportDraft } from '@/lib/bug-hunter/types';

export const runtime = 'nodejs';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jlxccewipidsnjdzirtf.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_ozaVEDyu9IqtKRU1r_b3HA_PPlVPJyQ';

function authed(token: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function GET() {
  return json({ ok: false, error: 'Method not allowed.' }, 405, { Allow: 'POST' });
}

export async function POST(req: Request): Promise<NextResponse> {
  const ip = clientIp(req);
  const ipLimit = rateLimit(`bug-ingest-ip:${ip}`, 40, 60_000);
  if (!ipLimit.ok) {
    return json({ ok: false, error: 'Too many reports.' }, 429, {
      'Retry-After': String(ipLimit.retryAfterSec),
    });
  }

  const authz = req.headers.get('authorization') ?? '';
  const token = authz.startsWith('Bearer ') ? authz.slice('Bearer '.length) : null;
  if (!token) return json({ ok: false, error: 'Missing authorization token.' }, 401);

  const sb = authed(token);
  const {
    data: { user },
    error: userError,
  } = await sb.auth.getUser(token);
  if (userError || !user) return json({ ok: false, error: 'Invalid or expired session.' }, 401);

  const userLimit = rateLimit(`bug-ingest-user:${user.id}`, 20, 60_000);
  if (!userLimit.ok) {
    return json({ ok: false, error: 'Too many reports.' }, 429, {
      'Retry-After': String(userLimit.retryAfterSec),
    });
  }

  const { data: profile } = await sb.from('profiles').select('email, role, status').eq('id', user.id).maybeSingle();
  if (profile?.status === 'disabled') {
    return json({ ok: false, error: 'This account is suspended.' }, 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON.' }, 400);
  }

  const reports = Array.isArray((body as { reports?: unknown }).reports)
    ? ((body as { reports: unknown[] }).reports as Partial<BugReportDraft>[])
    : Array.isArray(body)
      ? (body as Partial<BugReportDraft>[])
      : [body as Partial<BugReportDraft>];

  if (reports.length === 0) return json({ ok: true, ingested: 0 });
  if (reports.length > 20) return json({ ok: false, error: 'Batch too large.' }, 400);

  const payloads = [];
  for (const raw of reports) {
    const draft = sanitizeDraft(raw);
    if (!draft) continue;
    if (containsSensitive(draft.message) || (draft.stack && containsSensitive(draft.stack))) {
      continue;
    }
    const endpoint = (draft.endpoint ?? '').toLowerCase();
    if (
      endpoint.includes('/api/bug-hunter') ||
      endpoint.includes('ingest_bug_report') ||
      endpoint.includes('bug_hunter_summary') ||
      endpoint.includes('update_bug_report_status') ||
      endpoint.includes('clear_resolved_bug_reports') ||
      /\/rest\/v1\/bug_reports(?:\?|$)/.test(endpoint)
    ) {
      continue;
    }
    const enriched = enrichDraft(draft);
    const fingerprint = bugFingerprint(enriched);
    payloads.push({
      p_fingerprint: fingerprint,
      p_kind: enriched.kind,
      p_severity: enriched.severity,
      p_title: enriched.title,
      p_message: enriched.message,
      p_reason: enriched.reason,
      p_route: enriched.route,
      p_component: enriched.component,
      p_endpoint: enriched.endpoint,
      p_http_status: enriched.httpStatus,
      p_supabase_code: enriched.supabaseCode,
      p_browser: enriched.browser,
      p_device: enriched.device,
      p_stack: enriched.stack,
      p_occurrences: enriched.occurrences ?? 1,
    });
  }

  if (!payloads.length) return json({ ok: true, ingested: 0 });

  let ingested = 0;
  for (const payload of payloads) {
    const { error } = await sb.rpc('ingest_bug_report', payload);
    if (!error) ingested += 1;
  }

  return json({ ok: true, ingested });
}
