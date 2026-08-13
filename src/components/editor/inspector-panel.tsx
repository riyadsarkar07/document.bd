'use client';

import { type ReactNode } from 'react';
import { PanelRightClose, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface InspectorPanelProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  open?: boolean;
  onToggle?: () => void;
}

/**
 * Right-side property inspector.
 * Desktop: fixed-width collapsible panel that never scrolls the canvas away.
 * Mobile: full-width bottom sheet with its own scroll area.
 */
export function InspectorPanel({ title, subtitle, children, footer, open = true, onToggle }: InspectorPanelProps) {
  return (
    <>
      {/* Desktop panel */}
      <aside
        className={cn(
          'hidden w-[380px] shrink-0 flex-col border-l border-line bg-surface transition-all duration-200 lg:flex',
          !open && 'w-0 border-l-0 overflow-hidden opacity-0',
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-accent-bright">
              <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-glow" />
              {title}
            </div>
            {subtitle && (
              <div className="mt-0.5 truncate font-mono text-[10px] text-dimm">{subtitle}</div>
            )}
          </div>
          {onToggle && (
            <Button size="icon-sm" variant="ghost" onClick={onToggle} aria-label="Close inspector">
              <PanelRightClose className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="shrink-0 border-t border-line">{footer}</div>}
      </aside>

      {/* Mobile bottom sheet */}
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-[85] flex flex-col rounded-t-3xl border-t border-line-strong bg-surface shadow-deep transition-transform duration-300 lg:hidden',
          !open && 'translate-y-full',
        )}
      >
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <div className="mx-auto h-1.5 w-10 shrink-0 rounded-full bg-line-strong" />
        </div>
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 pb-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-accent-bright">
              <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-glow" />
              {title}
            </div>
            {subtitle && (
              <div className="mt-0.5 truncate font-mono text-[9.5px] text-dimm">{subtitle}</div>
            )}
          </div>
          <Button size="icon-sm" variant="ghost" onClick={() => onToggle?.()} aria-label="Close inspector">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="max-h-[42vh] min-h-[32vh] overflow-y-auto pb-4">{children}</div>
        {footer && <div className="shrink-0 border-t border-line pb-[env(safe-area-inset-bottom)]">{footer}</div>}
      </div>
    </>
  );
}
