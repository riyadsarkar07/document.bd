/**
 * Server-only GitHub Git Data API client for the publish pipeline.
 *
 * Pushes `data.json` and `<TM_NUMBER>.jpg` into the separate
 * `dpdt-govbd-main` repository (public verification portal) as a single
 * atomic Git commit. Reads the latest HEAD tree on every publish so
 * concurrent writers never clobber each other (optimistic concurrency +
 * retry on non-fast-forward conflicts).
 *
 * IMPORTANT: This module reads GITHUB_TOKEN from the server environment and
 * must NEVER be imported from any client component. Only the `/api/publish`
 * route handler uses it.
 */

export interface GitHubEnv {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

export function githubEnv(): GitHubEnv {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN is not configured on the server.');
  }
  return {
    token,
    owner: process.env.GITHUB_OWNER || 'riyadsarkar07',
    repo: process.env.GITHUB_REPO || 'dpdt-govbd-main',
    branch: process.env.GITHUB_BRANCH || 'main',
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

class GitHubApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
  }
}

async function ghJson<T>(
  env: GitHubEnv,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = `https://api.github.com/repos/${env.owner}/${env.repo}/${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new GitHubApiError(
      res.status,
      `GitHub API ${res.status} on ${path}: ${body.slice(0, 300)}`,
    );
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

/**
 * Read the current UTF-8 content of a file on the target branch.
 * Returns `null` when the file does not exist.
 */
export async function readRepoFile(path: string): Promise<string | null> {
  const env = githubEnv();
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  try {
    const obj = await ghJson<ContentsObject>(env, `contents/${encoded}?ref=${encodeURIComponent(env.branch)}`);
    if (obj.encoding !== 'base64') {
      throw new Error(`Unexpected file encoding for ${path}: ${obj.encoding}`);
    }
    return Buffer.from(obj.content, 'base64').toString('utf8');
  } catch (err) {
    if (err instanceof GitHubApiError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Update one or more files in the repository as a single atomic commit.
 *
 * Strategy:
 *  1. resolve the current branch HEAD (latest commit + tree)
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
      // Non-fast-forward (409) / invalid object (422) means the branch moved
      // since we resolved it — re-resolve and retry with fresh data.
      if ((status === 409 || status === 422) && attempt < MAX_ATTEMPTS) {
        continue;
      }
      throw err;
    }
  }

  throw new Error('Could not update the branch ref after repeated conflicts.');
}
