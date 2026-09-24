import { normalizeMessage } from '@/lib/bug-hunter/sanitize';
import type { BugKind } from '@/lib/bug-hunter/types';

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function bugFingerprint(input: {
  kind: BugKind;
  message: string;
  route?: string | null;
  endpoint?: string | null;
  supabaseCode?: string | null;
}): string {
  const parts = [
    input.kind,
    normalizeMessage(input.message),
    (input.route ?? '').split('?')[0] ?? '',
    (input.endpoint ?? '').split('?')[0] ?? '',
    input.supabaseCode ?? '',
  ];
  return fnv1a(parts.join('|'));
}
