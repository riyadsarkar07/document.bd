import type { PdfAnnotation, PdfBox, PdfPoint, PdfRotation } from '@/lib/pdf-editor/types';

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function normalizeBox(box: PdfBox): PdfBox {
  const x = box.width < 0 ? box.x + box.width : box.x;
  const y = box.height < 0 ? box.y + box.height : box.y;
  return {
    x: clamp01(x),
    y: clamp01(y),
    width: clamp01(Math.abs(box.width)),
    height: clamp01(Math.abs(box.height)),
  };
}

export function asRotation(value: number): PdfRotation {
  const n = ((value % 360) + 360) % 360;
  if (n === 90 || n === 180 || n === 270) return n;
  return 0;
}

export function visualPageSize(widthPt: number, heightPt: number, rotation: PdfRotation): {
  width: number;
  height: number;
} {
  if (rotation === 90 || rotation === 270) return { width: heightPt, height: widthPt };
  return { width: widthPt, height: heightPt };
}

export function pageTotalRotation(page: { rotation: PdfRotation; sourceRotate?: PdfRotation }): PdfRotation {
  return asRotation((page.sourceRotate ?? 0) + page.rotation);
}

export function pageVisualSize(page: { widthPt: number; heightPt: number; rotation: PdfRotation }) {
  return visualPageSize(page.widthPt, page.heightPt, page.rotation);
}

export function rotateNormalizedPoint(point: PdfPoint, rotation: PdfRotation): PdfPoint {
  switch (rotation) {
    case 90:
      return { x: 1 - point.y, y: point.x };
    case 180:
      return { x: 1 - point.x, y: 1 - point.y };
    case 270:
      return { x: point.y, y: 1 - point.x };
    default:
      return point;
  }
}

export function rotateBox(box: PdfBox, rotation: PdfRotation): PdfBox {
  if (rotation === 0) return box;
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x, y: box.y + box.height },
    { x: box.x + box.width, y: box.y + box.height },
  ].map((p) => rotateNormalizedPoint(p, rotation));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function rotateAnnotation(annotation: PdfAnnotation, rotation: PdfRotation): PdfAnnotation {
  if (rotation === 0) return annotation;
  if (annotation.type === 'pen') {
    return {
      ...annotation,
      points: annotation.points.map((p) => rotateNormalizedPoint(p, rotation)),
    };
  }
  const next = rotateBox(annotation, rotation);
  return { ...annotation, ...next };
}

export function hitTestAnnotation(annotation: PdfAnnotation, point: PdfPoint, threshold = 0.012): boolean {
  if (annotation.type === 'pen') {
    return annotation.points.some((p) => {
      const dx = p.x - point.x;
      const dy = p.y - point.y;
      return dx * dx + dy * dy <= threshold * threshold;
    });
  }
  if (annotation.type === 'shape' && annotation.shape === 'line') {
    return pointToSegmentDistance(point, annotation) <= threshold;
  }
  return (
    point.x >= annotation.x &&
    point.x <= annotation.x + annotation.width &&
    point.y >= annotation.y &&
    point.y <= annotation.y + annotation.height
  );
}

function pointToSegmentDistance(point: PdfPoint, box: PdfBox): number {
  const ax = box.x;
  const ay = box.y;
  const bx = box.x + box.width;
  const by = box.y + box.height;
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) {
    const dx = point.x - ax;
    const dy = point.y - ay;
    return Math.hypot(dx, dy);
  }
  const t = Math.max(0, Math.min(1, ((point.x - ax) * abx + (point.y - ay) * aby) / len2));
  return Math.hypot(point.x - (ax + t * abx), point.y - (ay + t * aby));
}

export function moveAnnotation(annotation: PdfAnnotation, dx: number, dy: number): PdfAnnotation {
  if (annotation.type === 'pen') {
    return {
      ...annotation,
      points: annotation.points.map((p) => ({ x: clamp01(p.x + dx), y: clamp01(p.y + dy) })),
    };
  }
  return {
    ...annotation,
    x: clamp01(annotation.x + dx),
    y: clamp01(annotation.y + dy),
  };
}

export function boxesIntersect(a: PdfBox, b: PdfBox): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function annotationIntersectsBox(annotation: PdfAnnotation, box: PdfBox): boolean {
  if (annotation.type === 'pen') {
    return annotation.points.some(
      (p) => p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height,
    );
  }
  return boxesIntersect(annotation, box);
}
