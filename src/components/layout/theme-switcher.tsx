'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type Theme } from '@/lib/theme/theme-provider';
import { cn } from '@/lib/utils';

const options: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function ThemeSwitcher({
  compact,
  variant = 'default',
}: {
  compact?: boolean;
  /** Cyber restyle for the login screen; default keeps the classic styling. */
  variant?: 'default' | 'cyber';
}) {
  const { theme, setTheme } = useTheme();
  const cyber = variant === 'cyber';
  return (
    <div
      className={cn(
        'flex rounded-xl border p-1',
        cyber
          ? 'border-line-strong/60 bg-black/40 backdrop-blur-xl'
          : 'border-line bg-surface-raised',
        compact && 'scale-90 origin-right',
      )}
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = theme === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => setTheme(opt.value)}
            title={opt.label}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition',
              active
                ? cyber
                  ? 'bg-emerald-400/15 text-emerald-300 shadow-[0_0_14px_rgba(52,211,153,0.35)]'
                  : 'bg-accent text-canvas shadow-glow'
                : cyber
                  ? 'text-dimm hover:text-emerald-200'
                  : 'text-muted hover:text-primary',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {!compact && <span>{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
