'use client';

import type { PdfAnnotation } from '@/lib/pdf-editor/types';
import { cn } from '@/lib/utils';

function strokePx(width: number, height: number, fraction: number): number {
  return Math.max(1, fraction * Math.min(width, height));
}

export function AnnotationSvg({
  annotation,
  width,
  height,
  selected,
}: {
  annotation: PdfAnnotation;
  width: number;
  height: number;
  selected?: boolean;
}) {
  const minSide = Math.min(width, height);
  const outline = selected ? 'drop-shadow(0 0 2px rgb(var(--accent)))' : undefined;

  if (annotation.type === 'text') {
    const native = annotation.source === 'native';
    return (
      <div
        className={cn(
          'pointer-events-none absolute overflow-hidden whitespace-pre leading-none',
          selected && 'ring-2 ring-accent',
          native && selected && 'bg-white/95',
          native && !selected && 'bg-white',
        )}
        style={{
          left: `${annotation.x * 100}%`,
          top: `${annotation.y * 100}%`,
          width: `${annotation.width * 100}%`,
          height: `${annotation.height * 100}%`,
          color: annotation.color,
          fontSize: Math.max(4, annotation.fontSize * height),
          fontWeight: annotation.bold ? 700 : 400,
          fontFamily: annotation.fontFamily || 'Helvetica, Arial, sans-serif',
          textAlign: annotation.align || 'left',
        }}
      >
        {annotation.text || (native ? '' : 'Text')}
      </div>
    );
  }

  if (annotation.type === 'highlight') {
    return (
      <div
        className={cn('pointer-events-none absolute', selected && 'ring-2 ring-accent')}
        style={{
          left: `${annotation.x * 100}%`,
          top: `${annotation.y * 100}%`,
          width: `${annotation.width * 100}%`,
          height: `${annotation.height * 100}%`,
          background: annotation.color,
          opacity: annotation.opacity,
          mixBlendMode: 'multiply',
        }}
      />
    );
  }

  if (annotation.type === 'whiteout') {
    return (
      <div
        className={cn('pointer-events-none absolute bg-white', selected && 'ring-2 ring-accent')}
        style={{
          left: `${annotation.x * 100}%`,
          top: `${annotation.y * 100}%`,
          width: `${annotation.width * 100}%`,
          height: `${annotation.height * 100}%`,
        }}
      />
    );
  }

  if (annotation.type === 'image' || annotation.type === 'signature') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={annotation.dataUrl}
        alt=""
        draggable={false}
        className={cn('pointer-events-none absolute object-contain', selected && 'ring-2 ring-accent')}
        style={{
          left: `${annotation.x * 100}%`,
          top: `${annotation.y * 100}%`,
          width: `${annotation.width * 100}%`,
          height: `${annotation.height * 100}%`,
        }}
      />
    );
  }

  if (annotation.type === 'pen') {
    const d = annotation.points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * width} ${p.y * height}`)
      .join(' ');
    return (
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${width} ${height}`}>
        <path
          d={d}
          fill="none"
          stroke={annotation.color}
          strokeWidth={strokePx(width, height, annotation.strokeWidth)}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: outline }}
        />
      </svg>
    );
  }

  const x = annotation.x * width;
  const y = annotation.y * height;
  const w = annotation.width * width;
  const h = annotation.height * height;
  const sw = Math.max(1.2, annotation.strokeWidth * minSide);

  if (annotation.shape === 'line') {
    return (
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${width} ${height}`}>
        <line
          x1={x}
          y1={y}
          x2={x + w}
          y2={y + h}
          stroke={annotation.stroke}
          strokeWidth={sw}
          strokeLinecap="round"
          style={{ filter: outline }}
        />
      </svg>
    );
  }

  if (annotation.shape === 'ellipse') {
    return (
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${width} ${height}`}>
        <ellipse
          cx={x + w / 2}
          cy={y + h / 2}
          rx={Math.abs(w) / 2}
          ry={Math.abs(h) / 2}
          fill={annotation.fill ?? 'none'}
          fillOpacity={annotation.fill ? 0.18 : 0}
          stroke={annotation.stroke}
          strokeWidth={sw}
          style={{ filter: outline }}
        />
      </svg>
    );
  }

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${width} ${height}`}>
      <rect
        x={Math.min(x, x + w)}
        y={Math.min(y, y + h)}
        width={Math.abs(w)}
        height={Math.abs(h)}
        fill={annotation.fill ?? 'none'}
        fillOpacity={annotation.fill ? 0.18 : 0}
        stroke={annotation.stroke}
        strokeWidth={sw}
        style={{ filter: outline }}
      />
    </svg>
  );
}
