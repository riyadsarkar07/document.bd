'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CreditCard,
  FileText,
  FolderKanban,
  Landmark,
  LayoutDashboard,
  Lock,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-context';
import { hasToolAccess, type ToolScope } from '@/lib/workspace/access';
import { useAccessGate } from '@/components/layout/access-gate';

const ITEMS: { href: string; label: string; icon: LucideIcon; scope?: ToolScope }[] = [
  { href: '/studio', label: 'Home', icon: LayoutDashboard, scope: 'dashboard' },
  { href: '/studio/editor/tm', label: 'TM', icon: FileText, scope: 'tm' },
  { href: '/studio/editor/nid', label: 'NID', icon: CreditCard, scope: 'nid' },
  { href: '/studio/editor/tin', label: 'TIN', icon: Landmark, scope: 'tin' },
  { href: '/studio/projects', label: 'Projects', icon: FolderKanban, scope: 'projects' },
];

export function MobileNav() {
  const pathname = usePathname();
  const { profile } = useAuth();
  const { denyAccess } = useAccessGate();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-[80] border-t border-line bg-surface/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      <div className="grid grid-cols-5">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const locked = Boolean(item.scope && !hasToolAccess(profile, item.scope));
          const active =
            !locked &&
            (item.href === '/studio' ? pathname === '/studio' : pathname.startsWith(item.href));
          const className = cn(
            'flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition-colors',
            'w-full',
            locked ? 'cursor-not-allowed text-dimm/70' : active ? 'text-accent-bright' : 'text-dimm hover:text-muted',
          );
          const inner = (
            <>
              <span
                className={cn(
                  'relative flex h-7 w-12 items-center justify-center rounded-full transition-all',
                  active && 'bg-accent/12',
                )}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.2 : 1.8} />
                {locked && (
                  <Lock className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 text-dimm" aria-hidden />
                )}
              </span>
              {item.label}
            </>
          );

          if (locked) {
            return (
              <button
                key={item.href}
                type="button"
                onClick={denyAccess}
                className={className}
                aria-disabled="true"
                aria-label={`${item.label}, Admin permission required`}
              >
                {inner}
              </button>
            );
          }

          return (
            <Link key={item.href} href={item.href} className={className}>
              {inner}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
