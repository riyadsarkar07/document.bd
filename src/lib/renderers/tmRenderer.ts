import type { TMSnapshot } from '../editor/types';

type TokenStyle = 'normal' | 'italic';

interface Token {
  word: string;
  type: TokenStyle;
}

/**
 * Faithful port of the original `tmRenderToCanvas` from legacy/index.html.
 * Every measurement, anchor, font string and drawing call is preserved 1:1 so
 * that rendered output is identical to the original application.
 */
export function renderTMCertificate(
  canvas: HTMLCanvasElement,
  snap: TMSnapshot,
  bgImg: HTMLImageElement | null,
  customLogoImg: HTMLImageElement | null,
  signImg: HTMLImageElement | null,
  scale = 1,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = bgImg ? bgImg.naturalWidth : 1200;
  const H = bgImg ? bgImg.naturalHeight : 1650;
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  if (scale !== 1) ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  if (bgImg) {
    ctx.drawImage(bgImg, 0, 0, W, H);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
  }

  const {
    arialSize,
    corsivSize,
    sealSize,
    blueDateSize,
    tmX,
    tmY,
    dateX,
    dateY,
    paraY,
    logoY,
    logoSize,
    sealX,
    sealY,
    blueX,
    blueY,
    logoTextSize,
    logoTextX,
    logoTextY,
  } = snap;

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
  const masterTokens: Token[] = [];
  const tk = (txt: string, sty: TokenStyle) => {
    if (!txt) return;
    txt
      .split(/\s+/)
      .filter(Boolean)
      .forEach((w) => masterTokens.push({ word: w, type: sty }));
  };
  tk(snap.openingText, 'normal');
  tk(italicSeg, 'italic');
  tk(normalSeg, 'normal');
  tk(snap.goodsDesc, 'italic');
  const fontMap: Record<TokenStyle, string> = {
    normal: `bold ${arialSize}px 'Arial Regular',sans-serif`,
    italic: `italic bold ${corsivSize}px 'Monotype Corsiva Bold Italic',cursive,serif`,
  };
  const linePad: Record<TokenStyle, number> = { normal: arialSize + 14, italic: corsivSize + 14 };
  const leftBound = W * 0.12;
  const maxWidth = W * 0.82;
  const lines: Token[][] = [];
  let cur: Token[] = [];
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
