import type { TinFieldKey, TinLayout, TINSnapshot } from '../editor/types';
import { TIN_DOC_HEIGHT, TIN_DOC_WIDTH, TIN_FIELD_ORDER, TIN_LABELS } from '../constants/tin';

/**
 * Original DEMO TIN record renderer for document.bd.
 *
 * Draws an A4 portrait page (2480×3508 @ 300 DPI) with a labelled form, an
 * explicit "DEMO RECORD — NOT OFFICIAL NBR VERIFICATION" watermark/banner, and
 * a DEMO QR block. It is an original layout loosely inspired by TIN record
 * registration documents — NOT a reproduction of an official NBR certificate.
 */

export const TIN_ROW_BOXES: Record<TinFieldKey, { x: number; y: number; w: number; h: number }> = {
  tinNo: { x: 780, y: 600, w: 1460, h: 90 },
  taxpayerName: { x: 780, y: 710, w: 1460, h: 90 },
  dob: { x: 780, y: 820, w: 1460, h: 90 },
  fatherName: { x: 780, y: 930, w: 1460, h: 90 },
  motherName: { x: 780, y: 1040, w: 1460, h: 90 },
  previousTin: { x: 780, y: 1150, w: 1460, h: 90 },
  status: { x: 780, y: 1260, w: 1460, h: 90 },
  taxZone: { x: 780, y: 1370, w: 1460, h: 90 },
  taxCircle: { x: 780, y: 1480, w: 1460, h: 90 },
  date: { x: 780, y: 1590, w: 1460, h: 90 },
  currentAddress: { x: 780, y: 1700, w: 1460, h: 180 },
  permanentAddress: { x: 780, y: 1900, w: 1460, h: 180 },
  deputyInfo: { x: 780, y: 2100, w: 1460, h: 140 },
};

const INK = '#0b1220';
const GREEN = '#0b3d2e';
const RED = '#b91c1c';
const BOX_FILL = '#f6f8f7';
const BOX_BORDER = '#d8dde3';
const MUTED = '#5b6b66';

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

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

/** Draws one editable value inside its cell honouring the field layout. */
export function renderTinValue(
  ctx: CanvasRenderingContext2D,
  text: string,
  layout: TinLayout,
): void {
  if (!text) return;
  const font = `${layout.fontWeight === 'bold' ? 'bold ' : ''}${layout.fontSize}px 'Arial Regular',Arial,sans-serif`;
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

function centerText(
  ctx: CanvasRenderingContext2D,
  text: string,
  y: number,
  size: number,
  weight: string,
  color: string,
  font = "'Arial Regular',Arial,sans-serif",
): void {
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.fillText(text, TIN_DOC_WIDTH / 2, y);
  ctx.restore();
}

function drawHeader(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.fillStyle = GREEN;
  ctx.fillRect(0, 0, TIN_DOC_WIDTH, 16);
  centerText(ctx, "GOVERNMENT OF THE PEOPLE'S REPUBLIC OF BANGLADESH", 112, 40, 'normal', '#1e3a2f');
  centerText(ctx, 'জাতীয় রাজস্ব বোর্ড', 236, 74, 'normal', GREEN, "'Kalpurush','Kalpurush Bold',serif");
  centerText(ctx, 'NATIONAL BOARD OF REVENUE', 348, 58, 'bold', GREEN);
  centerText(ctx, 'Tax Identification Number (TIN) — DEMO RECORD', 448, 42, 'bold', INK);

  // DEMO banner badge
  const badge = 'DEMO RECORD — NOT AN OFFICIAL NBR CERTIFICATE';
  ctx.save();
  ctx.font = "bold 34px 'Arial Regular',Arial,sans-serif";
  const bw = ctx.measureText(badge).width + 56;
  const bx = TIN_DOC_WIDTH / 2 - bw / 2;
  const by = 476;
  roundRect(ctx, bx, by, bw, 60, 30);
  ctx.fillStyle = '#fdeaea';
  ctx.fill();
  ctx.strokeStyle = RED;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = RED;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badge, TIN_DOC_WIDTH / 2, by + 32);
  ctx.restore();
}

function drawWatermark(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.translate(TIN_DOC_WIDTH / 2, TIN_DOC_HEIGHT / 2);
  ctx.rotate(-0.46);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(185, 28, 28, 0.06)';
  ctx.font = "bold 540px 'Arial Regular',Arial,sans-serif";
  ctx.fillText('DEMO RECORD', 0, -120);
  ctx.font = "bold 210px 'Arial Regular',Arial,sans-serif";
  ctx.fillText('NOT OFFICIAL NBR VERIFICATION', 0, 200);
  ctx.restore();
}

function drawForm(ctx: CanvasRenderingContext2D, snap: TINSnapshot): void {
  ctx.save();
  const labelX = 300;
  for (const key of TIN_FIELD_ORDER) {
    const box = TIN_ROW_BOXES[key];
    const label = TIN_LABELS[key];

    // label
    ctx.font = "bold 38px 'Arial Regular',Arial,sans-serif";
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1e3a2f';
    ctx.fillText(label, labelX, box.y + box.h / 2);

    // value cell (the "blank area" bound to the inspector)
    ctx.save();
    roundRect(ctx, box.x, box.y, box.w, box.h, 10);
    ctx.fillStyle = BOX_FILL;
    ctx.fill();
    ctx.strokeStyle = BOX_BORDER;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    renderTinValue(ctx, snap[key], snap.layouts[key]);
  }

  // divider above the QR / seal area
  ctx.strokeStyle = '#c9d1d6';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(240, 2270);
  ctx.lineTo(2240, 2270);
  ctx.stroke();
  ctx.restore();
}

function drawStampBlock(ctx: CanvasRenderingContext2D): void {
  const x = 1500;
  const y = 2380;
  const w = 720;
  const h = 700;
  ctx.save();

  roundRect(ctx, x, y, w, h, 14);
  ctx.fillStyle = '#fbfcfb';
  ctx.fill();
  ctx.strokeStyle = BOX_BORDER;
  ctx.lineWidth = 2;
  ctx.stroke();

  centerText(ctx, 'Office of the Deputy Commissioner of Taxes', y + 70, 32, 'normal', '#1e3a2f');
  centerText(ctx, '(DEMO)', y + 112, 30, 'bold', MUTED);

  // DEMO seal circle
  const cx = x + w / 2;
  const cy = y + h / 2 - 30;
  ctx.save();
  ctx.strokeStyle = RED;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, 130, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 118, 0, Math.PI * 2);
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = RED;
  ctx.font = "bold 46px 'Arial Regular',Arial,sans-serif";
  ctx.fillText('DEMO', cx, cy - 18);
  ctx.font = "bold 24px 'Arial Regular',Arial,sans-serif";
  ctx.fillText('NOT OFFICIAL', cx, cy + 30);
  ctx.restore();

  // signature line
  ctx.strokeStyle = '#9aa6a0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 60, y + h - 130);
  ctx.lineTo(x + w - 60, y + h - 130);
  ctx.stroke();
  ctx.font = "normal 28px 'Monotype Corsiva Bold Italic',cursive,serif";
  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.fillText('Authorised Signatory', x + w / 2, y + h - 150);
  ctx.font = "bold 26px 'Arial Regular',Arial,sans-serif";
  ctx.fillStyle = MUTED;
  ctx.fillText('DEMO ONLY — NOT AN OFFICIAL SEAL', x + w / 2, y + h - 66);
  ctx.restore();
}

function drawQr(ctx: CanvasRenderingContext2D, snap: TINSnapshot, qrImg: HTMLImageElement | null): void {
  const size = Math.max(40, snap.qrSize);
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(snap.qrX - 8, snap.qrY - 8, size + 16, size + 16);
  ctx.strokeStyle = BOX_BORDER;
  ctx.lineWidth = 2;
  ctx.strokeRect(snap.qrX - 8, snap.qrY - 8, size + 16, size + 16);
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
    ctx.font = "bold 30px 'Arial Regular',Arial,sans-serif";
    ctx.fillText('[ DEMO QR ]', snap.qrX + size / 2, snap.qrY + size / 2 - 18);
    ctx.font = "normal 26px 'Arial Regular',Arial,sans-serif";
    ctx.fillText('scan to view record', snap.qrX + size / 2, snap.qrY + size / 2 + 22);
  }

  const capY = snap.qrY + size + 56;
  ctx.textAlign = 'left';
  ctx.font = "bold 30px 'Arial Regular',Arial,sans-serif";
  ctx.fillStyle = '#1e3a2f';
  ctx.fillText('Scan to view the current DEMO record', snap.qrX, capY);
  ctx.font = "normal 27px 'Arial Regular',Arial,sans-serif";
  ctx.fillStyle = RED;
  ctx.fillText('DEMO QR — NOT an NBR verification code', snap.qrX, capY + 46);
  ctx.restore();
}

function drawFooter(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.strokeStyle = '#c9d1d6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(240, 3410);
  ctx.lineTo(2240, 3410);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = "bold 28px 'Arial Regular',Arial,sans-serif";
  ctx.fillStyle = RED;
  ctx.fillText('DEMO RECORD — NOT OFFICIAL NBR VERIFICATION', TIN_DOC_WIDTH / 2, 3450);
  ctx.font = "normal 26px 'Arial Regular',Arial,sans-serif";
  ctx.fillStyle = MUTED;
  ctx.fillText('Generated by Document Studio (document.bd) · For demonstration only', TIN_DOC_WIDTH / 2, 3492);
  ctx.restore();
}

/**
 * Renders the full DEMO TIN document. `qrImg` is the DEMO QR code generated
 * from the current record (null until fonts/QR are ready).
 */
export function renderTINDocument(
  canvas: HTMLCanvasElement,
  snap: TINSnapshot,
  qrImg: HTMLImageElement | null,
  scale = 1,
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

  // page
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  drawWatermark(ctx);
  drawHeader(ctx);
  drawForm(ctx, snap);
  drawStampBlock(ctx);
  drawQr(ctx, snap, qrImg);
  drawFooter(ctx);
}
