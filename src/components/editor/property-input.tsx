'use client';

import { memo } from 'react';
import { FieldLabel, Input, Textarea } from '@/components/ui/input';

interface PropertyInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  textarea?: boolean;
  rows?: number;
  mono?: boolean;
  dir?: 'ltr' | 'rtl';
}

export const PropertyInput = memo(
  function PropertyInput({
    label,
    value,
    onChange,
    textarea,
    rows = 2,
    mono,
    dir,
  }: PropertyInputProps) {
    return (
      <div>
        <FieldLabel mono={mono}>{label}</FieldLabel>
        {textarea ? (
          <Textarea dir={dir} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <Input
            dir={dir}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={mono ? 'font-mono text-xs' : undefined}
          />
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.label === next.label &&
    prev.value === next.value &&
    prev.textarea === next.textarea &&
    prev.rows === next.rows &&
    prev.mono === next.mono &&
    prev.dir === next.dir &&
    prev.onChange === next.onChange,
);
