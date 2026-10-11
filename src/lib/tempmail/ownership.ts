import type { TempmailMessageDetail } from '@/lib/tempmail/types';

function normalizeRecipient(value: string): string {
  return value.trim().toLowerCase().replace(/^<|>$/g, '');
}

export function messageBelongsToInbox(toField: string | undefined, inboxEmail: string): boolean {
  const expected = inboxEmail.trim().toLowerCase();
  if (!expected) return false;
  const raw = (toField ?? '').trim();
  if (!raw) return true;
  const recipients = raw
    .split(/[,;]/)
    .map(normalizeRecipient)
    .map((part) => {
      const match = part.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
      return (match ? match[0] : part).toLowerCase();
    })
    .filter(Boolean);
  if (recipients.length === 0) return true;
  return recipients.includes(expected);
}

export function assertMessageOwnership(message: TempmailMessageDetail, inboxEmail: string): boolean {
  return messageBelongsToInbox(message.to, inboxEmail);
}
