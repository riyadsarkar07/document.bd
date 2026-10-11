import { createHash } from 'node:crypto';
import { TEMPMAIL_ENDPOINTS, type TempmailEndpointSpec } from '@/lib/tempmail/endpoints';
import type { TempmailErrorCode } from '@/lib/tempmail/types';

const MAX_EVENTS = 200;

export type TempmailOpKind =
  | 'inbox.create'
  | 'inbox.list'
  | 'message.read'
  | 'message.source'
  | 'message.delete'
  | 'attachment.list'
  | 'attachment.get'
  | 'health.check'
  | 'settings.update'
  | 'access.update';

export interface TempmailOpEvent {
  id: string;
  at: string;
  kind: TempmailOpKind;
  ok: boolean;
  code?: TempmailErrorCode | string;
  status?: number;
  actorId?: string;
  inboxHash?: string;
}

export interface TempmailAppSettings {
  autoRefreshSec: number;
  attachmentsEnabled: boolean;
  sourceEnabled: boolean;
  defaultInboxHours: number;
}

const DEFAULT_SETTINGS: TempmailAppSettings = {
  autoRefreshSec: 0,
  attachmentsEnabled: true,
  sourceEnabled: true,
  defaultInboxHours: 24,
};

const events: TempmailOpEvent[] = [];
const counters = {
  inboxesCreated: 0,
  messagesListed: 0,
  messagesRead: 0,
  messagesDeleted: 0,
  attachmentsFetched: 0,
  apiErrors: 0,
  lastErrorAt: null as string | null,
  lastErrorCode: null as string | null,
};

let settings: TempmailAppSettings = { ...DEFAULT_SETTINGS };
let seq = 0;

export function hashInboxEmail(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase(), 'utf8').digest('hex').slice(0, 12);
}

export function recordTempmailOp(event: Omit<TempmailOpEvent, 'id' | 'at'> & { at?: string }): void {
  const row: TempmailOpEvent = {
    id: `tm-${Date.now().toString(36)}-${(seq += 1).toString(36)}`,
    at: event.at ?? new Date().toISOString(),
    kind: event.kind,
    ok: event.ok,
    code: event.code,
    status: event.status,
    actorId: event.actorId,
    inboxHash: event.inboxHash,
  };
  events.unshift(row);
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;

  if (event.ok) {
    if (event.kind === 'inbox.create') counters.inboxesCreated += 1;
    if (event.kind === 'inbox.list') counters.messagesListed += 1;
    if (event.kind === 'message.read' || event.kind === 'message.source') counters.messagesRead += 1;
    if (event.kind === 'message.delete') counters.messagesDeleted += 1;
    if (event.kind === 'attachment.list' || event.kind === 'attachment.get') counters.attachmentsFetched += 1;
  } else {
    counters.apiErrors += 1;
    counters.lastErrorAt = row.at;
    counters.lastErrorCode = event.code ?? 'provider_error';
  }
}

export function listTempmailOps(limit = 50): TempmailOpEvent[] {
  return events.slice(0, Math.max(1, Math.min(limit, MAX_EVENTS)));
}

export function getTempmailCounters() {
  return { ...counters };
}

export function getTempmailSettings(): TempmailAppSettings {
  return { ...settings };
}

export function updateTempmailSettings(patch: Partial<TempmailAppSettings>): TempmailAppSettings {
  const next: TempmailAppSettings = { ...settings };
  if (typeof patch.autoRefreshSec === 'number' && Number.isFinite(patch.autoRefreshSec)) {
    next.autoRefreshSec = Math.max(0, Math.min(300, Math.round(patch.autoRefreshSec)));
  }
  if (typeof patch.attachmentsEnabled === 'boolean') next.attachmentsEnabled = patch.attachmentsEnabled;
  if (typeof patch.sourceEnabled === 'boolean') next.sourceEnabled = patch.sourceEnabled;
  if (typeof patch.defaultInboxHours === 'number' && Number.isFinite(patch.defaultInboxHours)) {
    next.defaultInboxHours = Math.max(1, Math.min(72, Math.round(patch.defaultInboxHours)));
  }
  settings = next;
  return { ...settings };
}

export function endpointCatalog(): TempmailEndpointSpec[] {
  return TEMPMAIL_ENDPOINTS.map((row) => ({ ...row }));
}
