import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_STATE } from '../../game/defaultState.js';
import { findItem } from '../../game/items.js';
import { DAILY_REWARDS, todayDateStr } from '../../services/devotion.js';
import { usePlayerActions } from './usePlayerActions.js';

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

// Local YYYY-MM-DD `n` days before today — mirrors devotion.todayDateStr's
// local-date math so the gap-based streak logic isn't tripped by UTC drift.
const daysAgoStr = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('usePlayerActions — devotion claim (Phase-30 QA gap)', () => {
  it('a fresh claim grants the cycleDay-1 reward, stamps today, and bumps the streak', () => {
    // No prior claim → willStreak 1, cycleDay 1 → DAILY_REWARDS[0].
    const reward = DAILY_REWARDS[0];
    const { result } = makeHook({
      gold: 0,
      xp: 0,
      totalXp: 0,
      devotion: 0,
      loginStreak: 0,
      lastClaimedDate: null,
      lastClaimedAt: null,
    });

    let res;
    act(() => {
      res = result.current.actions.claimDailyReward();
    });

    expect(res.ok).toBe(true);
    expect(res.reward).toBe(reward);
    const s = result.current.playerState;
    expect(s.gold).toBe(reward.gold);
    expect(s.xp).toBe(reward.xp);
    expect(s.totalXp).toBe(reward.xp);
    expect(s.devotion).toBe(reward.devotion);
    expect(s.lastClaimedDate).toBe(todayDateStr());
    expect(typeof s.lastClaimedAt).toBe('number');
    expect(s.loginStreak).toBe(1);
    expect(s.cycleDay).toBe(1);
    // Day-1 reward grants no items, so inventory stays empty.
    expect(Object.keys(s.inventory || {})).toHaveLength(0);
  });

  it('grants the items on an item-bearing cycle day (continuing streak)', () => {
    // lastClaimed yesterday, streak 1 → willStreak 2, cycleDay 2 → DAILY_REWARDS[1]
    // which grants { minor_heal_tonic: 1 }.
    const reward = DAILY_REWARDS[1];
    expect(reward.items.length).toBeGreaterThan(0);
    const { result } = makeHook({
      gold: 0,
      loginStreak: 1,
      lastClaimedDate: daysAgoStr(1),
      lastClaimedAt: Date.now() - 86_400_000,
    });

    let res;
    act(() => {
      res = result.current.actions.claimDailyReward();
    });

    expect(res.ok).toBe(true);
    const s = result.current.playerState;
    expect(s.loginStreak).toBe(2);
    expect(s.cycleDay).toBe(2);
    reward.items.forEach(({ id, n }) => {
      expect(s.inventory[id]).toBe(n);
    });
  });

  it('a claim after a gap > 1 day resets the login streak to 1', () => {
    const { result } = makeHook({
      loginStreak: 5,
      lastClaimedDate: daysAgoStr(3), // 3-day gap
      lastClaimedAt: Date.now() - 3 * 86_400_000,
    });

    let res;
    act(() => {
      res = result.current.actions.claimDailyReward();
    });

    expect(res.ok).toBe(true);
    expect(result.current.playerState.loginStreak).toBe(1);
    expect(result.current.playerState.cycleDay).toBe(1);
  });
});

describe('usePlayerActions — ascension + celestial spend (Phase-30 QA gap)', () => {
  it('ascend() below level 50 is a no-op { ok: false } with state unchanged', () => {
    const { result } = makeHook({ level: 49, gold: 500, ascensions: 0, ascensionTokens: 0 });

    let res;
    act(() => {
      res = result.current.actions.ascend();
    });

    expect(res.ok).toBe(false);
    const s = result.current.playerState;
    expect(s.level).toBe(49);
    expect(s.gold).toBe(500);
    expect(s.ascensions).toBe(0);
    expect(s.ascensionTokens).toBe(0);
  });

  it('ascend() at level >= 50 grants a token, resets level/xp/gold, keeps ingredients + identity', () => {
    const { result } = makeHook({
      level: 50,
      xp: 40,
      gold: 999,
      // ember_ash is an ingredient (kept); minor_heal_tonic is apothecary (wiped).
      inventory: { ember_ash: 3, minor_heal_tonic: 2 },
      ascensions: 1,
      ascensionTokens: 0,
      achievements: ['first_tome'],
      unlockedTitles: ['Novice'],
      bestiary: { skeleton: { defeats: 2, firstDefeatedAt: 'x' } },
      pets: { wise_owl: { xp: 50, hatchedAt: 'y' } },
      spellbook: { glyph_of_mending: { learnedAt: 'z' } },
    });

    let res;
    act(() => {
      res = result.current.actions.ascend();
    });

    expect(res.ok).toBe(true);
    const s = result.current.playerState;
    expect(s.ascensions).toBe(2);
    expect(s.ascensionTokens).toBe(1);
    expect(s.level).toBe(1);
    expect(s.xp).toBe(0);
    expect(s.gold).toBe(0);
    // Inventory keeps only ingredient-category stacks.
    expect(s.inventory).toEqual({ ember_ash: 3 });
    // Identity survives ascension.
    expect(s.achievements).toEqual(['first_tome']);
    expect(s.unlockedTitles).toEqual(['Novice']);
    expect(s.bestiary).toEqual({ skeleton: { defeats: 2, firstDefeatedAt: 'x' } });
    expect(s.pets).toEqual({ wise_owl: { xp: 50, hatchedAt: 'y' } });
    expect(s.spellbook).toEqual({ glyph_of_mending: { learnedAt: 'z' } });
  });

  it('purchaseItem(celestial) with 0 tokens is rejected', () => {
    const { result } = makeHook({ ascensionTokens: 0, gold: 9999 });

    let res;
    act(() => {
      res = result.current.actions.purchaseItem('celestial_xp_font');
    });

    expect(res.ok).toBe(false);
    expect(result.current.playerState.ascensionTokens).toBe(0);
    expect(result.current.playerState.permUpgrades.ascXpPct).toBeUndefined();
  });

  it('purchaseItem(celestial) with a token decrements the token (gold untouched) and applies the perm upgrade', () => {
    const item = findItem('celestial_xp_font'); // ascensionPrice 1, permKey ascXpPct, step 25
    const { result } = makeHook({ ascensionTokens: 1, gold: 777, permUpgrades: {} });

    let res;
    act(() => {
      res = result.current.actions.purchaseItem('celestial_xp_font');
    });

    expect(res.ok).toBe(true);
    const s = result.current.playerState;
    expect(s.ascensionTokens).toBe(0); // 1 - 1
    expect(s.gold).toBe(777); // gold is NOT spent on celestial wares
    expect(s.permUpgrades[item.permKey]).toBe(item.step || 1); // +25
    expect(s.inventory.celestial_xp_font).toBe(1);
  });

  // I7 fix (scholar-resolver): sanctumCount now covers devotion + celestial,
  // so purchaseItem enforces the documented cap for celestial wares
  // (sanctumAtCap is true at cap, so the purchase is rejected).
  it('purchaseItem(celestial) enforces the documented cap', () => {
    const item = findItem('celestial_revive'); // ascensionPrice 4, permKey ascAutoRevive, cap 1
    const { result } = makeHook({
      ascensionTokens: 10,
      permUpgrades: { [item.permKey]: 1 }, // already at the documented cap of 1
    });

    let res;
    act(() => {
      res = result.current.actions.purchaseItem('celestial_revive');
    });

    // Cap enforced: purchase rejected, no token spent, counter unchanged.
    expect(res.ok).toBe(false);
    expect(result.current.playerState.ascensionTokens).toBe(10);
    expect(result.current.playerState.permUpgrades[item.permKey]).toBe(1);
  });
});

describe('usePlayerActions — stable + bestiary (Phase-30 QA gap)', () => {
  it('purchaseItem(<egg>) with enough gold deducts gold, adds inventory, and auto-hatches the pet at xp 0', () => {
    const egg = findItem('wise_owl_egg'); // price 300, petId wise_owl, oneTime
    const { result } = makeHook({ gold: 400, pets: {}, inventory: {} });

    let res;
    act(() => {
      res = result.current.actions.purchaseItem('wise_owl_egg');
    });

    expect(res.ok).toBe(true);
    const s = result.current.playerState;
    expect(s.gold).toBe(400 - egg.price);
    expect(s.inventory.wise_owl_egg).toBe(1);
    expect(s.pets.wise_owl).toBeTruthy();
    expect(s.pets.wise_owl.xp).toBe(0);
    expect(typeof s.pets.wise_owl.hatchedAt).toBe('string');
  });

  it('a second egg purchase is rejected (oneTime)', () => {
    const { result } = makeHook({
      gold: 1000,
      inventory: { wise_owl_egg: 1 },
      pets: { wise_owl: { xp: 0, hatchedAt: 'h' } },
    });

    let res;
    act(() => {
      res = result.current.actions.purchaseItem('wise_owl_egg');
    });

    expect(res.ok).toBe(false);
    expect(result.current.playerState.inventory.wise_owl_egg).toBe(1); // unchanged
  });

  it('equipPet / unequipPet toggle equipped.pet', () => {
    const { result } = makeHook({ pets: { wise_owl: { xp: 0, hatchedAt: 'h' } } });

    act(() => {
      result.current.actions.equipPet('wise_owl');
    });
    expect(result.current.playerState.equipped.pet).toBe('wise_owl');

    act(() => {
      result.current.actions.unequipPet();
    });
    expect(result.current.playerState.equipped.pet).toBeNull();
  });

  it('recordBestiary increments defeats and fixes firstDefeatedAt on the first defeat', () => {
    const { result } = makeHook();

    act(() => {
      result.current.actions.recordBestiary('skeleton');
    });
    const first = result.current.playerState.bestiary.skeleton;
    expect(first.defeats).toBe(1);
    expect(typeof first.firstDefeatedAt).toBe('string');
    const firstStamp = first.firstDefeatedAt;

    act(() => {
      result.current.actions.recordBestiary('skeleton');
    });
    const second = result.current.playerState.bestiary.skeleton;
    expect(second.defeats).toBe(2);
    expect(second.firstDefeatedAt).toBe(firstStamp); // unchanged on repeat
  });
});

describe('usePlayerActions — tome deletion (Phase-30 QA gap)', () => {
  const lib3 = () => [
    { id: 't1', data: { metadata: { title: 'One' } }, progress: {} },
    { id: 't2', data: { metadata: { title: 'Two' } }, progress: {} },
    { id: 't3', data: { metadata: { title: 'Three' } }, progress: {} },
  ];

  it('deleting a non-active tome leaves activeTomeId untouched', () => {
    const { result } = makeHook({ library: lib3(), activeTomeId: 't1' });

    act(() => {
      result.current.actions.deleteTome('t2');
    });

    const s = result.current.playerState;
    expect(s.library.map((t) => t.id)).toEqual(['t1', 't3']);
    expect(s.activeTomeId).toBe('t1');
  });

  it('deleting the active tome re-points to the first remaining id', () => {
    const { result } = makeHook({ library: lib3(), activeTomeId: 't1' });

    act(() => {
      result.current.actions.deleteTome('t1');
    });

    const s = result.current.playerState;
    expect(s.library.map((t) => t.id)).toEqual(['t2', 't3']);
    expect(s.activeTomeId).toBe('t2'); // first remaining
  });

  it('deleting the last tome sets activeTomeId to null', () => {
    const { result } = makeHook({
      library: [{ id: 't1', data: { metadata: { title: 'One' } }, progress: {} }],
      activeTomeId: 't1',
    });

    act(() => {
      result.current.actions.deleteTome('t1');
    });

    const s = result.current.playerState;
    expect(s.library).toHaveLength(0);
    expect(s.activeTomeId).toBeNull();
  });
});

describe('usePlayerActions — streak tracking (I2)', () => {
  it('recordAnswer builds currentStreak on correct and resets on wrong', () => {
    const { result } = makeHook();
    act(() => {
      result.current.actions.recordAnswer(true, { id: 'q1' });
    });
    act(() => {
      result.current.actions.recordAnswer(true, { id: 'q2' });
    });
    expect(result.current.playerState.currentStreak).toBe(2);
    expect(result.current.playerState.maxStreakToday).toBe(2);
    expect(result.current.playerState.maxStreakWeek).toBe(2);
    act(() => {
      result.current.actions.recordAnswer(false, { id: 'q3' });
    });
    expect(result.current.playerState.currentStreak).toBe(0);
    // window maxima retain the best reached
    expect(result.current.playerState.maxStreakToday).toBe(2);
    expect(result.current.playerState.longestStreak).toBe(2);
  });
});
