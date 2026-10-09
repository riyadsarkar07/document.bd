'use client';

const cache = new Map<string, HTMLImageElement>();
const inflight = new Map<string, Promise<HTMLImageElement | null>>();
const canvasCache = new Map<string, HTMLCanvasElement>();
const canvasInflight = new Map<string, Promise<HTMLCanvasElement | null>>();

function markHighPriority(img: HTMLImageElement): void {
  img.decoding = 'async';
  img.loading = 'eager';
  const withPriority = img as HTMLImageElement & { fetchPriority?: string };
  withPriority.fetchPriority = 'high';
}

export function preloadImage(src: string): void {
  if (typeof document === 'undefined') return;
  const marker = `link[data-preload-src="${src}"]`;
  if (document.querySelector(marker)) return;
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = src;
  link.setAttribute('data-preload-src', src);
  const withPriority = link as HTMLLinkElement & { fetchPriority?: string };
  withPriority.fetchPriority = 'high';
  document.head.appendChild(link);
}

export function getCachedImage(src: string): HTMLImageElement | null {
  return cache.get(src) ?? null;
}

async function finishImageLoad(src: string, img: HTMLImageElement): Promise<HTMLImageElement> {
  try {
    if (typeof img.decode === 'function') await img.decode();
  } catch {
    // decode() is best-effort; onload already produced a drawable frame
  }
  cache.set(src, img);
  return img;
}

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (cache.has(src)) return Promise.resolve(cache.get(src)!);
  const pending = inflight.get(src);
  if (pending) return pending;

  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    markHighPriority(img);
    img.onload = () => {
      void finishImageLoad(src, img).then((ready) => {
        inflight.delete(src);
        resolve(ready);
      });
    };
    img.onerror = () => {
      inflight.delete(src);
      resolve(null);
    };
    img.src = src;
  });
  inflight.set(src, promise);
  return promise;
}

export function loadDataUrlImage(dataUrl: string): Promise<HTMLImageElement | null> {
  if (cache.has(dataUrl)) return Promise.resolve(cache.get(dataUrl)!);
  const pending = inflight.get(dataUrl);
  if (pending) return pending;

  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    markHighPriority(img);
    img.onload = () => {
      void finishImageLoad(dataUrl, img).then((ready) => {
        inflight.delete(dataUrl);
        resolve(ready);
      });
    };
    img.onerror = () => {
      inflight.delete(dataUrl);
      resolve(null);
    };
    img.src = dataUrl;
  });
  inflight.set(dataUrl, promise);
  return promise;
}

function canvasCacheKey(src: string, width: number, height: number): string {
  return `${src}::${width}x${height}`;
}

/** Decode an image already sized to the working canvas so first paint is instant. */
export function loadImageToCanvas(
  src: string,
  width: number,
  height: number,
): Promise<HTMLCanvasElement | null> {
  const key = canvasCacheKey(src, width, height);
  if (canvasCache.has(key)) return Promise.resolve(canvasCache.get(key)!);
  const pending = canvasInflight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    try {
      if (typeof fetch === 'function' && typeof createImageBitmap === 'function') {
        const res = await fetch(src, { cache: 'force-cache' });
        if (res.ok) {
          const blob = await res.blob();
          const bitmap = await createImageBitmap(blob, {
            resizeWidth: width,
            resizeHeight: height,
            resizeQuality: 'medium',
            imageOrientation: 'from-image',
          });
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(bitmap, 0, 0, width, height);
            bitmap.close();
            canvasCache.set(key, canvas);
            return canvas;
          }
          bitmap.close();
        }
      }
    } catch {
      // fall through to HTMLImageElement
    }
    const img = await loadImage(src);
    if (!img) return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);
    canvasCache.set(key, canvas);
    return canvas;
  })().finally(() => {
    canvasInflight.delete(key);
  });

  canvasInflight.set(key, promise);
  return promise;
}

function fileKeepsAlpha(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  return (
    type.includes('png') ||
    type.includes('webp') ||
    type.includes('gif') ||
    name.endsWith('.png') ||
    name.endsWith('.webp') ||
    name.endsWith('.gif')
  );
}

export async function fileToOrientedDataUrl(file: File): Promise<string | null> {
  const preserveAlpha = fileKeepsAlpha(file);
  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) {
        bitmap.close();
        return null;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      if (preserveAlpha) return canvas.toDataURL('image/png');
      return canvas.toDataURL('image/jpeg', 0.92);
    }
  } catch {
    // fall through
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

const SMALL_DATA_URL_CHARS = 80_000;

/**
 * Downscale a data-URL photo before vault persistence so History saves stay
 * well under PostgREST payload limits. Alpha images stay PNG; others JPEG.
 */
export async function compressDataUrlImage(
  dataUrl: string,
  maxWidth: number,
  maxHeight: number,
  quality = 0.82,
): Promise<string> {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return dataUrl;
  if (dataUrl.length < SMALL_DATA_URL_CHARS) return dataUrl;
  if (typeof document === 'undefined') return dataUrl;
  const img = await loadDataUrlImage(dataUrl);
  if (!img) return dataUrl;
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (srcW <= 0 || srcH <= 0) return dataUrl;
  const scale = Math.min(1, maxWidth / srcW, maxHeight / srcH);
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return dataUrl;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const keepAlpha = dataUrl.startsWith('data:image/png') || dataUrl.startsWith('data:image/webp') || dataUrl.startsWith('data:image/gif');
  try {
    const next = keepAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality);
    return next && next.startsWith('data:image/') && next.length < dataUrl.length ? next : dataUrl;
  } catch {
    return dataUrl;
  }
}
