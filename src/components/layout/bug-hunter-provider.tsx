'use client';

import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { installBugHunter, reportCapturedError } from '@/lib/bug-hunter/capture';

class BugHunterBoundary extends Component<{ children: ReactNode }> {
  componentDidCatch(error: Error, info: ErrorInfo) {
    reportCapturedError({
      kind: 'load',
      message: error.message || 'Component render failed',
      stack: error.stack ?? null,
      component: (info.componentStack ?? '').trim().split('\n')[0]?.trim() || null,
    });
  }

  render() {
    return this.props.children;
  }
}

export function BugHunterProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    return installBugHunter();
  }, []);
  return <BugHunterBoundary>{children}</BugHunterBoundary>;
}
