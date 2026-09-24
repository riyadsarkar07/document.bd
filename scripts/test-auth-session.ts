/**
 * Auth session / JWT refresh contract.
 *
 * Verifies that an expired access token is never handed to PostgREST, that
 * refresh is single-flight, and that a genuine refresh failure clears the
 * cached session instead of retrying 401s.
 *
 * Run with: npx tsx scripts/test-auth-session.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Session } from '@supabase/supabase-js';
import {
  getAccessTokenExpiresAt,
  getCachedAccessToken,
  getCachedSession,
  isAccessTokenFresh,
  rememberSession,
  TOKEN_EXPIRY_SKEW_SECONDS,
} from '../src/lib/supabase/client';

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

function b64url(json: object): string {
  return Buffer.from(JSON.stringify(json))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fakeJwt(exp: number): string {
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ sub: 'user-1', exp })}.sig`;
}

function fakeSession(overrides: Partial<Session> & { exp: number }): Session {
  const access_token = fakeJwt(overrides.exp);
  return {
    access_token,
    refresh_token: overrides.refresh_token ?? 'refresh-token',
    expires_in: 3600,
    expires_at: overrides.expires_at ?? overrides.exp,
    token_type: 'bearer',
    user: {
      id: 'user-1',
      email: 'user@example.com',
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2024-01-01T00:00:00.000Z',
    },
    ...overrides,
  } as Session;
}

function main() {
  console.log('\n[1] expiry helpers\n');
  const now = Math.floor(Date.now() / 1000);
  const fresh = fakeSession({ exp: now + 3600 });
  const stale = fakeSession({ exp: now - 10 });
  const nearExpiry = fakeSession({ exp: now + TOKEN_EXPIRY_SKEW_SECONDS - 1 });

  assert(getAccessTokenExpiresAt(fresh) === now + 3600, 'reads JWT exp / expires_at');
  assert(isAccessTokenFresh(fresh, now) === true, 'unexpired token is fresh');
  assert(isAccessTokenFresh(stale, now) === false, 'expired token is not fresh');
  assert(isAccessTokenFresh(nearExpiry, now) === false, 'token inside skew window is not treated as fresh');
  assert(isAccessTokenFresh(null, now) === false, 'missing session is not fresh');

  console.log('\n[2] cached token never returns a known-expired JWT\n');
  rememberSession(fresh);
  assert(getCachedAccessToken() === fresh.access_token, 'fresh cached token is returned');
  rememberSession(null);
  rememberSession(stale);
  assert(getCachedAccessToken() === null, 'expired cached token is not returned');
  assert(getCachedSession()?.access_token === stale.access_token, 'expired session stays in cache until refresh/invalidation');
  rememberSession(null);
  assert(getCachedAccessToken() === null, 'cleared session returns no token');
  assert(getCachedSession() === null, 'cleared session is null');

  console.log('\n[3] rememberSession does not regress to an older JWT\n');
  const older = fakeSession({ exp: now + 60, access_token: fakeJwt(now + 60), expires_at: now + 60 });
  const newer = fakeSession({ exp: now + 3600, access_token: fakeJwt(now + 3600), expires_at: now + 3600 });
  rememberSession(newer);
  rememberSession(older);
  assert(getCachedSession()?.access_token === newer.access_token, 'older JWT cannot overwrite a newer cached token');
  rememberSession(null);

  console.log('\n[4] source contract — dual client + refresh, no getSession on data path\n');
  const clientSrc = readFileSync(join(ROOT, 'src/lib/supabase/client.ts'), 'utf8');
  const authSrc = readFileSync(join(ROOT, 'src/lib/auth/auth-context.tsx'), 'utf8');
  const storeSrc = readFileSync(join(ROOT, 'src/lib/workspace/store.ts'), 'utf8');
  const vaultSrc = readFileSync(join(ROOT, 'src/lib/workspace/vault.ts'), 'utf8');
  const loginSrc = readFileSync(join(ROOT, 'src/app/login/page.tsx'), 'utf8');
  const publishSrc = readFileSync(join(ROOT, 'src/lib/publish/publish-client.ts'), 'utf8');
  const captureSrc = readFileSync(join(ROOT, 'src/lib/bug-hunter/capture.ts'), 'utf8');

  assert(clientSrc.includes('export const supabase'), 'auth client exported');
  assert(clientSrc.includes('export const supabaseData'), 'data client exported');
  assert(clientSrc.includes('accessToken: async () => ensureFreshAccessToken()'), 'PostgREST Authorization comes from ensureFreshAccessToken');
  assert(clientSrc.includes('auth.auth.refreshSession({ refresh_token: refreshToken })'), 'refreshSession is used when the access token is expired');
  assert(clientSrc.includes('__studioRefreshInFlight'), 'refresh is single-flight');
  assert(!/supabaseData[\s\S]{0,200}getSession\(/.test(clientSrc), 'data client factory does not call getSession');
  assert(!storeSrc.includes('supabase.auth.getSession()'), 'workspace store does not wait on getSession');
  assert(!storeSrc.includes('supabase.auth.getUser('), 'workspace store does not call getUser');
  assert(!vaultSrc.includes('supabase.auth.getSession()'), 'vault does not wait on getSession');
  assert(!vaultSrc.includes('supabase.auth.getUser('), 'vault does not call getUser');
  assert(!authSrc.includes('supabase.auth.getUser('), 'AuthProvider never calls getUser');
  assert(authSrc.includes('studio:session-invalid'), 'invalid sessions notify AuthProvider');
  assert(loginSrc.includes('Your session has expired. Please sign in again.'), 'login shows session-expired state');
  assert(publishSrc.includes('ensureFreshAccessToken'), 'publish client refreshes before sending a bearer token');
  assert(captureSrc.includes('ensureFreshAccessToken'), 'Bug Hunter ingest refreshes before sending a bearer token');
  assert(clientSrc.includes('invalidateStudioSession'), 'genuine refresh failure clears authenticated state');
  assert(clientSrc.includes("signOut({ scope: 'local' })"), 'invalid session is signed out locally');
  assert(clientSrc.includes('beginLocalSignOut') && clientSrc.includes('__studioAuthEpoch'), 'in-flight refresh cannot resurrect a signed-out session');
  assert(authSrc.includes('beginLocalSignOut()'), 'signOut clears the session cache before GoTrue signOut');
  assert(authSrc.includes('shouldIgnoreAuthEvent(event)'), 'TOKEN_REFRESHED after logout cannot restore the signed-out user');

  if (failures) {
    console.error(`\n${failures} auth session check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll auth session checks passed.\n');
}

main();
