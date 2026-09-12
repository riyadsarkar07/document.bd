/**
 * PDF editor export verification.
 * Creates a multi-page PDF, applies edits, and checks the exported file.
 */
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { addAnnotation, deletePage, movePage, nativeRunToTextAnnotation, rotatePage } from '../src/lib/pdf-editor/document';
import { exportEditedPdf } from '../src/lib/pdf-editor/export';
import { pageVisualSize } from '../src/lib/pdf-editor/geometry';
import { hitTestNativeRun, visibleNativeRuns } from '../src/lib/pdf-editor/native-text';
import type { NativeTextRun, PdfEditorDocument } from '../src/lib/pdf-editor/types';

function ok(cond: boolean, msg: string) {
  assert.equal(cond, true, msg);
  console.log(`  ok  ${msg}`);
}

function pdfContains(bytes: Uint8Array, needle: string): boolean {
  const hex = Buffer.from(needle, 'latin1').toString('hex').toUpperCase();
  const buf = Buffer.from(bytes);
  if (buf.includes(needle) || buf.toString('latin1').includes(hex)) return true;
  const latin = buf.toString('latin1');
  let idx = 0;
  while (idx < latin.length) {
    const start = latin.indexOf('stream', idx);
    if (start < 0) break;
    const after = start + 6;
    const dataStart =
      latin[after] === '\r' && latin[after + 1] === '\n'
        ? after + 2
        : latin[after] === '\n' || latin[after] === '\r'
          ? after + 1
          : -1;
    if (dataStart < 0) {
      idx = after;
      continue;
    }
    const end = latin.indexOf('endstream', dataStart);
    if (end < 0) break;
    let payloadEnd = end;
    if (latin[end - 1] === '\n') payloadEnd = latin[end - 2] === '\r' ? end - 2 : end - 1;
    const payload = buf.subarray(dataStart, payloadEnd);
    try {
      const inflated = inflateSync(payload);
      const text = inflated.toString('latin1');
      if (text.includes(needle) || text.toUpperCase().includes(hex)) return true;
    } catch {
      // not a flate stream
    }
    idx = end + 9;
  }
  return false;
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

  console.log('[pdf-editor] native text edit → export\n');
  const run: NativeTextRun = {
    id: 'ntext_1',
    text: 'Source page 1',
    x: 0.1,
    y: 0.05,
    width: 0.42,
    height: 0.04,
    fontSize: 0.028,
    fontFamily: 'Helvetica, Arial, sans-serif',
    bold: false,
  };
  ok(hitTestNativeRun([run], { x: 0.12, y: 0.06 })?.id === 'ntext_1', 'hit-test finds native run under click');
  ok(hitTestNativeRun([run], { x: 0.9, y: 0.9 }) === null, 'hit-test misses empty space');
  ok(visibleNativeRuns([run], [{ x: 0.1, y: 0.05, width: 0.42, height: 0.04 }]).length === 0, 'covered native run is hidden');

  const nativeAnn = nativeRunToTextAnnotation('page_1', run);
  nativeAnn.id = 'native_edit';
  nativeAnn.text = 'NATIVE_EDIT_OK';
  ok(nativeAnn.source === 'native' && nativeAnn.coverOriginal === true, 'native annotation covers original glyphs');

  const nativeDoc: PdfEditorDocument = {
    fileName: 'native-edit.pdf',
    pages: [
      {
        id: 'page_1',
        sourceIndex: 0,
        rotation: 0,
        sourceRotate: 0,
        widthPt: 612,
        heightPt: 792,
      },
    ],
    annotations: [nativeAnn],
  };
  const nativeExported = await exportEditedPdf(sourceBytes, nativeDoc);
  const nativeOut = await PDFDocument.load(nativeExported);
  ok(nativeOut.getPageCount() === 1, 'native-edit export writes the edited page');
  ok(pdfContains(nativeExported, 'NATIVE_EDIT_OK'), 'replacement text persisted in exported PDF');
  ok(pdfContains(nativeExported, 'Source page 1'), 'original glyphs remain under the white cover');

  const overlayDoc: PdfEditorDocument = {
    fileName: 'overlay-add-text.pdf',
    pages: nativeDoc.pages,
    annotations: [
      {
        id: 'overlay_1',
        pageId: 'page_1',
        type: 'text',
        x: 0.2,
        y: 0.4,
        width: 0.3,
        height: 0.05,
        text: 'OVERLAY_ADD_TEXT',
        fontSize: 0.028,
        color: '#111827',
        bold: false,
        source: 'overlay',
      },
    ],
  };
  const overlayExported = await exportEditedPdf(sourceBytes, overlayDoc);
  ok(pdfContains(overlayExported, 'OVERLAY_ADD_TEXT'), 'Add Text overlay persists without covering native runs');
  ok(hitTestNativeRun([], { x: 0.2, y: 0.4 }) === null, 'scanned PDF with no text layer misses native hits');

  console.log('\nNative text edit checks passed.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
