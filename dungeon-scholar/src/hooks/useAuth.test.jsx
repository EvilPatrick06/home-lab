import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

let authChangeCb = null;
const mockGetSession = vi.fn();

vi.mock('../services/supabase.js', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: (cb) => {
        authChangeCb = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  },
  isSupabaseConfigured: () => true,
}));

import { useAuth } from './useAuth.js';

describe('useAuth', () => {
  beforeEach(() => {
    authChangeCb = null;
    mockGetSession.mockReset();
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
});
