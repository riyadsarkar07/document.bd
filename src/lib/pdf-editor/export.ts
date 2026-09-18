import { BlendMode, LineCapStyle, PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { asRotation, visualPageSize } from '@/lib/pdf-editor/geometry';
import type { PdfAnnotation, PdfEditorDocument, PdfPageMeta, PdfRotation } from '@/lib/pdf-editor/types';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const raw = hex.replace('#', '').trim();
  const normalized =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw.padEnd(6, '0').slice(0, 6);
  const n = Number.parseInt(normalized, 16);
  if (Number.isNaN(n)) return { r: 0, g: 0, b: 0 };
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
  };
}

function toPdfColor(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return rgb(r, g, b);
}

function winAnsi(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code === 10 || code === 13 || code === 9 || (code >= 32 && code <= 126)) out += text[i];
    else out += '?';
  }
  return out;
}

function parseDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return { mime: match[1], bytes };
}

function pagePt(page: PdfPageMeta) {
  return visualPageSize(page.widthPt, page.heightPt, page.rotation);
}

function sourceCropBox(srcPage: PDFPage) {
  const media = srcPage.getMediaBox();
  const crop = srcPage.getCropBox();
  const left = Math.max(media.x, crop.x);
  const bottom = Math.max(media.y, crop.y);
  const right = Math.min(media.x + media.width, crop.x + crop.width);
  const top = Math.min(media.y + media.height, crop.y + crop.height);
  return {
    left,
    bottom,
    right: right > left ? right : left + Math.max(1, media.width),
    top: top > bottom ? top : bottom + Math.max(1, media.height),
  };
}

function nx(page: PdfPageMeta, x: number): number {
  return x * pagePt(page).width;
}

function nyTop(page: PdfPageMeta, y: number): number {
  return pagePt(page).height - y * pagePt(page).height;
}

function strokePx(page: PdfPageMeta, fraction: number): number {
  const { width, height } = pagePt(page);
  return Math.max(0.4, fraction * Math.min(width, height));
}

async function embedImage(doc: PDFDocument, dataUrl: string) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;
  if (parsed.mime.includes('png')) return doc.embedPng(parsed.bytes);
  if (parsed.mime.includes('jpeg') || parsed.mime.includes('jpg')) return doc.embedJpg(parsed.bytes);
  try {
    return await doc.embedPng(parsed.bytes);
  } catch {
    try {
      return await doc.embedJpg(parsed.bytes);
    } catch {
      return null;
    }
  }
}

function drawPageContent(
  outPage: PDFPage,
  embedded: Awaited<ReturnType<PDFDocument['embedPage']>>,
  rotation: PdfRotation,
) {
  const srcW = embedded.width;
  const srcH = embedded.height;
  if (rotation === 90) {
    outPage.drawPage(embedded, { x: 0, y: srcW, rotate: degrees(270) });
    return;
  }
  if (rotation === 180) {
    outPage.drawPage(embedded, { x: srcW, y: srcH, rotate: degrees(180) });
    return;
  }
  if (rotation === 270) {
    outPage.drawPage(embedded, { x: srcH, y: 0, rotate: degrees(90) });
    return;
  }
  outPage.drawPage(embedded, { x: 0, y: 0 });
}

async function drawAnnotation(
  out: PDFDocument,
  outPage: PDFPage,
  page: PdfPageMeta,
  annotation: PdfAnnotation,
  fonts: { regular: PDFFont; bold: PDFFont },
) {
  const { width, height } = pagePt(page);
  const minSide = Math.min(width, height);

  if (annotation.type === 'text') {
    const font = annotation.bold ? fonts.bold : fonts.regular;
    const size = Math.max(4, annotation.fontSize * height);
    const boxX = nx(page, annotation.x);
    const boxW = Math.max(1, annotation.width * width);
    const boxH = Math.max(1, annotation.height * height);
    const boxY = nyTop(page, annotation.y + annotation.height);
    if (annotation.coverOriginal) {
      const padX = Math.max(0.15, size * 0.02);
      outPage.drawRectangle({
        x: boxX - padX,
        y: boxY + boxH - size,
        width: boxW + padX * 2,
        height: size,
        color: rgb(1, 1, 1),
      });
    }
    const lines = winAnsi(annotation.text || '').split('\n');
    const lineHeight = size * 1.15;
    const wrapToBox = annotation.source !== 'native';
    lines.forEach((line, index) => {
      const widthOf = font.widthOfTextAtSize(line || ' ', size);
      let x = boxX;
      if (annotation.align === 'center') x = boxX + Math.max(0, (boxW - widthOf) / 2);
      if (annotation.align === 'right') x = boxX + Math.max(0, boxW - widthOf);
      outPage.drawText(line || ' ', {
        x,
        y: boxY + boxH - size - index * lineHeight,
        size,
        font,
        color: toPdfColor(annotation.color),
        ...(wrapToBox ? { maxWidth: boxW } : {}),
      });
    });
    return;
  }

  if (annotation.type === 'highlight') {
    outPage.drawRectangle({
      x: nx(page, annotation.x),
      y: nyTop(page, annotation.y + annotation.height),
      width: annotation.width * width,
      height: annotation.height * height,
      color: toPdfColor(annotation.color),
      opacity: annotation.opacity,
      blendMode: BlendMode.Multiply,
    });
    return;
  }

  if (annotation.type === 'whiteout') {
    outPage.drawRectangle({
      x: nx(page, annotation.x),
      y: nyTop(page, annotation.y + annotation.height),
      width: annotation.width * width,
      height: annotation.height * height,
      color: rgb(1, 1, 1),
    });
    return;
  }

  if (annotation.type === 'pen') {
    const pts = annotation.points;
    if (pts.length < 2) return;
    const sw = strokePx(page, annotation.strokeWidth);
    for (let i = 1; i < pts.length; i += 1) {
      outPage.drawLine({
        start: { x: nx(page, pts[i - 1].x), y: nyTop(page, pts[i - 1].y) },
        end: { x: nx(page, pts[i].x), y: nyTop(page, pts[i].y) },
        thickness: sw,
        color: toPdfColor(annotation.color),
        lineCap: LineCapStyle.Round,
      });
    }
    return;
  }

  if (annotation.type === 'image' || annotation.type === 'signature') {
    const image = await embedImage(out, annotation.dataUrl);
    if (!image) return;
    outPage.drawImage(image, {
      x: nx(page, annotation.x),
      y: nyTop(page, annotation.y + annotation.height),
      width: annotation.width * width,
      height: annotation.height * height,
    });
    return;
  }

  if (annotation.type === 'shape') {
    const sw = Math.max(0.6, annotation.strokeWidth * minSide);
    const x = nx(page, annotation.x);
    const y = nyTop(page, annotation.y + annotation.height);
    const w = annotation.width * width;
    const h = annotation.height * height;
    const stroke = toPdfColor(annotation.stroke);
    const fill = annotation.fill ? toPdfColor(annotation.fill) : undefined;

    if (annotation.shape === 'line') {
      outPage.drawLine({
        start: { x: nx(page, annotation.x), y: nyTop(page, annotation.y) },
        end: { x: nx(page, annotation.x + annotation.width), y: nyTop(page, annotation.y + annotation.height) },
        thickness: sw,
        color: stroke,
        lineCap: LineCapStyle.Round,
      });
      return;
    }

    if (annotation.shape === 'rect') {
      outPage.drawRectangle({
        x,
        y,
        width: w,
        height: h,
        borderColor: stroke,
        borderWidth: sw,
        color: fill,
        opacity: fill ? 0.18 : undefined,
      });
      return;
    }

    outPage.drawEllipse({
      x: x + w / 2,
      y: y + h / 2,
      xScale: Math.abs(w) / 2,
      yScale: Math.abs(h) / 2,
      borderColor: stroke,
      borderWidth: sw,
      color: fill,
      opacity: fill ? 0.18 : undefined,
    });
  }
}

export async function exportEditedPdf(sourceBytes: Uint8Array, documentState: PdfEditorDocument): Promise<Uint8Array> {
  const source = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const regular = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);

  for (const pageMeta of documentState.pages) {
    if (pageMeta.sourceIndex < 0 || pageMeta.sourceIndex >= source.getPageCount()) continue;
    const srcPage = source.getPage(pageMeta.sourceIndex);
    const embedded = await out.embedPage(srcPage, sourceCropBox(srcPage));
    const totalRotation = asRotation(asRotation(srcPage.getRotation().angle) + pageMeta.rotation);
    const size = visualPageSize(embedded.width, embedded.height, totalRotation);
    const outPage = out.addPage([size.width, size.height]);
    drawPageContent(outPage, embedded, totalRotation);

    const exportPage: PdfPageMeta = {
      ...pageMeta,
      widthPt: size.width,
      heightPt: size.height,
      rotation: 0,
      sourceRotate: 0,
    };
    const annotations = documentState.annotations.filter((a) => a.pageId === pageMeta.id);
    for (const annotation of annotations) {
      await drawAnnotation(out, outPage, exportPage, annotation, { regular, bold });
    }
  }

  out.setTitle(documentState.fileName.replace(/\.pdf$/i, '') || 'Edited PDF');
  out.setProducer('Document Studio PDF Editor');
  return out.save({ useObjectStreams: true });
}

export function downloadPdfBytes(bytes: Uint8Array, fileName: string): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const base = fileName.replace(/\.pdf$/i, '') || 'document';
  a.href = url;
  a.download = `${base}-edited.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
