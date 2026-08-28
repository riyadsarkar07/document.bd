import { NextResponse } from 'next/server';
import { githubEnv } from '@/lib/publish/github';
import {
  authorize,
  json,
  PUBLIC_VERIFY_BASE_URL,
} from '@/lib/publish/server-auth';

export const runtime = 'nodejs';

interface PreflightCheck {
  name: string;
  ok: boolean;
  detail: string;
}

const GH_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};

/**
 * Non-destructive preflight check for the publish pipeline.
 *
 * Confirms every external dependency before the first real publish:
 *   - GitHub token is available server-side
 *   - target repository exists and the token can read it
 *   - target branch exists
 *   - data.json is readable on that branch (needed for the merge)
 *   - Supabase schema has the publish columns (migration applied)
 *   - caller is an active admin/editor (implicit — authorize() gates this route)
 *   - the public verification URL serves a valid data.json
 *
 * Nothing is written — no GitHub commits, no database updates.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const authz = req.headers.get('authorization') ?? '';
  const token = authz.startsWith('Bearer ') ? authz.slice('Bearer '.length) : null;

  const auth = await authorize(token);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  const { caller } = auth;

  const checks: PreflightCheck[] = [];

  // 1. GitHub token present server-side.
  let env: ReturnType<typeof githubEnv>;
  try {
    env = githubEnv();
    checks.push({
      name: 'GitHub token',
      ok: true,
      detail: `GITHUB_TOKEN is configured on the server (target ${env.owner}/${env.repo}@${env.branch}).`,
    });
  } catch (err) {
    checks.push({
      name: 'GitHub token',
      ok: false,
      detail: err instanceof Error ? err.message : 'GITHUB_TOKEN is missing.',
    });
    return json({ ok: false, checks, error: 'Preflight failed — server configuration incomplete.' }, 500);
  }

  // 2. Repository exists + token can read it.
  try {
    const res = await fetch(`https://api.github.com/repos/${env.owner}/${env.repo}`, {
      headers: { ...GH_HEADERS, Authorization: `Bearer ${env.token}` },
    });
    if (res.ok) {
      const repo = (await res.json()) as { default_branch?: string; permissions?: { push?: boolean } };
      const push = repo.permissions?.push === undefined ? 'write permission not disclosed by token type' : repo.permissions.push ? 'write access confirmed' : 'READ-ONLY — cannot publish';
      checks.push({
        name: 'GitHub repository',
        ok: repo.permissions?.push !== false,
        detail: `${env.owner}/${env.repo} reachable (default_branch=${repo.default_branch ?? '?'}; ${push}).`,
      });
    } else {
      const body = await res.text().catch(() => '');
      checks.push({
        name: 'GitHub repository',
        ok: false,
        detail: `HTTP ${res.status} on repos/${env.owner}/${env.repo}: ${body.slice(0, 200)}`,
      });
    }
  } catch (err) {
    checks.push({
      name: 'GitHub repository',
      ok: false,
      detail: err instanceof Error ? err.message : 'Could not reach the GitHub API.',
    });
  }

  // 3. Target branch exists.
  if (checks[1]?.ok) {
    try {
      const res = await fetch(`https://api.github.com/repos/${env.owner}/${env.repo}/branches/${encodeURIComponent(env.branch)}`, {
        headers: { ...GH_HEADERS, Authorization: `Bearer ${env.token}` },
      });
      checks.push({
        name: 'GitHub branch',
        ok: res.ok,
        detail: res.ok
          ? `Branch "${env.branch}" exists.`
          : `HTTP ${res.status} — branch "${env.branch}" not found.`,
      });
    } catch (err) {
      checks.push({
        name: 'GitHub branch',
        ok: false,
        detail: err instanceof Error ? err.message : 'Could not verify the target branch.',
      });
    }
  } else {
    checks.push({ name: 'GitHub branch', ok: false, detail: 'Skipped — repository check failed.' });
  }

  // 4. data.json readable on the target branch (needed for merge).
  if (checks[1]?.ok) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${env.owner}/${env.repo}/contents/data.json?ref=${encodeURIComponent(env.branch)}`,
        { headers: { ...GH_HEADERS, Authorization: `Bearer ${env.token}` } },
      );
      checks.push({
        name: 'data.json readable',
        ok: res.ok,
        detail: res.ok
          ? 'data.json found — existing records will be preserved on publish.'
          : res.status === 404
            ? 'data.json absent — first publish will create it (safe).'
            : `HTTP ${res.status} — data.json could not be read.`,
      });
    } catch (err) {
      checks.push({
        name: 'data.json readable',
        ok: false,
        detail: err instanceof Error ? err.message : 'Could not read data.json.',
      });
    }
  } else {
    checks.push({ name: 'data.json readable', ok: false, detail: 'Skipped — repository check failed.' });
  }

  // 5. Supabase schema — publish columns exist and the caller can query them.
  try {
    const { error } = await caller.sb
      .from('certificates')
      .select('publish_status, published_at, publish_commit_sha, publish_error')
      .limit(1);
    if (error) {
      const code = error.code ?? '';
      checks.push({
        name: 'Supabase schema',
        ok: false,
        detail:
          code === 'PGRST204' || /publish_status/.test(error.message)
            ? 'Certificates table is missing the publish columns — run the SQL migration (supabase/schema.sql) first.'
            : `Schema check failed: ${error.message.slice(0, 200)}`,
      });
    } else {
      checks.push({
        name: 'Supabase schema',
        ok: true,
        detail: 'Certificates publish columns exist and are queryable.',
      });
    }
  } catch (err) {
    checks.push({
      name: 'Supabase schema',
      ok: false,
      detail: err instanceof Error ? err.message.slice(0, 200) : 'Could not verify the Supabase schema.',
    });
  }

  // 6. Public verification URL serves a valid data.json.
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${PUBLIC_VERIFY_BASE_URL}/data.json`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      const recordCount = data && typeof data === 'object' ? Object.keys(data).length : 0;
      checks.push({
        name: 'Public verification URL',
        ok: typeof data === 'object' && data !== null,
        detail: `${PUBLIC_VERIFY_BASE_URL}/data.json reachable (${recordCount} records served).`,
      });
    } else {
      checks.push({
        name: 'Public verification URL',
        ok: false,
        detail: `HTTP ${res.status} on ${PUBLIC_VERIFY_BASE_URL}/data.json`,
      });
    }
  } catch (err) {
    checks.push({
      name: 'Public verification URL',
      ok: false,
      detail: err instanceof Error ? `Unreachable: ${err.message.slice(0, 120)}` : 'Unreachable.',
    });
  }

  const allOk = checks.every((c) => c.ok);
  return json({
    ok: allOk,
    checks,
    caller: { email: caller.email, role: caller.role },
    target: {
      owner: env.owner,
      repo: env.repo,
      branch: env.branch,
      verifyBaseUrl: PUBLIC_VERIFY_BASE_URL,
    },
  });
}
