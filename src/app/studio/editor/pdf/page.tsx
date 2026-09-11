'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  ArrowDown,
  ArrowUp,
  Download,
  Eraser,
  FileUp,
  Highlighter,
  ImagePlus,
  Loader2,
  MousePointer2,
  PanelRightOpen,
  PenLine,
  Redo2,
  RotateCcw,
  RotateCw,
  Square,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
  Circle,
  Minus,
  Stamp,
  FileText,
} from 'lucide-react';
import { InspectorPanel } from '@/components/editor/inspector-panel';
import { CollapsibleSection } from '@/components/editor/collapsible-section';
import { PropertyInput } from '@/components/editor/property-input';
import { PropertySlider } from '@/components/editor/property-slider';
import { PdfPageView } from '@/components/pdf-editor/pdf-page-view';
import { SignaturePad } from '@/components/pdf-editor/signature-pad';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { FieldLabel } from '@/components/ui/input';
import { useHistory } from '@/lib/hooks/useHistory';
import { useToast } from '@/lib/toast/toast-provider';
import { cn, clamp } from '@/lib/utils';
import { moveAnnotation } from '@/lib/pdf-editor/geometry';
import {
  addAnnotation,
  annotationsForPage,
  deletePage,
  eraseInBox,
  findAnnotationAt,
  isMeaningfulDraft,
  makeDraft,
  movePage,
  removeAnnotation,
  resizeDraft,
  rotatePage,
  translateAnnotation,
  updateAnnotation,
} from '@/lib/pdf-editor/document';
import { downloadPdfBytes, exportEditedPdf } from '@/lib/pdf-editor/export';
import { loadPdfDocument, readPdfPages } from '@/lib/pdf-editor/pdfjs';
import { EMPTY_PDF_DOCUMENT, PDF_TOOL_LABEL, type PdfAnnotation, type PdfEditorDocument, type PdfPoint, type PdfTool } from '@/lib/pdf-editor/types';

const MAX_BYTES = 25 * 1024 * 1024;
const TOOLS: { id: PdfTool; label: string; icon: typeof Type }[] = [
  { id: 'select', label: 'Select', icon: MousePointer2 },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'highlight', label: 'Highlight', icon: Highlighter },
  { id: 'pen', label: 'Draw', icon: PenLine },
  { id: 'whiteout', label: 'Whiteout', icon: Eraser },
  { id: 'image', label: 'Image', icon: ImagePlus },
  { id: 'signature', label: 'Sign', icon: Stamp },
  { id: 'rect', label: 'Rect', icon: Square },
  { id: 'ellipse', label: 'Ellipse', icon: Circle },
  { id: 'line', label: 'Line', icon: Minus },
];

export default function PdfEditorPage() {
  const toast = useToast();
  const history = useHistory<PdfEditorDocument>(EMPTY_PDF_DOCUMENT);
  const { present, set, replace, undo, redo, canUndo, canRedo, reset } = history;

  const sourceBytesRef = useRef<Uint8Array | null>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [tool, setTool] = useState<PdfTool>('select');
  const [zoom, setZoom] = useState(1);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Upload a PDF to begin');
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const dragRef = useRef<{
    mode: 'draw' | 'move' | 'erase';
    start: PdfPoint;
    last: PdfPoint;
    pageId: string;
    annotationId?: string;
    draft?: PdfAnnotation;
  } | null>(null);
  const [draft, setDraft] = useState<PdfAnnotation | null>(null);
  const [movePreview, setMovePreview] = useState<{ id: string; dx: number; dy: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const activePage = present.pages.find((p) => p.id === activePageId) ?? present.pages[0] ?? null;
  const selected = present.annotations.find((a) => a.id === selectedId) ?? null;

  const closeDocument = useCallback(async () => {
    pdfRef.current?.destroy().catch(() => undefined);
    pdfRef.current = null;
    sourceBytesRef.current = null;
    setPdf(null);
    reset();
    setActivePageId(null);
    setSelectedId(null);
    setDraft(null);
    setPendingImage(null);
    setSignatureDataUrl(null);
    setStatus('Upload a PDF to begin');
  }, [reset]);

  const loadFile = useCallback(
    async (file: File) => {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        toast.error('Please choose a PDF file');
        return;
      }
      if (file.size > MAX_BYTES) {
        toast.error('PDF is larger than 25 MB');
        return;
      }
      setBusy(true);
      setStatus('Loading PDF…');
      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const loaded = await loadPdfDocument(bytes);
        const pages = await readPdfPages(loaded);
        pdfRef.current?.destroy().catch(() => undefined);
        pdfRef.current = loaded;
        sourceBytesRef.current = bytes;
        setPdf(loaded);
        replace({
          fileName: file.name,
          pages,
          annotations: [],
        });
        setActivePageId(pages[0]?.id ?? null);
        setSelectedId(null);
        setDraft(null);
        setZoom(1);
        setStatus(`${file.name} · ${pages.length} page${pages.length === 1 ? '' : 's'} · stays in this session`);
        toast.success(`Loaded ${pages.length} page${pages.length === 1 ? '' : 's'}`);
      } catch {
        toast.error('Could not read this PDF');
        setStatus('Upload a PDF to begin');
      } finally {
        setBusy(false);
      }
    },
    [replace, toast],
  );

  useEffect(() => {
    return () => {
      pdfRef.current?.destroy().catch(() => undefined);
      pdfRef.current = null;
      sourceBytesRef.current = null;
    };
  }, []);

  const onToolClick = (next: PdfTool) => {
    if (next === 'image') {
      imageInputRef.current?.click();
      return;
    }
    if (next === 'signature') {
      setSignatureOpen(true);
      return;
    }
    setTool(next);
    if (next !== 'select') setSelectedId(null);
  };

  const commitDraft = (next: PdfAnnotation | null) => {
    const session = dragRef.current;
    dragRef.current = null;
    setDraft(null);
    if (!next || !isMeaningfulDraft(next)) return;
    if (session?.mode === 'erase' && next.type === 'whiteout') {
      set((doc) => addAnnotation(eraseInBox(doc, next.pageId, next), next));
      return;
    }
    set((doc) => addAnnotation(doc, next));
    setSelectedId(next.id);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>, point: PdfPoint) => {
    if (!activePage) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    if (tool === 'select') {
      const hit = findAnnotationAt(present, activePage.id, point);
      setSelectedId(hit?.id ?? null);
      if (hit) {
        dragRef.current = { mode: 'move', start: point, last: point, pageId: activePage.id, annotationId: hit.id };
        setMovePreview({ id: hit.id, dx: 0, dy: 0 });
      }
      return;
    }
    const extra = { imageDataUrl: pendingImage ?? undefined, signatureDataUrl: signatureDataUrl ?? undefined };
    if ((tool === 'image' && !pendingImage) || (tool === 'signature' && !signatureDataUrl)) {
      toast.info(tool === 'image' ? 'Choose an image first' : 'Create a signature first');
      return;
    }
    const created = makeDraft(tool, activePage, point, extra);
    if (!created) return;
    if (created.type === 'text' || created.type === 'image' || created.type === 'signature') {
      set((doc) => addAnnotation(doc, created));
      setSelectedId(created.id);
      setTool('select');
      if (created.type === 'image') setPendingImage(null);
      return;
    }
    dragRef.current = {
      mode: tool === 'whiteout' ? 'erase' : 'draw',
      start: point,
      last: point,
      pageId: activePage.id,
      draft: created,
    };
    setDraft(created);
  };

  const onPointerMove = (_e: React.PointerEvent<HTMLDivElement>, point: PdfPoint) => {
    const session = dragRef.current;
    if (!session) return;
    if (session.mode === 'move' && session.annotationId) {
      session.last = point;
      setMovePreview({
        id: session.annotationId,
        dx: point.x - session.start.x,
        dy: point.y - session.start.y,
      });
      return;
    }
    if (!session.draft) return;
    const next = resizeDraft(session.draft, session.start, point);
    session.draft = next;
    setDraft(next);
  };

  const onPointerUp = (_e: React.PointerEvent<HTMLDivElement>, point: PdfPoint) => {
    const session = dragRef.current;
    if (!session) return;
    if (session.mode === 'move' && session.annotationId) {
      const dx = point.x - session.start.x;
      const dy = point.y - session.start.y;
      dragRef.current = null;
      setMovePreview(null);
      if (Math.abs(dx) > 0.0005 || Math.abs(dy) > 0.0005) {
        set((doc) => translateAnnotation(doc, session.annotationId!, dx, dy));
      }
      return;
    }
    if (session.draft) {
      const next = resizeDraft(session.draft, session.start, point);
      commitDraft(next);
    } else {
      dragRef.current = null;
      setDraft(null);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable;
      if (inField) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!selectedId) return;
        e.preventDefault();
        set((doc) => removeAnnotation(doc, selectedId));
        setSelectedId(null);
      }
      if (e.key === 'Escape') {
        setSelectedId(null);
        setTool('select');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, set]);

  const handleExport = async () => {
    const bytes = sourceBytesRef.current;
    if (!bytes || !present.pages.length) {
      toast.error('Upload a PDF first');
      return;
    }
    setExporting(true);
    setStatus('Exporting edited PDF…');
    try {
      const out = await exportEditedPdf(bytes, present);
      downloadPdfBytes(out, present.fileName);
      setStatus(`Exported ${present.pages.length} page${present.pages.length === 1 ? '' : 's'}`);
      toast.success('Edited PDF downloaded');
    } catch {
      toast.error('Export failed');
      setStatus('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const pageAnnotations = useMemo(() => {
    if (!activePage) return [];
    const items = annotationsForPage(present, activePage.id);
    if (!movePreview) return items;
    return items.map((item) =>
      item.id === movePreview.id ? moveAnnotation(item, movePreview.dx, movePreview.dy) : item,
    );
  }, [present, activePage, movePreview]);

  const cursor =
    tool === 'pen' ? 'crosshair' : tool === 'select' ? 'default' : tool === 'text' ? 'text' : 'crosshair';

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface/85 px-3 py-2.5 backdrop-blur-xl sm:px-4">
          <div className="flex items-center gap-1 rounded-xl border border-line bg-surface-raised p-1">
            <Button size="icon-sm" variant="ghost" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={redo} disabled={!canRedo} title="Redo">
              <Redo2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="mx-1 h-5 w-px bg-line" />

          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-line bg-surface-raised p-1">
            {TOOLS.map((item) => {
              const Icon = item.icon;
              const active = tool === item.id || (item.id === 'image' && pendingImage && tool === 'image') || (item.id === 'signature' && signatureDataUrl && tool === 'signature');
              return (
                <Button
                  key={item.id}
                  size="icon-sm"
                  variant={active ? 'soft' : 'ghost'}
                  title={PDF_TOOL_LABEL[item.id]}
                  aria-label={PDF_TOOL_LABEL[item.id]}
                  onClick={() => onToolClick(item.id)}
                  disabled={!pdf && item.id !== 'select'}
                >
                  <Icon className="h-3.5 w-3.5" />
                </Button>
              );
            })}
          </div>

          <div className="mx-1 h-5 w-px bg-line" />

          <div className="flex items-center gap-1 rounded-xl border border-line bg-surface-raised p-1">
            <Button size="icon-sm" variant="ghost" onClick={() => setZoom((z) => clamp(z / 1.15, 0.35, 3))} title="Zoom out">
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="min-w-[46px] text-center font-mono text-[10.5px] text-muted">{Math.round(zoom * 100)}%</span>
            <Button size="icon-sm" variant="ghost" onClick={() => setZoom((z) => clamp(z * 1.15, 0.35, 3))} title="Zoom in">
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </div>

          <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} icon={<FileUp className="h-3.5 w-3.5" />}>
            {pdf ? 'Replace PDF' : 'Upload PDF'}
          </Button>
          <Button variant="success" size="sm" onClick={handleExport} loading={exporting} disabled={!pdf} icon={<Download className="h-3.5 w-3.5" />}>
            Export PDF
          </Button>

          <div className="ml-auto flex items-center gap-3">
            {(busy || exporting) && <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />}
            <span className="hidden max-w-[280px] truncate font-mono text-[10.5px] text-dimm xl:block">{status}</span>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {pdf && present.pages.length > 0 && (
            <aside className="hidden w-[148px] shrink-0 overflow-y-auto border-r border-line bg-surface p-3 md:block">
              <div className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.16em] text-dimm">Pages</div>
              <div className="flex flex-col gap-2">
                {present.pages.map((page, index) => (
                  <button
                    key={page.id}
                    type="button"
                    onClick={() => {
                      setActivePageId(page.id);
                      setSelectedId(null);
                    }}
                    className={cn(
                      'rounded-xl border p-1.5 text-left transition',
                      page.id === activePage?.id
                        ? 'border-accent/50 bg-accent/10'
                        : 'border-line bg-surface-raised hover:border-line-strong',
                    )}
                  >
                    <PdfPageView
                      pdf={pdf}
                      page={page}
                      annotations={annotationsForPage(present, page.id)}
                      zoom={0.16}
                      thumbnail
                    />
                    <div className="mt-1 text-center font-mono text-[10px] text-muted">{index + 1}</div>
                  </button>
                ))}
              </div>
            </aside>
          )}

          <div className="relative flex min-h-0 flex-1 overflow-auto bg-canvas-soft bg-grid p-6 sm:p-8">
            {!pdf || !activePage ? (
              <div className="m-auto w-full max-w-lg">
                <EmptyState
                  icon={<FileText className="h-7 w-7" />}
                  title="PDF Editor"
                  description="Upload a PDF to preview every page, annotate in the browser, then export. Files never leave this session."
                  action={
                    <Button variant="primary" onClick={() => fileInputRef.current?.click()} icon={<FileUp className="h-4 w-4" />}>
                      Upload PDF
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="m-auto" style={{ cursor }}>
                <PdfPageView
                  pdf={pdf}
                  page={activePage}
                  annotations={pageAnnotations}
                  selectedId={selectedId}
                  zoom={zoom}
                  draft={draft}
                  interactive
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                />
              </div>
            )}

            {!inspectorOpen && (
              <button
                onClick={() => setInspectorOpen(true)}
                className="absolute right-5 top-4 z-30 flex items-center gap-2 rounded-full border border-line-strong bg-surface/90 px-4 py-2.5 text-xs font-semibold text-muted shadow-pop backdrop-blur-xl transition hover:text-accent-bright"
              >
                <PanelRightOpen className="h-4 w-4" />
                Inspector
              </button>
            )}
          </div>
        </div>
      </div>

      <InspectorPanel
        title="PDF Editor"
        subtitle={present.fileName ? `${present.fileName} · private session` : 'No file loaded'}
        open={inspectorOpen}
        onToggle={() => setInspectorOpen(false)}
        footer={
          <div className="flex flex-col gap-2 p-4">
            <div className="flex items-center gap-2 font-mono text-[10.5px] text-dimm">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
              Files stay in memory. Nothing is uploaded.
            </div>
            {pdf && (
              <Button variant="danger" size="sm" onClick={closeDocument} icon={<Trash2 className="h-3.5 w-3.5" />}>
                Clear session
              </Button>
            )}
          </div>
        }
      >
        <CollapsibleSection title="Page" icon={<FileText className="h-3.5 w-3.5" />}>
          {activePage ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">
                  Page {(present.pages.findIndex((p) => p.id === activePage.id) + 1) || 1} of {present.pages.length}
                </span>
                <Badge tone="gold">{Math.round(activePage.widthPt)} × {Math.round(activePage.heightPt)} pt</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => set((doc) => rotatePage(doc, activePage.id, -90))}
                  icon={<RotateCcw className="h-3.5 w-3.5" />}
                >
                  Rotate L
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => set((doc) => rotatePage(doc, activePage.id, 90))}
                  icon={<RotateCw className="h-3.5 w-3.5" />}
                >
                  Rotate R
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={present.pages[0]?.id === activePage.id}
                  onClick={() => {
                    set((doc) => movePage(doc, activePage.id, -1));
                  }}
                  icon={<ArrowUp className="h-3.5 w-3.5" />}
                >
                  Move up
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={present.pages[present.pages.length - 1]?.id === activePage.id}
                  onClick={() => {
                    set((doc) => movePage(doc, activePage.id, 1));
                  }}
                  icon={<ArrowDown className="h-3.5 w-3.5" />}
                >
                  Move down
                </Button>
              </div>
              <Button
                variant="danger"
                size="sm"
                disabled={present.pages.length <= 1}
                onClick={() => {
                  const id = activePage.id;
                  const idx = present.pages.findIndex((p) => p.id === id);
                  const next = present.pages[idx + 1] ?? present.pages[idx - 1] ?? null;
                  set((doc) => deletePage(doc, id));
                  setActivePageId(next?.id ?? null);
                  setSelectedId(null);
                }}
                icon={<Trash2 className="h-3.5 w-3.5" />}
              >
                Delete page
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted">Upload a PDF to manage pages.</p>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="Edit" icon={<PenLine className="h-3.5 w-3.5" />} defaultOpen>
          {selected?.type === 'text' ? (
            <div className="space-y-3">
              <PropertyInput
                label="Text"
                value={selected.text}
                textarea
                onChange={(v) => set((doc) => updateAnnotation(doc, selected.id, { text: v } as Partial<PdfAnnotation>))}
              />
              <PropertySlider
                label="Font size"
                value={Math.round(selected.fontSize * 1000)}
                min={12}
                max={80}
                onChange={(v) =>
                  set((doc) => updateAnnotation(doc, selected.id, { fontSize: v / 1000 } as Partial<PdfAnnotation>))
                }
              />
              <FieldLabel>Color</FieldLabel>
              <input
                type="color"
                value={selected.color}
                onChange={(e) =>
                  set((doc) => updateAnnotation(doc, selected.id, { color: e.target.value } as Partial<PdfAnnotation>))
                }
                className="h-9 w-full cursor-pointer rounded-lg border border-line bg-surface-raised"
              />
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  set((doc) => removeAnnotation(doc, selected.id));
                  setSelectedId(null);
                }}
              >
                Delete text
              </Button>
            </div>
          ) : selected ? (
            <div className="space-y-3">
              <p className="text-xs text-muted">
                Selected: {selected.type}
                {selected.type === 'shape' ? ` (${selected.shape})` : ''}
              </p>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  set((doc) => removeAnnotation(doc, selected.id));
                  setSelectedId(null);
                }}
              >
                Delete annotation
              </Button>
            </div>
          ) : (
            <p className="text-xs leading-relaxed text-muted">
              Choose a tool, then click or drag on the page. Whiteout covers original content. Select an object and press
              Delete to remove it.
            </p>
          )}
        </CollapsibleSection>
      </InspectorPanel>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void loadFile(file);
        }}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const url = typeof reader.result === 'string' ? reader.result : null;
            if (!url) return;
            setPendingImage(url);
            setTool('image');
            toast.info('Click the page to place the image');
          };
          reader.readAsDataURL(file);
        }}
      />
      <SignaturePad
        open={signatureOpen}
        onClose={() => setSignatureOpen(false)}
        onConfirm={(dataUrl) => {
          setSignatureDataUrl(dataUrl);
          setSignatureOpen(false);
          setTool('signature');
          toast.info('Click the page to place the signature');
        }}
      />
    </div>
  );
}
