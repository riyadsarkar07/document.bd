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
};

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
  runtime.__studioSessionCache = { session };
}

export function getCachedSession(): Session | null {
  return runtime.__studioSessionCache?.session ?? null;
}

export function getCachedAccessToken(): string | null {
  return runtime.__studioSessionCache?.session?.access_token ?? null;
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
    accessToken: async () => getCachedAccessToken(),
  });
}

if (!runtime.__studioAuthClient) {
  runtime.__studioAuthClient = createAuthClient();
  runtime.__studioAuthClient.auth.onAuthStateChange((_event, session) => {
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
