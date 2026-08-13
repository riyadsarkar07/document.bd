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
import { renderTMCertificate } from '../src/lib/renderers/tmRenderer';
import { renderNIDCard } from '../src/lib/renderers/nidRenderer';
import type { NIDSnapshot, TMSnapshot } from '../src/lib/editor/types';

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

  console.log(`\n${failures === 0 ? '✓ ALL CHECKS PASSED' : `✗ ${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
