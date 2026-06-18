import { describe, it, expect } from 'vitest';
import { DAILY_QUEST_POOL, WEEKLY_QUEST_POOL, pickDailyQuests, pickWeeklyQuests, currentWeekStartStr } from './quests.js';

describe('pickDailyQuests (PHASE-39 39A)', () => {
  it('is deterministic for a fixed date', () => {
    const a = pickDailyQuests('2026-06-17');
    const b = pickDailyQuests('2026-06-17');
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
  });

  it('returns n unique entries drawn from the pool', () => {
    const picked = pickDailyQuests('2026-06-17', 3);
    expect(picked).toHaveLength(3);
    const ids = picked.map((q) => q.id);
    expect(new Set(ids).size).toBe(3);
    const poolIds = new Set(DAILY_QUEST_POOL.map((q) => q.id));
    for (const id of ids) expect(poolIds.has(id)).toBe(true);
  });

  it('different dates can yield different sets', () => {
    const days = ['2026-06-17', '2026-06-18', '2026-06-19', '2026-06-20'].map((d) =>
      pickDailyQuests(d).map((q) => q.id).join(',')
    );
    expect(new Set(days).size).toBeGreaterThan(1);
  });
});

describe('pickWeeklyQuests / currentWeekStartStr (PHASE-39 39A)', () => {
  it('weekly picks are deterministic and drawn from the weekly pool', () => {
    const a = pickWeeklyQuests('2026-06-15');
    const b = pickWeeklyQuests('2026-06-15');
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
    const poolIds = new Set(WEEKLY_QUEST_POOL.map((q) => q.id));
    for (const q of a) expect(poolIds.has(q.id)).toBe(true);
  });

  it('currentWeekStartStr returns a YYYY-MM-DD string', () => {
    expect(currentWeekStartStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
