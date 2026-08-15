import type { TinLayout, TINSnapshot } from '../editor/types';
import { TIN_DEFAULT_LAYOUTS, TIN_DOC_HEIGHT, TIN_DOC_WIDTH, TIN_FIELD_ORDER } from '../constants/tin';

/**
 * TIN certificate template renderer for document.bd.
 *
 * The uploaded reference certificate (public/assets/E TIN.jpg) is drawn as the
 * actual template background, scaled to the A4 portrait canvas (2480×3508 @
 * 300 DPI). Editable record values are overlaid at the per-field layout boxes
 * (defaults derived from the reference via OCR × 1.5). The template image is
 * kept exactly as uploaded — no DEMO watermark is stamped over it; disclosure
 * lives in the app UI and in the QR scan payload.
 */

const INK = '#0b1220';
const MUTED = '#5b6b66';
// The certificate body is printed in a serif face; the same stack keeps
// overlaid values visually consistent (Times in browsers, Liberation/DejaVu
// Serif in the node renderer).
const VALUE_FONT = "'Times New Roman','Liberation Serif','DejaVu Serif',serif";

/** Word-wrap that also hard-splits words longer than the available width. */
export function wrapTinText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let cur = '';
  const fits = (candidate: string) => ctx.measureText(candidate).width <= maxWidth;
  for (const word of words) {
    // Hard-split any single word that is wider than the available box.
    let w = word;
    while (ctx.measureText(w).width > maxWidth && w.length > 1) {
      let cut = w.length - 1;
      while (cut > 1 && ctx.measureText(w.slice(0, cut)).width > maxWidth) cut--;
      const piece = w.slice(0, cut);
      if (cur) {
        lines.push(cur);
        cur = '';
      }
      lines.push(piece);
      w = w.slice(cut);
    }
    const candidate = cur ? `${cur} ${w}` : w;
    if (cur && !fits(candidate)) {
      lines.push(cur);
      cur = w;
    } else {
      cur = candidate;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Draws one editable value inside its layout box honouring the field layout. */
export function renderTinValue(
  ctx: CanvasRenderingContext2D,
  text: string,
  layout: TinLayout,
): void {
  if (!text) return;
  const font = `${layout.fontWeight === 'bold' ? 'bold ' : ''}${layout.fontSize}px ${VALUE_FONT}`;
  ctx.save();
  ctx.font = font;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK;
  const lines = wrapTinText(ctx, text, Math.max(10, layout.width));
  const lineH = layout.fontSize * layout.lineHeight;
  const maxLines = Math.max(1, Math.floor(Math.max(1, layout.height) / lineH));
  for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
    const t = lines[i];
    const y = layout.y + i * lineH + layout.fontSize * 0.82;
    const textW = ctx.measureText(t).width;
    let x = layout.x;
    if (layout.align === 'center') x = layout.x + (layout.width - textW) / 2;
    else if (layout.align === 'right') x = layout.x + layout.width - textW;
    else if (layout.align === 'justify') {
      const words = t.split(' ');
      if (words.length > 1 && i < Math.min(lines.length, maxLines) - 1) {
        const wordsW = words.reduce((acc, w) => acc + ctx.measureText(w).width, 0);
        const gaps = words.length - 1;
        const gap = (layout.width - wordsW) / gaps;
        let rx = layout.x;
        for (const w of words) {
          ctx.fillText(w, rx, y);
          rx += ctx.measureText(w).width + gap;
        }
        continue;
      }
      x = layout.x;
    }
    ctx.fillText(t, x, y);
  }
  ctx.restore();
}

/** Draws the regenerated DEMO QR code on the template's blank bottom-left area. */
function drawQr(ctx: CanvasRenderingContext2D, snap: TINSnapshot, qrImg: HTMLImageElement | null): void {
  const size = Math.max(40, snap.qrSize);
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(snap.qrX - 6, snap.qrY - 6, size + 12, size + 12);
  ctx.strokeStyle = '#c9d1d6';
  ctx.lineWidth = 2;
  ctx.strokeRect(snap.qrX - 6, snap.qrY - 6, size + 12, size + 12);
  if (qrImg && qrImg.complete && qrImg.naturalWidth > 0) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(qrImg, snap.qrX, snap.qrY, size, size);
  } else {
    ctx.fillStyle = '#f1f4f3';
    ctx.fillRect(snap.qrX, snap.qrY, size, size);
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "bold 28px 'Arial Regular',Arial,sans-serif";
    ctx.fillText('QR', snap.qrX + size / 2, snap.qrY + size / 2);
  }
  ctx.restore();
}

/**
 * Renders the full TIN certificate. `bgImg` is the uploaded reference template
 * (scaled to fill the A4 canvas). `qrImg` is the QR generated from the current
 * record (null until fonts/QR are ready).
 */
export function renderTINDocument(
  canvas: HTMLCanvasElement,
  snap: TINSnapshot,
  qrImg: HTMLImageElement | null,
  scale = 1,
  bgImg: HTMLImageElement | null = null,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = TIN_DOC_WIDTH;
  const H = TIN_DOC_HEIGHT;
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  if (scale !== 1) ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Page + the uploaded reference template.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
    ctx.drawImage(bgImg, 0, 0, W, H);
  }

  for (const key of TIN_FIELD_ORDER) {
    const layout = snap.layouts[key] ?? TIN_DEFAULT_LAYOUTS[key];
    renderTinValue(ctx, snap[key], layout);
  }

  drawQr(ctx, snap, qrImg);
}
