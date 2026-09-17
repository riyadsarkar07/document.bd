import type { DocumentKind } from '@/lib/workspace/document-kinds';

export interface ServiceFieldOption {
  value: string;
  label: string;
}

export interface ServiceField {
  key: string;
  label: string;
  placeholder?: string;
  type?: 'text' | 'textarea' | 'select';
  options?: ServiceFieldOption[];
  hint?: string;
  rows?: number;
}

/** Free-form key/value snapshot persisted verbatim in the Cloud Vault. */
export type ServiceSnapshot = Record<string, string>;

export interface ServiceEditorConfig {
  kind: Extract<DocumentKind, 'page-recover' | 'business-manager'>;
  eyebrow: string;
  title: string;
  description: string;
  /** Field used for the vault record id / natural key. */
  idField: string;
  /** Field shown as the History "Company" column. */
  titleField: string;
  /** Field shown as the History "Owner" column. */
  subtitleField?: string;
  fields: ServiceField[];
}

function defaultsFor(config: ServiceEditorConfig): ServiceSnapshot {
  const snapshot: ServiceSnapshot = {};
  for (const field of config.fields) {
    snapshot[field.key] = field.type === 'select' ? (field.options?.[0]?.value ?? '') : '';
  }
  return snapshot;
}

export function serviceDefaults(config: ServiceEditorConfig): ServiceSnapshot {
  return defaultsFor(config);
}

export function normalizeServiceSnapshot(
  config: ServiceEditorConfig,
  saved: Partial<ServiceSnapshot> | null | undefined,
): ServiceSnapshot {
  const next = defaultsFor(config);
  if (saved && typeof saved === 'object') {
    for (const field of config.fields) {
      const value = saved[field.key];
      if (typeof value === 'string') next[field.key] = value;
    }
  }
  return next;
}

export function serviceFieldLabel(config: ServiceEditorConfig, key: string): string {
  return config.fields.find((f) => f.key === key)?.label ?? key;
}

export const PAGE_RECOVER_CONFIG: ServiceEditorConfig = {
  kind: 'page-recover',
  eyebrow: 'Recovery service',
  title: 'Hacked Page Recover',
  description: 'Restore access to a hacked or compromised Facebook page with a tracked recovery case.',
  idField: 'caseId',
  titleField: 'pageName',
  subtitleField: 'contactEmail',
  fields: [
    { key: 'caseId', label: 'Case Reference', placeholder: 'RECOVER-XXXXXXXX', hint: 'Auto-filled on first save' },
    { key: 'pageName', label: 'Page Name', placeholder: 'Business page name' },
    { key: 'pageUrl', label: 'Page URL', placeholder: 'https://facebook.com/yourpage' },
    { key: 'contactEmail', label: 'Contact Email', placeholder: 'you@example.com' },
    { key: 'contactPhone', label: 'Contact Phone', placeholder: '+880 1XXX-XXXXXX' },
    { key: 'country', label: 'Country', placeholder: 'Bangladesh' },
    {
      key: 'issueType',
      label: 'Issue Type',
      type: 'select',
      options: [
        { value: 'hacked', label: 'Account / Page Hacked' },
        { value: 'disabled', label: 'Page Disabled' },
        { value: 'restricted', label: 'Feature Restricted' },
        { value: 'ownership', label: 'Ownership Dispute' },
      ],
    },
    { key: 'recoveryEmail', label: 'Recovery Email', placeholder: 'Recovery / backup email' },
    {
      key: 'priority',
      label: 'Priority',
      type: 'select',
      options: [
        { value: 'normal', label: 'Normal' },
        { value: 'high', label: 'High' },
        { value: 'urgent', label: 'Urgent' },
      ],
    },
    {
      key: 'description',
      label: 'Incident Details',
      type: 'textarea',
      rows: 4,
      placeholder: 'Describe how access was lost and any recovery steps already taken.',
    },
  ],
};

export const BUSINESS_MANAGER_CONFIG: ServiceEditorConfig = {
  kind: 'business-manager',
  eyebrow: 'Business service',
  title: 'Business Manager Access',
  description: 'Set up or restore Business Manager access for your pages and ad accounts.',
  idField: 'caseId',
  titleField: 'businessName',
  subtitleField: 'adminEmail',
  fields: [
    { key: 'caseId', label: 'Case Reference', placeholder: 'BM-XXXXXXXX', hint: 'Auto-filled on first save' },
    { key: 'businessName', label: 'Business Name', placeholder: 'Registered business name' },
    { key: 'businessId', label: 'Business Manager ID', placeholder: 'Optional BM ID' },
    { key: 'adminName', label: 'Admin Name', placeholder: 'Full name of the requesting admin' },
    { key: 'adminEmail', label: 'Admin Email', placeholder: 'admin@example.com' },
    { key: 'contactPhone', label: 'Contact Phone', placeholder: '+880 1XXX-XXXXXX' },
    { key: 'country', label: 'Country', placeholder: 'Bangladesh' },
    {
      key: 'accessLevel',
      label: 'Access Level',
      type: 'select',
      options: [
        { value: 'admin', label: 'Full Admin' },
        { value: 'employee', label: 'Employee Access' },
        { value: 'partner', label: 'Partner Access' },
      ],
    },
    {
      key: 'requestType',
      label: 'Request Type',
      type: 'select',
      options: [
        { value: 'setup', label: 'New Setup' },
        { value: 'restore', label: 'Restore Access' },
        { value: 'transfer', label: 'Transfer Ownership' },
      ],
    },
    {
      key: 'notes',
      label: 'Notes',
      type: 'textarea',
      rows: 4,
      placeholder: 'Pages and ad accounts involved, plus any prior correspondence.',
    },
  ],
};
