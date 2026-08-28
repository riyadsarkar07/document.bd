'use client';

import { supabase } from '@/lib/supabase/client';

export interface AuditLog {
  id: string | number;
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AuditListResult {
  rows: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
  error: string | null;
}

/**
 * Append an immutable entry to the admin audit trail.
 *
 * The actor is always resolved from the current session and locked to
 * `auth.uid()` by the RLS insert policy, so callers can never log actions
 * on behalf of another user. Failures are intentionally swallowed: auditing
 * is best-effort and must never break the primary operation.
 */
export async function logAudit(entry: {
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  let actorId: string | null = null;
  let actorEmail: string | null = null;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    actorId = user.id;
    actorEmail = user.email ?? null;
  } catch {
    return;
  }
  await supabase.from('audit_logs').insert({
    actor_id: actorId,
    actor_email: actorEmail,
    action: entry.action,
    target_type: entry.targetType ?? null,
    target_id: entry.targetId ?? null,
    metadata: entry.metadata ?? {},
  });
}

export interface AuditQuery {
  search?: string;
  action?: string;
  /** Inclusive lower bound on the event time (`YYYY-MM-DD`). */
  dateFrom?: string;
  /** Inclusive upper bound on the event time (`YYYY-MM-DD`). */
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Read the audit trail (admin only — RLS returns nothing otherwise).
 * Supports text search over actor email / target id / action and a filter by
 * action, with server-side pagination.
 */
export async function listAuditLogs(q: AuditQuery = {}): Promise<AuditListResult> {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, q.pageSize ?? 50));

  let query = supabase
    .from('audit_logs')
    .select('id, actor_id, actor_email, action, target_type, target_id, metadata, created_at', {
      count: 'exact',
    });

  const search = q.search?.trim();
  if (search) {
    query = query.or(`actor_email.ilike.%${search}%,target_id.ilike.%${search}%,action.ilike.%${search}%`);
  }
  if (q.action) {
    query = query.eq('action', q.action);
  }
  if (q.dateFrom) query = query.gte('created_at', new Date(`${q.dateFrom}T00:00:00`).toISOString());
  if (q.dateTo) query = query.lte('created_at', new Date(`${q.dateTo}T23:59:59.999`).toISOString());
  query = query.order('created_at', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);

  const { data, error, count } = await query;

  if (error) {
    return { rows: [], total: 0, page, pageSize, error: error.message };
  }

  const rows: AuditLog[] = (data ?? []).map((row) => ({
    id: row.id,
    actorId: row.actor_id,
    actorEmail: row.actor_email,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
  }));

  return { rows, total: count ?? rows.length, page, pageSize, error: null };
}

/** Known audit actions surfaced as filter options in the Audit Trail tab. */
export const AUDIT_ACTIONS: { value: string; label: string }[] = [
  { value: 'vault.saved', label: 'Vault · record saved' },
  { value: 'vault.trashed', label: 'Vault · moved to trash' },
  { value: 'vault.restored', label: 'Vault · restored' },
  { value: 'vault.deleted', label: 'Vault · permanently deleted' },
  { value: 'project.saved', label: 'Project · saved' },
  { value: 'project.deleted', label: 'Project · deleted' },
  { value: 'template.saved', label: 'Template · saved' },
  { value: 'template.deleted', label: 'Template · deleted' },
  { value: 'publish.started', label: 'Publish · attempt started' },
  { value: 'publish.success', label: 'Publish · published to portal' },
  { value: 'publish.pending', label: 'Publish · committed, awaiting deploy' },
  { value: 'publish.failed', label: 'Publish · failed' },
  { value: 'publish.unpublished', label: 'Publish · removed from portal' },
];
