import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// PHASE-08 08E: separate file from useAuth.test.jsx because this scenario needs a
// mock client that exposes refreshSession()/signOut() (the real client surface)
// so the circuit-breaker path runs; the PHASE-02 tests deliberately mock a client
// WITHOUT refreshSession to assert the unchanged "just arm the ticker" behaviour.
let authChangeCb = null;
const mockGetSession = vi.fn();
const mockRefreshSession = vi.fn();
const mockSignOut = vi.fn();
const mockStartAutoRefresh = vi.fn();
const mockStopAutoRefresh = vi.fn();
const mockLogWarn = vi.fn();

vi.mock('../services/supabase.js', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      refreshSession: (...a) => mockRefreshSession(...a),
      signOut: (...a) => mockSignOut(...a),
      startAutoRefresh: () => mockStartAutoRefresh(),
      stopAutoRefresh: () => mockStopAutoRefresh(),
      onAuthStateChange: (cb) => {
        authChangeCb = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  },
  isSupabaseConfigured: () => true,
}));

vi.mock('../services/logger.js', () => ({
  logWarn: (...a) => mockLogWarn(...a),
}));

import { useAuth } from './useAuth.js';

describe('useAuth circuit breaker (PHASE-08 08E)', () => {
  beforeEach(() => {
    authChangeCb = null;
    mockGetSession.mockReset();
    mockRefreshSession.mockReset();
    mockSignOut.mockReset();
    mockStartAutoRefresh.mockReset();
    mockStopAutoRefresh.mockReset();
    mockLogWarn.mockReset();
  });

  it('quarantines a stale session when refresh keeps failing on an unreachable host', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'stale', user_metadata: { user_name: 'pat' } } } },
    });
    // Every refresh attempt rejects with a network-level error (host unreachable).
    mockRefreshSession.mockRejectedValue(new TypeError('Failed to fetch'));

    const { result } = renderHook(() => useAuth());

    // After the failure ceiling: ticker stopped, token quarantined (local signOut),
    // UI dropped to signed-out, and exactly one handled warning — no error spam.
    await waitFor(() => expect(mockStopAutoRefresh).toHaveBeenCalled(), { timeout: 4000 });
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' }), { timeout: 4000 });
    expect(mockRefreshSession).toHaveBeenCalledTimes(3);
    expect(mockStartAutoRefresh).not.toHaveBeenCalled();
    expect(result.current.user).toBeNull();
    expect(mockLogWarn).toHaveBeenCalledTimes(1);
  });

  it('arms the normal ticker when the session refreshes cleanly', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'live', user_metadata: { user_name: 'gav' } } } },
    });
    mockRefreshSession.mockResolvedValue({ data: { session: {} }, error: null });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.user?.id).toBe('live'));
    await waitFor(() => expect(mockStartAutoRefresh).toHaveBeenCalled());
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockLogWarn).not.toHaveBeenCalled();
  });

  it('does not re-arm the ticker from an onAuthStateChange echo after quarantine', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'stale', user_metadata: { user_name: 'pat' } } } },
    });
    mockRefreshSession.mockRejectedValue(new TypeError('Failed to fetch'));

    renderHook(() => useAuth());
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled(), { timeout: 4000 });

    mockStartAutoRefresh.mockClear();
    // A late echo (e.g. GoTrue settling the local signOut) must not re-arm.
    authChangeCb?.('TOKEN_REFRESHED', { user: { id: 'stale' } });
    expect(mockStartAutoRefresh).not.toHaveBeenCalled();
  });
});
