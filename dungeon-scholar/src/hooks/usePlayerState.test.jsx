import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlayerState } from './usePlayerState.js';
import { STORAGE_KEY, loadFromLocalStorage } from '../services/persistence.js';

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
