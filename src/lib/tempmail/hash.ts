import { createHash, randomBytes, randomInt } from 'node:crypto';

const EMAIL_RE = /^[a-z0-9][a-z0-9._-]{2,42}@[a-z0-9][a-z0-9.-]{1,80}\.[a-z]{2,24}$/;
const MAIL_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;

export function mailboxMd5(email: string): string {
  return createHash('md5').update(email.trim().toLowerCase(), 'utf8').digest('hex');
}

export function normalizeDomain(value: string): string {
  return value.trim().replace(/^@+/, '').replace(/\/+$/, '').toLowerCase();
}

export function isValidTempmailAddress(value: string): boolean {
  return EMAIL_RE.test(value.trim().toLowerCase());
}

export function isValidMailId(value: string): boolean {
  return MAIL_ID_RE.test(value.trim());
}

export function generateLocalPart(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(10);
  let out = 'c';
  for (let i = 0; i < 9; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export function pickDomain(domains: string[]): string {
  if (domains.length === 0) {
    throw new Error('No temporary email domains are available.');
  }
  return domains[randomInt(0, domains.length)];
}

export function buildAddress(localPart: string, domain: string): string {
  return `${localPart}@${normalizeDomain(domain)}`.toLowerCase();
}
