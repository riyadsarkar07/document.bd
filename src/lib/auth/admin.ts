/**
 * Authorized admin account (UUID allowlist).
 *
 * Server-side authorization is enforced through the `profiles` table role
 * plus Supabase RLS (see `supabase/schema.sql`). This allowlist is only a
 * convenience used to bootstrap the admin role on profile creation and to
 * drive defensive client-side checks. It is NOT the source of authority —
 * the database role + RLS policies are.
 */
export const ADMIN_USER_IDS = ['c2b13e27-3845-48e6-ad41-07a398ea9d60'] as const;

export function isAdminUserId(id: string | undefined | null): boolean {
  return Boolean(id && (ADMIN_USER_IDS as readonly string[]).includes(id));
}
