'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Camera, CreditCard, Download, PanelRightOpen, UserRound, Users } from 'lucide-react';
import { useDocumentEditor } from '@/lib/editor/use-document-editor';
import { NID_DEFAULTS, NID_SECTIONS, NID_BACKGROUND, NID_TEXT_FIELDS } from '@/lib/constants/nid';
import type { NIDSnapshot } from '@/lib/editor/types';
import { renderNIDCard } from '@/lib/renderers/nidRenderer';
import { loadImage } from '@/lib/images';
import { loadDocumentFonts } from '@/lib/fonts';
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

export default function NIDEditorPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-sm text-dimm">Loading editor…</div>}>
      <NIDEditorInner />
    </Suspense>
  );
}

function NIDEditorInner() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [photoImage, setPhotoImage] = useState<HTMLImageElement | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useDocumentEditor<NIDSnapshot>({
    kind: 'nid',
    defaults: NID_DEFAULTS,
    autosaveKey: 'studio.autosave.nid',
    loadExternal: () => externalCacheRef.current,
  });
  const externalCacheRef = useRef<NIDSnapshot | null>(null);

  const { present, zoom, setField, setStatus, setBusy, setRendered, setDims, dims } = editor;

  // Latest-state refs so render/export callbacks stay stable and always draw
  // the freshest snapshot without re-creating the callbacks on every keystroke.
  const presentRef = useRef(present);
  presentRef.current = present;
  const photoImageRef = useRef(photoImage);
  photoImageRef.current = photoImage;
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
          const next = { ...NID_DEFAULTS, ...(found.state as Partial<NIDSnapshot>) };
          externalCacheRef.current = next;
          editor.replace(next);
          setStatus(`Project "${found.name}" loaded`);
          toast.success(`Project "${found.name}" loaded`);
        }
      } else if (templateName) {
        const res = await listTemplates();
        const found = res.data.find((t) => String(t.id) === templateName || t.name === templateName);
        if (found) {
          const next = { ...NID_DEFAULTS, ...(found.state as Partial<NIDSnapshot>) };
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

  const rafRef = useRef(0);
  const liveScaleRef = useRef(1);

  // Draw the latest snapshot onto a canvas at a given scale. `setDims` only
  // commits when the value actually changes so the page doesn't re-render on
  // every frame while typing.
  const draw = useCallback(
    async (canvas: HTMLCanvasElement, scale: number) => {
      const bg = await loadImage(NID_BACKGROUND);
      renderNIDCard(canvas, presentRef.current, bg, photoImageRef.current, scale);
      const w = bg ? bg.naturalWidth : 856;
      const h = bg ? bg.naturalHeight : 540;
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
  }, [present, fontsLoaded, photoImage, zoom, draw]);

  // Force refresh at full resolution (explicit "Render" action).
  const forceRender = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy(true);
    setStatus('Compositing NID card…');
    await draw(canvas, 1);
    setBusy(false);
    setStatus(`Card rendered — ${dims?.w}×${dims?.h}px · Kalpurush:${fontsLoaded ? '✓' : '✗(fallback)'}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw, setBusy, setStatus, dims, fontsLoaded]);

  const reset = useCallback(() => {
    setPhotoImage(null);
    setPhotoName(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    editor.reset();
    setStatus('Defaults applied');
    toast.info('NID reset to calibrated defaults');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportJpg = useCallback(async () => {
    const bg = await loadImage(NID_BACKGROUND);
    const canvas = document.createElement('canvas');
    renderNIDCard(canvas, presentRef.current, bg, photoImageRef.current, 1);
    const idNo = presentRef.current.idNo || 'nid';
    const link = document.createElement('a');
    link.download = `NID-${idNo}.jpg`;
    link.href = canvas.toDataURL('image/jpeg', 0.97);
    link.click();
    void logActivity({ user_id: user?.id, email: user?.email, action: 'export.nid.jpg', detail: `NID ${idNo}` });
    toast.success(`Downloaded NID-${idNo}.jpg`);
  }, [user, toast]);

  const preview = useCallback(async () => {
    const bg = await loadImage(NID_BACKGROUND);
    const canvas = document.createElement('canvas');
    renderNIDCard(canvas, presentRef.current, bg, photoImageRef.current, 1);
    setPreviewDataUrl(canvas.toDataURL('image/jpeg', 0.97));
    setPreviewOpen(true);
  }, []);

  const handlePhotoUpload = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          setPhotoImage(img);
          setPhotoName(file.name);
          toast.success('Profile photo loaded');
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
    await saveProject({
      name: `NID ${present.idNo || 'Card'}`,
      kind: 'nid',
      state: { ...present } as unknown as Record<string, unknown>,
      owner_id: user.id,
    });
    toast.success('Project saved');
    void logActivity({ user_id: user?.id, email: user?.email, action: 'project.save', detail: `NID ${present.idNo}` });
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
          placeholderTitle="Fill in the fields — the card renders live"
          placeholderSub="Background: nid-bg.png · 3570 × 2203 px · Kalpurush + Arial"
          fullscreen={editor.fullscreen}
          onToggleFullscreen={editor.toggleFullscreen}
          kindLabel="NID Card"
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
        title="NID Card Inspector"
        subtitle="Canvas Editor — Absolute Positioning Mode"
        open={editor.inspectorOpen}
        onToggle={editor.toggleInspector}
        footer={
          <div className="flex flex-col gap-2 p-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handlePhotoUpload(e.target.files[0])}
            />
            <Button variant="outline" icon={<Camera className="h-4 w-4" />} onClick={() => fileInputRef.current?.click()}>
              {photoName ? `Replace: ${photoName}` : 'Upload Profile Photo'}
            </Button>
            <div className="flex items-center gap-2 font-mono text-[10.5px] text-dimm">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
              {editor.status}
            </div>
          </div>
        }
      >
        <div className="border-b border-line bg-surface-raised px-4 py-3">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-info">
            NID Card v1.0 · Kalpurush + Arial
          </p>
          <p className="mt-1 text-xs text-muted">
            Absolute positioning — X/Y/Size anchors preserve the calibrated card layout.
          </p>
        </div>

        {NID_TEXT_FIELDS.map((f) => (
          <div key={f.key} className="border-b border-line px-4 py-4">
            <PropertyInput
              label={f.label}
              value={present[f.key]}
              onChange={(v) => setField(f.key as keyof NIDSnapshot, v as never)}
            />
          </div>
        ))}

        {NID_SECTIONS.filter((s) => s.id === 'name-bangla' || s.id === 'name-english').map((section) => (
          <CollapsibleSection
            key={section.id}
            title={section.label}
            icon={<UserRound className="h-3.5 w-3.5" />}
          >
            {section.groups.map((group, gi) => (
              <div key={gi} className="grid grid-cols-3 gap-3">
                {group.map((spec) => (
                  <PropertySlider
                    key={spec.key}
                    label={spec.label}
                    value={present[spec.key as keyof NIDSnapshot] as number}
                    min={spec.min}
                    max={spec.max}
                    step={spec.step}
                    mono={spec.mono}
                    onChange={(v) => setField(spec.key as keyof NIDSnapshot, v as never)}
                  />
                ))}
              </div>
            ))}
          </CollapsibleSection>
        ))}

        {NID_SECTIONS.filter((s) => s.id === 'father' || s.id === 'mother').map((section) => (
          <CollapsibleSection
            key={section.id}
            title={section.label}
            icon={<Users className="h-3.5 w-3.5" />}
          >
            {section.groups.map((group, gi) => (
              <div key={gi} className="grid grid-cols-3 gap-3">
                {group.map((spec) => (
                  <PropertySlider
                    key={spec.key}
                    label={spec.label}
                    value={present[spec.key as keyof NIDSnapshot] as number}
                    min={spec.min}
                    max={spec.max}
                    step={spec.step}
                    mono={spec.mono}
                    onChange={(v) => setField(spec.key as keyof NIDSnapshot, v as never)}
                  />
                ))}
              </div>
            ))}
          </CollapsibleSection>
        ))}

        {NID_SECTIONS.filter((s) => s.id === 'dob' || s.id === 'id-no').map((section) => (
          <CollapsibleSection
            key={section.id}
            title={section.label}
            icon={<CreditCard className="h-3.5 w-3.5" />}
          >
            {section.groups.map((group, gi) => (
              <div key={gi} className="grid grid-cols-3 gap-3">
                {group.map((spec) => (
                  <PropertySlider
                    key={spec.key}
                    label={spec.label}
                    value={present[spec.key as keyof NIDSnapshot] as number}
                    min={spec.min}
                    max={spec.max}
                    step={spec.step}
                    mono={spec.mono}
                    onChange={(v) => setField(spec.key as keyof NIDSnapshot, v as never)}
                  />
                ))}
              </div>
            ))}
          </CollapsibleSection>
        ))}

        {NID_SECTIONS.filter((s) => s.id === 'photo').map((section) => (
          <CollapsibleSection
            key={section.id}
            title={section.label}
            accent={section.accent}
            icon={<Camera className="h-3.5 w-3.5" />}
          >
            {section.groups.map((group, gi) => (
              <div key={gi} className="grid grid-cols-2 gap-3">
                {group.map((spec) => (
                  <PropertySlider
                    key={spec.key}
                    label={spec.label}
                    value={present[spec.key as keyof NIDSnapshot] as number}
                    min={spec.min}
                    max={spec.max}
                    step={spec.step}
                    mono={spec.mono}
                    onChange={(v) => setField(spec.key as keyof NIDSnapshot, v as never)}
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
        title="NID Card Preview"
        meta={`ID ${present.idNo} · ${dims ? `${dims.w}×${dims.h}px` : ''}`}
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
          <img src={previewDataUrl} alt="NID card preview" className="mx-auto max-h-[70vh] w-auto rounded-md shadow-deep" />
        ) : (
          <div className="py-20 text-center text-sm text-dimm">Rendering…</div>
        )}
      </Modal>
    </div>
  );
}
