/**
 * Renderer migration verification.
 *
 * Proves the ported renderers in src/lib/renderers produce byte-identical
 * pixels to the original algorithms from legacy/index.html when run on the same
 * canvas engine (via @napi-rs/canvas), for identical snapshots.
 *
 * Also verifies:
 *  - every slider min/max/default/step from the legacy HTML matches the new
 *    constants module
 *  - every text default from the legacy JS matches the new constants module
 *  - canvas dimensions equal the background image natural size
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas, GlobalFonts, Image } from '@napi-rs/canvas';
import {
  TM_DEFAULTS,
  TM_SLIDERS,
} from '../src/lib/constants/tm';
import { NID_DEFAULTS, NID_SLIDERS } from '../src/lib/constants/nid';
import {
  TIN_DEFAULTS,
  TIN_DEFAULT_LAYOUTS,
  TIN_FIELD_ORDER,
  TIN_ROW_BOXES,
  normalizeTinSnapshot,
} from '../src/lib/constants/tin';
import { renderTMCertificate } from '../src/lib/renderers/tmRenderer';
import { renderNIDCard } from '../src/lib/renderers/nidRenderer';
import { renderTINDocument, wrapTinText } from '../src/lib/renderers/tinRenderer';
import { buildTinQrPayload, encodeDemoQr } from '../src/lib/tinQr';
import type { NIDSnapshot, TINSnapshot, TinFieldKey, TinLayout, TMSnapshot } from '../src/lib/editor/types';

const ROOT = process.cwd();
const legacyHtml = readFileSync(join(ROOT, 'legacy/index.html'), 'utf-8');

/* ────────────────────────── fonts ────────────────────────── */
const FONT_FILES: Record<string, string> = {
  'Arial Regular': 'public/assets/arial-regular.ttf',
  'Arial Bold': 'public/assets/arial-regular.ttf',
  'Monotype Corsiva Bold Italic': 'public/assets/monotype-corsiva-bold-italic.otf',
  Kalpurush: 'public/assets/kalpurush.ttf',
  'Kalpurush Bold': 'public/assets/kalpurush.ttf',
};
for (const [family, file] of Object.entries(FONT_FILES)) {
  const ok = GlobalFonts.registerFromPath(join(ROOT, file), family);
  if (!ok) {
    console.warn(`[fonts] could not register ${family}`);
  }
}

function loadImage(path: string): Promise<Image | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = readFileSync(join(ROOT, path));
  });
}

/* ────────────────────────── ORIGINAL TM RENDERER (verbatim from legacy) ────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function originalTmRenderToCanvas(canvas: any, snap: TMSnapshot, bgImg: any, customLogoImg: any, signImg: any) {
  const ctx = canvas.getContext('2d');

  const W = bgImg ? bgImg.naturalWidth : 1200;
  const H = bgImg ? bgImg.naturalHeight : 1650;
  canvas.width = W;
  canvas.height = H;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  if (bgImg) {
    ctx.drawImage(bgImg, 0, 0, W, H);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
  }

  const { arialSize, corsivSize, sealSize, blueDateSize, tmX, tmY, dateX, dateY, paraY, logoY, logoSize, sealX, sealY, blueX, blueY, logoTextSize, logoTextX, logoTextY } = snap;

  const cleanTm = (snap.trademarkNo || '').replace(/^Trademark\s*No\.\s*/i, '').trim();
  const cleanDate = (snap.regDate || '').replace(/^Date:\s*/i, '').trim();
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.font = `bold ${arialSize}px 'Arial Regular',sans-serif`;
  ctx.fillText(`Trademark No. ${cleanTm}`, tmX, tmY);
  ctx.fillText(`Date: ${cleanDate}`, dateX, dateY);
  ctx.restore();

  const italicSeg = `${snap.companyName}, Proprietor, ${snap.ownerName}, ${snap.address} ${snap.compType},`;
  const normalSeg = `${snap.middleTextArial} ${cleanTm} as of the date ${snap.appDate}.`;
  const masterTokens: { word: string; type: 'normal' | 'italic' }[] = [];
  const tk = (txt: string, sty: 'normal' | 'italic') => {
    if (!txt) return;
    txt.split(/\s+/).filter(Boolean).forEach((w) => masterTokens.push({ word: w, type: sty }));
  };
  tk(snap.openingText, 'normal');
  tk(italicSeg, 'italic');
  tk(normalSeg, 'normal');
  tk(snap.goodsDesc, 'italic');
  const fontMap: Record<string, string> = {
    normal: `bold ${arialSize}px 'Arial Regular',sans-serif`,
    italic: `italic bold ${corsivSize}px 'Monotype Corsiva Bold Italic',cursive,serif`,
  };
  const linePad: Record<string, number> = { normal: arialSize + 14, italic: corsivSize + 14 };
  const leftBound = W * 0.12;
  const maxWidth = W * 0.82;
  const lines: typeof masterTokens[] = [];
  let cur: typeof masterTokens = [];
  for (let i = 0; i < masterTokens.length; i++) {
    const tok = masterTokens[i];
    ctx.font = fontMap[tok.type];
    let lineW = 0;
    cur.forEach((it, ix) => {
      ctx.font = fontMap[it.type];
      lineW += ctx.measureText(it.word).width;
      if (ix < cur.length - 1) lineW += ctx.measureText(' ').width;
    });
    if (cur.length > 0) {
      ctx.font = fontMap[cur[cur.length - 1].type];
      lineW += ctx.measureText(' ').width;
    }
    ctx.font = fontMap[tok.type];
    lineW += ctx.measureText(tok.word).width;
    if (lineW > maxWidth && cur.length > 0) {
      lines.push(cur);
      cur = [tok];
    } else {
      cur.push(tok);
    }
  }
  if (cur.length > 0) lines.push(cur);
  let curY = paraY;
  for (let r = 0; r < lines.length; r++) {
    const lt = lines[r];
    const isLast = r === lines.length - 1;
    let rawW = 0;
    lt.forEach((t) => {
      ctx.font = fontMap[t.type];
      rawW += ctx.measureText(t.word).width;
    });
    let maxPad = 38;
    lt.forEach((t) => {
      if (linePad[t.type] > maxPad) maxPad = linePad[t.type];
    });
    curY += maxPad;
    let rx = leftBound;
    if (isLast || lt.length <= 1) {
      lt.forEach((tok) => {
        ctx.font = fontMap[tok.type];
        ctx.fillStyle = '#000';
        ctx.fillText(tok.word, rx, curY);
        rx += ctx.measureText(tok.word).width + ctx.measureText(' ').width;
      });
    } else {
      const gaps = lt.length - 1;
      const just = (maxWidth - rawW) / gaps;
      lt.forEach((tok) => {
        ctx.font = fontMap[tok.type];
        ctx.fillStyle = '#000';
        ctx.fillText(tok.word, rx, curY);
        rx += ctx.measureText(tok.word).width + just;
      });
    }
  }

  if (customLogoImg && customLogoImg.complete) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const pad = 16;
    const bxW = logoSize + pad * 2;
    const bxH = logoSize + pad * 2;
    const bxX = (W - bxW) / 2;
    ctx.fillStyle = '#fff';
    ctx.fillRect(bxX, logoY, bxW, bxH);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(bxX, logoY, bxW, bxH);
    ctx.drawImage(customLogoImg, bxX + pad, logoY + pad, logoSize, logoSize);
    ctx.restore();
  }

  if (snap.logoText) {
    ctx.save();
    ctx.font = `bold ${logoTextSize}px 'Arial Regular',sans-serif`;
    const tw = ctx.measureText(snap.logoText).width;
    const px = 24;
    const py = 20;
    const bxW = tw + px * 2;
    const bxH = logoTextSize + py * 2;
    const bxX = logoTextX - bxW / 2;
    const bxY = logoTextY - bxH / 2;
    ctx.fillStyle = '#fff';
    ctx.fillRect(bxX, bxY, bxW, bxH);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(bxX, bxY, bxW, bxH);
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(snap.logoText, logoTextX, logoTextY + logoTextSize * 0.05);
    ctx.restore();
  }

  if (snap.sealedTextPhrase) {
    ctx.save();
    ctx.font = `bold ${sealSize}px 'Arial Regular',sans-serif`;
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText(snap.sealedTextPhrase, sealX, sealY);
    ctx.restore();
  }

  if (snap.sealedDate) {
    ctx.save();
    ctx.font = `bold ${blueDateSize}px 'Arial Regular',sans-serif`;
    ctx.fillStyle = '#1e40af';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText(snap.sealedDate, blueX, blueY);
    ctx.restore();
  }

  if (signImg && signImg.complete) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const ratio = signImg.naturalHeight / signImg.naturalWidth;
    const sWidth = snap.signSize;
    const sHeight = snap.signSize * ratio;
    ctx.drawImage(signImg, snap.signX, snap.signY, sWidth, sHeight);
    ctx.restore();
  }
}

/* ────────────────────────── ORIGINAL NID RENDERER (verbatim from legacy, with browser range clamp) ────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function originalNidRenderCard(canvas: any, snap: NIDSnapshot, bgImg: any, profilePhoto: any) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const W = bgImg ? bgImg.naturalWidth : 856;
  const H = bgImg ? bgImg.naturalHeight : 540;
  canvas.width = W;
  canvas.height = H;
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

  // replicate browser <input type=range> clamping of photoW/photoH
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

/* ────────────────────────── comparison helpers ────────────────────────── */
function buffersEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  // quick pre-check on random sample
  return a.equals(b);
}

function renderBothTM(
  snap: TMSnapshot,
  bg: Image | null,
  logo: Image | null,
  sign: Image | null,
) {
  const c1 = createCanvas(1, 1);
  originalTmRenderToCanvas(c1, snap, bg, logo, sign);
  const c2 = createCanvas(1, 1);
  renderTMCertificate(c2 as unknown as HTMLCanvasElement, snap, bg as HTMLImageElement | null, logo as HTMLImageElement | null, sign as HTMLImageElement | null);
  return {
    original: {
      buffer: Buffer.from(c1.getContext('2d')!.getImageData(0, 0, c1.width, c1.height).data.buffer),
      w: c1.width,
      h: c1.height,
    },
    ported: {
      buffer: Buffer.from(c2.getContext('2d')!.getImageData(0, 0, c2.width, c2.height).data.buffer),
      w: c2.width,
      h: c2.height,
    },
  };
}

function renderBothNID(snap: NIDSnapshot, bg: Image | null, photo: Image | null) {
  const c1 = createCanvas(1, 1);
  originalNidRenderCard(c1, snap, bg, photo);
  const c2 = createCanvas(1, 1);
  renderNIDCard(c2 as unknown as HTMLCanvasElement, snap, bg as HTMLImageElement | null, photo as HTMLImageElement | null);
  return {
    original: {
      buffer: Buffer.from(c1.getContext('2d')!.getImageData(0, 0, c1.width, c1.height).data.buffer),
      w: c1.width,
      h: c1.height,
    },
    ported: {
      buffer: Buffer.from(c2.getContext('2d')!.getImageData(0, 0, c2.width, c2.height).data.buffer),
      w: c2.width,
      h: c2.height,
    },
  };
}

/* ────────────────────────── legacy parsing ────────────────────────── */
function extractRangeConfigs(prefix: string): Record<string, { min: number; max: number; value: number }> {
  const out: Record<string, { min: number; max: number; value: number }> = {};
  const re = new RegExp(
    `id="${prefix}-sl_([^"]+)"[^>]*min="([\\d.]+)"[^>]*max="([\\d.]+)"[^>]*value="([\\d.]+)"`,
    'g',
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(legacyHtml)) !== null) {
    out[m[1]] = { min: parseFloat(m[2]), max: parseFloat(m[3]), value: parseFloat(m[4]) };
  }
  return out;
}

function extractTextDefaults(): Record<string, string> {
  const out: Record<string, string> = {};
  // TM inputs
  const tmIds = ['tm-trademarkNo', 'tm-regDate', 'tm-appDate', 'tm-companyName', 'tm-ownerName', 'tm-compType', 'tm-middleTextArial', 'tm-logoText'];
  for (const id of tmIds) {
    const m = legacyHtml.match(new RegExp(`id="${id}"[^>]*value="([^"]*)"`));
    if (m) out[id] = m[1];
  }
  // Textareas
  const ta = legacyHtml.match(/id="tm-openingText"[^>]*>([\s\S]*?)<\/textarea>/);
  if (ta) out['tm-openingText'] = ta[1];
  const gd = legacyHtml.match(/id="tm-goodsDesc"[^>]*>([\s\S]*?)<\/textarea>/);
  if (gd) out['tm-goodsDesc'] = gd[1];
  const sp = legacyHtml.match(/id="tm-sealedTextPhrase"[^>]*>([\s\S]*?)<\/textarea>/);
  if (sp) out['tm-sealedTextPhrase'] = sp[1];
  const ad = legacyHtml.match(/id="tm-address"[^>]*>([\s\S]*?)<\/textarea>/);
  if (ad) out['tm-address'] = ad[1];
  // NID inputs
  const nidIds = ['nid-nameBangla', 'nid-nameEnglish', 'nid-pitaName', 'nid-mataName', 'nid-dob', 'nid-idNo'];
  for (const id of nidIds) {
    const m = legacyHtml.match(new RegExp(`id="${id}"[^>]*value="([^"]*)"`));
    if (m) out[id] = m[1];
  }
  return out;
}

/* ────────────────────────── assertions ────────────────────────── */
let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.error(`  FAIL  ${label}`);
  }
}

async function main() {
  console.log('Renderer migration verification\n');
  console.log('· Loading assets…');
  const certBg = await loadImage('public/assets/cert-bangladesh.png');
  const nidBg = await loadImage('public/assets/nid-bg.png');
  const sign = await loadImage('public/assets/sign remove.png');

  console.log('\n[1] Canvas dimensions (must equal background natural size)\n');
  assert(certBg?.naturalWidth === 2373 && certBg?.naturalHeight === 3508, 'cert-bangladesh.png = 2373×3508');
  assert(nidBg?.naturalWidth === 3570 && nidBg?.naturalHeight === 2203, 'nid-bg.png = 3570×2203');

  console.log('\n[2] Slider min/max/default parity (legacy HTML vs new constants)\n');
  const tmLegacyRanges = extractRangeConfigs('tm');
  const nidLegacyRanges = extractRangeConfigs('nid');
  for (const [key, spec] of Object.entries(TM_SLIDERS)) {
    const legacy = tmLegacyRanges[key];
    assert(Boolean(legacy), `TM slider ${key} found in legacy`);
    if (legacy) {
      assert(spec.min === legacy.min, `TM ${key}.min ${spec.min}==${legacy.min}`);
      assert(spec.max === legacy.max, `TM ${key}.max ${spec.max}==${legacy.max}`);
      assert(spec.default === legacy.value, `TM ${key}.default ${spec.default}==${legacy.value}`);
    }
  }
  for (const [key, spec] of Object.entries(NID_SLIDERS)) {
    const legacy = nidLegacyRanges[key];
    assert(Boolean(legacy), `NID slider ${key} found in legacy`);
    if (legacy) {
      assert(spec.min === legacy.min, `NID ${key}.min ${spec.min}==${legacy.min}`);
      assert(spec.max === legacy.max, `NID ${key}.max ${spec.max}==${legacy.max}`);
      assert(spec.default === legacy.value, `NID ${key}.default ${spec.default}==${legacy.value}`);
    }
  }

  console.log('\n[3] Text defaults parity (legacy HTML vs new constants)\n');
  const textDefaults = extractTextDefaults();
  assert(TM_DEFAULTS.trademarkNo === textDefaults['tm-trademarkNo'], `TM trademarkNo "${TM_DEFAULTS.trademarkNo}"`);
  assert(TM_DEFAULTS.regDate === textDefaults['tm-regDate'], `TM regDate "${TM_DEFAULTS.regDate}"`);
  assert(TM_DEFAULTS.appDate === textDefaults['tm-appDate'], `TM appDate "${TM_DEFAULTS.appDate}"`);
  assert(TM_DEFAULTS.companyName === textDefaults['tm-companyName'], `TM companyName "${TM_DEFAULTS.companyName}"`);
  assert(TM_DEFAULTS.ownerName === textDefaults['tm-ownerName'], `TM ownerName "${TM_DEFAULTS.ownerName}"`);
  assert(TM_DEFAULTS.compType === textDefaults['tm-compType'], `TM compType "${TM_DEFAULTS.compType}"`);
  assert(TM_DEFAULTS.middleTextArial === textDefaults['tm-middleTextArial'], `TM middleTextArial "${TM_DEFAULTS.middleTextArial}"`);
  assert(TM_DEFAULTS.logoText === textDefaults['tm-logoText'], `TM logoText "${TM_DEFAULTS.logoText}"`);
  assert(TM_DEFAULTS.openingText === textDefaults['tm-openingText'], `TM openingText "${TM_DEFAULTS.openingText}"`);
  assert(TM_DEFAULTS.goodsDesc === textDefaults['tm-goodsDesc'], `TM goodsDesc "${TM_DEFAULTS.goodsDesc}"`);
  assert(TM_DEFAULTS.sealedTextPhrase === textDefaults['tm-sealedTextPhrase'], `TM sealedTextPhrase "${TM_DEFAULTS.sealedTextPhrase}"`);
  assert(TM_DEFAULTS.address === textDefaults['tm-address'], `TM address "${TM_DEFAULTS.address}"`);
  assert(NID_DEFAULTS.nameBangla === textDefaults['nid-nameBangla'], `NID nameBangla "${NID_DEFAULTS.nameBangla}"`);
  assert(NID_DEFAULTS.nameEnglish === textDefaults['nid-nameEnglish'], `NID nameEnglish "${NID_DEFAULTS.nameEnglish}"`);
  assert(NID_DEFAULTS.pitaName === textDefaults['nid-pitaName'], `NID pitaName "${NID_DEFAULTS.pitaName}"`);
  assert(NID_DEFAULTS.mataName === textDefaults['nid-mataName'], `NID mataName "${NID_DEFAULTS.mataName}"`);
  assert(NID_DEFAULTS.dob === textDefaults['nid-dob'], `NID dob "${NID_DEFAULTS.dob}"`);
  assert(NID_DEFAULTS.idNo === textDefaults['nid-idNo'], `NID idNo "${NID_DEFAULTS.idNo}"`);

  console.log('\n[4] Numeric defaults parity (JS defaults vs new constants)\n');
  const tmDefaultsRe = /const TM_DEFAULTS\s*=\s*\{([\s\S]*?)\};/;
  const tmDefaultsBlock = tmDefaultsRe.exec(legacyHtml)?.[1] ?? '';
  for (const [key, value] of Object.entries(TM_DEFAULTS)) {
    if (typeof value !== 'number') continue;
    const m = tmDefaultsBlock.match(new RegExp(`\\b${key}\\s*:\\s*([\\d.]+)`));
    assert(m ? parseFloat(m[1]) === value : false, `TM_DEFAULTS.${key} = ${value}`);
  }
  const nidDefaultsRe = /const NID_CARD_DEFAULTS\s*=\s*\{([\s\S]*?)\};/;
  const nidDefaultsBlock = nidDefaultsRe.exec(legacyHtml)?.[1] ?? '';
  for (const [key, value] of Object.entries(NID_DEFAULTS)) {
    if (typeof value !== 'number') continue;
    const m = nidDefaultsBlock.match(new RegExp(`\\b${key}\\s*:\\s*([\\d.]+)`));
    assert(m ? parseFloat(m[1]) === value : false, `NID_CARD_DEFAULTS.${key} = ${value}`);
  }

  console.log('\n[5] Pixel-identical rendering (original vs ported)\n');
  const tmDefault = { ...TM_DEFAULTS };
  const r1 = renderBothTM(tmDefault, certBg, null, sign);
  assert(r1.original.w === 2373 && r1.original.h === 3508, `TM canvas 2373×3508 (got ${r1.original.w}×${r1.original.h})`);
  assert(r1.ported.w === r1.original.w && r1.ported.h === r1.original.h, 'TM canvas dimensions match');
  assert(buffersEqual(r1.original.buffer, r1.ported.buffer), 'TM default render — pixels identical');

  // TM with logo + logo text (exercises custom logo box + logoText box branches)
  const logoImg = await loadImage('public/assets/nid-bg.png');
  const tmCustom = {
    ...TM_DEFAULTS,
    logoText: 'TTN',
    companyName: 'The Territorial News (TTN) Media Ltd',
    goodsDesc: 'online news publishing; digital journalism; media broadcasting; news reporting; photography; video production; social media news services.',
    arialSize: 52,
    corsivSize: 60,
  };
  const r2 = renderBothTM(tmCustom, certBg, logoImg, sign);
  assert(buffersEqual(r2.original.buffer, r2.ported.buffer), 'TM with logo + logoText — pixels identical');

  // TM without background (fallback path)
  const r2b = renderBothTM(tmDefault, null, null, null);
  assert(buffersEqual(r2b.original.buffer, r2b.ported.buffer), 'TM without background — pixels identical');

  const nidDefault = { ...NID_DEFAULTS };
  const r3 = renderBothNID(nidDefault, nidBg, null);
  assert(r3.original.w === 3570 && r3.original.h === 2203, `NID canvas 3570×2203 (got ${r3.original.w}×${r3.original.h})`);
  assert(r3.ported.w === r3.original.w && r3.ported.h === r3.original.h, 'NID canvas dimensions match');
  assert(buffersEqual(r3.original.buffer, r3.ported.buffer), 'NID default render — pixels identical');

  // NID with profile photo
  const photo = await loadImage('public/assets/cert-bangladesh.png');
  const nidPhoto = { ...NID_DEFAULTS, nameBangla: 'মোঃ রিয়াদ সরকার', idNo: '1234567890123' };
  const r4 = renderBothNID(nidPhoto, nidBg, photo);
  assert(buffersEqual(r4.original.buffer, r4.ported.buffer), 'NID with profile photo — pixels identical');

  // NID arbitrary values
  const nidCustom = {
    ...NID_DEFAULTS,
    nameBanglaSize: 150,
    nameBanglaX: 1300,
    nameBanglaY: 900,
    photoX: 150,
    photoY: 800,
    photoW: 280,
    photoH: 240,
    dob: '15 Mar 1985',
  };
  const r5 = renderBothNID(nidCustom, nidBg, photo);
  assert(buffersEqual(r5.original.buffer, r5.ported.buffer), 'NID custom values — pixels identical');

  console.log('\n[6] TIN template document renderer\n');
  // The uploaded reference certificate is the template (1653×2339, A4-ratio).
  const tinBg = await loadImage('public/assets/E TIN.jpg');
  assert(tinBg !== null, 'TIN template image loads');
  assert(tinBg!.width === 1653 && tinBg!.height === 2339, `TIN template 1653×2339 (got ${tinBg!.width}×${tinBg!.height})`);

  const tinCanvas = createCanvas(1, 1);
  renderTINDocument(tinCanvas as unknown as HTMLCanvasElement, { ...TIN_DEFAULTS }, null, 1, tinBg as unknown as HTMLImageElement);
  assert(tinCanvas.width === 2480 && tinCanvas.height === 3508, `TIN canvas 2480×3508 (got ${tinCanvas.width}×${tinCanvas.height})`);

  const tinScaled = createCanvas(1, 1);
  renderTINDocument(tinScaled as unknown as HTMLCanvasElement, { ...TIN_DEFAULTS }, null, 0.5, tinBg as unknown as HTMLImageElement);
  assert(tinScaled.width === 1240 && tinScaled.height === 1754, `TIN scaled canvas 1240×1754 (got ${tinScaled.width}×${tinScaled.height})`);

  const tinPixels = tinCanvas.getContext('2d')!.getImageData(0, 0, tinCanvas.width, tinCanvas.height).data;
  let nonWhite = 0;
  for (let i = 0; i < tinPixels.length; i += 4) {
    if (tinPixels[i] !== 255 || tinPixels[i + 1] !== 255 || tinPixels[i + 2] !== 255) nonWhite++;
  }
  assert(nonWhite > 100000, `TIN page draws the uploaded template content (${nonWhite} non-white pixels)`);

  // Without the template background the page is far emptier — proves the image is used.
  const tinBlank = createCanvas(1, 1);
  renderTINDocument(tinBlank as unknown as HTMLCanvasElement, { ...TIN_DEFAULTS }, null, 1);
  const blankPixels = tinBlank.getContext('2d')!.getImageData(0, 0, tinBlank.width, tinBlank.height).data;
  let blankNonWhite = 0;
  for (let i = 0; i < blankPixels.length; i += 4) {
    if (blankPixels[i] !== 255 || blankPixels[i + 1] !== 255 || blankPixels[i + 2] !== 255) blankNonWhite++;
  }
  assert(nonWhite > blankNonWhite + 50000, `template background adds page content (${nonWhite} vs ${blankNonWhite})`);

  // The editable name is overlaid in the blank sentence gap of the template.
  const nameBox = tinCanvas.getContext('2d')!.getImageData(500, 1070, 380, 36).data;
  let nameDark = 0;
  for (let i = 0; i < nameBox.length; i += 4) {
    if (nameBox[i] < 110 && nameBox[i + 1] < 110 && nameBox[i + 2] < 110) nameDark++;
  }
  assert(nameDark > 10, `TIN taxpayer name renders on the template (${nameDark} dark px)`);

  const wctx = tinCanvas.getContext('2d')!;
  wctx.font = "40px 'Arial Regular',sans-serif";
  const wrapCtx = wctx as unknown as CanvasRenderingContext2D;
  assert(wrapTinText(wrapCtx, 'hello', 400).join(' ') === 'hello', 'TIN wrapTinText single word');
  assert(wrapTinText(wrapCtx, 'one two three four five', 300).length > 1, 'TIN wrapTinText wraps long text');

  for (const key of TIN_FIELD_ORDER) {
    assert(typeof TIN_DEFAULTS[key] === 'string', `TIN text field "${key}" present`);
    assert(Boolean(TIN_DEFAULTS.layouts[key]), `TIN layout exists for "${key}"`);
    assert(Boolean(TIN_ROW_BOXES[key]), `TIN row box exists for "${key}"`);
  }

  console.log('\n[7] TIN DEMO QR payload\n');
  const tinDefault: TINSnapshot = { ...TIN_DEFAULTS };
  const qrPayload = buildTinQrPayload(tinDefault);
  assert(qrPayload.length > 0, 'TIN QR payload is non-empty');
  assert(!qrPayload.startsWith('{') && !qrPayload.includes('{'), 'TIN QR payload is plain text, not JSON');
  assert(!qrPayload.includes('generatedAt'), 'TIN QR payload has no generatedAt');
  assert(!qrPayload.includes('demo'), 'TIN QR payload has no demo flag / internal metadata');
  assert(!qrPayload.includes('taxpayerName') && !qrPayload.includes('tinNo'), 'TIN QR payload uses readable labels, not internal field names');
  assert(qrPayload.includes(`TIN : ${TIN_DEFAULTS.tinNo}`), 'TIN QR payload → TIN Number');
  assert(qrPayload.includes(`Taxpayer's Name : ${TIN_DEFAULTS.taxpayerName}`), 'TIN QR payload → Taxpayer Name');
  assert(qrPayload.includes(`Father's Name : ${TIN_DEFAULTS.fatherName}`), 'TIN QR payload → Father Name');
  assert(qrPayload.includes(`Mother's Name : ${TIN_DEFAULTS.motherName}`), 'TIN QR payload → Mother Name');
  assert(qrPayload.includes(`Current Address : ${TIN_DEFAULTS.currentAddress}`), 'TIN QR payload → Current Address');
  assert(qrPayload.includes(`Permanent Address : ${TIN_DEFAULTS.permanentAddress}`), 'TIN QR payload → Permanent Address');
  assert(qrPayload.includes(`Zone : ${TIN_DEFAULTS.taxZone}`), 'TIN QR payload → Tax Zone');
  assert(qrPayload.includes(`Circle : ${TIN_DEFAULTS.taxCircle}`), 'TIN QR payload → Tax Circle');
  assert(!qrPayload.includes('DOB :'), 'TIN QR payload omits empty fields (default DOB is blank)');

  // The payload is derived live from the record and stays stable for identical data.
  const edited: TINSnapshot = {
    ...TIN_DEFAULTS,
    taxpayerName: 'SAMSUL ALOM',
    dob: '10/02/1996',
  };
  const editedPayload = buildTinQrPayload(edited);
  assert(editedPayload !== qrPayload, 'TIN QR payload changes when an editable value changes');
  assert(editedPayload.includes("Taxpayer's Name : SAMSUL ALOM"), 'TIN QR payload reflects the edited taxpayer name');
  assert(editedPayload.includes('DOB : 10/02/1996'), 'TIN QR payload reflects the edited DOB');
  assert(editedPayload === buildTinQrPayload(edited), 'TIN QR payload is stable for identical record data');

  const tinQrDataUrl = await encodeDemoQr(tinDefault, 256);
  assert(typeof tinQrDataUrl === 'string' && tinQrDataUrl.startsWith('data:image/png'), 'TIN DEMO QR encodes to PNG data URL');

  console.log('\n[8] TIN per-field independence (X/Y/font-size never bleed across fields)\n');
  const original = normalizeTinSnapshot({});
  const moved = normalizeTinSnapshot({});
  const patch = (key: keyof TINSnapshot & TinFieldKey, p: Partial<TinLayout>) => {
    moved.layouts[key] = { ...moved.layouts[key], ...p };
  };
  // Simulate the inspector: move Taxpayer Name, then Father's Name, then Mother's Name.
  patch('taxpayerName', { x: moved.layouts.taxpayerName.x + 100, fontSize: moved.layouts.taxpayerName.fontSize + 10 });
  patch('fatherName', { y: moved.layouts.fatherName.y - 50, fontSize: moved.layouts.fatherName.fontSize - 5 });
  patch('motherName', { x: moved.layouts.motherName.x - 20, y: moved.layouts.motherName.y + 12 });
  patch('taxZone', { x: moved.layouts.taxZone.x + 40, fontSize: moved.layouts.taxZone.fontSize + 6 });
  patch('taxCircle', { y: moved.layouts.taxCircle.y + 25, fontSize: moved.layouts.taxCircle.fontSize + 3 });
  patch('name', { x: moved.layouts.name.x + 30, y: moved.layouts.name.y - 18, fontSize: moved.layouts.name.fontSize + 4 });
  // X/Y are independent per field.
  assert(moved.layouts.taxpayerName.x === original.layouts.taxpayerName.x + 100, 'moving Taxpayer Name X affects only it');
  assert(moved.layouts.taxpayerName.y === original.layouts.taxpayerName.y, 'Taxpayer Name Y untouched by others');
  assert(moved.layouts.fatherName.x === original.layouts.fatherName.x, 'Father Name X untouched by others');
  assert(moved.layouts.motherName.y === original.layouts.motherName.y + 12, 'Mother Name Y moved independently');
  assert(moved.layouts.taxCircle.x === original.layouts.taxCircle.x, 'Tax Circle X untouched by others');
  assert(moved.layouts.taxZone.x === original.layouts.taxZone.x + 40, 'moving Tax Zone X affects only it');
  assert(moved.layouts.taxZone.y === original.layouts.taxZone.y, 'Tax Zone Y untouched by others');
  assert(moved.layouts.taxCircle.y === original.layouts.taxCircle.y + 25, 'moving Tax Circle Y affects only it');
  assert(moved.layouts.tinNo.y === original.layouts.tinNo.y, 'TIN Number Y untouched by others');
  assert(moved.layouts.currentAddress.x === original.layouts.currentAddress.x, 'Current Address X untouched by others');
  assert(moved.layouts.name.x === original.layouts.name.x + 30, 'moving Name X affects only it');
  assert(moved.layouts.name.y === original.layouts.name.y - 18, 'moving Name Y affects only it');
  assert(moved.layouts.fatherName.y === original.layouts.fatherName.y - 50, 'Father Name Y untouched by Name move');
  assert(moved.layouts.motherName.y === original.layouts.motherName.y + 12, 'Mother Name Y untouched by Name move');
  assert(moved.layouts.taxCircle.y === original.layouts.taxCircle.y + 25, 'Tax Circle Y untouched by Name move');
  assert(moved.layouts.taxZone.x === original.layouts.taxZone.x + 40, 'Tax Zone X untouched by Name move');
  assert(moved.layouts.permanentAddress.x === original.layouts.permanentAddress.x, 'Permanent Address X untouched by others');
  // Font sizes are independent per field.
  assert(moved.layouts.taxpayerName.fontSize === original.layouts.taxpayerName.fontSize + 10, 'Taxpayer Name font-size grows alone');
  assert(moved.layouts.fatherName.fontSize === original.layouts.fatherName.fontSize - 5, 'Father Name font-size shrinks alone');
  assert(moved.layouts.motherName.fontSize === original.layouts.motherName.fontSize, 'Mother Name font-size unchanged');
  assert(moved.layouts.taxZone.fontSize === original.layouts.taxZone.fontSize + 6, 'Tax Zone font-size grows alone');
  assert(moved.layouts.taxCircle.fontSize === original.layouts.taxCircle.fontSize + 3, 'Tax Circle font-size grows alone');
  assert(moved.layouts.name.fontSize === original.layouts.name.fontSize + 4, 'Name font-size grows alone');
  assert(moved.layouts.fatherName.fontSize === original.layouts.fatherName.fontSize - 5, 'Father Name font-size untouched by Zone/Circle moves');
  // Layout/typography persist through save → restore (project state round-trip).
  const saved = normalizeTinSnapshot({
    layouts: {
      taxpayerName: { ...moved.layouts.taxpayerName, x: 777, fontSize: 123 },
      name: { ...moved.layouts.name, x: 999, y: 1245, fontSize: 42 },
    },
    qrSize: 520,
    qrX: 333,
  } as Partial<TINSnapshot>);
  assert(saved.layouts.taxpayerName.x === 777, 'saved Taxpayer Name X persists after reopen');
  assert(saved.layouts.taxpayerName.fontSize === 123, 'saved Taxpayer Name font-size persists after reopen');
  assert(saved.layouts.name.x === 999, 'saved Name X persists after reopen');
  assert(saved.layouts.name.y === 1245, 'saved Name Y persists after reopen');
  assert(saved.layouts.name.fontSize === 42, 'saved Name font-size persists after reopen');
  assert(saved.layouts.motherName.x === TIN_DEFAULT_LAYOUTS.motherName.x, 'missing layouts restored to defaults on reopen');
  assert(saved.qrSize === 520 && saved.qrX === 333, 'QR size/position persist after reopen');

  console.log('\n[9] Name field renders independently (X/Y/font-size touch only Name pixels)\n');
  const regionOf = (canvas: unknown, box: { x: number; y: number; w: number; h: number }) => {
    const ctx = (canvas as { getContext: (t: string) => CanvasRenderingContext2D }).getContext('2d');
    return Buffer.from(ctx.getImageData(box.x, box.y, box.w, box.h).data.buffer);
  };
  const renderTinAt = (nameLayout: TinLayout) => {
    const c = createCanvas(1, 1);
    renderTINDocument(
      c as unknown as HTMLCanvasElement,
      { ...TIN_DEFAULTS, layouts: { ...TIN_DEFAULT_LAYOUTS, name: nameLayout } },
      null,
      1,
      tinBg as unknown as HTMLImageElement,
    );
    return c;
  };
  const baseline = renderTinAt(TIN_DEFAULT_LAYOUTS.name);
  // Move Name well away from every other field's printed row and change its size.
  const movedName: TinLayout = { ...TIN_DEFAULT_LAYOUTS.name, x: 720, y: 1200, fontSize: 40, height: 46 };
  const nameMoved = renderTinAt(movedName);
  for (const key of TIN_FIELD_ORDER) {
    if (key === 'name') continue;
    const box = { ...TIN_ROW_BOXES[key], w: Math.max(80, TIN_ROW_BOXES[key].w) };
    assert(
      regionOf(baseline, box).equals(regionOf(nameMoved, box)),
      `Name X/Y/font-size change leaves "${key}" pixels identical`,
    );
  }
  // The Name row itself must have changed.
  assert(
    !regionOf(baseline, TIN_ROW_BOXES.name).equals(regionOf(nameMoved, { ...TIN_ROW_BOXES.name, y: 1198, h: 48 })),
    'Name X/Y/font-size change moves the rendered Name text',
  );

  console.log(`\n${failures === 0 ? '✓ ALL CHECKS PASSED' : `✗ ${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
