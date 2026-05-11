import { describe, it, expect } from 'vitest';
import {
  computeExamPrediction,
  PREDICTION_MIN_SAMPLE,
  PREDICTION_HIGH_COVERAGE,
  PREDICTION_MEDIUM_COVERAGE,
} from './examPrediction.js';

describe('computeExamPrediction', () => {
  it('exports the threshold constants used by the UI', () => {
    expect(PREDICTION_MIN_SAMPLE).toBe(5);
    expect(PREDICTION_HIGH_COVERAGE).toBe(75);
    expect(PREDICTION_MEDIUM_COVERAGE).toBe(25);
  });

  it('returns null when weights are missing or malformed', () => {
    expect(computeExamPrediction([], null)).toBeNull();
    expect(computeExamPrediction([], undefined)).toBeNull();
    expect(computeExamPrediction([], 'lots')).toBeNull();
    expect(computeExamPrediction([], {})).toBeNull();
    expect(computeExamPrediction([], { A: 0, B: 0 })).toBeNull();
    expect(computeExamPrediction([], { A: 'x', B: -3 })).toBeNull();
  });

  it('returns confidence "none" with predictedPct null when no domain has the minimum samples', () => {
    const stats = [
      { domain: 'A', total: 4, correct: 2, accuracy: 0.5 },
      { domain: 'B', total: 0, correct: 0, accuracy: 0 },
    ];
    const weights = { A: 50, B: 50 };
    const out = computeExamPrediction(stats, weights);
    expect(out.predictedPct).toBeNull();
    expect(out.coveragePct).toBe(0);
    expect(out.confidence).toBe('none');
    expect(out.sampledDomains).toBe(0);
    expect(out.totalDomains).toBe(2);
    expect(out.missingDomains).toEqual([
      { domain: 'A', weight: 50 },
      { domain: 'B', weight: 50 },
    ]);
  });

  it('matches the single sampled domain accuracy when only one is covered', () => {
    const stats = [{ domain: 'A', total: 20, correct: 14, accuracy: 0.7 }];
    const weights = { A: 50, B: 50 };
    const out = computeExamPrediction(stats, weights);
    expect(out.predictedPct).toBe(70);
    expect(out.coveragePct).toBe(50);
    expect(out.confidence).toBe('medium');
    expect(out.missingDomains).toEqual([{ domain: 'B', weight: 50 }]);
  });

  it('weights accuracy correctly across multiple covered domains', () => {
    // A: 20% weight, 80% acc → 16
    // B: 30% weight, 60% acc → 18
    // C: 50% weight, 90% acc → 45
    // sampledWeight = 100, weightedSum = 79 → 79% (rounded)
    const stats = [
      { domain: 'A', total: 30, correct: 24, accuracy: 0.8 },
      { domain: 'B', total: 20, correct: 12, accuracy: 0.6 },
      { domain: 'C', total: 10, correct: 9, accuracy: 0.9 },
    ];
    const weights = { A: 20, B: 30, C: 50 };
    const out = computeExamPrediction(stats, weights);
    expect(out.predictedPct).toBe(79);
    expect(out.coveragePct).toBe(100);
    expect(out.confidence).toBe('high');
    expect(out.missingDomains).toEqual([]);
  });

  it('treats domains below MIN_SAMPLE as missing, not as zero accuracy', () => {
    const stats = [
      { domain: 'A', total: 20, correct: 16, accuracy: 0.8 },
      { domain: 'B', total: 4, correct: 0, accuracy: 0 }, // below threshold
    ];
    const weights = { A: 50, B: 50 };
    const out = computeExamPrediction(stats, weights);
    expect(out.predictedPct).toBe(80); // A alone, not (16+0)/100
    expect(out.coveragePct).toBe(50);
    expect(out.missingDomains).toEqual([{ domain: 'B', weight: 50 }]);
  });

  it('handles blueprints that do not sum to 100', () => {
    // sampledWeight 15 of 30 = 50% coverage; A's 60% accuracy carries
    const stats = [{ domain: 'A', total: 10, correct: 6, accuracy: 0.6 }];
    const weights = { A: 15, B: 15 };
    const out = computeExamPrediction(stats, weights);
    expect(out.predictedPct).toBe(60);
    expect(out.coveragePct).toBe(50);
  });

  it('confidence ramps: high ≥75, medium ≥25, low <25', () => {
    const baseStats = [{ domain: 'A', total: 10, correct: 5, accuracy: 0.5 }];
    expect(computeExamPrediction(baseStats, { A: 75, B: 25 }).confidence).toBe('high');
    expect(computeExamPrediction(baseStats, { A: 50, B: 50 }).confidence).toBe('medium');
    expect(computeExamPrediction(baseStats, { A: 24, B: 76 }).confidence).toBe('low');
  });

  it('ignores weights that are zero or negative when totaling', () => {
    const stats = [{ domain: 'A', total: 10, correct: 7, accuracy: 0.7 }];
    const weights = { A: 50, B: 0, C: -10 };
    const out = computeExamPrediction(stats, weights);
    // Only A counts toward total weight (50)
    expect(out.totalDomains).toBe(1);
    expect(out.coveragePct).toBe(100);
    expect(out.predictedPct).toBe(70);
  });

  it('skips malformed stat entries gracefully', () => {
    const stats = [
      null,
      { domain: 'A', total: 10, correct: 5, accuracy: 0.5 },
      { /* no domain */ total: 20, correct: 20, accuracy: 1 },
      { domain: 'B', total: 'lots', correct: 5, accuracy: 0.5 }, // bad total
      { domain: 'C', total: 10, correct: 10, accuracy: NaN },   // bad accuracy → treated as 0
    ];
    const weights = { A: 40, B: 30, C: 30 };
    const out = computeExamPrediction(stats, weights);
    // A (acc 0.5, w 40) and C (acc 0 because NaN, w 30) qualify; B does not
    // weightedSum = 0.5*40 + 0*30 = 20; sampledWeight = 70
    // predictedPct = 20/70 ≈ 0.2857 → 29
    expect(out.predictedPct).toBe(29);
    expect(out.sampledDomains).toBe(2);
    expect(out.missingDomains).toEqual([{ domain: 'B', weight: 30 }]);
  });

  it('returns the missing domains in blueprint order', () => {
    const stats = [{ domain: 'B', total: 10, correct: 5, accuracy: 0.5 }];
    const weights = { A: 20, B: 30, C: 50 };
    const out = computeExamPrediction(stats, weights);
    expect(out.missingDomains.map(m => m.domain)).toEqual(['A', 'C']);
  });
});
