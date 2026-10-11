export const DEFAULT_RAPIDAPI_HOST = 'privatix-temp-mail-v1.p.rapidapi.com';
export const DEFAULT_RAPIDAPI_BASE_URL = 'https://privatix-temp-mail-v1.p.rapidapi.com';

export const TEMPMAIL_PROVIDER_NAME = 'Privatix Temp Mail';
export const TEMPMAIL_PROVIDER_SLUG = 'Privatix/temp-mail';

export const TEMPMAIL_REQUEST_TIMEOUT_MS = 12_000;
export const INBOX_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export interface TempmailConfig {
  apiKey: string;
  host: string;
  baseUrl: string;
  inboxSecret: string;
  configured: true;
}

export interface TempmailConfigMissing {
  configured: false;
  error: string;
}

export function getTempmailConfig(): TempmailConfig | TempmailConfigMissing {
  const apiKey = (process.env.RAPIDAPI_KEY ?? '').trim();
  const host = (process.env.RAPIDAPI_HOST ?? DEFAULT_RAPIDAPI_HOST).trim() || DEFAULT_RAPIDAPI_HOST;
  const rawBase = (process.env.RAPIDAPI_BASE_URL ?? `https://${host}`).trim() || DEFAULT_RAPIDAPI_BASE_URL;
  const baseUrl = rawBase.replace(/\/+$/, '');
  const inboxSecret = (process.env.TEMPMAIL_INBOX_SECRET ?? '').trim() || apiKey;

  if (!apiKey) {
    return {
      configured: false,
      error:
        'Temporary email is not configured. Set RAPIDAPI_KEY on the server (RapidAPI subscription for Privatix Temp Mail).',
    };
  }

  return { configured: true, apiKey, host, baseUrl, inboxSecret };
}
