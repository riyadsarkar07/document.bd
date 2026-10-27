'use client';

import { useCallback, useEffect, useState } from 'react';
import { forgetImage, loadImage, loadImageToCanvas } from '@/lib/images';

export function useTemplateImage(src: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    void loadImage(src).then((img) => {
      if (!alive) return;
      if (img) {
        setImage(img);
        setError(null);
        return;
      }
      setImage(null);
      setError('Template image failed to load. Check the network and retry.');
    });
    return () => {
      alive = false;
    };
  }, [src, attempt]);

  const retry = useCallback(() => {
    forgetImage(src);
    setAttempt((n) => n + 1);
  }, [src]);

  return { image, error, retry };
}

export function useTemplateCanvas(src: string, width: number, height: number) {
  const [image, setImage] = useState<HTMLImageElement | HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    void (async () => {
      const canvas = await loadImageToCanvas(src, width, height);
      if (!alive) return;
      if (canvas) {
        setImage(canvas);
        setError(null);
        return;
      }
      const img = await loadImage(src);
      if (!alive) return;
      if (img) {
        setImage(img);
        setError(null);
        return;
      }
      setImage(null);
      setError('Template image failed to load. Check the network and retry.');
    })();
    return () => {
      alive = false;
    };
  }, [src, width, height, attempt]);

  const retry = useCallback(() => {
    forgetImage(src);
    setAttempt((n) => n + 1);
  }, [src]);

  return { image, error, retry };
}
