'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, LogOut, Menu, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { useToast } from '@/lib/toast/toast-provider';
import { ThemeSwitcher } from '@/components/layout/theme-switcher';
import { ROLE_LABEL } from '@/lib/auth/types';
import { Badge } from '@/components/ui/badge';

const TITLES: Record<string, string> = {
  '/studio': 'Dashboard',
  '/studio/editor/tm': 'TM Certificate Editor',
  '/studio/editor/nid': 'NID Card Editor',
  '/studio/templates': 'Templates',
  '/studio/projects': 'Projects',
  '/studio/history': 'Download History',
  '/studio/assets': 'Assets',
  '/studio/users': 'User Management',
  '/studio/activity': 'Activity Logs',
  '/studio/settings': 'Settings',
};

const SUBS: Record<string, string> = {
  '/studio': 'Workspace overview',
  '/studio/editor/tm': 'Trademark certificate canvas',
  '/studio/editor/nid': 'National ID card canvas',
};

export function Topbar({ onMenu }: { onMenu?: () => void }) {
  const { user, role, signOut } = useAuth();
  const toast = useToast();
  const pathname = usePathname();
  const router = useRouter();
  const [clock, setClock] = useState('--');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tick = () => {
      try {
        setClock(new Date().toLocaleString('en-BD', { timeZone: 'Asia/Dhaka' }) + ' BDT');
      } catch {
        setClock(new Date().toLocaleString());
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut();
    toast.info('Signed out');
    router.push('/login');
  };

  const title = TITLES[pathname] ?? 'Document Studio';
  const sub = SUBS[pathname];
  const initials = (user?.email ?? '?').slice(0, 2).toUpperCase();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface/80 px-4 backdrop-blur-xl sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {onMenu && (
          <button
            onClick={onMenu}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line text-muted transition hover:bg-surface-raised hover:text-primary lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-4 w-4" />
          </button>
        )}
        <div className="min-w-0">
          <div className="truncate text-[15px] font-bold tracking-tight text-primary">{title}</div>
          {sub ? (
            <div className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-dimm">
              {sub}
            </div>
          ) : (
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-dimm">Document Studio</div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2.5 sm:gap-3">
        <div className="hidden font-mono text-[11px] text-dimm xl:block">{clock}</div>
        <ThemeSwitcher compact />

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-raised py-1.5 pl-1.5 pr-2.5 transition hover:border-line-strong"
            aria-label="Account menu"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-deep text-xs font-bold text-canvas">
              {initials}
            </span>
            <span className="hidden max-w-[130px] text-left sm:block">
              <span className="block truncate text-[12px] font-semibold leading-tight text-primary">
                {user?.email ?? '—'}
              </span>
              <span className="block text-[10px] leading-tight text-accent-bright">
                {role ? ROLE_LABEL[role] : 'Guest'}
              </span>
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 text-dimm transition-transform ${menuOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-pop animate-scale-in">
              <div className="border-b border-line bg-surface-raised/60 px-4 py-3.5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-accent-bright" />
                  <Badge tone="gold">{role ? ROLE_LABEL[role] : 'Guest'}</Badge>
                </div>
                <div className="mt-1.5 truncate font-mono text-[11px] text-muted">{user?.email ?? '—'}</div>
              </div>
              <div className="p-1.5">
                <div className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-muted">
                  <UserRound className="h-4 w-4 text-dimm" />
                  Signed in via Supabase Auth
                </div>
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-danger transition hover:bg-danger/10"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
