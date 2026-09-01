/**
 * Publish pipeline logic verification.
 *
 * Tests the pure, dependency-free parts of the publish system:
 *   - regNo sanitization (path-traversal / markup injection guards)
 *   - publish / unpublish payload validation
 *   - data.json merge / removal (incl. normalization of the portal's
 *     placeholder `Num` keys) and duplicate-TM overwrite behavior
 *   - the server-side GitHub credential guard (no token → hard failure)
 *
 * Run with: npm run test:publish
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_AUTHORITY,
  sanitizeRegNo,
  validatePublishPayload,
  validateUnpublishPayload,
  MAX_IMAGE_BYTES,
} from '../src/lib/publish/schema';
import { withRecord, withoutRecord } from '../src/lib/publish/data';
import { githubEnv } from '../src/lib/publish/github';
import { hasToolAccess, canSelfPublish } from '../src/lib/workspace/access';
import { isGenerationLimited, generationPeriodLabel } from '../src/lib/workspace/limits';

const ROOT = process.cwd();

// 1×1 white JPEG (starts with the FFD8FF magic bytes).
const TINY_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';

// Mirrors the real portal data.json (effective records + placeholder keys).
const REAL_DATA_JSON = JSON.stringify(
  {
    '245788': { name: 'The Territorial News (TTN)', authority: DEFAULT_AUTHORITY, application_date: '08/04/2024' },
    '261027': { name: 'Otc Rajon', authority: DEFAULT_AUTHORITY, application_date: '08/12/2024' },
    Num: { name: 'Name', authority: DEFAULT_AUTHORITY, application_date: '08/12/2020' },
    '255781': { name: 'Titina Aqua Tanu', authority: DEFAULT_AUTHORITY, application_date: '08/12/2020' },
    '235792': { name: 'Trader Rajon 6', authority: DEFAULT_AUTHORITY, application_date: '08/04/2024' },
  },
  null,
  2,
);

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
  console.log('\n[1] sanitizeRegNo\n');
  assert(sanitizeRegNo('245788') === '245788', 'plain number passes');
  assert(sanitizeRegNo('  Trademark No. 261027 ') === '261027', 'strips "Trademark No." prefix');
  assert(sanitizeRegNo('A-B-C') === 'A-B-C', 'alphanumeric + dashes pass');
  assert(sanitizeRegNo('a') === 'a', 'single alphanumeric passes');
  assert(sanitizeRegNo('../../etc/passwd') === null, 'path traversal rejected');
  assert(sanitizeRegNo('245788.jpg') === null, 'dot / extension rejected');
  assert(sanitizeRegNo('12 34') === null, 'whitespace rejected');
  assert(sanitizeRegNo('<script>') === null, 'markup rejected');
  assert(sanitizeRegNo('') === null, 'empty rejected');
  assert(sanitizeRegNo('a'.repeat(32)) === 'a'.repeat(32), '32 chars allowed');
  assert(sanitizeRegNo('a'.repeat(33)) === null, '33 chars rejected');
  assert(sanitizeRegNo(123 as unknown as string) === null, 'non-string rejected');

  console.log('\n[2] validatePublishPayload\n');
  const valid = { regNo: '999999', name: 'Acme Ltd', applicationDate: '08/04/2024', imageDataUrl: TINY_JPEG };
  const r1 = validatePublishPayload(valid);
  assert(r1.ok, 'valid payload accepted');
  if (r1.ok) {
    assert(r1.fields.regNo === '999999' && r1.fields.name === 'Acme Ltd', 'fields sanitized');
    assert(r1.fields.authority === DEFAULT_AUTHORITY, 'default authority applied when omitted');
  }

  assert(!validatePublishPayload({ ...valid, regNo: '../x' }).ok, 'bad regNo rejected');
  assert(!validatePublishPayload({ ...valid, name: '' }).ok, 'empty name rejected');
  assert(!validatePublishPayload({ ...valid, name: '  <script>alert(1)</script>  ' }).ok, 'script-only name rejected');
  const withHtml = validatePublishPayload({ ...valid, name: 'Acme <b>Ltd</b>' });
  assert(withHtml.ok && withHtml.ok && withHtml.fields.name === 'Acme Ltd', 'HTML tags stripped from name');
  assert(!validatePublishPayload({ ...valid, applicationDate: '08/04/24' }).ok, '2-digit year rejected');
  assert(!validatePublishPayload({ ...valid, applicationDate: '02/30/2024' }).ok, 'impossible date (Feb 30) rejected');
  assert(!validatePublishPayload({ ...valid, applicationDate: 'not-a-date' }).ok, 'garbage date rejected');
  assert(!validatePublishPayload({ ...valid, imageDataUrl: 'data:image/png;base64,iVBORw0KGgo=' }).ok, 'PNG rejected (JPEG only)');
  assert(!validatePublishPayload({ ...valid, imageDataUrl: 'data:image/jpeg;base64,' + Buffer.from('not jpeg at all').toString('base64') }).ok, 'non-JPEG bytes rejected');
  assert(!validatePublishPayload({ ...valid, imageDataUrl: undefined }).ok, 'missing image rejected');

  const huge = Buffer.alloc(MAX_IMAGE_BYTES + 1, 0xff);
  huge[0] = 0xff; huge[1] = 0xd8; huge[2] = 0xff;
  assert(
    !validatePublishPayload({ ...valid, imageDataUrl: `data:image/jpeg;base64,${huge.toString('base64')}` }).ok,
    'oversized image rejected',
  );

  console.log('\n[3] validateUnpublishPayload\n');
  assert(validateUnpublishPayload({ regNo: '245788' }).ok, 'valid regNo accepted');
  assert(!validateUnpublishPayload({ regNo: '../x' }).ok, 'bad regNo rejected');
  assert(!validateUnpublishPayload({ regNo: undefined }).ok, 'missing regNo rejected');

  console.log('\n[4] data.json transformations\n');
  const merged = withRecord(REAL_DATA_JSON, '999999', {
    name: 'New Brand',
    authority: DEFAULT_AUTHORITY,
    application_date: '08/12/2024',
  });
  const mergedObj = JSON.parse(merged) as Record<string, { name: string }>;
  assert(mergedObj['999999']?.name === 'New Brand', 'new record added');
  assert(mergedObj['245788']?.name === 'The Territorial News (TTN)', 'existing records preserved');
  assert(!('Num' in mergedObj), 'placeholder "Num" keys normalized away');
  assert(merged.endsWith('\n'), 'file ends with trailing newline');

  const republished = withRecord(REAL_DATA_JSON, '245788', {
    name: 'TTN Media Ltd',
    authority: DEFAULT_AUTHORITY,
    application_date: '08/04/2024',
  });
  assert(JSON.parse(republished)['245788'].name === 'TTN Media Ltd', 'duplicate TM overwrites record (no dup keys)');
  assert((Object.keys(JSON.parse(republished)) as string[]).filter((k) => k === '245788').length === 1, 'exactly one key per TM number');

  const removed = withoutRecord(REAL_DATA_JSON, '245788');
  const removedObj = JSON.parse(removed) as Record<string, unknown>;
  assert(!('245788' in removedObj), 'record removed');
  assert(removedObj['255781'] !== undefined, 'other records preserved');
  const removedTwice = withoutRecord(removed, '245788');
  assert(removedTwice === removed, 'removing a missing key is idempotent');
  assert(!('Num' in JSON.parse(removed)), 'unpublish also normalizes placeholder keys');

  const fromNull = withRecord(null, '123', { name: 'x', authority: DEFAULT_AUTHORITY, application_date: '01/01/2020' });
  assert(JSON.parse(fromNull)['123'].name === 'x', 'works when data.json absent (first publish)');

  console.log('\n[5] githubEnv credential guard\n');
  const savedToken = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
  try {
    githubEnv();
    assert(false, 'githubEnv throws when GITHUB_TOKEN is unset');
  } catch (err) {
    assert(err instanceof Error && /GITHUB_TOKEN is not configured/.test(err.message), 'githubEnv throws when GITHUB_TOKEN is unset');
  }
  process.env.GITHUB_TOKEN = 'ghp_test_only';
  const env = githubEnv();
  assert(env.token === 'ghp_test_only' && env.owner === 'riyadsarkar07' && env.repo === 'dpdt-govbd-main', 'env resolved from process.env + defaults');
  if (savedToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = savedToken;

  console.log('\n[6] per-user tool access (mirrors schema.sql has_tool_access)\n');
  assert(hasToolAccess(null, 'tm') === false, 'no profile -> no access');
  assert(hasToolAccess({ role: 'admin', allowed_tools: ['nid'] }, 'tm') === true, 'admin bypasses the allowlist');
  assert(hasToolAccess({ role: 'viewer', allowed_tools: null }, 'tm') === true, 'null allowlist -> all tools');
  assert(hasToolAccess({ role: 'viewer', allowed_tools: ['nid'] }, 'nid') === true, 'allowed scope passes');
  assert(hasToolAccess({ role: 'viewer', allowed_tools: ['nid'] }, 'tm') === false, 'blocked scope fails');
  assert(hasToolAccess({ role: 'viewer', allowed_tools: [] }, 'tm') === false, 'empty allowlist -> no tools');
  assert(hasToolAccess({ role: 'editor', allowed_tools: ['tm', 'history'] }, 'projects') === false, 'editor is gated by the allowlist too');

  console.log('\n[7] user self-publish eligibility (mirrors profiles.can_self_publish)\n');
  assert(canSelfPublish({ role: 'viewer', can_self_publish: true }) === true, 'purchased viewer can self-publish');
  assert(canSelfPublish({ role: 'viewer', can_self_publish: false }) === false, 'non-purchased viewer cannot');
  assert(canSelfPublish(null) === false, 'no profile cannot self-publish');

  console.log('\n[8] generation limits (mirrors schema.sql can_generate)\n');
  assert(isGenerationLimited({ genPeriod: 'unlimited', genLimit: 5, generations: 9 }) === false, 'unlimited period ignores the cap');
  assert(isGenerationLimited({ genPeriod: 'daily', genLimit: null, generations: 9 }) === false, 'null cap -> unlimited');
  assert(isGenerationLimited({ genPeriod: 'daily', genLimit: 5, generations: 4 }) === false, 'under the cap -> allowed');
  assert(isGenerationLimited({ genPeriod: 'daily', genLimit: 5, generations: 5 }) === true, 'at the cap -> blocked');
  assert(isGenerationLimited({ genPeriod: 'weekly', genLimit: 2, generations: 3 }) === true, 'over the weekly cap -> blocked');
  assert(generationPeriodLabel('daily') === 'day', 'period label maps daily');
  assert(generationPeriodLabel('weekly') === 'week', 'period label maps weekly');
  assert(generationPeriodLabel('monthly') === 'month', 'period label maps monthly');
  assert(generationPeriodLabel(null) === 'period', 'period label falls back');

  console.log(`\n${failures === 0 ? '✓ ALL PUBLISH CHECKS PASSED' : `✗ ${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
