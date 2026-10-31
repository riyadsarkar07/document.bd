/**
 * Server-only GitHub Git Data API client for the publish pipeline.
 *
 * Pushes `data.json` and `<TM_NUMBER>.jpg` into the separate
 * `dpdt-govbd-main` repository (public verification portal) as a single
 * atomic Git commit. Reads the latest HEAD tree on every publish so
 * concurrent writers never clobber each other (optimistic concurrency +
 * retry on non-fast-forward conflicts).
 *
 * IMPORTANT: This module reads the publish PAT from the server environment at
 * request time (never a Next.js build-time inline) and must NEVER be imported
 * from any client component. Token values must never appear in errors, logs,
 * or API responses.
 */

export interface GitHubEnv {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  tokenSource: string;
}

export type GitHubErrorCode =
  | 'auth'
  | 'permission'
  | 'not_found'
  | 'conflict'
  | 'rate_limit'
  | 'unknown';

const DEFAULT_OWNER = 'riyadsarkar07';
const DEFAULT_REPO = 'dpdt-govbd-main';
const DEFAULT_BRANCH = 'main';

/**
 * Dedicated names first. `GITHUB_TOKEN` is last because Vercel/GitHub Actions
 * and some GitHub Apps inject a short-lived installation token under that
 * name, which GitHub then rejects with 401 Bad credentials.
 */
export const GITHUB_TOKEN_ENV_KEYS = [
  'DPDT_GITHUB_PAT',
  'PUBLISH_GITHUB_TOKEN',
  'GITHUB_PAT',
  'GITHUB_TOKEN',
] as const;

const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF\u00A0\u2028\u2029]/g;

function runtimeEnv(name: string): string | undefined {
  // Bracket access — Next.js webpack must not replace this at build time.
  return process.env[name];
}

/** Strip BOM, wrapping quotes, and surrounding whitespace from env values. */
export function sanitizeEnvValue(raw: string | undefined | null): string {
  if (typeof raw !== 'string') return '';
  let value = raw.replace(/^\uFEFF/, '').replace(ZERO_WIDTH_RE, '').trim();
  if (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    value = value.slice(1, -1).replace(/^\uFEFF/, '').replace(ZERO_WIDTH_RE, '').trim();
  }
  return value;
}

/** Normalize a PAT pasted into an env var (quotes, whitespace, accidental Bearer prefix). */
export function sanitizeGitHubToken(raw: string | undefined | null): string {
  if (typeof raw !== 'string') return '';
  let token = raw.replace(/^\uFEFF/, '').replace(ZERO_WIDTH_RE, '');
  token = token.trim();
  if (
    (token.startsWith('"') && token.endsWith('"') && token.length >= 2) ||
    (token.startsWith("'") && token.endsWith("'") && token.length >= 2)
  ) {
    token = token.slice(1, -1).replace(/^\uFEFF/, '').replace(ZERO_WIDTH_RE, '').trim();
  }
  token = token.replace(/^(Bearer|token)\s+/i, '');
  token = token.replace(/\s+/g, '');
  token = token.replace(/^(Bearer|token)/i, '');
  return token;
}

/** Classic (`ghp_`) or fine-grained (`github_pat_`) user PATs. */
export function isUserGitHubPat(token: string): boolean {
  return /^(ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})$/.test(token);
}

export function githubTokenKind(token: string): 'classic_pat' | 'fine_grained_pat' | 'app' | 'oauth' | 'unknown' {
  if (token.startsWith('github_pat_')) return 'fine_grained_pat';
  if (token.startsWith('ghp_')) return 'classic_pat';
  if (token.startsWith('ghs_')) return 'app';
  if (token.startsWith('gho_') || token.startsWith('ghu_')) return 'oauth';
  return 'unknown';
}

function envName(raw: string | undefined | null, fallback: string): string {
  return sanitizeEnvValue(raw) || fallback;
}

export function resolveGitHubToken(): { token: string; source: string } | null {
  let skippedAppToken = false;
  for (const key of GITHUB_TOKEN_ENV_KEYS) {
    const candidate = sanitizeGitHubToken(runtimeEnv(key));
    if (!candidate) continue;
    const kind = githubTokenKind(candidate);
    if (kind === 'app' || kind === 'oauth') {
      skippedAppToken = true;
      continue;
    }
    return { token: candidate, source: key };
  }
  if (skippedAppToken) {
    throw new Error(
      'Publish refused a short-lived GitHub App/OAuth token from GITHUB_TOKEN. Set DPDT_GITHUB_PAT (Vercel → Production) to a fine-grained PAT with Contents: Read and write on riyadsarkar07/dpdt-govbd-main.',
    );
  }
  return null;
}

export function githubEnv(): GitHubEnv {
  const resolved = resolveGitHubToken();
  if (!resolved) {
    throw new Error(
      'GITHUB_TOKEN is not configured on the server. Set DPDT_GITHUB_PAT or GITHUB_TOKEN in Vercel → Project → Settings → Environment Variables (Production) for riyadsarkar07/dpdt-govbd-main with Contents: Read and write.',
    );
  }
  return {
    token: resolved.token,
    tokenSource: resolved.source,
    owner: envName(runtimeEnv('GITHUB_OWNER'), DEFAULT_OWNER),
    repo: envName(runtimeEnv('GITHUB_REPO'), DEFAULT_REPO),
    branch: envName(runtimeEnv('GITHUB_BRANCH'), DEFAULT_BRANCH),
  };
}

export function githubAuthHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'document.bd-publish',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export class GitHubApiError extends Error {
  status: number;
  code: GitHubErrorCode;
  path: string;

  constructor(status: number, path: string, code: GitHubErrorCode, message: string) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
    this.code = code;
    this.path = path;
  }
}

export function githubErrorCode(status: number): GitHubErrorCode {
  if (status === 401) return 'auth';
  if (status === 403) return 'permission';
  if (status === 404) return 'not_found';
  if (status === 409 || status === 422) return 'conflict';
  if (status === 429) return 'rate_limit';
  return 'unknown';
}

/**
 * User-safe GitHub error copy. Never includes tokens, Authorization headers,
 * or the raw GitHub JSON body (which can echo "Bad credentials").
 */
export function publicGitHubMessage(status: number, path: string, env?: Pick<GitHubEnv, 'owner' | 'repo' | 'branch'>): string {
  const target = env ? `${env.owner}/${env.repo}@${env.branch}` : `${DEFAULT_OWNER}/${DEFAULT_REPO}@${DEFAULT_BRANCH}`;
  switch (status) {
    case 401:
      return `GitHub rejected the server credentials (401) while accessing ${path} on ${target}. Update DPDT_GITHUB_PAT (preferred) or GITHUB_TOKEN in Vercel Production with a valid fine-grained PAT that has Contents: Read and write on ${DEFAULT_OWNER}/${DEFAULT_REPO}, then Redeploy. Do not use a GitHub Actions/App token.`;
    case 403:
      return `GitHub denied access (403) to ${path} on ${target}. Grant the token Contents: Read and write on ${DEFAULT_OWNER}/${DEFAULT_REPO}, or check rate limits.`;
    case 404:
      return `GitHub could not find ${path} on ${target} (404). Confirm GITHUB_OWNER, GITHUB_REPO, and GITHUB_BRANCH.`;
    case 409:
    case 422:
      return `The ${env?.branch ?? DEFAULT_BRANCH} branch moved during publish (HTTP ${status}). Retry the publish.`;
    case 429:
      return 'GitHub rate-limited the publish request. Wait a moment and retry.';
    default:
      return `GitHub API ${status} on ${path}. Publishing could not complete.`;
  }
}

export function publicGitHubError(
  err: unknown,
): { status: number; error: string } {
  if (err instanceof GitHubApiError) {
    const status =
      err.code === 'auth' || err.code === 'unknown'
        ? 502
        : err.code === 'conflict'
          ? 409
          : err.status;
    return { status, error: err.message };
  }
  if (
    err instanceof Error &&
    (/GITHUB_TOKEN is not configured/.test(err.message) || /DPDT_GITHUB_PAT/.test(err.message))
  ) {
    return { status: 502, error: err.message };
  }
  if (err instanceof Error && /Could not update the branch ref/.test(err.message)) {
    return { status: 409, error: err.message };
  }
  return {
    status: 502,
    error: 'Publish could not reach GitHub.',
  };
}

interface GitHubFileEntry {
  path: string;
  /** New blob content (raw bytes). Omit when `delete` is set. */
  content?: Uint8Array;
  /** Remove the file from the tree (used by unpublish). */
  delete?: boolean;
}

export interface AtomicCommitResult {
  sha: string;
  url: string;
}

export interface RepoFile {
  content: string;
  sha: string;
}

const GH_FETCH_INIT: Pick<RequestInit, 'cache' | 'redirect'> = {
  cache: 'no-store',
  redirect: 'follow',
};

async function ghJson<T>(
  env: Pick<GitHubEnv, 'token' | 'owner' | 'repo' | 'branch'>,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = `https://api.github.com/repos/${env.owner}/${env.repo}/${path}`;
  const method = (init.method ?? 'GET').toUpperCase();
  const headers: Record<string, string> = { ...githubAuthHeaders(env.token) };
  if (method !== 'GET' && method !== 'HEAD') {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, {
    ...init,
    ...GH_FETCH_INIT,
    method,
    headers,
  });
  if (!res.ok) {
    await res.text().catch(() => '');
    const code = githubErrorCode(res.status);
    throw new GitHubApiError(res.status, path, code, publicGitHubMessage(res.status, path, env));
  }
  return (await res.json()) as T;
}

interface RefObject {
  ref: string;
  object: { sha: string; type: string; url: string };
}

interface CommitObject {
  sha: string;
  tree: { sha: string };
}

interface BlobObject {
  sha: string;
}

interface TreeObject {
  sha: string;
  tree: { path: string; mode: string; type: string; sha: string | null }[];
}

interface ContentsObject {
  content: string;
  encoding: string;
  sha: string;
}

async function getBranchHead(env: GitHubEnv): Promise<string> {
  const ref = await ghJson<RefObject>(env, `git/ref/heads/${env.branch}`);
  return ref.object.sha;
}

async function getCommit(env: GitHubEnv, sha: string): Promise<CommitObject> {
  return ghJson<CommitObject>(env, `git/commits/${sha}`);
}

async function createBlob(env: GitHubEnv, content: Uint8Array): Promise<string> {
  const base64 = Buffer.from(content).toString('base64');
  const blob = await ghJson<BlobObject>(env, 'git/blobs', {
    method: 'POST',
    body: JSON.stringify({ content: base64, encoding: 'base64' }),
  });
  return blob.sha;
}

async function createTree(
  env: GitHubEnv,
  baseTree: string,
  entries: { path: string; mode: string; type: string; sha: string | null }[],
): Promise<string> {
  const tree = await ghJson<TreeObject>(env, 'git/trees', {
    method: 'POST',
    body: JSON.stringify({ base_tree: baseTree, tree: entries }),
  });
  return tree.sha;
}

async function createCommit(
  env: GitHubEnv,
  message: string,
  tree: string,
  parents: string[],
): Promise<string> {
  const commit = await ghJson<BlobObject>(env, 'git/commits', {
    method: 'POST',
    body: JSON.stringify({ message, tree, parents }),
  });
  return commit.sha;
}

async function updateRef(env: GitHubEnv, sha: string): Promise<void> {
  await ghJson<RefObject>(env, `git/refs/heads/${env.branch}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha, force: false }),
  });
}

async function readContents(env: Pick<GitHubEnv, 'token' | 'owner' | 'repo' | 'branch'>, path: string): Promise<RepoFile | null> {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  try {
    const obj = await ghJson<ContentsObject>(env, `contents/${encoded}?ref=${encodeURIComponent(env.branch)}`);
    if (obj.encoding !== 'base64') {
      throw new Error(`Unexpected file encoding for ${path}: ${obj.encoding}`);
    }
    return {
      content: Buffer.from(obj.content, 'base64').toString('utf8'),
      sha: obj.sha,
    };
  } catch (err) {
    if (err instanceof GitHubApiError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Read the current UTF-8 content of a file on the target branch.
 * Returns `null` when the file does not exist (404).
 * Uses the Contents API SHA-bearing payload so callers can merge against
 * the latest `data.json` before the atomic tree update.
 *
 * Authenticated read first; if GitHub rejects the server token (401) the
 * public contents of `dpdt-govbd-main` are retried without Authorization so
 * a colliding GITHUB_TOKEN cannot block the merge. Writes still require a PAT.
 */
export async function readRepoFile(path: string): Promise<string | null> {
  const file = await readRepoFileWithSha(path);
  return file ? file.content : null;
}

export async function readRepoFileWithSha(path: string): Promise<RepoFile | null> {
  const env = githubEnv();
  try {
    return await readContents(env, path);
  } catch (err) {
    if (err instanceof GitHubApiError && err.status === 401) {
      try {
        return await readContents({ ...env, token: '' }, path);
      } catch {
        throw err;
      }
    }
    throw err;
  }
}

/**
 * Update one or more files in the repository as a single atomic commit.
 *
 * Strategy:
 *  1. resolve the current branch HEAD (latest commit + tree SHA)
 *  2. create blobs for all changed files
 *  3. build a new tree on top of the current base tree
 *  4. create a commit whose parent is the current HEAD
 *  5. update the branch ref non-forcefully; if another writer moved the
 *     branch meanwhile (409/422), re-resolve HEAD and retry
 */
export async function createAtomicCommit(
  message: string,
  files: GitHubFileEntry[],
): Promise<AtomicCommitResult> {
  const env = githubEnv();
  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const head = await getBranchHead(env);
    const commit = await getCommit(env, head);

    const entries: { path: string; mode: string; type: string; sha: string | null }[] = [];
    for (const file of files) {
      if (file.delete) {
        entries.push({ path: file.path, mode: '100644', type: 'blob', sha: null });
      } else if (file.content) {
        const blobSha = await createBlob(env, file.content);
        entries.push({ path: file.path, mode: '100644', type: 'blob', sha: blobSha });
      }
    }

    const tree = await createTree(env, commit.tree.sha, entries);
    const newSha = await createCommit(env, message, tree, [head]);

    try {
      await updateRef(env, newSha);
      return {
        sha: newSha,
        url: `https://github.com/${env.owner}/${env.repo}/commit/${newSha}`,
      };
    } catch (err) {
      const status = err instanceof GitHubApiError ? err.status : null;
      if ((status === 409 || status === 422) && attempt < MAX_ATTEMPTS) {
        continue;
      }
      throw err;
    }
  }

  throw new Error('Could not update the branch ref after repeated conflicts.');
}
