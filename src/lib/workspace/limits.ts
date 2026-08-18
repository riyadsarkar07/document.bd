'use client';

import { supabase } from '@/lib/supabase/client';
import type { UserStatus } from '@/lib/auth/types';

/**
 * Per-user usage + limits. Limits are stored on the `profiles` row and
 * ENFORCED server-side by Supabase RLS (see `supabase/schema.sql`).
 * This module surfaces those limits in the UI and provides friendly
 * pre-check messages; it is NOT the enforcement mechanism itself.
 */

export interface UsageInfo {
  projects: number;
  documents: number;
  exports: number;
  max_projects: number | null;
  max_documents: number | null;
  max_exports: number | null;
  status: UserStatus;
  /** Whether the values came from the server RPC (true) or are unknown (false). */
  enforced: boolean;
}

export type LimitKind = 'project' | 'document' | 'export';

export const LIMIT_LABEL: Record<LimitKind, string> = {
  project: 'Projects',
  document: 'Document generations',
  export: 'Exports',
};

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
}

/** Fetch the signed-in user's usage + limits via the `my_usage` RPC. */
export async function fetchMyUsage(): Promise<UsageInfo | null> {
  const { data, error } = await supabase.rpc('my_usage');
  if (error || !data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    projects: toInt(row.projects) ?? 0,
    documents: toInt(row.documents) ?? 0,
    exports: toInt(row.exports) ?? 0,
    max_projects: toInt(row.max_projects),
    max_documents: toInt(row.max_documents),
    max_exports: toInt(row.max_exports),
    status: row.status === 'disabled' ? 'disabled' : 'active',
    enforced: true,
  };
}

export interface LimitCheck {
  ok: boolean;
  message?: string;
}

/**
 * Check whether the current user may perform an action of `kind`.
 * When the RPC is unavailable (migration not applied), enforcement is
 * skipped here but RLS still backstops it server-side.
 */
export async function checkLimit(kind: LimitKind): Promise<LimitCheck> {
  const usage = await fetchMyUsage();
  if (!usage) return { ok: true };

  if (usage.status === 'disabled') {
    return { ok: false, message: 'This account is disabled. Contact an administrator.' };
  }

  const max =
    kind === 'project' ? usage.max_projects : kind === 'document' ? usage.max_documents : usage.max_exports;
  const current =
    kind === 'project' ? usage.projects : kind === 'document' ? usage.documents : usage.exports;

  if (max !== null && current >= max) {
    return {
      ok: false,
      message: `${LIMIT_LABEL[kind]} limit reached (${current}/${max}). Contact an administrator to raise your limit.`,
    };
  }
  return { ok: true };
}
