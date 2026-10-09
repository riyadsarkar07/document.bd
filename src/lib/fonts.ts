'use client';

import { FONT_FACES } from '@/lib/constants/nid';
import { UNHCR_FONT_FACES } from '@/lib/constants/unhcr';
import { UNHCR_FONT_FACES as UNHCR_S2_FONT_FACES } from '@/lib/constants/unhcr-s2';

let loadPromise: Promise<boolean> | null = null;
let s2FontPromise: Promise<boolean> | null = null;

const TM_CORSIVA_FAMILY = 'Monotype Corsiva Bold Italic';

const TM_FONT_SPECS = [
  "16px 'Arial Regular'",
  "bold 16px 'Arial Regular'",
  `16px '${TM_CORSIVA_FAMILY}'`,
  `italic 16px '${TM_CORSIVA_FAMILY}'`,
  `bold 16px '${TM_CORSIVA_FAMILY}'`,
  `italic bold 16px '${TM_CORSIVA_FAMILY}'`,
] as const;

const TM_FONT_CHECKS = [
  "16px 'Arial Regular'",
  `16px '${TM_CORSIVA_FAMILY}'`,
  `italic bold 16px '${TM_CORSIVA_FAMILY}'`,
] as const;

const TM_CORSIVA_DESCRIPTORS: FontFaceDescriptors[] = [
  {},
  { style: 'italic' },
  { weight: 'bold' },
  { style: 'italic', weight: 'bold' },
];

const ARIAL_FONT_FACES = [
  { family: 'Arial Regular', url: '/assets/arial-regular.ttf' },
  { family: 'Arial Bold MT', url: '/assets/arial-bold.ttf' },
] as const;

let arialPromise: Promise<boolean> | null = null;

async function registerTmCorsivaFaces(): Promise<void> {
  const src = FONT_FACES.find((face) => face.family === TM_CORSIVA_FAMILY);
  if (!src) return;
  await Promise.all(
    TM_CORSIVA_DESCRIPTORS.map(async (descriptor) => {
      try {
        const ff = new FontFace(TM_CORSIVA_FAMILY, `url(${src.url})`, descriptor);
        await ff.load();
        document.fonts.add(ff);
      } catch (err) {
        console.warn(`[fonts] Failed to load "${TM_CORSIVA_FAMILY}" from ${src.url}`, err);
      }
    }),
  );
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
  await Promise.all(
    TM_FONT_SPECS.map(async (spec) => {
      try {
        await document.fonts.load(spec);
      } catch {
        // ignore
      }
    }),
  );
}

async function registerFace(family: string, url: string, descriptor: FontFaceDescriptors = {}): Promise<void> {
  try {
    const ff = new FontFace(family, `url(${url})`, descriptor);
    await ff.load();
    document.fonts.add(ff);
  } catch (err) {
    console.warn(`[fonts] Failed to load "${family}" from ${url}`, err);
  }
}

/**
 * Arial Regular + Arial Bold MT only. Dubai / Driving License / TIN / UNHCR
 * live preview must not wait on Kalpurush or TM Corsiva.
 */
export function loadArialFonts(): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  if (arialPromise) return arialPromise;
  if (coreFontFacesAreLoaded()) {
    arialPromise = Promise.resolve(true);
    return arialPromise;
  }

  arialPromise = (async () => {
    await Promise.all(ARIAL_FONT_FACES.map((face) => registerFace(face.family, face.url)));
    await Promise.all(
      ["16px 'Arial Regular'", "16px 'Arial Bold MT'"].map(async (spec) => {
        try {
          await document.fonts.load(spec);
        } catch {
          // ignore
        }
      }),
    );
    const ok = coreFontFacesAreLoaded();
    if (!ok) arialPromise = null;
    return ok;
  })();

  return arialPromise;
}

/**
 * Registers the exact font families the renderers depend on. Family names and
 * file mappings are preserved from the original application.
 *
 * Resolves true after the shared renderer face (`Arial Regular`) is confirmed
 * loaded. TM Corsiva is still requested in parallel, but a missing Corsiva
 * file no longer blocks NID/TIN live preview.
 */
export function loadDocumentFonts(): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const faces = [...FONT_FACES, ...UNHCR_FONT_FACES];
    const seen = new Set<string>();
    const unique = faces.filter((face) => {
      if (face.family === TM_CORSIVA_FAMILY) return false;
      const key = `${face.family}:${'weight' in face && face.weight ? face.weight : ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    await Promise.all([
      ...unique.map((face) => {
        const descriptor: FontFaceDescriptors =
          'weight' in face && face.weight ? { weight: face.weight } : {};
        return registerFace(face.family, face.url, descriptor);
      }),
      registerTmCorsivaFaces(),
    ]);
    await Promise.all([
      (async () => {
        try {
          await document.fonts.load("16px 'Arial Bold MT'");
        } catch {
          // ignore
        }
      })(),
      loadTmFontFaces(),
    ]);
    const ok = coreFontFacesAreLoaded();
    if (!ok) loadPromise = null;
    return ok;
  })();

  return loadPromise;
}

/**
 * Server 2 Arial faces only. Must not wait for NID/Kalpurush, TM Corsiva, or
 * other workspace asset fonts before the UNHCR S2 canvas can paint.
 */
export function loadUnhcrS2Fonts(): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  if (s2FontPromise) return s2FontPromise;

  s2FontPromise = (async () => {
    await Promise.all(UNHCR_S2_FONT_FACES.map((face) => registerFace(face.family, face.url)));
    await Promise.all(
      ["16px 'Arial Regular'", "16px 'Arial Bold MT'"].map(async (spec) => {
        try {
          await document.fonts.load(spec);
        } catch {
          // ignore
        }
      }),
    );
    const ok = fontFaceLoaded("16px 'Arial Regular'");
    if (!ok) s2FontPromise = null;
    return ok;
  })();

  return s2FontPromise;
}

/** Block TM canvas work until the certificate fonts are actually usable. */
export async function ensureTmFontsReady(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const ok = await loadDocumentFonts();
  if (!ok) return false;
  if (tmFontFacesAreLoaded()) return true;
  await loadTmFontFaces();
  return tmFontFacesAreLoaded();
}
