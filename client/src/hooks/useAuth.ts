import { useState, useEffect } from 'react';
import { supabase, isCloudMode } from '../supabase';
import type { User, Session } from '@supabase/supabase-js';

interface Workspace {
  id: string;
  name: string;
  gateway_url: string | null;
  gateway_token: string | null;
}

interface AuthState {
  loading: boolean;
  user: User | null;
  session: Session | null;
  workspace: Workspace | null;
  isCloudMode: boolean;
}

export function useAuth(): AuthState & {
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  updateWorkspace: (data: Partial<Workspace>) => Promise<string | null>;
} {
  const [loading, setLoading] = useState(isCloudMode);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchWorkspace(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchWorkspace(session.user.id);
      else {
        setWorkspace(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchWorkspace(userId: string) {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('workspaces')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (!error && data) setWorkspace(data);
    setLoading(false);
  }

  async function signIn(email: string, password: string): Promise<string | null> {
    if (!supabase) return 'Cloud mode not enabled';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  }

  async function signUp(email: string, password: string): Promise<string | null> {
    if (!supabase) return 'Cloud mode not enabled';
    const { error } = await supabase.auth.signUp({ email, password });
    return error?.message ?? null;
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setWorkspace(null);
  }

  async function updateWorkspace(data: Partial<Workspace>): Promise<string | null> {
    if (!supabase || !workspace) return 'No workspace';
    const { error } = await supabase
      .from('workspaces')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', workspace.id);
    if (error) return error.message;
    setWorkspace({ ...workspace, ...data });
    return null;
  }

  return {
    loading,
    user,
    session,
    workspace,
    isCloudMode,
    signIn,
    signUp,
    signOut,
    updateWorkspace,
  };
}
