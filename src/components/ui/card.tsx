import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  bodyClassName?: string;
  flush?: boolean;
  hover?: boolean;
}

export function Card({
  className,
  title,
  subtitle,
  action,
  bodyClassName,
  flush,
  hover,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-line bg-surface shadow-card',
        hover && 'transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop',
        className,
      )}
      {...props}
    >
      {(title || action) && (
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {title && (
              <h3 className="font-display text-[15px] font-semibold text-primary">{title}</h3>
            )}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={cn(!flush && 'p-5', bodyClassName)}>{children}</div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-4">
        {icon && (
          <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface-raised text-accent-bright shadow-card">
            {icon}
          </div>
        )}
        <div>
          {eyebrow && (
            <div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-accent-bright">
              {eyebrow}
            </div>
          )}
          <h1 className="font-display text-2xl font-bold tracking-tight text-primary">{title}</h1>
          {subtitle && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'gold',
  href,
  loading,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: ReactNode;
  tone?: 'gold' | 'blue' | 'green' | 'violet' | 'red';
  href?: string;
  loading?: boolean;
}) {
  const tones: Record<string, string> = {
    gold: 'from-accent/20 to-accent/5 text-accent-bright',
    blue: 'from-info/20 to-info/5 text-info',
    green: 'from-success/20 to-success/5 text-success',
    violet: 'from-violet/20 to-violet/5 text-violet',
    red: 'from-danger/20 to-danger/5 text-danger',
  };
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-card transition-all duration-200 hover:border-line-strong hover:shadow-pop">
      <div
        className={`pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br blur-2xl ${tones[tone]}`}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
            {label}
          </div>
          <div className="mt-2 font-display text-[28px] font-bold leading-none tracking-tight text-primary">
            {loading ? (
              <span className="inline-block h-7 w-14 animate-pulse rounded-lg bg-surface-elevated" />
            ) : (
              value
            )}
          </div>
          {hint && <div className="mt-2 truncate font-mono text-[11px] text-dimm">{hint}</div>}
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${tones[tone]}`}>
          {icon}
        </div>
      </div>
      {href && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-accent/60 to-accent/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      )}
    </div>
  );
}
