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
  | 'new_address';

export function shouldGenerateTempmailAddress(action: TempmailAddressAction): boolean {
  return action === 'new_address';
}
