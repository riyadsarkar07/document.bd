import type { NIDSnapshot } from '../editor/types';

/**
 * Faithful port of the original `nidRenderCard` from legacy/index.html.
 * Absolute positioning and font strings preserved 1:1.
 */
export function renderNIDCard(
  canvas: HTMLCanvasElement,
  snap: NIDSnapshot,
  bgImg: HTMLImageElement | null,
  profilePhoto: HTMLImageElement | null,
  scale = 1,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const W = bgImg ? bgImg.naturalWidth : 856;
  const H = bgImg ? bgImg.naturalHeight : 540;
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  if (scale !== 1) ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic';

  if (bgImg) {
    ctx.drawImage(bgImg, 0, 0, W, H);
  } else {
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
    ctx.save();
    ctx.font = 'italic 14px sans-serif';
    ctx.fillStyle = '#aaa';
    ctx.textAlign = 'center';
    ctx.fillText('[ nid-bg.png not found ]', W / 2, 24);
    ctx.restore();
  }

  // photoW/photoH clamp to [20,1000] — mirrors the native range-input clamp of
  // the original app (defaults 400 within the slider range 20–1000).
  const photoW = Math.min(Math.max(snap.photoW, 20), 1000);
  const photoH = Math.min(Math.max(snap.photoH, 20), 1000);

  if (profilePhoto && profilePhoto.complete) {
    ctx.save();
    ctx.drawImage(profilePhoto, snap.photoX, snap.photoY, photoW, photoH);
    ctx.restore();
  }

  ctx.save();
  ctx.textBaseline = 'alphabetic';

  if (snap.nameBangla) {
    ctx.font = `bold ${snap.nameBanglaSize}px 'Kalpurush Bold','Kalpurush',serif`;
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.fillText(snap.nameBangla, snap.nameBanglaX, snap.nameBanglaY);
  }

  if (snap.nameEnglish) {
    ctx.font = `${snap.nameEnglishSize}px 'Arial Regular',Arial,sans-serif`;
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.fillText(snap.nameEnglish, snap.nameEnglishX, snap.nameEnglishY);
  }

  if (snap.pitaName) {
    ctx.font = `${snap.pitaSize}px 'Kalpurush',serif`;
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.fillText(snap.pitaName, snap.pitaX, snap.pitaY);
  }

  if (snap.mataName) {
    ctx.font = `${snap.mataSize}px 'Kalpurush',serif`;
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.fillText(snap.mataName, snap.mataX, snap.mataY);
  }

  if (snap.dob) {
    ctx.font = `${snap.dobSize}px 'Arial Regular',Arial,sans-serif`;
    ctx.fillStyle = '#ff0000';
    ctx.textAlign = 'left';
    ctx.fillText(snap.dob, snap.dobX, snap.dobY);
  }

  if (snap.idNo) {
    ctx.font = `bold ${snap.idNoSize}px 'Arial Bold',Arial,sans-serif`;
    ctx.fillStyle = '#ff0000';
    ctx.textAlign = 'left';
    ctx.fillText(snap.idNo, snap.idNoX, snap.idNoY);
  }

  ctx.restore();
}
