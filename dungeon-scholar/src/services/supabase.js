import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// In dev/CI without env vars, we still want the bundle to build/import
// without throwing — the SDK calls just fail at runtime when the user
// tries to sign in, which is the right blast radius.
export const supabase = (url && key)
  ? createClient(url, key, {
      auth: {
        flowType: 'pkce',
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false, // we handle exchange manually in App.jsx
      },
    })
  : null;

export function isSupabaseConfigured() {
  return supabase !== null;
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
