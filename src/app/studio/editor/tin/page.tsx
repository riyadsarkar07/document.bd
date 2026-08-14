'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { jsPDF } from 'jspdf';
import {
  Download,
  Eye,
  PanelRightOpen,
  QrCode,
  ScrollText,
  Type,
  UserRound,
} from 'lucide-react';
import { useDocumentEditor } from '@/lib/editor/use-document-editor';
import {
  TIN_ALIGNMENTS,
  TIN_DEFAULTS,
  TIN_DEFAULT_LAYOUTS,
  TIN_DOC_HEIGHT,
  TIN_DOC_WIDTH,
  TIN_FIELDS,
  TIN_LAYOUT_RANGES,
  TIN_QR_SLIDERS,
  TIN_TEMPLATE_SRC,
  normalizeTinSnapshot,
} from '@/lib/constants/tin';
import type { TINSnapshot, TinAlign, TinFieldKey, TinWeight } from '@/lib/editor/types';
import { renderTINDocument } from '@/lib/renderers/tinRenderer';
import { loadDataUrlImage, loadImage } from '@/lib/images';
import { loadDocumentFonts } from '@/lib/fonts';
import { encodeDemoQr, buildTinQrPayload } from '@/lib/tinQr';
import { listTemplates, listProjects, saveProject, logActivity } from '@/lib/workspace/store';
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
import { cn } from '@/lib/utils';

export default function TINEditorPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-sm text-dimm">Loading editor…</div>}>
      <TINEditorInner />
    </Suspense>
  );
}

function TINEditorInner() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [viewRecordOpen, setViewRecordOpen] = useState(false);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrImg, setQrImg] = useState<HTMLImageElement | null>(null);
  const [bgImg, setBgImg] = useState<HTMLImageElement | null>(null);
  const [activeField, setActiveField] = useState<TinFieldKey>('taxpayerName');

  const externalCacheRef = useRef<TINSnapshot | null>(null);

  const editor = useDocumentEditor<TINSnapshot>({
    kind: 'tin',
    defaults: TIN_DEFAULTS,
    autosaveKey: 'studio.autosave.tin',
    loadExternal: () => externalCacheRef.current,
    normalize: (s) => normalizeTinSnapshot(s as Partial<TINSnapshot>),
  });

  const { present, zoom, setField, setStatus, setBusy, setRendered, setDims, dims } = editor;

  // Latest-state refs so render/export callbacks stay stable and always draw
  // the freshest snapshot without re-creating callbacks on every keystroke.
  const presentRef = useRef(present);
  presentRef.current = present;
  const qrImgRef = useRef(qrImg);
  qrImgRef.current = qrImg;
  const bgImgRef = useRef(bgImg);
  bgImgRef.current = bgImg;
  const fontsLoadedRef = useRef(fontsLoaded);
  fontsLoadedRef.current = fontsLoaded;

  // Load external project/template state
  useEffect(() => {
    const projectId = searchParams.get('project');
    const templateName = searchParams.get('template');
    (async () => {
      if (projectId) {
        const res = await listProjects();
        const found = res.data.find((p) => String(p.id) === projectId || p.name === projectId);
        if (found) {
          const next = normalizeTinSnapshot(found.state as Partial<TINSnapshot>);
          externalCacheRef.current = next;
          editor.replace(next);
          setStatus(`Project "${found.name}" loaded`);
          toast.success(`Project "${found.name}" loaded`);
        }
      } else if (templateName) {
        const res = await listTemplates();
        const found = res.data.find((t) => String(t.id) === templateName || t.name === templateName);
        if (found) {
          const next = normalizeTinSnapshot(found.state as Partial<TINSnapshot>);
          externalCacheRef.current = next;
          editor.replace(next);
          setStatus(`Template "${found.name}" applied`);
          toast.success(`Template "${found.name}" applied`);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Load renderer fonts once
  useEffect(() => {
    loadDocumentFonts().then((ok) => {
      setFontsLoaded(ok);
      if (ok) setStatus('Renderer fonts loaded');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the uploaded reference certificate as the editor template background.
  useEffect(() => {
    let alive = true;
    void loadImage(TIN_TEMPLATE_SRC).then((img) => {
      if (alive && img) setBgImg(img);
    });
    return () => {
      alive = false;
    };
  }, []);

  // DEMO QR regeneration — coalesced with rAF and keyed on the encoded payload
  // so it only runs when the record actually changed (no debounce, no churn).
  const lastQrPayloadRef = useRef<string | null>(null);
  const qrRafRef = useRef(0);
  useEffect(() => {
    const payload = buildTinQrPayload(presentRef.current);
    if (payload === lastQrPayloadRef.current) return;
    lastQrPayloadRef.current = payload;
    cancelAnimationFrame(qrRafRef.current);
    qrRafRef.current = requestAnimationFrame(() => {
      void encodeDemoQr(presentRef.current, 512).then((dataUrl) => {
        setQrDataUrl((prev) => (prev === dataUrl ? prev : dataUrl));
      });
    });
    return () => cancelAnimationFrame(qrRafRef.current);
  }, [present]);

  // Hydrate the renderer's QR image whenever a fresh data URL lands.
  useEffect(() => {
    if (!qrDataUrl) return;
    let alive = true;
    void loadDataUrlImage(qrDataUrl).then((img) => {
      if (alive) setQrImg(img);
    });
    return () => {
      alive = false;
    };
  }, [qrDataUrl]);

  const rafRef = useRef(0);
  const liveScaleRef = useRef(1);

  // Draw the latest snapshot onto the canvas at a given scale.
  const draw = useCallback(
    async (canvas: HTMLCanvasElement, scale: number) => {
      renderTINDocument(canvas, presentRef.current, qrImgRef.current, scale, bgImgRef.current);
      setDims((prev) =>
        prev && prev.w === TIN_DOC_WIDTH && prev.h === TIN_DOC_HEIGHT ? prev : { w: TIN_DOC_WIDTH, h: TIN_DOC_HEIGHT },
      );
      setRendered(true);
    },
    [setDims, setRendered],
  );

  // Live preview: rAF-coalesced at preview scale so keystrokes/sliders update
  // instantly without full-resolution redraws.
  useEffect(() => {
    if (!fontsLoadedRef.current) return;
    liveScaleRef.current = Math.min(1, Math.max(zoom, 0.35));
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (canvas) void draw(canvas, liveScaleRef.current);
    });
    return () => cancelAnimationFrame(rafRef.current);
  }, [present, fontsLoaded, qrImg, bgImg, zoom, draw]);

  // Force refresh at full resolution (explicit "Render" action).
  const forceRender = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy(true);
    setStatus('Rendering TIN document…');
    await draw(canvas, 1);
    setBusy(false);
    setStatus(`Document rendered — ${TIN_DOC_WIDTH}×${TIN_DOC_HEIGHT}px @ 300 DPI`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw, setBusy, setStatus]);

  const reset = useCallback(() => {
    editor.reset();
    setQrDataUrl(null);
    setQrImg(null);
    setStatus('Defaults applied');
    toast.info('TIN editor reset to defaults');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Layout helpers bound to the selected field.
  const activeLayout = present.layouts[activeField] ?? TIN_DEFAULT_LAYOUTS[activeField];
  const setLayout = useCallback(
    <K extends keyof typeof activeLayout>(key: K, value: (typeof activeLayout)[K]) => {
      const base = presentRef.current.layouts[activeField] ?? TIN_DEFAULT_LAYOUTS[activeField];
      setField('layouts', {
        ...presentRef.current.layouts,
        [activeField]: { ...base, [key]: value },
      });
    },
    // activeField is stable enough via ref pattern; setField is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeField, setField],
  );

  const setAlign = useCallback(
    (align: TinAlign) => setLayout('align', align),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setLayout],
  );
  const setWeight = useCallback(
    (fontWeight: TinWeight) => setLayout('fontWeight', fontWeight),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setLayout],
  );

  const exportJpg = useCallback(async () => {
    const canvas = document.createElement('canvas');
    renderTINDocument(canvas, presentRef.current, qrImgRef.current, 1, bgImgRef.current);
    const link = document.createElement('a');
    const tin = presentRef.current.tinNo || 'record';
    link.download = `TIN-${tin}-DEMO.jpg`;
    link.href = canvas.toDataURL('image/jpeg', 0.96);
    link.click();
    void logActivity({ user_id: user?.id, email: user?.email, action: 'export.tin.jpg', detail: `TIN ${tin} (DEMO)` });
    toast.success('JPG downloaded (DEMO record)');
  }, [user, toast]);

  const exportPdf = useCallback(async () => {
    const canvas = document.createElement('canvas');
    renderTINDocument(canvas, presentRef.current, qrImgRef.current, 1, bgImgRef.current);
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: 'a4' });
    const pW = pdf.internal.pageSize.getWidth();
    const pH = pdf.internal.pageSize.getHeight();
    const cr = canvas.width / canvas.height;
    const pr = pW / pH;
    let rW = pW;
    let rH = pH;
    let xO = 0;
    let yO = 0;
    if (cr > pr) {
      rH = pW / cr;
      yO = (pH - rH) / 2;
    } else {
      rW = pH * cr;
      xO = (pW - rW) / 2;
    }
    pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', xO, yO, rW, rH);
    const tin = presentRef.current.tinNo || 'record';
    pdf.save(`TIN-${tin}-DEMO.pdf`);
    void logActivity({ user_id: user?.id, email: user?.email, action: 'export.tin.pdf', detail: `TIN ${tin} (DEMO)` });
    toast.success('A4 PDF downloaded (DEMO record)');
  }, [user, toast]);

  const preview = useCallback(async () => {
    const canvas = document.createElement('canvas');
    renderTINDocument(canvas, presentRef.current, qrImgRef.current, 1, bgImgRef.current);
    setPreviewDataUrl(canvas.toDataURL('image/jpeg', 0.96));
    setPreviewOpen(true);
  }, []);

  const saveAsProject = useCallback(async () => {
    if (!user) {
      toast.error('Sign in to save projects');
      return;
    }
    await saveProject({
      name: `TIN ${present.tinNo || 'Record'} (DEMO)`,
      kind: 'tin',
      state: { ...present } as unknown as Record<string, unknown>,
      owner_id: user.id,
    });
    toast.success('Project saved');
    void logActivity({ user_id: user?.id, email: user?.email, action: 'project.save', detail: `TIN ${present.tinNo}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present, user, toast]);

  const activeMeta = TIN_FIELDS.find((f) => f.key === activeField);

  const qrPayload = useMemo(() => buildTinQrPayload(present), [present]);

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
          status={`${editor.status}${fontsLoaded ? '' : ' · fonts loading'}`}
        />
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
          placeholderTitle="Fill in the record — the TIN certificate renders live over the uploaded template"
          placeholderSub="A4 portrait · 2480 × 3508 px · 300 DPI · uploaded template"
          fullscreen={editor.fullscreen}
          onToggleFullscreen={editor.toggleFullscreen}
          kindLabel="TIN Document"
        />
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
        title="TIN Information Inspector"
        subtitle="A4 · 2480×3508 · uploaded template"
        open={editor.inspectorOpen}
        onToggle={editor.toggleInspector}
        footer={
          <div className="flex flex-col gap-2 p-4">
            <div className="flex items-start gap-2 rounded-xl border border-danger/25 bg-danger/5 px-3 py-2.5">
              <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-danger" />
              <p className="text-[10.5px] font-medium leading-relaxed text-danger">
                DEMO RECORD — NOT OFFICIAL NBR VERIFICATION. This editor produces
                demonstration documents only.
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
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-danger">
            DEMO · TIN Certificate Editor
          </p>
          <p className="mt-1 text-xs text-muted">
            The uploaded reference is the template. Every editable value maps to a
            live inspector input — fill, clear and edit any field; the preview
            updates instantly and the QR regenerates from the record.
          </p>
        </div>

        <CollapsibleSection title="Record Data" icon={<ScrollText className="h-3.5 w-3.5" />}>
          {TIN_FIELDS.map((f) => (
            <PropertyInput
              key={f.key}
              label={f.label}
              value={present[f.key]}
              textarea={f.textarea}
              onChange={(v) => setField(f.key as keyof TINSnapshot, v as never)}
            />
          ))}
        </CollapsibleSection>

        <CollapsibleSection
          title="Field Layout"
          accent="blue"
          icon={<Type className="h-3.5 w-3.5" />}
          badge={
            <span className="rounded-full border border-info/30 bg-info/10 px-2 py-0.5 font-mono text-[9.5px] normal-case tracking-normal text-info">
              {activeMeta?.label}
            </span>
          }
        >
          <Select
            aria-label="Select field"
            value={activeField}
            onChange={(e) => setActiveField(e.target.value as TinFieldKey)}
            options={TIN_FIELDS.map((f) => ({ value: f.key, label: f.label }))}
          />
          <PropertyInput
            label="Text"
            value={present[activeField]}
            textarea={activeMeta?.textarea}
            onChange={(v) => setField(activeField as keyof TINSnapshot, v as never)}
          />

          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(TIN_LAYOUT_RANGES) as Array<keyof typeof TIN_LAYOUT_RANGES>).map((rangeKey) => {
              const spec = TIN_LAYOUT_RANGES[rangeKey];
              return (
                <PropertySlider
                  key={rangeKey}
                  label={spec.label}
                  value={activeLayout[rangeKey] as number}
                  min={spec.min}
                  max={spec.max}
                  step={spec.step}
                  mono={spec.mono}
                  onChange={(v) => setLayout(rangeKey as never, v as never)}
                />
              );
            })}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-muted">Alignment</span>
            <div className="grid grid-cols-4 gap-1 rounded-xl border border-line bg-surface-raised p-1">
              {TIN_ALIGNMENTS.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => setAlign(a.value)}
                  className={cn(
                    'rounded-lg px-1 py-1.5 text-[10.5px] font-semibold transition',
                    activeLayout.align === a.value
                      ? 'bg-info/15 text-info shadow-sm'
                      : 'text-muted hover:text-primary',
                  )}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-muted">Font Weight</span>
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface-raised p-1">
              {(['normal', 'bold'] as TinWeight[]).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWeight(w)}
                  className={cn(
                    'rounded-lg px-1 py-1.5 text-[10.5px] font-semibold capitalize transition',
                    activeLayout.fontWeight === w
                      ? 'bg-info/15 text-info shadow-sm'
                      : 'text-muted hover:text-primary',
                  )}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="DEMO QR Code"
          accent="gold"
          icon={<QrCode className="h-3.5 w-3.5" />}
          badge={
            <span className="rounded-full border border-danger/30 bg-danger/10 px-2 py-0.5 font-mono text-[9.5px] normal-case tracking-normal text-danger">
              auto-regenerates
            </span>
          }
        >
          <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-raised p-3">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="DEMO QR preview" className="h-24 w-24 rounded-md border border-line bg-white" />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-md border border-dashed border-line-strong text-[10px] text-dimm">
                QR
                <br />
                ready
              </div>
            )}
            <div className="flex-1">
              <p className="text-[11.5px] font-semibold text-primary">Scan with any QR reader</p>
              <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
                Shows this record as JSON. This is a DEMO QR — it is not an NBR
                verification code.
              </p>
              <Button variant="secondary" size="sm" icon={<UserRound className="h-3.5 w-3.5" />} onClick={() => setViewRecordOpen(true)} className="mt-2">
                View Record
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {TIN_QR_SLIDERS.map((spec) => (
              <PropertySlider
                key={spec.key}
                label={spec.label}
                value={present[spec.key as keyof TINSnapshot] as number}
                min={spec.min}
                max={spec.max}
                step={spec.step}
                mono={spec.mono}
                onChange={(v) => setField(spec.key as keyof TINSnapshot, v as never)}
              />
            ))}
          </div>
        </CollapsibleSection>
      </InspectorPanel>

      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="TIN Document Preview"
        meta={`TIN ${present.tinNo} · ${TIN_DOC_WIDTH}×${TIN_DOC_HEIGHT}px · DEMO`}
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
          <img src={previewDataUrl} alt="TIN document preview" className="mx-auto max-h-[70vh] w-auto rounded-md shadow-deep" />
        ) : (
          <div className="py-20 text-center text-sm text-dimm">Rendering…</div>
        )}
      </Modal>

      <Modal
        open={viewRecordOpen}
        onClose={() => setViewRecordOpen(false)}
        title="DEMO Record"
        meta="DEMO RECORD — NOT OFFICIAL NBR VERIFICATION"
        maxWidth="max-w-lg"
        footer={
          <div className="flex w-full items-center justify-between">
            <span className="font-mono text-[10.5px] text-dimm">{qrPayload.length} chars · JSON</span>
            <Button variant="danger" icon={<Eye className="h-4 w-4" />} onClick={() => setViewRecordOpen(false)}>
              Close
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-2">
          {TIN_FIELDS.map((f) => (
            <div key={f.key} className="flex items-baseline justify-between gap-4 border-b border-line pb-2">
              <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-muted">{f.label}</span>
              <span className="text-right text-[12.5px] text-primary">{present[f.key] || '—'}</span>
            </div>
          ))}
          <div className="mt-2">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-danger">QR Scan Payload</div>
            <pre className="max-h-40 overflow-auto rounded-lg border border-line bg-surface-raised p-3 font-mono text-[10px] leading-relaxed text-muted">
              {qrPayload}
            </pre>
          </div>
        </div>
      </Modal>
    </div>
  );
}
