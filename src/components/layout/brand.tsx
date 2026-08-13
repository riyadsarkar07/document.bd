import Link from 'next/link';
import { Landmark } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Brand({
  size = 'md',
  href = '/studio',
  subtitle = 'BD Gov Portal',
}: {
  size?: 'sm' | 'md' | 'lg';
  href?: string;
  subtitle?: string;
}) {
  const box =
    size === 'lg' ? 'h-11 w-11 rounded-2xl' : size === 'sm' ? 'h-8 w-8 rounded-lg' : 'h-9 w-9 rounded-xl';
  const icon = size === 'lg' ? 'h-5 w-5' : size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const title = size === 'lg' ? 'text-lg' : size === 'sm' ? 'text-[13px]' : 'text-[15px]';

  return (
    <Link href={href} className="group flex items-center gap-3">
      <div
        className={cn(
          box,
          'relative flex shrink-0 items-center justify-center bg-gradient-to-br from-accent via-accent-bright to-accent-deep text-canvas shadow-glow transition-transform duration-200 group-hover:scale-105',
        )}
      >
        <Landmark className={cn(icon, 'stroke-[2.5]')} />
        <span className="pointer-events-none absolute inset-0 rounded-[inherit] bg-white/10 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div className="min-w-0">
        <div className={cn(title, 'truncate font-display font-bold leading-tight tracking-tight text-primary')}>
          Document Studio
        </div>
        <div className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-dimm">
          {subtitle}
        </div>
      </div>
    </Link>
  );
}
