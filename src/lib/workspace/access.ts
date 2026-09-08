/**
 * Per-user tool/page access.
 *
 * `allowed_tools` is stored on the `profiles` row and ENFORCED server-side by
 * Supabase RLS / RPCs (see `supabase/schema.sql`). This module mirrors the
 * same rules in the UI (sidebar + route guards) so restricted pages appear
 * locked and cannot be opened. It is NOT the enforcement itself.
 *
 * Semantics (must match `has_tool_access` in schema.sql):
 *   - admin role   -> every tool (hard bypass).
 *   - allowed_tools == null (unset) -> every tool (legacy default).
 *   - otherwise    -> only the scopes present in the array ([] = none).
 */

export const TOOL_SCOPES = [
  'dashboard',
  'tm',
  'nid',
  'tin',
  'templates',
  'projects',
  'history',
  'assets',
  'settings',
] as const;

export type ToolScope = (typeof TOOL_SCOPES)[number];

export const TOOL_SCOPE_LABEL: Record<ToolScope, string> = {
  dashboard: 'Dashboard',
  tm: 'TM Certificate',
  nid: 'NID Card',
  tin: 'TIN Record',
  templates: 'Templates',
  projects: 'Projects',
  history: 'History',
  assets: 'Assets',
  settings: 'Settings',
};

export interface ToolAccessProfile {
  role?: string | null;
  allowed_tools?: string[] | null;
}

export function hasToolAccess(
  profile: ToolAccessProfile | null | undefined,
  scope: ToolScope,
): boolean {
  if (!profile) return false;
  if (profile.role === 'admin') return true;
  if (profile.allowed_tools == null) return true;
  return profile.allowed_tools.includes(scope);
}

/** Whether a non-admin user has purchased/paid and may publish their own vault records. */
export function canSelfPublish(
  profile: ToolAccessProfile & { can_self_publish?: boolean } | null | undefined,
): boolean {
  return Boolean(profile?.can_self_publish);
}
