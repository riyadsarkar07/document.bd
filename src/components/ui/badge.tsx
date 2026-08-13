import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type BadgeTone = 'gold' | 'blue' | 'red' | 'green' | 'violet' | 'muted' | 'warning';

const tones: Record<BadgeTone, string> = {
  gold: 'bg-accent/12 text-accent-bright border-accent/30',
  blue: 'bg-info/10 text-info border-info/30',
  red: 'bg-danger/10 text-danger border-danger/30',
  green: 'bg-success/10 text-success border-success/30',
  violet: 'bg-violet/10 text-violet border-violet/30',
  warning: 'bg-warning/10 text-warning border-warning/30',
  muted: 'bg-surface-elevated text-muted border-line',
};

export function Badge({
  children,
  tone = 'muted',
  className,
  dot,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide',
        tones[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
