import type { UnhcrFieldKey, UnhcrLayout, UnhcrSnapshot } from '../editor/types';
import { UNHCR_DEFAULT_LAYOUTS, UNHCR_DOC_HEIGHT, UNHCR_DOC_WIDTH, UNHCR_FIELD_ORDER } from '../constants/unhcr';

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

export function renderUnhcrCard(
  canvas: HTMLCanvasElement,
  snap: UnhcrSnapshot,
  bgImg: HTMLImageElement | null,
  scale = 1,
  highlight?: UnhcrFieldKey | 'photo',
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

  if (highlight === 'photo') {
    ctx.save();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 6]);
    ctx.strokeRect(photoX - 3, photoY - 3, photoW + 6, photoH + 6);
    ctx.restore();
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
