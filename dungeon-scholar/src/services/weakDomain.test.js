import { describe, it, expect } from 'vitest';
import {
  pickWeakestDomain,
  WEAK_DOMAIN_MIN_SAMPLE,
  WEAK_DOMAIN_ACCURACY_THRESHOLD,
} from './weakDomain.js';

describe('pickWeakestDomain', () => {
  it('exports the threshold constants the UI footnote relies on', () => {
    expect(WEAK_DOMAIN_MIN_SAMPLE).toBe(5);
    expect(WEAK_DOMAIN_ACCURACY_THRESHOLD).toBe(0.75);
  });

  it('returns null for empty or invalid stats input', () => {
    expect(pickWeakestDomain([], null, null)).toBeNull();
    expect(pickWeakestDomain(null, null, null)).toBeNull();
    expect(pickWeakestDomain(undefined, null, null)).toBeNull();
  });

  it('returns null when no domain has the minimum sample size', () => {
    const stats = [
      { domain: 'A', total: 4, correct: 0, accuracy: 0 },
      { domain: 'B', total: 3, correct: 0, accuracy: 0 },
    ];
    expect(pickWeakestDomain(stats, null, null)).toBeNull();
  });

  it('returns null when every qualifying domain is at or above the accuracy threshold', () => {
    const stats = [
      { domain: 'A', total: 10, correct: 8, accuracy: 0.8 },
      { domain: 'B', total: 20, correct: 15, accuracy: 0.75 },
    ];
    expect(pickWeakestDomain(stats, null, null)).toBeNull();
  });

  it('picks the domain with the lowest accuracy among qualifying entries', () => {
    const stats = [
      { domain: 'A', total: 10, correct: 5, accuracy: 0.5 },
      { domain: 'B', total: 10, correct: 4, accuracy: 0.4 },
      { domain: 'C', total: 10, correct: 9, accuracy: 0.9 },
    ];
    expect(pickWeakestDomain(stats, null, null)?.domain).toBe('B');
  });

  it('ignores the "Uncategorized" bucket even when it would otherwise win', () => {
    const stats = [
      { domain: 'Uncategorized', total: 50, correct: 5, accuracy: 0.1 },
      { domain: 'A', total: 10, correct: 5, accuracy: 0.5 },
    ];
    expect(pickWeakestDomain(stats, null, null)?.domain).toBe('A');
  });

  it('restricts picks to the candidate set when one is provided', () => {
    const stats = [
      { domain: 'A', total: 10, correct: 3, accuracy: 0.3 },
      { domain: 'B', total: 10, correct: 5, accuracy: 0.5 },
    ];
    expect(pickWeakestDomain(stats, new Set(['B']), null)?.domain).toBe('B');
  });

  it('returns null when no qualifying domain appears in the candidate set', () => {
    const stats = [
      { domain: 'A', total: 10, correct: 3, accuracy: 0.3 },
    ];
    expect(pickWeakestDomain(stats, new Set(['B']), null)).toBeNull();
  });

  it('breaks accuracy ties by exam weight when weights are provided (higher weight wins)', () => {
    const stats = [
      { domain: 'A', total: 10, correct: 5, accuracy: 0.5 },
      { domain: 'B', total: 10, correct: 5, accuracy: 0.5 },
    ];
    expect(pickWeakestDomain(stats, null, { A: 10, B: 25 })?.domain).toBe('B');
  });

  it('breaks accuracy ties by sample size when no weights are provided', () => {
    const stats = [
      { domain: 'A', total: 10, correct: 5, accuracy: 0.5 },
      { domain: 'B', total: 20, correct: 10, accuracy: 0.5 },
    ];
    expect(pickWeakestDomain(stats, null, null)?.domain).toBe('B');
  });

  it('falls back to sample-size tiebreak when weights tie or are zero', () => {
    const stats = [
      { domain: 'A', total: 10, correct: 5, accuracy: 0.5 },
      { domain: 'B', total: 20, correct: 10, accuracy: 0.5 },
    ];
    expect(pickWeakestDomain(stats, null, { A: 0, B: 0 })?.domain).toBe('B');
    expect(pickWeakestDomain(stats, null, { A: 15, B: 15 })?.domain).toBe('B');
  });

  it('skips malformed entries without crashing', () => {
    const stats = [
      null,
      { domain: 'A' },
      { domain: 'B', total: 'lots', correct: 0, accuracy: 0.1 },
      { domain: 'C', total: 10, correct: 5, accuracy: 0.5 },
      { domain: 'D', total: 10, correct: 4, accuracy: NaN },
    ];
    expect(pickWeakestDomain(stats, null, null)?.domain).toBe('C');
  });

  it('accepts a candidate Set even when weights is null and vice versa', () => {
    const stats = [{ domain: 'A', total: 10, correct: 3, accuracy: 0.3 }];
    expect(pickWeakestDomain(stats, new Set(['A']), null)?.domain).toBe('A');
    expect(pickWeakestDomain(stats, null, {})?.domain).toBe('A');
  });
});
