/**
 * Bug Hunter validation + security contract checks.
 *
 * Pure sanitizer/classifier tests plus schema/source-text assertions so
 * stack traces stay admin-only and clients cannot spoof bug rows.
 *
 * Run with: npm run test:bug-hunter
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyKind, classifySeverity, enrichDraft, humanReason } from '../src/lib/bug-hunter/classify';
import { bugFingerprint } from '../src/lib/bug-hunter/fingerprint';
import {
  containsSensitive,
  redactSensitive,
  sanitizeDraft,
  sanitizeHeaders,
  sanitizeUrl,
} from '../src/lib/bug-hunter/sanitize';
import {
  isBugKind,
  isBugSeverity,
  isBugStatus,
  BUG_KINDS,
  BUG_SEVERITIES,
  BUG_STATUSES,
} from '../src/lib/bug-hunter/types';

const ROOT = process.cwd();
let failures = 0;

function assert(cond: boolean, label: string) {
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.error(`  FAIL  ${label}`);
  }
}

function main() {
  console.log('\n[1] sanitization\n');
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.abc123def456ghi789jkl';
  const redactedJwt = redactSensitive(`Authorization: Bearer ${jwt}`);
  assert(redactedJwt.includes('[REDACTED]'), 'bearer token redacted');
  assert(!redactedJwt.includes(jwt), 'raw JWT removed');
  assert(redactSensitive('password=hunter2').includes('[REDACTED]'), 'password assignment redacted');
  assert(!redactSensitive('password=hunter2').includes('hunter2'), 'password value removed');
  assert(redactSensitive('{"access_token":"super-secret"}').includes('[REDACTED]'), 'json secret redacted');
  assert(sanitizeUrl('/studio/editor/tm?access_token=abc&q=ok').includes('[REDACTED]'), 'query token redacted');
  assert(sanitizeUrl('/studio/editor/tm?access_token=abc&q=ok').includes('q=ok'), 'safe query kept');
  const headers = sanitizeHeaders({ Authorization: 'Bearer abc', 'X-Request-Id': 'req-1' });
  assert(headers.authorization === '[REDACTED]', 'authorization header redacted');
  assert(headers['x-request-id'] === 'req-1', 'non-sensitive header kept');
  assert(containsSensitive(`token=${jwt}`) || containsSensitive(`Bearer ${jwt}`), 'unsanitized JWT flagged');
  assert(!containsSensitive(redactSensitive(`Bearer ${jwt}`)), 'redacted JWT not flagged');
  assert(sanitizeDraft({ kind: 'javascript', message: '' }) === null, 'empty message rejected');
  const sample = sanitizeDraft({
    kind: 'api',
    message: `Failed with password=${jwt}`,
    stack: `at foo\nAuthorization: Bearer ${jwt}`,
    route: '/studio/editor/pdf?api_key=secret',
    endpoint: 'https://example.com/rest/v1/rpc/save?token=abc',
    httpStatus: 500,
    supabaseCode: 'PGRST301',
  });
  assert(Boolean(sample), 'valid draft accepted');
  assert(Boolean(sample && !sample.message.includes(jwt) && sample.message.includes('[REDACTED]')), 'draft message sanitized');
  assert(Boolean(sample && sample.stack && !sample.stack.includes(jwt)), 'draft stack sanitized');
  assert(Boolean(sample && sample.route && sample.route.includes('[REDACTED]')), 'draft route sanitized');

  console.log('\n[2] classification + fingerprint\n');
  assert(classifyKind({ kind: 'api', httpStatus: 401, endpoint: '/auth/v1/token' }) === 'auth', '401 auth classified');
  assert(classifyKind({ kind: 'api', supabaseCode: '42501', httpStatus: 403 }) === 'rls', '42501 classified as RLS');
  assert(classifyKind({ kind: 'api', endpoint: '/rest/v1/rpc/save_unhcr' }) === 'rpc', 'rpc endpoint classified');
  assert(classifyKind({ kind: 'exception', message: 'pdf-lib failed to embed page' }) === 'pdf', 'pdf message classified');
  assert(classifyKind({ kind: 'exception', message: 'History save failed' }) === 'save', 'save message classified');
  assert(classifySeverity({ kind: 'auth' }) === 'critical', 'auth is critical');
  assert(classifySeverity({ kind: 'rls' }) === 'critical', 'rls is critical');
  assert(classifySeverity({ kind: 'supabase', httpStatus: 500 }) === 'high', 'supabase 500 is high');
  assert(classifySeverity({ kind: 'javascript' }) === 'medium', 'js error is medium');
  assert(humanReason({ kind: 'rls' }).toLowerCase().includes('row-level'), 'rls reason is human readable');
  const a = enrichDraft({
    kind: 'javascript',
    message: 'Intentional Bug Hunter test error',
    route: '/studio/editor/tm',
    component: 'certificate-editor',
  });
  const b = enrichDraft({
    kind: 'javascript',
    message: 'Intentional Bug Hunter test error',
    route: '/studio/editor/tm',
    component: 'other',
  });
  assert(a.title.includes('Intentional Bug Hunter test error'), 'intentional test error captured in title');
  assert(a.reason.length > 10, 'reason populated');
  assert(bugFingerprint(a) === bugFingerprint(b), 'identical errors share fingerprint');
  const c = enrichDraft({
    kind: 'javascript',
    message: 'A different error',
    route: '/studio/editor/tm',
  });
  assert(bugFingerprint(a) !== bugFingerprint(c), 'different messages get different fingerprints');
  assert(isBugKind('pdf') && isBugStatus('investigating') && isBugSeverity('critical'), 'enums recognized');
  assert(BUG_KINDS.length === 12 && BUG_STATUSES.length === 4 && BUG_SEVERITIES.length === 4, 'enum counts');

  console.log('\n[3] schema security contract\n');
  const schema = readFileSync(join(ROOT, 'supabase/schema.sql'), 'utf8');
  assert(schema.includes('create table if not exists public.bug_reports'), 'bug_reports table exists');
  assert(schema.includes('create table if not exists public.bug_report_counters'), 'bug number counter exists');
  assert(schema.includes("'BUG-' || stamp || '-' || lpad(n::text, 4, '0')"), 'server-generated BUG-YYYYMMDD-XXXX');
  assert(schema.includes('create or replace function public.ingest_bug_report'), 'ingest RPC exists');
  assert(schema.includes('create or replace function public.update_bug_report_status'), 'status RPC exists');
  assert(schema.includes('create or replace function public.clear_resolved_bug_reports'), 'clear RPC exists');
  assert(schema.includes('create or replace function public.bug_hunter_summary'), 'summary RPC exists');
  assert(schema.includes('fingerprint text not null unique'), 'fingerprint unique for dedup');
  assert(schema.includes('occurrence_count int not null default 1'), 'occurrence count stored');
  assert(schema.includes('on conflict (fingerprint) do update'), 'identical errors upsert');
  assert(schema.includes('set occurrence_count = public.bug_reports.occurrence_count + occ'), 'occurrence increments');
  assert(schema.includes("when public.bug_reports.status = 'resolved' then 'new'"), 'resolved fingerprints reopen on recurrence');
  assert(schema.includes("when public.bug_reports.status = 'ignored' then 'ignored'"), 'ignored fingerprints stay ignored');
  assert(schema.includes("and b.status in ('new', 'investigating')"), 'frequent list counts only open bugs');
  assert(/limit 5\s*\) ranked/.test(schema), 'frequent subquery aliases as ranked after limit 5');
  assert(!/limit 5\)/.test(schema), 'frequent subquery has no extra paren after limit 5');
  assert(schema.includes('uid := auth.uid()'), 'ingest locks actor to auth.uid()');
  assert(!/ingest_bug_report[\s\S]{0,400}p_user_id/.test(schema), 'ingest RPC has no client user_id argument');
  assert(schema.includes("create policy \"bug_reports_admin_select\"") && schema.includes('for select using (public.is_admin())'), 'select is admin-only');
  assert(schema.includes('for insert with check (false)'), 'direct insert denied');
  assert(schema.includes('for update using (false)'), 'direct update denied');
  assert(schema.includes('for delete using (false)'), 'direct delete denied');
  assert(/create or replace function public.update_bug_report_status[\s\S]*if not public.is_admin\(\) then/.test(schema), 'status RPC is admin-only');
  assert(/create or replace function public.clear_resolved_bug_reports[\s\S]*if not public.is_admin\(\) then/.test(schema), 'clear RPC is admin-only');
  assert(/create or replace function public.bug_hunter_summary[\s\S]*where public.is_admin\(\)/.test(schema), 'summary RPC is admin-only');
  assert(schema.includes('grant select on table public.bug_reports to authenticated'), 'authenticated may select (RLS still admin)');
  assert(schema.includes('alter publication supabase_realtime add table public.bug_reports'), 'realtime on bug_reports');
  assert(schema.includes("status in ('new', 'investigating', 'resolved', 'ignored')"), 'status enum stored');

  console.log('\n[4] app wiring\n');
  const sidebar = readFileSync(join(ROOT, 'src/components/layout/sidebar.tsx'), 'utf8');
  const layout = readFileSync(join(ROOT, 'src/app/studio/layout.tsx'), 'utf8');
  const root = readFileSync(join(ROOT, 'src/app/layout.tsx'), 'utf8');
  const page = readFileSync(join(ROOT, 'src/app/studio/bug-hunter/page.tsx'), 'utf8');
  const ingest = readFileSync(join(ROOT, 'src/app/api/bug-hunter/ingest/route.ts'), 'utf8');
  const capture = readFileSync(join(ROOT, 'src/lib/bug-hunter/capture.ts'), 'utf8');
  const api = readFileSync(join(ROOT, 'src/lib/support/api.ts'), 'utf8');
  const hunterApi = readFileSync(join(ROOT, 'src/lib/bug-hunter/api.ts'), 'utf8');
  const access = readFileSync(join(ROOT, 'src/lib/workspace/access.ts'), 'utf8');
  const vault = readFileSync(join(ROOT, 'src/lib/workspace/vault.ts'), 'utf8');
  const pdf = readFileSync(join(ROOT, 'src/app/studio/editor/pdf/page.tsx'), 'utf8');

  assert(sidebar.includes("/studio/bug-hunter") && sidebar.includes('Bug Hunter'), 'sidebar link present');
  assert(sidebar.includes("section: 'ADMIN TOOLS'"), 'ADMIN TOOLS section present');
  assert(sidebar.includes('admin: true') && sidebar.includes('Bug Hunter'), 'Bug Hunter is admin-flagged');
  assert(layout.includes('/studio/bug-hunter'), 'studio layout treats Bug Hunter as admin route');
  assert(root.includes('BugHunterProvider'), 'root layout installs capture');
  assert(page.includes('AdminGuard'), 'page wrapped in AdminGuard');
  assert(page.includes('Mark Investigating') && page.includes('Mark Resolved') && page.includes('Ignore'), 'status actions exist');
  assert(page.includes('Clear resolved') && page.includes('Copy details') && page.includes('Refresh'), 'admin actions exist');
  assert(page.includes('Critical') && page.includes('Open bugs') && page.includes('Most frequent'), 'dashboard summary exists');
  assert(ingest.includes("rpc('ingest_bug_report'") && ingest.includes('sanitizeDraft'), 'ingest re-validates server-side');
  assert(ingest.includes('sb.auth.getUser') && ingest.includes('rateLimit'), 'ingest authenticates and rate-limits');
  assert(!ingest.includes('p_user_id') && !ingest.includes('user_id:'), 'ingest never accepts client user_id');
  assert(capture.includes('unhandledrejection') && capture.includes("addEventListener('error'"), 'runtime + promise capture');
  assert(capture.includes('window.fetch') && capture.includes('FLUSH_MS'), 'fetch capture + batching');
  assert(capture.includes('ensureFreshAccessToken'), 'ingest flush uses a refreshed JWT, not a known-expired cache');
  assert(capture.includes('shouldDrop') && capture.includes('fingerprint'), 'session-level dedup');
  assert(capture.includes("u.includes('/api/bug-hunter')") && capture.includes('isIgnoredUrl'), 'ingest URLs are not captured');
  assert(capture.includes('isSelfNoise'), 'Bug Hunter does not self-report ingest/monitoring noise');
  assert(ingest.includes("endpoint.includes('/api/bug-hunter')") && ingest.includes('bug_hunter_summary'), 'ingest API drops self-referential reports');
  assert(page.includes('Open bugs') && page.includes('Resolved'), 'Active/Open vs Resolved counters exist');
  const clientSrc = readFileSync(join(ROOT, 'src/lib/supabase/client.ts'), 'utf8');
  assert(clientSrc.includes('ensureFreshAccessToken'), 'data client refreshes before PostgREST Authorization');
  assert(clientSrc.includes('isAccessTokenFresh'), 'known-expired JWTs are never returned as bearer tokens');
  assert(classifyKind({ kind: 'api', httpStatus: 401, supabaseCode: 'PGRST303', endpoint: '/rest/v1/templates' }) === 'auth', 'PGRST303 JWT-expired still classified as auth');
  assert(classifySeverity({ kind: 'auth', httpStatus: 401, supabaseCode: 'PGRST303' }) === 'critical', 'genuine JWT-expired reports stay critical');
  assert(hunterApi.includes("rpc('update_bug_report_status'") && hunterApi.includes("rpc('clear_resolved_bug_reports'"), 'admin RPCs used');
  assert(hunterApi.includes('bug_reports') && hunterApi.includes('subscribeBugHunter'), 'admin list + realtime');
  assert(!access.includes("'bug-hunter'") && !access.includes("'bug_hunter'"), 'not gated by allowed_tools');
  assert(vault.includes("kind: 'save'") && pdf.includes("kind: 'pdf'"), 'save and PDF failures reported');
  assert(!api.includes('bug_reports'), 'support API does not write bug rows');
  assert(!page.includes('password') && !page.includes('access_token'), 'admin UI does not render secrets');

  if (failures) {
    console.error(`\n${failures} bug hunter check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll bug hunter checks passed.\n');
}

main();
