import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const { consumeOAuthCallback, detectBaseMismatch } = await import('./supabase.js');

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
    // Must pass the bare code, not the full query string.
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(window.location.search).not.toContain('code=');
    expect(window.location.search).not.toContain('state=');
    expect(window.location.search).toContain('keep=this');
  });
});

describe('detectBaseMismatch (PHASE-18 18D / L13)', () => {
  it('github.io: matching first segment ⇒ null', () => {
    expect(
      detectBaseMismatch({ hostname: 'user.github.io', pathname: '/dungeon-scholar/', baseUrl: '/dungeon-scholar/' }),
    ).toBeNull();
  });

  it('github.io: mismatched first segment ⇒ message naming both', () => {
    const msg = detectBaseMismatch({
      hostname: 'user.github.io',
      pathname: '/home-lab/',
      baseUrl: '/dungeon-scholar/',
    });
    expect(msg).toContain('/home-lab/');
    expect(msg).toContain('/dungeon-scholar/');
  });

  it('github.io: deep path under the base ⇒ null', () => {
    expect(
      detectBaseMismatch({
        hostname: 'user.github.io',
        pathname: '/dungeon-scholar/some/route',
        baseUrl: '/dungeon-scholar/',
      }),
    ).toBeNull();
  });

  it('non-github host: served path under the base ⇒ null', () => {
    expect(detectBaseMismatch({ hostname: 'example.com', pathname: '/app/page', baseUrl: '/app/' })).toBeNull();
  });

  it('non-github host: served path outside the base ⇒ message', () => {
    const msg = detectBaseMismatch({ hostname: 'example.com', pathname: '/other/', baseUrl: '/app/' });
    expect(msg).toContain('/other/');
    expect(msg).toContain('/app/');
  });

  it('root base ("/") ⇒ null (dev / root deploy)', () => {
    expect(detectBaseMismatch({ hostname: 'localhost', pathname: '/anything', baseUrl: '/' })).toBeNull();
  });
});
