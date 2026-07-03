import { describe, expect, it } from 'vitest';
import {
  DAILY_GOAL_DEFAULT,
  daysBetween,
  evaluateStreakFreeze,
  goalStatus,
  normalizeDailyGoal,
  normalizeFreezeTokens,
  recordDailyProgress,
  STREAK_FREEZE_MAX,
  todaysProgress,
} from './dailyGoal.js';

describe('normalizeDailyGoal', () => {
  it('defaults and clamps', () => {
    expect(normalizeDailyGoal(undefined)).toBe(DAILY_GOAL_DEFAULT);
    expect(normalizeDailyGoal(Number.NaN)).toBe(DAILY_GOAL_DEFAULT);
    expect(normalizeDailyGoal(0)).toBe(1);
    expect(normalizeDailyGoal(9999)).toBe(500);
    expect(normalizeDailyGoal(30)).toBe(30);
  });
});

describe('todaysProgress / recordDailyProgress', () => {
  it('rolls over on a new day', () => {
    expect(todaysProgress({ date: '2026-07-01', count: 5 }, '2026-07-02')).toEqual({ date: '2026-07-02', count: 0 });
  });
  it('keeps same-day count', () => {
    expect(todaysProgress({ date: '2026-07-02', count: 5 }, '2026-07-02')).toEqual({ date: '2026-07-02', count: 5 });
  });
  it('increments and resets across days', () => {
    let dp = recordDailyProgress(null, '2026-07-02', 3);
    expect(dp).toEqual({ date: '2026-07-02', count: 3 });
    dp = recordDailyProgress(dp, '2026-07-02', 2);
    expect(dp.count).toBe(5);
    dp = recordDailyProgress(dp, '2026-07-03', 1);
    expect(dp).toEqual({ date: '2026-07-03', count: 1 });
  });
});

describe('goalStatus', () => {
  it('reports fraction, remaining, met', () => {
    const s = goalStatus({ date: 'D', count: 12 }, 'D', 20);
    expect(s).toMatchObject({ goal: 20, count: 12, remaining: 8, met: false });
    expect(s.fraction).toBeCloseTo(0.6);
  });
  it('caps fraction at 1 when met', () => {
    const s = goalStatus({ date: 'D', count: 25 }, 'D', 20);
    expect(s.met).toBe(true);
    expect(s.fraction).toBe(1);
    expect(s.remaining).toBe(0);
  });
});

describe('daysBetween', () => {
  it('computes calendar-day deltas', () => {
    expect(daysBetween('2026-07-01', '2026-07-02')).toBe(1);
    expect(daysBetween('2026-07-01', '2026-07-04')).toBe(3);
    expect(daysBetween('2026-07-01', '2026-07-01')).toBe(0);
  });
  it('returns null for bad input', () => {
    expect(daysBetween(null, '2026-07-01')).toBe(null);
    expect(daysBetween('x', 'y')).toBe(null);
  });
});

describe('streak freeze', () => {
  it('normalizeFreezeTokens clamps to [0, MAX]', () => {
    expect(normalizeFreezeTokens(-1)).toBe(0);
    expect(normalizeFreezeTokens(99)).toBe(STREAK_FREEZE_MAX);
    expect(normalizeFreezeTokens(2)).toBe(2);
  });
  it('gap of 1 day is continuous, no token spent', () => {
    expect(evaluateStreakFreeze('2026-07-01', '2026-07-02', 2)).toEqual({
      continuous: true,
      forgiven: false,
      tokensLeft: 2,
      broken: false,
    });
  });
  it('gap of 2 days is forgiven when a token is available', () => {
    expect(evaluateStreakFreeze('2026-07-01', '2026-07-03', 2)).toEqual({
      continuous: false,
      forgiven: true,
      tokensLeft: 1,
      broken: false,
    });
  });
  it('gap of 2 days with no tokens breaks the streak', () => {
    expect(evaluateStreakFreeze('2026-07-01', '2026-07-03', 0)).toEqual({
      continuous: false,
      forgiven: false,
      tokensLeft: 0,
      broken: true,
    });
  });
  it('gap of 3+ days cannot be saved by one token', () => {
    const r = evaluateStreakFreeze('2026-07-01', '2026-07-05', 3);
    expect(r.broken).toBe(true);
    expect(r.forgiven).toBe(false);
    expect(r.tokensLeft).toBe(3);
  });
});
