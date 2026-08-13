'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CollapsibleSectionProps {
  title: ReactNode;
  icon?: ReactNode;
  accent?: 'gold' | 'blue' | 'default';
  defaultOpen?: boolean;
  badge?: ReactNode;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  icon,
  accent = 'default',
  defaultOpen = true,
  badge,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className={cn(
        'border-b border-line',
        accent === 'gold' && 'border-accent/25 bg-accent-dim/30',
        accent === 'blue' && 'border-info/25 bg-info-dim/30',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-surface-raised',
          accent === 'gold' && 'border-b border-accent/20 bg-accent/5',
          accent === 'blue' && 'border-b border-info/20 bg-info/5',
        )}
      >
        <span
          className={cn(
            'flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide',
            accent === 'gold' && 'text-accent-bright',
            accent === 'blue' && 'text-info',
            accent === 'default' && 'text-muted',
          )}
        >
          {icon}
          {title}
          {badge}
        </span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 text-dimm transition-transform', !open && '-rotate-90')}
        />
      </button>
      {open && <div className="flex flex-col gap-4 px-4 py-4">{children}</div>}
    </div>
  );
}
