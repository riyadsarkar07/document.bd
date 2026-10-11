export type TempmailErrorCode =
  | 'not_configured'
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'timeout'
  | 'invalid_response'
  | 'provider_error'
  | 'validation'
  | 'not_found';

export interface TempmailErrorShape {
  ok: false;
  error: string;
  code: TempmailErrorCode;
  retryAfterSec?: number;
  status: number;
}

export interface TempmailInbox {
  email: string;
  domain: string;
  inboxToken: string;
  expiresAt: string;
}

export interface TempmailMessageSummary {
  id: string;
  from: string;
  subject: string;
  receivedAt: string | null;
  preview: string;
}

export interface TempmailMessageDetail extends TempmailMessageSummary {
  to: string;
  text: string;
  html: string;
}

export interface TempmailListResult {
  ok: true;
  email: string;
  messages: TempmailMessageSummary[];
}

export interface TempmailCreateResult {
  ok: true;
  inbox: TempmailInbox;
}

export interface TempmailReadResult {
  ok: true;
  email: string;
  message: TempmailMessageDetail;
}

export interface TempmailDeleteResult {
  ok: true;
  deleted: true;
}

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
