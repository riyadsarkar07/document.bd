'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CreditCard,
  FileText,
  FolderKanban,
  Landmark,
  LayoutDashboard,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-context';
import { hasToolAccess, type ToolScope } from '@/lib/workspace/access';

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
  const items = ITEMS.filter((item) => !item.scope || hasToolAccess(profile, item.scope));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-[80] border-t border-line bg-surface/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      <div className="grid grid-cols-5">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === '/studio'
              ? pathname === '/studio'
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition-colors',
                active ? 'text-accent-bright' : 'text-dimm hover:text-muted',
              )}
            >
              <span
                className={cn(
                  'flex h-7 w-12 items-center justify-center rounded-full transition-all',
                  active && 'bg-accent/12',
                )}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.2 : 1.8} />
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
