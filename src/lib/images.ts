'use client';

import { encodeAssetUrl } from '@/lib/asset-url';

export { encodeAssetUrl };

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

function isSameOriginSrc(src: string): boolean {
  if (typeof window === 'undefined') return true;
  if (!src || src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('/')) return true;
  try {
    return new URL(src, window.location.href).origin === window.location.origin;
  } catch {
    return true;
  }
}

export function preloadImage(src: string): void {
  if (typeof document === 'undefined') return;
  const href = encodeAssetUrl(src);
  const marker = `link[data-preload-src="${href}"]`;
  if (document.querySelector(marker)) return;
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = href;
  link.setAttribute('data-preload-src', href);
  if (!isSameOriginSrc(href)) link.crossOrigin = 'anonymous';
  const withPriority = link as HTMLLinkElement & { fetchPriority?: string };
  withPriority.fetchPriority = 'high';
  document.head.appendChild(link);
}

export function getCachedImage(src: string): HTMLImageElement | null {
  return cache.get(src) ?? cache.get(encodeAssetUrl(src)) ?? null;
}

export function forgetImage(src: string): void {
  const key = encodeAssetUrl(src);
  cache.delete(src);
  cache.delete(key);
  inflight.delete(src);
  inflight.delete(key);
  Array.from(canvasCache.keys()).forEach((canvasKey) => {
    if (canvasKey.startsWith(`${src}::`) || canvasKey.startsWith(`${key}::`)) {
      canvasCache.delete(canvasKey);
    }
  });
}

async function finishImageLoad(src: string, img: HTMLImageElement): Promise<HTMLImageElement> {
  try {
    if (typeof img.decode === 'function') await img.decode();
  } catch {
    // decode() is best-effort; onload already produced a drawable frame
  }
  cache.set(src, img);
  cache.set(encodeAssetUrl(src), img);
  return img;
}

function bindImage(src: string, url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (!isSameOriginSrc(url)) img.crossOrigin = 'anonymous';
    markHighPriority(img);
    img.onload = () => {
      void finishImageLoad(src, img).then(resolve);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export function loadImage(src: string, retries = 2): Promise<HTMLImageElement | null> {
  const cached = getCachedImage(src);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(src) ?? inflight.get(encodeAssetUrl(src));
  if (pending) return pending;

  const url = encodeAssetUrl(src);
  const promise = (async () => {
    let last: HTMLImageElement | null = null;
    const attempts = Math.max(1, retries + 1);
    for (let i = 0; i < attempts; i += 1) {
      last = await bindImage(src, url);
      if (last) return last;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 180 * (i + 1)));
      }
    }
    return last;
  })().finally(() => {
    inflight.delete(src);
    inflight.delete(url);
  });

  inflight.set(src, promise);
  inflight.set(url, promise);
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
  return `${encodeAssetUrl(src)}::${width}x${height}`;
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

  const url = encodeAssetUrl(src);
  const promise = (async () => {
    try {
      if (typeof fetch === 'function' && typeof createImageBitmap === 'function') {
        let lastErr: unknown = null;
        for (let i = 0; i < 3; i += 1) {
          try {
            const res = await fetch(url, { cache: 'force-cache' });
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
            lastErr = new Error(`HTTP ${res.status}`);
          } catch (err) {
            lastErr = err;
          }
          if (i < 2) await new Promise((r) => setTimeout(r, 200 * (i + 1)));
        }
        void lastErr;
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
