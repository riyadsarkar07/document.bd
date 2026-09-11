/**
 * PDF editor export verification.
 * Creates a multi-page PDF, applies edits, and checks the exported file.
 */
import assert from 'node:assert/strict';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { addAnnotation, deletePage, movePage, rotatePage } from '../src/lib/pdf-editor/document';
import { exportEditedPdf } from '../src/lib/pdf-editor/export';
import { pageVisualSize } from '../src/lib/pdf-editor/geometry';
import type { PdfEditorDocument } from '../src/lib/pdf-editor/types';

function ok(cond: boolean, msg: string) {
  assert.equal(cond, true, msg);
  console.log(`  ok  ${msg}`);
}

async function makeSource(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const sizes: [number, number][] = [
    [612, 792],
    [595.28, 841.89],
    [792, 612],
  ];
  sizes.forEach(([w, h], i) => {
    const page = doc.addPage([w, h]);
    page.drawRectangle({ x: 0, y: 0, width: w, height: h, color: rgb(0.97, 0.97, 0.94) });
    page.drawText(`Source page ${i + 1}`, { x: 72, y: h - 72, size: 22, font, color: rgb(0.1, 0.1, 0.1) });
  });
  return doc.save();
}

function samplePng(): string {
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mP8z8BQzwAEjDAGACpgBUHAgvQdAAAAAElFTkSuQmCC';
}

async function main() {
  console.log('\n[pdf-editor] upload → edit → export\n');
  const sourceBytes = await makeSource();
  const source = await PDFDocument.load(sourceBytes);
  ok(source.getPageCount() === 3, 'source PDF has 3 pages');

  let state: PdfEditorDocument = {
    fileName: 'sample-multi.pdf',
    pages: source.getPages().map((page, index) => {
      const { width, height } = page.getSize();
      return {
        id: `page_${index + 1}`,
        sourceIndex: index,
        rotation: 0,
        sourceRotate: 0,
        widthPt: width,
        heightPt: height,
      };
    }),
    annotations: [],
  };

  state = addAnnotation(state, {
    id: 't1',
    pageId: 'page_1',
    type: 'text',
    x: 0.12,
    y: 0.18,
    width: 0.4,
    height: 0.06,
    text: 'Edited page one',
    fontSize: 0.03,
    color: '#111827',
    bold: true,
  });
  state = addAnnotation(state, {
    id: 'h1',
    pageId: 'page_1',
    type: 'highlight',
    x: 0.1,
    y: 0.08,
    width: 0.5,
    height: 0.04,
    color: '#facc15',
    opacity: 0.4,
  });
  state = addAnnotation(state, {
    id: 'p1',
    pageId: 'page_2',
    type: 'pen',
    points: [
      { x: 0.2, y: 0.2 },
      { x: 0.35, y: 0.28 },
      { x: 0.5, y: 0.22 },
    ],
    color: '#dc2626',
    strokeWidth: 0.006,
  });
  state = addAnnotation(state, {
    id: 'w1',
    pageId: 'page_2',
    type: 'whiteout',
    x: 0.08,
    y: 0.06,
    width: 0.35,
    height: 0.05,
  });
  state = addAnnotation(state, {
    id: 'img1',
    pageId: 'page_3',
    type: 'image',
    x: 0.7,
    y: 0.7,
    width: 0.18,
    height: 0.12,
    dataUrl: samplePng(),
  });
  state = addAnnotation(state, {
    id: 'sig1',
    pageId: 'page_3',
    type: 'signature',
    x: 0.12,
    y: 0.72,
    width: 0.28,
    height: 0.1,
    dataUrl: samplePng(),
  });
  state = addAnnotation(state, {
    id: 'r1',
    pageId: 'page_3',
    type: 'shape',
    shape: 'rect',
    x: 0.15,
    y: 0.3,
    width: 0.3,
    height: 0.16,
    stroke: '#d4af5a',
    strokeWidth: 0.004,
    fill: null,
  });

  state = rotatePage(state, 'page_3', 90);
  state = movePage(state, 'page_3', -1);
  state = movePage(state, 'page_3', -1);
  ok(state.pages.map((p) => p.id).join(',') === 'page_3,page_1,page_2', 'pages reordered so page 3 is first');
  ok(state.pages[0].rotation === 90, 'page 3 was rotated 90 degrees');

  state = deletePage(state, 'page_2');
  ok(state.pages.length === 2, 'one page deleted');
  ok(state.annotations.every((a) => a.pageId !== 'page_2'), 'annotations on deleted page were removed');

  const exported = await exportEditedPdf(sourceBytes, state);
  const out = await PDFDocument.load(exported);
  ok(out.getPageCount() === 2, 'exported PDF has 2 pages');

  const first = out.getPage(0).getSize();
  const expectedFirst = pageVisualSize(state.pages[0]);
  ok(Math.abs(first.width - expectedFirst.width) < 0.5, 'rotated page width preserved');
  ok(Math.abs(first.height - expectedFirst.height) < 0.5, 'rotated page height preserved');

  const second = out.getPage(1).getSize();
  ok(Math.abs(second.width - 612) < 0.5 && Math.abs(second.height - 792) < 0.5, 'unrotated letter page size preserved');
  ok(exported.byteLength > 500, 'exported PDF has content');

  console.log('\nPDF editor export checks passed.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
