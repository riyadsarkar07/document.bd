import type { UnhcrLayout, UnhcrS2OverlayKey, UnhcrS2Snapshot, UnhcrTextOrientation } from '../editor/types';
import { UNHCR_DEFAULT_LAYOUTS, UNHCR_DOC_HEIGHT, UNHCR_DOC_WIDTH, UNHCR_FIELD_ORDER } from '../constants/unhcr-s2';
import { buildUnhcrBarcodePayload, buildUnhcrQrPayload, drawUnhcrBarcode, drawUnhcrQr } from '../unhcrCodes';

const INK = '#000000';
const ARIAL = "'Arial Regular',Arial,sans-serif";
const ARIAL_BOLD = "'Arial Bold MT','Arial Bold',Arial,sans-serif";

function fontFor(layout: UnhcrLayout): string {
  const family = layout.fontFamily === 'arial-bold' ? ARIAL_BOLD : ARIAL;
  return `${layout.fontSize}px ${family}`;
}

export function renderUnhcrValue(
  ctx: CanvasRenderingContext2D,
  text: string,
  layout: UnhcrLayout,
): void {
  if (!text) return;
  ctx.save();
  ctx.font = fontFor(layout);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.fillText(text, layout.x, layout.y);
  ctx.restore();
}

function drawBoxedTestText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  fontSize: number,
  orientation: UnhcrTextOrientation = 'horizontal',
): void {
  if (!text) return;
  const boxW = Math.max(8, w);
  const boxH = Math.max(8, h);
  const size = Math.max(8, fontSize);
  ctx.save();
  ctx.font = `${size}px ${ARIAL_BOLD}`;
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (orientation === 'vertical') {
    ctx.translate(x + boxW / 2, y + boxH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(text, 0, 0, boxH);
  } else {
    ctx.fillText(text, x + boxW / 2, y + boxH / 2, boxW);
  }
  ctx.restore();
}

export function renderUnhcrCard(
  canvas: HTMLCanvasElement,
  snap: UnhcrS2Snapshot,
  bgImg: HTMLImageElement | null,
  scale = 1,
  highlight?: UnhcrS2OverlayKey,
  photoImg: HTMLImageElement | null = null,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = UNHCR_DOC_WIDTH;
  const H = UNHCR_DOC_HEIGHT;
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  if (scale !== 1) ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
    ctx.drawImage(bgImg, 0, 0, W, H);
  } else {
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
    ctx.save();
    ctx.font = 'italic 28px sans-serif';
    ctx.fillStyle = '#aaa';
    ctx.textAlign = 'center';
    ctx.fillText('[ Unchar.png not found ]', W / 2, 48);
    ctx.restore();
  }

  const photoW = Math.min(Math.max(snap.photoW || 40, 40), W);
  const photoH = Math.min(Math.max(snap.photoH || 40, 40), H);
  const photoX = Number.isFinite(snap.photoX) ? snap.photoX : 0;
  const photoY = Number.isFinite(snap.photoY) ? snap.photoY : 0;
  if (photoImg && photoImg.complete && photoImg.naturalWidth > 0) {
    ctx.drawImage(photoImg, photoX, photoY, photoW, photoH);
  } else {
    ctx.fillStyle = '#00ffff';
    ctx.fillRect(photoX, photoY, photoW, photoH);
  }

  for (const key of UNHCR_FIELD_ORDER) {
    const layout = snap.layouts[key] ?? UNHCR_DEFAULT_LAYOUTS[key];
    renderUnhcrValue(ctx, snap[key], layout);
  }

  const barcodePayload = buildUnhcrBarcodePayload(snap);
  const qrPayload = buildUnhcrQrPayload(snap);
  drawUnhcrBarcode(ctx, barcodePayload, snap.barcode1X, snap.barcode1Y, snap.barcode1W, snap.barcode1H);
  drawUnhcrBarcode(ctx, barcodePayload, snap.barcode2X, snap.barcode2Y, snap.barcode2W, snap.barcode2H);
  drawUnhcrQr(ctx, qrPayload, snap.qrX, snap.qrY, snap.qrSize);

  drawBoxedTestText(
    ctx,
    snap.testBarcodeText,
    snap.testBarcodeTextX,
    snap.testBarcodeTextY,
    snap.testBarcodeTextW,
    snap.testBarcodeTextH,
    snap.testBarcodeTextFontSize,
    'horizontal',
  );
  drawBoxedTestText(
    ctx,
    snap.testRefNo,
    snap.testRefNoX,
    snap.testRefNoY,
    snap.testRefNoW,
    snap.testRefNoH,
    snap.testRefNoFontSize,
    snap.testRefNoOrientation,
  );

  if (highlight === 'photo') {
    ctx.save();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 6]);
    ctx.strokeRect(photoX - 3, photoY - 3, photoW + 6, photoH + 6);
    ctx.restore();
  } else if (highlight === 'barcode1') {
    strokeCode(ctx, snap.barcode1X, snap.barcode1Y, snap.barcode1W, snap.barcode1H);
  } else if (highlight === 'barcode2') {
    strokeCode(ctx, snap.barcode2X, snap.barcode2Y, snap.barcode2W, snap.barcode2H);
  } else if (highlight === 'qr') {
    strokeCode(ctx, snap.qrX, snap.qrY, snap.qrSize, snap.qrSize);
  } else if (highlight === 'testBarcodeText') {
    strokeCode(ctx, snap.testBarcodeTextX, snap.testBarcodeTextY, snap.testBarcodeTextW, snap.testBarcodeTextH);
  } else if (highlight === 'testRefNo') {
    strokeCode(ctx, snap.testRefNoX, snap.testRefNoY, snap.testRefNoW, snap.testRefNoH);
  } else if (highlight) {
    const layout = snap.layouts[highlight] ?? UNHCR_DEFAULT_LAYOUTS[highlight];
    const text = snap[highlight] || ' ';
    ctx.save();
    ctx.font = fontFor(layout);
    const w = Math.max(48, ctx.measureText(text).width);
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 5]);
    ctx.strokeRect(layout.x - 6, layout.y - layout.fontSize, w + 12, layout.fontSize * 1.35);
    ctx.restore();
  }
}

function strokeCode(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 6]);
  ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
  ctx.restore();
}
