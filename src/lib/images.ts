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

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (cache.has(src)) return Promise.resolve(cache.get(src)!);
  const pending = inflight.get(src);
  if (pending) return pending;

  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    markHighPriority(img);
    img.onload = () => {
      inflight.delete(src);
      cache.set(src, img);
      resolve(img);
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
  return new Promise((resolve) => {
    const img = new Image();
    markHighPriority(img);
    img.onload = () => {
      cache.set(dataUrl, img);
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
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
            resizeQuality: 'high',
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

export async function fileToOrientedDataUrl(file: File): Promise<string | null> {
  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        bitmap.close();
        return null;
      }
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
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
