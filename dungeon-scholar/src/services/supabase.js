import { createClient } from '@supabase/supabase-js';
import { logWarn } from './logger.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// In dev/CI without env vars, we still want the bundle to build/import
// without throwing — the SDK calls just fail at runtime when the user
// tries to sign in, which is the right blast radius.
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          flowType: 'pkce',
          autoRefreshToken: false, // PHASE-02 (F1): refresh driven explicitly in useAuth (only with a live session) so a signed-out load never starts GoTrue's token-refresh retry loop.
          persistSession: true,
          detectSessionInUrl: false, // we handle exchange manually in App.jsx
        },
      })
    : null;

export function isSupabaseConfigured() {
  return supabase !== null;
}

// PHASE-13 F2: one-shot reachability probe run BEFORE the first refreshSession()
// so GoTrue never spins its internal, console-logging retry burst against a host
// we already know is down (the 08E breaker stays as the backstop for the
// reachable-but-failing case). Single request, fast timeout, fully caught — a
// failure is a boolean, never a console.error. `no-cors`: we only need
// reach/no-reach, not the body/status; an opaque resolve === reachable, a throw
// (network/abort) === unreachable.
export async function probeSupabaseReachable(timeoutMs = 3000) {
  if (!url) return false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    await fetch(`${url}/auth/v1/health`, { method: 'HEAD', mode: 'no-cors', signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export async function signInWithGitHub() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: window.location.origin + import.meta.env.BASE_URL,
    },
  });
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

/**
 * Returns a human-readable mismatch description, or null when the base looks
 * right (L13 / 18D). On *.github.io, Pages serves project sites under /<repo>/,
 * so the first path segment must equal the Vite base; elsewhere the served path
 * must start with the base. A mismatch breaks the OAuth redirectTo
 * (window.location.origin + BASE_URL) with an opaque Supabase error.
 */
export function detectBaseMismatch({ hostname, pathname, baseUrl }) {
  if (!baseUrl || baseUrl === '/') return null; // dev server / root deploys
  const normBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  if (hostname.endsWith('.github.io')) {
    const firstSegment = `/${pathname.split('/')[1] || ''}/`;
    if (firstSegment !== normBase) {
      return `app is served from "${firstSegment}" but built with base "${normBase}"`;
    }
    return null;
  }
  if (!pathname.startsWith(normBase) && `${pathname}/` !== normBase) {
    return `app is served from "${pathname}" which is outside the built base "${normBase}"`;
  }
  return null;
}

export function warnIfBaseMismatch() {
  const mismatch = detectBaseMismatch({
    hostname: window.location.hostname,
    pathname: window.location.pathname,
    baseUrl: import.meta.env.BASE_URL,
  });
  if (mismatch) {
    logWarn(
      'Base path mismatch',
      `${mismatch}. GitHub OAuth sign-in will fail (redirectTo = origin + base). ` +
        'Fix: set VITE_BASE (dungeon-scholar-deploy.yml / .env.local) or vite.config.js base to "/<repo-name>/", ' +
        'and list the same URL in Supabase → Authentication → URL Configuration.',
    );
  }
}

/**
 * Inspect the current URL for an OAuth ?code=...&state=... pair.
 * If found, exchange it for a session and strip the params.
 * Returns true if a callback was consumed.
 */
export async function consumeOAuthCallback() {
  if (!supabase) return false;
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  if (!code) return false;
  // Supabase SDK expects the bare auth code (PKCE flow), NOT the full
  // ?code=...&state=... query string.
  await supabase.auth.exchangeCodeForSession(code);
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  window.history.replaceState({}, '', url.toString());
  return true;
}
