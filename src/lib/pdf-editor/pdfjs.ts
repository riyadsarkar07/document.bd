'use client';

import { asRotation } from '@/lib/pdf-editor/geometry';
import { createPdfId } from '@/lib/pdf-editor/ids';
import type { PdfPageMeta } from '@/lib/pdf-editor/types';

type PdfJs = typeof import('pdfjs-dist');
type PDFDocumentProxy = import('pdfjs-dist').PDFDocumentProxy;

let pdfjsMod: PdfJs | null = null;
let workerReady = false;

async function loadPdfJs(): Promise<PdfJs> {
  if (pdfjsMod) return pdfjsMod;
  const mod = await import('pdfjs-dist');
  if (!workerReady) {
    mod.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    workerReady = true;
  }
  pdfjsMod = mod;
  return mod;
}

export async function loadPdfDocument(data: Uint8Array): Promise<PDFDocumentProxy> {
  const { getDocument } = await loadPdfJs();
  const task = getDocument({
    data: data.slice(),
    disableAutoFetch: true,
    disableStream: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  return task.promise;
}

export async function readPdfPages(pdf: PDFDocumentProxy): Promise<PdfPageMeta[]> {
  const pages: PdfPageMeta[] = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    pages.push({
      id: createPdfId('page'),
      sourceIndex: i - 1,
      rotation: 0,
      sourceRotate: asRotation(page.rotate),
      widthPt: viewport.width,
      heightPt: viewport.height,
    });
  }
  return pages;
}

export async function renderPdfPageToCanvas(
  pdf: PDFDocumentProxy,
  sourceIndex: number,
  canvas: HTMLCanvasElement,
  options: { scale: number; rotation: number },
): Promise<{ width: number; height: number }> {
  const page = await pdf.getPage(sourceIndex + 1);
  const viewport = page.getViewport({
    scale: Math.max(0.15, options.scale),
    rotation: asRotation((page.rotate || 0) + options.rotation),
  });
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return { width: viewport.width, height: viewport.height };

  const outputScale = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
  canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
  canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
  canvas.style.width = `${Math.max(1, Math.floor(viewport.width))}px`;
  canvas.style.height = `${Math.max(1, Math.floor(viewport.height))}px`;
  context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, viewport.width, viewport.height);

  await page.render({
    canvasContext: context,
    viewport,
  }).promise;

  return { width: viewport.width, height: viewport.height };
}

export function revokeObjectUrl(url: string | null): void {
  if (url) URL.revokeObjectURL(url);
}
