import { useEffect } from 'react';
import { logError } from '../services/logger.js';
import { consumeOAuthCallback, warnIfBaseMismatch } from '../services/supabase.js';

// Consume an OAuth ?code=... redirect on mount (no-op if absent) and emit the
// one-time BASE_URL mismatch warning. Extracted from the App.jsx God-component;
// side-effect only, returns nothing.
export function useOAuthCallback() {
  useEffect(() => {
    warnIfBaseMismatch(); // 18D / L13: one startup warning if BASE_URL can't match the served path
    consumeOAuthCallback().catch((err) => {
      logError('OAuth callback exchange failed', err);
    });
  }, []);
}
