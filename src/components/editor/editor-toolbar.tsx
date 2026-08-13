'use client';

import {
  Download,
  Eye,
  FileDown,
  Loader2,
  Redo2,
  RotateCcw,
  Save,
  Undo2,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EditorToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  busy: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  onRender: () => void;
  onExportJpg: () => void;
  onExportPdf?: () => void;
  onPreview: () => void;
  onSaveProject?: () => void;
  status?: string;
  lastSavedAt?: string | null;
  className?: string;
}

export function EditorToolbar({
  canUndo,
  canRedo,
  busy,
  onUndo,
  onRedo,
  onReset,
  onRender,
  onExportJpg,
  onExportPdf,
  onPreview,
  onSaveProject,
  status,
  lastSavedAt,
  className,
}: EditorToolbarProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 border-b border-line bg-surface/85 px-3 py-2.5 backdrop-blur-xl sm:px-4',
        className,
      )}
    >
      {/* History cluster */}
      <div className="flex items-center gap-1 rounded-xl border border-line bg-surface-raised p-1">
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Undo (Ctrl+Z)"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="Redo (Ctrl+Shift+Z)"
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={onReset} aria-label="Reset to defaults" title="Reset to defaults">
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Live indicator */}
      <div className="hidden items-center gap-2 rounded-xl border border-line bg-surface-raised px-3 py-1.5 md:flex">
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            busy ? 'animate-pulse bg-warning' : 'bg-success',
          )}
        />
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">
          {busy ? 'Rendering' : 'Live'}
        </span>
      </div>

      <div className="mx-1 h-5 w-px bg-line" />

      <Button variant="primary" size="sm" onClick={onRender} loading={busy}>
        <Zap className="h-3.5 w-3.5" />
        Force Refresh
      </Button>

      {onSaveProject && (
        <Button variant="secondary" size="sm" onClick={onSaveProject}>
          <Save className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Save Project</span>
        </Button>
      )}

      <div className="mx-1 h-5 w-px bg-line" />

      <Button variant="success" size="sm" onClick={onExportJpg}>
        <Download className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">JPG</span>
      </Button>
      {onExportPdf && (
        <Button variant="outline" size="sm" onClick={onExportPdf}>
          <FileDown className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">PDF</span>
        </Button>
      )}

      <Button variant="ghost" size="sm" onClick={onPreview}>
        <Eye className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Preview</span>
      </Button>

      <div className="ml-auto flex items-center gap-3">
        {lastSavedAt && (
          <span className="hidden font-mono text-[10px] text-dimm lg:block">Saved {lastSavedAt}</span>
        )}
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />}
        <span className="hidden max-w-[220px] truncate font-mono text-[10.5px] text-dimm xl:block">
          {status ?? 'Ready'}
        </span>
      </div>
    </div>
  );
}
