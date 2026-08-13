'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { MobileNav } from '@/components/layout/mobile-nav';
import { X } from 'lucide-react';

export function StudioShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const isEditor = pathname.startsWith('/studio/editor');

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[90] flex lg:hidden">
          <div
            className="flex-1 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-[270px] animate-slide-in-right">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute -left-11 top-4 flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-muted transition hover:text-primary"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
            <Sidebar />
          </div>
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main
          className={
            isEditor
              ? 'flex min-h-0 flex-1 overflow-hidden'
              : 'min-h-0 flex-1 overflow-y-auto pb-20 lg:pb-0'
          }
        >
          {isEditor ? (
            children
          ) : (
            <div className="mx-auto w-full max-w-[1440px] p-5 sm:p-7 lg:p-8">{children}</div>
          )}
        </main>
      </div>

      <MobileNav />
    </div>
  );
}
