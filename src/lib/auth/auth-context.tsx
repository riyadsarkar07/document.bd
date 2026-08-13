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
import type { Profile, Role } from '@/lib/auth/types';

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
      });
      return;
    }

    // No profile row yet — attempt to create one (RLS permitting).
    if (error) {
      // Table missing or no permission: default to viewer.
      setProfile({ id: userId, email, role: 'viewer' });
      return;
    }

    const { data: inserted, error: insertError } = await supabase
      .from('profiles')
      .insert({ id: userId, email, role: 'viewer' })
      .select()
      .maybeSingle();

    if (insertError || !inserted) {
      setProfile({ id: userId, email, role: 'viewer' });
      return;
    }
    setProfile({
      id: inserted.id,
      email: inserted.email || email,
      full_name: inserted.full_name,
      role: (inserted.role as Role) || 'viewer',
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
