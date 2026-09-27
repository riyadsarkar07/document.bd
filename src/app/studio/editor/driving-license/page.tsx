'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { jsPDF } from 'jspdf';
import { Camera, Download, PanelRightOpen, QrCode, Type } from 'lucide-react';
import { useDocumentEditor } from '@/lib/editor/use-document-editor';
import {
  DL_DEFAULT_LAYOUTS,
  DL_DEFAULTS,
  DL_DEMO_NOTE,
  DL_DOC_HEIGHT,
  DL_DOC_WIDTH,
  DL_FIELDS,
  DL_FONT_OPTIONS,
  DL_LAYOUT_RANGES,
  DL_PHOTO_RANGES,
  DL_QR_RANGES,
  DL_TEMPLATE_SRC,
  dlQrBox,
  isDlFieldKey,
  normalizeDrivingLicenseSnapshot,
} from '@/lib/constants/driving-license';
import type {
  DlFieldKey,
  DlLayout,
  DlOverlayKey,
  DrivingLicenseSnapshot,
} from '@/lib/editor/types';
import { renderDrivingLicense } from '@/lib/renderers/drivingLicenseRenderer';
import { buildDrivingLicenseQrPayload, encodeDrivingLicenseQr } from '@/lib/drivingLicenseQr';
import { loadDataUrlImage, loadImage } from '@/lib/images';
import { validateImageFile } from '@/lib/uploads';
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

export default function DrivingLicenseEditorPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-sm text-dimm">Loading editor…</div>}>
      <DrivingLicenseEditorInner />
    </Suspense>
  );
}

function DrivingLicenseEditorInner() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [bgImg, setBgImg] = useState<HTMLImageElement | null>(null);
  const [activeField, setActiveField] = useState<DlOverlayKey>('name');
  const [moveStep, setMoveStep] = useState(1);
  const [historyRecordId, setHistoryRecordId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [photoImage, setPhotoImage] = useState<HTMLImageElement | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrImg, setQrImg] = useState<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const externalCacheRef = useRef<DrivingLicenseSnapshot | null>(null);

  const editor = useDocumentEditor<DrivingLicenseSnapshot>({
    kind: 'driving-license',
    defaults: DL_DEFAULTS,
    autosaveKey: `studio.autosave.driving-license.${user?.id ?? 'anon'}`,
    loadExternal: () => externalCacheRef.current,
    normalize: (s) => normalizeDrivingLicenseSnapshot(s as Partial<DrivingLicenseSnapshot>),
  });

  const { present, zoom, setField, setStatus, setBusy, setRendered, setDims, dims, set: setSnapshot } = editor;

  const presentRef = useRef(present);
  presentRef.current = present;
  const bgImgRef = useRef(bgImg);
  bgImgRef.current = bgImg;
  const activeFieldRef = useRef(activeField);
  activeFieldRef.current = activeField;
  const photoImageRef = useRef(photoImage);
  photoImageRef.current = photoImage;
  const qrImgRef = useRef(qrImg);
  qrImgRef.current = qrImg;
  const dragRef = useRef<{
    field: DlOverlayKey;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  useEffect(() => {
    const projectId = searchParams.get('project');
    const templateName = searchParams.get('template');
    const recordNo = searchParams.get('record');
    let cancelled = false;
    (async () => {
      if (recordNo) {
        const res = await getVaultRecord(recordNo);
        if (cancelled) return;
        if (res.error || !res.record) {
          toast.error(res.error ?? 'Could not load History record');
          return;
        }
        if (res.record.docKind !== 'driving-license') {
          toast.error('This History record is not a Driving License.');
          return;
        }
        const next = normalizeDrivingLicenseSnapshot((res.record.doc as Partial<DrivingLicenseSnapshot>) ?? {});
        externalCacheRef.current = next;
        editor.replace(next);
        setPhotoName(next.photoDataUrl ? 'Saved photo' : null);
        setHistoryRecordId(res.record.trademarkNo);
        setStatus(`History record ${recordNo} loaded`);
        toast.success(`History record ${recordNo} loaded`);
        return;
      }
      if (projectId) {
        const res = await listProjects();
        if (cancelled) return;
        const found = res.data.find((p) => String(p.id) === projectId || p.name === projectId);
        if (!found) {
          toast.error(res.error ?? 'Project not found');
          return;
        }
        if (found.kind !== 'driving-license') {
          toast.error('This project is not a Driving License.');
          return;
        }
        const next = normalizeDrivingLicenseSnapshot(found.state as Partial<DrivingLicenseSnapshot>);
        externalCacheRef.current = next;
        editor.replace(next);
        setPhotoName(next.photoDataUrl ? 'Saved photo' : null);
        setStatus(`Project "${found.name}" loaded`);
        toast.success(`Project "${found.name}" loaded`);
        return;
      }
      if (templateName) {
        const res = await listTemplates();
        if (cancelled) return;
        const found = res.data.find((t) => String(t.id) === templateName || t.name === templateName);
        if (!found) {
          toast.error(res.error ?? 'Template not found');
          return;
        }
        if (found.kind !== 'driving-license') {
          toast.error('This template is not a Driving License.');
          return;
        }
        const next = normalizeDrivingLicenseSnapshot(found.state as Partial<DrivingLicenseSnapshot>);
        externalCacheRef.current = next;
        editor.replace(next);
        setPhotoName(next.photoDataUrl ? 'Saved photo' : null);
        setStatus(`Template "${found.name}" applied`);
        toast.success(`Template "${found.name}" applied`);
      }
    })();
    return () => {
      cancelled = true;
    };
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
    void loadImage(DL_TEMPLATE_SRC).then((img) => {
      if (alive && img) setBgImg(img);
    });
    return () => {
      alive = false;
    };
  }, []);

  const qrPayload = useMemo(() => buildDrivingLicenseQrPayload(present), [present]);
  const lastQrPayloadRef = useRef<string | null>(null);
  const qrRafRef = useRef(0);
  useEffect(() => {
    if (qrPayload === lastQrPayloadRef.current) return;
    lastQrPayloadRef.current = qrPayload;
    cancelAnimationFrame(qrRafRef.current);
    qrRafRef.current = requestAnimationFrame(() => {
      void encodeDrivingLicenseQr(presentRef.current, 512).then((dataUrl) => {
        setQrDataUrl((prev) => (prev === dataUrl ? prev : dataUrl));
      });
    });
    return () => cancelAnimationFrame(qrRafRef.current);
  }, [qrPayload]);

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

  const draw = useCallback(
    async (canvas: HTMLCanvasElement, scale: number) => {
      renderDrivingLicense(
        canvas,
        presentRef.current,
        bgImgRef.current,
        scale,
        activeFieldRef.current,
        photoImageRef.current,
        qrImgRef.current,
      );
      setDims((prev) =>
        prev && prev.w === DL_DOC_WIDTH && prev.h === DL_DOC_HEIGHT
          ? prev
          : { w: DL_DOC_WIDTH, h: DL_DOC_HEIGHT },
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
  }, [present, fontsLoaded, bgImg, photoImage, qrImg, zoom, draw, activeField]);

  const forceRender = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy(true);
    setStatus('Rendering driving license…');
    await draw(canvas, 1);
    setBusy(false);
    setStatus(`License rendered — ${DL_DOC_WIDTH}×${DL_DOC_HEIGHT}px`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw, setBusy, setStatus]);

  const reset = useCallback(() => {
    editor.reset();
    setPhotoImage(null);
    setPhotoName(null);
    lastQrPayloadRef.current = null;
    setQrDataUrl(null);
    setQrImg(null);
    setActiveField('name');
    externalCacheRef.current = null;
    setHistoryRecordId(null);
    setStatus('Defaults applied');
    toast.info('Driving License editor reset to DEMO defaults');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isQr = activeField === 'qr';
  const isPhoto = activeField === 'photo';
  const activeLayout = isQr || isPhoto
    ? DL_DEFAULT_LAYOUTS.name
    : (present.layouts[activeField] ?? DL_DEFAULT_LAYOUTS[activeField]);

  const setLayout = useCallback(
    <K extends keyof DlLayout>(key: K, value: DlLayout[K]) => {
      const field = activeFieldRef.current;
      if (field === 'photo' || field === 'qr' || !isDlFieldKey(field)) return;
      const base = presentRef.current.layouts[field] ?? DL_DEFAULT_LAYOUTS[field];
      setField('layouts', {
        ...presentRef.current.layouts,
        [field]: { ...base, [key]: value },
      });
    },
    [setField],
  );

  const setPhoto = useCallback(
    (patch: Partial<Pick<DrivingLicenseSnapshot, 'photoX' | 'photoY' | 'photoW' | 'photoH' | 'photoDataUrl'>>) => {
      setSnapshot((prev) => ({
        ...prev,
        photoX: patch.photoX ?? prev.photoX,
        photoY: patch.photoY ?? prev.photoY,
        photoW: patch.photoW ?? prev.photoW,
        photoH: patch.photoH ?? prev.photoH,
        photoDataUrl: patch.photoDataUrl === undefined ? prev.photoDataUrl : patch.photoDataUrl,
      }));
    },
    [setSnapshot],
  );

  const patchQr = useCallback(
    (patch: { x?: number; y?: number; size?: number }) => {
      setSnapshot((prev) => ({
        ...prev,
        qrX: patch.x ?? prev.qrX,
        qrY: patch.y ?? prev.qrY,
        qrSize: patch.size ?? prev.qrSize,
      }));
    },
    [setSnapshot],
  );

  const setIdentityField = useCallback(
    (key: DlFieldKey, value: string) => {
      setField(key, value);
    },
    [setField],
  );

  const moveField = useCallback(
    (dx: number, dy: number) => {
      const field = activeFieldRef.current;
      if (field === 'photo') {
        const snap = presentRef.current;
        setPhoto({
          photoX: clamp(snap.photoX + dx * moveStep, 0, DL_DOC_WIDTH),
          photoY: clamp(snap.photoY + dy * moveStep, 0, DL_DOC_HEIGHT),
        });
        return;
      }
      if (field === 'qr') {
        const box = dlQrBox(presentRef.current);
        patchQr({
          x: clamp(box.x + dx * moveStep, 0, DL_DOC_WIDTH),
          y: clamp(box.y + dy * moveStep, 0, DL_DOC_HEIGHT),
        });
        return;
      }
      const base = presentRef.current.layouts[field] ?? DL_DEFAULT_LAYOUTS[field];
      setField('layouts', {
        ...presentRef.current.layouts,
        [field]: {
          ...base,
          x: clamp(base.x + dx * moveStep, 0, DL_DOC_WIDTH),
          y: clamp(base.y + dy * moveStep, 0, DL_DOC_HEIGHT),
        },
      });
    },
    [setField, setPhoto, patchQr, moveStep],
  );

  const bumpFont = useCallback(
    (delta: number) => {
      const field = activeFieldRef.current;
      if (field === 'photo' || field === 'qr' || !isDlFieldKey(field)) return;
      const base = presentRef.current.layouts[field] ?? DL_DEFAULT_LAYOUTS[field];
      setLayout(
        'fontSize',
        clamp(base.fontSize + delta, DL_LAYOUT_RANGES.fontSize.min, DL_LAYOUT_RANGES.fontSize.max),
      );
    },
    [setLayout],
  );

  const bumpQrSize = useCallback(
    (delta: number) => {
      const box = dlQrBox(presentRef.current);
      patchQr({ size: clamp(box.w + delta, DL_QR_RANGES.size.min, DL_QR_RANGES.size.max) });
    },
    [patchQr],
  );

  const bumpPhotoSize = useCallback(
    (delta: number) => {
      const snap = presentRef.current;
      const nextW = clamp(snap.photoW + delta, DL_PHOTO_RANGES.w.min, DL_PHOTO_RANGES.w.max);
      const ratio = snap.photoW > 0 ? snap.photoH / snap.photoW : 1;
      const nextH = clamp(Math.round(nextW * ratio), DL_PHOTO_RANGES.h.min, DL_PHOTO_RANGES.h.max);
      setPhoto({ photoW: nextW, photoH: nextH });
    },
    [setPhoto],
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
    const snap = normalizeDrivingLicenseSnapshot(presentRef.current);
    const recordId = historyRecordId ?? (snap.refNo.trim() ? `DL-${snap.refNo.trim()}` : newRecordId('driving-license'));
    const res = await commitDocument({
      docKind: 'driving-license',
      recordId,
      title: snap.name.trim() ? `DL ${snap.name.trim()}` : 'Driving License DEMO',
      subtitle: snap.refNo.trim() || undefined,
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
      action: 'history.save.driving-license',
      detail: `DL ${snap.refNo || res.recordId}`,
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
    renderDrivingLicense(canvas, presentRef.current, bgImgRef.current, 1, undefined, photoImageRef.current, qrImgRef.current);
    const link = document.createElement('a');
    const id = presentRef.current.refNo || 'demo';
    link.download = `DL-${id}-DEMO.jpg`;
    link.href = canvas.toDataURL('image/jpeg', 0.96);
    link.click();
    void logActivity({
      user_id: user?.id,
      email: user?.email,
      action: 'export.driving-license.jpg',
      detail: `DL ${id} (DEMO)`,
    });
    const savedId = await persistToHistory();
    toast.success(savedId ? 'JPG downloaded (DEMO) · secured in History' : 'JPG downloaded (DEMO)');
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
    renderDrivingLicense(canvas, presentRef.current, bgImgRef.current, 1, undefined, photoImageRef.current, qrImgRef.current);
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [DL_DOC_WIDTH, DL_DOC_HEIGHT] });
    const pW = pdf.internal.pageSize.getWidth();
    const pH = pdf.internal.pageSize.getHeight();
    pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, pW, pH);
    const id = presentRef.current.refNo || 'demo';
    pdf.save(`DL-${id}-DEMO.pdf`);
    void logActivity({
      user_id: user?.id,
      email: user?.email,
      action: 'export.driving-license.pdf',
      detail: `DL ${id} (DEMO)`,
    });
    const savedId = await persistToHistory();
    toast.success(savedId ? 'PDF downloaded (DEMO) · secured in History' : 'PDF downloaded (DEMO)');
  }, [user, toast, persistToHistory]);

  const preview = useCallback(async () => {
    const canvas = document.createElement('canvas');
    renderDrivingLicense(canvas, presentRef.current, bgImgRef.current, 1, undefined, photoImageRef.current, qrImgRef.current);
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
    const snap = normalizeDrivingLicenseSnapshot(present);
    const res = await saveProject({
      name: snap.refNo.trim() ? `DL ${snap.refNo.trim()} (DEMO)` : 'Driving License DEMO',
      kind: 'driving-license',
      state: { ...snap, docKind: 'driving-license' } as unknown as Record<string, unknown>,
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
      detail: `DL ${snap.refNo || 'DEMO'}`,
    });
    await persistToHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present, user, toast, persistToHistory]);

  const handlePhotoUpload = useCallback(
    async (file: File) => {
      const invalid = await validateImageFile(file);
      if (invalid) {
        toast.error(invalid);
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = String(e.target?.result);
        const img = new Image();
        img.onload = () => {
          setPhotoImage(img);
          setPhotoName(file.name);
          setPhoto({ photoDataUrl: dataUrl });
          setActiveField('photo');
          toast.success('Photo loaded');
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    },
    [toast, setPhoto],
  );

  useEffect(() => {
    const dataUrl = present.photoDataUrl;
    if (!dataUrl) {
      if (photoImageRef.current) setPhotoImage(null);
      return;
    }
    if (photoImageRef.current?.src === dataUrl) return;
    let cancelled = false;
    loadDataUrlImage(dataUrl).then((img) => {
      if (cancelled) return;
      if (img) setPhotoImage(img);
      else if (photoImageRef.current?.src !== dataUrl) setPhotoImage(null);
    });
    return () => {
      cancelled = true;
    };
  }, [present.photoDataUrl]);

  const canvasToDoc = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * DL_DOC_WIDTH,
      y: ((clientY - rect.top) / rect.height) * DL_DOC_HEIGHT,
    };
  }, []);

  const hitPhoto = useCallback((x: number, y: number): boolean => {
    const snap = presentRef.current;
    return (
      x >= snap.photoX &&
      x <= snap.photoX + snap.photoW &&
      y >= snap.photoY &&
      y <= snap.photoY + snap.photoH
    );
  }, []);

  const hitField = useCallback((x: number, y: number): DlOverlayKey | null => {
    const snap = presentRef.current;
    const qr = dlQrBox(snap);
    if (x >= qr.x && x <= qr.x + qr.w && y >= qr.y && y <= qr.y + qr.h) return 'qr';
    let best: { key: DlFieldKey; dist: number } | null = null;
    for (const field of DL_FIELDS) {
      const layout = snap.layouts[field.key] ?? DL_DEFAULT_LAYOUTS[field.key];
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
    if (best) return best.key;
    if (hitPhoto(x, y)) return 'photo';
    return null;
  }, [hitPhoto]);

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
      if (field === 'photo') {
        dragRef.current = {
          field: 'photo',
          startX: pos.x,
          startY: pos.y,
          origX: presentRef.current.photoX,
          origY: presentRef.current.photoY,
        };
      } else if (field === 'qr') {
        const box = dlQrBox(presentRef.current);
        dragRef.current = {
          field: 'qr',
          startX: pos.x,
          startY: pos.y,
          origX: box.x,
          origY: box.y,
        };
      } else {
        const base = presentRef.current.layouts[field] ?? DL_DEFAULT_LAYOUTS[field];
        dragRef.current = {
          field,
          startX: pos.x,
          startY: pos.y,
          origX: base.x,
          origY: base.y,
        };
      }
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
      if (drag.field === 'photo') {
        setPhoto({
          photoX: clamp(Math.round(drag.origX + dx), 0, DL_DOC_WIDTH),
          photoY: clamp(Math.round(drag.origY + dy), 0, DL_DOC_HEIGHT),
        });
        return;
      }
      if (drag.field === 'qr') {
        patchQr({
          x: clamp(Math.round(drag.origX + dx), 0, DL_DOC_WIDTH),
          y: clamp(Math.round(drag.origY + dy), 0, DL_DOC_HEIGHT),
        });
        return;
      }
      const base = presentRef.current.layouts[drag.field] ?? DL_DEFAULT_LAYOUTS[drag.field];
      setField('layouts', {
        ...presentRef.current.layouts,
        [drag.field]: {
          ...base,
          x: clamp(Math.round(drag.origX + dx), 0, DL_DOC_WIDTH),
          y: clamp(Math.round(drag.origY + dy), 0, DL_DOC_HEIGHT),
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
  }, [editor.rendered, canvasToDoc, hitField, setField, setPhoto, patchQr]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.style.cursor = dragging ? 'grabbing' : 'grab';
  }, [dragging, editor.rendered]);

  const activeMeta = useMemo(() => {
    if (activeField === 'photo') return { key: 'photo' as const, label: 'Photo' };
    if (activeField === 'qr') return { key: 'qr' as const, label: 'QR Code' };
    return DL_FIELDS.find((f) => f.key === activeField);
  }, [activeField]);

  const fieldOptions = [
    ...DL_FIELDS.map((f) => ({ value: f.key, label: f.label })),
    { value: 'photo', label: 'Photo' },
    { value: 'qr', label: 'QR Code' },
  ];

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
          placeholderTitle="Fill DEMO fields — overlay renders live on the uploaded license template"
          placeholderSub="3264 × 1998 px · Arial / Arial Bold · drag fields on the card · DEMO / SAMPLE"
          fullscreen={editor.fullscreen}
          onToggleFullscreen={editor.toggleFullscreen}
          kindLabel="Driving License DEMO"
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
        title="Driving License Inspector"
        subtitle="DEMO · 3264×1998 · uploaded template"
        open={editor.inspectorOpen}
        onToggle={editor.toggleInspector}
        sheetBodyClassName="max-h-[58vh] min-h-[38vh]"
        footer={
          <div className="flex flex-col gap-2 p-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void handlePhotoUpload(file);
              }}
            />
            <Button variant="outline" icon={<Camera className="h-4 w-4" />} onClick={() => fileInputRef.current?.click()}>
              {photoName ? `Replace: ${photoName}` : 'Upload Photo'}
            </Button>
            <div className="flex items-start gap-2 rounded-xl border border-danger/25 bg-danger/5 px-3 py-2.5">
              <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-danger" />
              <p className="text-[10.5px] font-medium leading-relaxed text-danger">
                {DL_DEMO_NOTE}. Fictional TEST data only.
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
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-danger">DEMO · Driving License Editor</p>
          <p className="mt-1 text-xs text-muted">
            The uploaded template is preserved. Edit fields independently, switch Arial Regular / Bold, resize, and drag. Settings restore from History.
          </p>
        </div>

        <CollapsibleSection title="License Fields" icon={<Type className="h-3.5 w-3.5" />}>
          {DL_FIELDS.map((f) => (
            <PropertyInput
              key={f.key}
              label={f.label}
              value={present[f.key]}
              onChange={(v) => {
                setActiveField(f.key);
                setIdentityField(f.key, v);
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
              onChange={(e) => setActiveField(e.target.value as DlOverlayKey)}
              options={fieldOptions}
            />

            {isQr && (
              <p className="rounded-xl border border-line bg-surface-raised px-3 py-2 text-[10.5px] leading-relaxed text-muted">
                The QR auto-generates from Name, Date of Birth, Blood Group, Father / Husband, Issue / Renewal, Validity, Reference Number, and Issuing Authority. Scanning shows those profile fields only — no DEMO warning text.
              </p>
            )}

            {!isPhoto && !isQr && (
              <>
                <PropertyInput
                  label="Text"
                  value={present[activeField]}
                  onChange={(v) => setIdentityField(activeField, v)}
                />

                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] text-muted">Font</span>
                  <div className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface-raised p-1">
                    {DL_FONT_OPTIONS.map((opt) => (
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

                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] text-muted">Bold</span>
                  <div className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface-raised p-1">
                    <button
                      type="button"
                      onClick={() => setLayout('fontFamily', 'arial')}
                      className={cn(
                        'rounded-lg px-1 py-1.5 text-[10.5px] font-semibold transition',
                        activeLayout.fontFamily === 'arial'
                          ? 'bg-info/15 text-info shadow-sm'
                          : 'text-muted hover:text-primary',
                      )}
                    >
                      Off
                    </button>
                    <button
                      type="button"
                      onClick={() => setLayout('fontFamily', 'arial-bold')}
                      className={cn(
                        'rounded-lg px-1 py-1.5 text-[10.5px] font-semibold transition',
                        activeLayout.fontFamily === 'arial-bold'
                          ? 'bg-info/15 text-info shadow-sm'
                          : 'text-muted hover:text-primary',
                      )}
                    >
                      On
                    </button>
                  </div>
                </div>
              </>
            )}

            <div className="flex flex-col gap-3 rounded-xl border border-info/20 bg-info/5 p-3">
              <span className="text-[10px] font-bold uppercase tracking-wide text-info">Position &amp; Size</span>

              {isQr ? (
                <>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => bumpQrSize(-10)} aria-label="Decrease QR size">
                      -
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => bumpQrSize(10)} aria-label="Increase QR size">
                      +
                    </Button>
                    <span className="ml-auto font-mono text-[11px] text-dimm">{present.qrSize}×{present.qrSize}</span>
                  </div>
                  <PropertySlider
                    label="Size"
                    value={present.qrSize}
                    min={DL_QR_RANGES.size.min}
                    max={DL_QR_RANGES.size.max}
                    step={DL_QR_RANGES.size.step}
                    mono
                    onChange={(v) => patchQr({ size: v })}
                  />
                  <PropertySlider
                    label="X"
                    value={present.qrX}
                    min={DL_QR_RANGES.x.min}
                    max={DL_QR_RANGES.x.max}
                    step={DL_QR_RANGES.x.step}
                    mono
                    onChange={(v) => patchQr({ x: v })}
                  />
                  <PropertySlider
                    label="Y"
                    value={present.qrY}
                    min={DL_QR_RANGES.y.min}
                    max={DL_QR_RANGES.y.max}
                    step={DL_QR_RANGES.y.step}
                    mono
                    onChange={(v) => patchQr({ y: v })}
                  />
                </>
              ) : isPhoto ? (
                <>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => bumpPhotoSize(-10)} aria-label="Decrease photo size">
                      -
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => bumpPhotoSize(10)} aria-label="Increase photo size">
                      +
                    </Button>
                    <span className="ml-auto font-mono text-[11px] text-dimm">
                      {present.photoW}×{present.photoH}
                    </span>
                  </div>
                  <PropertySlider
                    label="Width"
                    value={present.photoW}
                    min={DL_PHOTO_RANGES.w.min}
                    max={DL_PHOTO_RANGES.w.max}
                    step={DL_PHOTO_RANGES.w.step}
                    mono
                    onChange={(v) => setPhoto({ photoW: v })}
                  />
                  <PropertySlider
                    label="Height"
                    value={present.photoH}
                    min={DL_PHOTO_RANGES.h.min}
                    max={DL_PHOTO_RANGES.h.max}
                    step={DL_PHOTO_RANGES.h.step}
                    mono
                    onChange={(v) => setPhoto({ photoH: v })}
                  />
                  <PropertySlider
                    label="X"
                    value={present.photoX}
                    min={DL_PHOTO_RANGES.x.min}
                    max={DL_PHOTO_RANGES.x.max}
                    step={DL_PHOTO_RANGES.x.step}
                    mono
                    onChange={(v) => setPhoto({ photoX: v })}
                  />
                  <PropertySlider
                    label="Y"
                    value={present.photoY}
                    min={DL_PHOTO_RANGES.y.min}
                    max={DL_PHOTO_RANGES.y.max}
                    step={DL_PHOTO_RANGES.y.step}
                    mono
                    onChange={(v) => setPhoto({ photoY: v })}
                  />
                </>
              ) : (
                <>
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
                    min={DL_LAYOUT_RANGES.fontSize.min}
                    max={DL_LAYOUT_RANGES.fontSize.max}
                    step={DL_LAYOUT_RANGES.fontSize.step}
                    mono
                    onChange={(v) => setLayout('fontSize', v)}
                  />
                  <PropertySlider
                    label="X"
                    value={activeLayout.x}
                    min={DL_LAYOUT_RANGES.x.min}
                    max={DL_LAYOUT_RANGES.x.max}
                    step={DL_LAYOUT_RANGES.x.step}
                    mono
                    onChange={(v) => setLayout('x', v)}
                  />
                  <PropertySlider
                    label="Y"
                    value={activeLayout.y}
                    min={DL_LAYOUT_RANGES.y.min}
                    max={DL_LAYOUT_RANGES.y.max}
                    step={DL_LAYOUT_RANGES.y.step}
                    mono
                    onChange={(v) => setLayout('y', v)}
                  />
                </>
              )}

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
              <img src={qrDataUrl} alt="DEMO QR preview" className="h-24 w-24 rounded-md bg-white" />
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
                Shows Name, DOB, Blood Group, Father / Husband, dates, Reference Number, and Issuing Authority as structured test attributes.
              </p>
            </div>
          </div>
          <pre className="mt-2 max-h-32 overflow-auto rounded-lg border border-line bg-surface-raised p-3 font-mono text-[10px] leading-relaxed text-muted">
            {qrPayload}
          </pre>
        </CollapsibleSection>
      </InspectorPanel>

      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Driving License Preview"
        meta={`${DL_DOC_WIDTH}×${DL_DOC_HEIGHT}px · DEMO / SAMPLE`}
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
          <img src={previewDataUrl} alt="Driving license preview" className="mx-auto max-h-[70vh] w-auto rounded-md shadow-deep" />
        ) : (
          <div className="py-20 text-center text-sm text-dimm">Rendering…</div>
        )}
      </Modal>
    </div>
  );
}
