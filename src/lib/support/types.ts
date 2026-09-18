export const SUPPORT_CATEGORIES = [
  'bug',
  'account',
  'document-editor',
  'pdf-editor',
  'payment',
  'other',
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const SUPPORT_CATEGORY_LABEL: Record<SupportCategory, string> = {
  bug: 'Bug / Technical Issue',
  account: 'Account Issue',
  'document-editor': 'Document Editor Issue',
  'pdf-editor': 'PDF Editor Issue',
  payment: 'Payment / Subscription',
  other: 'Other',
};

export const SUPPORT_STATUSES = [
  'open',
  'in_review',
  'waiting_for_user',
  'escalated',
  'resolved',
  'closed',
] as const;

export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export const SUPPORT_STATUS_LABEL: Record<SupportStatus, string> = {
  open: 'Open',
  in_review: 'In Review',
  waiting_for_user: 'Waiting for User',
  escalated: 'Escalated',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const SUPPORT_STATUS_TONE: Record<
  SupportStatus,
  'gold' | 'blue' | 'warning' | 'red' | 'green' | 'muted'
> = {
  open: 'gold',
  in_review: 'blue',
  waiting_for_user: 'warning',
  escalated: 'red',
  resolved: 'green',
  closed: 'muted',
};

export const SUPPORT_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];

export const SUPPORT_PRIORITY_LABEL: Record<SupportPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

export const SUPPORT_PRIORITY_TONE: Record<SupportPriority, 'muted' | 'blue' | 'warning' | 'red'> = {
  low: 'muted',
  normal: 'blue',
  high: 'warning',
  urgent: 'red',
};

export interface SupportTicket {
  id: string;
  ticketNo: string;
  userId: string;
  userEmail: string | null;
  category: SupportCategory;
  subject: string;
  status: SupportStatus;
  priority: SupportPriority;
  assignedAdminId: string | null;
  assignedAdminEmail: string | null;
  lastReplyAt: string | null;
  lastReplyBy: 'user' | 'admin' | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportMessage {
  id: string;
  ticketId: string;
  authorId: string | null;
  authorEmail: string | null;
  authorRole: 'user' | 'admin';
  body: string;
  createdAt: string;
}

export interface SupportNote {
  id: string;
  ticketId: string;
  authorId: string | null;
  authorEmail: string | null;
  body: string;
  createdAt: string;
}

export interface SupportAttachment {
  id: string;
  ticketId: string;
  messageId: string | null;
  uploadedBy: string | null;
  storagePath: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
  url?: string | null;
}

export interface SupportTicketQuery {
  search?: string;
  status?: SupportStatus | '';
  category?: SupportCategory | '';
  page?: number;
  pageSize?: number;
}

export interface SupportTicketList {
  tickets: SupportTicket[];
  total: number;
  page: number;
  pageSize: number;
  error: string | null;
}

export const SUPPORT_TICKET_NO_RE = /^SUP-\d{8}-\d{4}$/;
export const SUPPORT_SUBJECT_MIN = 3;
export const SUPPORT_SUBJECT_MAX = 160;
export const SUPPORT_BODY_MIN = 8;
export const SUPPORT_BODY_MAX = 8000;
export const SUPPORT_REPLY_MAX = 8000;
export const SUPPORT_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;
export const SUPPORT_ATTACHMENT_MAX_FILES = 4;

export const SUPPORT_SUGGESTED_REPLIES = [
  'Thank you for contacting Support. Please provide a screenshot of the issue so we can investigate it properly.',
  'We have received your report and our support team is currently reviewing the issue.',
  'Could you please provide a few more details about the issue and the steps that caused it?',
  'Your issue has been escalated to our technical team for further investigation.',
  'The reported issue has been reviewed and fixed. Please try again and let us know if the problem still occurs.',
  "We're currently waiting for the requested information from you.",
  'We believe the issue has been resolved. Please confirm so we can close this ticket.',
] as const;

export function isSupportCategory(value: unknown): value is SupportCategory {
  return typeof value === 'string' && (SUPPORT_CATEGORIES as readonly string[]).includes(value);
}

export function isSupportStatus(value: unknown): value is SupportStatus {
  return typeof value === 'string' && (SUPPORT_STATUSES as readonly string[]).includes(value);
}

export function isSupportPriority(value: unknown): value is SupportPriority {
  return typeof value === 'string' && (SUPPORT_PRIORITIES as readonly string[]).includes(value);
}

export function isSupportTicketNo(value: unknown): value is string {
  return typeof value === 'string' && SUPPORT_TICKET_NO_RE.test(value);
}

export function validateTicketDraft(input: {
  category: unknown;
  subject: unknown;
  body: unknown;
}): string | null {
  if (!isSupportCategory(input.category)) return 'Choose a category.';
  if (typeof input.subject !== 'string') return 'Subject is required.';
  const subject = input.subject.trim();
  if (subject.length < SUPPORT_SUBJECT_MIN || subject.length > SUPPORT_SUBJECT_MAX) {
    return `Subject must be ${SUPPORT_SUBJECT_MIN}–${SUPPORT_SUBJECT_MAX} characters.`;
  }
  if (typeof input.body !== 'string') return 'Description is required.';
  const body = input.body.trim();
  if (body.length < SUPPORT_BODY_MIN || body.length > SUPPORT_BODY_MAX) {
    return `Description must be ${SUPPORT_BODY_MIN}–${SUPPORT_BODY_MAX} characters.`;
  }
  return null;
}

export function validateReplyBody(body: unknown): string | null {
  if (typeof body !== 'string') return 'Reply is required.';
  const trimmed = body.trim();
  if (trimmed.length < 1 || trimmed.length > SUPPORT_REPLY_MAX) {
    return `Reply must be 1–${SUPPORT_REPLY_MAX} characters.`;
  }
  return null;
}
