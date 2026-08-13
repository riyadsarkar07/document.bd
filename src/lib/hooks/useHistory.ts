'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type { TMSnapshot, NIDSnapshot } from '@/lib/editor/types';

export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

const MAX_HISTORY = 60;

/**
 * Generic undo/redo store with bounded history. Pushes a new snapshot onto
 * the undo stack whenever `set` is called with a value that differs from the
 * current present value.
 */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState<HistoryState<T>>(() => ({
    past: [],
    present: initial,
    future: [],
  }));

  const skipNext = useRef(false);

  const set = useCallback((updater: T | ((prev: T) => T)) => {
    setState((prev) => {
      const next =
        typeof updater === 'function' ? (updater as (prev: T) => T)(prev.present) : updater;
      if (next === prev.present) return prev;
      const past = [...prev.past.slice(-MAX_HISTORY), prev.present];
      return { past, present: next, future: [] };
    });
  }, []);

  /** Replace the present value without recording history (used for load/reset). */
  const replace = useCallback((next: T) => {
    skipNext.current = true;
    setState(() => ({ past: [], present: next, future: [] }));
  }, []);

  const undo = useCallback(() => {
    setState((prev) => {
      if (!prev.past.length) return prev;
      const previous = prev.past[prev.past.length - 1];
      return {
        past: prev.past.slice(0, -1),
        present: previous,
        future: [prev.present, ...prev.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((prev) => {
      if (!prev.future.length) return prev;
      const [next, ...rest] = prev.future;
      return {
        past: [...prev.past, prev.present],
        present: next,
        future: rest,
      };
    });
  }, []);

  // Keyboard shortcuts: Cmd/Ctrl+Z (undo), Shift+Cmd/Ctrl+Z or Ctrl+Y (redo)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const inField =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable;
      if (inField && !(e.metaKey || e.ctrlKey)) return;
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if ((e.metaKey || e.ctrlKey) && (e.shiftKey || e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  return {
    present: state.present,
    past: state.past,
    future: state.future,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    set,
    replace,
    undo,
    redo,
    reset: () => setState(() => ({ past: [], present: initial, future: [] })),
  };
}
