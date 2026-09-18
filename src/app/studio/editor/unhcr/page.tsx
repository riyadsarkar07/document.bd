'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { jsPDF } from 'jspdf';
import { Download, PanelRightOpen, ShieldAlert, Type } from 'lucide-react';
import { useDocumentEditor } from '@/lib/editor/use-document-editor';
import {
  UNHCR_BACKGROUND,
  UNHCR_CASE_LABEL,
  UNHCR_DEFAULT_LAYOUTS,
  UNHCR_DEFAULTS,
  UNHCR_DOC_HEIGHT,
  UNHCR_DOC_WIDTH,
  UNHCR_FIELDS,
  UNHCR_FONT_OPTIONS,
  UNHCR_LAYOUT_RANGES,
  normalizeUnhcrSnapshot,
} from '@/lib/constants/unhcr';
import type { UnhcrFieldKey, UnhcrLayout, UnhcrSnapshot } from '@/lib/editor/types';
import { renderUnhcrCard } from '@/lib/renderers/unhcrRenderer';
import { loadImage } from '@/lib/images';
import { loadDocumentFonts } from '@/lib/fonts';
import { listTemplates, listProjects, saveProject, logActivity } from '@/lib/workspace/store';
import { commitDocument, getVaultRecord } from '@/lib/workspace/vault';
import { newRecordId } from '@/lib/workspace/document-kinds';
import { checkLimit } from '@/lib/workspace/limits';
import { useAuth } from '@/lib/auth/auth-context';
import { useToast } from '@/lib/toast/toast-provider';
import { EditorToolbar } from '@/components/editor/editor-toolbar';
import { EditorViewport } from '@/components/editor/editor-viewport';
import { InspectorPanel } from '@/components/editor/inspector-panel';
import { CollapsibleSection } from '@/components/editor/collapsible-section';
import { PropertyInput } from '@/components/editor/property-input';
import { PropertySlider } from '@/components/editor/property-slider';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { clamp, cn } from '@/lib/utils';

function MoveButton({ label, title, onClick }: { label: string; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-line-strong bg-surface text-accent-bright shadow-sm transition hover:border-accent hover:bg-surface-raised active:scale-95"
    >
      {label}
    </button>
  );
}

export default function UnhcrEditorPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-sm text-dimm">Loading editor…</div>}>
      <UnhcrEditorInner />
    </Suspense>
  );
}

function UnhcrEditorInner() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [bgImg, setBgImg] = useState<HTMLImageElement | null>(null);
  const [activeField, setActiveField] = useState<UnhcrFieldKey>('unhcrNo');
  const [moveStep, setMoveStep] = useState(1);
  const [historyRecordId, setHistoryRecordId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const externalCacheRef = useRef<UnhcrSnapshot | null>(null);

  const editor = useDocumentEditor<UnhcrSnapshot>({
    kind: 'unhcr',
    defaults: UNHCR_DEFAULTS,
    autosaveKey: `studio.autosave.unhcr.${user?.id ?? 'anon'}`,
    loadExternal: () => externalCacheRef.current,
    normalize: (s) => normalizeUnhcrSnapshot(s as Partial<UnhcrSnapshot>),
  });

  const { present, zoom, setField, setStatus, setBusy, setRendered, setDims, dims } = editor;

  const presentRef = useRef(present);
  presentRef.current = present;
  const bgImgRef = useRef(bgImg);
  bgImgRef.current = bgImg;
  const activeFieldRef = useRef(activeField);
  activeFieldRef.current = activeField;
  const dragRef = useRef<{
    field: UnhcrFieldKey;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  useEffect(() => {
    const projectId = searchParams.get('project');
    const templateName = searchParams.get('template');
    const recordNo = searchParams.get('record');
    (async () => {
      if (recordNo) {
        const res = await getVaultRecord(recordNo);
        if (res.error || !res.record) {
          toast.error(res.error ?? 'Could not load History record');
          return;
        }
        const next = normalizeUnhcrSnapshot((res.record.doc as Partial<UnhcrSnapshot>) ?? {});
        externalCacheRef.current = next;
        editor.replace(next);
        setHistoryRecordId(res.record.trademarkNo);
        setStatus(`History record ${recordNo} loaded`);
        toast.success(`History record ${recordNo} loaded`);
        return;
      }
      if (projectId) {
        const res = await listProjects();
        const found = res.data.find((p) => String(p.id) === projectId || p.name === projectId);
        if (found) {
          const next = normalizeUnhcrSnapshot(found.state as Partial<UnhcrSnapshot>);
          externalCacheRef.current = next;
          editor.replace(next);
          setStatus(`Project "${found.name}" loaded`);
          toast.success(`Project "${found.name}" loaded`);
        }
      } else if (templateName) {
        const res = await listTemplates();
        const found = res.data.find((t) => String(t.id) === templateName || t.name === templateName);
        if (found) {
          const next = normalizeUnhcrSnapshot(found.state as Partial<UnhcrSnapshot>);
          externalCacheRef.current = next;
          editor.replace(next);
          setStatus(`Template "${found.name}" applied`);
          toast.success(`Template "${found.name}" applied`);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    loadDocumentFonts().then((ok) => {
      setFontsLoaded(ok);
      if (ok) setStatus('Renderer fonts loaded');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;
    void loadImage(UNHCR_BACKGROUND).then((img) => {
      if (alive && img) setBgImg(img);
    });
    return () => {
      alive = false;
    };
  }, []);

  const rafRef = useRef(0);
  const liveScaleRef = useRef(1);

  const draw = useCallback(
    async (canvas: HTMLCanvasElement, scale: number) => {
      renderUnhcrCard(canvas, presentRef.current, bgImgRef.current, scale, activeFieldRef.current);
      setDims((prev) =>
        prev && prev.w === UNHCR_DOC_WIDTH && prev.h === UNHCR_DOC_HEIGHT
          ? prev
          : { w: UNHCR_DOC_WIDTH, h: UNHCR_DOC_HEIGHT },
      );
      setRendered(true);
    },
    [setDims, setRendered],
  );

  useEffect(() => {
    liveScaleRef.current = Math.min(1, Math.max(zoom, 0.35));
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (canvas) void draw(canvas, liveScaleRef.current);
    });
    return () => cancelAnimationFrame(rafRef.current);
  }, [present, fontsLoaded, bgImg, zoom, draw, activeField]);

  const forceRender = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy(true);
    setStatus('Rendering ID card…');
    await draw(canvas, 1);
    setBusy(false);
    setStatus(`Card rendered — ${UNHCR_DOC_WIDTH}×${UNHCR_DOC_HEIGHT}px`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw, setBusy, setStatus]);

  const reset = useCallback(() => {
    editor.reset();
    setStatus('Defaults applied');
    toast.info('ID editor reset — identity fields cleared');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeLayout = present.layouts[activeField] ?? UNHCR_DEFAULT_LAYOUTS[activeField];

  const setLayout = useCallback(
    <K extends keyof UnhcrLayout>(key: K, value: UnhcrLayout[K]) => {
      const field = activeFieldRef.current;
      const base = presentRef.current.layouts[field] ?? UNHCR_DEFAULT_LAYOUTS[field];
      setField('layouts', {
        ...presentRef.current.layouts,
        [field]: { ...base, [key]: value },
      });
    },
    [setField],
  );

  const moveField = useCallback(
    (dx: number, dy: number) => {
      const field = activeFieldRef.current;
      const base = presentRef.current.layouts[field] ?? UNHCR_DEFAULT_LAYOUTS[field];
      setField('layouts', {
        ...presentRef.current.layouts,
        [field]: {
          ...base,
          x: clamp(base.x + dx * moveStep, 0, UNHCR_DOC_WIDTH),
          y: clamp(base.y + dy * moveStep, 0, UNHCR_DOC_HEIGHT),
        },
      });
    },
    [setField, moveStep],
  );

  const bumpFont = useCallback(
    (delta: number) => {
      const field = activeFieldRef.current;
      const base = presentRef.current.layouts[field] ?? UNHCR_DEFAULT_LAYOUTS[field];
      setLayout(
        'fontSize',
        clamp(base.fontSize + delta, UNHCR_LAYOUT_RANGES.fontSize.min, UNHCR_LAYOUT_RANGES.fontSize.max),
      );
    },
    [setLayout],
  );

  const persistToHistory = useCallback(async (): Promise<string | null> => {
    if (!user) {
      toast.error('Sign in to save to History');
      return null;
    }
    const documentLimit = await checkLimit('document');
    if (!documentLimit.ok) {
      toast.error(documentLimit.message ?? 'Document generation limit reached.');
      return null;
    }
    const snap = normalizeUnhcrSnapshot(presentRef.current);
    const recordId = historyRecordId ?? (snap.unhcrNo.trim() ? `UNHCR-${snap.unhcrNo.trim()}` : newRecordId('unhcr'));
    const res = await commitDocument({
      docKind: 'unhcr',
      recordId,
      title: snap.unhcrNo.trim() ? `UNHCR ${snap.unhcrNo.trim()}` : 'UNHCR ID',
      subtitle: snap.name.trim() || undefined,
      payload: snap,
      createdBy: user.id,
    });
    if (res.error) {
      toast.error(`History save failed: ${res.error}`);
      return null;
    }
    setHistoryRecordId(res.recordId);
    setStatus(`Saved to History · ${res.recordId}`);
    void logActivity({
      user_id: user.id,
      email: user.email,
      action: 'history.save.unhcr',
      detail: `UNHCR ${snap.unhcrNo || res.recordId}`,
    });
    return res.recordId;
  }, [historyRecordId, user, toast, setStatus]);

  const saveToHistory = useCallback(async () => {
    const savedId = await persistToHistory();
    if (savedId) toast.success(`Saved to History · ${savedId}`);
  }, [persistToHistory, toast]);

  const exportJpg = useCallback(async () => {
    const limit = await checkLimit('export');
    if (!limit.ok) {
      toast.error(limit.message ?? 'Export limit reached.');
      return;
    }
    const generationLimit = await checkLimit('generation');
    if (!generationLimit.ok) {
      toast.error(generationLimit.message ?? 'Generation limit reached.');
      return;
    }
    const canvas = document.createElement('canvas');
    renderUnhcrCard(canvas, presentRef.current, bgImgRef.current, 1);
    const link = document.createElement('a');
    const id = presentRef.current.unhcrNo || 'case';
    link.download = `UNHCR-${id}.jpg`;
    link.href = canvas.toDataURL('image/jpeg', 0.96);
    link.click();
    void logActivity({
      user_id: user?.id,
      email: user?.email,
      action: 'export.unhcr.jpg',
      detail: `${UNHCR_CASE_LABEL} · UNHCR ${id}`,
    });
    const savedId = await persistToHistory();
    toast.success(savedId ? 'JPG downloaded · layout saved in History' : 'JPG downloaded');
  }, [user, toast, persistToHistory]);

  const exportPdf = useCallback(async () => {
    const limit = await checkLimit('export');
    if (!limit.ok) {
      toast.error(limit.message ?? 'Export limit reached.');
      return;
    }
    const generationLimit = await checkLimit('generation');
    if (!generationLimit.ok) {
      toast.error(generationLimit.message ?? 'Generation limit reached.');
      return;
    }
    const canvas = document.createElement('canvas');
    renderUnhcrCard(canvas, presentRef.current, bgImgRef.current, 1);
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [UNHCR_DOC_WIDTH, UNHCR_DOC_HEIGHT] });
    const pW = pdf.internal.pageSize.getWidth();
    const pH = pdf.internal.pageSize.getHeight();
    pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, pW, pH);
    const id = presentRef.current.unhcrNo || 'case';
    pdf.save(`UNHCR-${id}.pdf`);
    void logActivity({
      user_id: user?.id,
      email: user?.email,
      action: 'export.unhcr.pdf',
      detail: `${UNHCR_CASE_LABEL} · UNHCR ${id}`,
    });
    const savedId = await persistToHistory();
    toast.success(savedId ? 'PDF downloaded · layout saved in History' : 'PDF downloaded');
  }, [user, toast, persistToHistory]);

  const preview = useCallback(async () => {
    const canvas = document.createElement('canvas');
    renderUnhcrCard(canvas, presentRef.current, bgImgRef.current, 1);
    setPreviewDataUrl(canvas.toDataURL('image/jpeg', 0.96));
    setPreviewOpen(true);
  }, []);

  const saveAsProject = useCallback(async () => {
    if (!user) {
      toast.error('Sign in to save projects');
      return;
    }
    const projectLimit = await checkLimit('project');
    if (!projectLimit.ok) {
      toast.error(projectLimit.message ?? 'Project limit reached.');
      return;
    }
    const documentLimit = await checkLimit('document');
    if (!documentLimit.ok) {
      toast.error(documentLimit.message ?? 'Document generation limit reached.');
      return;
    }
    const res = await saveProject({
      name: present.unhcrNo.trim() ? `UNHCR ${present.unhcrNo.trim()}` : 'UNHCR ID',
      kind: 'unhcr',
      state: { ...normalizeUnhcrSnapshot(present), docKind: 'unhcr' } as unknown as Record<string, unknown>,
      owner_id: user.id,
    });
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Project saved — font and position restored on reopen');
    void logActivity({
      user_id: user?.id,
      email: user?.email,
      action: 'project.save',
      detail: `UNHCR ${present.unhcrNo || 'ID'}`,
    });
    await persistToHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present, user, toast, persistToHistory]);

  const canvasToDoc = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * UNHCR_DOC_WIDTH,
      y: ((clientY - rect.top) / rect.height) * UNHCR_DOC_HEIGHT,
    };
  }, []);

  const hitField = useCallback((x: number, y: number): UnhcrFieldKey | null => {
    const snap = presentRef.current;
    let best: { key: UnhcrFieldKey; dist: number } | null = null;
    for (const field of UNHCR_FIELDS) {
      const layout = snap.layouts[field.key] ?? UNHCR_DEFAULT_LAYOUTS[field.key];
      const text = snap[field.key] || field.label;
      const w = Math.max(80, text.length * layout.fontSize * 0.55);
      const h = layout.fontSize * 1.4;
      const left = layout.x - 8;
      const top = layout.y - layout.fontSize;
      const right = left + w + 16;
      const bottom = top + h + 8;
      if (x >= left && x <= right && y >= top && y <= bottom) {
        const cx = (left + right) / 2;
        const cy = (top + bottom) / 2;
        const dist = (x - cx) ** 2 + (y - cy) ** 2;
        if (!best || dist < best.dist) best = { key: field.key, dist };
      }
    }
    return best?.key ?? null;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.style.touchAction = 'none';

    const down = (e: PointerEvent) => {
      const pos = canvasToDoc(e.clientX, e.clientY);
      if (!pos) return;
      const hit = hitField(pos.x, pos.y);
      const field = hit ?? activeFieldRef.current;
      if (hit) setActiveField(hit);
      const base = presentRef.current.layouts[field] ?? UNHCR_DEFAULT_LAYOUTS[field];
      dragRef.current = {
        field,
        startX: pos.x,
        startY: pos.y,
        origX: base.x,
        origY: base.y,
      };
      setDragging(true);
      canvas.setPointerCapture(e.pointerId);
    };

    const move = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const pos = canvasToDoc(e.clientX, e.clientY);
      if (!pos) return;
      const dx = pos.x - drag.startX;
      const dy = pos.y - drag.startY;
      const base = presentRef.current.layouts[drag.field] ?? UNHCR_DEFAULT_LAYOUTS[drag.field];
      setField('layouts', {
        ...presentRef.current.layouts,
        [drag.field]: {
          ...base,
          x: clamp(Math.round(drag.origX + dx), 0, UNHCR_DOC_WIDTH),
          y: clamp(Math.round(drag.origY + dy), 0, UNHCR_DOC_HEIGHT),
        },
      });
    };

    const up = (e: PointerEvent) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setDragging(false);
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    return () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
    };
  }, [editor.rendered, canvasToDoc, hitField, setField]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.style.cursor = dragging ? 'grabbing' : 'grab';
  }, [dragging, editor.rendered]);

  const activeMeta = useMemo(() => UNHCR_FIELDS.find((f) => f.key === activeField), [activeField]);
  const fieldOptions = UNHCR_FIELDS.map((f) => ({ value: f.key, label: f.label }));

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <EditorToolbar
          canUndo={editor.canUndo}
          canRedo={editor.canRedo}
          busy={editor.busy}
          onUndo={editor.undo}
          onRedo={editor.redo}
          onReset={reset}
          onRender={forceRender}
          onExportJpg={exportJpg}
          onExportPdf={exportPdf}
          onPreview={preview}
          onSaveProject={saveAsProject}
          onSaveHistory={saveToHistory}
          status={`${editor.status}${fontsLoaded ? '' : ' · fonts loading'}`}
          lastSavedAt={editor.lastSavedAt}
        />

        <div
          className="z-10 shrink-0 border-b-2 border-danger/50 bg-danger px-4 py-3 text-white shadow-pop"
          role="status"
          aria-label={`Case label ${UNHCR_CASE_LABEL}`}
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-md bg-white px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-danger">
              <ShieldAlert className="h-3.5 w-3.5" />
              Case
            </span>
            <span className="font-display text-lg font-black tracking-tight sm:text-xl">
              {UNHCR_CASE_LABEL}
            </span>
            <span className="hidden h-5 w-px bg-white/40 sm:block" />
            <span className="text-[11px] font-medium leading-snug text-white/90 sm:text-xs">
              Workflow label only — not part of the identity document
            </span>
          </div>
        </div>

        <EditorViewport
          canvasRef={canvasRef}
          containerRef={editor.containerRef}
          dims={dims}
          rendered={editor.rendered}
          zoom={editor.zoom}
          onZoomIn={editor.zoomIn}
          onZoomOut={editor.zoomOut}
          onFit={editor.fit}
          onActual={editor.zoomActual}
          onZoomPreset={editor.zoomPreset}
          placeholderTitle="Fill identity fields — overlay renders live on the ID template"
          placeholderSub="2560 × 1800 px · Arial / Arial Bold · drag fields on the card"
          fullscreen={editor.fullscreen}
          onToggleFullscreen={editor.toggleFullscreen}
          kindLabel="UNHCR ID"
        />
        {!editor.inspectorOpen && (
          <button
            onClick={editor.toggleInspector}
            className="absolute right-5 top-28 z-30 flex items-center gap-2 rounded-full border border-line-strong bg-surface/90 px-4 py-2.5 text-xs font-semibold text-muted shadow-pop backdrop-blur-xl transition hover:text-accent-bright"
          >
            <PanelRightOpen className="h-4 w-4" />
            Inspector
          </button>
        )}
      </div>

      <InspectorPanel
        title="ID Card Inspector"
        subtitle="Arial overlay · absolute X/Y"
        open={editor.inspectorOpen}
        onToggle={editor.toggleInspector}
        sheetBodyClassName="max-h-[58vh] min-h-[38vh]"
        footer={
          <div className="flex flex-col gap-2 p-4">
            <div className="flex items-start gap-2 rounded-xl border border-danger/25 bg-danger/5 px-3 py-2.5">
              <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-danger" />
              <p className="text-[10.5px] font-medium leading-relaxed text-danger">
                {UNHCR_CASE_LABEL} is a case/workflow label shown above the editor. It is not printed on the identity document. Do not invent official identity data.
              </p>
            </div>
            <div className="flex items-center gap-2 font-mono text-[10.5px] text-dimm">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
              {editor.status}
            </div>
          </div>
        }
      >
        <div className="border-b border-line bg-surface-raised px-4 py-3">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-danger">{UNHCR_CASE_LABEL}</p>
          <p className="mt-1 text-xs text-muted">
            Edit field text, switch Arial / Arial Bold, resize, and drag. Position and font settings autosave and restore on reopen.
          </p>
        </div>

        <CollapsibleSection title="Identity Fields" icon={<Type className="h-3.5 w-3.5" />}>
          {UNHCR_FIELDS.map((f) => (
            <PropertyInput
              key={f.key}
              label={f.label}
              value={present[f.key]}
              onChange={(v) => {
                setActiveField(f.key);
                setField(f.key, v);
              }}
            />
          ))}
        </CollapsibleSection>

        <CollapsibleSection
          title="Field Layout"
          accent="blue"
          icon={<Type className="h-3.5 w-3.5" />}
          badge={
            <span className="rounded-full border border-info/30 bg-info/10 px-2 py-0.5 font-mono text-[9.5px] normal-case tracking-normal text-info">
              {activeMeta?.label ?? activeField}
            </span>
          }
        >
          <div className="flex flex-col gap-3">
            <Select
              aria-label="Select field"
              value={activeField}
              onChange={(e) => setActiveField(e.target.value as UnhcrFieldKey)}
              options={fieldOptions}
            />

            <PropertyInput
              label="Text"
              value={present[activeField]}
              onChange={(v) => setField(activeField, v)}
            />

            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-muted">Font</span>
              <div className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface-raised p-1">
                {UNHCR_FONT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setLayout('fontFamily', opt.value)}
                    className={cn(
                      'rounded-lg px-1 py-1.5 text-[10.5px] font-semibold transition',
                      activeLayout.fontFamily === opt.value
                        ? 'bg-info/15 text-info shadow-sm'
                        : 'text-muted hover:text-primary',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-info/20 bg-info/5 p-3">
              <span className="text-[10px] font-bold uppercase tracking-wide text-info">Position &amp; Size</span>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => bumpFont(-1)} aria-label="Decrease font size">
                  A-
                </Button>
                <Button variant="outline" size="sm" onClick={() => bumpFont(1)} aria-label="Increase font size">
                  A+
                </Button>
                <span className="ml-auto font-mono text-[11px] text-dimm">{activeLayout.fontSize}px</span>
              </div>

              <PropertySlider
                label="Font Size"
                value={activeLayout.fontSize}
                min={UNHCR_LAYOUT_RANGES.fontSize.min}
                max={UNHCR_LAYOUT_RANGES.fontSize.max}
                step={UNHCR_LAYOUT_RANGES.fontSize.step}
                mono
                onChange={(v) => setLayout('fontSize', v)}
              />
              <PropertySlider
                label="X"
                value={activeLayout.x}
                min={UNHCR_LAYOUT_RANGES.x.min}
                max={UNHCR_LAYOUT_RANGES.x.max}
                step={UNHCR_LAYOUT_RANGES.x.step}
                mono
                onChange={(v) => setLayout('x', v)}
              />
              <PropertySlider
                label="Y"
                value={activeLayout.y}
                min={UNHCR_LAYOUT_RANGES.y.min}
                max={UNHCR_LAYOUT_RANGES.y.max}
                step={UNHCR_LAYOUT_RANGES.y.step}
                mono
                onChange={(v) => setLayout('y', v)}
              />

              <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-raised p-2">
                <div className="flex flex-col gap-1">
                  {[1, 5, 10].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setMoveStep(s)}
                      className={cn(
                        'rounded-lg border px-2 py-0.5 font-mono text-[10px] font-semibold transition',
                        moveStep === s
                          ? 'border-info bg-info/15 text-info'
                          : 'border-line bg-surface text-muted hover:text-primary',
                      )}
                    >
                      {s}px
                    </button>
                  ))}
                </div>
                <div className="grid flex-1 grid-cols-3 gap-1.5">
                  <span />
                  <MoveButton label="↑" title="Move up" onClick={() => moveField(0, -1)} />
                  <span />
                  <MoveButton label="←" title="Move left" onClick={() => moveField(-1, 0)} />
                  <span className="flex items-center justify-center text-[9px] font-mono text-dimm">{moveStep}px</span>
                  <MoveButton label="→" title="Move right" onClick={() => moveField(1, 0)} />
                  <span />
                  <MoveButton label="↓" title="Move down" onClick={() => moveField(0, 1)} />
                  <span />
                </div>
              </div>
              <p className="text-[10px] leading-relaxed text-muted">
                Drag the selected field on the card, or use the pad / X-Y sliders for precise placement.
              </p>
            </div>
          </div>
        </CollapsibleSection>
      </InspectorPanel>

      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="ID Preview"
        meta={`${UNHCR_CASE_LABEL} · ${UNHCR_DOC_WIDTH}×${UNHCR_DOC_HEIGHT}px`}
        maxWidth="max-w-3xl"
        footer={
          <div className="flex w-full items-center justify-between">
            <span className="font-mono text-[11px] text-dimm">JPEG export · full resolution</span>
            <Button variant="success" onClick={exportJpg}>
              <Download className="h-4 w-4" /> Download JPG
            </Button>
          </div>
        }
      >
        {previewDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewDataUrl} alt="ID card preview" className="mx-auto max-h-[70vh] w-auto rounded-md shadow-deep" />
        ) : (
          <div className="py-20 text-center text-sm text-dimm">Rendering…</div>
        )}
      </Modal>
    </div>
  );
}
