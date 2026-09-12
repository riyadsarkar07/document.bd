import type { PDFDocumentProxy } from 'pdfjs-dist';
import { asRotation } from '@/lib/pdf-editor/geometry';
import { createPdfId } from '@/lib/pdf-editor/ids';
import type { NativeTextRun, PdfBox, PdfPageMeta, PdfPoint } from '@/lib/pdf-editor/types';

interface PdfJsTextItem {
  str: string;
  transform: number[];
  width?: number;
  height?: number;
  fontName: string;
}

interface PdfJsTextStyle {
  fontFamily?: string;
}

function isTextItem(item: unknown): item is PdfJsTextItem {
  return Boolean(item && typeof item === 'object' && 'str' in item && 'transform' in item);
}

function fontLooksBold(fontName: string, family: string): boolean {
  const sample = `${fontName} ${family}`.toLowerCase();
  return /bold|black|heavy|semibold|demibold/.test(sample);
}

export async function extractNativeTextRuns(
  pdf: PDFDocumentProxy,
  page: PdfPageMeta,
): Promise<NativeTextRun[]> {
  const pdfPage = await pdf.getPage(page.sourceIndex + 1);
  const content = await pdfPage.getTextContent({ includeMarkedContent: false, disableNormalization: false });
  const styles = (content.styles ?? {}) as Record<string, PdfJsTextStyle>;
  const rotation = asRotation((pdfPage.rotate || 0) + page.rotation);
  const viewport = pdfPage.getViewport({ scale: 1, rotation });
  const visualW = Math.max(1, viewport.width);
  const visualH = Math.max(1, viewport.height);

  const runs: NativeTextRun[] = [];
  for (const raw of content.items) {
    if (!isTextItem(raw)) continue;
    const text = raw.str.replace(/\s+$/g, '');
    if (!text.trim()) continue;
    const m = raw.transform as number[];
    const a = m[0] ?? 0;
    const b = m[1] ?? 0;
    const c = m[2] ?? 0;
    const d = m[3] ?? 0;
    const e = m[4] ?? 0;
    const f = m[5] ?? 0;
    const fontHeight = Math.hypot(c, d) || Math.abs(d) || raw.height || 10;
    const fontWidth = Math.hypot(a, b) || raw.width || fontHeight;
    const width = raw.width || fontWidth * Math.max(1, text.length * 0.5);
    const height = raw.height || fontHeight;
    const corners = [
      viewport.convertToViewportPoint(e, f),
      viewport.convertToViewportPoint(e + width, f),
      viewport.convertToViewportPoint(e, f + height),
      viewport.convertToViewportPoint(e + width, f + height),
    ];
    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const boxW = Math.max(Math.max(...xs) - x, width * 0.35);
    const boxH = Math.max(Math.max(...ys) - y, height * 0.55);
    const style = styles[raw.fontName];
    const family = style?.fontFamily || 'Helvetica, Arial, sans-serif';
    runs.push({
      id: createPdfId('ntext'),
      text,
      x: x / visualW,
      y: y / visualH,
      width: boxW / visualW,
      height: boxH / visualH,
      fontSize: boxH / visualH,
      fontFamily: family,
      bold: fontLooksBold(raw.fontName, family),
    });
  }
  return mergeNearbyRuns(runs);
}

function sameStyle(a: NativeTextRun, b: NativeTextRun): boolean {
  return a.bold === b.bold && Math.abs(a.fontSize - b.fontSize) < a.fontSize * 0.12;
}

function mergeNearbyRuns(runs: NativeTextRun[]): NativeTextRun[] {
  if (runs.length < 2) return runs;
  const sorted = [...runs].sort((a, b) => a.y - b.y || a.x - b.x);
  const out: NativeTextRun[] = [];
  for (const run of sorted) {
    const prev = out[out.length - 1];
    if (!prev) {
      out.push({ ...run });
      continue;
    }
    const sameLine = Math.abs(prev.y - run.y) <= Math.max(prev.height, run.height) * 0.45;
    const gap = run.x - (prev.x + prev.width);
    const close = gap >= -0.004 && gap <= Math.max(prev.fontSize, run.fontSize) * 1.8;
    if (sameLine && close && sameStyle(prev, run)) {
      const right = Math.max(prev.x + prev.width, run.x + run.width);
      const bottom = Math.max(prev.y + prev.height, run.y + run.height);
      const space = gap > prev.fontSize * 0.18 ? ' ' : '';
      prev.text = `${prev.text}${space}${run.text}`;
      prev.width = right - prev.x;
      prev.height = bottom - prev.y;
      prev.fontSize = Math.max(prev.fontSize, run.fontSize);
      continue;
    }
    out.push({ ...run });
  }
  return out;
}

export function visibleNativeRuns(runs: NativeTextRun[], covered: PdfBox[]): NativeTextRun[] {
  return runs.filter((run) => !covered.some((box) => boxesCover(box, run)));
}

function boxesCover(a: PdfBox, b: PdfBox): boolean {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (x2 <= x1 || y2 <= y1) return false;
  const inter = (x2 - x1) * (y2 - y1);
  const area = b.width * b.height;
  return area > 0 && inter / area >= 0.55;
}

export function hitTestNativeRun(runs: NativeTextRun[], point: PdfPoint, pad = 0.004): NativeTextRun | null {
  let best: NativeTextRun | null = null;
  let bestArea = Number.POSITIVE_INFINITY;
  for (const run of runs) {
    if (
      point.x >= run.x - pad &&
      point.x <= run.x + run.width + pad &&
      point.y >= run.y - pad &&
      point.y <= run.y + run.height + pad
    ) {
      const area = run.width * run.height;
      if (area < bestArea) {
        best = run;
        bestArea = area;
      }
    }
  }
  return best;
}
