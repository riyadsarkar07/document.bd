'use client';

import { memo, useState, type KeyboardEvent } from 'react';
import { clamp, cn } from '@/lib/utils';

interface PropertySliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  mono?: boolean;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
}

/**
 * Reusable slider + numeric badge control. The badge supports exact numeric
 * entry committed on blur/Enter and clamped to the slider range, mirroring the
 * original application's slider/badge sync behaviour.
 */
export const PropertySlider = memo(
  function PropertySlider({
    label,
    value,
    min,
    max,
    step = 1,
    mono,
    onChange,
    onCommit,
  }: PropertySliderProps) {
    const [draft, setDraft] = useState<string | null>(null);
    const effective = clamp(value, min, max);

    const commit = () => {
      if (draft === null) return;
      const parsed = parseFloat(draft);
      const clamped = Number.isNaN(parsed) ? value : clamp(parsed, min, max);
      setDraft(null);
      if (clamped !== value) {
        onChange(clamped);
        onCommit?.(clamped);
      }
    };

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
        (e.target as HTMLInputElement).blur();
      }
      if (e.key === 'Escape') setDraft(null);
    };

    const display = draft ?? String(value);

    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className={cn('truncate text-[11px]', mono ? 'font-mono text-dimm' : 'text-muted')}>
            {label}
          </span>
          <input
            type="text"
            inputMode="decimal"
            className={cn(
              'h-6 w-[58px] rounded-md border border-line bg-surface-elevated text-center font-mono text-[10.5px] font-semibold text-accent-bright outline-none transition focus:border-accent focus:bg-surface-raised',
            )}
            value={display}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={onKeyDown}
            onFocus={(e) => e.target.select()}
            aria-label={label}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={effective}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          onPointerUp={() => onCommit?.(effective)}
          className="w-full cursor-pointer outline-none"
          style={{ ['--fill' as string]: `${((effective - min) / (max - min)) * 100}%` }}
          aria-label={`${label} slider`}
        />
      </div>
    );
  },
  (prev, next) =>
    prev.label === next.label &&
    prev.value === next.value &&
    prev.min === next.min &&
    prev.max === next.max &&
    prev.step === next.step &&
    prev.mono === next.mono,
);
