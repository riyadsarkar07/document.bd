import type { DubaiLayout, DubaiOverlayKey, DubaiLicenseSnapshot } from '../editor/types';
import {
  DUBAI_DEFAULT_LAYOUTS,
  DUBAI_DOC_HEIGHT,
  DUBAI_DOC_WIDTH,
  DUBAI_FIELD_ORDER,
  isDubaiOverlayArtifact,
} from '../constants/dubai-license';

const INK = '#111111';
const ARIAL = "'Arial Regular',Arial,sans-serif";
const ARIAL_BOLD = "'Arial Bold MT','Arial Bold',Arial,sans-serif";

function fontFor(layout: DubaiLayout): string {
  const family = layout.fontFamily === 'arial-bold' ? ARIAL_BOLD : ARIAL;
  return `${layout.fontSize}px ${family}`;
}

export function renderDubaiValue(
  ctx: CanvasRenderingContext2D,
  text: string,
  layout: DubaiLayout,
): void {
  if (!text || isDubaiOverlayArtifact(text)) return;
  ctx.save();
  ctx.font = fontFor(layout);
  ctx.textBaseline = 'alphabetic';
  const rtl = layout.align === 'right';
  ctx.textAlign = rtl ? 'right' : 'left';
  if (rtl) {
    ctx.direction = 'rtl';
  } else {
    ctx.direction = 'ltr';
  }
  ctx.fillStyle = INK;
  const lines = text.split('\n');
  if (lines.length === 1) {
    ctx.fillText(text, layout.x, layout.y);
  } else {
    const lh = layout.fontSize * 1.2;
    lines.forEach((line, i) => {
      ctx.fillText(line, layout.x, layout.y + i * lh);
    });
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
 * Renders the Dubai License DEMO overlay on the uploaded template.
 * The template image is drawn exactly as uploaded — no artwork is redrawn.
 */
export function renderDubaiLicense(
  canvas: HTMLCanvasElement,
  snap: DubaiLicenseSnapshot,
  bgImg: HTMLImageElement | null,
  scale = 1,
  highlight?: DubaiOverlayKey,
  photoImg: HTMLImageElement | null = null,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = DUBAI_DOC_WIDTH;
  const H = DUBAI_DOC_HEIGHT;
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

  for (const key of DUBAI_FIELD_ORDER) {
    const layout = snap.layouts[key] ?? DUBAI_DEFAULT_LAYOUTS[key];
    renderDubaiValue(ctx, snap[key], layout);
  }

  if (highlight === 'photo') {
    strokeBox(ctx, photoX, photoY, photoW, photoH);
  } else if (highlight) {
    const layout = snap.layouts[highlight] ?? DUBAI_DEFAULT_LAYOUTS[highlight];
    const text = snap[highlight] || ' ';
    ctx.save();
    ctx.font = fontFor(layout);
    const rtl = layout.align === 'right';
    ctx.textAlign = rtl ? 'right' : 'left';
    const lines = text.split('\n');
    const w = Math.max(48, ...lines.map((line) => ctx.measureText(line || ' ').width));
    const h = layout.fontSize * 1.35 * Math.max(1, lines.length);
    const left = rtl ? layout.x - w : layout.x;
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 5]);
    ctx.strokeRect(left - 6, layout.y - layout.fontSize, w + 12, h);
    ctx.restore();
  }
}
