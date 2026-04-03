import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from './supabase';
import type { User, Session } from '@supabase/supabase-js';

export interface AppUser {
  id: string;
  auth_id: string | null;
  email: string;
  full_name: string | null;
  role: 'user' | 'admin';
  wallet_address?: string | null;
}

export interface OutletContext {
  user: AppUser | null;
}

interface AuthContextType {
  user: AppUser | null;
  session: Session | null;
  isLoading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  updateProfile: (data: { full_name?: string }) => Promise<{ error: Error | null }>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Hard timeout for any single Supabase DB call (ms).
// If the network or Supabase is down, we return a minimal user object
// instead of hanging forever and blocking navigation.
const DB_TIMEOUT_MS = 5_000;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Deduplicate: track the last auth_id we loaded a profile for.
  // onAuthStateChange can fire multiple times for the same session
  // (INITIAL_SESSION then TOKEN_REFRESHED, etc.). We skip the DB hit
  // when the user object is already set for the same auth_id.
  const lastLoadedAuthId = useRef<string | null>(null);

  /**
   * Single-query profile loader.
   *
   * One round trip: SELECT … WHERE auth_id = $1 OR email = $2 LIMIT 1
   * This replaces the old serial auth_id → email → insert pattern which
   * added ~250–500ms of extra latency on every sign-in for users whose
   * row didn't have auth_id backfilled yet.
   *
   * Returns a minimal synthetic AppUser on any error so navigation
   * always proceeds — the dashboard gracefully handles missing data.
   */
  const fetchAppUser = useCallback(async (authUser: User): Promise<AppUser> => {
    const minimal: AppUser = {
      id: authUser.id,
      auth_id: authUser.id,
      email: authUser.email!,
      full_name: authUser.user_metadata?.full_name ?? null,
      role: 'user',
    };

    try {
      // Primary lookup: by auth_id (indexed, unique, always up-to-date after SQL role changes).
      // Fallback: by email for legacy rows created before the auth_id trigger was installed.
      // Two separate queries prevents the OR-with-LIMIT returning the wrong row when both
      // an auth_id row and a legacy email-only row exist for the same person.
      type ProfileRow = Record<string, unknown>;

      const primaryPromise: Promise<ProfileRow | null> = Promise.resolve(
        supabase.from('users').select('*').eq('auth_id', authUser.id).maybeSingle()
      ).then(({ data }) => data as ProfileRow | null);

      let row = await withTimeout<ProfileRow | null>(primaryPromise, DB_TIMEOUT_MS, null);

      if (!row) {
        // Legacy fallback — email match only
        const fallbackPromise: Promise<ProfileRow | null> = Promise.resolve(
          supabase.from('users').select('*').eq('email', authUser.email!).maybeSingle()
        ).then(({ data }) => data as ProfileRow | null);
        row = await withTimeout<ProfileRow | null>(fallbackPromise, DB_TIMEOUT_MS, null);
      }

      if (row) {
        // Backfill auth_id if it's missing (fire-and-forget, never blocks login)
        if (!row['auth_id']) {
          supabase
            .from('users')
            .update({ auth_id: authUser.id })
            .eq('id', row['id'])
            .then(() => {});
        }
        return { ...row, auth_id: row['auth_id'] ?? authUser.id } as unknown as AppUser;
      }

      // Row not found — DB trigger wasn't installed or hasn't fired yet.
      // Insert the profile (fire-and-forget upsert so we don't block navigation).
      supabase.from('users').upsert(
        {
          auth_id: authUser.id,
          email: authUser.email!,
          full_name: authUser.user_metadata?.full_name ?? null,
          role: 'user',
        },
        { onConflict: 'auth_id' }
      ).then(() => {
        // Also ensure a balance row exists
        supabase.from('user_balances').upsert(
          { user_email: authUser.email!, balance_usd: 0, total_invested: 0, total_profit_loss: 0 },
          { onConflict: 'user_email' }
        ).then(() => {});
      });

      // Return minimal user immediately — dashboard will work, balance will show $0
      console.warn('[Salarn] Profile row missing — using minimal user. Run SUPABASE-SCHEMA.sql to install trigger.');
      return minimal;

    } catch (err) {
      // Network error or timeout — return minimal user, never block
      console.error('[Salarn] fetchAppUser error:', err);
      return minimal;
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const { data: { session: current } } = await supabase.auth.getSession();
    if (current?.user) {
      lastLoadedAuthId.current = null; // force reload
      const appUser = await fetchAppUser(current.user);
      setUser(appUser);
    }
  }, [fetchAppUser]);

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      setSession(session);

      if (!session?.user) {
        lastLoadedAuthId.current = null;
        setUser(null);
        if (mounted) setIsLoading(false);
        return;
      }

      // Skip redundant DB calls only for TOKEN_REFRESHED — not for SIGNED_IN
      // or INITIAL_SESSION after a sign-out. This ensures role changes made
      // in the DB (e.g. setting a user to admin) take effect on the next sign-in.
      const isTokenRefresh = event === 'TOKEN_REFRESHED';
      if (isTokenRefresh && lastLoadedAuthId.current === session.user.id && user !== null) {
        if (mounted) setIsLoading(false);
        return;
      }

      lastLoadedAuthId.current = session.user.id;
      const appUser = await fetchAppUser(session.user);

      if (mounted) {
        setUser(appUser);
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchAppUser]);

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: { full_name: fullName },
        },
      });
      if (error) return { error: error as Error };
      // Supabase returns identities:[] when email is already registered
      if (data?.user && !data.user.identities?.length) {
        return { error: new Error('An account with this email already exists. Please sign in.') };
      }
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error as Error | null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback`,
      });
      return { error: error as Error | null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const signOut = async () => {
    lastLoadedAuthId.current = null;
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    setUser(null);
    setSession(null);
  };

  const updateProfile = async (data: { full_name?: string }) => {
    if (!user) return { error: new Error('Not authenticated') };
    try {
      const { error } = await supabase
        .from('users')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (!error) setUser(prev => prev ? { ...prev, ...data } : null);
      return { error: error as Error | null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, signUp, signIn, signOut, resetPassword, updateProfile, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
