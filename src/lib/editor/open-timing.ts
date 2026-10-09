'use client';

const measured = new Set<string>();

export function markEditorPhase(route: string, phase: string): void {
  if (typeof performance === 'undefined' || typeof performance.mark !== 'function') return;
  const name = `editor-open:${route}:${phase}`;
  if (measured.has(name)) return;
  measured.add(name);
  try {
    performance.mark(name);
  } catch {
    // unsupported Performance
  }
}

export function measureEditorOpen(route: string): void {
  if (measured.has(`editor-open:${route}`)) return;
  if (typeof performance === 'undefined' || typeof performance.measure !== 'function') return;
  measured.add(`editor-open:${route}`);
  try {
    performance.measure(
      `editor-open:${route}`,
      `editor-open:${route}:module`,
      `editor-open:${route}:interactive`,
    );
  } catch {
    // missing marks
  }
}
