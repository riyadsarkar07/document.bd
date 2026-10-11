import {
  DEFAULT_RAPIDAPI_HOST,
  getTempmailConfig,
  TEMPMAIL_REQUEST_TIMEOUT_MS,
  type TempmailConfig,
} from '@/lib/tempmail/config';
import { buildAddress, generateLocalPart, mailboxMd5, pickDomain } from '@/lib/tempmail/hash';
import {
  parseAttachmentFile,
  parseAttachments,
  parseDeleteResult,
  parseDomains,
  parseMessageDetail,
  parseMessageList,
  parseSourceMessage,
} from '@/lib/tempmail/parse';
import type {
  FetchLike,
  TempmailAttachment,
  TempmailErrorCode,
  TempmailErrorShape,
  TempmailMessageDetail,
  TempmailMessageSummary,
} from '@/lib/tempmail/types';

export class TempmailProviderError extends Error {
  readonly code: TempmailErrorCode;
  readonly status: number;
  readonly retryAfterSec?: number;

  constructor(message: string, code: TempmailErrorCode, status: number, retryAfterSec?: number) {
    super(message);
    this.name = 'TempmailProviderError';
    this.code = code;
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }

  toShape(): TempmailErrorShape {
    return {
      ok: false,
      error: this.message,
      code: this.code,
      status: this.status,
      retryAfterSec: this.retryAfterSec,
    };
  }
}

function retryAfterSeconds(res: Response): number | undefined {
  const header = res.headers.get('retry-after');
  if (!header) return undefined;
  const n = Number(header);
  if (Number.isFinite(n) && n > 0) return Math.ceil(n);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(1, Math.ceil((date - Date.now()) / 1000));
  return undefined;
}

function classifyHttpError(status: number, bodyText: string): TempmailProviderError {
  const snippet = bodyText.replace(/\s+/g, ' ').trim().slice(0, 180);
  if (status === 401) {
    return new TempmailProviderError(
      'RapidAPI rejected the credentials. Check RAPIDAPI_KEY and your Privatix Temp Mail subscription.',
      'unauthorized',
      401,
    );
  }
  if (status === 403) {
    return new TempmailProviderError(
      'RapidAPI denied access. Confirm RAPIDAPI_HOST and that the key is subscribed to Privatix Temp Mail.',
      'forbidden',
      403,
    );
  }
  if (status === 429) {
    const quota = /quota|not subscribed|subscription|plan exceeded|exceeded your/i.test(snippet);
    return new TempmailProviderError(
      quota
        ? 'Temporary email provider subscription or quota limit reached.'
        : 'Temporary email provider rate limit reached. Try again shortly.',
      quota ? 'quota' : 'rate_limited',
      429,
    );
  }
  if (status === 402) {
    return new TempmailProviderError(
      'Temporary email provider subscription limit prevents this operation.',
      'quota',
      402,
    );
  }
  if (status === 404) {
    return new TempmailProviderError('Requested mailbox or message was not found.', 'not_found', 404);
  }
  return new TempmailProviderError(
    snippet ? `Temporary email provider error (${status}): ${snippet}` : `Temporary email provider error (${status}).`,
    'provider_error',
    status >= 400 && status < 600 ? status : 502,
  );
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function rapidApiGet(
  path: string,
  config: TempmailConfig,
  fetchImpl: FetchLike = fetch,
  timeoutMs = TEMPMAIL_REQUEST_TIMEOUT_MS,
): Promise<unknown> {
  const url = `${config.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-RapidAPI-Key': config.apiKey,
        'X-RapidAPI-Host': config.host || DEFAULT_RAPIDAPI_HOST,
      },
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new TempmailProviderError('Temporary email provider timed out.', 'timeout', 504);
    }
    throw new TempmailProviderError(
      'Could not reach the temporary email provider.',
      'provider_error',
      502,
    );
  } finally {
    clearTimeout(timer);
  }

  const payload = await parseBody(res);
  if (!res.ok) {
    const raw = typeof payload === 'string' ? payload : JSON.stringify(payload ?? '');
    const error = classifyHttpError(res.status, raw);
    if (error.code === 'rate_limited') {
      throw new TempmailProviderError(error.message, error.code, error.status, retryAfterSeconds(res));
    }
    throw error;
  }
  return payload;
}

export interface TempmailClient {
  listDomains(): Promise<string[]>;
  createInbox(): Promise<{ email: string; domain: string }>;
  listMessages(email: string): Promise<TempmailMessageSummary[]>;
  readMessage(mailId: string): Promise<TempmailMessageDetail>;
  sourceMessage(mailId: string): Promise<string>;
  deleteMessage(mailId: string): Promise<boolean>;
  listAttachments(mailId: string): Promise<TempmailAttachment[]>;
  getAttachment(
    mailId: string,
    attachmentId: string,
  ): Promise<{ filename: string; contentType: string; size: number; base64: string }>;
}

export function createTempmailClient(
  config: TempmailConfig,
  fetchImpl: FetchLike = fetch,
): TempmailClient {
  return {
    async listDomains() {
      const payload = await rapidApiGet('/request/domains/', config, fetchImpl);
      return parseDomains(payload);
    },
    async createInbox() {
      const domains = await this.listDomains();
      const domain = pickDomain(domains);
      const email = buildAddress(generateLocalPart(), domain);
      return { email, domain };
    },
    async listMessages(email: string) {
      const md5 = mailboxMd5(email);
      const payload = await rapidApiGet(`/request/mail/id/${md5}/`, config, fetchImpl);
      return parseMessageList(payload);
    },
    async readMessage(mailId: string) {
      const payload = await rapidApiGet(`/request/one_mail/id/${encodeURIComponent(mailId)}/`, config, fetchImpl);
      return parseMessageDetail(payload, mailId);
    },
    async deleteMessage(mailId: string) {
      const payload = await rapidApiGet(`/request/delete/id/${encodeURIComponent(mailId)}/`, config, fetchImpl);
      return parseDeleteResult(payload);
    },
    async sourceMessage(mailId: string) {
      const payload = await rapidApiGet(`/request/source/id/${encodeURIComponent(mailId)}/`, config, fetchImpl);
      return parseSourceMessage(payload);
    },
    async listAttachments(mailId: string) {
      const payload = await rapidApiGet(`/request/attachments/id/${encodeURIComponent(mailId)}/`, config, fetchImpl);
      return parseAttachments(payload);
    },
    async getAttachment(mailId: string, attachmentId: string) {
      const encodedMail = encodeURIComponent(mailId);
      const encodedAtt = encodeURIComponent(attachmentId);
      try {
        const payload = await rapidApiGet(
          `/request/one_attachment/id/${encodedMail}/id/${encodedAtt}/`,
          config,
          fetchImpl,
        );
        return parseAttachmentFile(payload, attachmentId);
      } catch (err) {
        if (!(err instanceof TempmailProviderError) || err.code !== 'not_found') throw err;
        const payload = await rapidApiGet(
          `/request/one_mail/id/${encodedMail}/id/${encodedAtt}/`,
          config,
          fetchImpl,
        );
        return parseAttachmentFile(payload, attachmentId);
      }
    },
  };
}

export function requireTempmailClient(fetchImpl: FetchLike = fetch): TempmailClient {
  const config = getTempmailConfig();
  if (!config.configured) {
    throw new TempmailProviderError(config.error, 'not_configured', 503);
  }
  return createTempmailClient(config, fetchImpl);
}
