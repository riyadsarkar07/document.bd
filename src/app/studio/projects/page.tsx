'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CreditCard, FileText, FolderKanban, FolderOpen, Landmark, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { listProjects, saveProject, deleteProject } from '@/lib/workspace/store';
import { DOC_KIND_LABEL, type ProjectRecord } from '@/lib/auth/types';
import { TM_DEFAULTS } from '@/lib/constants/tm';
import { NID_DEFAULTS } from '@/lib/constants/nid';
import { TIN_DEFAULTS } from '@/lib/constants/tin';
import { Card, PageHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { FieldLabel, Input } from '@/components/ui/input';
import { useToast } from '@/lib/toast/toast-provider';
import { timeAgo } from '@/lib/utils';

const KIND_ICON = { tm: FileText, nid: CreditCard, tin: Landmark } as const;
const KIND_TONE = { tm: 'gold', nid: 'blue', tin: 'green' } as const;
const KIND_GRADIENT = {
  tm: 'bg-gradient-to-br from-accent to-accent-bright text-canvas',
  nid: 'bg-gradient-to-br from-info to-blue-500 text-white',
  tin: 'bg-gradient-to-br from-success to-emerald-500 text-white',
} as const;

export default function ProjectsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [source, setSource] = useState<'supabase' | 'local'>('supabase');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; kind: 'tm' | 'nid' | 'tin' }>({
    open: false,
    kind: 'tm',
  });
  const [name, setName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ProjectRecord | null>(null);

  const refresh = useCallback(async () => {
    const res = await listProjects();
    setProjects(res.data);
    setSource(res.source);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openCreate = (kind: 'tm' | 'nid' | 'tin') => {
    setName(`${DOC_KIND_LABEL[kind]} — Project`);
    setModal({ open: true, kind });
  };

  const create = async () => {
    const state =
      modal.kind === 'tm'
        ? ({ ...TM_DEFAULTS } as unknown as Record<string, unknown>)
        : modal.kind === 'nid'
          ? ({ ...NID_DEFAULTS } as unknown as Record<string, unknown>)
          : ({ ...TIN_DEFAULTS } as unknown as Record<string, unknown>);
    const proj: ProjectRecord = {
      name: name.trim() || 'Untitled project',
      kind: modal.kind,
      state,
      owner_id: user?.id,
    };
    const res = await saveProject(proj);
    setModal({ open: false, kind: modal.kind });
    toast.success(res.source === 'local' ? 'Project saved locally' : 'Project created');
    await refresh();
  };

  const remove = async () => {
    if (!deleteTarget?.id) return;
    const res = await deleteProject(deleteTarget.id);
    if (res.error) toast.error(res.error);
    else toast.info('Project deleted');
    setDeleteTarget(null);
    await refresh();
  };

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle={`Saved document workspaces · ${projects.length} total${
          source === 'local' ? ' · local fallback (Supabase sync off)' : ''
        }`}
        icon={<FolderKanban className="h-5 w-5" />}
        actions={
          <>
            <Button variant="secondary" icon={<FileText className="h-4 w-4" />} onClick={() => openCreate('tm')}>
              New TM Project
            </Button>
            <Button variant="outline" icon={<CreditCard className="h-4 w-4" />} onClick={() => openCreate('nid')}>
              New NID Project
            </Button>
            <Button variant="success" icon={<Landmark className="h-4 w-4" />} onClick={() => openCreate('tin')}>
              New TIN Project
            </Button>
          </>
        }
      />

      {loading ? (
        <div className="py-16 text-center text-sm text-dimm">Loading projects…</div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-8 w-8" />}
          title="No projects yet"
          description="Create a project workspace to save in-progress documents and reopen them anytime."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <Card key={p.id ?? p.name} className="group flex flex-col">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                    KIND_GRADIENT[p.kind] ?? KIND_GRADIENT.tm
                  }`}
                >
                  {(() => {
                    const Icon = KIND_ICON[p.kind] ?? FileText;
                    return <Icon className="h-5 w-5" />;
                  })()}
                </div>
                <Badge tone={KIND_TONE[p.kind] ?? 'gold'}>{p.kind.toUpperCase()}</Badge>
              </div>
              <h3 className="font-medium text-primary">{p.name}</h3>
              <div className="mt-1 font-mono text-[10.5px] text-dimm">
                Saved {timeAgo(p.updated_at ?? p.created_at)}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Link href={`/studio/editor/${p.kind}?project=${encodeURIComponent(p.id ?? p.name)}`} className="flex-1">
                  <Button variant="secondary" size="sm" icon={<FolderOpen className="h-3.5 w-3.5" />} className="w-full">
                    Open Project
                  </Button>
                </Link>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setDeleteTarget(p)}
                  aria-label="Delete project"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modal.open}
        onClose={() => setModal({ open: false, kind: modal.kind })}
        title="Create New Project"
        meta={`${DOC_KIND_LABEL[modal.kind]} workspace`}
      >
        <div className="flex flex-col gap-4">
          <div>
            <FieldLabel>Project Name</FieldLabel>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setModal({ open: false, kind: modal.kind })}>
              Cancel
            </Button>
            <Button variant="primary" onClick={create} icon={<Plus className="h-4 w-4" />}>
              Create Project
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        title="Delete project?"
        body={`"${deleteTarget?.name}" and its saved document state will be removed.`}
        confirmLabel="Delete Project"
      />
    </div>
  );
}
