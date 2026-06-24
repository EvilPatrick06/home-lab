// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHUNK_RELOAD_FLAG,
  clearReloadFlag,
  guardedReloadOnce,
  isChunkLoadError,
  lazyWithReload,
} from './lazyWithReload.js';

describe('isChunkLoadError', () => {
  it('matches the failed-dynamic-import messages', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: /assets/LibraryScreen-x.js'))).toBe(
      true,
    );
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
    const e = new Error('boom');
    e.name = 'ChunkLoadError';
    expect(isChunkLoadError(e)).toBe(true);
  });

  it('does not match unrelated errors or nullish values', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe('guardedReloadOnce', () => {
  let reload;
  beforeEach(() => {
    window.sessionStorage.clear();
    reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it('reloads once and sets the guard, then no-ops while the guard is set', () => {
    expect(guardedReloadOnce()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(CHUNK_RELOAD_FLAG)).toBe('1');
    // Second call (e.g. controllerchange after preloadError) is suppressed.
    expect(guardedReloadOnce()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('clearReloadFlag releases the guard so a later deploy can reload again', () => {
    guardedReloadOnce();
    clearReloadFlag();
    expect(window.sessionStorage.getItem(CHUNK_RELOAD_FLAG)).toBeNull();
    expect(guardedReloadOnce()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});

describe('lazyWithReload', () => {
  let reload;
  beforeEach(() => {
    window.sessionStorage.clear();
    reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  // Drive React.lazy's internal loader so the wrapped factory's rejection
  // handler runs without mounting a full React tree.
  async function settle(factory) {
    const Comp = lazyWithReload(factory);
    try {
      Comp._init(Comp._payload); // kicks off factory(); throws the pending thenable
    } catch {
      // Pending suspense thenable — intentionally NOT awaited: the chunk-error
      // path returns a never-resolving promise (keeps Suspense up while the
      // reload navigates), so awaiting it would hang. A macrotask tick is
      // enough for factory() + its .then handlers to run.
    }
    await new Promise((r) => setTimeout(r, 25));
  }

  it('reloads exactly once on a chunk-load failure, setting the sessionStorage guard', async () => {
    await settle(() => Promise.reject(new Error('Failed to fetch dynamically imported module: /assets/x.js')));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(CHUNK_RELOAD_FLAG)).toBe('1');
  });

  it('does not reload again when the guard is already set (no loop)', async () => {
    window.sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1');
    await settle(() => Promise.reject(new Error('ChunkLoadError')));
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not reload on an unrelated (non-chunk) error', async () => {
    await settle(() => Promise.reject(new Error('TypeError: something else')));
    expect(reload).not.toHaveBeenCalled();
  });

  it('clears the guard after a successful load', async () => {
    window.sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1');
    await settle(() => Promise.resolve({ default: () => null }));
    expect(window.sessionStorage.getItem(CHUNK_RELOAD_FLAG)).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });
});
