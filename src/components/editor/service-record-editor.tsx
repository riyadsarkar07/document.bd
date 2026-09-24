'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Download, PanelRightOpen, RotateCcw, Save, Undo2, Redo2 } from 'lucide-react';
import { useDocumentEditor } from '@/lib/editor/use-document-editor';
import {
  normalizeServiceSnapshot,
  serviceDefaults,
  serviceFieldLabel,
  type ServiceEditorConfig,
  type ServiceSnapshot,
} from '@/lib/constants/services';
import { commitDocument, getVaultRecord } from '@/lib/workspace/vault';
import { newRecordId } from '@/lib/workspace/document-kinds';
import { checkLimit } from '@/lib/workspace/limits';
import { logActivity } from '@/lib/workspace/store';
import { useAuth } from '@/lib/auth/auth-context';
import { useToast } from '@/lib/toast/toast-provider';
import { InspectorPanel } from '@/components/editor/inspector-panel';
import { Button } from '@/components/ui/button';
import { FieldLabel, Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

/**
 * Shared form-based Studio editor for the service documents (Hacked Page
 * Recover, Business Manager Access). Both follow the same contract as the
 * canvas editors: Save → unified Cloud Vault History → reopen via `?record=` →
 * edit → Save updates the same record.
 */
export function ServiceRecordEditor({ config }: { config: ServiceEditorConfig }) {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();
  const [historyRecordId, setHistoryRecordId] = useState<string | null>(null);

  const externalCacheRef = useRef<ServiceSnapshot | null>(null);
  const editor = useDocumentEditor<ServiceSnapshot>({
    kind: config.kind,
    defaults: serviceDefaults(config),
    autosaveKey: `studio.autosave.${config.kind}.${user?.id ?? 'anon'}`,
    loadExternal: () => externalCacheRef.current,
    normalize: (state) => normalizeServiceSnapshot(config, state),
  });

  const { present, setField, setStatus, status } = editor;
  const presentRef = useRef(present);
  presentRef.current = present;

  // Reopen a saved service record in this editor.
  useEffect(() => {
    const recordNo = searchParams.get('record');
    if (!recordNo) return;
    let cancelled = false;
    (async () => {
      const res = await getVaultRecord(recordNo);
      if (cancelled) return;
      if (res.error || !res.record) {
        toast.error(res.error ?? 'Could not load History record');
        return;
      }
      if (res.record.docKind !== config.kind) {
        toast.error(`This History record is not a ${config.title}.`);
        return;
      }
      const next = normalizeServiceSnapshot(config, res.record.doc as Partial<ServiceSnapshot>);
      externalCacheRef.current = next;
      editor.replace(next);
      setHistoryRecordId(res.record.trademarkNo);
      setStatus(`History record ${recordNo} loaded`);
      toast.success(`History record ${recordNo} loaded`);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, config]);

  const save = useCallback(async () => {
    if (!user) {
      toast.error('Sign in to save records');
      return;
    }
    const limit = await checkLimit('document');
    if (!limit.ok) {
      toast.error(limit.message ?? 'Document limit reached.');
      return;
    }
    const snap = presentRef.current;
    const recordId = historyRecordId ?? (snap[config.idField]?.trim() || newRecordId(config.kind));
    const payload: ServiceSnapshot = { ...snap, [config.idField]: recordId };
    const res = await commitDocument({
      docKind: config.kind,
      recordId,
      title: snap[config.titleField]?.trim() || `${config.title} record`,
      subtitle: config.subtitleField ? snap[config.subtitleField]?.trim() : undefined,
      payload,
      createdBy: user.id,
    });
    if (res.error) {
      toast.error(res.error);
      return;
    }
    if (!snap[config.idField]) setField(config.idField, recordId);
    setHistoryRecordId(res.recordId);
    setStatus(`Saved to History · ${recordId}`);
    void logActivity({
      user_id: user.id,
      email: user.email,
      action: `${config.kind}.save`,
      detail: `${config.title} ${recordId}`,
    });
    toast.success(`Saved to History · ${recordId}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, toast, historyRecordId, config, setField, setStatus]);

  const downloadJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(presentRef.current, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = `${config.kind}-${presentRef.current[config.idField] || 'record'}.json`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success('Record JSON downloaded');
  }, [config, toast]);

  const set = (key: string, value: string) => setField(key, value);

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface/85 px-3 py-2.5 backdrop-blur-xl sm:px-4">
          <div className="flex items-center gap-1 rounded-xl border border-line bg-surface-raised p-1">
            <Button size="icon-sm" variant="ghost" onClick={editor.undo} disabled={!editor.canUndo} title="Undo">
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={editor.redo} disabled={!editor.canRedo} title="Redo">
              <Redo2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => {
                editor.reset();
                setHistoryRecordId(null);
                toast.info(`${config.title} reset to defaults`);
              }}
              title="Reset to defaults"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>

          <Button variant="secondary" size="sm" onClick={() => void save()} icon={<Save className="h-3.5 w-3.5" />}>
            Save
          </Button>
          <Button variant="outline" size="sm" onClick={downloadJson} icon={<Download className="h-3.5 w-3.5" />}>
            JSON
          </Button>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden max-w-[280px] truncate font-mono text-[10.5px] text-dimm xl:block">{status}</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-canvas/40 p-4 sm:p-6">
          <div className="mx-auto max-w-2xl rounded-2xl border border-line bg-surface p-6 shadow-card">
            <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
              <div>
                <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-accent-bright">
                  {config.eyebrow}
                </div>
                <h2 className="mt-1 font-display text-xl font-bold text-primary">{config.title}</h2>
              </div>
              <span className="rounded-lg border border-line bg-surface-raised px-2.5 py-1 font-mono text-[10.5px] text-muted">
                {present[config.idField] || 'Unsaved'}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {config.fields
                .filter((f) => f.key !== config.idField)
                .map((field) => (
                  <div key={field.key} className={field.type === 'textarea' ? 'sm:col-span-2' : undefined}>
                    <dt className="text-[10.5px] font-bold uppercase tracking-wide text-muted">
                      {serviceFieldLabel(config, field.key)}
                    </dt>
                    <dd className="mt-1 whitespace-pre-wrap break-words text-[13px] text-primary">
                      {present[field.key] || <span className="text-dimm">—</span>}
                    </dd>
                  </div>
                ))}
            </dl>
          </div>
        </div>

        {!editor.inspectorOpen && (
          <button
            onClick={editor.toggleInspector}
            className="absolute right-5 top-16 z-30 flex items-center gap-2 rounded-full border border-line-strong bg-surface/90 px-4 py-2.5 text-xs font-semibold text-muted shadow-pop backdrop-blur-xl transition hover:text-accent-bright"
          >
            <PanelRightOpen className="h-4 w-4" />
            Inspector
          </button>
        )}
      </div>

      <InspectorPanel
        title={`${config.title} Inspector`}
        subtitle={`${config.eyebrow} · Cloud Vault record`}
        open={editor.inspectorOpen}
        onToggle={editor.toggleInspector}
        footer={
          <div className="flex flex-col gap-2 p-4">
            <Button variant="primary" icon={<Save className="h-4 w-4" />} onClick={() => void save()}>
              Save to History
            </Button>
            <div className="flex items-center gap-2 font-mono text-[10.5px] text-dimm">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
              {status}
            </div>
          </div>
        }
      >
        <div className="border-b border-line bg-surface-raised px-4 py-3">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-info">{config.title} v1.0</p>
          <p className="mt-1 text-xs text-muted">{config.description}</p>
        </div>
        {config.fields.map((field) => (
          <div key={field.key} className="border-b border-line px-4 py-4">
            <FieldLabel hint={field.hint}>{field.label}</FieldLabel>
            {field.type === 'textarea' ? (
              <Textarea
                rows={field.rows ?? 3}
                value={present[field.key] ?? ''}
                placeholder={field.placeholder}
                onChange={(e) => set(field.key, e.target.value)}
              />
            ) : field.type === 'select' ? (
              <Select
                options={field.options ?? []}
                value={present[field.key] ?? ''}
                onChange={(e) => set(field.key, e.target.value)}
              />
            ) : (
              <Input
                value={present[field.key] ?? ''}
                placeholder={field.placeholder}
                onChange={(e) => set(field.key, e.target.value)}
              />
            )}
          </div>
        ))}
      </InspectorPanel>

    </div>
  );
}
