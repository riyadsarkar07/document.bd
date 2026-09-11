'use client';

import { supabase } from '@/lib/supabase/client';
import { logAudit } from '@/lib/workspace/audit';
import type { ActivityRecord, ProjectRecord, TemplateRecord } from '@/lib/auth/types';

export type DataSource = 'supabase' | 'local';

export interface StoreResult<T> {
  data: T;
  source: DataSource;
  error: string | null;
}

/**
 * True when Supabase rejected the write because of an RLS / server-side
 * enforcement rule (e.g. disabled account, per-user limit). In those cases
 * the local fallback MUST NOT run, or it would bypass enforcement.
 */
function isEnforcementError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === '42501' || /row-level security|violates row-level|new row violates/i.test(err.message ?? '');
}

const LS_TEMPLATES_BASE = 'studio.templates';
const LS_PROJECTS_BASE = 'studio.projects';
const LS_ACTIVITY_BASE = 'studio.activity';

/**
 * localStorage cache keys are scoped to the authenticated user so one user's
 * cached projects/templates/activity never surface in another user's session.
 * Falls back to `anon` when no session is available.
 */
export async function getScopedStorageKey(base: string): Promise<string> {
  try {
    const { data } = await supabase.auth.getUser();
    if (data?.user?.id) return `${base}.${data.user.id}`;
  } catch {
    // fall through to anon scope
  }
  return `${base}.anon`;
}

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / private mode
  }
}

/* ────────────────────────── Templates ────────────────────────── */

export async function listTemplates(): Promise<StoreResult<TemplateRecord[]>> {
  const key = await getScopedStorageKey(LS_TEMPLATES_BASE);
  const local = readLocal<TemplateRecord[]>(key, []);
  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return { data: local, source: 'local', error: null };
  return { data: data as TemplateRecord[], source: 'supabase', error: null };
}

function withLocalId<T extends { id?: string }>(record: T): T {
  if (record.id) return record;
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return { ...record, id };
}

export async function saveTemplate(tpl: TemplateRecord): Promise<StoreResult<TemplateRecord | null>> {
  // Templates are always attributed to the current user so RLS ownership holds
  // even if a caller forgets to set owner_id.
  const { data: authData } = await supabase.auth.getUser();
  const ownerId = authData?.user?.id ?? tpl.owner_id;
  const { data, error } = await supabase
    .from('templates')
    .upsert({ ...tpl, owner_id: ownerId, updated_at: new Date().toISOString() })
    .select()
    .maybeSingle();
  if (error) {
    if (isEnforcementError(error)) {
      return { data: null, source: 'supabase', error: error.message };
    }
    const saved = withLocalId({ ...tpl, updated_at: new Date().toISOString() });
    const key = await getScopedStorageKey(LS_TEMPLATES_BASE);
    const local = readLocal<TemplateRecord[]>(key, []);
    const idx = local.findIndex((t) => t.id === saved.id);
    if (idx >= 0) local[idx] = saved;
    else local.unshift({ ...saved, created_at: saved.created_at ?? new Date().toISOString() });
    writeLocal(key, local);
    return { data: saved, source: 'local', error: null };
  }
  void logAudit({
    action: 'template.saved',
    targetType: 'template',
    targetId: data?.id ?? tpl.id,
    metadata: { name: tpl.name, kind: tpl.kind },
  });
  return { data: data as TemplateRecord, source: 'supabase', error: null };
}

export async function deleteTemplate(id: string): Promise<StoreResult<null>> {
  const { data, error } = await supabase.from('templates').delete().eq('id', id).select('name');
  if (error) {
    if (isEnforcementError(error)) {
      return { data: null, source: 'supabase', error: error.message };
    }
    const key = await getScopedStorageKey(LS_TEMPLATES_BASE);
    const local = readLocal<TemplateRecord[]>(key, []).filter((t) => t.id !== id);
    writeLocal(key, local);
    return { data: null, source: 'local', error: null };
  }
  const key = await getScopedStorageKey(LS_TEMPLATES_BASE);
  writeLocal(key, readLocal<TemplateRecord[]>(key, []).filter((t) => t.id !== id));
  void logAudit({ action: 'template.deleted', targetType: 'template', targetId: id, metadata: { name: data?.[0]?.name ?? '' } });
  return { data: null, source: 'supabase', error: null };
}

/* ────────────────────────── Projects ────────────────────────── */

export async function listProjects(): Promise<StoreResult<ProjectRecord[]>> {
  const key = await getScopedStorageKey(LS_PROJECTS_BASE);
  const local = readLocal<ProjectRecord[]>(key, []);
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) return { data: local, source: 'local', error: null };
  return { data: data as ProjectRecord[], source: 'supabase', error: null };
}

export async function saveProject(proj: ProjectRecord): Promise<StoreResult<ProjectRecord | null>> {
  const { data, error } = await supabase
    .from('projects')
    .upsert({ ...proj, updated_at: new Date().toISOString() })
    .select()
    .maybeSingle();
  if (error) {
    if (isEnforcementError(error)) {
      return { data: null, source: 'supabase', error: error.message };
    }
    const saved = withLocalId({ ...proj, updated_at: new Date().toISOString() });
    const key = await getScopedStorageKey(LS_PROJECTS_BASE);
    const local = readLocal<ProjectRecord[]>(key, []);
    const idx = local.findIndex((p) => p.id === saved.id);
    if (idx >= 0) local[idx] = saved;
    else local.unshift({ ...saved, created_at: saved.created_at ?? new Date().toISOString() });
    writeLocal(key, local);
    return { data: saved, source: 'local', error: null };
  }
  void logAudit({
    action: 'project.saved',
    targetType: 'project',
    targetId: data?.id ?? proj.id,
    metadata: { name: proj.name, kind: proj.kind },
  });
  return { data: data as ProjectRecord, source: 'supabase', error: null };
}

export async function deleteProject(id: string): Promise<StoreResult<null>> {
  const { data, error } = await supabase.from('projects').delete().eq('id', id).select('name');
  if (error) {
    if (isEnforcementError(error)) {
      return { data: null, source: 'supabase', error: error.message };
    }
    const key = await getScopedStorageKey(LS_PROJECTS_BASE);
    const local = readLocal<ProjectRecord[]>(key, []).filter((p) => p.id !== id);
    writeLocal(key, local);
    return { data: null, source: 'local', error: null };
  }
  const key = await getScopedStorageKey(LS_PROJECTS_BASE);
  writeLocal(key, readLocal<ProjectRecord[]>(key, []).filter((p) => p.id !== id));
  void logAudit({ action: 'project.deleted', targetType: 'project', targetId: id, metadata: { name: data?.[0]?.name ?? '' } });
  return { data: null, source: 'supabase', error: null };
}

/* ────────────────────────── Activity ────────────────────────── */

export async function logActivity(record: ActivityRecord): Promise<void> {
  const { error } = await supabase.from('activity_logs').insert({
    user_id: record.user_id,
    email: record.email,
    action: record.action,
    detail: record.detail,
  });
  if (error) {
    // Do not mirror enforcement-blocked actions into the local log either.
    if (isEnforcementError(error)) return;
  }
  const key = await getScopedStorageKey(LS_ACTIVITY_BASE);
  const local = readLocal<ActivityRecord[]>(key, []);
  writeLocal(key, [
    { ...record, created_at: new Date().toISOString() },
    ...local.slice(0, 199),
  ]);
}

export async function listActivity(opts?: { userId?: string }): Promise<StoreResult<ActivityRecord[]>> {
  const key = await getScopedStorageKey(LS_ACTIVITY_BASE);
  const local = readLocal<ActivityRecord[]>(key, []);
  let query = supabase.from('activity_logs').select('*');
  if (opts?.userId) query = query.eq('user_id', opts.userId);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(200);
  if (error || !data?.length) {
    return { data: local.length ? local : [], source: local.length ? 'local' : 'supabase', error: null };
  }
  return { data: data as ActivityRecord[], source: 'supabase', error: null };
}
