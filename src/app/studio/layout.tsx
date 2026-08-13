'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { StudioShell } from '@/components/layout/studio-shell';

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace('/login');
      else setChecked(true);
    }
  }, [user, loading, router]);

  if (loading || !checked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Loader2 className="h-7 w-7 animate-spin text-accent" />
      </div>
    );
  }

  return <StudioShell>{children}</StudioShell>;
}
