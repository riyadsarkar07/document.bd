import type { Role, UserStatus } from '@/lib/auth/types';

const ROLES: readonly Role[] = ['admin', 'editor', 'viewer'];
const STATUSES: readonly UserStatus[] = ['active', 'disabled'];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function isUserStatus(value: unknown): value is UserStatus {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

export interface AccountMutationInput {
  actorId: string;
  actorRole: string;
  targetId: string;
  targetRole: string;
  targetStatus: string;
  nextRole?: string;
  nextStatus?: string;
  activeAdminCount: number;
}

export type AccountMutationResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

function remainsActiveAdmin(role: string, status: string): boolean {
  return role === 'admin' && status === 'active';
}

export function evaluateAccountMutation(input: AccountMutationInput): AccountMutationResult {
  if (input.actorRole !== 'admin') {
    return { ok: false, error: 'Admin access required.', status: 403 };
  }
  if (input.actorId === input.targetId) {
    return { ok: false, error: 'You cannot change your own role or status.', status: 403 };
  }
  if (input.nextRole !== undefined && !isRole(input.nextRole)) {
    return { ok: false, error: 'Invalid role.', status: 400 };
  }
  if (input.nextStatus !== undefined && !isUserStatus(input.nextStatus)) {
    return { ok: false, error: 'Invalid status.', status: 400 };
  }

  const nextRole = input.nextRole ?? input.targetRole;
  const nextStatus = input.nextStatus ?? input.targetStatus;
  const wasAdmin = remainsActiveAdmin(input.targetRole, input.targetStatus);
  const staysAdmin = remainsActiveAdmin(nextRole, nextStatus);

  if (wasAdmin && !staysAdmin && input.activeAdminCount <= 1) {
    return {
      ok: false,
      error: 'Cannot demote or disable the last remaining admin.',
      status: 409,
    };
  }

  return { ok: true };
}

export function toolsWithoutTempmail(current: string[] | null | undefined, allScopes: readonly string[]): string[] {
  const source = current == null ? [...allScopes] : current;
  return source.filter((scope) => scope !== 'tempmail');
}

export function toolsWithTempmail(current: string[] | null | undefined, allScopes: readonly string[]): string[] | null {
  if (current == null) return null;
  if (current.includes('tempmail')) return current;
  const next = [...current, 'tempmail'];
  if (next.length === allScopes.length && allScopes.every((scope) => next.includes(scope))) return null;
  return next;
}
