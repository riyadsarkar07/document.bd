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
import { sealedTextFromVault } from '../src/lib/publish/sealed-text';
import { layoutFromSnapshot, layoutFromVault, layoutFromVaultSources, packDetails, unpackDetails } from '../src/lib/publish/layout';
import { TM_DEFAULTS } from '../src/lib/constants/tm';
import {
  DOCUMENT_KINDS,
  DOCUMENT_KIND_ORDER,
  documentKindMeta,
  isDocumentKind,
  newRecordId,
} from '../src/lib/workspace/document-kinds';
import { PAGE_RECOVER_CONFIG, BUSINESS_MANAGER_CONFIG, normalizeServiceSnapshot } from '../src/lib/constants/services';
import { bytesToPdfDataUrl, pdfDataUrlToBytes } from '../src/lib/pdf-editor/serialize';
import {
  normalizeUnhcrSnapshot,
  UNHCR_BARCODE1_DEFAULT,
  UNHCR_BARCODE2_DEFAULT,
  UNHCR_PHOTO_DEFAULT,
  UNHCR_QR_DEFAULT,
} from '../src/lib/constants/unhcr';
import {
  normalizeUnhcrSnapshot as normalizeUnhcrS2Snapshot,
  UNHCR_TEST_BARCODE_TEXT_DEFAULT,
  UNHCR_TEST_BARCODE_TEXT_DEFAULT_VALUE,
  UNHCR_TEST_BOX_RANGES,
  UNHCR_TEST_REF_NO_DEFAULT,
  UNHCR_TEST_REF_NO_DEFAULT_VALUE,
  UNHCR_TEST_REF_NO_HEIGHT_MAX,
  syncUnhcrS2IdOverlays,
} from '../src/lib/constants/unhcr-s2';
import { UNHCR_BARCODE_TEST_PAYLOAD, UNHCR_QR_TEST_PAYLOAD } from '../src/lib/unhcrCodes';
import {
  UNHCR_CURRENT_RECORD_ID,
  isUnhcrCurrentRecordId,
  resolveUnhcrEditorLoadSource,
  snapshotFromUnhcrVaultDoc,
  unhcrHistoryRecordIdForSave,
} from '../src/lib/unhcrCurrentState';
import {
  UNHCR_S2_CURRENT_RECORD_ID,
  isUnhcrS2CurrentRecordId,
  resolveUnhcrS2EditorLoadSource,
  snapshotFromUnhcrS2VaultDoc,
  unhcrS2HistoryRecordIdForSave,
  coerceUnhcrS2CurrentRpcRow,
  coerceUnhcrS2Details,
  copyUnhcrServer1SnapshotToServer2,
  decideUnhcrS2DirectOpenAction,
} from '../src/lib/unhcrS2CurrentState';

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
  assert(hasToolAccess({ role: 'viewer', allowed_tools: ['page-recover'] }, 'page-recover') === true, 'Hacked Page Recover granted');
  assert(hasToolAccess({ role: 'viewer', allowed_tools: ['page-recover'] }, 'youtube-trademark') === false, 'Hacked Page Recover does not grant YouTube Trademark');
  assert(hasToolAccess({ role: 'viewer', allowed_tools: ['youtube-trademark'] }, 'youtube-trademark') === true, 'YouTube Trademark granted');
  assert(hasToolAccess({ role: 'viewer', allowed_tools: ['youtube-trademark'] }, 'business-manager') === false, 'YouTube Trademark does not grant Business Manager');
  assert(hasToolAccess({ role: 'viewer', allowed_tools: ['business-manager'] }, 'business-manager') === true, 'Business Manager Access granted');
  assert(hasToolAccess({ role: 'viewer', allowed_tools: ['tm'] }, 'page-recover') === false, 'TM Certificate does not grant Hacked Page Recover');
  assert(hasToolAccess({ role: 'viewer', allowed_tools: ['tm'] }, 'youtube-trademark') === false, 'TM Certificate does not grant YouTube Trademark');
  assert(hasToolAccess({ role: 'viewer', allowed_tools: ['tm'] }, 'business-manager') === false, 'TM Certificate does not grant Business Manager');
  assert(hasToolAccess({ role: 'viewer', allowed_tools: null }, 'page-recover') === true, 'null allowlist grants Hacked Page Recover');
  assert(hasToolAccess({ role: 'viewer', allowed_tools: null }, 'youtube-trademark') === true, 'null allowlist grants YouTube Trademark');
  assert(hasToolAccess({ role: 'viewer', allowed_tools: null }, 'business-manager') === true, 'null allowlist grants Business Manager');
  assert(hasToolAccess({ role: 'viewer', allowed_tools: ['pdf'] }, 'pdf') === true, 'PDF Editor granted');
  assert(hasToolAccess({ role: 'viewer', allowed_tools: ['tm'] }, 'pdf') === false, 'TM Certificate does not grant PDF Editor');
  assert(hasToolAccess({ role: 'viewer', allowed_tools: null }, 'pdf') === true, 'null allowlist grants PDF Editor');

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

  console.log('\n[9] History publish preserves saved sealed-line periods\n');
  const SAVED_SEALED = 'Sealed at my direction this ....day of....Month.......';
  assert(
    sealedTextFromVault(SAVED_SEALED, TM_DEFAULTS.sealedTextPhrase) === SAVED_SEALED,
    'saved phrase with consecutive periods is used verbatim on publish re-render',
  );
  assert(
    sealedTextFromVault(SAVED_SEALED, TM_DEFAULTS.sealedTextPhrase).includes('....day of....Month.......'),
    'consecutive periods are not collapsed or stripped',
  );
  assert(
    sealedTextFromVault(SAVED_SEALED, TM_DEFAULTS.sealedTextPhrase) !== TM_DEFAULTS.sealedTextPhrase,
    'publish does not fall back to the undotted template default when Save stored the dotted phrase',
  );
  assert(
    sealedTextFromVault(undefined, TM_DEFAULTS.sealedTextPhrase) === TM_DEFAULTS.sealedTextPhrase,
    'legacy vault rows without sealed_text_phrase still use the template default',
  );
  assert(
    sealedTextFromVault(null, TM_DEFAULTS.sealedTextPhrase) === TM_DEFAULTS.sealedTextPhrase,
    'null sealed_text_phrase still uses the template default',
  );

  console.log('\n[10] History publish preserves saved seal/signature layout\n');
  const SAVED_LAYOUT = {
    ...TM_DEFAULTS,
    signX: 1480,
    signY: 2488,
    signSize: 280,
    sealX: 310,
    sealY: 2910,
  };
  const stored = layoutFromSnapshot(SAVED_LAYOUT);
  assert(stored.signX === 1480, 'Save stores Signature X verbatim');
  assert(stored.signY === 2488, 'Save stores Signature Y verbatim');
  assert(stored.signSize === 280, 'Save stores Signature Size verbatim');
  assert(stored.sealX === 310 && stored.sealY === 2910, 'Save stores sealed-phrase anchors verbatim');
  const restored = layoutFromVault(stored);
  assert(restored.signX === 1480 && restored.signY === 2488 && restored.signSize === 280, 'History Publish uses saved signature position/size');
  assert(restored.sealX === 310 && restored.sealY === 2910, 'History Publish uses saved seal anchors');
  assert(restored.signX !== TM_DEFAULTS.signX || restored.signY !== TM_DEFAULTS.signY, 'publish does not fall back to default signature when layout was saved');
  const legacy = layoutFromVault(null);
  assert(legacy.signX === TM_DEFAULTS.signX && legacy.signY === TM_DEFAULTS.signY && legacy.signSize === TM_DEFAULTS.signSize, 'legacy vault rows without layout_json still use TM_DEFAULTS');
  assert(legacy.sealX === TM_DEFAULTS.sealX && legacy.sealY === TM_DEFAULTS.sealY, 'legacy vault rows keep default seal anchors');

  console.log('\n[11] History publish restores layout when production drops layout_json\n');
  const GOODS = 'in respect of online news publishing; digital journalism.';
  const packed = packDetails(GOODS, stored);
  const unpacked = unpackDetails(packed);
  assert(unpacked.goodsDesc === GOODS, 'goods description survives the layout embed');
  assert(!unpacked.goodsDesc.includes('[[TM_LAYOUT]]'), 'goods description does not leak the layout marker');
  const dropped = layoutFromVaultSources(null, packed);
  assert(dropped.signX === 1480 && dropped.signY === 2488 && dropped.signSize === 280, 'details fallback restores signature when layout_json is dropped');
  assert(dropped.sealX === 310 && dropped.sealY === 2910, 'details fallback restores seal anchors when layout_json is dropped');
  const missingBoth = layoutFromVaultSources(null, GOODS);
  assert(missingBoth.signX === TM_DEFAULTS.signX && missingBoth.signY === TM_DEFAULTS.signY, 'plain details without layout still use TM_DEFAULTS');
  const preferColumn = layoutFromVaultSources(stored, packDetails(GOODS, layoutFromSnapshot(TM_DEFAULTS)));
  assert(preferColumn.signX === 1480, 'layout_json wins over an older details embed');
  const fromString = layoutFromVault(JSON.stringify({ signX: '1480', signY: '2488', signSize: '280' }));
  assert(fromString.signX === 1480 && fromString.signY === 2488 && fromString.signSize === 280, 'numeric strings from JSON restore as numbers');

  console.log('\n[12] History restore keeps TM body text when extra columns are dropped\n');
  const CUSTOM_OPENING = 'Custom opening for History restore.';
  const CUSTOM_MIDDLE = 'Custom middle Arial for History restore.';
  const CUSTOM_LOGO = 'ACME LTD';
  const packedText = packDetails(GOODS, stored, {
    openingText: CUSTOM_OPENING,
    middleTextArial: CUSTOM_MIDDLE,
    logoText: CUSTOM_LOGO,
  });
  const unpackedText = unpackDetails(packedText);
  assert(unpackedText.goodsDesc === GOODS, 'goods description still survives when body text is packed');
  assert(unpackedText.openingText === CUSTOM_OPENING, 'details embed restores openingText');
  assert(unpackedText.middleTextArial === CUSTOM_MIDDLE, 'details embed restores middleTextArial');
  assert(unpackedText.logoText === CUSTOM_LOGO, 'details embed restores logoText');
  const packedLayoutOnly = packDetails(GOODS, stored);
  const unpackedLayoutOnly = unpackDetails(packedLayoutOnly);
  assert(unpackedLayoutOnly.openingText === undefined, 'legacy layout-only embed does not invent openingText');
  assert(unpackedLayoutOnly.goodsDesc === GOODS, 'legacy layout-only embed still restores goods description');

  console.log('\n[13] YouTube Trademark vault rows keep a distinct docKind tag\n');
  const packedYt = packDetails(GOODS, stored, { docKind: 'youtube-trademark', openingText: CUSTOM_OPENING });
  const unpackedYt = unpackDetails(packedYt);
  assert(unpackedYt.docKind === 'youtube-trademark', 'YouTube Trademark pack stores docKind');
  assert(unpackedYt.openingText === CUSTOM_OPENING, 'YouTube Trademark pack still stores openingText');
  const packedTm = packDetails(GOODS, stored, { docKind: 'tm' });
  const unpackedTm = unpackDetails(packedTm);
  assert(unpackedTm.docKind === 'tm', 'TM Certificate pack stores docKind tm');
  const packedLegacyKind = packDetails(GOODS, stored);
  const unpackedLegacyKind = unpackDetails(packedLegacyKind);
  assert(unpackedLegacyKind.docKind === undefined, 'legacy TM rows without docKind stay untagged');

  console.log('\n[14] Unified History document-kind registry\n');
  assert(DOCUMENT_KIND_ORDER.length === 9, 'registry lists all 9 Studio editors');
  assert(DOCUMENT_KIND_ORDER.every(isDocumentKind), 'every ordered kind is a valid DocumentKind');
  assert(documentKindMeta('tm').certificate === true, 'TM is a certificate kind');
  assert(documentKindMeta('youtube-trademark').certificate === true, 'YouTube Trademark is a certificate kind');
  assert(documentKindMeta('nid').certificate === false, 'NID is not a certificate kind');
  assert(documentKindMeta('tin').certificate === false, 'TIN is not a certificate kind');
  assert(documentKindMeta('unhcr').certificate === false, 'UNHCR is not a certificate kind');
  assert(documentKindMeta('unhcr-s2').certificate === false, 'UNHCR Server 2 is not a certificate kind');
  assert(documentKindMeta('pdf').certificate === false, 'PDF is not a certificate kind');
  assert(documentKindMeta('page-recover').certificate === false, 'Hacked Page Recover is not a certificate kind');
  assert(documentKindMeta('business-manager').certificate === false, 'Business Manager is not a certificate kind');
  assert(documentKindMeta(undefined).kind === 'tm', 'unknown kinds fall back to TM');
  assert(documentKindMeta('not-a-kind' as never).kind === 'tm', 'invalid kinds fall back to TM');
  assert(documentKindMeta('nid').editorPath === '/studio/editor/nid', 'NID reopens in the NID editor');
  assert(documentKindMeta('tin').editorPath === '/studio/editor/tin', 'TIN reopens in the TIN editor');
  assert(documentKindMeta('unhcr').editorPath === '/studio/editor/unhcr', 'UNHCR reopens in the UNHCR editor');
  assert(documentKindMeta('unhcr-s2').editorPath === '/studio/editor/unhcr-s2', 'UNHCR Server 2 reopens in the Server 2 editor');
  assert(documentKindMeta('unhcr-s2').recordPrefix === 'UNHCR-S2', 'UNHCR Server 2 History ids use the UNHCR-S2 prefix');
  assert(documentKindMeta('pdf').editorPath === '/studio/editor/pdf', 'PDF reopens in the PDF editor');
  assert(documentKindMeta('page-recover').editorPath === '/studio/editor/page-recover', 'Recover reopens in its editor');
  assert(documentKindMeta('business-manager').editorPath === '/studio/editor/business-manager', 'Business Manager reopens in its editor');
  assert(isDocumentKind('nid') && !isDocumentKind('certificate'), 'isDocumentKind accepts only registered kinds');
  const generated = newRecordId('pdf');
  assert(generated.startsWith(`${DOCUMENT_KINDS.pdf.recordPrefix}-`), 'generated PDF ids use the PDF prefix');
  assert(generated !== newRecordId('pdf'), 'generated record ids are unique');

  console.log('\n[15] Generic editor payload round-trips through packed details\n');
  const nidDoc = { idNo: '1990123456789', nameEnglish: 'Test Citizen', nameBangla: 'টেস্ট' };
  const packedNid = packDetails('', stored, { docKind: 'nid', doc: nidDoc });
  const unpackedNid = unpackDetails(packedNid);
  assert(unpackedNid.docKind === 'nid', 'NID pack stores docKind');
  assert((unpackedNid.doc as { idNo: string }).idNo === '1990123456789', 'NID pack restores idNo');
  assert((unpackedNid.doc as { nameEnglish: string }).nameEnglish === 'Test Citizen', 'NID pack restores nameEnglish');

  const tinDoc = { tinNo: '123456789012', taxpayerName: 'Demo Taxpayer' };
  const packedTin = packDetails('', stored, { docKind: 'tin', doc: tinDoc });
  const unpackedTin = unpackDetails(packedTin);
  assert(unpackedTin.docKind === 'tin', 'TIN pack stores docKind');
  assert((unpackedTin.doc as { tinNo: string }).tinNo === '123456789012', 'TIN pack restores tinNo');

  const unhcrDoc = {
    unhcrNo: 'MY-1001',
    name: 'Case Subject',
    dob: '01 Jan 1990',
    sex: 'M',
    origin: 'MM',
    issuedDate: '01 Jan 2024',
    expiredDate: '01 Jan 2026',
    layouts: {
      unhcrNo: { fontSize: 40, x: 1300, y: 180, fontFamily: 'arial-bold' },
      name: { fontSize: 34, x: 860, y: 490, fontFamily: 'arial' },
      dob: { fontSize: 28, x: 850, y: 720, fontFamily: 'arial' },
      sex: { fontSize: 28, x: 1770, y: 720, fontFamily: 'arial' },
      origin: { fontSize: 30, x: 852, y: 918, fontFamily: 'arial-bold' },
      issuedDate: { fontSize: 26, x: 852, y: 1188, fontFamily: 'arial' },
      expiredDate: { fontSize: 26, x: 1568, y: 1188, fontFamily: 'arial' },
    },
    photoX: 80,
    photoY: 110,
    photoW: 640,
    photoH: 820,
    photoDataUrl: TINY_JPEG,
    barcodePayload: UNHCR_BARCODE_TEST_PAYLOAD,
    barcode1X: 80,
    barcode1Y: 1040,
    barcode1W: 700,
    barcode1H: 110,
    barcode2X: 90,
    barcode2Y: 1180,
    barcode2W: 700,
    barcode2H: 110,
    qrPayload: UNHCR_QR_TEST_PAYLOAD,
    qrX: 2200,
    qrY: 100,
    qrSize: 240,
  };
  const packedUnhcr = packDetails('', stored, { docKind: 'unhcr', doc: unhcrDoc });
  const unpackedUnhcr = unpackDetails(packedUnhcr);
  assert(unpackedUnhcr.docKind === 'unhcr', 'UNHCR pack stores docKind');
  const restoredUnhcr = unpackedUnhcr.doc as typeof unhcrDoc;
  assert(restoredUnhcr.unhcrNo === 'MY-1001', 'UNHCR pack restores UNHCR No');
  assert(restoredUnhcr.name === 'Case Subject', 'UNHCR pack restores Name');
  assert(restoredUnhcr.layouts.name.fontSize === 34, 'UNHCR pack restores font size');
  assert(restoredUnhcr.layouts.name.fontFamily === 'arial', 'UNHCR pack restores font style');
  assert(restoredUnhcr.layouts.name.x === 860 && restoredUnhcr.layouts.name.y === 490, 'UNHCR pack restores X/Y');
  assert(restoredUnhcr.photoX === 80 && restoredUnhcr.photoY === 110, 'UNHCR pack restores photo X/Y');
  assert(restoredUnhcr.photoW === 640 && restoredUnhcr.photoH === 820, 'UNHCR pack restores photo size');
  assert(restoredUnhcr.photoDataUrl === TINY_JPEG, 'UNHCR pack restores photo data URL');
  assert(restoredUnhcr.barcodePayload === UNHCR_BARCODE_TEST_PAYLOAD, 'UNHCR pack restores barcode TEST payload');
  assert(restoredUnhcr.barcode1X === 80 && restoredUnhcr.barcode1Y === 1040, 'UNHCR pack restores barcode 1 X/Y');
  assert(restoredUnhcr.barcode1W === 700 && restoredUnhcr.barcode1H === 110, 'UNHCR pack restores barcode 1 size');
  assert(restoredUnhcr.barcode2X === 90 && restoredUnhcr.barcode2Y === 1180, 'UNHCR pack restores barcode 2 X/Y');
  assert(restoredUnhcr.barcode2W === 700 && restoredUnhcr.barcode2H === 110, 'UNHCR pack restores barcode 2 size');
  assert(restoredUnhcr.qrPayload === UNHCR_QR_TEST_PAYLOAD, 'UNHCR pack restores QR TEST payload');
  assert(restoredUnhcr.qrX === 2200 && restoredUnhcr.qrY === 100 && restoredUnhcr.qrSize === 240, 'UNHCR pack restores QR X/Y/size');
  assert(!('testBarcodeText' in restoredUnhcr) && !('testRefNo' in restoredUnhcr), 'UNHCR Server 1 pack omits TEST overlays');
  assert(!JSON.stringify(unpackedUnhcr).includes('Facebook Imposter'), 'UNHCR vault payload omits the case banner');
  const normalizedUnhcr = normalizeUnhcrSnapshot({});
  assert(normalizedUnhcr.photoX === UNHCR_PHOTO_DEFAULT.x && normalizedUnhcr.photoY === UNHCR_PHOTO_DEFAULT.y, 'UNHCR photo defaults to cyan placeholder box');
  assert(normalizedUnhcr.photoW === UNHCR_PHOTO_DEFAULT.w && normalizedUnhcr.photoH === UNHCR_PHOTO_DEFAULT.h, 'UNHCR photo default size is 748×900');
  assert(normalizedUnhcr.layouts.origin.fontSize === 46 && normalizedUnhcr.layouts.origin.fontFamily === 'arial-bold', 'UNHCR origin defaults to 46px Arial Bold');
  assert(normalizedUnhcr.layouts.sex.fontSize === 50 && normalizedUnhcr.layouts.sex.x === 1865 && normalizedUnhcr.layouts.sex.y === 770, 'UNHCR sex defaults to 50px at 1865,770');
  assert(normalizedUnhcr.layouts.sex.fontFamily === 'arial-bold', 'UNHCR sex defaults to Arial Bold');
  assert(normalizedUnhcr.layouts.expiredDate.fontFamily === 'arial' && normalizedUnhcr.layouts.expiredDate.x === 1605 && normalizedUnhcr.layouts.expiredDate.y === 1251, 'UNHCR expired date defaults to Arial Regular at 1605,1251');
  assert(normalizedUnhcr.layouts.dob.x === 893 && normalizedUnhcr.layouts.dob.y === 760, 'UNHCR DOB defaults to 893,760');
  assert(normalizedUnhcr.barcodePayload === UNHCR_BARCODE_TEST_PAYLOAD, 'UNHCR barcode defaults to TEST ID');
  assert(normalizedUnhcr.barcode1X === 54 && normalizedUnhcr.barcode1Y === 1028, 'UNHCR barcode 1 defaults to 54,1028');
  assert(normalizedUnhcr.barcode1W === 752 && normalizedUnhcr.barcode1H === 121, 'UNHCR barcode 1 default size is 752×121');
  assert(normalizedUnhcr.barcode2X === 1724 && normalizedUnhcr.barcode2Y === 99, 'UNHCR barcode 2 defaults to 1724,99');
  assert(normalizedUnhcr.barcode2W === 750 && normalizedUnhcr.barcode2H === 121, 'UNHCR barcode 2 default size is 750×121');
  assert(normalizedUnhcr.qrPayload === UNHCR_QR_TEST_PAYLOAD, 'UNHCR QR defaults to TEST sample data');
  assert(normalizedUnhcr.qrX === 1467 && normalizedUnhcr.qrY === 1369 && normalizedUnhcr.qrSize === 263, 'UNHCR QR defaults to 1467,1369 size 263');
  assert(!('testBarcodeText' in normalizedUnhcr) && !('testRefNo' in normalizedUnhcr), 'UNHCR Server 1 defaults omit TEST overlays');
  assert(UNHCR_BARCODE1_DEFAULT.x === 54 && UNHCR_BARCODE1_DEFAULT.y === 1028, 'UNHCR_BARCODE1_DEFAULT is 54,1028');
  assert(UNHCR_BARCODE2_DEFAULT.x === 1724 && UNHCR_BARCODE2_DEFAULT.y === 99, 'UNHCR_BARCODE2_DEFAULT is 1724,99');
  assert(UNHCR_QR_DEFAULT.x === 1467 && UNHCR_QR_DEFAULT.y === 1369 && UNHCR_QR_DEFAULT.size === 263, 'UNHCR_QR_DEFAULT is 1467,1369 size 263');
  const editedUnhcr = {
    ...restoredUnhcr,
    name: 'Updated Subject',
    layouts: { ...restoredUnhcr.layouts, name: { ...restoredUnhcr.layouts.name, fontSize: 38, x: 870, y: 500, fontFamily: 'arial-bold' } },
    photoX: 90,
    photoY: 120,
    photoW: 650,
    photoH: 830,
    barcodePayload: 'TEST-UNHCR-REF-0002',
    barcode1X: 100,
    barcode1Y: 1050,
    barcode1W: 680,
    barcode1H: 108,
    barcode2X: 110,
    barcode2Y: 1190,
    barcode2W: 680,
    barcode2H: 108,
    qrPayload: 'TEST DATA — UNHCR ID EDITOR SAMPLE\nREF: TEST-UNHCR-QR-0002',
    qrX: 2210,
    qrY: 110,
    qrSize: 250,
  };
  const packedUnhcrEdit = packDetails('', stored, { docKind: 'unhcr', doc: editedUnhcr });
  const unpackedUnhcrEdit = unpackDetails(packedUnhcrEdit);
  const restoredUnhcrEdit = unpackedUnhcrEdit.doc as typeof editedUnhcr;
  assert(unpackedUnhcrEdit.docKind === 'unhcr', 'UNHCR re-save keeps docKind');
  assert(restoredUnhcrEdit.name === 'Updated Subject', 'UNHCR re-save persists updated text');
  assert(restoredUnhcrEdit.layouts.name.fontSize === 38, 'UNHCR re-save persists updated font size');
  assert(restoredUnhcrEdit.layouts.name.fontFamily === 'arial-bold', 'UNHCR re-save persists updated font style');
  assert(restoredUnhcrEdit.layouts.name.x === 870 && restoredUnhcrEdit.layouts.name.y === 500, 'UNHCR re-save persists updated X/Y');
  assert(restoredUnhcrEdit.photoX === 90 && restoredUnhcrEdit.photoY === 120, 'UNHCR re-save persists updated photo X/Y');
  assert(restoredUnhcrEdit.photoW === 650 && restoredUnhcrEdit.photoH === 830, 'UNHCR re-save persists updated photo size');
  assert(restoredUnhcrEdit.photoDataUrl === TINY_JPEG, 'UNHCR re-save persists photo data URL');
  assert(restoredUnhcrEdit.barcodePayload === 'TEST-UNHCR-REF-0002', 'UNHCR re-save persists barcode TEST payload');
  assert(restoredUnhcrEdit.barcode1X === 100 && restoredUnhcrEdit.barcode1Y === 1050, 'UNHCR re-save persists barcode 1 X/Y');
  assert(restoredUnhcrEdit.barcode1W === 680 && restoredUnhcrEdit.barcode1H === 108, 'UNHCR re-save persists barcode 1 size');
  assert(restoredUnhcrEdit.barcode2X === 110 && restoredUnhcrEdit.barcode2Y === 1190, 'UNHCR re-save persists barcode 2 X/Y');
  assert(restoredUnhcrEdit.barcode2W === 680 && restoredUnhcrEdit.barcode2H === 108, 'UNHCR re-save persists barcode 2 size');
  assert(restoredUnhcrEdit.qrPayload.includes('TEST DATA'), 'UNHCR re-save persists QR TEST payload');
  assert(restoredUnhcrEdit.qrX === 2210 && restoredUnhcrEdit.qrY === 110 && restoredUnhcrEdit.qrSize === 250, 'UNHCR re-save persists QR X/Y/size');
  assert(!('testBarcodeText' in restoredUnhcrEdit) && !('testRefNo' in restoredUnhcrEdit), 'UNHCR Server 1 re-save still omits TEST overlays');
  const reopenedUnhcr = normalizeUnhcrSnapshot(restoredUnhcrEdit as Parameters<typeof normalizeUnhcrSnapshot>[0]);
  assert(reopenedUnhcr.barcode1X === 100 && reopenedUnhcr.barcode1W === 680, 'UNHCR History reopen restores barcode 1 position/size');
  assert(reopenedUnhcr.barcode2X === 110 && reopenedUnhcr.barcode2H === 108, 'UNHCR History reopen restores barcode 2 position/size');
  assert(reopenedUnhcr.qrX === 2210 && reopenedUnhcr.qrY === 110 && reopenedUnhcr.qrSize === 250, 'UNHCR History reopen restores QR position/size');
  assert(!('testBarcodeText' in reopenedUnhcr) && !('testRefNo' in reopenedUnhcr), 'UNHCR Server 1 History reopen does not invent TEST overlays');
  assert(reopenedUnhcr.barcodePayload === 'MY-1001', 'UNHCR History reopen rebuilds barcode from ID number');
  assert(reopenedUnhcr.qrPayload.includes('ID: MY-1001') && reopenedUnhcr.qrPayload.includes('Name: Updated Subject'), 'UNHCR History reopen rebuilds QR from form fields');

  assert(UNHCR_CURRENT_RECORD_ID === 'UNHCR-CURRENT', 'UNHCR shared current-state id is UNHCR-CURRENT');
  assert(isUnhcrCurrentRecordId('UNHCR-CURRENT'), 'UNHCR-CURRENT is recognized as the shared state id');
  assert(!isUnhcrCurrentRecordId('UNHCR-MY-1001'), 'a History case id is not the shared current state');
  assert(resolveUnhcrEditorLoadSource({ recordNo: 'UNHCR-MY-1001', hasCurrentState: true }) === 'history-record', 'explicit History record wins over current state');
  assert(resolveUnhcrEditorLoadSource({ recordNo: UNHCR_CURRENT_RECORD_ID, hasCurrentState: true }) === 'current-state', 'UNHCR-CURRENT is not treated as a History case on direct open');
  assert(resolveUnhcrEditorLoadSource({ recordNo: UNHCR_CURRENT_RECORD_ID, hasCurrentState: false }) === 'defaults', 'UNHCR-CURRENT without a shared row uses built-in defaults');
  assert(resolveUnhcrEditorLoadSource({ projectId: 'p1', hasCurrentState: true }) === 'project', 'explicit project wins over current state');
  assert(resolveUnhcrEditorLoadSource({ templateName: 't1', hasCurrentState: true }) === 'template', 'explicit template wins over current state');
  assert(resolveUnhcrEditorLoadSource({ hasCurrentState: true }) === 'current-state', 'direct editor open loads shared current state');
  assert(resolveUnhcrEditorLoadSource({ hasCurrentState: false }) === 'defaults', 'direct editor open uses defaults when no current state exists');
  assert(unhcrHistoryRecordIdForSave(null, 'MY-1001', 'UNHCR-gen') === 'UNHCR-MY-1001', 'Save from a blank editor creates a History case id from the ID number');
  assert(unhcrHistoryRecordIdForSave(UNHCR_CURRENT_RECORD_ID, 'MY-1001', 'UNHCR-gen') === 'UNHCR-MY-1001', 'Save never binds History to the shared current-state id');
  assert(unhcrHistoryRecordIdForSave('UNHCR-abc', 'MY-1001', 'UNHCR-gen') === 'UNHCR-abc', 're-save of an explicit History record keeps that record id');
  const packedCurrent = packDetails('', stored, { docKind: 'unhcr', doc: editedUnhcr });
  const unpackedCurrent = unpackDetails(packedCurrent);
  const loadedCurrent = snapshotFromUnhcrVaultDoc(unpackedCurrent.doc);
  assert(loadedCurrent.name === 'Updated Subject', 'direct editor open restores saved text from current state');
  assert(loadedCurrent.layouts.name.fontSize === 38 && loadedCurrent.layouts.name.fontFamily === 'arial-bold', 'direct editor open restores saved font settings');
  assert(loadedCurrent.photoX === 90 && loadedCurrent.photoW === 650, 'direct editor open restores saved photo position/size');
  assert(loadedCurrent.barcode1X === 100 && loadedCurrent.barcode1W === 680, 'direct editor open restores saved barcode 1');
  assert(loadedCurrent.barcode2Y === 1190 && loadedCurrent.qrSize === 250, 'direct editor open restores saved barcode 2 and QR size');
  assert(!('testBarcodeText' in loadedCurrent) && !('testRefNo' in loadedCurrent), 'Server 1 current-state restore omits TEST overlays');
  const packedCurrentEdit = packDetails('', stored, { docKind: 'unhcr', doc: { ...editedUnhcr, name: 'Re-saved Subject', qrSize: 280 } });
  const reloadedCurrent = snapshotFromUnhcrVaultDoc(unpackDetails(packedCurrentEdit).doc);
  assert(reloadedCurrent.name === 'Re-saved Subject' && reloadedCurrent.qrSize === 280, 're-edit Save updates the shared current editor state');
  const packedHistoryCase = packDetails('', stored, { docKind: 'unhcr', doc: { ...editedUnhcr, name: 'History Only' } });
  assert(unpackDetails(packedHistoryCase).docKind === 'unhcr', 'individual History records remain independent of UNHCR-CURRENT');
  assert(!isUnhcrCurrentRecordId('UNHCR-MY-1001'), 'shared current state id stays distinct from History case ids');
  const schema = readFileSync(join(ROOT, 'supabase/schema.sql'), 'utf8');
  const vault = readFileSync(join(ROOT, 'src/lib/workspace/vault.ts'), 'utf8');
  assert(schema.includes('create or replace function public.get_unhcr_current_state'), 'shared UNHCR state is loaded via SECURITY DEFINER RPC');
  assert(schema.includes('create or replace function public.save_unhcr_current_state'), 'shared UNHCR state is saved via SECURITY DEFINER RPC');
  assert(schema.includes("has_tool_access(auth.uid(), 'unhcr')") || schema.includes("has_tool_access(uid, 'unhcr')"), 'UNHCR current-state RPCs require unhcr tool access');
  assert(schema.includes("trademark_no = 'UNHCR-CURRENT'"), 'UNHCR RPCs only touch the shared current-state row');
  assert(vault.includes("neq('trademark_no', UNHCR_CURRENT_RECORD_ID)"), 'History listing hides UNHCR-CURRENT');
  assert(vault.includes("rpc('get_unhcr_current_state')") && vault.includes("rpc('save_unhcr_current_state'"), 'editor load/save uses shared UNHCR RPCs');

  const unhcrS2Doc = {
    ...unhcrDoc,
    testBarcodeText: 'TEST-UNHCR-BARCODE-0001',
    testBarcodeTextX: 90,
    testBarcodeTextY: 1180,
    testBarcodeTextW: 700,
    testBarcodeTextH: 60,
    testBarcodeTextFontSize: 30,
    testRefNo: 'TEST-UNHCR-REF-0001',
    testRefNoX: 2460,
    testRefNoY: 140,
    testRefNoW: 52,
    testRefNoH: 1500,
    testRefNoFontSize: 26,
    testRefNoOrientation: 'vertical' as const,
  };
  const packedUnhcrS2 = packDetails('', stored, { docKind: 'unhcr-s2', doc: unhcrS2Doc });
  const unpackedUnhcrS2 = unpackDetails(packedUnhcrS2);
  assert(unpackedUnhcrS2.docKind === 'unhcr-s2', 'UNHCR S2 pack stores docKind unhcr-s2');
  assert(unpackedUnhcr.docKind === 'unhcr', 'UNHCR Server 1 pack stays tagged unhcr after S2 pack');
  const restoredUnhcrS2 = unpackedUnhcrS2.doc as typeof unhcrS2Doc;
  assert(restoredUnhcrS2.unhcrNo === 'MY-1001', 'UNHCR S2 pack restores UNHCR No');
  assert(restoredUnhcrS2.name === 'Case Subject', 'UNHCR S2 pack restores Name');
  assert(restoredUnhcrS2.testBarcodeText === 'TEST-UNHCR-BARCODE-0001', 'UNHCR S2 pack restores TEST barcode text');
  assert(restoredUnhcrS2.testBarcodeTextX === 90 && restoredUnhcrS2.testBarcodeTextY === 1180, 'UNHCR S2 pack restores TEST barcode text X/Y');
  assert(restoredUnhcrS2.testBarcodeTextW === 700 && restoredUnhcrS2.testBarcodeTextH === 60, 'UNHCR S2 pack restores TEST barcode text size');
  assert(restoredUnhcrS2.testBarcodeTextFontSize === 30, 'UNHCR S2 pack restores TEST barcode text font size');
  assert(restoredUnhcrS2.testRefNo === 'TEST-UNHCR-REF-0001', 'UNHCR S2 pack restores TEST reference number');
  assert(restoredUnhcrS2.testRefNoX === 2460 && restoredUnhcrS2.testRefNoY === 140, 'UNHCR S2 pack restores TEST reference X/Y');
  assert(restoredUnhcrS2.testRefNoW === 52 && restoredUnhcrS2.testRefNoH === 1500, 'UNHCR S2 pack restores TEST reference size');
  assert(restoredUnhcrS2.testRefNoFontSize === 26, 'UNHCR S2 pack restores TEST reference font size');
  assert(restoredUnhcrS2.testRefNoOrientation === 'vertical', 'UNHCR S2 pack restores TEST reference orientation');
  const normalizedUnhcrS2 = normalizeUnhcrS2Snapshot({});
  assert(normalizedUnhcrS2.testBarcodeText === UNHCR_TEST_BARCODE_TEXT_DEFAULT_VALUE, 'UNHCR S2 barcode value defaults empty');
  assert(normalizedUnhcrS2.testBarcodeTextX === UNHCR_TEST_BARCODE_TEXT_DEFAULT.x && normalizedUnhcrS2.testBarcodeTextY === UNHCR_TEST_BARCODE_TEXT_DEFAULT.y, 'UNHCR S2 barcode value default X/Y sits below the photo');
  assert(normalizedUnhcrS2.testBarcodeTextW === UNHCR_TEST_BARCODE_TEXT_DEFAULT.w && normalizedUnhcrS2.testBarcodeTextH === UNHCR_TEST_BARCODE_TEXT_DEFAULT.h, 'UNHCR S2 barcode value default size');
  assert(normalizedUnhcrS2.testBarcodeTextH === 61 && normalizedUnhcrS2.testBarcodeTextFontSize === 62, 'UNHCR S2 barcode value default Height/font size');
  assert(normalizedUnhcrS2.testRefNo === UNHCR_TEST_REF_NO_DEFAULT_VALUE, 'UNHCR S2 reference number defaults to TEST value');
  assert(normalizedUnhcrS2.testRefNo === '1838-SAB227535', 'UNHCR S2 reference number default text is 1838-SAB227535');
  assert(normalizedUnhcrS2.testRefNoX === 2408 && normalizedUnhcrS2.testRefNoY === 120, 'UNHCR S2 reference default X/Y sits on the right edge');
  assert(normalizedUnhcrS2.testRefNoW === UNHCR_TEST_REF_NO_DEFAULT.w && normalizedUnhcrS2.testRefNoH === UNHCR_TEST_REF_NO_DEFAULT.h, 'UNHCR S2 reference default size');
  assert(normalizedUnhcrS2.testRefNoH === 2646 && normalizedUnhcrS2.testRefNoFontSize === 53, 'UNHCR S2 reference default Height/font size');
  assert(normalizedUnhcrS2.testRefNoOrientation === 'vertical', 'UNHCR S2 reference defaults to vertical orientation');
  assert(UNHCR_TEST_REF_NO_HEIGHT_MAX > UNHCR_TEST_BOX_RANGES.h.max, 'UNHCR S2 vertical reference Height max exceeds shared TEST box canvas cap');
  assert(
    normalizeUnhcrS2Snapshot({ testRefNoH: 3600 }).testRefNoH === 3600,
    'UNHCR S2 vertical reference Height can extend past the canvas',
  );
  assert(
    normalizeUnhcrS2Snapshot({ testRefNoH: 99999 }).testRefNoH === UNHCR_TEST_REF_NO_HEIGHT_MAX,
    'UNHCR S2 reference Height clamps to the dedicated vertical max',
  );
  assert(
    normalizeUnhcrS2Snapshot({ testBarcodeTextH: 3600 }).testBarcodeTextH === UNHCR_TEST_BOX_RANGES.h.max,
    'UNHCR S2 barcode-value Height still clamps to the shared TEST box max',
  );
  assert(syncUnhcrS2IdOverlays({ unhcrNo: 'MY-1001' }).testBarcodeText === 'MY-1001', 'S2 barcode value syncs from ID number');
  assert(syncUnhcrS2IdOverlays({ unhcrNo: '' }).testBarcodeText === '', 'S2 barcode value stays empty when ID is empty');
  const editedUnhcrS2 = {
    ...restoredUnhcrS2,
    name: 'Updated S2 Subject',
    layouts: { ...restoredUnhcrS2.layouts, name: { ...restoredUnhcrS2.layouts.name, fontSize: 38, x: 870, y: 500, fontFamily: 'arial-bold' } },
    photoX: 90,
    photoY: 120,
    photoW: 650,
    photoH: 830,
    barcodePayload: 'TEST-UNHCR-REF-0002',
    barcode1X: 100,
    barcode1Y: 1050,
    barcode1W: 680,
    barcode1H: 108,
    barcode2X: 110,
    barcode2Y: 1190,
    barcode2W: 680,
    barcode2H: 108,
    qrPayload: 'TEST DATA — UNHCR ID EDITOR SAMPLE\nREF: TEST-UNHCR-QR-0002',
    qrX: 2210,
    qrY: 110,
    qrSize: 250,
    testBarcodeText: 'TEST-UNHCR-BARCODE-0002',
    testBarcodeTextX: 110,
    testBarcodeTextY: 1200,
    testBarcodeTextW: 680,
    testBarcodeTextH: 64,
    testBarcodeTextFontSize: 32,
    testRefNo: 'TEST-UNHCR-REF-0002',
    testRefNoX: 2440,
    testRefNoY: 160,
    testRefNoW: 50,
    testRefNoH: 1480,
    testRefNoFontSize: 24,
    testRefNoOrientation: 'horizontal' as const,
  };
  const packedUnhcrS2Edit = packDetails('', stored, { docKind: 'unhcr-s2', doc: editedUnhcrS2 });
  const unpackedUnhcrS2Edit = unpackDetails(packedUnhcrS2Edit);
  const restoredUnhcrS2Edit = unpackedUnhcrS2Edit.doc as typeof editedUnhcrS2;
  assert(unpackedUnhcrS2Edit.docKind === 'unhcr-s2', 'UNHCR S2 re-save keeps docKind unhcr-s2');
  assert(restoredUnhcrS2Edit.name === 'Updated S2 Subject', 'UNHCR S2 re-save persists updated text');
  assert(restoredUnhcrS2Edit.testBarcodeText === 'TEST-UNHCR-BARCODE-0002', 'UNHCR S2 re-save persists TEST barcode text');
  assert(restoredUnhcrS2Edit.testBarcodeTextX === 110 && restoredUnhcrS2Edit.testBarcodeTextY === 1200, 'UNHCR S2 re-save persists TEST barcode text X/Y');
  assert(restoredUnhcrS2Edit.testBarcodeTextW === 680 && restoredUnhcrS2Edit.testBarcodeTextH === 64, 'UNHCR S2 re-save persists TEST barcode text size');
  assert(restoredUnhcrS2Edit.testBarcodeTextFontSize === 32, 'UNHCR S2 re-save persists TEST barcode text font size');
  assert(restoredUnhcrS2Edit.testRefNo === 'TEST-UNHCR-REF-0002', 'UNHCR S2 re-save persists TEST reference number');
  assert(restoredUnhcrS2Edit.testRefNoX === 2440 && restoredUnhcrS2Edit.testRefNoY === 160, 'UNHCR S2 re-save persists TEST reference X/Y');
  assert(restoredUnhcrS2Edit.testRefNoW === 50 && restoredUnhcrS2Edit.testRefNoH === 1480, 'UNHCR S2 re-save persists TEST reference size');
  assert(restoredUnhcrS2Edit.testRefNoFontSize === 24, 'UNHCR S2 re-save persists TEST reference font size');
  assert(restoredUnhcrS2Edit.testRefNoOrientation === 'horizontal', 'UNHCR S2 re-save persists TEST reference orientation');
  const reopenedUnhcrS2 = normalizeUnhcrS2Snapshot(restoredUnhcrS2Edit as Parameters<typeof normalizeUnhcrS2Snapshot>[0]);
  assert(reopenedUnhcrS2.testBarcodeText === 'TEST-UNHCR-BARCODE-0002', 'UNHCR S2 History reopen restores TEST barcode text');
  assert(reopenedUnhcrS2.testBarcodeTextX === 110 && reopenedUnhcrS2.testBarcodeTextW === 680, 'UNHCR S2 History reopen restores TEST barcode text position/size');
  assert(reopenedUnhcrS2.testRefNo === 'TEST-UNHCR-REF-0002', 'UNHCR S2 History reopen restores TEST reference number');
  assert(reopenedUnhcrS2.testRefNoX === 2440 && reopenedUnhcrS2.testRefNoH === 1480, 'UNHCR S2 History reopen restores TEST reference position/size');
  assert(reopenedUnhcrS2.testRefNoOrientation === 'horizontal', 'UNHCR S2 History reopen restores TEST reference orientation');
  assert(reopenedUnhcrS2.barcodePayload === 'MY-1001', 'UNHCR S2 History reopen rebuilds barcode from ID number');
  assert(reopenedUnhcrS2.qrPayload.includes('ID: MY-1001') && reopenedUnhcrS2.qrPayload.includes('Name: Updated S2 Subject'), 'UNHCR S2 History reopen rebuilds QR from form fields');

  assert(UNHCR_S2_CURRENT_RECORD_ID === 'UNHCR-S2-CURRENT', 'UNHCR S2 shared current-state id is UNHCR-S2-CURRENT');
  assert(isUnhcrS2CurrentRecordId('UNHCR-S2-CURRENT'), 'UNHCR-S2-CURRENT is recognized as the S2 shared state id');
  assert(!isUnhcrS2CurrentRecordId('UNHCR-CURRENT'), 'UNHCR-CURRENT is not the S2 shared state id');
  assert(!isUnhcrCurrentRecordId('UNHCR-S2-CURRENT'), 'UNHCR-S2-CURRENT is not the Server 1 shared state id');
  assert(!isUnhcrS2CurrentRecordId('UNHCR-S2-MY-1001'), 'an S2 History case id is not the shared current state');
  assert(resolveUnhcrS2EditorLoadSource({ recordNo: 'UNHCR-S2-MY-1001', hasCurrentState: true }) === 'history-record', 'S2 explicit History record wins over current state');
  assert(resolveUnhcrS2EditorLoadSource({ recordNo: UNHCR_S2_CURRENT_RECORD_ID, hasCurrentState: true }) === 'current-state', 'UNHCR-S2-CURRENT is not treated as a History case on direct open');
  assert(resolveUnhcrS2EditorLoadSource({ recordNo: UNHCR_S2_CURRENT_RECORD_ID, hasCurrentState: false }) === 'defaults', 'UNHCR-S2-CURRENT without a shared row uses built-in defaults');
  assert(resolveUnhcrS2EditorLoadSource({ projectId: 'p1', hasCurrentState: true }) === 'project', 'S2 explicit project wins over current state');
  assert(resolveUnhcrS2EditorLoadSource({ templateName: 't1', hasCurrentState: true }) === 'template', 'S2 explicit template wins over current state');
  assert(resolveUnhcrS2EditorLoadSource({ hasCurrentState: true }) === 'current-state', 'S2 direct editor open loads shared current state');
  assert(resolveUnhcrS2EditorLoadSource({ hasCurrentState: false }) === 'defaults', 'S2 direct editor open uses defaults when no current state exists');
  assert(resolveUnhcrS2EditorLoadSource({ hasCurrentState: false, hasServer1CurrentState: true }) === 'server1-seed', 'S2 first open copies current Server 1 template when S2 current is empty');
  assert(resolveUnhcrS2EditorLoadSource({ hasCurrentState: true, hasServer1CurrentState: true }) === 'current-state', 'S2 current state wins over a later Server 1 template');
  assert(resolveUnhcrS2EditorLoadSource({ hasCurrentState: false, hasServer1CurrentState: true, currentStateError: true }) === 'defaults', 'S2 load error does not fall through to a Server 1 seed');
  assert(decideUnhcrS2DirectOpenAction({ hasCurrentRecord: true, hasServer1Record: true }) === 'apply-current', 'S2 direct open applies saved current state before any Server 1 seed');
  assert(decideUnhcrS2DirectOpenAction({ hasCurrentRecord: true, currentError: 'timeout', hasServer1Record: true }) === 'apply-current', 'S2 saved current still wins if a later lookup errors');
  assert(decideUnhcrS2DirectOpenAction({ hasCurrentRecord: false, currentError: 'not authenticated', hasServer1Record: true }) === 'load-error', 'S2 load error must not seed Server 1 over missing current mapping');
  assert(decideUnhcrS2DirectOpenAction({ hasCurrentRecord: false, hasServer1Record: true }) === 'seed-server1', 'S2 seeds Server 1 only when current state is confirmed missing');
  assert(decideUnhcrS2DirectOpenAction({ hasCurrentRecord: false, hasServer1Record: false }) === 'defaults', 'S2 stays on defaults when neither current state exists');
  assert(unhcrS2HistoryRecordIdForSave(null, 'MY-1001', 'UNHCR-S2-gen') === 'UNHCR-S2-MY-1001', 'S2 Save from a blank editor creates a History case id from the ID number');
  assert(unhcrS2HistoryRecordIdForSave(UNHCR_S2_CURRENT_RECORD_ID, 'MY-1001', 'UNHCR-S2-gen') === 'UNHCR-S2-MY-1001', 'S2 Save never binds History to the shared current-state id');
  assert(unhcrS2HistoryRecordIdForSave('UNHCR-S2-abc', 'MY-1001', 'UNHCR-S2-gen') === 'UNHCR-S2-abc', 'S2 re-save of an explicit History record keeps that record id');
  assert(unhcrHistoryRecordIdForSave(null, 'MY-1001', 'UNHCR-gen') === 'UNHCR-MY-1001', 'Server 1 History ids stay UNHCR- prefixed after S2 split');
  const packedS2Current = packDetails('', stored, { docKind: 'unhcr-s2', doc: editedUnhcrS2 });
  const unpackedS2Current = unpackDetails(packedS2Current);
  const loadedS2Current = snapshotFromUnhcrS2VaultDoc(unpackedS2Current.doc);
  assert(loadedS2Current.name === 'Updated S2 Subject', 'S2 direct editor open restores saved text from current state');
  assert(loadedS2Current.testBarcodeText === 'TEST-UNHCR-BARCODE-0002', 'S2 direct editor open restores TEST barcode text');
  assert(loadedS2Current.testBarcodeTextX === 110 && loadedS2Current.testBarcodeTextH === 64, 'S2 direct editor open restores TEST barcode text position/size');
  assert(loadedS2Current.testRefNo === 'TEST-UNHCR-REF-0002', 'S2 direct editor open restores TEST reference number');
  assert(loadedS2Current.testRefNoOrientation === 'horizontal', 'S2 direct editor open restores TEST reference orientation');
  const packedS2CurrentEdit = packDetails('', stored, { docKind: 'unhcr-s2', doc: { ...editedUnhcrS2, name: 'Re-saved S2 Subject', qrSize: 280 } });
  const reloadedS2Current = snapshotFromUnhcrS2VaultDoc(unpackDetails(packedS2CurrentEdit).doc);
  assert(reloadedS2Current.name === 'Re-saved S2 Subject' && reloadedS2Current.qrSize === 280, 'S2 re-edit Save updates the shared current editor state');
  const packedS2HistoryCase = packDetails('', stored, { docKind: 'unhcr-s2', doc: { ...editedUnhcrS2, name: 'S2 History Only' } });
  assert(unpackDetails(packedS2HistoryCase).docKind === 'unhcr-s2', 'S2 History records remain independent of UNHCR-S2-CURRENT');
  assert(unpackDetails(packedHistoryCase).docKind === 'unhcr', 'Server 1 History records stay independent of Server 2');
  assert(schema.includes('create or replace function public.get_unhcr_s2_current_state'), 'shared UNHCR S2 state is loaded via SECURITY DEFINER RPC');
  assert(schema.includes('create or replace function public.save_unhcr_s2_current_state'), 'shared UNHCR S2 state is saved via SECURITY DEFINER RPC');
  assert(schema.includes("trademark_no = 'UNHCR-S2-CURRENT'"), 'UNHCR S2 RPCs only touch the S2 current-state row');
  assert(vault.includes("neq('trademark_no', UNHCR_S2_CURRENT_RECORD_ID)"), 'History listing hides UNHCR-S2-CURRENT');
  assert(vault.includes("rpc('get_unhcr_s2_current_state')") && vault.includes("rpc('save_unhcr_s2_current_state'"), 'S2 editor load/save uses shared UNHCR S2 RPCs');
  assert(vault.includes('coerceUnhcrS2CurrentRpcRow'), 'S2 current-state loader unwraps PostgREST RPC payload shapes');
  assert(vault.includes('coerceUnhcrS2Details'), 'S2 current-state mapper coerces jsonb details before unpack');
  assert(
    /if \(error && !isMissingUnhcrCurrentRpc\(error\.message\)\) \{[\s\S]*return \{ record: null, error: error\.message \};[\s\S]*if \(!error\) \{[\s\S]*mapUnhcrS2CurrentRow\(data\)[\s\S]*if \(record\) return[\s\S]*from\('certificates'\)[\s\S]*eq\('trademark_no', UNHCR_S2_CURRENT_RECORD_ID\)/.test(vault),
    'S2 current-state load falls back to UNHCR-S2-CURRENT when RPC mapping is empty',
  );
  assert(vault.includes("if (rowPresent) return { record: null, error: 'Could not restore Server 2 editor state' }"), 'S2 unmapped current row is an error, not an empty workspace');
  const s2RpcObject = { trademark_no: 'UNHCR-S2-CURRENT', details: packedS2Current };
  const s2RpcArray = [s2RpcObject];
  const s2RpcString = JSON.stringify(s2RpcObject);
  const s2RpcNamed = { get_unhcr_s2_current_state: s2RpcObject };
  assert(coerceUnhcrS2CurrentRpcRow(s2RpcObject)?.trademark_no === 'UNHCR-S2-CURRENT', 'S2 RPC object payload is accepted');
  assert(coerceUnhcrS2CurrentRpcRow(s2RpcArray)?.trademark_no === 'UNHCR-S2-CURRENT', 'S2 RPC one-row array payload is unwrapped');
  assert(coerceUnhcrS2CurrentRpcRow(s2RpcString)?.trademark_no === 'UNHCR-S2-CURRENT', 'S2 RPC JSON-string payload is unwrapped');
  assert(coerceUnhcrS2CurrentRpcRow(s2RpcNamed)?.trademark_no === 'UNHCR-S2-CURRENT', 'S2 RPC named jsonb wrapper is unwrapped');
  assert(coerceUnhcrS2CurrentRpcRow(null) === null, 'S2 RPC null payload stays empty');
  assert(coerceUnhcrS2CurrentRpcRow([]) === null, 'S2 RPC empty array stays empty');
  const restoreS2Current = (payload: unknown) => {
    const row = coerceUnhcrS2CurrentRpcRow(payload);
    return snapshotFromUnhcrS2VaultDoc(unpackDetails(coerceUnhcrS2Details(row?.details)).doc);
  };
  const unwrappedS2Current = coerceUnhcrS2CurrentRpcRow(s2RpcArray);
  const loadedS2FromRpcArray = restoreS2Current(s2RpcArray);
  assert(unwrappedS2Current?.trademark_no === 'UNHCR-S2-CURRENT', 'S2 RPC array still yields the current-state row');
  assert(loadedS2FromRpcArray.name === 'Updated S2 Subject', 'S2 direct open restores fields from wrapped RPC current-state');
  assert(loadedS2FromRpcArray.qrSize === 250 && loadedS2FromRpcArray.photoX === 90, 'S2 direct open restores QR/photo from wrapped RPC current-state');
  assert(loadedS2FromRpcArray.testBarcodeText === 'TEST-UNHCR-BARCODE-0002', 'S2 direct open restores barcodes from wrapped RPC current-state');
  const packedLayout = unpackDetails(packedS2Current).layout;
  const loadedS2FromObjectDetails = restoreS2Current({ trademark_no: 'UNHCR-S2-CURRENT', details: packedLayout });
  assert(loadedS2FromObjectDetails.name === 'Updated S2 Subject', 'S2 direct open restores fields from jsonb object details');
  assert(loadedS2FromObjectDetails.qrSize === 250 && loadedS2FromObjectDetails.testRefNo === 'TEST-UNHCR-REF-0002', 'S2 direct open restores QR/TEST overlays from jsonb object details');
  const loadedS2FromJsonDetails = restoreS2Current({ trademark_no: 'UNHCR-S2-CURRENT', details: JSON.stringify(packedLayout) });
  assert(loadedS2FromJsonDetails.name === 'Updated S2 Subject', 'S2 direct open restores fields from JSON-string details');
  const loadedS2FromBareDoc = restoreS2Current({ trademark_no: 'UNHCR-S2-CURRENT', details: editedUnhcrS2 });
  assert(loadedS2FromBareDoc.name === 'Updated S2 Subject' && loadedS2FromBareDoc.photoX === 90, 'S2 direct open restores a bare snapshot stored as details');
  assert(vault.includes("if (!error) return { record: mapUnhcrCurrentRow(data), error: null };"), 'Server 1 current-state load is unchanged');
  const s2Editor = readFileSync(join(ROOT, 'src/app/studio/editor/unhcr-s2/page.tsx'), 'utf8');
  const s1Editor = readFileSync(join(ROOT, 'src/app/studio/editor/unhcr/page.tsx'), 'utf8');
  assert(s2Editor.includes('getUnhcrS2CurrentState()'), 'Server 2 direct open loads S2 current state');
  assert(s2Editor.includes('copyUnhcrServer1SnapshotToServer2'), 'Server 2 first open copies the current Server 1 template');
  assert(s2Editor.includes('getUnhcrCurrentState()'), 'Server 2 seed reads Server 1 current state once');
  assert(s2Editor.includes('decideUnhcrS2DirectOpenAction'), 'Server 2 direct open uses an explicit load-order decision');
  assert(s2Editor.includes('Loading Server 2 editor'), 'Server 2 waits behind a loading state until current workspace is ready');
  assert(s2Editor.includes('if (!workspaceReady)'), 'Server 2 does not render defaults before current state hydrates');
  assert(s2Editor.includes("seedAction !== 'seed-server1'"), 'Server 2 never seeds Server 1 unless current state is confirmed missing');
  assert(s2Editor.includes('saveUnhcrS2CurrentState'), 'Server 2 Save updates S2 current state');
  assert(!s2Editor.includes('saveUnhcrCurrentState'), 'Server 2 Save does not write Server 1 current state');
  assert(s1Editor.includes('if (current.error || !current.record) return;'), 'Server 1 direct-open guard is unchanged');
  assert(s1Editor.includes('getUnhcrCurrentState()') && !s1Editor.includes('getUnhcrS2CurrentState'), 'Server 1 does not read Server 2 current state');
  assert(!s1Editor.includes('copyUnhcrServer1SnapshotToServer2'), 'Server 1 is not seeded from Server 2');
  const seededFromS1 = copyUnhcrServer1SnapshotToServer2(editedUnhcr);
  assert(seededFromS1.layouts.name.x === 870 && seededFromS1.layouts.name.fontSize === 38, 'S2 seed copies Server 1 field positions and fonts');
  assert(seededFromS1.photoX === 90 && seededFromS1.photoW === 650, 'S2 seed copies Server 1 photo area');
  assert(seededFromS1.barcode1X === 100 && seededFromS1.barcode1W === 680, 'S2 seed copies Server 1 barcode 1');
  assert(seededFromS1.barcode2Y === 1190 && seededFromS1.qrSize === 250, 'S2 seed copies Server 1 barcode 2 and QR');
  assert(seededFromS1.photoDataUrl === TINY_JPEG, 'S2 seed copies Server 1 photo artwork');
  assert(seededFromS1.testBarcodeText === seededFromS1.unhcrNo, 'S2 seed keeps barcode-value overlay on Server 2 rules');
  assert(seededFromS1.testRefNo === UNHCR_TEST_REF_NO_DEFAULT_VALUE, 'S2 seed keeps Server 2 reference overlay defaults');
  assert(seededFromS1.testRefNoX === UNHCR_TEST_REF_NO_DEFAULT.x, 'S2 seed keeps Server 2 reference overlay position');
  const s1Source = JSON.parse(JSON.stringify(editedUnhcr)) as typeof editedUnhcr;
  const s2Copy = copyUnhcrServer1SnapshotToServer2(s1Source);
  s2Copy.layouts.name.x = 1;
  s2Copy.photoX = 1;
  s2Copy.qrSize = 99;
  assert(s1Source.layouts.name.x === 870 && s1Source.photoX === 90 && s1Source.qrSize === 250, 'mutating the S2 seed does not change Server 1 source');
  const packedS1AfterS2Edit = packDetails('', stored, { docKind: 'unhcr', doc: s1Source });
  const packedS2AfterSeedEdit = packDetails('', stored, { docKind: 'unhcr-s2', doc: { ...s2Copy, name: 'S2 Only Subject' } });
  assert(unpackDetails(packedS1AfterS2Edit).docKind === 'unhcr', 'Server 1 pack stays unhcr after S2 seed');
  assert((unpackDetails(packedS1AfterS2Edit).doc as { name: string }).name === 'Updated Subject', 'Server 1 Save stays independent of Server 2');
  assert(unpackDetails(packedS2AfterSeedEdit).docKind === 'unhcr-s2', 'Server 2 pack stays unhcr-s2 after seed');
  assert((unpackDetails(packedS2AfterSeedEdit).doc as { name: string }).name === 'S2 Only Subject', 'Server 2 Save stays independent of Server 1');

  const pdfDoc = {
    fileName: 'brief.pdf',
    pages: [{ id: 'p1', sourceIndex: 0, rotation: 0, sourceRotate: 0, widthPt: 612, heightPt: 792 }],
    annotations: [{ id: 'a1', pageId: 'p1', type: 'text', x: 10, y: 20, width: 80, height: 16, text: 'Hello', fontSize: 12, color: '#000', bold: false }],
    sourceDataUrl: 'data:application/pdf;base64,AAAA',
  };
  const packedPdf = packDetails('', stored, { docKind: 'pdf', doc: pdfDoc });
  const unpackedPdf = unpackDetails(packedPdf);
  assert(unpackedPdf.docKind === 'pdf', 'PDF pack stores docKind');
  assert((unpackedPdf.doc as { fileName: string }).fileName === 'brief.pdf', 'PDF pack restores fileName');
  assert(Array.isArray((unpackedPdf.doc as { annotations: unknown[] }).annotations) && (unpackedPdf.doc as { annotations: unknown[] }).annotations.length === 1, 'PDF pack restores annotations');

  const recoverDoc = normalizeServiceSnapshot(PAGE_RECOVER_CONFIG, { pageName: 'Demo Page', contactEmail: 'a@b.c', issueType: 'hacked' });
  const packedRecover = packDetails('', stored, { docKind: 'page-recover', doc: recoverDoc });
  const unpackedRecover = unpackDetails(packedRecover);
  assert(unpackedRecover.docKind === 'page-recover', 'Recover pack stores docKind');
  assert((unpackedRecover.doc as { pageName: string }).pageName === 'Demo Page', 'Recover pack restores pageName');
  assert((unpackedRecover.doc as { issueType: string }).issueType === 'hacked', 'Recover pack restores issueType');

  const bmDoc = normalizeServiceSnapshot(BUSINESS_MANAGER_CONFIG, { businessName: 'Acme Ltd', requestType: 'restore' });
  const packedBm = packDetails('', stored, { docKind: 'business-manager', doc: bmDoc });
  const unpackedBm = unpackDetails(packedBm);
  assert(unpackedBm.docKind === 'business-manager', 'Business Manager pack stores docKind');
  assert((unpackedBm.doc as { businessName: string }).businessName === 'Acme Ltd', 'Business Manager pack restores businessName');
  assert((unpackedBm.doc as { requestType: string }).requestType === 'restore', 'Business Manager pack restores requestType');

  const packedNoDoc = packDetails(GOODS, stored, { docKind: 'tm' });
  const unpackedNoDoc = unpackDetails(packedNoDoc);
  assert(unpackedNoDoc.doc === undefined, 'certificate rows without a generic doc stay untagged');

  console.log('\n[16] PDF vault serialization round-trips raw bytes\n');
  const sample = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0xff, 0x00, 0x80]);
  const dataUrl = bytesToPdfDataUrl(sample);
  assert(dataUrl.startsWith('data:application/pdf;base64,'), 'PDF data URL uses the pdf mime prefix');
  const restoredBytes = pdfDataUrlToBytes(dataUrl);
  assert(Boolean(restoredBytes) && restoredBytes!.length === sample.length, 'decoded PDF bytes keep the original length');
  assert(Boolean(restoredBytes) && Array.from(restoredBytes!).every((b, i) => b === sample[i]), 'decoded PDF bytes match the original');
  assert(pdfDataUrlToBytes('data:image/png;base64,AAAA') === null, 'non-PDF data URLs are rejected');
  assert(pdfDataUrlToBytes('not-a-data-url') === null, 'malformed data URLs are rejected');

  console.log(`\n${failures === 0 ? '✓ ALL PUBLISH CHECKS PASSED' : `✗ ${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
