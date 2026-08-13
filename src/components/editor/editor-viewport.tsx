'use client';

import { useRef, useState, type RefObject } from 'react';
import { Frame, Maximize, Minimize, ScanLine, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ViewportDims {
  w: number;
  h: number;
}

interface EditorViewportProps {
  canvasRef: RefObject<HTMLCanvasElement>;
  containerRef?: RefObject<HTMLDivElement>;
  dims: ViewportDims | null;
  rendered: boolean;
  zoom: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFit?: () => void;
  onActual?: () => void;
  onZoomPreset?: (pct: number) => void;
  placeholderTitle: string;
  placeholderSub?: string;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  kindLabel?: string;
}

export function EditorViewport({
  canvasRef,
  containerRef,
  dims,
  rendered,
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
  onActual,
  onZoomPreset,
  placeholderTitle,
  placeholderSub,
  fullscreen,
  onToggleFullscreen,
  kindLabel,
}: EditorViewportProps) {
  const internalContainerRef = useRef<HTMLDivElement>(null);
  const ref = containerRef ?? internalContainerRef;
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);

  const onWheel = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    if (e.deltaY < 0) onZoomIn?.();
    else onZoomOut?.();
  };

  const zoomLabel = `${Math.round(zoom * 100)}%`;
  const presets = [25, 50, 75, 100];

  const pickPreset = (pct: number) => {
    setZoomMenuOpen(false);
    if (pct === 100) onActual?.();
    else onZoomPreset?.(pct);
  };

  return (
    <div
      ref={ref}
      onWheel={onWheel}
      className="relative flex flex-1 overflow-auto bg-canvas-soft bg-grid p-8"
    >
      <div
        className="relative m-auto shrink-0 overflow-hidden rounded-[6px] border border-line-strong shadow-deep transition-shadow"
        style={{
          width: dims ? Math.max(dims.w * zoom, 1) : undefined,
          height: dims ? Math.max(dims.h * zoom, 1) : undefined,
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ display: rendered ? 'block' : 'none', width: '100%', height: '100%' }}
        />
        {!rendered && (
          <div className="flex h-full min-h-[420px] min-w-[520px] flex-col items-center justify-center gap-4 rounded-[6px] border-2 border-dashed border-line-strong bg-surface p-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface-raised text-accent-bright">
              <ScanLine className="h-7 w-7" />
            </div>
            <div>
              <div className="font-display text-sm font-semibold text-primary">{placeholderTitle}</div>
              {placeholderSub && (
                <div className="mt-1 font-mono text-[11px] text-dimm">{placeholderSub}</div>
              )}
            </div>
            {dims && (
              <div className="flex items-center gap-2 rounded-full border border-line bg-surface-raised px-3 py-1 font-mono text-[10.5px] text-muted">
                <ScanLine className="h-3 w-3 text-accent-bright" />
                {dims.w} × {dims.h} px · live render on every change
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating zoom HUD */}
      <div className="absolute bottom-20 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-2xl border border-line-strong bg-surface/90 p-1.5 shadow-pop backdrop-blur-xl lg:bottom-5">
        <button
          onClick={onFit}
          className="flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-[11px] font-semibold text-muted transition hover:bg-surface-raised hover:text-primary"
          title="Fit to screen"
        >
          <Frame className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Fit</span>
        </button>
        <div className="mx-0.5 h-5 w-px bg-line" />
        <button
          onClick={onZoomOut}
          className="flex h-8 w-8 items-center justify-center rounded-xl text-muted transition hover:bg-surface-raised hover:text-primary"
          aria-label="Zoom out"
          title="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <div className="relative">
          <button
            onClick={() => setZoomMenuOpen((v) => !v)}
            className="min-w-[58px] rounded-xl px-1.5 py-1.5 text-center font-mono text-xs font-bold text-accent-bright transition hover:bg-accent/10"
            title="Zoom presets"
            aria-haspopup="menu"
            aria-expanded={zoomMenuOpen}
          >
            {zoomLabel}
          </button>
          {zoomMenuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setZoomMenuOpen(false)} />
              <div
                role="menu"
                className="absolute bottom-10 left-1/2 z-40 -translate-x-1/2 rounded-xl border border-line-strong bg-surface p-1 shadow-pop"
              >
                {presets.map((pct) => (
                  <button
                    key={pct}
                    role="menuitem"
                    onClick={() => pickPreset(pct)}
                    className={cn(
                      'flex h-7 w-28 items-center justify-between rounded-lg px-2.5 font-mono text-[11px] transition hover:bg-surface-raised',
                      pct === 100
                        ? 'text-accent-bright'
                        : zoom === pct / 100
                          ? 'text-accent-bright'
                          : 'text-muted',
                    )}
                  >
                    <span>{pct}%</span>
                    {pct === 100 && <span className="text-[10px] text-dimm">Actual Size</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <button
          onClick={onZoomIn}
          className="flex h-8 w-8 items-center justify-center rounded-xl text-muted transition hover:bg-surface-raised hover:text-primary"
          aria-label="Zoom in"
          title="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <div className="mx-0.5 h-5 w-px bg-line" />
        <button
          onClick={onToggleFullscreen}
          className="flex h-8 w-8 items-center justify-center rounded-xl text-muted transition hover:bg-surface-raised hover:text-primary"
          aria-label="Toggle fullscreen"
          title="Toggle fullscreen"
        >
          {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
        </button>
      </div>

      {/* Dims chip */}
      {dims && (
        <div className="pointer-events-none absolute right-4 top-4 z-20 hidden items-center gap-2 rounded-full border border-line bg-surface/85 px-3 py-1.5 font-mono text-[10.5px] text-muted backdrop-blur-xl sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          {kindLabel ?? 'Canvas'} · {dims.w}×{dims.h}px
        </div>
      )}

      {/* Ctrl+scroll hint */}
      <div
        className={cn(
          'pointer-events-none absolute bottom-5 right-4 z-20 hidden rounded-full border border-line bg-surface/85 px-3 py-1.5 font-mono text-[10px] text-dimm backdrop-blur-xl lg:block',
        )}
      >
        Ctrl + scroll to zoom
      </div>
    </div>
  );
}
