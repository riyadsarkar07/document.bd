'use client';

const cache = new Map<string, HTMLImageElement>();
const inflight = new Map<string, Promise<HTMLImageElement | null>>();

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (cache.has(src)) return Promise.resolve(cache.get(src)!);
  const pending = inflight.get(src);
  if (pending) return pending;

  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      cache.set(src, img);
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
  inflight.set(src, promise);
  return promise;
}

export function loadDataUrlImage(dataUrl: string): Promise<HTMLImageElement | null> {
  if (cache.has(dataUrl)) return Promise.resolve(cache.get(dataUrl)!);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      cache.set(dataUrl, img);
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
