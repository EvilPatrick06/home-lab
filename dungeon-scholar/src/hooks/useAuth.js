import { useEffect, useState } from 'react';
import { logWarn } from '../services/logger.js';
import { isSupabaseConfigured, supabase } from '../services/supabase.js';

function projectUser(rawUser) {
  if (!rawUser) return null;
  const meta = rawUser.user_metadata || {};
  return {
    id: rawUser.id,
    githubLogin: meta.user_name || meta.preferred_username || null,
    avatarUrl: meta.avatar_url || null,
  };
}

// PHASE-08 08E: how many consecutive refresh failures we tolerate before deciding
// the host is unreachable and tripping the breaker. A single transient blip at
// load retries and recovers; a genuinely down host trips after the ceiling.
const MAX_REFRESH_FAILURES = 3;
const REFRESH_RETRY_MS = 300;

// PHASE-02 (F1): the client is created with autoRefreshToken: false (supabase.js)
// so a signed-out load never kicks off GoTrue's init-time refresh retry loop
// (the repeated "TypeError: Failed to fetch" console noise). We drive the
// refresh ticker explicitly here — start it only while a real session exists,
// stop it on sign-out / no session. Guarded so a mock client without these
// methods (or an unconfigured client) is a no-op.
function startRefresh() {
  try {
    supabase?.auth?.startAutoRefresh?.();
  } catch {
    /* best effort */
  }
}
function stopRefresh() {
  try {
    supabase?.auth?.stopAutoRefresh?.();
  } catch {
    /* best effort */
  }
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
    // PHASE-08 08E: once the breaker trips we must not let getSession()/the
    // onAuthStateChange echo re-arm the ticker against the unreachable host.
    let quarantined = false;

    // PHASE-08 08E: drop the unusable token and stop hammering. PHASE-02 stopped
    // the *signed-out* loop; the remaining hole was a stale-but-present persisted
    // session: getSession() resolves it, startRefresh() re-arms GoTrue's ticker,
    // and it retries the expired token against an unreachable host forever (the
    // 90+/90s "Failed to fetch" storm). Here we quarantine: local sign-out clears
    // the token, the ticker is stopped, the UI drops to signed-out/local, and we
    // log ONE warning instead of a per-attempt console.error stream.
    const quarantine = () => {
      if (!active) return;
      quarantined = true;
      stopRefresh();
      try {
        supabase?.auth?.signOut?.({ scope: 'local' });
      } catch {
        /* best effort */
      }
      setUser(null);
      logWarn(
        'auth token refresh unreachable',
        'Supabase token refresh failed repeatedly (host unreachable). Signed out locally and stopped retrying to avoid a refresh loop; running on local storage.',
      );
    };

    // Validate a *present* session before re-arming the ticker. A real client
    // exposes refreshSession(); a mock/unconfigured client without it keeps
    // PHASE-02's behaviour (just arm the ticker). On a healthy refresh we resume
    // the normal auto-refresh ticker; on persistent network failure we quarantine.
    const armRefresh = async () => {
      if (typeof supabase?.auth?.refreshSession !== 'function') {
        startRefresh();
        return;
      }
      for (let attempt = 1; attempt <= MAX_REFRESH_FAILURES; attempt++) {
        let networkFailure = false;
        try {
          const { error } = (await supabase.auth.refreshSession()) || {};
          if (!active || quarantined) return;
          if (!error) {
            startRefresh();
            return;
          }
          networkFailure = true;
        } catch {
          if (!active || quarantined) return;
          networkFailure = true;
        }
        if (!networkFailure) return;
        if (attempt < MAX_REFRESH_FAILURES) {
          await new Promise((r) => setTimeout(r, REFRESH_RETRY_MS));
          if (!active || quarantined) return;
        }
      }
      quarantine();
    };

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        const session = data?.session ?? null;
        setUser(projectUser(session?.user));
        setLoading(false);
        // Only validate + arm the refresh ticker when a session is present.
        if (session) armRefresh();
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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      // PHASE-08 08E: after quarantine, ignore re-arm echoes — keep the ticker off.
      if (quarantined) {
        stopRefresh();
        return;
      }
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
