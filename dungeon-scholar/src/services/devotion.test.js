import { describe, it, expect } from 'vitest';
import {
  DAILY_REWARDS,
  todayDateStr,
  dayDiff,
  computeNextClaim,
  evaluateClaim,
  CLOCK_SKEW_LIMIT_MS,
} from './devotion.js';

describe('DAILY_REWARDS table', () => {
  it('has exactly 7 days, indexed 1..7', () => {
    expect(DAILY_REWARDS).toHaveLength(7);
    DAILY_REWARDS.forEach((reward, idx) => {
      expect(reward.day).toBe(idx + 1);
    });
  });

  it('every day declares gold/xp/devotion as numbers and items as an array', () => {
    DAILY_REWARDS.forEach((r) => {
      expect(typeof r.gold).toBe('number');
      expect(typeof r.xp).toBe('number');
      expect(typeof r.devotion).toBe('number');
      expect(Array.isArray(r.items)).toBe(true);
      expect(r.label).toBeTruthy();
    });
  });

  it('rewards scale up across the cycle (gold + xp non-decreasing)', () => {
    for (let i = 1; i < DAILY_REWARDS.length; i++) {
      expect(DAILY_REWARDS[i].gold).toBeGreaterThanOrEqual(DAILY_REWARDS[i - 1].gold);
      expect(DAILY_REWARDS[i].xp).toBeGreaterThanOrEqual(DAILY_REWARDS[i - 1].xp);
    }
  });

  it('day 7 is the capstone', () => {
    expect(DAILY_REWARDS[6].capstone).toBe(true);
  });
});

describe('todayDateStr', () => {
  it('returns a YYYY-MM-DD string for today', () => {
    const result = todayDateStr();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const parsed = new Date(`${result}T00:00:00`);
    const now = new Date();
    // Same calendar date locally.
    expect(parsed.getFullYear()).toBe(now.getFullYear());
    expect(parsed.getMonth()).toBe(now.getMonth());
    expect(parsed.getDate()).toBe(now.getDate());
  });
});

describe('dayDiff', () => {
  it('returns 0 for the same date', () => {
    expect(dayDiff('2026-05-05', '2026-05-05')).toBe(0);
  });

  it('returns 1 for consecutive days', () => {
    expect(dayDiff('2026-05-05', '2026-05-06')).toBe(1);
  });

  it('returns negative for backwards dates', () => {
    expect(dayDiff('2026-05-06', '2026-05-05')).toBe(-1);
  });

  it('handles month boundaries', () => {
    expect(dayDiff('2026-04-30', '2026-05-01')).toBe(1);
  });

  it('handles year boundaries', () => {
    expect(dayDiff('2026-12-31', '2027-01-01')).toBe(1);
  });

  it('returns Infinity when either argument is falsy', () => {
    expect(dayDiff(null, '2026-05-05')).toBe(Infinity);
    expect(dayDiff('2026-05-05', null)).toBe(Infinity);
    expect(dayDiff('', '2026-05-05')).toBe(Infinity);
  });
});

describe('computeNextClaim', () => {
  it('first-ever claim → cycleDay 1, willStreak 1', () => {
    expect(computeNextClaim('2026-05-05', null, 0)).toEqual({
      claimedToday: false, willStreak: 1, cycleDay: 1,
    });
  });

  it('continuing a streak (gap = 1 day) → streak + 1', () => {
    expect(computeNextClaim('2026-05-06', '2026-05-05', 3)).toEqual({
      claimedToday: false, willStreak: 4, cycleDay: 4,
    });
  });

  it('broken streak (gap > 1) → reset to streak 1', () => {
    expect(computeNextClaim('2026-05-08', '2026-05-05', 3)).toEqual({
      claimedToday: false, willStreak: 1, cycleDay: 1,
    });
  });

  it('cycles back to day 1 after day 7', () => {
    expect(computeNextClaim('2026-05-08', '2026-05-07', 7)).toEqual({
      claimedToday: false, willStreak: 8, cycleDay: 1,
    });
  });

  it('already claimed today → reflects current cycleDay, willStreak unchanged', () => {
    expect(computeNextClaim('2026-05-05', '2026-05-05', 5)).toEqual({
      claimedToday: true, willStreak: 5, cycleDay: 5,
    });
  });
});

describe('evaluateClaim (M13 monotone fence)', () => {
  const NOW = 1_700_000_000_000; // arbitrary fixed epoch ms

  it('refuses a same-day double claim', () => {
    const res = evaluateClaim({ now: NOW, today: '2026-05-07', lastClaimedDate: '2026-05-07', lastClaimedAt: NOW - 1000, loginStreak: 3 });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/already claimed/i);
  });

  it('allows a normal next-day claim (streak +1)', () => {
    const res = evaluateClaim({ now: NOW, today: '2026-05-08', lastClaimedDate: '2026-05-07', lastClaimedAt: NOW - 86_400_000, loginStreak: 3 });
    expect(res).toEqual({ ok: true, newStreak: 4, cycleDay: 4 });
  });

  it('resets the streak to 1 on a gap greater than one day', () => {
    const res = evaluateClaim({ now: NOW, today: '2026-05-10', lastClaimedDate: '2026-05-07', lastClaimedAt: NOW - 3 * 86_400_000, loginStreak: 5 });
    expect(res).toEqual({ ok: true, newStreak: 1, cycleDay: 1 });
  });

  it('refuses a clock rollback within 48h (the cross-midnight double-claim)', () => {
    // Claimed on 05-07 at NOW; user rolls the clock back to 05-06, one hour earlier.
    const res = evaluateClaim({ now: NOW - 3_600_000, today: '2026-05-06', lastClaimedDate: '2026-05-07', lastClaimedAt: NOW, loginStreak: 4 });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/backward|hourglass/i);
  });

  it('self-heals a corrupt future fence (≥48h ahead) instead of locking', () => {
    // lastClaimedAt is 72h in the future (bad import); fence does not trigger.
    const res = evaluateClaim({ now: NOW, today: '2026-05-08', lastClaimedDate: '2026-05-06', lastClaimedAt: NOW + 72 * 3_600_000, loginStreak: 9 });
    expect(res.ok).toBe(true);
    expect(res.newStreak).toBe(1); // gap 2 → reset
    expect(72 * 3_600_000).toBeGreaterThanOrEqual(CLOCK_SKEW_LIMIT_MS);
  });

  it('claims normally for a legacy save with no lastClaimedAt fence', () => {
    const res = evaluateClaim({ now: NOW, today: '2026-05-08', lastClaimedDate: '2026-05-07', lastClaimedAt: undefined, loginStreak: 2 });
    expect(res).toEqual({ ok: true, newStreak: 3, cycleDay: 3 });
  });

  it('produces the same cycleDay as the calendar preview (computeNextClaim parity)', () => {
    const today = '2026-05-08', last = '2026-05-07', streak = 6;
    const res = evaluateClaim({ now: NOW, today, lastClaimedDate: last, lastClaimedAt: NOW - 86_400_000, loginStreak: streak });
    expect(res.cycleDay).toBe(computeNextClaim(today, last, streak).cycleDay);
  });
});
