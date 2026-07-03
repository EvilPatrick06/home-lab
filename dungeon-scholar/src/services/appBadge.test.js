import { afterEach, describe, expect, it, vi } from 'vitest';
import { appBadgingSupported, clearDueBadge, updateDueBadge } from './appBadge.js';

describe('appBadge', () => {
  afterEach(() => {
    delete navigator.setAppBadge;
    delete navigator.clearAppBadge;
    vi.restoreAllMocks();
  });

  it('reports unsupported when the API is absent', () => {
    expect(appBadgingSupported()).toBe(false);
    // no-op returns false and does not throw
    expect(updateDueBadge(5)).toBe(false);
  });

  it('sets the badge to a positive due count', () => {
    const set = vi.fn(() => Promise.resolve());
    const clear = vi.fn(() => Promise.resolve());
    navigator.setAppBadge = set;
    navigator.clearAppBadge = clear;
    expect(appBadgingSupported()).toBe(true);
    expect(updateDueBadge(7)).toBe(true);
    expect(set).toHaveBeenCalledWith(7);
    expect(clear).not.toHaveBeenCalled();
  });

  it('clears the badge for zero / negative / non-finite counts', () => {
    const set = vi.fn(() => Promise.resolve());
    const clear = vi.fn(() => Promise.resolve());
    navigator.setAppBadge = set;
    navigator.clearAppBadge = clear;
    updateDueBadge(0);
    updateDueBadge(-3);
    updateDueBadge(Number.NaN);
    clearDueBadge();
    expect(clear).toHaveBeenCalledTimes(4);
    expect(set).not.toHaveBeenCalled();
  });

  it('swallows a rejected promise from setAppBadge', () => {
    navigator.setAppBadge = vi.fn(() => Promise.reject(new Error('denied')));
    expect(() => updateDueBadge(3)).not.toThrow();
    expect(updateDueBadge(3)).toBe(true);
  });
});
