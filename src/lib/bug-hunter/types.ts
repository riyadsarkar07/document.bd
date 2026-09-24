export const BUG_KINDS = [
  'javascript',
  'promise',
  'api',
  'supabase',
  'auth',
  'rls',
  'rpc',
  'network',
  'load',
  'pdf',
  'save',
  'exception',
] as const;

export type BugKind = (typeof BUG_KINDS)[number];

export const BUG_KIND_LABEL: Record<BugKind, string> = {
  javascript: 'JavaScript / runtime',
  promise: 'Unhandled promise',
  api: 'Failed API request',
  supabase: 'Supabase / database',
  auth: 'Authentication / session',
  rls: 'RLS / permission',
  rpc: 'Failed RPC call',
  network: 'Network / request',
  load: 'Page / component load',
  pdf: 'PDF / render / export',
  save: 'Save / History',
  exception: 'Unexpected exception',
};

export const BUG_STATUSES = ['new', 'investigating', 'resolved', 'ignored'] as const;

export type BugStatus = (typeof BUG_STATUSES)[number];

export const BUG_STATUS_LABEL: Record<BugStatus, string> = {
  new: 'New',
  investigating: 'Investigating',
  resolved: 'Resolved',
  ignored: 'Ignored',
};

export const BUG_STATUS_TONE: Record<BugStatus, 'gold' | 'blue' | 'green' | 'muted'> = {
  new: 'gold',
  investigating: 'blue',
  resolved: 'green',
  ignored: 'muted',
};

export const BUG_SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;

export type BugSeverity = (typeof BUG_SEVERITIES)[number];

export const BUG_SEVERITY_LABEL: Record<BugSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const BUG_SEVERITY_TONE: Record<BugSeverity, 'red' | 'warning' | 'gold' | 'muted'> = {
  critical: 'red',
  high: 'warning',
  medium: 'gold',
  low: 'muted',
};

export const OPEN_BUG_STATUSES: BugStatus[] = ['new', 'investigating'];

export interface BugReportDraft {
  kind: BugKind;
  message: string;
  stack?: string | null;
  route?: string | null;
  component?: string | null;
  endpoint?: string | null;
  httpStatus?: number | null;
  supabaseCode?: string | null;
  browser?: string | null;
  device?: string | null;
  occurrences?: number;
}

export interface BugReport {
  id: string;
  bugNo: string;
  fingerprint: string;
  status: BugStatus;
  severity: BugSeverity;
  kind: BugKind;
  title: string;
  message: string;
  reason: string;
  route: string | null;
  component: string | null;
  endpoint: string | null;
  httpStatus: number | null;
  supabaseCode: string | null;
  userId: string | null;
  userEmail: string | null;
  userRole: string | null;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  browser: string | null;
  device: string | null;
  stack: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BugHunterQuery {
  search?: string;
  status?: BugStatus | '';
  severity?: BugSeverity | '';
  route?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface BugHunterList {
  bugs: BugReport[];
  total: number;
  page: number;
  pageSize: number;
  error: string | null;
}

export interface BugHunterSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  openCount: number;
  resolvedCount: number;
  ignoredCount: number;
  total: number;
  frequent: Array<Pick<BugReport, 'id' | 'bugNo' | 'title' | 'severity' | 'occurrenceCount' | 'route'>>;
}

export const BUG_MESSAGE_MAX = 2000;
export const BUG_STACK_MAX = 8000;
export const BUG_ROUTE_MAX = 300;
export const BUG_ENDPOINT_MAX = 400;
export const BUG_COMPONENT_MAX = 200;
export const BUG_TITLE_MAX = 160;
export const BUG_REASON_MAX = 400;
export const BUG_CODE_MAX = 64;
export const BUG_BROWSER_MAX = 240;

export function isBugKind(value: unknown): value is BugKind {
  return typeof value === 'string' && (BUG_KINDS as readonly string[]).includes(value);
}

export function isBugStatus(value: unknown): value is BugStatus {
  return typeof value === 'string' && (BUG_STATUSES as readonly string[]).includes(value);
}

export function isBugSeverity(value: unknown): value is BugSeverity {
  return typeof value === 'string' && (BUG_SEVERITIES as readonly string[]).includes(value);
}
