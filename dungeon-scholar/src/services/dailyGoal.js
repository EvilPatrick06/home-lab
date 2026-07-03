// Daily study goal + streak-freeze (sugg-daily-goal).
//
// The app tracks a per-answer correctness streak and a devotion/daily login
// streak, but has no configurable daily STUDY target (N items a day) and no
// streak-protection mechanic. These pure helpers add a configurable daily goal
// (default 20) + today's progress, and a distinct streak-freeze token count
// that forgives one missed day. Pure + date-injectable so they are unit-
// testable. Progress is { date, count } on playerState.dailyProgress.

export const DAILY_GOAL_DEFAULT = 20;
export const DAILY_GOAL_MIN = 1;
export const DAILY_GOAL_MAX = 500;

export function normalizeDailyGoal(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return DAILY_GOAL_DEFAULT;
  return Math.min(DAILY_GOAL_MAX, Math.max(DAILY_GOAL_MIN, Math.floor(v)));
}

export function todaysProgress(dailyProgress, today) {
  const dp = dailyProgress && typeof dailyProgress === 'object' ? dailyProgress : null;
  if (!dp || dp.date !== today) return { date: today, count: 0 };
  return { date: today, count: Math.max(0, Math.floor(Number(dp.count) || 0)) };
}

export function recordDailyProgress(dailyProgress, today, n = 1) {
  const cur = todaysProgress(dailyProgress, today);
  const inc = Math.max(0, Math.floor(Number(n) || 0));
  return { date: today, count: cur.count + inc };
}

export function goalStatus(dailyProgress, today, goal) {
  const target = normalizeDailyGoal(goal);
  const { count } = todaysProgress(dailyProgress, today);
  return {
    goal: target,
    count,
    remaining: Math.max(0, target - count),
    met: count >= target,
    fraction: target > 0 ? Math.min(1, count / target) : 1,
  };
}

export const STREAK_FREEZE_MAX = 3;

export function normalizeFreezeTokens(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.min(STREAK_FREEZE_MAX, Math.floor(v));
}

export function daysBetween(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return null;
  const da = Date.parse(a + 'T00:00:00Z');
  const db = Date.parse(b + 'T00:00:00Z');
  if (Number.isNaN(da) || Number.isNaN(db)) return null;
  return Math.round((db - da) / 86400000);
}

// On a new study day, decide whether a lapsed streak is forgiven by spending a
// freeze token. Gap 1 (studied yesterday) = continuous. Gap 2 (missed one day)
// = forgiven if a token is available. Larger gap = broken. Pure.
export function evaluateStreakFreeze(lastStudyDate, today, freezeTokens) {
  const tokens = normalizeFreezeTokens(freezeTokens);
  const gap = daysBetween(lastStudyDate, today);
  if (gap == null || gap <= 0) return { continuous: true, forgiven: false, tokensLeft: tokens, broken: false };
  if (gap === 1) return { continuous: true, forgiven: false, tokensLeft: tokens, broken: false };
  if (gap === 2 && tokens > 0) return { continuous: false, forgiven: true, tokensLeft: tokens - 1, broken: false };
  return { continuous: false, forgiven: false, tokensLeft: tokens, broken: true };
}
