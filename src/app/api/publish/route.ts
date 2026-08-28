import { NextResponse } from 'next/server';
import {
  createAtomicCommit,
  readRepoFile,
} from '@/lib/publish/github';
import {
  withRecord,
  withoutRecord,
} from '@/lib/publish/data';
import {
  MAX_BODY_BYTES,
  validatePublishPayload,
  validateUnpublishPayload,
} from '@/lib/publish/schema';
import {
  authorize,
  json,
  PUBLIC_VERIFY_BASE_URL,
  type Caller,
} from '@/lib/publish/server-auth';

export const runtime = 'nodejs';

/** Refuse to publish/unpublish a number another (non-admin) account owns. */
async function assertOwnership(caller: Caller, regNo: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: existing } = await caller.sb
    .from('certificates')
    .select('created_by')
    .eq('trademark_no', regNo)
    .maybeSingle();
  if (existing?.created_by && existing.created_by !== caller.userId && caller.role !== 'admin') {
    return { ok: false, error: `TM No. ${regNo} is archived by another account. Only an admin can publish it.` };
  }
  return { ok: true };
}

async function recordAudit(caller: Caller, action: string, regNo: string, metadata: Record<string, unknown>) {
  await caller.sb.from('audit_logs').insert({
    actor_id: caller.userId,
    actor_email: caller.email,
    action,
    target_type: 'certificate',
    target_id: regNo,
    metadata,
  });
}

/**
 * Poll the deployed portal's data.json until the record appears (or timeout).
 * A commit that lands but is not yet visible is reported as `pending`.
 */
async function confirmLive(regNo: string, maxAttempts = 15): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
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
        if (data && typeof data === 'object' && data[regNo]) return true;
      }
    } catch {
      // network hiccup — keep polling
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  return false;
}

export async function POST(req: Request): Promise<NextResponse> {
  const authz = req.headers.get('authorization') ?? '';
  const token = authz.startsWith('Bearer ') ? authz.slice('Bearer '.length) : null;

  const auth = await authorize(token);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  const raw = await req.text().catch(() => null);
  if (raw === null) return json({ ok: false, error: 'Could not read request body.' }, 400);
  if (raw.length > MAX_BODY_BYTES) {
    return json({ ok: false, error: 'Request body too large.' }, 413);
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: 'Invalid JSON payload.' }, 400);
  }

  const caller = auth.caller;
  const action = body.action === 'unpublish' ? 'unpublish' : 'publish';

  if (action === 'unpublish') {
    const validated = validateUnpublishPayload(body);
    if (!validated.ok) return json({ ok: false, error: validated.error }, 400);

    const regNo = validated.regNo;
    const ownership = await assertOwnership(caller, regNo);
    if (!ownership.ok) return json({ ok: false, error: ownership.error }, 403);

    try {
      const dataJson = await readRepoFile('data.json');
      const nextDataJson = withoutRecord(dataJson, regNo);
      const result = await createAtomicCommit(`unpublish: TM ${regNo}`, [
        { path: 'data.json', content: Buffer.from(nextDataJson, 'utf8') },
        { path: `${regNo}.jpg`, delete: true },
      ]);

      await caller.sb
        .from('certificates')
        .update({
          publish_status: 'unpublished',
          published_at: null,
          publish_commit_sha: result.sha,
          publish_error: null,
        })
        .eq('trademark_no', regNo);
      await recordAudit(caller, 'publish.unpublished', regNo, { commit_sha: result.sha });

      return json({ ok: true, status: 'unpublished', sha: result.sha, verifyUrl: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown unpublish error';
      await caller.sb
        .from('certificates')
        .update({ publish_status: 'failed', publish_error: message })
        .eq('trademark_no', regNo);
      await recordAudit(caller, 'publish.failed', regNo, { action: 'unpublish', error: message });
      return json({ ok: false, error: message }, 500);
    }
  }

  // ── publish action ───────────────────────────────────────────────
  const validated = validatePublishPayload(body);
  if (!validated.ok) return json({ ok: false, error: validated.error }, 400);
  const { fields } = validated;

  const ownership = await assertOwnership(caller, fields.regNo);
  if (!ownership.ok) return json({ ok: false, error: ownership.error }, 403);

  // Mark as pending immediately so the History badge reflects the attempt.
  await caller.sb
    .from('certificates')
    .update({ publish_status: 'pending', publish_error: null })
    .eq('trademark_no', fields.regNo);
  await recordAudit(caller, 'publish.started', fields.regNo, {});

  try {
    const base64 = fields.imageDataUrl!.slice('data:image/jpeg;base64,'.length);
    const dataJson = await readRepoFile('data.json');
    const nextDataJson = withRecord(dataJson, fields.regNo, {
      name: fields.name,
      authority: fields.authority,
      application_date: fields.applicationDate,
    });

    const result = await createAtomicCommit(`publish: TM ${fields.regNo}`, [
      { path: 'data.json', content: Buffer.from(nextDataJson, 'utf8') },
      { path: `${fields.regNo}.jpg`, content: Buffer.from(base64, 'base64') },
    ]);

    const live = await confirmLive(fields.regNo);
    const status = live ? 'published' : 'pending';

    await caller.sb
      .from('certificates')
      .update({
        publish_status: status,
        published_at: live ? new Date().toISOString() : null,
        publish_commit_sha: result.sha,
        publish_error: null,
      })
      .eq('trademark_no', fields.regNo);
    await recordAudit(caller, live ? 'publish.success' : 'publish.pending', fields.regNo, {
      commit_sha: result.sha,
      status,
    });

    const verifyUrl = `${PUBLIC_VERIFY_BASE_URL}/verify?reg_no=${encodeURIComponent(fields.regNo)}`;
    return json({ ok: true, status, sha: result.sha, verifyUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown publish error';
    await caller.sb
      .from('certificates')
      .update({ publish_status: 'failed', publish_error: message })
      .eq('trademark_no', fields.regNo);
    await recordAudit(caller, 'publish.failed', fields.regNo, { error: message });
    return json({ ok: false, error: message }, 500);
  }
}
