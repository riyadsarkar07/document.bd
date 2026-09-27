import type { DlLayout, DlOverlayKey, DrivingLicenseSnapshot } from '../editor/types';
import {
  DL_DEFAULT_LAYOUTS,
  DL_DOC_HEIGHT,
  DL_DOC_WIDTH,
  DL_FIELD_ORDER,
  isDlOverlayArtifact,
} from '../constants/driving-license';

const INK = '#111111';
const ARIAL = "'Arial Regular',Arial,sans-serif";
const ARIAL_BOLD = "'Arial Bold MT','Arial Bold',Arial,sans-serif";

function fontFor(layout: DlLayout): string {
  const family = layout.fontFamily === 'arial-bold' ? ARIAL_BOLD : ARIAL;
  return `${layout.fontSize}px ${family}`;
}

export function renderDlValue(
  ctx: CanvasRenderingContext2D,
  text: string,
  layout: DlLayout,
): void {
  if (!text || isDlOverlayArtifact(text)) return;
  ctx.save();
  ctx.font = fontFor(layout);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.fillText(text, layout.x, layout.y);
  ctx.restore();
}

function drawQr(
  ctx: CanvasRenderingContext2D,
  snap: DrivingLicenseSnapshot,
  qrImg: HTMLImageElement | null,
): void {
  const size = Math.max(40, snap.qrSize);
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(snap.qrX - 4, snap.qrY - 4, size + 8, size + 8);
  if (qrImg && qrImg.complete && qrImg.naturalWidth > 0) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(qrImg, snap.qrX, snap.qrY, size, size);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(snap.qrX, snap.qrY, size, size);
  }
  ctx.restore();
}

function strokeBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 6]);
  ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
  ctx.restore();
}

/**
 * Renders the Driving License DEMO overlay on the uploaded template.
 * The template image is drawn exactly as uploaded — no artwork is redrawn.
 */
export function renderDrivingLicense(
  canvas: HTMLCanvasElement,
  snap: DrivingLicenseSnapshot,
  bgImg: HTMLImageElement | null,
  scale = 1,
  highlight?: DlOverlayKey,
  photoImg: HTMLImageElement | null = null,
  qrImg: HTMLImageElement | null = null,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = DL_DOC_WIDTH;
  const H = DL_DOC_HEIGHT;
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
  }

  const photoW = Math.min(Math.max(snap.photoW || 40, 40), W);
  const photoH = Math.min(Math.max(snap.photoH || 40, 40), H);
  const photoX = Number.isFinite(snap.photoX) ? snap.photoX : 0;
  const photoY = Number.isFinite(snap.photoY) ? snap.photoY : 0;
  if (photoImg && photoImg.complete && photoImg.naturalWidth > 0) {
    ctx.drawImage(photoImg, photoX, photoY, photoW, photoH);
  }

  for (const key of DL_FIELD_ORDER) {
    const layout = snap.layouts[key] ?? DL_DEFAULT_LAYOUTS[key];
    renderDlValue(ctx, snap[key], layout);
  }

  drawQr(ctx, snap, qrImg);

  if (highlight === 'photo') {
    strokeBox(ctx, photoX, photoY, photoW, photoH);
  } else if (highlight === 'qr') {
    strokeBox(ctx, snap.qrX, snap.qrY, snap.qrSize, snap.qrSize);
  } else if (highlight) {
    const layout = snap.layouts[highlight] ?? DL_DEFAULT_LAYOUTS[highlight];
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
