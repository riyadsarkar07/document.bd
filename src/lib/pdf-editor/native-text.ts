import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
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

interface PdfJsOperatorList {
  fnArray: number[];
  argsArray: unknown[];
}

const OPS = {
  save: 10,
  restore: 11,
  setLeading: 36,
  moveText: 40,
  setTextMatrix: 42,
  setFillColor: 54,
  setFillGray: 57,
  setFillRGBColor: 59,
  setFillCMYKColor: 61,
  showText: 44,
  showSpacedText: 45,
  nextLineShowText: 46,
  nextLineSetSpacingShowText: 47,
  paintFormXObjectBegin: 74,
  paintFormXObjectEnd: 75,
} as const;

interface TextFillSample {
  x: number;
  y: number;
  color: string;
}

function isTextItem(item: unknown): item is PdfJsTextItem {
  return Boolean(item && typeof item === 'object' && 'str' in item && 'transform' in item);
}

function fontLooksBold(fontName: string, family: string): boolean {
  const sample = `${fontName} ${family}`.toLowerCase();
  return /bold|black|heavy|semibold|demibold/.test(sample);
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbToHex(r: number, g: number, b: number): string {
  const hex = [r, g, b].map((channel) => clampByte(channel * 255).toString(16).padStart(2, '0')).join('');
  return `#${hex}`;
}

function cmykToRgb(c: number, m: number, y: number, k: number): [number, number, number] {
  return [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)];
}

function asUnitColor(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n > 1 ? n / 255 : n;
}

function fillFromArgs(kind: 'rgb' | 'gray' | 'cmyk' | 'color', args: ArrayLike<unknown> | null): string | null {
  if (!args) return null;
  const length = args.length;
  if (kind === 'gray') return rgbToHex(asUnitColor(args[0]), asUnitColor(args[0]), asUnitColor(args[0]));
  if (kind === 'rgb' || (kind === 'color' && length >= 3 && length < 4)) {
    return rgbToHex(asUnitColor(args[0]), asUnitColor(args[1]), asUnitColor(args[2]));
  }
  if (kind === 'cmyk' || (kind === 'color' && length >= 4)) {
    const [r, g, b] = cmykToRgb(asUnitColor(args[0]), asUnitColor(args[1]), asUnitColor(args[2]), asUnitColor(args[3]));
    return rgbToHex(r, g, b);
  }
  if (kind === 'color' && length === 1) {
    const g = asUnitColor(args[0]);
    return rgbToHex(g, g, g);
  }
  return null;
}

function asArrayLike(value: unknown): ArrayLike<unknown> | null {
  if (value && typeof (value as { length?: unknown }).length === 'number') return value as ArrayLike<unknown>;
  return null;
}

/**
 * PDF.js hands back operator arguments as array-like objects, not real arrays, and many
 * producers emit one `showText` per glyph. Track the fill color and text matrix through the
 * operator stream so each glyph can be matched to the color that was actually in effect.
 */
async function extractTextFillSamples(pdfPage: PDFPageProxy): Promise<TextFillSample[]> {
  const ops = (await pdfPage.getOperatorList({ intent: 'display' })) as PdfJsOperatorList;
  const samples: TextFillSample[] = [];
  let fill = '#000000';
  const stack: string[] = [];
  let tm = [1, 0, 0, 1, 0, 0];
  let tlm = [1, 0, 0, 1, 0, 0];
  let leading = 0;
  for (let i = 0; i < ops.fnArray.length; i += 1) {
    const fn = ops.fnArray[i];
    const args = asArrayLike(ops.argsArray[i]);
    if (fn === OPS.save || fn === OPS.paintFormXObjectBegin) {
      stack.push(fill);
      continue;
    }
    if (fn === OPS.restore || fn === OPS.paintFormXObjectEnd) {
      fill = stack.pop() ?? fill;
      continue;
    }
    if (fn === OPS.setFillGray) {
      fill = fillFromArgs('gray', args) ?? fill;
      continue;
    }
    if (fn === OPS.setFillRGBColor) {
      fill = fillFromArgs('rgb', args) ?? fill;
      continue;
    }
    if (fn === OPS.setFillCMYKColor) {
      fill = fillFromArgs('cmyk', args) ?? fill;
      continue;
    }
    if (fn === OPS.setFillColor) {
      fill = fillFromArgs('color', args) ?? fill;
      continue;
    }
    if (fn === OPS.setTextMatrix && args && args.length >= 6) {
      tm = [Number(args[0]), Number(args[1]), Number(args[2]), Number(args[3]), Number(args[4]), Number(args[5])];
      tlm = tm.slice();
      continue;
    }
    if (fn === OPS.setLeading && args && args.length >= 1) {
      leading = Number(args[0]) || 0;
      continue;
    }
    if (fn === OPS.moveText && args && args.length >= 2) {
      const tx = Number(args[0]) || 0;
      const ty = Number(args[1]) || 0;
      tlm = [
        tlm[0],
        tlm[1],
        tlm[2],
        tlm[3],
        tlm[4] + tx * tlm[0] + ty * tlm[2],
        tlm[5] + tx * tlm[1] + ty * tlm[3],
      ];
      tm = tlm.slice();
      continue;
    }
    if (fn === OPS.nextLineShowText || fn === OPS.nextLineSetSpacingShowText) {
      tlm = [tlm[0], tlm[1], tlm[2], tlm[3], tlm[4] - leading * tlm[2], tlm[5] - leading * tlm[3]];
      tm = tlm.slice();
      samples.push({ x: tm[4], y: tm[5], color: fill });
      continue;
    }
    if (fn === OPS.showText || fn === OPS.showSpacedText) {
      samples.push({ x: tm[4], y: tm[5], color: fill });
    }
  }
  return samples;
}

function nearestFillColor(samples: TextFillSample[], x: number, y: number, tolerance: number): string | null {
  let best: TextFillSample | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const sample of samples) {
    const distance = Math.hypot(sample.x - x, sample.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = sample;
    }
  }
  if (best && bestDistance <= tolerance) return best.color;
  return null;
}

function glyphFontHeight(item: PdfJsTextItem): number {
  const m = item.transform;
  const matrixScale = Math.hypot(m[2] ?? 0, m[3] ?? 0) || Math.abs(m[3] ?? 0);
  const reported = item.height || 0;
  if (reported > 1.5) return reported;
  if (matrixScale > 1.5) return matrixScale;
  return Math.max(reported, matrixScale, 1);
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
  const fillSamples = await extractTextFillSamples(pdfPage).catch(() => [] as TextFillSample[]);

  const runs: NativeTextRun[] = [];
  for (const raw of content.items) {
    if (!isTextItem(raw)) continue;
    const text = raw.str.replace(/\s+$/g, '');
    if (!text.trim()) continue;
    const m = raw.transform as number[];
    const vp = viewport.transform;
    const tx = [
      vp[0] * m[0] + vp[2] * m[1],
      vp[1] * m[0] + vp[3] * m[1],
      vp[0] * m[2] + vp[2] * m[3],
      vp[1] * m[2] + vp[3] * m[3],
      vp[0] * m[4] + vp[2] * m[5] + vp[4],
      vp[1] * m[4] + vp[3] * m[5] + vp[5],
    ];
    const fontHeight = Math.hypot(tx[2], tx[3]) || glyphFontHeight(raw);
    const advance = raw.width && raw.width > 0.5 ? raw.width : Math.hypot(tx[0], tx[1]) || fontHeight * Math.max(1, text.length * 0.45);
    const angle = Math.atan2(tx[1], tx[0]);
    const x = angle === 0 ? tx[4] : tx[4] + fontHeight * Math.sin(angle);
    const y = angle === 0 ? tx[5] - fontHeight : tx[5] - fontHeight * Math.cos(angle);
    const boxW = Math.max(advance, 0.5);
    const boxH = Math.max(fontHeight, raw.height && raw.height > 1.5 ? raw.height : 0, 0.5);
    const style = styles[raw.fontName];
    const family = style?.fontFamily || 'Helvetica, Arial, sans-serif';
    const color =
      nearestFillColor(fillSamples, m[4], m[5], Math.max(1, fontHeight) * 0.75) || '#111827';
    runs.push({
      id: createPdfId('ntext'),
      text,
      x: x / visualW,
      y: y / visualH,
      width: boxW / visualW,
      height: boxH / visualH,
      fontSize: fontHeight / visualH,
      fontFamily: family,
      bold: fontLooksBold(raw.fontName, family),
      color,
    });
  }
  return mergeNearbyRuns(runs);
}

function sameStyle(a: NativeTextRun, b: NativeTextRun): boolean {
  return a.bold === b.bold && a.color === b.color && Math.abs(a.fontSize - b.fontSize) < a.fontSize * 0.12;
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
    const sameLine = Math.abs(prev.y - run.y) <= Math.max(prev.fontSize, run.fontSize) * 0.28;
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
