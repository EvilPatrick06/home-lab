import { describe, it, expect } from 'vitest';
import {
  retrievabilityAt,
  computeAverageRetrievability,
  computeRetentionCurve,
  computeMilestones,
} from './forgettingCurve.js';

const DAY = 86400000;

const card = (stability, lastReviewDaysAgo, now) => ({
  stability,
  difficulty: 5,
  reps: 1,
  lapses: 0,
  lastReview: now - lastReviewDaysAgo * DAY,
});

describe('retrievabilityAt', () => {
  it('returns 1.0 immediately after review', () => {
    const now = 1_000_000_000_000;
    const state = card(5, 0, now);
    expect(retrievabilityAt(state, now)).toBeCloseTo(1.0);
  });

  it('decays toward zero as elapsed days exceed stability', () => {
    const now = 1_000_000_000_000;
    const state = card(5, 0, now);
    const r1 = retrievabilityAt(state, now + 1 * DAY);
    const r5 = retrievabilityAt(state, now + 5 * DAY);
    const r45 = retrievabilityAt(state, now + 45 * DAY);
    expect(r1).toBeGreaterThan(r5);
    expect(r5).toBeGreaterThan(r45);
    expect(r45).toBeGreaterThan(0);
    expect(r45).toBeLessThan(0.6);
  });

  it('hits ~0.9 when elapsed = stability (FSRS desired retention)', () => {
    const now = 1_000_000_000_000;
    const state = card(5, 0, now);
    const r = retrievabilityAt(state, now + 5 * DAY);
    expect(r).toBeCloseTo(0.9, 1);
  });

  it('returns null for missing / malformed / unusable state', () => {
    expect(retrievabilityAt(null, 0)).toBeNull();
    expect(retrievabilityAt(undefined, 0)).toBeNull();
    expect(retrievabilityAt({}, 0)).toBeNull();
    expect(retrievabilityAt({ stability: 'lots', lastReview: 0 }, 0)).toBeNull();
    expect(retrievabilityAt({ stability: 5, lastReview: 'when' }, 0)).toBeNull();
    expect(retrievabilityAt({ stability: 0, lastReview: 0 }, 100)).toBeNull();
    expect(retrievabilityAt({ stability: -1, lastReview: 0 }, 100)).toBeNull();
  });
});

describe('computeAverageRetrievability', () => {
  it('returns { mean: null, sampleSize: 0 } when no card has SRS state', () => {
    const out = computeAverageRetrievability([], 0);
    expect(out.mean).toBeNull();
    expect(out.sampleSize).toBe(0);
  });

  it('excludes unrated cards (null entries) from the average', () => {
    const now = 1_000_000_000_000;
    const out = computeAverageRetrievability([null, card(5, 5, now), null], now);
    expect(out.sampleSize).toBe(1);
    expect(out.mean).toBeCloseTo(0.9, 1);
  });

  it('averages retrievability across rated cards', () => {
    const now = 1_000_000_000_000;
    const fresh = card(10, 0, now);            // R ≈ 1
    const stale = card(5, 10, now);            // elapsed > stability, R ≈ 0.69
    const out = computeAverageRetrievability([fresh, stale], now);
    expect(out.sampleSize).toBe(2);
    expect(out.mean).toBeGreaterThan(0.7);
    expect(out.mean).toBeLessThan(1);
  });

  it('accepts an arbitrary atTime in the future', () => {
    const now = 1_000_000_000_000;
    const state = card(5, 0, now);
    // At elapsed=20d, stability=5: R = 1 / (1 + 20/45) ≈ 0.692
    const future = computeAverageRetrievability([state], now + 20 * DAY);
    expect(future.mean).toBeLessThan(0.75);
    expect(future.mean).toBeGreaterThan(0.6);
  });
});

describe('computeRetentionCurve', () => {
  it('returns the requested number of samples', () => {
    const now = 1_000_000_000_000;
    const states = [card(5, 0, now)];
    const out = computeRetentionCurve(states, { now, maxDays: 30, samples: 7 });
    expect(out).toHaveLength(7);
    expect(out[0].offsetDays).toBe(0);
    expect(out[out.length - 1].offsetDays).toBe(30);
  });

  it('produces a monotonically non-increasing pct curve when there are no reviews', () => {
    const now = 1_000_000_000_000;
    const states = [card(5, 0, now), card(2, 1, now), card(10, 0, now)];
    const out = computeRetentionCurve(states, { now, maxDays: 30, samples: 16 });
    for (let i = 1; i < out.length; i++) {
      expect(out[i].pct).toBeLessThanOrEqual(out[i - 1].pct + 1e-9);
    }
  });

  it('returns null pct entries when no cards have state', () => {
    const out = computeRetentionCurve([], { now: 0, maxDays: 10, samples: 3 });
    expect(out.every(p => p.pct === null)).toBe(true);
    expect(out.every(p => p.sampleSize === 0)).toBe(true);
  });

  it('starts near 100% when all cards are freshly reviewed', () => {
    const now = 1_000_000_000_000;
    const states = [card(5, 0, now), card(7, 0, now)];
    const out = computeRetentionCurve(states, { now, samples: 4, maxDays: 30 });
    expect(out[0].pct).toBeCloseTo(100, 0);
  });

  it('clamps malformed options to safe defaults', () => {
    const out = computeRetentionCurve([], { samples: 1, maxDays: 0 });
    expect(out.length).toBeGreaterThanOrEqual(2);
  });
});

describe('computeMilestones', () => {
  it('returns 4 default milestones (now / +1d / +7d / +30d)', () => {
    const now = 1_000_000_000_000;
    const out = computeMilestones([card(5, 0, now)], { now });
    expect(out).toHaveLength(4);
    expect(out.map(m => m.offsetDays)).toEqual([0, 1, 7, 30]);
  });

  it('respects a custom offsets list', () => {
    const now = 1_000_000_000_000;
    const out = computeMilestones([card(5, 0, now)], { now, offsets: [0, 14] });
    expect(out.map(m => m.offsetDays)).toEqual([0, 14]);
  });

  it('returns null pct when no state is available', () => {
    const out = computeMilestones([], { now: 0 });
    expect(out.every(m => m.pct === null)).toBe(true);
  });
});
