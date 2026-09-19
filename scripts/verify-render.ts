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
import { layoutFromSnapshot, layoutFromVault, layoutFromVaultSources, packDetails } from '../src/lib/publish/layout';
import { renderNIDCard } from '../src/lib/renderers/nidRenderer';
import { renderTINDocument, wrapTinText } from '../src/lib/renderers/tinRenderer';
import { renderUnhcrCard } from '../src/lib/renderers/unhcrRenderer';
import { renderUnhcrCard as renderUnhcrS2Card } from '../src/lib/renderers/unhcrS2Renderer';
import {
  UNHCR_BARCODE1_DEFAULT,
  UNHCR_BARCODE2_DEFAULT,
  UNHCR_DEFAULTS,
  UNHCR_DEFAULT_LAYOUTS,
  UNHCR_PHOTO_DEFAULT,
  UNHCR_QR_DEFAULT,
  normalizeUnhcrSnapshot,
} from '../src/lib/constants/unhcr';
import {
  UNHCR_DEFAULTS as UNHCR_S2_DEFAULTS,
  UNHCR_DOC_WIDTH as UNHCR_S2_DOC_WIDTH,
  UNHCR_PHOTO_DEFAULT as UNHCR_S2_PHOTO_DEFAULT,
  UNHCR_TEST_BARCODE_TEXT_DEFAULT,
  UNHCR_TEST_BARCODE_TEXT_DEFAULT_VALUE,
  UNHCR_TEST_REF_NO_DEFAULT,
  UNHCR_TEST_REF_NO_DEFAULT_VALUE,
  normalizeUnhcrSnapshot as normalizeUnhcrS2Snapshot,
} from '../src/lib/constants/unhcr-s2';
import {
  UNHCR_BARCODE_TEST_PAYLOAD,
  UNHCR_QR_TEST_PAYLOAD,
  buildUnhcrBarcodePayload,
  buildUnhcrQrPayload,
  createUnhcrQrMatrix,
  decodeCode128Modules,
  encodeCode128Modules,
  sampleBarcodeModules,
  unhcrBarcodePayload,
  unhcrQrPayload,
} from '../src/lib/unhcrCodes';
import { buildTinQrPayload, encodeDemoQr } from '../src/lib/tinQr';
import type { NIDSnapshot, TINSnapshot, TinFieldKey, TinLayout, TMSnapshot } from '../src/lib/editor/types';

const ROOT = process.cwd();
const legacyHtml = readFileSync(join(ROOT, 'legacy/index.html'), 'utf-8');

/* ────────────────────────── fonts ────────────────────────── */
const FONT_FILES: Record<string, string> = {
  'Arial Regular': 'public/assets/arial-regular.ttf',
  'Arial Bold': 'public/assets/arial-regular.ttf',
  'Arial Bold MT': 'public/assets/arial-bold.ttf',
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

  // Instant Download uses live editor layout; History View/Publish rebuild from
  // the vault. Custom seal/signature anchors must survive that round-trip.
  const tm261061Layout = {
    ...TM_DEFAULTS,
    trademarkNo: '261061',
    signX: 1480,
    signY: 2488,
    signSize: 280,
    sealX: 310,
    sealY: 2910,
  };
  const roundTripped = { ...tm261061Layout, ...layoutFromVault(layoutFromSnapshot(tm261061Layout)) };
  const liveCanvas = createCanvas(1, 1);
  const vaultCanvas = createCanvas(1, 1);
  renderTMCertificate(
    liveCanvas as unknown as HTMLCanvasElement,
    tm261061Layout,
    certBg as HTMLImageElement | null,
    null,
    sign as HTMLImageElement | null,
    1,
  );
  renderTMCertificate(
    vaultCanvas as unknown as HTMLCanvasElement,
    roundTripped,
    certBg as HTMLImageElement | null,
    null,
    sign as HTMLImageElement | null,
    1,
  );
  const livePixels = Buffer.from(liveCanvas.getContext('2d')!.getImageData(0, 0, liveCanvas.width, liveCanvas.height).data.buffer);
  const vaultPixels = Buffer.from(vaultCanvas.getContext('2d')!.getImageData(0, 0, vaultCanvas.width, vaultCanvas.height).data.buffer);
  assert(buffersEqual(livePixels, vaultPixels), 'TM 261061 seal/signature layout survives Save → History re-render');
  assert(roundTripped.signX === 1480 && roundTripped.signY === 2488 && roundTripped.signSize === 280, 'signature X/Y/size restored');
  assert(roundTripped.sealX === 310 && roundTripped.sealY === 2910, 'seal X/Y restored');

  // Reproduce production: layout_json column missing → History used TM_DEFAULTS.
  const droppedLayout = { ...tm261061Layout, ...layoutFromVault(null) };
  const droppedCanvas = createCanvas(1, 1);
  renderTMCertificate(
    droppedCanvas as unknown as HTMLCanvasElement,
    droppedLayout,
    certBg as HTMLImageElement | null,
    null,
    sign as HTMLImageElement | null,
    1,
  );
  const droppedPixels = Buffer.from(droppedCanvas.getContext('2d')!.getImageData(0, 0, droppedCanvas.width, droppedCanvas.height).data.buffer);
  assert(!buffersEqual(livePixels, droppedPixels), 'repro: missing layout_json shifts TM 261061 seal/signature vs Instant Download');

  const detailsFallback = { ...tm261061Layout, ...layoutFromVaultSources(null, packDetails(tm261061Layout.goodsDesc, layoutFromSnapshot(tm261061Layout))) };
  const fallbackCanvas = createCanvas(1, 1);
  renderTMCertificate(
    fallbackCanvas as unknown as HTMLCanvasElement,
    detailsFallback,
    certBg as HTMLImageElement | null,
    null,
    sign as HTMLImageElement | null,
    1,
  );
  const fallbackPixels = Buffer.from(fallbackCanvas.getContext('2d')!.getImageData(0, 0, fallbackCanvas.width, fallbackCanvas.height).data.buffer);
  assert(buffersEqual(livePixels, fallbackPixels), 'fix: details fallback keeps TM 261061 seal/signature identical to Instant Download');
  assert(detailsFallback.signX === 1480 && detailsFallback.sealX === 310, 'details fallback restores 261061 coordinates');

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

  console.log('\n[10] UNHCR Arial Regular vs real Arial Bold\n');
  const sample = 'UNHCR SAMPLE';
  const measure = (family: string) => {
    const c = createCanvas(400, 80);
    const ctx = c.getContext('2d');
    ctx.font = `36px ${family}`;
    return ctx.measureText(sample).width;
  };
  const regularWidth = measure("'Arial Regular'");
  const boldWidth = measure("'Arial Bold MT'");
  const fakeBoldWidth = measure("'Arial Bold'");
  assert(regularWidth > 0 && boldWidth > 0, 'UNHCR Arial Regular and Arial Bold faces measure text');
  assert(boldWidth !== regularWidth, 'UNHCR Arial Bold is a distinct face from Arial Regular');
  assert(fakeBoldWidth === regularWidth, 'legacy Arial Bold alias stays Regular (NID pixel identity)');

  const unhcrRegular = createCanvas(1, 1);
  renderUnhcrCard(
    unhcrRegular as unknown as HTMLCanvasElement,
    {
      ...UNHCR_DEFAULTS,
      name: sample,
      layouts: { ...UNHCR_DEFAULT_LAYOUTS, name: { ...UNHCR_DEFAULT_LAYOUTS.name, fontFamily: 'arial' } },
    },
    null,
    1,
  );
  const unhcrBold = createCanvas(1, 1);
  renderUnhcrCard(
    unhcrBold as unknown as HTMLCanvasElement,
    {
      ...UNHCR_DEFAULTS,
      name: sample,
      layouts: { ...UNHCR_DEFAULT_LAYOUTS, name: { ...UNHCR_DEFAULT_LAYOUTS.name, fontFamily: 'arial-bold' } },
    },
    null,
    1,
  );
  const regularPx = Buffer.from(unhcrRegular.getContext('2d')!.getImageData(0, 0, unhcrRegular.width, unhcrRegular.height).data.buffer);
  const boldPx = Buffer.from(unhcrBold.getContext('2d')!.getImageData(0, 0, unhcrBold.width, unhcrBold.height).data.buffer);
  assert(unhcrRegular.width === unhcrBold.width && unhcrRegular.height === unhcrBold.height, 'UNHCR Regular/Bold canvases match size');
  assert(!regularPx.equals(boldPx), 'UNHCR Arial Bold selection paints different pixels than Arial Regular');

  const unhcrPhoto = createCanvas(1, 1);
  renderUnhcrCard(unhcrPhoto as unknown as HTMLCanvasElement, { ...UNHCR_DEFAULTS }, null, 1);
  const px = unhcrPhoto.getContext('2d')!.getImageData(UNHCR_PHOTO_DEFAULT.x + 8, UNHCR_PHOTO_DEFAULT.y + 8, 1, 1).data;
  assert(px[0] === 0 && px[1] === 255 && px[2] === 255, 'UNHCR empty photo paints cyan placeholder at 62,91');

  console.log('\n[11] UNHCR TEST barcodes and QR\n');
  const barcodeBits = encodeCode128Modules(UNHCR_BARCODE_TEST_PAYLOAD);
  assert(barcodeBits.length > 40, 'UNHCR Code 128 encoder emits modules');
  assert(decodeCode128Modules(barcodeBits) === UNHCR_BARCODE_TEST_PAYLOAD, 'UNHCR barcode scan returns only the TEST ID');
  assert(decodeCode128Modules(encodeCode128Modules('TEST-UNHCR-REF-0002')) === 'TEST-UNHCR-REF-0002', 'UNHCR barcode encoder/decoder round-trips TEST IDs');
  assert(unhcrBarcodePayload('') === UNHCR_BARCODE_TEST_PAYLOAD, 'empty barcode payload falls back to TEST ID');
  assert(unhcrQrPayload('') === UNHCR_QR_TEST_PAYLOAD, 'empty QR payload falls back to TEST sample data');
  assert(UNHCR_QR_TEST_PAYLOAD.includes('ID: TEST-UNHCR-REF-0001'), 'UNHCR QR payload is labeled TEST ID data');
  assert(UNHCR_QR_TEST_PAYLOAD.includes('Status: Valid'), 'UNHCR QR payload includes Status: Valid');
  assert(UNHCR_BARCODE1_DEFAULT.x === 54 && UNHCR_BARCODE1_DEFAULT.y === 1028, 'UNHCR barcode 1 default X/Y is 54,1028');
  assert(UNHCR_BARCODE1_DEFAULT.w === 752 && UNHCR_BARCODE1_DEFAULT.h === 121, 'UNHCR barcode 1 default size is 752×121');
  assert(UNHCR_BARCODE2_DEFAULT.x === 1724 && UNHCR_BARCODE2_DEFAULT.y === 99, 'UNHCR barcode 2 default X/Y is 1724,99');
  assert(UNHCR_BARCODE2_DEFAULT.w === 750 && UNHCR_BARCODE2_DEFAULT.h === 121, 'UNHCR barcode 2 default size is 750×121');
  assert(UNHCR_QR_DEFAULT.x === 1467 && UNHCR_QR_DEFAULT.y === 1369 && UNHCR_QR_DEFAULT.size === 263, 'UNHCR QR default is 1467,1369 size 263');
  assert(UNHCR_DEFAULTS.qrSize === 263 && UNHCR_DEFAULTS.qrX === 1467 && UNHCR_DEFAULTS.qrY === 1369, 'UNHCR defaults open at configured QR state');
  assert(normalizeUnhcrSnapshot({}).barcode1X === 54 && normalizeUnhcrSnapshot({}).qrSize === 263, 'opening without a History record uses editor defaults');

  const liveFields = {
    ...UNHCR_DEFAULTS,
    unhcrNo: 'MY-TEST-42',
    name: 'Sample Holder',
    dob: '01 Jan 1990',
    sex: 'M',
    origin: 'MM',
    issuedDate: '01 Jan 2024',
    expiredDate: '01 Jan 2026',
  };
  assert(buildUnhcrBarcodePayload(liveFields) === 'MY-TEST-42', 'barcode encodes the ID number field');
  assert(buildUnhcrBarcodePayload({ ...liveFields, unhcrNo: '' }) === UNHCR_BARCODE_TEST_PAYLOAD, 'empty ID number falls back to TEST barcode payload');
  const liveQr = buildUnhcrQrPayload(liveFields);
  assert(liveQr === [
    'ID: MY-TEST-42',
    'Name: Sample Holder',
    'DOB: 01 Jan 1990',
    'Sex: M',
    'Country: MM',
    'Issued: 01 Jan 2024',
    'Expires: 01 Jan 2026',
    'Status: Valid',
  ].join('\n'), 'QR payload combines form fields in the required labeled format');
  const emptyQr = buildUnhcrQrPayload({ ...UNHCR_DEFAULTS });
  assert(emptyQr === UNHCR_QR_TEST_PAYLOAD, 'empty form QR matches TEST default payload');
  const afterName = buildUnhcrQrPayload({ ...liveFields, name: 'Updated Name' });
  assert(afterName.includes('Name: Updated Name') && afterName.includes('ID: MY-TEST-42'), 'QR re-renders when a form field changes');
  const afterId = buildUnhcrBarcodePayload({ ...liveFields, unhcrNo: 'MY-TEST-99' });
  assert(afterId === 'MY-TEST-99', 'barcode re-renders when the ID number changes');

  const unhcrLiveCanvas = createCanvas(1, 1);
  renderUnhcrCard(unhcrLiveCanvas as unknown as HTMLCanvasElement, liveFields, null, 1);
  const livePx = unhcrLiveCanvas.getContext('2d')!.getImageData(0, 0, unhcrLiveCanvas.width, unhcrLiveCanvas.height);
  const liveBits = encodeCode128Modules('MY-TEST-42');
  const liveSample = sampleBarcodeModules(
    livePx.data,
    unhcrLiveCanvas.width,
    UNHCR_BARCODE1_DEFAULT.x,
    UNHCR_BARCODE1_DEFAULT.y,
    UNHCR_BARCODE1_DEFAULT.w,
    UNHCR_BARCODE1_DEFAULT.h,
    liveBits.length,
  );
  assert(decodeCode128Modules(liveSample) === 'MY-TEST-42', 'rendered barcode scans to the typed ID number');
  const liveQrMatrix = createUnhcrQrMatrix(buildUnhcrQrPayload(liveFields));
  assert(liveQrMatrix.size >= 21, 'live QR from form fields stays square and scannable');

  const qrMatrix = createUnhcrQrMatrix(UNHCR_QR_TEST_PAYLOAD);
  assert(qrMatrix.size >= 21 && qrMatrix.dark.length === qrMatrix.size, 'UNHCR QR matrix is square and scannable size');
  assert(qrMatrix.dark.every((row) => row.length === qrMatrix.size), 'UNHCR QR rows match matrix size');

  const unhcrCodes = createCanvas(1, 1);
  renderUnhcrCard(unhcrCodes as unknown as HTMLCanvasElement, { ...UNHCR_DEFAULTS }, null, 1);
  const codesCtx = unhcrCodes.getContext('2d')!;
  const codesPx = codesCtx.getImageData(0, 0, unhcrCodes.width, unhcrCodes.height);
  const sampled1 = sampleBarcodeModules(
    codesPx.data,
    unhcrCodes.width,
    UNHCR_BARCODE1_DEFAULT.x,
    UNHCR_BARCODE1_DEFAULT.y,
    UNHCR_BARCODE1_DEFAULT.w,
    UNHCR_BARCODE1_DEFAULT.h,
    barcodeBits.length,
  );
  const sampled2 = sampleBarcodeModules(
    codesPx.data,
    unhcrCodes.width,
    UNHCR_BARCODE2_DEFAULT.x,
    UNHCR_BARCODE2_DEFAULT.y,
    UNHCR_BARCODE2_DEFAULT.w,
    UNHCR_BARCODE2_DEFAULT.h,
    barcodeBits.length,
  );
  assert(decodeCode128Modules(sampled1) === UNHCR_BARCODE_TEST_PAYLOAD, 'UNHCR barcode 1 pixels scan to TEST ID only');
  assert(decodeCode128Modules(sampled2) === UNHCR_BARCODE_TEST_PAYLOAD, 'UNHCR barcode 2 pixels scan to TEST ID only');
  assert(sampled1.join('') === sampled2.join(''), 'UNHCR barcodes share the same Code 128 design');
  const sampled1Low = sampleBarcodeModules(
    codesPx.data,
    unhcrCodes.width,
    UNHCR_BARCODE1_DEFAULT.x,
    UNHCR_BARCODE1_DEFAULT.y,
    UNHCR_BARCODE1_DEFAULT.w,
    UNHCR_BARCODE1_DEFAULT.h,
    barcodeBits.length,
    0.88,
  );
  assert(decodeCode128Modules(sampled1Low) === UNHCR_BARCODE_TEST_PAYLOAD, 'UNHCR barcode has no visible payload text under the bars');

  const qrWhite = codesCtx.getImageData(UNHCR_QR_DEFAULT.x + 2, UNHCR_QR_DEFAULT.y + 2, 1, 1).data;
  assert(qrWhite[0] > 240 && qrWhite[1] > 240 && qrWhite[2] > 240, 'UNHCR QR has a white quiet zone');
  const qrPatch = codesCtx.getImageData(
    UNHCR_QR_DEFAULT.x,
    UNHCR_QR_DEFAULT.y,
    UNHCR_QR_DEFAULT.size,
    UNHCR_QR_DEFAULT.size,
  );
  let qrDark = 0;
  for (let i = 0; i < qrPatch.data.length; i += 4) {
    if (qrPatch.data[i] + qrPatch.data[i + 1] + qrPatch.data[i + 2] < 80) qrDark++;
  }
  assert(qrDark > 200, 'UNHCR QR paints a dark finder module');

  const unhcrMovedSnap = normalizeUnhcrSnapshot({
    barcode1X: 140,
    barcode1Y: 1080,
    barcode1W: 640,
    barcode1H: 100,
    barcode2X: 160,
    barcode2Y: 1220,
    barcode2W: 640,
    barcode2H: 100,
    qrX: 2100,
    qrY: 120,
    qrSize: 260,
  });
  assert(unhcrMovedSnap.barcode1X === 140 && unhcrMovedSnap.barcode1Y === 1080, 'UNHCR barcode 1 X/Y persist through normalize');
  assert(unhcrMovedSnap.barcode1W === 640 && unhcrMovedSnap.barcode1H === 100, 'UNHCR barcode 1 size persists through normalize');
  assert(unhcrMovedSnap.barcode2X === 160 && unhcrMovedSnap.barcode2Y === 1220, 'UNHCR barcode 2 X/Y persist through normalize');
  assert(unhcrMovedSnap.barcode2W === 640 && unhcrMovedSnap.barcode2H === 100, 'UNHCR barcode 2 size persists through normalize');
  assert(unhcrMovedSnap.qrX === 2100 && unhcrMovedSnap.qrY === 120 && unhcrMovedSnap.qrSize === 260, 'UNHCR QR X/Y/size persist through normalize');
  assert(unhcrMovedSnap.barcodePayload === UNHCR_BARCODE_TEST_PAYLOAD, 'UNHCR barcode TEST payload survives missing saved payload');
  assert(unhcrMovedSnap.qrPayload === UNHCR_QR_TEST_PAYLOAD, 'UNHCR QR TEST payload survives missing saved payload');
  const savedLive = normalizeUnhcrSnapshot({
    ...liveFields,
    barcode1X: 140,
    barcode1Y: 1080,
    barcode1W: 640,
    barcode1H: 100,
    qrX: 2100,
    qrY: 120,
    qrSize: 260,
  });
  assert(savedLive.barcodePayload === 'MY-TEST-42', 'History restore rebuilds barcode from ID number');
  assert(savedLive.qrPayload.includes('Name: Sample Holder'), 'History restore rebuilds QR from form fields');
  assert(savedLive.barcode1X === 140 && savedLive.qrSize === 260, 'History restore keeps QR/barcode position and size');

  const unhcrMoved = createCanvas(1, 1);
  renderUnhcrCard(unhcrMoved as unknown as HTMLCanvasElement, unhcrMovedSnap, null, 1);
  const movedPx = Buffer.from(unhcrMoved.getContext('2d')!.getImageData(0, 0, unhcrMoved.width, unhcrMoved.height).data.buffer);
  const defaultPx = Buffer.from(codesPx.data.buffer);
  assert(!movedPx.equals(defaultPx), 'UNHCR code X/Y/size changes paint different pixels');

  const scaled = createCanvas(1, 1);
  renderUnhcrCard(scaled as unknown as HTMLCanvasElement, { ...UNHCR_DEFAULTS }, null, 0.5);
  assert(scaled.width === Math.round(unhcrCodes.width * 0.5) && scaled.height === Math.round(unhcrCodes.height * 0.5), 'UNHCR code overlay stays accurate at 50% zoom canvas');

  assert(!('testBarcodeText' in UNHCR_DEFAULTS) && !('testRefNo' in UNHCR_DEFAULTS), 'Server 1 UNHCR defaults omit TEST overlays');

  console.log('\n[12] UNHCR Server 2 TEST barcode text and vertical reference number\n');
  assert(UNHCR_TEST_BARCODE_TEXT_DEFAULT_VALUE.startsWith('TEST-'), 'S2 TEST barcode text default is clearly labeled TEST data');
  assert(UNHCR_TEST_REF_NO_DEFAULT_VALUE.startsWith('TEST-'), 'S2 TEST reference number default is clearly labeled TEST data');
  assert(UNHCR_TEST_BARCODE_TEXT_DEFAULT.y > UNHCR_S2_PHOTO_DEFAULT.y + UNHCR_S2_PHOTO_DEFAULT.h, 'S2 TEST barcode text sits below the photo');
  assert(UNHCR_TEST_REF_NO_DEFAULT.x > UNHCR_S2_DOC_WIDTH - 120, 'S2 TEST reference number sits along the right edge');
  assert(UNHCR_TEST_REF_NO_DEFAULT.orientation === 'vertical', 'S2 TEST reference number defaults to vertical orientation');
  assert(UNHCR_S2_DEFAULTS.testBarcodeText === UNHCR_TEST_BARCODE_TEXT_DEFAULT_VALUE, 'S2 defaults include TEST barcode text');
  assert(UNHCR_S2_DEFAULTS.testRefNo === UNHCR_TEST_REF_NO_DEFAULT_VALUE, 'S2 defaults include TEST reference number');
  assert(UNHCR_S2_DEFAULTS.testBarcodeTextX === UNHCR_TEST_BARCODE_TEXT_DEFAULT.x, 'S2 TEST barcode text default X');
  assert(UNHCR_S2_DEFAULTS.testRefNoOrientation === 'vertical', 'S2 TEST reference orientation default is vertical');

  const blankTestOverlays = normalizeUnhcrS2Snapshot({});
  assert(blankTestOverlays.testBarcodeText === UNHCR_TEST_BARCODE_TEXT_DEFAULT_VALUE, 'S2 missing TEST barcode text restores labeled TEST default');
  assert(blankTestOverlays.testRefNo === UNHCR_TEST_REF_NO_DEFAULT_VALUE, 'S2 missing TEST reference number restores labeled TEST default');
  assert(blankTestOverlays.testBarcodeTextY === UNHCR_TEST_BARCODE_TEXT_DEFAULT.y, 'S2 missing TEST barcode text Y restores default below photo');
  assert(blankTestOverlays.testRefNoX === UNHCR_TEST_REF_NO_DEFAULT.x, 'S2 missing TEST reference X restores right-edge default');
  assert(blankTestOverlays.testRefNoOrientation === 'vertical', 'S2 missing TEST reference orientation restores vertical');

  const movedTestOverlays = normalizeUnhcrS2Snapshot({
    testBarcodeText: 'TEST-UNHCR-BARCODE-MOVED',
    testBarcodeTextX: 120,
    testBarcodeTextY: 1300,
    testBarcodeTextW: 640,
    testBarcodeTextH: 72,
    testBarcodeTextFontSize: 34,
    testRefNo: 'TEST-UNHCR-REF-MOVED',
    testRefNoX: 2400,
    testRefNoY: 200,
    testRefNoW: 48,
    testRefNoH: 1400,
    testRefNoFontSize: 26,
    testRefNoOrientation: 'horizontal',
  });
  assert(movedTestOverlays.testBarcodeText === 'TEST-UNHCR-BARCODE-MOVED', 'S2 TEST barcode text persists through normalize');
  assert(movedTestOverlays.testBarcodeTextX === 120 && movedTestOverlays.testBarcodeTextY === 1300, 'S2 TEST barcode text X/Y persist through normalize');
  assert(movedTestOverlays.testBarcodeTextW === 640 && movedTestOverlays.testBarcodeTextH === 72, 'S2 TEST barcode text size persists through normalize');
  assert(movedTestOverlays.testBarcodeTextFontSize === 34, 'S2 TEST barcode text font size persists through normalize');
  assert(movedTestOverlays.testRefNo === 'TEST-UNHCR-REF-MOVED', 'S2 TEST reference number persists through normalize');
  assert(movedTestOverlays.testRefNoX === 2400 && movedTestOverlays.testRefNoY === 200, 'S2 TEST reference number X/Y persist through normalize');
  assert(movedTestOverlays.testRefNoW === 48 && movedTestOverlays.testRefNoH === 1400, 'S2 TEST reference number size persists through normalize');
  assert(movedTestOverlays.testRefNoFontSize === 26, 'S2 TEST reference number font size persists through normalize');
  assert(movedTestOverlays.testRefNoOrientation === 'horizontal', 'S2 TEST reference orientation persists through normalize');

  const defaultTestCanvas = createCanvas(1, 1);
  renderUnhcrS2Card(defaultTestCanvas as unknown as HTMLCanvasElement, { ...UNHCR_S2_DEFAULTS }, null, 1);
  const defaultTestPx = Buffer.from(defaultTestCanvas.getContext('2d')!.getImageData(0, 0, defaultTestCanvas.width, defaultTestCanvas.height).data.buffer);
  const s1Canvas = createCanvas(1, 1);
  renderUnhcrCard(s1Canvas as unknown as HTMLCanvasElement, { ...UNHCR_DEFAULTS }, null, 1);
  const s1Px = Buffer.from(s1Canvas.getContext('2d')!.getImageData(0, 0, s1Canvas.width, s1Canvas.height).data.buffer);
  assert(!defaultTestPx.equals(s1Px), 'Server 2 default render differs from Server 1 because of TEST overlays');

  const movedTestCanvas = createCanvas(1, 1);
  renderUnhcrS2Card(movedTestCanvas as unknown as HTMLCanvasElement, movedTestOverlays, null, 1);
  const movedTestPx = Buffer.from(movedTestCanvas.getContext('2d')!.getImageData(0, 0, movedTestCanvas.width, movedTestCanvas.height).data.buffer);
  assert(!movedTestPx.equals(defaultTestPx), 'S2 TEST overlay text/position/size/orientation changes paint different pixels');

  const verticalRef = normalizeUnhcrS2Snapshot({ ...movedTestOverlays, testRefNoOrientation: 'vertical' });
  const verticalCanvas = createCanvas(1, 1);
  renderUnhcrS2Card(verticalCanvas as unknown as HTMLCanvasElement, verticalRef, null, 1);
  const verticalPx = Buffer.from(verticalCanvas.getContext('2d')!.getImageData(0, 0, verticalCanvas.width, verticalCanvas.height).data.buffer);
  assert(!verticalPx.equals(movedTestPx), 'S2 vertical TEST reference orientation paints different pixels than horizontal');

  console.log(`\n${failures === 0 ? '✓ ALL CHECKS PASSED' : `✗ ${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
