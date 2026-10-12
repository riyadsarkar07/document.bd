/**
 * CYBER TEMPMAIL — mocked RapidAPI contract tests.
 *
 * Inbox creation, message retrieval, invalid credentials, provider errors,
 * and rate limits are exercised against the Privatix Temp Mail client with
 * fake RapidAPI responses. No live RapidAPI request is made.
 *
 * Run with: npm run test:tempmail
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mailboxMd5, isValidTempmailAddress, isValidMailId, buildAddress } from '../src/lib/tempmail/hash';
import {
  parseAttachments,
  parseAttachmentFile,
  parseDeleteResult,
  parseDomains,
  parseMessageDetail,
  parseMessageList,
  parseSourceMessage,
} from '../src/lib/tempmail/parse';
import { createTempmailClient, TempmailProviderError } from '../src/lib/tempmail/provider';
import { signInboxToken, verifyInboxToken } from '../src/lib/tempmail/token';
import { messageBelongsToInbox } from '../src/lib/tempmail/ownership';
import { evaluateAccountMutation } from '../src/lib/auth/roles';
import type { FetchLike } from '../src/lib/tempmail/types';
import { hasToolAccess } from '../src/lib/workspace/access';
import { shouldGenerateTempmailAddress, TEMPMAIL_NO_INBOX_COPY } from '../src/lib/tempmail/lifecycle';
import { getTempmailConfig } from '../src/lib/tempmail/config';

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

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...(headers ?? {}) },
  });
}

function mockFetch(handler: (url: string) => Response | Promise<Response>): FetchLike {
  return async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    return handler(url);
  };
}

const config = {
  configured: true as const,
  apiKey: 'test-rapidapi-key',
  host: 'privatix-temp-mail-v1.p.rapidapi.com',
  baseUrl: 'https://privatix-temp-mail-v1.p.rapidapi.com',
  inboxSecret: 'test-inbox-secret',
};

async function expectProviderError(
  fn: () => Promise<unknown>,
  code: string,
  status: number,
  label: string,
) {
  try {
    await fn();
    assert(false, label);
  } catch (err) {
    const ok =
      err instanceof TempmailProviderError && err.code === code && err.status === status;
    assert(ok, label);
  }
}

function main() {
  void run();
}

async function run() {
  console.log('\n[1] mailbox hashing + validation\n');
  assert(mailboxMd5('User@Example.COM') === mailboxMd5('user@example.com'), 'md5 is case-insensitive');
  assert(mailboxMd5('demo@tempmail.test').length === 32, 'md5 is 32 hex chars');
  assert(isValidTempmailAddress('alpha9@temp-mail.org') === true, 'valid address accepted');
  assert(isValidTempmailAddress('not-an-email') === false, 'invalid address rejected');
  assert(isValidMailId('a48b927e-3a24-42ff-a748-d516e5474f85') === true, 'uuid mail id accepted');
  assert(isValidMailId('../etc/passwd') === false, 'path-like mail id rejected');
  assert(buildAddress('Alpha', '@Temp-Mail.org') === 'alpha@temp-mail.org', 'address is normalized');

  console.log('\n[2] inbox token authorization\n');
  const token = signInboxToken({ userId: 'user-a', email: 'a@temp.test', issuedAt: Date.now() }, 'secret');
  const ok = verifyInboxToken(token, 'secret', 'user-a');
  assert(ok.ok && ok.ok === true && ok.payload.email === 'a@temp.test', 'owner can use their inbox token');
  const other = verifyInboxToken(token, 'secret', 'user-b');
  assert(!other.ok, 'other user cannot use this inbox token');
  const forged = verifyInboxToken(token, 'other-secret', 'user-a');
  assert(!forged.ok, 'wrong HMAC secret is rejected');
  const expired = signInboxToken({ userId: 'user-a', email: 'a@temp.test', issuedAt: Date.now() - 48 * 60 * 60 * 1000 }, 'secret');
  assert(!verifyInboxToken(expired, 'secret', 'user-a').ok, 'expired inbox token is rejected');

  console.log('\n[3] provider payload parsing\n');
  assert(
    parseDomains(['@1secmail.com', 'guerrillamail.com']).join(',') === '1secmail.com,guerrillamail.com',
    'domain list strips @ and lowercases',
  );
  assert(parseMessageList([]).length === 0, 'empty array is an empty inbox');
  assert(parseMessageList('There are no emails yet').length === 0, 'empty mailbox string is empty inbox');
  const listed = parseMessageList([
    {
      mail_id: 'mail-1',
      mail_from: 'Service <no-reply@service.com>',
      mail_subject: 'Welcome!',
      mail_timestamp: '1702720800',
      mail_text: 'Hello there',
    },
  ]);
  assert(listed.length === 1 && listed[0].id === 'mail-1' && listed[0].subject === 'Welcome!', 'message list parsed');
  assert(listed[0].from.includes('no-reply@service.com'), 'sender parsed');
  const detail = parseMessageDetail({
    mail_id: 'mail-1',
    mail_from: 'no-reply@service.com',
    mail_subject: 'Welcome!',
    mail_text: 'Hello there',
    mail_html: '<p>Hello there</p>',
    mail_to: 'user@temp.test',
  });
  assert(detail.text === 'Hello there' && detail.html.includes('Hello'), 'message body parsed');
  assert(detail.attachments.length === 0, 'message without attachments has empty list');
  assert(parseDeleteResult({ result: 'ok' }) === true, 'delete acknowledgement accepted');
  assert(parseSourceMessage({ data: 'From: a@b.c' }) === 'From: a@b.c', 'source payload parsed');
  const atts = parseAttachments([{ id: 'att-1', name: 'otp.txt', size: 12, content_type: 'text/plain' }]);
  assert(atts.length === 1 && atts[0].id === 'att-1', 'attachment list parsed');
  const file = parseAttachmentFile({ body: Buffer.from('hi').toString('base64'), filename: 'otp.txt' }, 'att-1');
  assert(file.filename === 'otp.txt' && file.base64.length > 0, 'attachment file parsed');

  console.log('\n[4] inbox creation (mocked RapidAPI domains)\n');
  const createClient = createTempmailClient(
    config,
    mockFetch((url) => {
      assert(url.endsWith('/request/domains/'), 'create inbox hits GET /request/domains/');
      return jsonResponse(200, ['@temp-mail.org', 'disposable.test']);
    }),
  );
  const created = await createClient.createInbox();
  assert(created.email.endsWith(`@${created.domain}`), 'generated address uses a provider domain');
  assert(isValidTempmailAddress(created.email), 'generated address is valid');

  console.log('\n[5] message retrieval (mocked RapidAPI inbox)\n');
  const listClient = createTempmailClient(
    config,
    mockFetch((url) => {
      const md5 = mailboxMd5('demo@temp-mail.org');
      assert(url.includes(`/request/mail/id/${md5}/`), 'list uses md5 of the mailbox');
      return jsonResponse(200, [
        {
          mail_id: 'abc123',
          mail_from: 'alerts@bank.test',
          mail_subject: 'OTP',
          mail_text: 'Your code is 4421',
          mail_timestamp: '1702720800',
        },
      ]);
    }),
  );
  const messages = await listClient.listMessages('demo@temp-mail.org');
  assert(messages.length === 1 && messages[0].subject === 'OTP', 'inbox messages returned');

  const readClient = createTempmailClient(
    config,
    mockFetch((url) => {
      assert(url.includes('/request/one_mail/id/abc123/'), 'read hits GET /request/one_mail/id/{mail_id}/');
      return jsonResponse(200, {
        mail_id: 'abc123',
        mail_from: 'alerts@bank.test',
        mail_subject: 'OTP',
        mail_text: 'Your code is 4421',
      });
    }),
  );
  const read = await readClient.readMessage('abc123');
  assert(read.text.includes('4421'), 'message detail returned');

  const deleteClient = createTempmailClient(
    config,
    mockFetch((url) => {
      assert(url.includes('/request/delete/id/abc123/'), 'delete hits GET /request/delete/id/{mail_id}/');
      return jsonResponse(200, { success: true });
    }),
  );
  assert((await deleteClient.deleteMessage('abc123')) === true, 'delete acknowledgement returned');

  const sourceClient = createTempmailClient(
    config,
    mockFetch((url) => {
      assert(url.includes('/request/source/id/abc123/'), 'source hits GET /request/source/id/{mail_id}/');
      return jsonResponse(200, { data: 'From: alerts@bank.test' });
    }),
  );
  assert((await sourceClient.sourceMessage('abc123')).includes('alerts@bank.test'), 'source message returned');

  const attClient = createTempmailClient(
    config,
    mockFetch((url) => {
      assert(url.includes('/request/attachments/id/abc123/'), 'attachments hits GET /request/attachments/id/{mail_id}/');
      return jsonResponse(200, [{ id: 'att-1', name: 'otp.txt' }]);
    }),
  );
  assert((await attClient.listAttachments('abc123'))[0].id === 'att-1', 'attachment list returned');

  const oneAttClient = createTempmailClient(
    config,
    mockFetch((url) => {
      assert(
        url.includes('/request/one_attachment/id/abc123/id/att-1/'),
        'one attachment hits GET /request/one_attachment/id/{mail_id}/id/{attachment_id}/',
      );
      return jsonResponse(200, { body: 'aGk=', filename: 'otp.txt', content_type: 'text/plain' });
    }),
  );
  assert((await oneAttClient.getAttachment('abc123', 'att-1')).filename === 'otp.txt', 'one attachment returned');

  console.log('\n[6] invalid credentials / provider errors / rate limits\n');
  await expectProviderError(
    () =>
      createTempmailClient(
        config,
        mockFetch(() => jsonResponse(401, { message: 'Invalid API key' })),
      ).listDomains(),
    'unauthorized',
    401,
    '401 maps to unauthorized',
  );
  await expectProviderError(
    () =>
      createTempmailClient(
        config,
        mockFetch(() => jsonResponse(403, { message: 'Not subscribed' })),
      ).listDomains(),
    'forbidden',
    403,
    '403 maps to forbidden',
  );
  await expectProviderError(
    () =>
      createTempmailClient(
        config,
        mockFetch(() => jsonResponse(429, { message: 'Rate limit' }, { 'Retry-After': '12' })),
      ).listDomains(),
    'rate_limited',
    429,
    '429 maps to rate_limited',
  );
  await expectProviderError(
    () =>
      createTempmailClient(
        config,
        mockFetch(() => jsonResponse(500, { message: 'upstream failed' })),
      ).listDomains(),
    'provider_error',
    500,
    '500 maps to provider_error',
  );

  console.log('\n[7] ownership + last-admin protection\n');
  assert(messageBelongsToInbox('user@temp.test', 'user@temp.test') === true, 'owner recipient matches inbox');
  assert(messageBelongsToInbox('Other <other@temp.test>', 'user@temp.test') === false, 'foreign recipient is rejected');
  assert(messageBelongsToInbox('', 'user@temp.test') === true, 'empty recipient does not fail closed on missing to');
  const lastAdmin = evaluateAccountMutation({
    actorId: 'admin-a',
    actorRole: 'admin',
    targetId: 'admin-b',
    targetRole: 'admin',
    targetStatus: 'active',
    nextRole: 'viewer',
    activeAdminCount: 1,
  });
  assert(!lastAdmin.ok && lastAdmin.status === 409, 'last admin cannot be demoted');
  const viewerBlocked = evaluateAccountMutation({
    actorId: 'user-1',
    actorRole: 'viewer',
    targetId: 'user-2',
    targetRole: 'viewer',
    targetStatus: 'active',
    nextStatus: 'disabled',
    activeAdminCount: 1,
  });
  assert(!viewerBlocked.ok && viewerBlocked.status === 403, 'non-admin cannot disable users');
  const selfBlocked = evaluateAccountMutation({
    actorId: 'admin-a',
    actorRole: 'admin',
    targetId: 'admin-a',
    targetRole: 'admin',
    targetStatus: 'active',
    nextRole: 'viewer',
    activeAdminCount: 2,
  });
  assert(!selfBlocked.ok, 'admin cannot change own role');
  const okDemote = evaluateAccountMutation({
    actorId: 'admin-a',
    actorRole: 'admin',
    targetId: 'admin-b',
    targetRole: 'admin',
    targetStatus: 'active',
    nextRole: 'editor',
    activeAdminCount: 2,
  });
  assert(okDemote.ok, 'second admin can be demoted');

  console.log('\n[8] tool access + source contracts\n');
  assert(hasToolAccess({ role: 'viewer', allowed_tools: ['tempmail'] }, 'tempmail') === true, 'tempmail scope granted');
  assert(hasToolAccess({ role: 'viewer', allowed_tools: ['tm'] }, 'tempmail') === false, 'unrelated scope denied');

  const envExample = readFileSync(join(ROOT, '.env.example'), 'utf8');
  assert(envExample.includes('RAPIDAPI_KEY=your-rapidapi-key-here'), '.env.example has RAPIDAPI_KEY placeholder');
  assert(envExample.includes('privatix-temp-mail-v1.p.rapidapi.com'), '.env.example has verified RapidAPI host');
  assert(!/RAPIDAPI_KEY=\s*[a-z0-9]{16,}/i.test(envExample.replace('your-rapidapi-key-here', '')), 'no live key in .env.example');

  const page = readFileSync(join(ROOT, 'src/app/studio/tempmail/page.tsx'), 'utf8');
  const client = readFileSync(join(ROOT, 'src/lib/tempmail/client.ts'), 'utf8');
  const provider = readFileSync(join(ROOT, 'src/lib/tempmail/provider.ts'), 'utf8');
  const configSrc = readFileSync(join(ROOT, 'src/lib/tempmail/config.ts'), 'utf8');
  const inboxRoute = readFileSync(join(ROOT, 'src/app/api/tempmail/inbox/route.ts'), 'utf8');
  const listRoute = readFileSync(join(ROOT, 'src/app/api/tempmail/messages/route.ts'), 'utf8');
  const itemRoute = readFileSync(join(ROOT, 'src/app/api/tempmail/messages/[id]/route.ts'), 'utf8');
  const sidebar = readFileSync(join(ROOT, 'src/components/layout/sidebar.tsx'), 'utf8');

  assert(page.includes('CYBER TEMPMAIL'), 'studio page titled CYBER TEMPMAIL');
  assert(page.includes('Copy') && page.includes('Refresh inbox'), 'copy and refresh controls exist');
  assert(!page.includes('RAPIDAPI_KEY') && !client.includes('RAPIDAPI_KEY'), 'frontend never reads RAPIDAPI_KEY');
  assert(!page.includes('X-RapidAPI-Key') && !client.includes('X-RapidAPI-Key'), 'frontend never sends RapidAPI headers');
  assert(provider.includes('X-RapidAPI-Key') && configSrc.includes('privatix-temp-mail-v1.p.rapidapi.com'), 'server client uses verified RapidAPI host');
  assert(provider.includes('/request/domains/'), 'server client uses verified domains endpoint');
  assert(provider.includes('/request/mail/id/'), 'server client uses verified inbox endpoint');
  assert(provider.includes('/request/one_mail/id/'), 'server client uses verified message endpoint');
  assert(provider.includes('/request/delete/id/'), 'server client uses verified delete endpoint');
  assert(provider.includes('/request/source/id/'), 'server client uses verified source endpoint');
  assert(provider.includes('/request/attachments/id/'), 'server client uses verified attachments endpoint');
  assert(provider.includes('/request/one_attachment/id/'), 'server client uses verified one_attachment endpoint');
  assert(inboxRoute.includes('authorizeTempmail') && listRoute.includes('authorizeInboxAccess'), 'routes require session + inbox token');
  assert(itemRoute.includes('authorizeInboxAccess'), 'message detail/delete require inbox token');
  assert(itemRoute.includes('assertMessageOwnership'), 'message routes validate inbox ownership');
  assert(sidebar.includes("scope: 'tempmail'"), 'sidebar gates CYBER TEMPMAIL');
  assert(sidebar.includes('/studio/tempmail/admin'), 'sidebar has Temp Mail Admin');
  assert(sidebar.includes('/studio/admins'), 'sidebar has Admins view');
  assert(sidebar.includes("label: 'Users'"), 'sidebar has Users view');
  const adminStatus = readFileSync(join(ROOT, 'src/app/api/tempmail/admin/status/route.ts'), 'utf8');
  const accountsRoute = readFileSync(join(ROOT, 'src/app/api/admin/accounts/route.ts'), 'utf8');
  const accountPatch = readFileSync(join(ROOT, 'src/app/api/admin/accounts/[id]/route.ts'), 'utf8');
  assert(adminStatus.includes('authorizeTempmailAdmin'), 'admin status is server-protected');
  assert(accountsRoute.includes('authorizeTempmailAdmin'), 'account list is server-protected');
  assert(accountPatch.includes('evaluateAccountMutation'), 'account updates enforce last-admin protection');

  console.log('\n[9] never auto-generate addresses on load / refresh\n');
  assert(shouldGenerateTempmailAddress('page_load') === false, 'page load does not generate an address');
  assert(shouldGenerateTempmailAddress('page_refresh') === false, 'page refresh does not generate an address');
  assert(shouldGenerateTempmailAddress('sign_in') === false, 'sign-in does not generate an address');
  assert(shouldGenerateTempmailAddress('navigation') === false, 'navigation does not generate an address');
  assert(shouldGenerateTempmailAddress('tab_return') === false, 'tab return does not generate an address');
  assert(shouldGenerateTempmailAddress('poll') === false, 'polling does not generate an address');
  assert(shouldGenerateTempmailAddress('health_check') === false, 'health check does not generate an address');
  assert(shouldGenerateTempmailAddress('domain_load') === false, 'domain loading does not generate an address');
  assert(shouldGenerateTempmailAddress('admin_init') === false, 'admin dashboard init does not generate an address');
  assert(shouldGenerateTempmailAddress('inbox_refresh') === false, 'inbox refresh does not generate an address');
  assert(shouldGenerateTempmailAddress('new_address') === true, 'explicit New address action does generate');

  const hydrateBlock = page.slice(page.indexOf('useEffect(() => {'), page.indexOf('}, [refreshInbox]);'));
  assert(hydrateBlock.includes('readStoredInbox()'), 'page load restores stored inbox when present');
  assert(hydrateBlock.includes('if (!stored) return;'), 'page load returns without creating when no address exists');
  assert(!hydrateBlock.includes('generateInbox'), 'page load effect never calls generateInbox');
  assert(page.includes('TEMPMAIL_NO_INBOX_COPY'), 'empty state uses TEMPMAIL_NO_INBOX_COPY');
  assert(
    TEMPMAIL_NO_INBOX_COPY === 'No inbox yet. Click New address to generate one.',
    'empty state tells the user to click New address',
  );
  assert(page.includes('generatingRef.current'), 'client blocks duplicate New address clicks');
  assert(page.includes("disabled={createState === 'loading'}"), 'New address button disables while generating');
  const generateInvocations = page.match(/generateInbox\(\)/g) ?? [];
  const clickGenerations = page.match(/onClick=\{\(\) => void generateInbox\(\)\}/g) ?? [];
  assert(generateInvocations.length === clickGenerations.length, 'generateInbox() is only invoked from click handlers');
  assert(clickGenerations.length >= 1, 'explicit New address click still generates');
  assert(page.includes('disabled={!inbox || inboxState === \'loading\'}'), 'Refresh inbox is disabled without an address');
  assert(!page.includes('inbox ? void refreshInbox(inbox) : void generateInbox()'), 'Retry no longer generates an address');
  assert(inboxRoute.includes('creatingUsers'), 'inbox POST rejects overlapping generation requests');
  assert(inboxRoute.includes("export async function GET()"), 'inbox GET exists');
  assert(inboxRoute.includes("Allow: 'POST'"), 'inbox GET does not create; method is POST-only');
  assert(!adminStatus.includes('createInbox'), 'admin status health check does not create inboxes');
  assert(adminStatus.includes('listDomains'), 'admin status only loads domains for connectivity');
  const schema = readFileSync(join(ROOT, 'supabase/schema.sql'), 'utf8');
  const migration = readFileSync(join(ROOT, 'supabase/migrations/20261011_prevent_last_admin_loss.sql'), 'utf8');
  assert(schema.includes('prevent_last_admin_loss'), 'schema includes last-admin trigger');
  assert(migration.includes('profiles_prevent_last_admin_loss'), 'approved migration file includes last-admin trigger');

  console.log('\n[10] live Privatix RapidAPI probe (domains / subscription only)\n');
  const liveConfig = getTempmailConfig();
  if (!liveConfig.configured) {
    assert(true, 'RAPIDAPI_KEY is not configured in this environment — live endpoints cannot be marked verified');
    console.log('  SKIP  live RapidAPI (not configured)');
    console.log('  SKIP  inbox refresh / read / delete / source / attachments (require a user-generated mailbox)');
  } else {
    try {
      const live = createTempmailClient(liveConfig);
      const domains = await live.listDomains();
      assert(domains.length > 0, `live GET /request/domains/ returned ${domains.length} domain(s)`);
      console.log(`  INFO  live domains connected (${domains.length})`);
      console.log('  SKIP  inbox refresh / read / delete / source / attachments (not auto-generated; need an existing mailbox)');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'live probe failed';
      assert(false, `live GET /request/domains/ failed: ${message}`);
    }
  }

  if (failures) {
    console.error(`\n${failures} tempmail check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tempmail checks passed.');
  if (!liveConfig.configured) {
    console.log('Real RapidAPI connection: NOT verified (RAPIDAPI_KEY missing in this environment).\n');
  }
}

main();
