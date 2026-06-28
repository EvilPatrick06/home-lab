import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAppSurfaces } from './useAppSurfaces.js';

describe('useAppSurfaces', () => {
  it('initializes the surface cluster to closed / empty defaults', () => {
    const { result } = renderHook(() => useAppSurfaces());
    expect(result.current.pendingConfirm).toBeNull();
    expect(result.current.tutorialOpenedSurface).toBeNull();
    expect(result.current.shareTomeId).toBeNull();
    expect(result.current.editMetadataTomeId).toBeNull();
    expect(result.current.editContentTomeId).toBeNull();
    expect(result.current.notesTome).toBeNull();
    expect(result.current.unsealedTomes).toEqual({});
    expect(result.current.domainFilter).toBeNull();
    expect(result.current.reviewMode).toBe(false);
  });

  it('exposes independent working setters', () => {
    const { result } = renderHook(() => useAppSurfaces());
    act(() => {
      result.current.setReviewMode(true);
      result.current.setShareTomeId('t1');
      result.current.setUnsealedTomes({ t1: { flashcards: [] } });
    });
    expect(result.current.reviewMode).toBe(true);
    expect(result.current.shareTomeId).toBe('t1');
    expect(result.current.unsealedTomes).toEqual({ t1: { flashcards: [] } });
    // unrelated surfaces stay at their defaults
    expect(result.current.notesTome).toBeNull();
    expect(result.current.domainFilter).toBeNull();
  });
});
