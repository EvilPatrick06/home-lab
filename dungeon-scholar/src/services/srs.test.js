import { describe, it, expect } from 'vitest';
import {
  SRS_RATINGS,
  scheduleCard,
  isCardDue,
  dueCount,
  sortByDueness,
  filterDue,
  retrievability,
} from './srs.js';

const DAY = 86400000;

describe('SRS_RATINGS', () => {
  it('declares the four rating values 1..4', () => {
    expect(SRS_RATINGS.again).toBe(1);
    expect(SRS_RATINGS.hard).toBe(2);
    expect(SRS_RATINGS.good).toBe(3);
    expect(SRS_RATINGS.easy).toBe(4);
  });
});

describe('scheduleCard — first review of a new card', () => {
  it('seeds stability + difficulty per rating and sets dueAt one stability away', () => {
    const now = 1_000_000_000_000;
    const out = scheduleCard(null, SRS_RATINGS.good, now);
    expect(out.reps).toBe(1);
    expect(out.lapses).toBe(0);
    expect(out.stability).toBe(3);
    expect(out.difficulty).toBe(5);
    expect(out.lastReview).toBe(now);
    expect(out.dueAt).toBe(now + 3 * DAY);
  });

  it('records a lapse when the first rating is Again', () => {
    const out = scheduleCard(null, SRS_RATINGS.again, 0);
    expect(out.lapses).toBe(1);
    expect(out.stability).toBe(0.4);
    expect(out.difficulty).toBeCloseTo(7.5);
  });

  it('uses higher initial stability for Easy than Good than Hard', () => {
    const sHard = scheduleCard(null, SRS_RATINGS.hard, 0).stability;
    const sGood = scheduleCard(null, SRS_RATINGS.good, 0).stability;
    const sEasy = scheduleCard(null, SRS_RATINGS.easy, 0).stability;
    expect(sEasy).toBeGreaterThan(sGood);
    expect(sGood).toBeGreaterThan(sHard);
  });

  it('returns the prevState unchanged when given an invalid rating', () => {
    const prev = { stability: 2, difficulty: 5, reps: 3, lapses: 0, lastReview: 0, dueAt: 0 };
    expect(scheduleCard(prev, 0, 0)).toBe(prev);
    expect(scheduleCard(prev, 5, 0)).toBe(prev);
    expect(scheduleCard(prev, 'easy', 0)).toBe(prev);
  });

  it('returns null when prevState is new and rating is invalid', () => {
    expect(scheduleCard(null, 0, 0)).toBeNull();
  });
});

describe('scheduleCard — subsequent reviews', () => {
  const baseNew = (rating = SRS_RATINGS.good) => scheduleCard(null, rating, 0);

  it('Good roughly multiplies stability and keeps difficulty steady', () => {
    const s1 = baseNew(SRS_RATINGS.good);
    const s2 = scheduleCard(s1, SRS_RATINGS.good, s1.dueAt);
    expect(s2.reps).toBe(2);
    expect(s2.stability).toBeGreaterThan(s1.stability * 2); // ratingMult 2.5 × difficulty boost
    expect(s2.difficulty).toBe(s1.difficulty);
    expect(s2.lapses).toBe(s1.lapses);
  });

  it('Easy multiplies stability more than Good and reduces difficulty slightly', () => {
    const s1 = baseNew(SRS_RATINGS.good);
    const sGood = scheduleCard(s1, SRS_RATINGS.good, s1.dueAt);
    const sEasy = scheduleCard(s1, SRS_RATINGS.easy, s1.dueAt);
    expect(sEasy.stability).toBeGreaterThan(sGood.stability);
    expect(sEasy.difficulty).toBeLessThan(s1.difficulty);
  });

  it('Hard grows stability less than Good and nudges difficulty up', () => {
    const s1 = baseNew(SRS_RATINGS.good);
    const sGood = scheduleCard(s1, SRS_RATINGS.good, s1.dueAt);
    const sHard = scheduleCard(s1, SRS_RATINGS.hard, s1.dueAt);
    expect(sHard.stability).toBeLessThan(sGood.stability);
    expect(sHard.difficulty).toBeGreaterThan(s1.difficulty);
  });

  it('Again sharply reduces stability and bumps difficulty + lapses', () => {
    const s1 = baseNew(SRS_RATINGS.good);
    const sAgain = scheduleCard(s1, SRS_RATINGS.again, s1.dueAt);
    expect(sAgain.stability).toBeLessThan(s1.stability);
    expect(sAgain.stability).toBeCloseTo(s1.stability * 0.2);
    expect(sAgain.difficulty).toBeGreaterThan(s1.difficulty);
    expect(sAgain.lapses).toBe(1);
    expect(sAgain.reps).toBe(2);
  });

  it('clamps stability at S_MAX (5 years) and difficulty at D_MAX (10)', () => {
    let state = { stability: 4000, difficulty: 9.9, reps: 10, lapses: 0, lastReview: 0, dueAt: 0 };
    state = scheduleCard(state, SRS_RATINGS.easy, 5000 * DAY);
    expect(state.stability).toBeLessThanOrEqual(365 * 5);
    expect(state.difficulty).toBeLessThanOrEqual(10);
    expect(state.difficulty).toBeGreaterThanOrEqual(1);
  });

  it('clamps stability at S_MIN (0.1) on multiple lapses', () => {
    let state = scheduleCard(null, SRS_RATINGS.good, 0);
    state = scheduleCard(state, SRS_RATINGS.again, state.dueAt);
    state = scheduleCard(state, SRS_RATINGS.again, state.dueAt);
    state = scheduleCard(state, SRS_RATINGS.again, state.dueAt);
    expect(state.stability).toBeGreaterThanOrEqual(0.1);
    expect(state.lapses).toBe(3);
  });

  it('rewards overdueness with a small stability boost when Good is rated late', () => {
    const s1 = baseNew(SRS_RATINGS.good); // dueAt = 3 days
    const onTime = scheduleCard(s1, SRS_RATINGS.good, s1.dueAt);
    const overdue = scheduleCard(s1, SRS_RATINGS.good, s1.dueAt + 5 * DAY);
    expect(overdue.stability).toBeGreaterThan(onTime.stability);
  });
});

describe('isCardDue', () => {
  it('treats null/undefined/new-shaped state as due', () => {
    expect(isCardDue(undefined)).toBe(true);
    expect(isCardDue(null)).toBe(true);
    expect(isCardDue({})).toBe(true);
    expect(isCardDue({ stability: 1 })).toBe(true); // no reps yet
  });

  it('returns false when dueAt is in the future', () => {
    const state = { stability: 3, difficulty: 5, reps: 1, lapses: 0, lastReview: 0, dueAt: 1000 };
    expect(isCardDue(state, 500)).toBe(false);
  });

  it('returns true when dueAt is at or before now', () => {
    const state = { stability: 3, difficulty: 5, reps: 1, lapses: 0, lastReview: 0, dueAt: 500 };
    expect(isCardDue(state, 500)).toBe(true);
    expect(isCardDue(state, 600)).toBe(true);
  });

  it('returns true when dueAt is missing on a "completed" state', () => {
    const state = { stability: 3, difficulty: 5, reps: 1, lapses: 0, lastReview: 0 };
    expect(isCardDue(state)).toBe(true);
  });
});

describe('dueCount + filterDue', () => {
  const cards = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

  it('counts new cards as due', () => {
    expect(dueCount({}, cards)).toBe(4);
    expect(filterDue(cards, {}).map(c => c.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('skips cards whose dueAt is in the future', () => {
    const map = {
      a: { stability: 3, reps: 1, lastReview: 0, dueAt: 1000 },     // due past
      b: { stability: 3, reps: 1, lastReview: 0, dueAt: 5000 },     // future
    };
    expect(dueCount(map, cards, 2000)).toBe(3); // a + c + d (c/d new); not b
    expect(filterDue(cards, map, 2000).map(c => c.id)).toEqual(['a', 'c', 'd']);
  });

  it('skips entries lacking a string id', () => {
    const dirty = [{ id: 'x' }, null, {}, { id: 123 }];
    expect(dueCount({}, dirty)).toBe(1);
    expect(filterDue(dirty, {}).map(c => c.id)).toEqual(['x']);
  });
});

describe('sortByDueness', () => {
  it('places the most-overdue card first', () => {
    const cards = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const map = {
      a: { dueAt: 5000, stability: 3, reps: 1, lastReview: 0 },
      b: { dueAt: 1000, stability: 3, reps: 1, lastReview: 0 },
      c: { dueAt: 3000, stability: 3, reps: 1, lastReview: 0 },
    };
    const sorted = sortByDueness(cards, map);
    expect(sorted.map(c => c.id)).toEqual(['b', 'c', 'a']);
  });

  it('places new cards (missing dueAt) ahead of any scheduled card', () => {
    const cards = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const map = {
      a: { dueAt: 1000, stability: 3, reps: 1, lastReview: 0 },
      // b is new, no entry
      c: { dueAt: 500, stability: 3, reps: 1, lastReview: 0 },
    };
    const sorted = sortByDueness(cards, map);
    expect(sorted[0].id).toBe('b');
  });

  it('returns [] for non-array input', () => {
    expect(sortByDueness(null, {})).toEqual([]);
    expect(sortByDueness(undefined, {})).toEqual([]);
  });
});

describe('retrievability', () => {
  it('returns 0 for new cards', () => {
    expect(retrievability(null)).toBe(0);
    expect(retrievability({})).toBe(0);
  });

  it('returns ~0.9 right after review (elapsed=0 → 1/1)', () => {
    const state = { stability: 5, reps: 1, lastReview: 1000, dueAt: 1000 + 5 * DAY };
    // At elapsed=0, R = 1
    expect(retrievability(state, 1000)).toBeCloseTo(1.0);
  });

  it('decays as elapsed days approach stability', () => {
    const state = { stability: 5, reps: 1, lastReview: 0, dueAt: 5 * DAY };
    const r1 = retrievability(state, 1 * DAY);
    const r5 = retrievability(state, 5 * DAY);
    const r10 = retrievability(state, 10 * DAY);
    expect(r1).toBeGreaterThan(r5);
    expect(r5).toBeGreaterThan(r10);
  });
});
