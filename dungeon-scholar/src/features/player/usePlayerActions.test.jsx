import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { renderHook, act } from '@testing-library/react';
import { usePlayerActions } from './usePlayerActions.js';
import { DEFAULT_STATE } from '../../game/defaultState.js';

// Harness: own a useState(DEFAULT_STATE) wired into the hook as
// { playerState, setPlayerState }, plus a vi.fn() showNotif. `seed` lets a
// test pre-populate the player state (e.g. gold) before the hook reads it.
// Returning both the action map and the live playerState lets assertions read
// post-`act()` state once React has re-rendered the harness.
function makeHook(seed = {}) {
  const showNotif = vi.fn();
  const { result, rerender } = renderHook(() => {
    const [playerState, setPlayerState] = useState({ ...DEFAULT_STATE, ...seed });
    const actions = usePlayerActions({ playerState, setPlayerState, showNotif, user: null });
    return { playerState, setPlayerState, actions, showNotif };
  });
  return { result, rerender };
}

const VALID_TOME = {
  metadata: { title: 'Test Tome', subject: 'Testing' },
  flashcards: [{ id: 'c1', front: 'Q', back: 'A' }],
  quiz: [],
  labs: [],
};

describe('usePlayerActions', () => {
  it('awardXP raises xp and totalXp', () => {
    const { result } = makeHook();
    expect(result.current.playerState.xp).toBe(0);
    expect(result.current.playerState.totalXp).toBe(0);

    // Award below xpForLevel(1)=100 so the level-up loop in updateProgress
    // doesn't consume the gain — both xp and totalXp should rise.
    act(() => {
      result.current.actions.awardXP(50, 'test');
    });

    expect(result.current.playerState.xp).toBeGreaterThan(0);
    expect(result.current.playerState.totalXp).toBe(50);
  });

  it('awardXP past the level threshold rolls into a level-up (totalXp still rises)', () => {
    const { result } = makeHook();

    act(() => {
      result.current.actions.awardXP(100, 'test'); // xpForLevel(1) === 100
    });

    // 100 XP exactly clears level 1: xp carries to 0, level advances, and the
    // lifetime totalXp counter still reflects the full gain.
    expect(result.current.playerState.totalXp).toBe(100);
    expect(result.current.playerState.level).toBeGreaterThan(1);
  });

  it('purchaseItem deducts gold and adds to inventory when affordable', () => {
    // ember_ash costs 25 gold (cheapest ingredient ware).
    const { result } = makeHook({ gold: 100 });

    let res;
    act(() => {
      res = result.current.actions.purchaseItem('ember_ash');
    });

    expect(res.ok).toBe(true);
    expect(result.current.playerState.gold).toBe(75); // 100 - 25
    expect(result.current.playerState.inventory.ember_ash).toBe(1);
  });

  it('purchaseItem rejects (no deduction) when gold is insufficient', () => {
    const { result } = makeHook({ gold: 5 }); // cannot afford the 25-gold ware

    let res;
    act(() => {
      res = result.current.actions.purchaseItem('ember_ash');
    });

    expect(res.ok).toBe(false);
    expect(result.current.playerState.gold).toBe(5); // unchanged
    expect(result.current.playerState.inventory.ember_ash).toBeUndefined();
  });

  it('addTomeToLibrary on an empty library activates the new tome', () => {
    // Phase 39F note: switchActiveTome stays in App (coupled to setScreen, an
    // App-local state setter — not a hook arg), so it is NOT returned by the
    // hook. addTomeToLibrary's auto-activation is the hook-level "switch the
    // active tome" path: with no active tome, the freshly inscribed tome
    // becomes activeTomeId.
    const { result } = makeHook();
    expect(result.current.playerState.activeTomeId).toBeNull();
    expect(result.current.playerState.library).toHaveLength(0);

    let added;
    act(() => {
      added = result.current.actions.addTomeToLibrary(VALID_TOME);
    });

    expect(added).toBe(true);
    expect(result.current.playerState.library).toHaveLength(1);
    const newId = result.current.playerState.library[0].id;
    expect(result.current.playerState.activeTomeId).toBe(newId);
  });

  it('claimDailyReward twice on the same day rejects the second claim', () => {
    const { result } = makeHook();

    let first;
    act(() => {
      first = result.current.actions.claimDailyReward();
    });
    expect(first.ok).toBe(true);
    const goldAfterFirst = result.current.playerState.gold;

    let second;
    act(() => {
      second = result.current.actions.claimDailyReward();
    });
    expect(second.ok).toBe(false);
    // No second reward granted — gold is unchanged from the first claim.
    expect(result.current.playerState.gold).toBe(goldAfterFirst);
  });
});
