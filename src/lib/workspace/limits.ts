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
  /** Generations inside the current gen_period rolling window. */
  generations: number;
  max_projects: number | null;
  max_documents: number | null;
  max_exports: number | null;
  /** Max generations per gen_period window; null = unlimited. */
  gen_limit: number | null;
  /** daily / weekly / monthly / unlimited. */
  gen_period: string | null;
  /** Explicit tool-scope allowlist; null = all tools. */
  allowed_tools?: string[] | null;
  /** User purchased/paid and may publish their own records. */
  can_self_publish?: boolean;
  status: UserStatus;
  /** Whether the values came from the server RPC (true) or are unknown (false). */
  enforced: boolean;
}

export type LimitKind = 'project' | 'document' | 'export' | 'generation';

export const LIMIT_LABEL: Record<LimitKind, string> = {
  project: 'Projects',
  document: 'Document generations',
  export: 'Exports',
  generation: 'Generations',
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
    generations: toInt(row.generations) ?? 0,
    max_projects: toInt(row.max_projects),
    max_documents: toInt(row.max_documents),
    max_exports: toInt(row.max_exports),
    gen_limit: toInt(row.gen_limit),
    gen_period: typeof row.gen_period === 'string' ? row.gen_period : null,
    allowed_tools: Array.isArray(row.allowed_tools) ? (row.allowed_tools as string[]) : null,
    can_self_publish: Boolean(row.can_self_publish),
    status: row.status === 'disabled' ? 'disabled' : 'active',
    enforced: true,
  };
}

export interface LimitCheck {
  ok: boolean;
  message?: string;
}

export interface GenerationLimit {
  genPeriod: string | null;
  genLimit: number | null;
  generations: number;
}

/**
 * Whether a generation cap is currently reached. Pure mirror of the server-side
 * rule (schema.sql `can_generate`): an 'unlimited' period or a null cap always
 * allows; otherwise the window count must stay below the cap.
 */
export function isGenerationLimited(limit: GenerationLimit): boolean {
  if (limit.genPeriod === 'unlimited' || limit.genLimit == null) return false;
  return limit.generations >= limit.genLimit;
}

export function generationPeriodLabel(period: string | null): string {
  switch (period) {
    case 'daily':
      return 'day';
    case 'weekly':
      return 'week';
    case 'monthly':
      return 'month';
    default:
      return 'period';
  }
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
    return { ok: false, message: 'This account is suspended. Contact an administrator.' };
  }

  if (kind === 'generation') {
    if (isGenerationLimited({ genPeriod: usage.gen_period, genLimit: usage.gen_limit, generations: usage.generations })) {
      return {
        ok: false,
        message: `Generations limit reached (${usage.generations}/${usage.gen_limit} per ${generationPeriodLabel(usage.gen_period)}). Contact an administrator to raise your limit.`,
      };
    }
    return { ok: true };
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
