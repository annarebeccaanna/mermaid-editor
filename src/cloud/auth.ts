// Sign-in state for the cloud features. Login works with a link sent by e-mail (no passwords);
// accounts exist only for invited people (sign-ups are switched off in Supabase).
import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './client';
import { loginLinkResult, type LoginLinkResult } from './errors';

interface AuthState {
  session: Session | null;
  /** false until the stored session (or the one from an invite link) has been read */
  ready: boolean;
  /** Sends a login link to an invited address. */
  sendLoginLink: (email: string) => Promise<LoginLinkResult>;
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthState>(() => ({
  session: null,
  ready: !supabase,
  sendLoginLink: async (email) => {
    if (!supabase) return { error: 'Die Cloud ist nicht eingerichtet.' };
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/` },
    });
    return loginLinkResult(error);
  },
  signOut: async () => {
    await supabase?.auth.signOut();
  },
}));

if (supabase) {
  // The callback must not await further Supabase calls (they would wait for it); we only store the session.
  supabase.auth.onAuthStateChange((_event, session) => useAuth.setState({ session, ready: true }));
  supabase.auth.getSession().then(({ data }) => useAuth.setState({ session: data.session, ready: true }));
}
