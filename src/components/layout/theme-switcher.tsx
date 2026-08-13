'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type Theme } from '@/lib/theme/theme-provider';
import { cn } from '@/lib/utils';

const options: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function ThemeSwitcher({ compact }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  return (
    <div
      className={cn(
        'flex rounded-xl border border-line bg-surface-raised p-1',
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
                ? 'bg-accent text-canvas shadow-glow'
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
