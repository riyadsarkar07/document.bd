import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-line-strong bg-surface/50 px-6 py-16 text-center',
        className,
      )}
    >
      {icon && (
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-line bg-surface-raised text-accent-bright shadow-card">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <h3 className="font-display text-base font-semibold text-primary">{title}</h3>
        {description && <p className="mx-auto max-w-sm text-[13px] leading-relaxed text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
