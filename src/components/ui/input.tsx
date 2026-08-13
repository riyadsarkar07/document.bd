import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'w-full rounded-xl border border-line bg-surface-raised px-3.5 py-2.5 text-sm text-primary outline-none transition-all placeholder:text-dimm focus:border-accent focus:ring-2 focus:ring-accent/25',
          className,
        )}
        {...props}
      />
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full resize-y rounded-xl border border-line bg-surface-raised px-3.5 py-2.5 text-sm text-primary outline-none transition-all placeholder:text-dimm focus:border-accent focus:ring-2 focus:ring-accent/25',
        className,
      )}
      {...props}
    />
  );
});

export function FieldLabel({
  children,
  className,
  mono,
  htmlFor,
  hint,
}: {
  children: React.ReactNode;
  className?: string;
  mono?: boolean;
  htmlFor?: string;
  hint?: string;
}) {
  return (
    <div className="mb-1.5">
      <label
        htmlFor={htmlFor}
        className={cn(
          'flex items-baseline justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted',
          mono && 'font-mono normal-case tracking-normal text-secondary',
          className,
        )}
      >
        <span>{children}</span>
        {hint && <span className="font-mono text-[10px] normal-case tracking-normal text-dimm">{hint}</span>}
      </label>
    </div>
  );
}
