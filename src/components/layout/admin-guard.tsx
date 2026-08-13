'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { canManageUsers } from '@/lib/auth/types';
import { Card } from '@/components/ui/card';

/**
 * Guards admin-only routes. Viewers/editors are redirected home.
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { role, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && role && !canManageUsers(role)) {
      router.replace('/studio');
    }
  }, [role, loading, router]);

  if (loading || !canManageUsers(role)) {
    return (
      <Card className="flex flex-col items-center gap-3 py-20 text-center">
        <ShieldAlert className="h-10 w-10 text-danger" />
        <p className="text-sm text-danger">Admin access required</p>
        <p className="text-xs text-muted">Redirecting…</p>
      </Card>
    );
  }

  return <>{children}</>;
}
