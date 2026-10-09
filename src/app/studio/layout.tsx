'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { canManageUsers } from '@/lib/auth/types';
import { hasToolAccess, type ToolScope } from '@/lib/workspace/access';
import { isStudioEditorPath, resolveStudioEditorMount } from '@/lib/studioEditorMount';
import { StudioShell } from '@/components/layout/studio-shell';
import { Button } from '@/components/ui/button';

const ADMIN_ROUTES = ['/studio/users', '/studio/activity', '/studio/bug-hunter'];

/** Route prefix -> tool scope. Users without the scope are redirected. */
const TOOL_ROUTES: { prefix: string; scope: ToolScope }[] = [
  { prefix: '/studio/editor/tm', scope: 'tm' },
  { prefix: '/studio/editor/pdf', scope: 'pdf' },
  { prefix: '/studio/editor/nid', scope: 'nid' },
  { prefix: '/studio/editor/tin', scope: 'tin' },
  { prefix: '/studio/editor/driving-license', scope: 'driving-license' },
  { prefix: '/studio/editor/dubai-license', scope: 'driving-license' },
  { prefix: '/studio/editor/unhcr-s2', scope: 'unhcr' },
  { prefix: '/studio/editor/unhcr', scope: 'unhcr' },
  { prefix: '/studio/editor/page-recover', scope: 'page-recover' },
  { prefix: '/studio/editor/youtube-trademark', scope: 'youtube-trademark' },
  { prefix: '/studio/editor/business-manager', scope: 'business-manager' },
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

  const matchesPrefix = (path: string, prefix: string) =>
    path === prefix || path.startsWith(`${prefix}/`);

  const isAdminRoute = ADMIN_ROUTES.some((prefix) => matchesPrefix(pathname, prefix));
  const isEditor = isStudioEditorPath(pathname);
  const matchedTool = TOOL_ROUTES.find(({ prefix }) => matchesPrefix(pathname, prefix));
  const profileReady = Boolean(profile);
  const blockedTool =
    profileReady && matchedTool && !hasToolAccess(profile, matchedTool.scope) ? matchedTool : null;
  const editorMount = resolveStudioEditorMount({
    hasSession: Boolean(user),
    sessionLoading: loading,
    profileReady,
    hasToolAccess: matchedTool ? (profile ? hasToolAccess(profile, matchedTool.scope) : undefined) : undefined,
    disabled: profile?.status === 'disabled',
  });

  useEffect(() => {
    if (isEditor) {
      if (editorMount === 'login') {
        setChecked(false);
        router.replace('/login');
      } else if (editorMount === 'blocked') {
        router.replace('/studio');
      } else if (editorMount === 'mount') {
        setChecked(true);
      }
      return;
    }
    if (!loading) {
      if (!user) {
        setChecked(false);
        router.replace('/login');
      } else {
        setChecked(true);
      }
    }
  }, [user, loading, router, isEditor, editorMount]);

  useEffect(() => {
    if (checked && isAdminRoute && !canManageUsers(role)) {
      router.replace('/studio');
    }
  }, [checked, isAdminRoute, role, router]);

  useEffect(() => {
    if (isEditor) return;
    if (checked && blockedTool) {
      router.replace('/studio');
    }
  }, [checked, blockedTool, router, isEditor]);

  if (isEditor) {
    if (editorMount === 'disabled') {
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
    if (editorMount === 'wait-session' || editorMount === 'login' || editorMount === 'blocked') {
      return (
        <div className="flex min-h-screen items-center justify-center bg-canvas">
          <Loader2 className="h-7 w-7 animate-spin text-accent" />
        </div>
      );
    }
    return <StudioShell>{children}</StudioShell>;
  }

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

  if ((isAdminRoute && !canManageUsers(role)) || blockedTool) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Loader2 className="h-7 w-7 animate-spin text-accent" />
      </div>
    );
  }

  return <StudioShell>{children}</StudioShell>;
}
