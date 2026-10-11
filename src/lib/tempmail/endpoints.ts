export interface TempmailEndpointSpec {
  id: string;
  method: 'GET';
  path: string;
  label: string;
  implemented: true;
  probe: 'live' | 'on_use';
}

/**
 * Privatix Temp Mail v1 on RapidAPI.
 * Paths match the documented GET endpoints under RAPIDAPI_HOST.
 */
export const TEMPMAIL_ENDPOINTS: readonly TempmailEndpointSpec[] = [
  {
    id: 'domains',
    method: 'GET',
    path: '/request/domains/',
    label: 'Domains list',
    implemented: true,
    probe: 'live',
  },
  {
    id: 'mail',
    method: 'GET',
    path: '/request/mail/id/{md5}/',
    label: 'Get emails / refresh inbox',
    implemented: true,
    probe: 'on_use',
  },
  {
    id: 'one_mail',
    method: 'GET',
    path: '/request/one_mail/id/{mail_id}/',
    label: 'Get one message',
    implemented: true,
    probe: 'on_use',
  },
  {
    id: 'source',
    method: 'GET',
    path: '/request/source/id/{mail_id}/',
    label: 'Source message',
    implemented: true,
    probe: 'on_use',
  },
  {
    id: 'delete',
    method: 'GET',
    path: '/request/delete/id/{mail_id}/',
    label: 'Delete message',
    implemented: true,
    probe: 'on_use',
  },
  {
    id: 'attachments',
    method: 'GET',
    path: '/request/attachments/id/{mail_id}/',
    label: 'Get message attachments',
    implemented: true,
    probe: 'on_use',
  },
  {
    id: 'one_attachment',
    method: 'GET',
    path: '/request/one_attachment/id/{mail_id}/id/{attachment_id}/',
    label: 'Get one attachment',
    implemented: true,
    probe: 'on_use',
  },
] as const;

export const TEMPMAIL_LEGACY_ATTACHMENT_PATH =
  '/request/one_mail/id/{mail_id}/id/{attachment_id}/';
