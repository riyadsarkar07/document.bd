import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline' | 'soft' | 'cyber';
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-gradient-to-br from-accent to-accent-deep text-canvas font-semibold shadow-glow hover:shadow-glow-lg hover:brightness-110 active:brightness-95 transition-all',
  secondary:
    'bg-surface-raised text-primary border border-line hover:border-line-strong hover:bg-surface-hover active:bg-surface-elevated',
  outline: 'bg-transparent text-secondary border border-line hover:border-accent hover:text-accent-bright',
  ghost: 'bg-transparent text-muted hover:text-primary hover:bg-surface-raised',
  danger: 'bg-danger/10 text-danger border border-danger/25 hover:bg-danger/20',
  success: 'bg-success/10 text-success border border-success/25 hover:bg-success/20',
  soft: 'bg-accent/10 text-accent-bright border border-accent/20 hover:bg-accent/15',
  cyber:
    'bg-emerald-500 text-black font-bold shadow-[0_0_24px_rgba(52,211,153,0.35)] border border-emerald-400/60 hover:bg-emerald-400 hover:shadow-[0_0_36px_rgba(52,211,153,0.5)] active:brightness-95 transition-all',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-sm gap-2 rounded-xl',
  icon: 'h-9 w-9 rounded-lg',
  'icon-sm': 'h-7 w-7 rounded-md',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', loading, icon, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap font-medium outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-45',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});
