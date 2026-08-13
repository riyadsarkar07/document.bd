'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useHistory } from '@/lib/hooks/useHistory';
import { useDebouncedCallback } from '@/lib/hooks/useDebouncedCallback';
import { useLocalStorage } from '@/lib/hooks/useLocalStorage';
import { clamp } from '@/lib/utils';
import type { ViewportDims } from '@/components/editor/editor-viewport';

interface UseDocumentEditorOptions<T> {
  kind: string;
  defaults: T;
  autosaveKey: string;
  /** Load initial state from external source (project/template). Returns null to keep defaults. */
  loadExternal?: () => T | null;
  onAutosave?: (state: T) => void;
}

export function useDocumentEditor<T>({
  kind,
  defaults,
  autosaveKey,
  loadExternal,
  onAutosave,
}: UseDocumentEditorOptions<T>) {
  const history = useHistory<T>(defaults);
  const [status, setStatus] = useState('System Ready');
  const [busy, setBusy] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [zoom, setZoom] = useState(0.25);
  const [dims, setDims] = useState<ViewportDims | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [autosaveEnabled] = useLocalStorage<boolean>('studio.autosave', true);
  const [autosaveDelay] = useLocalStorage<number>('studio.autosaveDelay', 800);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(false);
  const kindRef = useRef(kind);
  kindRef.current = kind;
  // True once the user manually zooms (buttons/preset/wheel). While true,
  // auto-fit (window resize, inspector toggle) must NOT override their zoom.
  const userZoomedRef = useRef(false);

  // Initial load (localStorage autosave or external project/template)
  useEffect(() => {
    let loaded: T | null = null;
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(autosaveKey);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<T>;
          loaded = { ...defaults, ...parsed };
        }
      } catch {
        // ignore corrupted autosave
      }
    }
    if (loadExternal) {
      const external = loadExternal();
      if (external) loaded = external;
    }
    if (loaded) history.replace(loaded);
    readyRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced autosave
  const persist = useDebouncedCallback(
    (state: T) => {
      if (!readyRef.current) return;
      if (autosaveEnabled) {
        try {
          window.localStorage.setItem(autosaveKey, JSON.stringify(state));
        } catch {
          // ignore
        }
        setLastSavedAt(new Date().toLocaleTimeString());
        onAutosave?.(state);
      }
    },
    autosaveDelay,
  );

  useEffect(() => {
    persist(history.present);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.present]);

  // Stable field setter (history identity changes each render; read via ref so
  // the callback identity never changes and memoized controls can bail out).
  const historyRef = useRef(history);
  historyRef.current = history;
  const setField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    historyRef.current.set((prev) => ({ ...prev, [key]: value }) as T);
  }, []);

  // Fit document into the visible viewport (display-only; never touches coordinates)
  const fit = useCallback(() => {
    const el = containerRef.current;
    if (!el || !dims) return;
    const pad = 64;
    const availW = el.clientWidth - pad;
    const availH = el.clientHeight - pad;
    if (availW <= 0 || availH <= 0) return;
    const z = Math.min(availW / dims.w, availH / dims.h);
    userZoomedRef.current = false;
    setZoom(clamp(z, 0.02, 4));
  }, [dims]);

  const zoomIn = useCallback(() => {
    userZoomedRef.current = true;
    setZoom((z) => clamp(z * 1.25, 0.02, 4));
  }, []);
  const zoomOut = useCallback(() => {
    userZoomedRef.current = true;
    setZoom((z) => clamp(z / 1.25, 0.02, 4));
  }, []);
  const zoomActual = useCallback(() => {
    userZoomedRef.current = true;
    setZoom(1);
  }, []);
  const zoomPreset = useCallback((pct: number) => {
    userZoomedRef.current = true;
    setZoom(clamp(pct / 100, 0.02, 4));
  }, []);

  // Auto-fit on first render + whenever the document dimensions change
  useEffect(() => {
    if (dims) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dims?.w, dims?.h]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      // Respect a manual zoom; only auto-fit while the user hasn't zoomed.
      if (dims && !userZoomedRef.current) fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dims, inspectorOpen]);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().then(() => setFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleInspector = useCallback(() => setInspectorOpen((v) => !v), []);

  return {
    ...history,
    setField,
    present: history.present,
    setStatus,
    busy,
    setBusy,
    rendered,
    setRendered,
    zoom,
    setZoom,
    zoomIn,
    zoomOut,
    zoomActual,
    zoomPreset,
    dims,
    setDims,
    fullscreen,
    toggleFullscreen,
    inspectorOpen,
    toggleInspector,
    containerRef,
    fit,
    lastSavedAt,
    status,
    kind: kindRef.current,
  };
}
