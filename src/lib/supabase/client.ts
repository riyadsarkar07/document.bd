import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser Supabase client. Only the public anon/publishable key is used here.
 * The GitHub token and any service-role key must stay on the server.
 */
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jlxccewipidsnjdzirtf.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_ozaVEDyu9IqtKRU1r_b3HA_PPlVPJyQ';

const AUTH_STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

export const WORKSPACE_QUERY_TIMEOUT_MS = 12000;

/** Refresh this many seconds before `exp` so PostgREST never sees a stale JWT. */
export const TOKEN_EXPIRY_SKEW_SECONDS = 30;

export const SESSION_EXPIRED_FLAG = 'studio.sessionExpired';

export function timedOutQuery(message: string) {
  return {
    data: null,
    error: {
      name: 'PostgrestError',
      message,
      details: '',
      hint: '',
      code: '57014',
    },
    count: null,
    status: 408,
    statusText: 'Request Timeout',
    success: false as const,
  };
}

type SessionCache = { session: Session | null };

const runtime = globalThis as unknown as {
  __studioSessionCache?: SessionCache;
  __studioAuthClient?: SupabaseClient;
  __studioDataClient?: SupabaseClient;
  __studioRefreshInFlight?: Promise<string | null>;
  __studioSessionInvalid?: boolean;
  __studioAuthEpoch?: number;
  __studioIgnoreAuthUntilSignIn?: boolean;
};

function authEpoch(): number {
  return runtime.__studioAuthEpoch ?? 0;
}

function bumpAuthEpoch(): void {
  runtime.__studioAuthEpoch = authEpoch() + 1;
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const encoded = padded + pad;
  if (typeof atob === 'function') return atob(encoded);
  return Buffer.from(encoded, 'base64').toString('utf8');
}

function decodeJwtExp(accessToken: string): number | null {
  const parts = accessToken.split('.');
  if (parts.length < 2) return null;
  try {
    const json = JSON.parse(decodeBase64Url(parts[1])) as { exp?: unknown };
    return typeof json.exp === 'number' && Number.isFinite(json.exp) ? json.exp : null;
  } catch {
    return null;
  }
}

/** Unix-seconds expiry for a session JWT (`expires_at` and/or the JWT `exp` claim). */
export function getAccessTokenExpiresAt(session: Session | null | undefined): number | null {
  if (!session?.access_token) return null;
  const claimed =
    typeof session.expires_at === 'number' && Number.isFinite(session.expires_at)
      ? session.expires_at
      : null;
  const jwtExp = decodeJwtExp(session.access_token);
  if (claimed != null && jwtExp != null) return Math.min(claimed, jwtExp);
  return claimed ?? jwtExp;
}

export function isAccessTokenFresh(
  session: Session | null | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!session?.access_token) return false;
  const expiresAt = getAccessTokenExpiresAt(session);
  if (expiresAt == null) return true;
  return expiresAt - TOKEN_EXPIRY_SKEW_SECONDS > nowSeconds;
}

function readSessionFromStorage(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { currentSession?: Session } | Session;
    const session =
      parsed && typeof parsed === 'object' && 'currentSession' in parsed && parsed.currentSession
        ? parsed.currentSession
        : (parsed as Session);
    if (session && typeof session === 'object' && typeof session.access_token === 'string') {
      return session;
    }
  } catch {
    // ignore corrupt / private-mode storage
  }
  return null;
}

if (!runtime.__studioSessionCache) {
  runtime.__studioSessionCache = { session: readSessionFromStorage() };
}

export function rememberSession(session: Session | null): void {
  if (!session) {
    runtime.__studioSessionCache = { session: null };
    return;
  }
  const current = runtime.__studioSessionCache?.session ?? null;
  const sameUser =
    !current?.user?.id || !session.user?.id || current.user.id === session.user.id;
  if (
    sameUser &&
    current?.access_token &&
    current.access_token !== session.access_token
  ) {
    const currentExp = getAccessTokenExpiresAt(current) ?? 0;
    const nextExp = getAccessTokenExpiresAt(session) ?? 0;
    if (nextExp < currentExp) return;
  }
  runtime.__studioSessionInvalid = false;
  runtime.__studioSessionCache = { session };
}

export function getCachedSession(): Session | null {
  return runtime.__studioSessionCache?.session ?? null;
}

/**
 * Synchronous token for callers that cannot await. Returns null when the
 * cached JWT is missing or already expired so we never hand out a known-stale
 * bearer token. Authenticated fetches should use `ensureFreshAccessToken()`.
 */
export function getCachedAccessToken(): string | null {
  const session = runtime.__studioSessionCache?.session ?? null;
  if (!isAccessTokenFresh(session)) return null;
  return session?.access_token ?? null;
}

function markSessionExpiredFlag(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SESSION_EXPIRED_FLAG, '1');
  } catch {
    // ignore quota / private mode
  }
}

function isGenuineRefreshFailure(error: {
  status?: number;
  code?: string;
  message?: string;
} | null): boolean {
  if (!error) return true;
  const status = error.status;
  if (status === 400 || status === 401 || status === 403) return true;
  const code = (error.code ?? '').toLowerCase();
  if (/refresh_token|invalid_grant|session_not_found|user_not_found/.test(code)) return true;
  const msg = (error.message ?? '').toLowerCase();
  if (/timed out|network|fetch/.test(msg)) return false;
  return /invalid.*(token|grant|session)|refresh token|jwt expired|session.*not found/.test(msg);
}

function adoptFreshSessionFromStorage(): string | null {
  const stored = readSessionFromStorage();
  if (!isAccessTokenFresh(stored)) return null;
  rememberSession(stored);
  return stored!.access_token;
}

/** Voluntary sign-out: drop the cache and ignore any in-flight refresh result. */
export function beginLocalSignOut(): void {
  bumpAuthEpoch();
  runtime.__studioSessionInvalid = false;
  runtime.__studioIgnoreAuthUntilSignIn = true;
  rememberSession(null);
}

export function shouldIgnoreAuthEvent(event: string): boolean {
  return Boolean(runtime.__studioIgnoreAuthUntilSignIn) && event !== 'SIGNED_IN';
}

async function invalidateStudioSession(): Promise<void> {
  if (runtime.__studioSessionInvalid) {
    rememberSession(null);
    return;
  }
  bumpAuthEpoch();
  runtime.__studioSessionInvalid = true;
  rememberSession(null);
  markSessionExpiredFlag();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('studio:session-invalid'));
  }
  try {
    await runtime.__studioAuthClient?.auth.signOut({ scope: 'local' });
  } catch {
    // local sign-out is best-effort; cache is already cleared
  }
}

async function refreshAccessToken(refreshToken: string, epoch: number): Promise<string | null> {
  const latest = getCachedSession();
  if (isAccessTokenFresh(latest)) return latest!.access_token;
  const storedHit = adoptFreshSessionFromStorage();
  if (storedHit) return storedHit;

  const auth = runtime.__studioAuthClient;
  if (!auth) return null;

  const fallback = {
    data: { session: null, user: null },
    error: { message: 'Refresh timed out', status: 408, code: '57014' },
  };

  const { data, error } = await settleWithTimeout(
    auth.auth.refreshSession({ refresh_token: refreshToken }),
    fallback,
    8000,
  );

  if (authEpoch() !== epoch) return null;

  if (data?.session?.access_token) {
    rememberSession(data.session);
    return data.session.access_token;
  }

  const raced = getCachedSession();
  if (isAccessTokenFresh(raced)) return raced!.access_token;
  const storedAfter = adoptFreshSessionFromStorage();
  if (storedAfter) return storedAfter;

  if (authEpoch() !== epoch) return null;

  if (isGenuineRefreshFailure(error)) {
    await invalidateStudioSession();
  }
  return null;
}

/**
 * Returns a non-expired access token, refreshing once (single-flight) when
 * the cached JWT is past skew. Never returns a known-expired JWT. Does not
 * call getSession()/getUser() — workspace loaders stay off the GoTrue lock.
 */
export function isRefreshingAccessToken(): boolean {
  return Boolean(runtime.__studioRefreshInFlight);
}

export async function ensureFreshAccessToken(): Promise<string | null> {
  if (runtime.__studioSessionInvalid) return null;

  const cached = getCachedSession();
  if (isAccessTokenFresh(cached)) return cached!.access_token;

  if (!cached?.refresh_token) {
    if (cached?.access_token) await invalidateStudioSession();
    return null;
  }

  if (!runtime.__studioRefreshInFlight) {
    const epoch = authEpoch();
    runtime.__studioRefreshInFlight = refreshAccessToken(cached.refresh_token, epoch).finally(() => {
      runtime.__studioRefreshInFlight = undefined;
    });
  }
  return runtime.__studioRefreshInFlight;
}

/**
 * Always-settling race. Workspace loaders must not stay pending if GoTrue or
 * PostgREST never returns.
 */
export function settleWithTimeout<T>(
  promise: PromiseLike<T>,
  fallback: unknown,
  ms: number = WORKSPACE_QUERY_TIMEOUT_MS,
): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallback as T);
    }, ms);
    Promise.resolve(promise).then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(fallback as T);
      },
    );
  });
}

/**
 * No-op lock so older supabase-js builds that defaulted to navigator.locks
 * cannot pin getSession()/PostgREST forever across tabs.
 */
async function noOpLock<R>(_name: string, _timeout: number, fn: () => Promise<R>): Promise<R> {
  return await fn();
}

function createAuthClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      lock: noOpLock,
      lockAcquireTimeout: 2500,
    },
  });
}

function createDataClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      lock: noOpLock,
      lockAcquireTimeout: 2500,
    },
    accessToken: async () => ensureFreshAccessToken(),
  });
}

if (!runtime.__studioAuthClient) {
  runtime.__studioAuthClient = createAuthClient();
  runtime.__studioAuthClient.auth.onAuthStateChange((event, session) => {
    if (runtime.__studioIgnoreAuthUntilSignIn) {
      if (event === 'SIGNED_IN' && session) {
        runtime.__studioIgnoreAuthUntilSignIn = false;
        rememberSession(session);
      }
      return;
    }
    if (event === 'SIGNED_OUT') {
      if (runtime.__studioRefreshInFlight) return;
      if (isAccessTokenFresh(getCachedSession())) return;
      runtime.__studioSessionInvalid = false;
      rememberSession(null);
      return;
    }
    rememberSession(session);
  });
  if (typeof window !== 'undefined') {
    void runtime.__studioAuthClient.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (session) rememberSession(session);
      })
      .catch(() => {
        // keep whatever was seeded from storage
      });
  }
}

if (!runtime.__studioDataClient) {
  runtime.__studioDataClient = createDataClient();
}

/** Auth client — sign-in, sign-out, getSession, onAuthStateChange. */
export const supabase = runtime.__studioAuthClient;

/**
 * Data client — PostgREST/RPC/storage. Uses the in-memory session token and
 * never calls getSession(), so vault/templates/projects cannot deadlock on
 * GoTrue initialize / navigator.lock / refresh single-flight.
 */
export const supabaseData = runtime.__studioDataClient;

export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
