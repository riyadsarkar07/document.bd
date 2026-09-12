'use client';

import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { AnnotationSvg } from '@/lib/pdf-editor/annotations-svg';
import { pageVisualSize } from '@/lib/pdf-editor/geometry';
import { renderPdfPageToCanvas } from '@/lib/pdf-editor/pdfjs';
import type { NativeTextRun, PdfAnnotation, PdfPageMeta, PdfPoint } from '@/lib/pdf-editor/types';
import { clamp01 } from '@/lib/pdf-editor/geometry';
import { cn } from '@/lib/utils';

export function pointerToNorm(e: { clientX: number; clientY: number }, el: HTMLElement): PdfPoint {
  const r = el.getBoundingClientRect();
  return {
    x: clamp01(r.width ? (e.clientX - r.left) / r.width : 0),
    y: clamp01(r.height ? (e.clientY - r.top) / r.height : 0),
  };
}

export function PdfPageView({
  pdf,
  page,
  annotations,
  selectedId,
  zoom,
  draft,
  interactive,
  thumbnail,
  textRuns,
  hoveredRunId,
  editingId,
  onTextChange,
  onEditEnd,
  onHoverEnd,
  className,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  pdf: PDFDocumentProxy | null;
  page: PdfPageMeta;
  annotations: PdfAnnotation[];
  selectedId?: string | null;
  zoom: number;
  draft?: PdfAnnotation | null;
  interactive?: boolean;
  thumbnail?: boolean;
  textRuns?: NativeTextRun[];
  hoveredRunId?: string | null;
  editingId?: string | null;
  onTextChange?: (id: string, text: string) => void;
  onEditEnd?: () => void;
  onHoverEnd?: () => void;
  className?: string;
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>, point: PdfPoint) => void;
  onPointerMove?: (e: React.PointerEvent<HTMLDivElement>, point: PdfPoint) => void;
  onPointerUp?: (e: React.PointerEvent<HTMLDivElement>, point: PdfPoint) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [cssSize, setCssSize] = useState(() => {
    const size = pageVisualSize(page);
    const scale = thumbnail ? 0.18 : zoom;
    return { width: Math.max(1, size.width * scale), height: Math.max(1, size.height * scale) };
  });

  useEffect(() => {
    const size = pageVisualSize(page);
    const scale = thumbnail ? Math.min(0.22, 140 / size.width) : zoom;
    setCssSize({
      width: Math.max(1, Math.round(size.width * scale)),
      height: Math.max(1, Math.round(size.height * scale)),
    });
  }, [page, zoom, thumbnail]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pdf) return;
    let cancelled = false;
    const size = pageVisualSize(page);
    const scale = thumbnail ? Math.min(0.28, 180 / size.width) : Math.max(0.35, zoom);
    void renderPdfPageToCanvas(pdf, page.sourceIndex, canvas, {
      scale,
      rotation: page.rotation,
    }).then((result) => {
      if (cancelled) return;
      if (!thumbnail) {
        setCssSize({
          width: Math.max(1, Math.round(result.width)),
          height: Math.max(1, Math.round(result.height)),
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pdf, page, zoom, thumbnail]);

  const items = draft ? [...annotations, draft] : annotations;

  return (
    <div
      ref={wrapRef}
      className={cn(
        'relative overflow-hidden bg-white shadow-deep',
        thumbnail ? 'rounded-lg border border-line' : 'touch-none rounded-[6px] border border-line-strong',
        className,
      )}
      style={{ width: cssSize.width, height: cssSize.height }}
      onPointerDown={
        interactive
          ? (e) => {
              if (!wrapRef.current) return;
              onPointerDown?.(e, pointerToNorm(e, wrapRef.current));
            }
          : undefined
      }
      onPointerMove={
        interactive
          ? (e) => {
              if (!wrapRef.current) return;
              onPointerMove?.(e, pointerToNorm(e, wrapRef.current));
            }
          : undefined
      }
      onPointerUp={
        interactive
          ? (e) => {
              if (!wrapRef.current) return;
              onPointerUp?.(e, pointerToNorm(e, wrapRef.current));
            }
          : undefined
      }
      onPointerLeave={
        interactive
          ? (e) => {
              if (e.buttons === 0) {
                onHoverEnd?.();
                return;
              }
              if (!wrapRef.current) return;
              onPointerUp?.(e, pointerToNorm(e, wrapRef.current));
            }
          : undefined
      }
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {textRuns?.map((run) => (
        <div
          key={run.id}
          className={cn(
            'pointer-events-none absolute rounded-[2px]',
            run.id === hoveredRunId && 'bg-info/18 ring-1 ring-info/70',
          )}
          style={{
            left: `${run.x * 100}%`,
            top: `${run.y * 100}%`,
            width: `${run.width * 100}%`,
            height: `${run.height * 100}%`,
          }}
        />
      ))}
      <div className="pointer-events-none absolute inset-0">
        {items.map((annotation) =>
          annotation.type === 'text' && annotation.id === editingId ? (
            <textarea
              key={annotation.id}
              autoFocus
              value={annotation.text}
              onChange={(e) => onTextChange?.(annotation.id, e.target.value)}
              onBlur={() => onEditEnd?.()}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  onEditEnd?.();
                }
              }}
              className="pointer-events-auto absolute z-10 resize-none overflow-hidden rounded-[2px] border-2 border-accent bg-white p-0 text-primary shadow-glow outline-none"
              style={{
                left: `${annotation.x * 100}%`,
                top: `${annotation.y * 100}%`,
                width: `${Math.max(annotation.width, 0.04) * 100}%`,
                height: `${Math.max(annotation.height, annotation.fontSize * 1.2) * 100}%`,
                color: annotation.color,
                fontSize: Math.max(4, annotation.fontSize * cssSize.height),
                fontWeight: annotation.bold ? 700 : 400,
                fontFamily: annotation.fontFamily || 'Helvetica, Arial, sans-serif',
                textAlign: annotation.align || 'left',
                lineHeight: 1.1,
              }}
              aria-label="Edit PDF text"
            />
          ) : (
            <AnnotationSvg
              key={annotation.id}
              annotation={annotation}
              width={cssSize.width}
              height={cssSize.height}
              selected={annotation.id === selectedId}
            />
          ),
        )}
      </div>
    </div>
  );
}
