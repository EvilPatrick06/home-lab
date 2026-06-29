import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFromLocalStorage, STORAGE_KEY } from '../services/persistence.js';
import { usePlayerState } from './usePlayerState.js';

vi.mock('../services/cloudSync.js', () => ({
  pullSave: vi.fn(),
  pushSave: vi.fn(() => Promise.resolve({ updatedAt: '2026-04-30T00:00:00Z' })),
  upsertProfile: vi.fn(() => Promise.resolve()),
  subscribeSaves: vi.fn(() => () => {}),
}));

import { pullSave, pushSave, subscribeSaves, upsertProfile } from '../services/cloudSync.js';

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
    // applyBackfills tags hydrated state with the current backfillVer so the
    // backfill check doesn't repeat next load. Other fields preserved.
    expect(result.current[0]).toEqual({ ...stored, backfillVer: 1 });
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

    // After the window, the latest state is written. loadFromLocalStorage
    // returns { state, schemaVer } — assert against state, ignore version.
    expect(loadFromLocalStorage()?.state).toEqual({ level: 4, totalXp: 30, library: [] });
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

    expect(loadFromLocalStorage()?.state).toEqual({ level: 9, totalXp: 99, library: [] });
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
      updatedAt: '2026-04-29T00:00:00Z',
      schemaVer: 1,
    });
    const { result } = renderHook(() => usePlayerState(DEFAULT, USER));
    await waitFor(() => expect(result.current[0].level).toBe(5));
    expect(pushSave).not.toHaveBeenCalled();
    expect(result.current[2].mergeRequired).toBe(false);
  });

  it('empty cloud + local has data → local pushed to cloud silently', async () => {
    localStorage.setItem('dungeon-scholar:save:v1', JSON.stringify({ level: 3, totalXp: 50, library: [] }));
    pullSave.mockResolvedValueOnce(null);

    const { result } = renderHook(() => usePlayerState(DEFAULT, USER));
    await waitFor(() => expect(pushSave).toHaveBeenCalled());
    const [pushedUid, pushedBlob] = pushSave.mock.calls[0];
    expect(pushedUid).toBe('u1');
    expect(pushedBlob.level).toBe(3);
    expect(result.current[2].mergeRequired).toBe(false);
  });

  it('cloud has data + local has data → mergeRequired flag goes true', async () => {
    localStorage.setItem('dungeon-scholar:save:v1', JSON.stringify({ level: 3, totalXp: 50, library: [{ id: 'b' }] }));
    pullSave.mockResolvedValueOnce({
      data: { level: 7, totalXp: 200, library: [{ id: 'a' }] },
      updatedAt: '2026-04-29T00:00:00Z',
      schemaVer: 1,
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

  it('debounces cloud writes briefly and pushes the latest state', async () => {
    pullSave.mockResolvedValueOnce(null);
    pushSave.mockResolvedValue({ updatedAt: '2026-04-30T00:00:00Z' });

    const { result } = renderHook(() => usePlayerState(DEFAULT, USER));
    await waitFor(() => expect(pullSave).toHaveBeenCalled());

    act(() => {
      result.current[1]({ level: 2, totalXp: 1, library: [] });
      result.current[1]({ level: 3, totalXp: 2, library: [] });
      result.current[1]({ level: 4, totalXp: 3, library: [] });
    });

    await waitFor(() => expect(pushSave).toHaveBeenCalled(), { timeout: 2000 });
    const lastPush = pushSave.mock.calls.at(-1)[1];
    expect(lastPush.level).toBe(4);
  }, 5000);

  it('flips status to "saving" then back to "idle" on success', async () => {
    pullSave.mockResolvedValueOnce(null);
    pushSave.mockResolvedValue({ updatedAt: '2026-04-30T00:00:00Z' });

    const { result } = renderHook(() => usePlayerState(DEFAULT, USER));
    await waitFor(() => expect(pullSave).toHaveBeenCalled());

    act(() => {
      result.current[1]({ level: 5, totalXp: 1, library: [] });
    });
    await waitFor(() => expect(pushSave).toHaveBeenCalled(), { timeout: 2000 });
    await waitFor(() => expect(result.current[2].status).toBe('idle'));
  }, 5000);

  it('retries on push failure with backoff and ends in "offline"', async () => {
    // Fake timers so the 1s/4s/16s retry backoff is stepped instantly instead of
    // waited through in real wall-clock time (~21s in the old real-timer form).
    vi.useFakeTimers();
    try {
      pullSave.mockResolvedValueOnce(null);
      pushSave.mockRejectedValue(new Error('net'));

      const { result } = renderHook(() => usePlayerState(DEFAULT, USER));
      // Flush the mount-time pull + sign-in merge microtasks.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20);
      });
      expect(pullSave).toHaveBeenCalled();

      act(() => {
        result.current[1]({ level: 5, totalXp: 1, library: [] });
      });

      // Cloud debounce (1500ms) → initial push, then 3 retries (1s/4s/16s).
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500 + 1000 + 4000 + 16000 + 50);
      });

      expect(pushSave.mock.calls.length).toBeGreaterThanOrEqual(4);
      expect(result.current[2].status).toBe('offline');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not re-pull cloud when user is re-projected with same id (token refresh)', async () => {
    pullSave.mockResolvedValue(null);

    const { rerender } = renderHook(({ user }) => usePlayerState(DEFAULT, user), { initialProps: { user: USER } });

    await waitFor(() => expect(pullSave).toHaveBeenCalledTimes(1));

    // Simulate Supabase TOKEN_REFRESHED → useAuth produces a fresh user
    // object reference with the same id. The merge logic must NOT re-run.
    rerender({ user: { ...USER } });
    await new Promise((r) => setTimeout(r, 50));
    expect(pullSave).toHaveBeenCalledTimes(1);
  });
});

describe('usePlayerState — smart sign-in merge using sync meta', () => {
  beforeEach(() => {
    localStorage.clear();
    pullSave.mockReset();
    pushSave.mockReset();
    upsertProfile.mockReset();
  });

  it('cloud changed + local not dirty → silently takes cloud (no chooser)', async () => {
    // Local has stale data from a previous sync.
    localStorage.setItem('dungeon-scholar:save:v1', JSON.stringify({ level: 5, totalXp: 100, library: [{ id: 'a' }] }));
    // Last sync recorded T0; not dirty.
    localStorage.setItem(
      'dungeon-scholar:sync:v1',
      JSON.stringify({ lastSyncedAt: '2026-04-29T10:00:00Z', dirty: false }),
    );

    pullSave.mockResolvedValueOnce({
      data: { level: 9, totalXp: 500, library: [{ id: 'a' }, { id: 'b' }] },
      updatedAt: '2026-04-29T11:00:00Z', // newer than lastSyncedAt
      schemaVer: 1,
    });

    const { result } = renderHook(() => usePlayerState(DEFAULT, USER));

    await waitFor(() => expect(result.current[0].level).toBe(9));
    expect(result.current[2].mergeRequired).toBe(false);
    expect(pushSave).not.toHaveBeenCalled();
  });

  it('cloud changed + local dirty → fires merge chooser (real conflict)', async () => {
    localStorage.setItem('dungeon-scholar:save:v1', JSON.stringify({ level: 5, totalXp: 100, library: [{ id: 'a' }] }));
    localStorage.setItem(
      'dungeon-scholar:sync:v1',
      JSON.stringify({ lastSyncedAt: '2026-04-29T10:00:00Z', dirty: true }),
    );

    pullSave.mockResolvedValueOnce({
      data: { level: 9, totalXp: 500, library: [{ id: 'a' }, { id: 'b' }] },
      updatedAt: '2026-04-29T11:00:00Z',
      schemaVer: 1,
    });

    const { result } = renderHook(() => usePlayerState(DEFAULT, USER));
    await waitFor(() => expect(result.current[2].mergeRequired).toBe(true));
    expect(pushSave).not.toHaveBeenCalled();
  });

  it('cloud unchanged + local dirty → pushes (no chooser)', async () => {
    localStorage.setItem('dungeon-scholar:save:v1', JSON.stringify({ level: 5, totalXp: 100, library: [{ id: 'a' }] }));
    localStorage.setItem(
      'dungeon-scholar:sync:v1',
      JSON.stringify({ lastSyncedAt: '2026-04-29T10:00:00Z', dirty: true }),
    );

    pullSave.mockResolvedValueOnce({
      data: { level: 5, totalXp: 100, library: [{ id: 'a' }] },
      updatedAt: '2026-04-29T10:00:00Z', // unchanged since last sync
      schemaVer: 1,
    });
    pushSave.mockResolvedValue({ updatedAt: '2026-04-29T10:01:00Z' });

    const { result } = renderHook(() => usePlayerState(DEFAULT, USER));
    await waitFor(() => expect(pushSave).toHaveBeenCalled());
    expect(result.current[2].mergeRequired).toBe(false);
  });

  it('cloud unchanged + local not dirty → no-op (no push, no chooser)', async () => {
    localStorage.setItem('dungeon-scholar:save:v1', JSON.stringify({ level: 5, totalXp: 100, library: [{ id: 'a' }] }));
    localStorage.setItem(
      'dungeon-scholar:sync:v1',
      JSON.stringify({ lastSyncedAt: '2026-04-29T10:00:00Z', dirty: false }),
    );

    pullSave.mockResolvedValueOnce({
      data: { level: 5, totalXp: 100, library: [{ id: 'a' }] },
      updatedAt: '2026-04-29T10:00:00Z',
      schemaVer: 1,
    });

    const { result } = renderHook(() => usePlayerState(DEFAULT, USER));
    await waitFor(() => expect(pullSave).toHaveBeenCalled());
    // give the effect's microtasks a chance to settle
    await new Promise((r) => setTimeout(r, 50));
    expect(pushSave).not.toHaveBeenCalled();
    expect(result.current[2].mergeRequired).toBe(false);
  });

  it('local and cloud are byte-identical → no chooser even when never synced before', async () => {
    // Same state on both sides, but no prior sync meta exists. Previously
    // this hit the "!lastSync" branch and forced the MergeChooser despite
    // there being nothing to merge.
    const shared = { level: 4, totalXp: 923, library: [{ id: 't1', title: 'AWS' }], totalCorrect: 66 };
    localStorage.setItem('dungeon-scholar:save:v1', JSON.stringify(shared));
    // No sync meta — first time the device signs in.

    pullSave.mockResolvedValueOnce({
      data: shared,
      updatedAt: '2026-05-17T00:00:00Z',
      schemaVer: 1,
    });

    const { result } = renderHook(() => usePlayerState(DEFAULT, USER));
    await waitFor(() => expect(pullSave).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current[2].mergeRequired).toBe(false);
    expect(pushSave).not.toHaveBeenCalled();
  });

  it('local and cloud are byte-identical → no chooser even on cloud-changed + dirty branch', async () => {
    // Sync meta says we were dirty + cloud has changed since lastSync,
    // but the new cloud state is identical to local. No real conflict.
    const shared = { level: 4, totalXp: 923, library: [{ id: 't1' }], totalCorrect: 66 };
    localStorage.setItem('dungeon-scholar:save:v1', JSON.stringify(shared));
    localStorage.setItem(
      'dungeon-scholar:sync:v1',
      JSON.stringify({ lastSyncedAt: '2026-04-29T10:00:00Z', dirty: true }),
    );

    pullSave.mockResolvedValueOnce({
      data: shared,
      updatedAt: '2026-04-29T11:00:00Z', // newer than lastSyncedAt
      schemaVer: 1,
    });

    const { result } = renderHook(() => usePlayerState(DEFAULT, USER));
    await waitFor(() => expect(pullSave).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current[2].mergeRequired).toBe(false);
    expect(pushSave).not.toHaveBeenCalled();
  });
});

describe('usePlayerState — Realtime echo dedup', () => {
  let realtimeCb;
  let unsubSpy;

  beforeEach(() => {
    localStorage.clear();
    pullSave.mockReset();
    pushSave.mockReset();
    upsertProfile.mockReset();
    subscribeSaves.mockReset();
    realtimeCb = null;
    unsubSpy = vi.fn();
    subscribeSaves.mockImplementation((_uid, cb) => {
      realtimeCb = cb;
      return unsubSpy;
    });
  });

  it('(a) exact-updatedAt echo is skipped — state unchanged', async () => {
    // Empty cloud at sign-in so nothing gets applied/merged.
    pullSave.mockResolvedValueOnce(null);
    // Our own push resolves with updatedAt T1; lastKnownCloudUpdatedAt becomes T1.
    const T1 = '2026-05-01T00:00:00Z';
    pushSave.mockResolvedValue({ updatedAt: T1 });

    const { result } = renderHook(() => usePlayerState(DEFAULT, USER));
    await waitFor(() => expect(subscribeSaves).toHaveBeenCalled());
    await waitFor(() => expect(pullSave).toHaveBeenCalled());

    // Local change → debounced pushSave fires → resolves with T1.
    act(() => {
      result.current[1]({ level: 6, totalXp: 60, library: [] });
    });
    await waitFor(() => expect(pushSave).toHaveBeenCalled(), { timeout: 2500 });
    await waitFor(() => expect(result.current[2].status).toBe('idle'));

    const before = result.current[0];

    // Realtime echo whose updatedAt matches our last push → fast-path skip.
    act(() => {
      realtimeCb({ data: { level: 999, totalXp: 999, library: [{ id: 'x' }] }, updatedAt: T1, schemaVer: 1 });
    });

    // State object is untouched (same reference, same value).
    expect(result.current[0]).toBe(before);
    expect(result.current[0].level).toBe(6);
  }, 6000);

  it('(b) content-hash echo is skipped — state object not replaced, ref still advances', async () => {
    // Cloud has data + empty local → cloud applied silently; this seeds
    // recentLocalHashes via applyRemoteState's trackLocalHash.
    const data = { level: 4, totalXp: 40, library: [{ id: 'a' }], backfillVer: 1 };
    pullSave.mockResolvedValueOnce({ data, updatedAt: '2026-04-29T00:00:00Z', schemaVer: 1 });

    const { result } = renderHook(() => usePlayerState(DEFAULT, USER));
    await waitFor(() => expect(subscribeSaves).toHaveBeenCalled());
    await waitFor(() => expect(result.current[0].level).toBe(4));

    const before = result.current[0];
    // The current local state hash is recorded — an incoming snapshot that is
    // deep-equal to it (but with a NEW updatedAt T2) is a content echo.
    const T2 = '2026-05-02T00:00:00Z';
    act(() => {
      realtimeCb({ data: { ...before }, updatedAt: T2, schemaVer: 1 });
    });

    // State object NOT replaced (same reference).
    expect(result.current[0]).toBe(before);

    // Invoke again with the SAME T2. The hash path already advanced
    // lastKnownCloudUpdatedAt to T2, so this now hits the fast exact-match
    // path and is still skipped — state untouched.
    act(() => {
      realtimeCb({ data: { ...before }, updatedAt: T2, schemaVer: 1 });
    });
    expect(result.current[0]).toBe(before);
  });

  it('(c) genuine remote update is applied — state + localStorage updated', async () => {
    pullSave.mockResolvedValueOnce(null);

    const { result } = renderHook(() => usePlayerState(DEFAULT, USER));
    await waitFor(() => expect(subscribeSaves).toHaveBeenCalled());
    await waitFor(() => expect(pullSave).toHaveBeenCalled());

    const incoming = { level: 11, totalXp: 1100, library: [{ id: 'remote' }] };
    act(() => {
      realtimeCb({ data: incoming, updatedAt: '2026-05-03T00:00:00Z', schemaVer: 1 });
    });

    // applyBackfills tags the applied state with backfillVer: 1.
    const expected = { ...incoming, backfillVer: 1 };
    await waitFor(() => expect(result.current[0]).toEqual(expected));
    expect(loadFromLocalStorage()?.state).toEqual(expected);
  });

  it('(d) unsubscribe — unsub callback fires after unmount', async () => {
    pullSave.mockResolvedValueOnce(null);

    const { unmount } = renderHook(() => usePlayerState(DEFAULT, USER));
    await waitFor(() => expect(subscribeSaves).toHaveBeenCalled());

    expect(unsubSpy).not.toHaveBeenCalled();
    unmount();
    expect(unsubSpy).toHaveBeenCalled();
  });
});

describe('usePlayerState — BroadcastChannel dedup', () => {
  // Drive onmessage ourselves rather than relying on happy-dom's own
  // BroadcastChannel implementation (which would structured-clone + deliver
  // asynchronously across instances and is awkward to assert against).
  class MockBC {
    static instances = [];
    constructor(name) {
      this.name = name;
      this.onmessage = null;
      this.closed = false;
      MockBC.instances.push(this);
    }
    postMessage() {
      /* no-op: we never want a self-delivery loop in tests */
    }
    close() {
      this.closed = true;
    }
    // Test helper: deliver a message to this channel's onmessage handler.
    emit(msg) {
      if (this.onmessage) this.onmessage({ data: msg });
    }
  }

  beforeEach(() => {
    localStorage.clear();
    pullSave.mockReset();
    pushSave.mockReset();
    upsertProfile.mockReset();
    subscribeSaves.mockReset();
    subscribeSaves.mockImplementation(() => () => {});
    MockBC.instances = [];
    vi.stubGlobal('BroadcastChannel', MockBC);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('echo — a message matching a recent local state is NOT applied', async () => {
    const { result } = renderHook(() => usePlayerState(DEFAULT));
    const channel = MockBC.instances.at(-1);
    expect(channel).toBeTruthy();

    // Make a local change — this records the state hash in recentLocalHashes
    // (and would have been broadcast in a real channel).
    const local = { level: 2, totalXp: 20, library: [] };
    act(() => {
      result.current[1](local);
    });
    const before = result.current[0];

    // A BroadcastChannel echo carrying that same state → deduped, not applied.
    act(() => {
      channel.emit({ type: 'state', state: { ...local } });
    });
    expect(result.current[0]).toBe(before);
  });

  it('genuine cross-tab state is applied with NO pushSave (applyingRemoteRef guard)', async () => {
    // Signed in so a push WOULD fire if the guard were broken.
    pullSave.mockResolvedValueOnce(null);
    const { result } = renderHook(() => usePlayerState(DEFAULT, USER));
    await waitFor(() => expect(pullSave).toHaveBeenCalled());
    const channel = MockBC.instances.at(-1);

    pushSave.mockClear();
    const remote = { level: 8, totalXp: 800, library: [{ id: 'tab2' }] };
    act(() => {
      channel.emit({ type: 'state', state: remote });
    });

    await waitFor(() => expect(result.current[0]).toEqual(remote));
    // The applyingRemoteRef guard suppresses the cloud push on remote-applied state.
    await new Promise((r) => setTimeout(r, 50));
    expect(pushSave).not.toHaveBeenCalled();
  });
});

describe('usePlayerState — resolveMerge branches', () => {
  // Build the real-conflict fixture exactly as the existing
  // "cloud changed + local dirty → fires merge chooser" test does.
  const LOCAL = { level: 5, totalXp: 100, library: [{ id: 'a' }] };
  const CLOUD = { level: 9, totalXp: 500, library: [{ id: 'a' }, { id: 'b' }] };

  beforeEach(() => {
    localStorage.clear();
    pullSave.mockReset();
    pushSave.mockReset();
    upsertProfile.mockReset();
    subscribeSaves.mockReset();
    subscribeSaves.mockImplementation(() => () => {});
  });

  async function renderConflict() {
    localStorage.setItem('dungeon-scholar:save:v1', JSON.stringify(LOCAL));
    localStorage.setItem(
      'dungeon-scholar:sync:v1',
      JSON.stringify({ lastSyncedAt: '2026-04-29T10:00:00Z', dirty: true }),
    );
    pullSave.mockResolvedValueOnce({
      data: CLOUD,
      updatedAt: '2026-04-29T11:00:00Z',
      schemaVer: 1,
    });
    pushSave.mockResolvedValue({ updatedAt: '2026-04-29T12:00:00Z' });

    const view = renderHook(() => usePlayerState(DEFAULT, USER));
    await waitFor(() => expect(view.result.current[2].mergeRequired).toBe(true));
    return view;
  }

  it("'local' → pushes the local blob, clears merge state", async () => {
    const { result } = await renderConflict();
    expect(pushSave).not.toHaveBeenCalled();

    await act(async () => {
      await result.current[2].resolveMerge('local');
    });

    expect(pushSave).toHaveBeenCalledTimes(1);
    const [, pushedBlob] = pushSave.mock.calls[0];
    expect(pushedBlob.level).toBe(5);
    expect(result.current[2].mergeRequired).toBe(false);
    expect(result.current[2].localPreview).toBeNull();
    expect(result.current[2].cloudPreview).toBeNull();
  });

  it("'cloud' → state becomes cloud preview, second pullSave fires, NO pushSave", async () => {
    const { result } = await renderConflict();
    // The sign-in pull already consumed the queued mock; provide the fresh
    // re-pull resolveMerge('cloud') issues to sync lastKnownCloudUpdatedAt.
    pullSave.mockResolvedValueOnce({
      data: CLOUD,
      updatedAt: '2026-04-29T11:00:00Z',
      schemaVer: 1,
    });
    const pullsBefore = pullSave.mock.calls.length;

    await act(async () => {
      await result.current[2].resolveMerge('cloud');
    });

    // cloudPreview was run through applyBackfills at sign-in (tagged backfillVer).
    expect(result.current[0]).toEqual({ ...CLOUD, backfillVer: 1 });
    expect(pullSave.mock.calls.length).toBe(pullsBefore + 1);
    expect(pushSave).not.toHaveBeenCalled();
    expect(result.current[2].mergeRequired).toBe(false);
  });

  it("'cancel' → clears merge flag, no push, no state change", async () => {
    const { result } = await renderConflict();
    const before = result.current[0];

    await act(async () => {
      await result.current[2].resolveMerge('cancel');
    });

    expect(result.current[2].mergeRequired).toBe(false);
    expect(result.current[2].localPreview).toBeNull();
    expect(result.current[2].cloudPreview).toBeNull();
    expect(pushSave).not.toHaveBeenCalled();
    expect(result.current[0]).toBe(before);
  });
});

describe('usePlayerState — offline recovery (Phase-30 QA gap)', () => {
  beforeEach(() => {
    localStorage.clear();
    pullSave.mockReset();
    pushSave.mockReset();
    upsertProfile.mockReset();
    subscribeSaves.mockReset();
    subscribeSaves.mockImplementation(() => () => {});
  });

  it('(a) recovers from "offline": after backoff exhausts, a fresh change with a now-resolving push walks saving→idle and clears dirty', async () => {
    // Fake timers so the backoff window is stepped instantly (was ~24s real).
    vi.useFakeTimers();
    try {
      pullSave.mockResolvedValueOnce(null);
      // First change's push fails on every attempt → ends in 'offline'.
      pushSave.mockRejectedValue(new Error('net'));

      const { result } = renderHook(() => usePlayerState(DEFAULT, USER));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20);
      });
      expect(pullSave).toHaveBeenCalled();

      act(() => {
        result.current[1]({ level: 5, totalXp: 1, library: [] });
      });

      // Cloud debounce (1500ms) → initial push + 3 retries (1s/4s/16s) → 'offline'.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500 + 1000 + 4000 + 16000 + 50);
      });
      expect(pushSave.mock.calls.length).toBeGreaterThanOrEqual(4);
      expect(result.current[2].status).toBe('offline');

      // Network comes back: subsequent pushes succeed.
      pushSave.mockReset();
      pushSave.mockResolvedValue({ updatedAt: '2026-05-20T00:00:00Z' });

      // A new local change re-arms the cloud debounce → push fires and succeeds.
      act(() => {
        result.current[1]({ level: 6, totalXp: 2, library: [] });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500 + 50);
      });

      expect(pushSave).toHaveBeenCalled();
      expect(result.current[2].status).toBe('idle');
      // dirty cleared: writeSyncMeta on success records dirty:false.
      const meta = JSON.parse(localStorage.getItem('dungeon-scholar:sync:v1'));
      expect(meta.dirty).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('(b) a sign-in pull failure puts the status into "offline"', async () => {
    // Seed local data so the sign-in branch actually runs the pull (and isn't
    // short-circuited) — though the rejection is caught regardless.
    localStorage.setItem('dungeon-scholar:save:v1', JSON.stringify({ level: 3, totalXp: 50, library: [{ id: 'a' }] }));
    pullSave.mockRejectedValueOnce(new Error('pull failed'));

    const { result } = renderHook(() => usePlayerState(DEFAULT, USER));

    await waitFor(() => expect(pullSave).toHaveBeenCalledWith('u1'));
    await waitFor(() => expect(result.current[2].status).toBe('offline'));
    // No push attempted — the pull threw before any merge/push decision.
    expect(pushSave).not.toHaveBeenCalled();
  });
});

describe('usePlayerState — blur listener cleanup (step-1 regression)', () => {
  beforeEach(() => {
    localStorage.clear();
    pullSave.mockReset();
    pushSave.mockReset();
    upsertProfile.mockReset();
    subscribeSaves.mockReset();
    subscribeSaves.mockImplementation(() => () => {});
  });

  it('removes its blur handler on unmount — a post-unmount blur does not re-flush', () => {
    // Signed out: local-only flush path.
    const { result, unmount } = renderHook(() => usePlayerState(DEFAULT));

    // Make a local change so the handler, if leaked, has stale state to flush.
    act(() => {
      result.current[1]({ level: 12, totalXp: 120, library: [] });
    });

    unmount();
    localStorage.clear();

    // Pre-fix the cleanup removed 'blur-sm' (a no-op), leaving the real 'blur'
    // handler attached; this event would re-flush the stale latestRef.
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
