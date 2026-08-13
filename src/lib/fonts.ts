'use client';

import { FONT_FACES } from '@/lib/constants/nid';

let loadPromise: Promise<boolean> | null = null;

/**
 * Registers the exact font families the renderers depend on. Family names and
 * file mappings are preserved from the original application.
 */
export function loadDocumentFonts(): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    let loadedCount = 0;
    for (const face of FONT_FACES) {
      try {
        const descriptor: FontFaceDescriptors = face.weight
          ? { weight: face.weight }
          : {};
        const ff = new FontFace(face.family, `url(${face.url})`, descriptor);
        await ff.load();
        document.fonts.add(ff);
        loadedCount++;
      } catch (err) {
        console.warn(`[fonts] Failed to load "${face.family}" from ${face.url}`, err);
      }
    }
    try {
      await document.fonts.ready;
    } catch {
      // ignore
    }
    return loadedCount > 0;
  })();

  return loadPromise;
}
