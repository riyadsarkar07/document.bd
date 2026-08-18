'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { jsPDF } from 'jspdf';
import {
  Award,
  FileText,
  ImagePlus,
  PanelRightOpen,
  ScrollText,
  Type,
} from 'lucide-react';
import { useDocumentEditor } from '@/lib/editor/use-document-editor';
import { TM_DEFAULTS, TM_SECTIONS, TM_BACKGROUND, TM_SIGNATURE, TM_TEXT_FIELDS } from '@/lib/constants/tm';
import type { TMSnapshot } from '@/lib/editor/types';
import { renderTMCertificate } from '@/lib/renderers/tmRenderer';
import { loadImage } from '@/lib/images';
import { loadDocumentFonts } from '@/lib/fonts';
import { commitCertificate } from '@/lib/workspace/vault';
import { listTemplates, listProjects, saveProject, logActivity } from '@/lib/workspace/store';
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

export default function TMEditorPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-sm text-dimm">Loading editor…</div>}>
      <TMEditorInner />
    </Suspense>
  );
}

function TMEditorInner() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [logoImage, setLogoImage] = useState<HTMLImageElement | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadExternal = useCallback(() => {
    const projectId = searchParams.get('project');
    const templateName = searchParams.get('template');
    if (!projectId && !templateName) return null;
    // Synchronously resolve from caches loaded at module init (see effect below)
    return externalCacheRef.current ?? null;
  }, [searchParams]);

  const externalCacheRef = useRef<TMSnapshot | null>(null);

  const editor = useDocumentEditor<TMSnapshot>({
    kind: 'tm',
    defaults: TM_DEFAULTS,
    autosaveKey: 'studio.autosave.tm',
    loadExternal,
  });

  const { present, zoom, setField, setStatus, setBusy, setRendered, setDims, dims } = editor;

  // Latest-state refs so render/export callbacks stay stable and always draw
  // the freshest snapshot without re-creating the callbacks on every keystroke.
  const presentRef = useRef(present);
  presentRef.current = present;
  const logoImageRef = useRef(logoImage);
  logoImageRef.current = logoImage;
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
          externalCacheRef.current = { ...TM_DEFAULTS, ...(found.state as Partial<TMSnapshot>) };
          editor.replace(externalCacheRef.current);
          setStatus(`Project "${found.name}" loaded`);
          toast.success(`Project "${found.name}" loaded`);
        }
      } else if (templateName) {
        const res = await listTemplates();
        const found = res.data.find((t) => String(t.id) === templateName || t.name === templateName);
        if (found) {
          externalCacheRef.current = { ...TM_DEFAULTS, ...(found.state as Partial<TMSnapshot>) };
          editor.replace(externalCacheRef.current);
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

  const rafRef = useRef(0);
  const liveScaleRef = useRef(1);

  // Draw the latest snapshot onto a canvas at a given scale. `setDims` only
  // commits when the value actually changes so the page doesn't re-render on
  // every frame while typing.
  const draw = useCallback(
    async (canvas: HTMLCanvasElement, scale: number) => {
      const bg = await loadImage(TM_BACKGROUND);
      const sign = await loadImage(TM_SIGNATURE);
      renderTMCertificate(canvas, presentRef.current, bg, logoImageRef.current, sign, scale);
      const w = bg ? bg.naturalWidth : 1200;
      const h = bg ? bg.naturalHeight : 1650;
      setDims((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
      setRendered(true);
    },
    [setDims, setRendered],
  );

  // Live preview: rAF-coalesced (one draw per animation frame at most) and
  // rendered at a preview scale so keystrokes and sliders update instantly
  // without full-resolution redraws. No busy/status churn on the live path.
  useEffect(() => {
    if (!fontsLoadedRef.current) return;
    liveScaleRef.current = Math.min(1, Math.max(zoom, 0.35));
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (canvas) void draw(canvas, liveScaleRef.current);
    });
    return () => cancelAnimationFrame(rafRef.current);
  }, [present, fontsLoaded, logoImage, zoom, draw]);

  // Force refresh at full resolution (explicit "Render" action).
  const forceRender = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy(true);
    setStatus('Processing layout…');
    await draw(canvas, 1);
    setBusy(false);
    setStatus(`Rendering engine synchronized — ${dims?.w}×${dims?.h}px`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw, setBusy, setStatus, dims]);

  const reset = useCallback(() => {
    setLogoImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    editor.reset();
    setStatus('Defaults applied');
    toast.info('TM editor reset to calibrated defaults');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportJpg = useCallback(async () => {
    const limit = await checkLimit('export');
    if (!limit.ok) {
      toast.error(limit.message ?? 'Export limit reached.');
      return;
    }
    const bg = await loadImage(TM_BACKGROUND);
    const sign = await loadImage(TM_SIGNATURE);
    const canvas = document.createElement('canvas');
    renderTMCertificate(canvas, presentRef.current, bg, logoImageRef.current, sign, 1);
    const link = document.createElement('a');
    link.download = `Certificate-TM-${presentRef.current.trademarkNo || 'export'}.jpg`;
    link.href = canvas.toDataURL('image/jpeg', 0.96);
    link.click();
    setStatus('Saving to Cloud Vault…');
    const res = await commitCertificate(presentRef.current);
    if (res.error) {
      setStatus('Sync error.');
      toast.error(`Vault error: ${res.error}`);
      return;
    }
    void logActivity({ user_id: user?.id, email: user?.email, action: 'export.tm.jpg', detail: `TM ${presentRef.current.trademarkNo}` });
    toast.success('JPG downloaded · record secured in Cloud Vault');
    setStatus('Vault synchronized ✓');
  }, [user, toast, setStatus]);

  const exportPdf = useCallback(async () => {
    const limit = await checkLimit('export');
    if (!limit.ok) {
      toast.error(limit.message ?? 'Export limit reached.');
      return;
    }
    const bg = await loadImage(TM_BACKGROUND);
    const sign = await loadImage(TM_SIGNATURE);
    const canvas = document.createElement('canvas');
    renderTMCertificate(canvas, presentRef.current, bg, logoImageRef.current, sign, 1);
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
    pdf.save(`Certificate-TM-${presentRef.current.trademarkNo || 'export'}.pdf`);
    setStatus('Saving to Cloud Vault…');
    const res = await commitCertificate(presentRef.current);
    if (res.error) {
      setStatus('Sync error.');
      toast.error(`Vault error: ${res.error}`);
      return;
    }
    void logActivity({ user_id: user?.id, email: user?.email, action: 'export.tm.pdf', detail: `TM ${presentRef.current.trademarkNo}` });
    toast.success('A4 PDF downloaded · record secured in Cloud Vault');
    setStatus('Vault synchronized ✓');
  }, [user, toast, setStatus]);

  const preview = useCallback(async () => {
    const bg = await loadImage(TM_BACKGROUND);
    const sign = await loadImage(TM_SIGNATURE);
    const canvas = document.createElement('canvas');
    renderTMCertificate(canvas, presentRef.current, bg, logoImageRef.current, sign, 1);
    setPreviewDataUrl(canvas.toDataURL('image/jpeg', 0.96));
    setPreviewOpen(true);
  }, []);

  const handleLogoUpload = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          setLogoImage(img);
          toast.success('Logo asset registered');
        };
        img.src = String(e.target?.result);
      };
      reader.readAsDataURL(file);
    },
    [toast],
  );

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
      name: `TM ${present.trademarkNo || 'Certificate'}`,
      kind: 'tm',
      state: { ...present } as unknown as Record<string, unknown>,
      owner_id: user.id,
    });
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Project saved');
    void logActivity({ user_id: user?.id, email: user?.email, action: 'project.save', detail: `TM ${present.trademarkNo}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present, user, toast]);

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
          placeholderTitle="Fill in details — the certificate renders live"
          placeholderSub="Background: cert-bangladesh.png · 2373 × 3508 px"
          fullscreen={editor.fullscreen}
          onToggleFullscreen={editor.toggleFullscreen}
          kindLabel="TM Certificate"
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
        title="TM Certificate Inspector"
        subtitle="Version 1 · absolute calibration"
        open={editor.inspectorOpen}
        onToggle={editor.toggleInspector}
        footer={
          <div className="flex flex-col gap-2 p-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])}
            />
            <Button variant="outline" icon={<ImagePlus className="h-4 w-4" />} onClick={() => fileInputRef.current?.click()}>
              Upload Logo / Seal Image
            </Button>
            <div className="flex items-center gap-2 font-mono text-[10.5px] text-dimm">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
              {editor.status}
            </div>
          </div>
        }
      >
        <CollapsibleSection title="Certificate Data" icon={<ScrollText className="h-3.5 w-3.5" />}>
          {TM_TEXT_FIELDS.filter((f) => ['trademarkNo', 'regDate', 'appDate', 'companyName', 'ownerName', 'address', 'compType'].includes(f.key)).map((f) => (
            <PropertyInput
              key={f.key}
              label={f.label}
              value={String(present[f.key])}
              textarea={f.textarea}
              onChange={(v) => setField(f.key as keyof TMSnapshot, v as never)}
            />
          ))}
        </CollapsibleSection>

        <CollapsibleSection title="Text Segments" icon={<Type className="h-3.5 w-3.5" />}>
          {TM_TEXT_FIELDS.filter((f) => !['trademarkNo', 'regDate', 'appDate', 'companyName', 'ownerName', 'address', 'compType'].includes(f.key)).map((f) => (
            <PropertyInput
              key={f.key}
              label={f.label}
              value={String(present[f.key])}
              textarea={f.textarea}
              onChange={(v) => setField(f.key as keyof TMSnapshot, v as never)}
            />
          ))}
        </CollapsibleSection>

        {TM_SECTIONS.filter((s) => s.id !== 'cert-data' && s.id !== 'text-segments').map((section) => (
          <CollapsibleSection
            key={section.id}
            title={section.label}
            accent={section.accent}
            icon={<Award className="h-3.5 w-3.5" />}
          >
            {section.groups.map((group, gi) => (
              <div key={gi} className="grid grid-cols-1 gap-4">
                {group.map((spec) => (
                  <PropertySlider
                    key={spec.key}
                    label={spec.label}
                    value={present[spec.key as keyof TMSnapshot] as number}
                    min={spec.min}
                    max={spec.max}
                    step={spec.step}
                    mono={spec.mono}
                    onChange={(v) => setField(spec.key as keyof TMSnapshot, v as never)}
                  />
                ))}
              </div>
            ))}
          </CollapsibleSection>
        ))}
      </InspectorPanel>

      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Certificate Preview"
        meta={`TM No. ${present.trademarkNo} · ${dims ? `${dims.w}×${dims.h}px` : ''}`}
        maxWidth="max-w-3xl"
        footer={
          <div className="flex w-full items-center justify-between">
            <span className="font-mono text-[11px] text-dimm">JPEG export · full resolution</span>
            <Button variant="success" onClick={exportJpg}>
              <FileText className="h-4 w-4" /> Download JPG
            </Button>
          </div>
        }
      >
        {previewDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewDataUrl} alt="Certificate preview" className="mx-auto max-h-[70vh] w-auto rounded-md shadow-deep" />
        ) : (
          <div className="py-20 text-center text-sm text-dimm">Rendering…</div>
        )}
      </Modal>
    </div>
  );
}
