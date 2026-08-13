'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  CreditCard,
  FileText,
  FolderKanban,
  History,
  LayoutDashboard,
  Package,
  Settings,
  Shapes,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-context';
import { canManageUsers, ROLE_LABEL } from '@/lib/auth/types';
import { Brand } from '@/components/layout/brand';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  admin?: boolean;
  section?: string;
}

const NAV: NavItem[] = [
  { href: '/studio', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/studio/editor/tm', label: 'TM Certificate', icon: FileText, section: 'Studio' },
  { href: '/studio/editor/nid', label: 'NID Card', icon: CreditCard },
  { href: '/studio/templates', label: 'Templates', icon: Shapes },
  { href: '/studio/projects', label: 'Projects', icon: FolderKanban },
  { href: '/studio/history', label: 'History', icon: History },
  { href: '/studio/assets', label: 'Assets', icon: Package, section: 'Workspace' },
  { href: '/studio/settings', label: 'Settings', icon: Settings },
  { href: '/studio/users', label: 'Users', icon: Users, admin: true },
  { href: '/studio/activity', label: 'Activity Logs', icon: Activity, admin: true },
];

function groupBy<T>(items: T[], key: (item: T) => string | undefined) {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item) ?? 'Overview';
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {});
}

export function Sidebar() {
  const pathname = usePathname();
  const { role } = useAuth();
  const groups = groupBy(NAV, (n) => n.section);

  return (
    <aside className="flex h-full w-[248px] shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex h-16 items-center border-b border-line px-5">
        <Brand />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5">
        {Object.entries(groups).map(([section, items]) => {
          const visible = items.filter((item) => !item.admin || canManageUsers(role));
          if (!visible.length) return null;
          return (
            <div key={section} className="mb-6">
              <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-dimm">
                {section}
              </div>
              <div className="flex flex-col gap-1">
                {visible.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    pathname === item.href ||
                    (item.href !== '/studio' && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-150',
                        isActive
                          ? 'bg-accent/10 text-accent-bright'
                          : 'text-muted hover:bg-surface-raised hover:text-primary',
                      )}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent shadow-glow" />
                      )}
                      <Icon
                        className={cn(
                          'h-[18px] w-[18px] shrink-0 transition-colors',
                          isActive ? 'text-accent-bright' : 'text-dimm group-hover:text-muted',
                        )}
                        strokeWidth={isActive ? 2.2 : 1.8}
                      />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.admin && (
                        <ShieldCheck
                          className={cn('h-3.5 w-3.5', isActive ? 'text-accent-bright' : 'text-dimm')}
                        />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-line px-4 py-4">
        <div className="flex items-center justify-between rounded-xl border border-line bg-surface-raised px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/15 text-accent-bright">
              <ShieldCheck className="h-3.5 w-3.5" />
            </span>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-primary">
                {role ? ROLE_LABEL[role] : 'Guest'}
              </div>
              <div className="font-mono text-[9.5px] text-dimm">Protected session</div>
            </div>
          </div>
          <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_6px_rgb(var(--success))]" />
        </div>
      </div>
    </aside>
  );
}
