export const TEMPMAIL_NO_INBOX_COPY = 'No inbox yet. Click New address to generate one.';

export type TempmailAddressAction =
  | 'page_load'
  | 'page_refresh'
  | 'sign_in'
  | 'navigation'
  | 'tab_return'
  | 'poll'
  | 'health_check'
  | 'domain_load'
  | 'admin_init'
  | 'inbox_refresh'
  | 'new_address'
  | 'inbox_restore';

export type TempmailRestoreAction = 'use_server' | 'persist_local' | 'keep_local' | 'empty';

export function shouldGenerateTempmailAddress(action: TempmailAddressAction): boolean {
  return action === 'new_address';
}

export function decideTempmailRestore(input: {
  serverInbox: { email: string } | null;
  localInbox: { email: string } | null;
  restoreFailed: boolean;
}): TempmailRestoreAction {
  if (input.serverInbox) return 'use_server';
  if (input.restoreFailed && input.localInbox) return 'keep_local';
  if (input.localInbox) return 'persist_local';
  return 'empty';
}
