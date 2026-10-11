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
import { parseDeleteResult, parseDomains, parseMessageDetail, parseMessageList } from '../src/lib/tempmail/parse';
import { createTempmailClient, TempmailProviderError } from '../src/lib/tempmail/provider';
import { signInboxToken, verifyInboxToken } from '../src/lib/tempmail/token';
import type { FetchLike } from '../src/lib/tempmail/types';
import { hasToolAccess } from '../src/lib/workspace/access';

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
  assert(parseDeleteResult({ result: 'ok' }) === true, 'delete acknowledgement accepted');

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

  console.log('\n[7] tool access + source contracts\n');
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
  assert(inboxRoute.includes('authorizeTempmail') && listRoute.includes('authorizeInboxAccess'), 'routes require session + inbox token');
  assert(itemRoute.includes('authorizeInboxAccess'), 'message detail/delete require inbox token');
  assert(sidebar.includes("scope: 'tempmail'"), 'sidebar gates CYBER TEMPMAIL');

  if (failures) {
    console.error(`\n${failures} tempmail check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tempmail checks passed.');
  console.log('Real RapidAPI connection: NOT verified (mocked responses only).\n');
}

main();
