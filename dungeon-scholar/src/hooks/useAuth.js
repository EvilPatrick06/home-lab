import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabase.js';
import { logWarn } from '../services/logger.js';

function projectUser(rawUser) {
  if (!rawUser) return null;
  const meta = rawUser.user_metadata || {};
  return {
    id: rawUser.id,
    githubLogin: meta.user_name || meta.preferred_username || null,
    avatarUrl: meta.avatar_url || null,
  };
}

// PHASE-02 (F1): the client is created with autoRefreshToken: false (supabase.js)
// so a signed-out load never kicks off GoTrue's init-time refresh retry loop
// (the repeated "TypeError: Failed to fetch" console noise). We drive the
// refresh ticker explicitly here — start it only while a real session exists,
// stop it on sign-out / no session. Guarded so a mock client without these
// methods (or an unconfigured client) is a no-op.
function startRefresh() {
  try { supabase?.auth?.startAutoRefresh?.(); } catch { /* best effort */ }
}
function stopRefresh() {
  try { supabase?.auth?.stopAutoRefresh?.(); } catch { /* best effort */ }
}

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(isSupabaseConfigured());

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    let active = true;

    supabase.auth.getSession()
      .then(({ data }) => {
        if (!active) return;
        const session = data?.session ?? null;
        setUser(projectUser(session?.user));
        setLoading(false);
        // Only spin up the refresh ticker when a live session is present.
        if (session) startRefresh();
        else stopRefresh();
      })
      .catch((err) => {
        // A network-level failure on init (e.g. a stale persisted session GoTrue
        // tries to refresh while the endpoint is unreachable) must not surface as
        // recurring console errors — log it once at warn level, stay signed-out.
        if (!active) return;
        logWarn('auth getSession failed', err?.message || String(err));
        setUser(null);
        setLoading(false);
        stopRefresh();
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(projectUser(session?.user));
      if (session) startRefresh();
      else stopRefresh();
    });

    return () => {
      active = false;
      stopRefresh();
      subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}
