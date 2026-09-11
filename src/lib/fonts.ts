'use client';

import { FONT_FACES } from '@/lib/constants/nid';

let loadPromise: Promise<boolean> | null = null;

const TM_FONT_SPECS = [
  "16px 'Arial Regular'",
  "bold 16px 'Arial Regular'",
  "italic bold 16px 'Monotype Corsiva Bold Italic'",
] as const;

const TM_FONT_CHECKS = [
  "16px 'Arial Regular'",
  "16px 'Monotype Corsiva Bold Italic'",
] as const;

async function waitForDocumentFonts(): Promise<void> {
  try {
    await document.fonts.ready;
  } catch {
    // ignore
  }
}

function fontFaceLoaded(spec: string): boolean {
  try {
    return document.fonts.check(spec);
  } catch {
    return false;
  }
}

function coreFontFacesAreLoaded(): boolean {
  if (typeof document === 'undefined') return false;
  return fontFaceLoaded("16px 'Arial Regular'");
}

function tmFontFacesAreLoaded(): boolean {
  if (typeof document === 'undefined') return false;
  return TM_FONT_CHECKS.every((spec) => fontFaceLoaded(spec));
}

async function loadTmFontFaces(): Promise<void> {
  for (const spec of TM_FONT_SPECS) {
    try {
      await document.fonts.load(spec);
    } catch {
      // ignore
    }
  }
}

/**
 * Registers the exact font families the renderers depend on. Family names and
 * file mappings are preserved from the original application.
 *
 * Resolves true after `document.fonts.ready` and the shared renderer face
 * (`Arial Regular`) is confirmed loaded. TM Corsiva is still requested, but a
 * missing Corsiva file no longer blocks NID/TIN live preview.
 */
export function loadDocumentFonts(): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    for (const face of FONT_FACES) {
      try {
        const descriptor: FontFaceDescriptors = face.weight
          ? { weight: face.weight }
          : {};
        const ff = new FontFace(face.family, `url(${face.url})`, descriptor);
        await ff.load();
        document.fonts.add(ff);
      } catch (err) {
        console.warn(`[fonts] Failed to load "${face.family}" from ${face.url}`, err);
      }
    }
    await waitForDocumentFonts();
    await loadTmFontFaces();
    await waitForDocumentFonts();
    const ok = coreFontFacesAreLoaded();
    if (!ok) loadPromise = null;
    return ok;
  })();

  return loadPromise;
}

/** Block TM canvas work until the certificate fonts are actually usable. */
export async function ensureTmFontsReady(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const ok = await loadDocumentFonts();
  if (!ok) return false;
  await waitForDocumentFonts();
  await loadTmFontFaces();
  await waitForDocumentFonts();
  return tmFontFacesAreLoaded();
}
