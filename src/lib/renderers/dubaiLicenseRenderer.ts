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

export type DubaiImageSource = CanvasImageSource | HTMLImageElement | HTMLCanvasElement | null;

function sourceSize(src: DubaiImageSource): { w: number; h: number } | null {
  if (!src) return null;
  if (typeof HTMLImageElement !== 'undefined' && src instanceof HTMLImageElement) {
    if (!src.complete) return null;
    const w = src.naturalWidth || src.width;
    const h = src.naturalHeight || src.height;
    return w > 0 && h > 0 ? { w, h } : null;
  }
  if (typeof HTMLCanvasElement !== 'undefined' && src instanceof HTMLCanvasElement) {
    return src.width > 0 && src.height > 0 ? { w: src.width, h: src.height } : null;
  }
  const anySrc = src as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number; complete?: boolean };
  if (anySrc.complete === false) return null;
  const w = Number(anySrc.naturalWidth || anySrc.width || 0);
  const h = Number(anySrc.naturalHeight || anySrc.height || 0);
  return w > 0 && h > 0 ? { w, h } : null;
}

function isDrawableSource(src: DubaiImageSource): src is NonNullable<DubaiImageSource> {
  return sourceSize(src) !== null;
}

/** Cover-fit the photo into the frame (object-fit: cover), centered and clipped. */
export function drawPhotoCover(
  ctx: CanvasRenderingContext2D,
  photo: NonNullable<DubaiImageSource>,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const size = sourceSize(photo);
  if (!size || w <= 0 || h <= 0) return;
  const destX = Math.round(x);
  const destY = Math.round(y);
  const destW = Math.max(1, Math.round(w));
  const destH = Math.max(1, Math.round(h));
  const scale = Math.max(destW / size.w, destH / size.h);
  const srcW = destW / scale;
  const srcH = destH / scale;
  const srcX = (size.w - srcW) / 2;
  const srcY = (size.h - srcH) / 2;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath();
  ctx.rect(destX, destY, destW, destH);
  ctx.clip();
  ctx.drawImage(
    photo as CanvasImageSource,
    srcX,
    srcY,
    srcW,
    srcH,
    destX,
    destY,
    destW,
    destH,
  );
  ctx.restore();
}

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
  bgImg: DubaiImageSource,
  scale = 1,
  highlight?: DubaiOverlayKey,
  photoImg: DubaiImageSource = null,
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
  if (isDrawableSource(bgImg)) {
    ctx.drawImage(bgImg as CanvasImageSource, 0, 0, W, H);
  }

  const photoW = Math.min(Math.max(snap.photoW || 40, 40), W);
  const photoH = Math.min(Math.max(snap.photoH || 40, 40), H);
  const photoX = Number.isFinite(snap.photoX) ? snap.photoX : 0;
  const photoY = Number.isFinite(snap.photoY) ? snap.photoY : 0;
  if (isDrawableSource(photoImg)) {
    drawPhotoCover(ctx, photoImg, photoX, photoY, photoW, photoH);
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
