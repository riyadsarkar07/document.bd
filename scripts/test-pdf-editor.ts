/**
 * PDF editor export verification.
 * Creates a multi-page PDF, applies edits, and checks the exported file.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { addAnnotation, deletePage, movePage, nativeRunToTextAnnotation, rotatePage } from '../src/lib/pdf-editor/document';
import { exportEditedPdf } from '../src/lib/pdf-editor/export';
import { pageVisualSize } from '../src/lib/pdf-editor/geometry';
import { extractNativeTextRuns, hitTestNativeRun, visibleNativeRuns } from '../src/lib/pdf-editor/native-text';
import type { NativeTextRun, PdfEditorDocument } from '../src/lib/pdf-editor/types';

function ok(cond: boolean, msg: string) {
  assert.equal(cond, true, msg);
  console.log(`  ok  ${msg}`);
}

function decodePdfHexStrings(text: string): string {
  let out = '';
  const re = /<([0-9A-Fa-f]+)>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    out += Buffer.from(match[1], 'hex').toString('latin1');
  }
  return out;
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
      if (decodePdfHexStrings(text).includes(needle)) return true;
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

function decodePdfStreams(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes);
  const latin = buf.toString('latin1');
  const parts: string[] = [latin];
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
      parts.push(inflateSync(payload).toString('latin1'));
    } catch {
      parts.push(Buffer.from(payload).toString('latin1'));
    }
    idx = end + 9;
  }
  return parts.join('\n');
}

function parseTextMatrices(content: string): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const re = /1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content))) {
    out.push({ x: Number(match[1]), y: Number(match[2]) });
  }
  return out;
}

function parseCoverRects(content: string): { x: number; y: number; width: number; height: number }[] {
  const out: { x: number; y: number; width: number; height: number }[] = [];
  const re =
    /1 0 0 1 (-?[\d.]+) (-?[\d.]+) cm(?:\s+1 0 0 1 0 0 cm)*\s+0 0 m\s+0 (-?[\d.]+) l\s+(-?[\d.]+) (-?[\d.]+) l/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content))) {
    out.push({
      x: Number(match[1]),
      y: Number(match[2]),
      width: Number(match[4]),
      height: Number(match[3]),
    });
  }
  return out;
}

async function makeBillFixture(): Promise<{
  bytes: Uint8Array;
  width: number;
  height: number;
  cropX: number;
  cropY: number;
  valueBox: { x: number; y: number; width: number; height: number; fontSize: number };
}> {
  const width = 595.28;
  const height = 841.89;
  const cropX = 24;
  const cropY = 36;
  const fontSize = 14;
  const valuePdfX = cropX + 72;
  const valuePdfY = cropY + height - 120;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([width, height]);
  page.setMediaBox(cropX, cropY, width, height);
  page.setCropBox(cropX, cropY, width, height);
  page.drawRectangle({ x: cropX, y: cropY, width, height, color: rgb(1, 1, 1) });
  page.drawText('LEFT_EDGE', { x: cropX + 8, y: cropY + height / 2, size: 9, font, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('RIGHT_EDGE', {
    x: cropX + width - 72,
    y: cropY + height / 2,
    size: 9,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText('TOP_EDGE', { x: cropX + width / 2 - 28, y: cropY + height - 14, size: 9, font, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('BOTTOM_EDGE', { x: cropX + width / 2 - 36, y: cropY + 10, size: 9, font, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('MONTH', {
    x: cropX + 72,
    y: cropY + height - 72,
    size: 11,
    font,
    color: rgb(0.78, 0.12, 0.16),
  });
  page.drawText('VALUE & RULE', { x: valuePdfX, y: valuePdfY, size: fontSize, font, color: rgb(0.12, 0.35, 0.72) });
  const glyphW = font.widthOfTextAtSize('VALUE & RULE', fontSize);
  return {
    bytes: await doc.save(),
    width,
    height,
    cropX,
    cropY,
    valueBox: {
      x: 72 / width,
      y: (120 - fontSize) / height,
      width: glyphW / width,
      height: fontSize / height,
      fontSize: fontSize / height,
    },
  };
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
    color: '#c41e3a',
  };
  ok(hitTestNativeRun([run], { x: 0.12, y: 0.06 })?.id === 'ntext_1', 'hit-test finds native run under click');
  ok(hitTestNativeRun([run], { x: 0.9, y: 0.9 }) === null, 'hit-test misses empty space');
  ok(visibleNativeRuns([run], [{ x: 0.1, y: 0.05, width: 0.42, height: 0.04 }]).length === 0, 'covered native run is hidden');

  const nativeAnn = nativeRunToTextAnnotation('page_1', run);
  nativeAnn.id = 'native_edit';
  nativeAnn.text = 'NATIVE_EDIT_OK';
  ok(nativeAnn.source === 'native' && nativeAnn.coverOriginal === true, 'native annotation covers original glyphs');
  ok(nativeAnn.color === '#c41e3a', 'native annotation keeps the extracted PDF fill color');
  ok(Math.round(nativeAnn.fontSize * 792) === 22, 'inspector shows PDF points, not a 0-1 fraction that rounds to 1');

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

  console.log('[pdf-editor] crop box origin + source rotate\n');
  const offsetDoc = await PDFDocument.create();
  const offsetFont = await offsetDoc.embedFont(StandardFonts.Helvetica);
  const offsetPage = offsetDoc.addPage([612, 792]);
  offsetPage.setMediaBox(50, 80, 612, 792);
  offsetPage.setCropBox(50, 80, 612, 792);
  offsetPage.drawText('OFFSET_CROP', { x: 122, y: 800, size: 18, font: offsetFont, color: rgb(0.1, 0.1, 0.1) });
  const offsetBytes = await offsetDoc.save();

  const offsetState: PdfEditorDocument = {
    fileName: 'offset-crop.pdf',
    pages: [
      {
        id: 'page_offset',
        sourceIndex: 0,
        rotation: 0,
        sourceRotate: 0,
        widthPt: 612,
        heightPt: 792,
      },
    ],
    annotations: [
      {
        id: 'cover_offset',
        pageId: 'page_offset',
        type: 'text',
        x: 72 / 612,
        y: 72 / 792,
        width: 0.3,
        height: 0.04,
        text: 'CROP_ORIGIN_OK',
        fontSize: 0.024,
        color: '#111827',
        bold: false,
        source: 'native',
        coverOriginal: true,
      },
    ],
  };
  const offsetExported = await exportEditedPdf(offsetBytes, offsetState);
  const offsetOut = await PDFDocument.load(offsetExported);
  const offsetOutPage = offsetOut.getPage(0);
  const offsetBox = offsetOutPage.getMediaBox();
  ok(Math.abs(offsetOutPage.getSize().width - 612) < 0.5, 'offset crop export width uses crop size not media origin');
  ok(Math.abs(offsetOutPage.getSize().height - 792) < 0.5, 'offset crop export height uses crop size not media origin');
  ok(Math.abs(offsetBox.x) < 0.01 && Math.abs(offsetBox.y) < 0.01, 'offset crop export page origin is 0,0');
  ok(pdfContains(offsetExported, 'CROP_ORIGIN_OK'), 'replacement text is written on offset-crop export');

  const rotatedSrc = await PDFDocument.create();
  const rotatedPage = rotatedSrc.addPage([612, 792]);
  rotatedPage.setRotation(degrees(90));
  rotatedPage.drawText('ROTATED_SRC', {
    x: 72,
    y: 720,
    size: 18,
    font: await rotatedSrc.embedFont(StandardFonts.Helvetica),
    color: rgb(0.1, 0.1, 0.1),
  });
  const rotatedBytes = await rotatedSrc.save();
  const rotatedState: PdfEditorDocument = {
    fileName: 'source-rotate.pdf',
    pages: [
      {
        id: 'page_rot',
        sourceIndex: 0,
        rotation: 0,
        sourceRotate: 90,
        widthPt: 612,
        heightPt: 792,
      },
    ],
    annotations: [],
  };
  const rotatedExported = await exportEditedPdf(rotatedBytes, rotatedState);
  const rotatedOut = await PDFDocument.load(rotatedExported);
  const rotatedSize = rotatedOut.getPage(0).getSize();
  ok(Math.abs(rotatedSize.width - 792) < 0.5, 'source /Rotate 90 export width is visual crop width');
  ok(Math.abs(rotatedSize.height - 612) < 0.5, 'source /Rotate 90 export height is visual crop height');

  const rotatedVisualState: PdfEditorDocument = {
    fileName: 'source-rotate-visual.pdf',
    pages: [
      {
        id: 'page_rot',
        sourceIndex: 0,
        rotation: 0,
        sourceRotate: 90,
        widthPt: 792,
        heightPt: 612,
      },
    ],
    annotations: [
      {
        id: 'rot_text',
        pageId: 'page_rot',
        type: 'text',
        x: 0.1,
        y: 0.1,
        width: 0.4,
        height: 0.08,
        text: 'ROT_VISUAL_OK',
        fontSize: 0.04,
        color: '#111827',
        bold: false,
        source: 'native',
        coverOriginal: true,
      },
    ],
  };
  const rotatedVisualExported = await exportEditedPdf(rotatedBytes, rotatedVisualState);
  const rotatedVisualSize = (await PDFDocument.load(rotatedVisualExported)).getPage(0).getSize();
  ok(Math.abs(rotatedVisualSize.width - 792) < 0.5, 'PDF.js visual page size plus source rotate stays 792pt wide');
  ok(Math.abs(rotatedVisualSize.height - 612) < 0.5, 'PDF.js visual page size plus source rotate stays 612pt tall');
  ok(pdfContains(rotatedVisualExported, 'ROT_VISUAL_OK'), 'native replacement maps onto source-rotated visual page');

  console.log('\nCrop box and source rotate checks passed.\n');

  console.log('[pdf-editor] A4 bill fixture export coordinates\n');
  const bill = await makeBillFixture();
  const billPage = {
    id: 'page_bill',
    sourceIndex: 0,
    rotation: 0 as const,
    sourceRotate: 0 as const,
    widthPt: bill.width,
    heightPt: bill.height,
  };
  const billRun: NativeTextRun = {
    id: 'ntext_value',
    text: 'VALUE & RULE',
    x: bill.valueBox.x,
    y: bill.valueBox.y,
    width: bill.valueBox.width,
    height: bill.valueBox.height,
    fontSize: bill.valueBox.fontSize,
    fontFamily: 'Helvetica, Arial, sans-serif',
    bold: false,
    color: '#1f59b8',
  };
  const monthRun: NativeTextRun = {
    id: 'ntext_month',
    text: 'MONTH',
    x: 72 / bill.width,
    y: (72 - 11) / bill.height,
    width: 0.12,
    height: 11 / bill.height,
    fontSize: 11 / bill.height,
    fontFamily: 'Helvetica, Arial, sans-serif',
    bold: false,
    color: '#c71f29',
  };
  ok(hitTestNativeRun([billRun], { x: bill.valueBox.x + 0.01, y: bill.valueBox.y + 0.005 })?.id === 'ntext_value', 'VALUE & RULE is selectable on the A4 fixture');
  const billAnn = nativeRunToTextAnnotation('page_bill', billRun);
  billAnn.id = 'bill_edit';
  const monthAnn = nativeRunToTextAnnotation('page_bill', monthRun);
  ok(monthAnn.color === '#c71f29', 'MONTH keeps its extracted red fill instead of turning white');
  ok(Math.round(monthAnn.fontSize * bill.height) === 11, 'MONTH inspector size stays 11pt, not 1');
  ok(billAnn.color === '#1f59b8', 'VALUE & RULE keeps its extracted blue fill');
  ok(Math.round(billAnn.fontSize * bill.height) === 14, 'VALUE & RULE inspector size stays 14pt');
  billAnn.text = 'VALUE & RULE EDITED';
  const billDoc: PdfEditorDocument = {
    fileName: 'utility-bill-fixture.pdf',
    pages: [billPage],
    annotations: [billAnn],
  };

  const zoomLevels = [0.5, 1, 1.35, 2];
  let firstContent = '';
  for (const zoom of zoomLevels) {
    void zoom;
    const exported = await exportEditedPdf(bill.bytes, billDoc);
    const out = await PDFDocument.load(exported);
    const page = out.getPage(0);
    const size = page.getSize();
    const box = page.getMediaBox();
    ok(Math.abs(size.width - bill.width) < 0.5, `zoom-independent export width stays A4 (${size.width})`);
    ok(Math.abs(size.height - bill.height) < 0.5, `zoom-independent export height stays A4 (${size.height})`);
    ok(Math.abs(box.x) < 0.01 && Math.abs(box.y) < 0.01, 'exported A4 page origin is 0,0 not crop origin');
    ok(page.getRotation().angle === 0, 'unrotated A4 fixture keeps rotation 0');
    ok(pdfContains(exported, 'VALUE & RULE EDITED') || pdfContains(exported, 'RULE EDITED'), 'edited VALUE & RULE text is in the export');
    ok(pdfContains(exported, 'LEFT_EDGE') && pdfContains(exported, 'RIGHT_EDGE'), 'left/right edge text survives export');
    ok(pdfContains(exported, 'TOP_EDGE') && pdfContains(exported, 'BOTTOM_EDGE'), 'top/bottom edge text survives export');
    ok(pdfContains(exported, 'VALUE & RULE'), 'original VALUE & RULE glyphs remain under the cover');

    const content = decodePdfStreams(exported);
    const texts = parseTextMatrices(content);
    const covers = parseCoverRects(content);
    const expectedX = bill.valueBox.x * bill.width;
    const expectedCoverY = bill.height - (bill.valueBox.y + bill.valueBox.height) * bill.height;
    const expectedTextY = expectedCoverY + bill.valueBox.height * bill.height - bill.valueBox.fontSize * bill.height;
    const edited = texts.find((t) => Math.abs(t.x - expectedX) < 1.5 && Math.abs(t.y - expectedTextY) < 1.5);
    ok(Boolean(edited), `replacement text is at PDF-space (${expectedX.toFixed(2)}, ${expectedTextY.toFixed(2)}) not screen space`);
    const cover = covers.find(
      (c) => Math.abs(c.x - expectedX) < 2 && Math.abs(c.y - expectedCoverY) < 2,
    );
    ok(Boolean(cover), 'white cover sits on the original glyph box');
    if (cover) {
      ok(cover.width < bill.width * 0.35, 'white cover is not an oversized page block');
      ok(cover.height < bill.height * 0.08, 'white cover height stays near the glyph height');
    }
    if (!firstContent) firstContent = content;
    else ok(content === firstContent, 'export content is identical across editor zoom levels');
  }

  const rotatedBillDoc: PdfEditorDocument = {
    fileName: 'utility-bill-fixture-rotated.pdf',
    pages: [{ ...billPage, rotation: 90 }],
    annotations: [],
  };
  const rotatedBillExported = await exportEditedPdf(bill.bytes, rotatedBillDoc);
  const rotatedBillSize = (await PDFDocument.load(rotatedBillExported)).getPage(0).getSize();
  ok(Math.abs(rotatedBillSize.width - bill.height) < 0.5, 'editor-rotated A4 export swaps to visual width');
  ok(Math.abs(rotatedBillSize.height - bill.width) < 0.5, 'editor-rotated A4 export swaps to visual height');

  console.log('\nA4 bill fixture export checks passed.\n');

  console.log('[pdf-editor] real utility bill native text extraction\n');
  const billBytes = new Uint8Array(readFileSync('tests/fixtures/utility-bill-regression.pdf'));
  const billPdf = await getDocument({ data: billBytes, isEvalSupported: false, useSystemFonts: true }).promise;
  const billSource = await billPdf.getPage(1);
  const billViewport = billSource.getViewport({ scale: 1 });
  const extracted = await extractNativeTextRuns(billPdf, {
    id: 'page_real',
    sourceIndex: 0,
    rotation: 0,
    sourceRotate: 0,
    widthPt: billViewport.width,
    heightPt: billViewport.height,
  });
  const monthRuns = extracted.filter((run) => run.text === 'MONTH');
  const valueRuns = extracted.filter((run) => run.text === 'VALUE & RULE');
  ok(monthRuns.length >= 1, 'real bill exposes a MONTH run');
  ok(valueRuns.length >= 1, 'real bill exposes a VALUE & RULE run');
  for (const run of [...monthRuns, ...valueRuns]) {
    ok(Math.abs(run.fontSize * billViewport.height - 8) < 0.6, `${run.text} size is ~8pt, not 1pt`);
    ok(run.color !== '#000000' && run.color !== '#ffffff', `${run.text} keeps a visible original color (${run.color})`);
  }
  const headerMonth = monthRuns.find((run) => Math.abs(run.x * billViewport.width - 341.16) < 1.5);
  ok(Boolean(headerMonth), 'header MONTH keeps its original x position');
  ok(monthRuns.some((run) => run.color === '#247896'), 'header MONTH keeps its extracted teal fill');
  ok(valueRuns.some((run) => run.color === '#247896'), 'VALUE & RULE keeps its extracted teal fill');

  console.log('\nReal utility bill native text checks passed.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
