import { annotationIntersectsBox, hitTestAnnotation, moveAnnotation, normalizeBox, rotateAnnotation } from '@/lib/pdf-editor/geometry';
import { createPdfId } from '@/lib/pdf-editor/ids';
import type {
  PdfAnnotation,
  PdfEditorDocument,
  PdfPageMeta,
  PdfPoint,
  PdfRotation,
  PdfTool,
} from '@/lib/pdf-editor/types';

export function annotationsForPage(doc: PdfEditorDocument, pageId: string): PdfAnnotation[] {
  return doc.annotations.filter((a) => a.pageId === pageId);
}

export function findAnnotationAt(doc: PdfEditorDocument, pageId: string, point: PdfPoint): PdfAnnotation | null {
  const items = annotationsForPage(doc, pageId);
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (hitTestAnnotation(items[i], point)) return items[i];
  }
  return null;
}

export function addAnnotation(doc: PdfEditorDocument, annotation: PdfAnnotation): PdfEditorDocument {
  return { ...doc, annotations: [...doc.annotations, annotation] };
}

export function updateAnnotation(
  doc: PdfEditorDocument,
  id: string,
  patch: Partial<PdfAnnotation> | ((prev: PdfAnnotation) => PdfAnnotation),
): PdfEditorDocument {
  return {
    ...doc,
    annotations: doc.annotations.map((item) => {
      if (item.id !== id) return item;
      return typeof patch === 'function' ? patch(item) : ({ ...item, ...patch } as PdfAnnotation);
    }),
  };
}

export function removeAnnotation(doc: PdfEditorDocument, id: string): PdfEditorDocument {
  return { ...doc, annotations: doc.annotations.filter((a) => a.id !== id) };
}

export function eraseInBox(doc: PdfEditorDocument, pageId: string, box: ReturnType<typeof normalizeBox>): PdfEditorDocument {
  const area = normalizeBox(box);
  if (area.width < 0.004 || area.height < 0.004) return doc;
  return {
    ...doc,
    annotations: doc.annotations.filter((a) => a.pageId !== pageId || !annotationIntersectsBox(a, area)),
  };
}

export function translateAnnotation(doc: PdfEditorDocument, id: string, dx: number, dy: number): PdfEditorDocument {
  return updateAnnotation(doc, id, (prev) => moveAnnotation(prev, dx, dy));
}

export function rotatePage(doc: PdfEditorDocument, pageId: string, delta: 90 | -90): PdfEditorDocument {
  return {
    ...doc,
    pages: doc.pages.map((page) => {
      if (page.id !== pageId) return page;
      const next = (((page.rotation + delta + 360) % 360) as PdfRotation);
      return { ...page, rotation: next };
    }),
    annotations: doc.annotations.map((annotation) => {
      if (annotation.pageId !== pageId) return annotation;
      const rot = (delta === 90 ? 90 : 270) as PdfRotation;
      return rotateAnnotation(annotation, rot);
    }),
  };
}

export function deletePage(doc: PdfEditorDocument, pageId: string): PdfEditorDocument {
  return {
    ...doc,
    pages: doc.pages.filter((p) => p.id !== pageId),
    annotations: doc.annotations.filter((a) => a.pageId !== pageId),
  };
}

export function movePage(doc: PdfEditorDocument, pageId: string, direction: -1 | 1): PdfEditorDocument {
  const index = doc.pages.findIndex((p) => p.id === pageId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= doc.pages.length) return doc;
  const pages = [...doc.pages];
  const [item] = pages.splice(index, 1);
  pages.splice(nextIndex, 0, item);
  return { ...doc, pages };
}

export function makeDraft(
  tool: PdfTool,
  page: PdfPageMeta,
  start: PdfPoint,
  extra?: { imageDataUrl?: string; signatureDataUrl?: string },
): PdfAnnotation | null {
  const id = createPdfId(tool);
  if (tool === 'select') return null;
  if (tool === 'text') {
    return {
      id,
      pageId: page.id,
      type: 'text',
      x: start.x,
      y: start.y,
      width: 0.28,
      height: 0.05,
      text: 'Text',
      fontSize: 0.028,
      color: '#111827',
      bold: false,
    };
  }
  if (tool === 'highlight') {
    return {
      id,
      pageId: page.id,
      type: 'highlight',
      x: start.x,
      y: start.y,
      width: 0,
      height: 0,
      color: '#facc15',
      opacity: 0.38,
    };
  }
  if (tool === 'whiteout') {
    return {
      id,
      pageId: page.id,
      type: 'whiteout',
      x: start.x,
      y: start.y,
      width: 0,
      height: 0,
    };
  }
  if (tool === 'pen') {
    return {
      id,
      pageId: page.id,
      type: 'pen',
      points: [start],
      color: '#111827',
      strokeWidth: 0.004,
    };
  }
  if (tool === 'image' && extra?.imageDataUrl) {
    return {
      id,
      pageId: page.id,
      type: 'image',
      x: start.x,
      y: start.y,
      width: 0.28,
      height: 0.18,
      dataUrl: extra.imageDataUrl,
    };
  }
  if (tool === 'signature' && extra?.signatureDataUrl) {
    return {
      id,
      pageId: page.id,
      type: 'signature',
      x: start.x,
      y: start.y,
      width: 0.28,
      height: 0.1,
      dataUrl: extra.signatureDataUrl,
    };
  }
  if (tool === 'rect' || tool === 'ellipse' || tool === 'line') {
    return {
      id,
      pageId: page.id,
      type: 'shape',
      shape: tool,
      x: start.x,
      y: start.y,
      width: 0,
      height: 0,
      stroke: '#d4af5a',
      strokeWidth: 0.004,
      fill: null,
    };
  }
  return null;
}

export function resizeDraft(draft: PdfAnnotation, start: PdfPoint, current: PdfPoint): PdfAnnotation {
  if (draft.type === 'pen') {
    const last = draft.points[draft.points.length - 1];
    if (last && last.x === current.x && last.y === current.y) return draft;
    return { ...draft, points: [...draft.points, current] };
  }
  if (draft.type === 'text' || draft.type === 'image' || draft.type === 'signature') {
    return draft;
  }
  return {
    ...draft,
    ...normalizeBox({
      x: start.x,
      y: start.y,
      width: current.x - start.x,
      height: current.y - start.y,
    }),
  };
}

export function isMeaningfulDraft(draft: PdfAnnotation): boolean {
  if (draft.type === 'pen') return draft.points.length >= 2;
  if (draft.type === 'text' || draft.type === 'image' || draft.type === 'signature') return true;
  return Math.max(draft.width, draft.height) >= 0.008;
}
