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
import type { User } from '@supabase/supabase-js';
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string, email: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (data) {
      setProfile({
        id: data.id,
        email: data.email || email,
        full_name: data.full_name,
        role: (data.role as Role) || 'viewer',
        status: (data.status as UserStatus) || 'active',
        max_projects: data.max_projects != null ? Number(data.max_projects) : null,
        max_documents: data.max_documents != null ? Number(data.max_documents) : null,
        max_exports: data.max_exports != null ? Number(data.max_exports) : null,
        created_at: data.created_at,
      });
      return;
    }

    // No profile row yet — attempt to create one (RLS permitting).
    if (error) {
      // Table missing or no permission: default to viewer.
      setProfile({ id: userId, email, role: 'viewer', status: 'active' });
      return;
    }

    const bootstrapRole: Role = isAdminUserId(userId) ? 'admin' : 'viewer';

    const { data: inserted, error: insertError } = await supabase
      .from('profiles')
      .insert({ id: userId, email, role: bootstrapRole, status: 'active' })
      .select()
      .maybeSingle();

    if (insertError || !inserted) {
      setProfile({ id: userId, email, role: bootstrapRole, status: 'active' });
      return;
    }
    setProfile({
      id: inserted.id,
      email: inserted.email || email,
      full_name: inserted.full_name,
      role: (inserted.role as Role) || 'viewer',
      status: (inserted.status as UserStatus) || 'active',
      max_projects: inserted.max_projects != null ? Number(inserted.max_projects) : null,
      max_documents: inserted.max_documents != null ? Number(inserted.max_documents) : null,
      max_exports: inserted.max_exports != null ? Number(inserted.max_exports) : null,
      created_at: inserted.created_at,
    });
  }, []);

  const refreshProfile = useCallback(async () => {
    const {
      data: { user: current },
    } = await supabase.auth.getUser();
    if (current) {
      setUser(current);
      await loadProfile(current.id, current.email || '');
    }
  }, [loadProfile]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        void loadProfile(session.user.id, session.user.email || '');
      }
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        void loadProfile(session.user.id, session.user.email || '');
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

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
