import { describe, it, expect, vi, afterEach } from 'vitest';
import { isDifficultyUnlocked, rollBoss, BOSS_ORDER } from './difficulty.js';

const lib = (runs) => ({ library: [{ progress: { runsCompleted: runs } }] });

describe('isDifficultyUnlocked', () => {
  it('apprentice is always unlocked', () => {
    expect(isDifficultyUnlocked({}, 'apprentice')).toBe(true);
  });
  it('adept unlocks via level 10 OR 5 completed runs', () => {
    expect(isDifficultyUnlocked({ level: 10 }, 'adept')).toBe(true);
    expect(isDifficultyUnlocked({ level: 1, ...lib(5) }, 'adept')).toBe(true);
    expect(isDifficultyUnlocked({ level: 1, ...lib(4) }, 'adept')).toBe(false);
  });
  it('master unlocks via level 25 OR (flawless + first_boss)', () => {
    expect(isDifficultyUnlocked({ level: 25 }, 'master')).toBe(true);
    expect(isDifficultyUnlocked({ level: 1, achievements: ['flawless', 'first_boss'] }, 'master')).toBe(true);
    expect(isDifficultyUnlocked({ level: 1, achievements: ['flawless'] }, 'master')).toBe(false);
  });
  it('mythic unlocks via level 50 OR master_complete', () => {
    expect(isDifficultyUnlocked({ level: 50 }, 'mythic')).toBe(true);
    expect(isDifficultyUnlocked({ level: 1, achievements: ['master_complete'] }, 'mythic')).toBe(true);
    expect(isDifficultyUnlocked({ level: 1 }, 'mythic')).toBe(false);
  });
  it('returns false for an unknown difficulty', () => {
    expect(isDifficultyUnlocked({ level: 99 }, 'nope')).toBe(false);
  });
});

describe('rollBoss', () => {
  afterEach(() => vi.restoreAllMocks());
  it('always returns a member of BOSS_ORDER', () => {
    for (let i = 0; i < 50; i++) expect(BOSS_ORDER).toContain(rollBoss());
  });
  it('maps Math.random extremes to the first and last boss', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(rollBoss()).toBe(BOSS_ORDER[0]);
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    expect(rollBoss()).toBe(BOSS_ORDER[BOSS_ORDER.length - 1]);
  });
});
