import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import { usePlayerState } from './usePlayerState.js';
import { STORAGE_KEY, loadFromLocalStorage } from '../services/persistence.js';
import { hasMeaningfulData } from '../services/persistence.js';

vi.mock('../services/cloudSync.js', () => ({
  pullSave: vi.fn(),
  pushSave: vi.fn(() => Promise.resolve()),
  upsertProfile: vi.fn(() => Promise.resolve()),
}));

import { pullSave, pushSave, upsertProfile } from '../services/cloudSync.js';

const USER = { id: 'u1', githubLogin: 'pat', avatarUrl: 'a.png' };

const DEFAULT = { level: 1, totalXp: 0, library: [] };

describe('usePlayerState — local-only behavior', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hydrates from localStorage on mount when present', () => {
    const stored = { level: 7, totalXp: 500, library: [{ id: 'a' }] };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const { result } = renderHook(() => usePlayerState(DEFAULT));
    expect(result.current[0]).toEqual(stored);
  });

  it('falls back to default when localStorage is empty', () => {
    const { result } = renderHook(() => usePlayerState(DEFAULT));
    expect(result.current[0]).toEqual(DEFAULT);
  });

  it('debounces writes — multiple rapid setState calls collapse into one write', () => {
    const { result } = renderHook(() => usePlayerState(DEFAULT));

    act(() => {
      result.current[1]({ level: 2, totalXp: 10, library: [] });
      result.current[1]({ level: 3, totalXp: 20, library: [] });
      result.current[1]({ level: 4, totalXp: 30, library: [] });
    });

    // Before the debounce window elapses, nothing should be written.
    expect(loadFromLocalStorage()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(600);
    });

    // After the window, the latest state is written.
    expect(loadFromLocalStorage()).toEqual({ level: 4, totalXp: 30, library: [] });
  });

  it('flushes a pending write on beforeunload', () => {
    const { result } = renderHook(() => usePlayerState(DEFAULT));

    act(() => {
      result.current[1]({ level: 9, totalXp: 99, library: [] });
    });

    // Synthesize a beforeunload event before the debounce fires.
    act(() => {
      window.dispatchEvent(new Event('beforeunload'));
    });

    expect(loadFromLocalStorage()).toEqual({ level: 9, totalXp: 99, library: [] });
  });
});

describe('usePlayerState — sign-in branches (silent)', () => {
  beforeEach(() => {
    localStorage.clear();
    pullSave.mockReset();
    pushSave.mockReset();
    upsertProfile.mockReset();
  });

  it('empty cloud + empty local → no-op (no merge chooser, nothing pushed)', async () => {
    pullSave.mockResolvedValueOnce(null);
    const { result } = renderHook(() => usePlayerState(DEFAULT, USER));
    await waitFor(() => expect(pullSave).toHaveBeenCalledWith('u1'));
    expect(pushSave).not.toHaveBeenCalled();
    expect(result.current[2].mergeRequired).toBe(false);
  });

  it('cloud has data + empty local → cloud overwrites local silently', async () => {
    pullSave.mockResolvedValueOnce({
      data: { level: 5, totalXp: 100, library: [{ id: 'a' }] },
      updatedAt: '2026-04-29T00:00:00Z', schemaVer: 1,
    });
    const { result } = renderHook(() => usePlayerState(DEFAULT, USER));
    await waitFor(() => expect(result.current[0].level).toBe(5));
    expect(pushSave).not.toHaveBeenCalled();
    expect(result.current[2].mergeRequired).toBe(false);
  });

  it('empty cloud + local has data → local pushed to cloud silently', async () => {
    localStorage.setItem('dungeon-scholar:save:v1',
      JSON.stringify({ level: 3, totalXp: 50, library: [] }));
    pullSave.mockResolvedValueOnce(null);

    const { result } = renderHook(() => usePlayerState(DEFAULT, USER));
    await waitFor(() => expect(pushSave).toHaveBeenCalled());
    const [pushedUid, pushedBlob] = pushSave.mock.calls[0];
    expect(pushedUid).toBe('u1');
    expect(pushedBlob.level).toBe(3);
    expect(result.current[2].mergeRequired).toBe(false);
  });

  it('cloud has data + local has data → mergeRequired flag goes true', async () => {
    localStorage.setItem('dungeon-scholar:save:v1',
      JSON.stringify({ level: 3, totalXp: 50, library: [{ id: 'b' }] }));
    pullSave.mockResolvedValueOnce({
      data: { level: 7, totalXp: 200, library: [{ id: 'a' }] },
      updatedAt: '2026-04-29T00:00:00Z', schemaVer: 1,
    });

    const { result } = renderHook(() => usePlayerState(DEFAULT, USER));
    await waitFor(() => expect(result.current[2].mergeRequired).toBe(true));
    expect(pushSave).not.toHaveBeenCalled();
    // local hasn't changed yet — chooser will resolve.
    expect(result.current[0].level).toBe(3);
  });
});

describe('usePlayerState — steady-state cloud writes', () => {
  beforeEach(() => {
    localStorage.clear();
    pullSave.mockReset();
    pushSave.mockReset();
    upsertProfile.mockReset();
  });

  it('debounces cloud writes ~3s after a state change', async () => {
    pullSave.mockResolvedValueOnce(null);
    pushSave.mockResolvedValue();

    const { result } = renderHook(() => usePlayerState(DEFAULT, USER));
    await waitFor(() => expect(pullSave).toHaveBeenCalled());

    act(() => {
      result.current[1]({ level: 2, totalXp: 1, library: [] });
      result.current[1]({ level: 3, totalXp: 2, library: [] });
      result.current[1]({ level: 4, totalXp: 3, library: [] });
    });

    // Wait long enough for the 3s cloud debounce to fire and the push to land.
    await waitFor(() => expect(pushSave).toHaveBeenCalled(), { timeout: 5000 });
    const lastPush = pushSave.mock.calls.at(-1)[1];
    expect(lastPush.level).toBe(4);
  }, 8000);

  it('flips status to "saving" then back to "idle" on success', async () => {
    pullSave.mockResolvedValueOnce(null);
    pushSave.mockResolvedValue();

    const { result } = renderHook(() => usePlayerState(DEFAULT, USER));
    await waitFor(() => expect(pullSave).toHaveBeenCalled());

    act(() => { result.current[1]({ level: 5, totalXp: 1, library: [] }); });
    await waitFor(() => expect(pushSave).toHaveBeenCalled(), { timeout: 5000 });
    await waitFor(() => expect(result.current[2].status).toBe('idle'));
  }, 8000);

  it('retries on push failure with backoff and ends in "offline"', async () => {
    pullSave.mockResolvedValueOnce(null);
    pushSave.mockRejectedValue(new Error('net'));

    const { result } = renderHook(() => usePlayerState(DEFAULT, USER));
    await waitFor(() => expect(pullSave).toHaveBeenCalled());

    act(() => { result.current[1]({ level: 5, totalXp: 1, library: [] }); });

    // 4 attempts in total: initial + 3 retries with delays 1s/4s/16s.
    // Generous timeout to cover the full backoff window.
    await waitFor(() => expect(pushSave.mock.calls.length).toBeGreaterThanOrEqual(4), { timeout: 30000 });
    await waitFor(() => expect(result.current[2].status).toBe('offline'));
  }, 35000);

  it('does not re-pull cloud when user is re-projected with same id (token refresh)', async () => {
    pullSave.mockResolvedValue(null);

    const { rerender } = renderHook(
      ({ user }) => usePlayerState(DEFAULT, user),
      { initialProps: { user: USER } }
    );

    await waitFor(() => expect(pullSave).toHaveBeenCalledTimes(1));

    // Simulate Supabase TOKEN_REFRESHED → useAuth produces a fresh user
    // object reference with the same id. The merge logic must NOT re-run.
    rerender({ user: { ...USER } });
    await new Promise((r) => setTimeout(r, 50));
    expect(pullSave).toHaveBeenCalledTimes(1);
  });
});
