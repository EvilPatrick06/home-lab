import { describe, expect, it } from 'vitest';
import { aggregateDomainAccuracy, poolCrossTomeQuiz, weakDomainWeights } from './crossTomeExam.js';
import { pickStratifiedSample } from './examSession.js';

const tome = (id, quiz, domainStats) => ({ id, data: { id, quiz }, progress: { domainStats } });

describe('poolCrossTomeQuiz', () => {
  it('namespaces ids by tome and preserves domains', () => {
    const pool = poolCrossTomeQuiz([
      tome('t1', [{ id: 'q1', domain: 'A', question: 'x' }]),
      tome('t2', [{ id: 'q1', domain: 'B', question: 'y' }]),
    ]);
    expect(pool.map((q) => q.id)).toEqual(['t1::q1', 't2::q1']);
    expect(pool.map((q) => q.sourceTomeId)).toEqual(['t1', 't2']);
    expect(pool.map((q) => q.domain)).toEqual(['A', 'B']);
  });
  it('handles empty / missing quiz arrays', () => {
    expect(poolCrossTomeQuiz([tome('t', undefined, {}), null])).toEqual([]);
  });
});

describe('aggregateDomainAccuracy', () => {
  it('sums per-domain totals across tomes', () => {
    const acc = aggregateDomainAccuracy([
      tome('t1', [], { A: { total: 10, correct: 5 }, B: { total: 4, correct: 4 } }),
      tome('t2', [], { A: { total: 10, correct: 3 } }),
    ]);
    expect(acc.A).toBeCloseTo(8 / 20);
    expect(acc.B).toBe(1);
  });
  it('returns null accuracy for a domain with no answers', () => {
    expect(aggregateDomainAccuracy([tome('t', [], { A: { total: 0, correct: 0 } })]).A).toBe(null);
  });
});

describe('weakDomainWeights', () => {
  it('weights weaker domains more heavily', () => {
    const pool = [{ domain: 'Weak' }, { domain: 'Strong' }, { domain: 'Unknown' }];
    const w = weakDomainWeights(pool, { Weak: 0, Strong: 1 });
    expect(w.Weak).toBe(3); // 1 + 2*(1-0)
    expect(w.Strong).toBe(1); // 1 + 2*(1-1)
    expect(w.Unknown).toBe(1); // no data -> neutral
  });
  it('produces weights usable by pickStratifiedSample', () => {
    const pool = poolCrossTomeQuiz([
      tome(
        't1',
        [
          { id: 'a', domain: 'Weak', question: '1' },
          { id: 'b', domain: 'Weak', question: '2' },
          { id: 'c', domain: 'Strong', question: '3' },
          { id: 'd', domain: 'Strong', question: '4' },
        ],
        {},
      ),
    ]);
    const w = weakDomainWeights(pool, { Weak: 0.1, Strong: 0.95 });
    const sample = pickStratifiedSample(pool, w, 2, () => 0.5);
    expect(sample).toHaveLength(2);
  });
});
