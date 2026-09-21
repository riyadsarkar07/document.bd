'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { Profile, Role, UserStatus } from '@/lib/auth/types';
import { isAdminUserId } from '@/lib/auth/admin';

interface AuthState {
  user: User | null;
  profile: Profile | null;
  role: Role | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  profile: null,
  role: null,
  loading: true,
  signIn: async () => ({ error: null }),
  signOut: async () => {},
  refreshProfile: async () => {},
});

function fallbackProfile(userId: string, email: string, role: Role = 'viewer'): Profile {
  return { id: userId, email, role, status: 'active' };
}

function mapProfileRow(data: Record<string, unknown>, email: string): Profile {
  return {
    id: String(data.id),
    email: (typeof data.email === 'string' && data.email) || email,
    full_name: typeof data.full_name === 'string' ? data.full_name : null,
    role: (data.role as Role) || 'viewer',
    status: (data.status as UserStatus) || 'active',
    max_projects: data.max_projects != null ? Number(data.max_projects) : null,
    max_documents: data.max_documents != null ? Number(data.max_documents) : null,
    max_exports: data.max_exports != null ? Number(data.max_exports) : null,
    allowed_tools: Array.isArray(data.allowed_tools) ? (data.allowed_tools as string[]) : null,
    gen_period: typeof data.gen_period === 'string' ? data.gen_period : null,
    gen_limit: data.gen_limit != null ? Number(data.gen_limit) : null,
    can_self_publish: Boolean(data.can_self_publish),
    created_at: typeof data.created_at === 'string' ? data.created_at : undefined,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string, email: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (data) {
        setProfile(mapProfileRow(data as Record<string, unknown>, email));
        return;
      }

      if (error) {
        setProfile(fallbackProfile(userId, email));
        return;
      }

      const bootstrapRole: Role = isAdminUserId(userId) ? 'admin' : 'viewer';

      const { data: inserted, error: insertError } = await supabase
        .from('profiles')
        .insert({ id: userId, email, role: bootstrapRole, status: 'active' })
        .select()
        .maybeSingle();

      if (insertError || !inserted) {
        setProfile(fallbackProfile(userId, email, bootstrapRole));
        return;
      }
      setProfile(mapProfileRow(inserted as Record<string, unknown>, email));
    } catch {
      setProfile(fallbackProfile(userId, email));
    }
  }, []);

  const applySession = useCallback(
    (session: Session | null) => {
      if (session?.user) {
        setUser(session.user);
        void loadProfile(session.user.id, session.user.email || '').finally(() => setLoading(false));
        return;
      }
      setUser(null);
      setProfile(null);
      setLoading(false);
    },
    [loadProfile],
  );

  const refreshProfile = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) {
      setUser(session.user);
      await loadProfile(session.user.id, session.user.email || '');
    }
  }, [loadProfile]);

  useEffect(() => {
    let cancelled = false;

    const apply = (session: Session | null) => {
      if (cancelled) return;
      applySession(session);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => apply(session), 0);
    });

    void supabase.auth
      .getSession()
      .then(({ data: { session } }) => apply(session))
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [applySession]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      if (data.user) {
        setUser(data.user);
        await loadProfile(data.user.id, data.user.email || '');
      }
      return { error: null };
    },
    [loadProfile],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      profile,
      role: profile?.role ?? null,
      loading,
      signIn,
      signOut,
      refreshProfile,
    }),
    [user, profile, loading, signIn, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
