'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { canManageUsers } from '@/lib/auth/types';
import { hasToolAccess, type ToolScope } from '@/lib/workspace/access';
import { StudioShell } from '@/components/layout/studio-shell';
import { Button } from '@/components/ui/button';

const ADMIN_ROUTES = ['/studio/users', '/studio/activity'];

/** Route prefix -> tool scope. Users without the scope are redirected. */
const TOOL_ROUTES: { prefix: string; scope: ToolScope }[] = [
  { prefix: '/studio/editor/tm', scope: 'tm' },
  { prefix: '/studio/editor/nid', scope: 'nid' },
  { prefix: '/studio/editor/tin', scope: 'tin' },
  { prefix: '/studio/editor/page-recover', scope: 'tm' },
  { prefix: '/studio/editor/youtube-trademark', scope: 'tm' },
  { prefix: '/studio/editor/business-manager', scope: 'tm' },
  { prefix: '/studio/templates', scope: 'templates' },
  { prefix: '/studio/projects', scope: 'projects' },
  { prefix: '/studio/history', scope: 'history' },
  { prefix: '/studio/assets', scope: 'assets' },
  { prefix: '/studio/settings', scope: 'settings' },
];

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, role, loading, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  const isAdminRoute = ADMIN_ROUTES.some((prefix) => pathname.startsWith(prefix));
  const blockedTool = TOOL_ROUTES.find(({ prefix, scope }) => pathname.startsWith(prefix) && !hasToolAccess(profile, scope));

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace('/login');
      else if (profile) setChecked(true);
    }
  }, [user, loading, router, profile]);

  useEffect(() => {
    if (checked && isAdminRoute && !canManageUsers(role)) {
      router.replace('/studio');
    }
  }, [checked, isAdminRoute, role, router]);

  useEffect(() => {
    if (checked && blockedTool) {
      router.replace('/studio');
    }
  }, [checked, blockedTool, router]);

  if (loading || !checked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Loader2 className="h-7 w-7 animate-spin text-accent" />
      </div>
    );
  }

  if (profile?.status === 'disabled') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-canvas px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-danger/30 bg-danger/10 text-danger">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-primary">Account suspended</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
            This account has been suspended by an administrator. You cannot access Document
            Studio until it is reactivated. Your existing documents and projects remain safe.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={async () => {
            await signOut();
            router.replace('/login');
          }}
        >
          Back to sign in
        </Button>
      </div>
    );
  }

  if (isAdminRoute && !canManageUsers(role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Loader2 className="h-7 w-7 animate-spin text-accent" />
      </div>
    );
  }

  return <StudioShell>{children}</StudioShell>;
}
