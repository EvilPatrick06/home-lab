import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let authChangeCb = null;
const mockGetSession = vi.fn();
const mockStartAutoRefresh = vi.fn();
const mockStopAutoRefresh = vi.fn();
const mockLogWarn = vi.fn();

vi.mock('../services/supabase.js', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      startAutoRefresh: () => mockStartAutoRefresh(),
      stopAutoRefresh: () => mockStopAutoRefresh(),
      onAuthStateChange: (cb) => {
        authChangeCb = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  },
  isSupabaseConfigured: () => true,
  // PHASE-13 F2: reachable by default so the PHASE-02 arm-the-ticker behaviour
  // under test here is unchanged.
  probeSupabaseReachable: () => Promise.resolve(true),
}));

vi.mock('../services/logger.js', () => ({
  logWarn: (...a) => mockLogWarn(...a),
}));

import { useAuth } from './useAuth.js';

describe('useAuth', () => {
  beforeEach(() => {
    authChangeCb = null;
    mockGetSession.mockReset();
    mockStartAutoRefresh.mockReset();
    mockStopAutoRefresh.mockReset();
    mockLogWarn.mockReset();
  });

  it('starts with null user and resolves to session user', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'u1', user_metadata: { user_name: 'gavin', avatar_url: 'a.png' } } } },
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.user).toBeNull();
    await waitFor(() => expect(result.current.user?.id).toBe('u1'));
    expect(result.current.user.githubLogin).toBe('gavin');
    expect(result.current.user.avatarUrl).toBe('a.png');
  });

  it('updates user when onAuthStateChange fires SIGNED_IN', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.user).toBeNull());

    act(() => {
      authChangeCb('SIGNED_IN', { user: { id: 'u2', user_metadata: { user_name: 'pat' } } });
    });

    await waitFor(() => expect(result.current.user?.id).toBe('u2'));
  });

  it('clears user on SIGNED_OUT', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'u3', user_metadata: { user_name: 'pat' } } } },
    });

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.user?.id).toBe('u3'));

    act(() => {
      authChangeCb('SIGNED_OUT', null);
    });

    await waitFor(() => expect(result.current.user).toBeNull());
  });

  // PHASE-02 (F1): refresh gating.
  it('does NOT start auto-refresh on a signed-out (no-session) init', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    renderHook(() => useAuth());
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());
    // Give the resolved-session branch a tick to run.
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockStartAutoRefresh).not.toHaveBeenCalled();
    expect(mockStopAutoRefresh).toHaveBeenCalled();
  });

  it('starts auto-refresh once a session is present (init with session)', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'u4', user_metadata: { user_name: 'gav' } } } },
    });

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.user?.id).toBe('u4'));
    expect(mockStartAutoRefresh).toHaveBeenCalled();
  });

  it('starts auto-refresh on SIGNED_IN and stops it on SIGNED_OUT', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    renderHook(() => useAuth());
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());

    act(() => {
      authChangeCb('SIGNED_IN', { user: { id: 'u5', user_metadata: { user_name: 'p' } } });
    });
    expect(mockStartAutoRefresh).toHaveBeenCalled();

    mockStopAutoRefresh.mockClear();
    act(() => {
      authChangeCb('SIGNED_OUT', null);
    });
    expect(mockStopAutoRefresh).toHaveBeenCalled();
  });

  it('a rejected getSession does not throw and logs once at warn level', async () => {
    mockGetSession.mockRejectedValue(new Error('Failed to fetch'));

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(mockLogWarn).toHaveBeenCalledTimes(1);
    expect(mockStartAutoRefresh).not.toHaveBeenCalled();
  });
});
