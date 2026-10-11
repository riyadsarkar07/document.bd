import { NextResponse } from 'next/server';
import { json } from '@/lib/publish/server-auth';
import { authorizeTempmailAdmin } from '@/lib/tempmail/auth';
import {
  DEFAULT_RAPIDAPI_HOST,
  getTempmailConfig,
  TEMPMAIL_PROVIDER_NAME,
  TEMPMAIL_PROVIDER_SLUG,
} from '@/lib/tempmail/config';
import {
  endpointCatalog,
  getTempmailCounters,
  getTempmailSettings,
  recordTempmailOp,
} from '@/lib/tempmail/ops';
import { TempmailProviderError, requireTempmailClient } from '@/lib/tempmail/provider';

export const runtime = 'nodejs';

export async function GET(req: Request): Promise<NextResponse> {
  const auth = await authorizeTempmailAdmin(req);
  if (!auth.ok) return auth.response;

  const config = getTempmailConfig();
  const endpoints = endpointCatalog().map((row) => ({
    id: row.id,
    method: row.method,
    path: row.path,
    label: row.label,
    implemented: row.implemented,
    probe: row.probe,
    status: row.probe === 'live' ? 'unknown' : 'supported',
  }));

  if (!config.configured) {
    return json({
      ok: true,
      provider: {
        name: TEMPMAIL_PROVIDER_NAME,
        slug: TEMPMAIL_PROVIDER_SLUG,
        host: DEFAULT_RAPIDAPI_HOST,
        configured: false,
        connected: false,
        error: config.error,
      },
      domains: [] as string[],
      endpoints,
      counters: getTempmailCounters(),
      countersNote:
        'Counts are process-local operational totals for this server instance. The provider does not expose account-wide inbox statistics.',
      settings: getTempmailSettings(),
    });
  }

  try {
    const client = requireTempmailClient();
    const domains = await client.listDomains();
    recordTempmailOp({ kind: 'health.check', ok: true, actorId: auth.caller.userId });
    return json({
      ok: true,
      provider: {
        name: TEMPMAIL_PROVIDER_NAME,
        slug: TEMPMAIL_PROVIDER_SLUG,
        host: config.host,
        configured: true,
        connected: true,
        error: null,
      },
      domains,
      endpoints: endpoints.map((row) =>
        row.id === 'domains' ? { ...row, status: 'ok' } : row,
      ),
      counters: getTempmailCounters(),
      countersNote:
        'Counts are process-local operational totals for this server instance. The provider does not expose account-wide inbox statistics.',
      settings: getTempmailSettings(),
    });
  } catch (err) {
    recordTempmailOp({ kind: 'health.check', ok: false, actorId: auth.caller.userId });
    const shape = err instanceof TempmailProviderError ? err.toShape() : null;
    return json({
      ok: true,
      provider: {
        name: TEMPMAIL_PROVIDER_NAME,
        slug: TEMPMAIL_PROVIDER_SLUG,
        host: config.host,
        configured: true,
        connected: false,
        error: shape?.error ?? (err instanceof Error ? err.message : 'Provider health check failed.'),
        code: shape?.code ?? 'provider_error',
        status: shape?.status,
      },
      domains: [] as string[],
      endpoints: endpoints.map((row) =>
        row.id === 'domains' ? { ...row, status: 'error' } : row,
      ),
      counters: getTempmailCounters(),
      countersNote:
        'Counts are process-local operational totals for this server instance. The provider does not expose account-wide inbox statistics.',
      settings: getTempmailSettings(),
    });
  }
}

export async function POST() {
  return json({ ok: false, error: 'Method not allowed.', code: 'validation' }, 405, { Allow: 'GET' });
}
