import { describe, it, expect, vi, beforeEach } from 'vitest';

const exchangeCodeForSession = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      exchangeCodeForSession: (...a) => exchangeCodeForSession(...a),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: async () => ({ data: { session: null } }),
    },
  }),
}));

vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-key');

const { consumeOAuthCallback } = await import('./supabase.js');

describe('consumeOAuthCallback', () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    exchangeCodeForSession.mockResolvedValue({ data: { session: {} }, error: null });
  });

  it('returns false when no code param is present', async () => {
    window.history.replaceState({}, '', '/home-lab/');
    const result = await consumeOAuthCallback();
    expect(result).toBe(false);
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('exchanges and strips ?code & ?state when present', async () => {
    window.history.replaceState({}, '', '/home-lab/?code=abc&state=xyz&keep=this');
    const result = await consumeOAuthCallback();
    expect(result).toBe(true);
    expect(exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(window.location.search).not.toContain('code=');
    expect(window.location.search).not.toContain('state=');
    expect(window.location.search).toContain('keep=this'); // unrelated params untouched
  });
});
