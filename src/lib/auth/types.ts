export type Role = 'admin' | 'editor' | 'viewer';

export type UserStatus = 'active' | 'disabled';

export type DocKind = 'tm' | 'nid' | 'tin';

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  tm: 'Trademark Certificate',
  nid: 'NID Card',
  tin: 'TIN Record',
};

export interface Profile {
  id: string;
  email: string;
  full_name?: string | null;
  role: Role;
  status?: UserStatus;
  max_projects?: number | null;
  max_documents?: number | null;
  max_exports?: number | null;
  created_at?: string;
}

export interface ActivityRecord {
  id?: string;
  user_id?: string;
  email?: string;
  action: string;
  detail?: string;
  created_at?: string;
}

export interface TemplateRecord {
  id?: string;
  name: string;
  kind: DocKind;
  description?: string;
  state: Record<string, unknown>;
  thumbnail?: string | null;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ProjectRecord {
  id?: string;
  name: string;
  kind: DocKind;
  state: Record<string, unknown>;
  owner_id?: string;
  created_at?: string;
  updated_at?: string;
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};

export const USER_STATUS_LABEL: Record<UserStatus, string> = {
  active: 'Active',
  disabled: 'Disabled',
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  admin: 'Full access to documents, templates, users and activity logs',
  editor: 'Can create, edit and export documents and templates',
  viewer: 'Read-only access to documents and templates',
};

export function canManageUsers(role?: Role | null): boolean {
  return role === 'admin';
}

export function canManageTemplates(role?: Role | null): boolean {
  return role === 'admin' || role === 'editor';
}

export function canEditDocuments(role?: Role | null): boolean {
  return role === 'admin' || role === 'editor';
}
