'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Copy, FileText, CreditCard, Plus, Shapes, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { canManageTemplates } from '@/lib/auth/types';
import { listTemplates, saveTemplate, deleteTemplate } from '@/lib/workspace/store';
import type { TemplateRecord } from '@/lib/auth/types';
import { TM_DEFAULTS } from '@/lib/constants/tm';
import { NID_DEFAULTS } from '@/lib/constants/nid';
import { Card, PageHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { FieldLabel, Input, Textarea } from '@/components/ui/input';
import { useToast } from '@/lib/toast/toast-provider';
import { timeAgo } from '@/lib/utils';

export default function TemplatesPage() {
  const { user, role } = useAuth();
  const toast = useToast();
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [source, setSource] = useState<'supabase' | 'local'>('supabase');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; kind: 'tm' | 'nid' }>({
    open: false,
    kind: 'tm',
  });
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<TemplateRecord | null>(null);

  const refresh = useCallback(async () => {
    const res = await listTemplates();
    setTemplates(res.data);
    setSource(res.source);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openCreate = (kind: 'tm' | 'nid') => {
    setName(`${kind === 'tm' ? 'Trademark Certificate' : 'NID Card'} — ${new Date().toLocaleDateString()}`);
    setDescription('');
    setModal({ open: true, kind });
  };

  const create = async () => {
    const state =
      modal.kind === 'tm'
        ? ({ ...TM_DEFAULTS } as unknown as Record<string, unknown>)
        : ({ ...NID_DEFAULTS } as unknown as Record<string, unknown>);
    const tpl: TemplateRecord = {
      name: name.trim() || `Untitled template`,
      kind: modal.kind,
      description: description.trim(),
      state,
      created_by: user?.email,
    };
    const res = await saveTemplate(tpl);
    setModal({ open: false, kind: modal.kind });
    toast.success(
      res.source === 'local'
        ? `Template saved locally (Supabase table unavailable)`
        : `Template "${tpl.name}" saved`,
    );
    await refresh();
  };

  const remove = async () => {
    if (!deleteTarget?.id) return;
    const res = await deleteTemplate(deleteTarget.id);
    if (res.error) toast.error(res.error);
    else toast.info(`Template deleted`);
    setDeleteTarget(null);
    await refresh();
  };

  return (
    <div>
      <PageHeader
        title="Templates"
        subtitle={`Reusable document presets · ${templates.length} available${
          source === 'local' ? ' · local fallback (Supabase sync off)' : ''
        }`}
        icon={<Shapes className="h-5 w-5" />}
        actions={
          canManageTemplates(role) ? (
            <>
              <Button variant="secondary" icon={<FileText className="h-4 w-4" />} onClick={() => openCreate('tm')}>
                Save TM Template
              </Button>
              <Button variant="primary" icon={<CreditCard className="h-4 w-4" />} onClick={() => openCreate('nid')}>
                Save NID Template
              </Button>
            </>
          ) : (
            <Badge tone="muted">Read-only</Badge>
          )
        }
      />

      {loading ? (
        <div className="py-16 text-center text-sm text-dimm">Loading templates…</div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={<Shapes className="h-8 w-8" />}
          title="No templates yet"
          description={
            canManageTemplates(role)
              ? 'Use “Save TM Template” or “Save NID Template” to store a preset.'
              : 'Templates will appear here once an editor creates them.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => (
            <Card key={t.id ?? t.name} className="group flex flex-col">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                    t.kind === 'tm'
                      ? 'bg-gradient-to-br from-accent to-accent-bright text-canvas'
                      : 'bg-gradient-to-br from-info to-blue-500 text-white'
                  }`}
                >
                  {t.kind === 'tm' ? <FileText className="h-5 w-5" /> : <CreditCard className="h-5 w-5" />}
                </div>
                <Badge tone={t.kind === 'tm' ? 'gold' : 'blue'}>{t.kind.toUpperCase()}</Badge>
              </div>
              <h3 className="font-medium text-primary">{t.name}</h3>
              {t.description && (
                <p className="mt-1 line-clamp-2 flex-1 text-xs leading-relaxed text-muted">
                  {t.description}
                </p>
              )}
              <div className="mt-3 font-mono text-[10.5px] text-dimm">
                Updated {timeAgo(t.updated_at ?? t.created_at)}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Link href={`/studio/editor/${t.kind}?template=${encodeURIComponent(t.id ?? t.name)}`} className="flex-1">
                  <Button variant="secondary" size="sm" icon={<Copy className="h-3.5 w-3.5" />} className="w-full">
                    Use Template
                  </Button>
                </Link>
                {canManageTemplates(role) && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setDeleteTarget(t)}
                    aria-label="Delete template"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modal.open}
        onClose={() => setModal({ open: false, kind: modal.kind })}
        title="Save Document as Template"
        meta={`Snapshot of ${modal.kind === 'tm' ? 'Trademark Certificate' : 'NID Card'} defaults`}
      >
        <div className="flex flex-col gap-4">
          <div>
            <FieldLabel>Template Name</FieldLabel>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <FieldLabel>Description</FieldLabel>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setModal({ open: false, kind: modal.kind })}>
              Cancel
            </Button>
            <Button variant="primary" onClick={create} icon={<Plus className="h-4 w-4" />}>
              Create Template
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        title="Delete template?"
        body={`"${deleteTarget?.name}" will be removed permanently.`}
        confirmLabel="Delete Template"
      />
    </div>
  );
}
