import { describe, expect, it } from 'vitest';
import { isOutOfTomeAnswer, ORACLE_SOURCE_MIN_SCORE, oracleSourcesForAnswer } from './oracleSources.js';

// PHASE-08 08D: the Oracle attached "SOURCES FROM THE TOME" whenever searchTome
// returned any card scoring > 0, even on an explicitly out-of-tome answer. These
// guard the gating helper that suppresses irrelevant sources.
describe('oracleSourcesForAnswer (PHASE-08 08D)', () => {
  const strong = [
    { text: 'a', score: 17 },
    { text: 'b', score: 10 },
  ];
  const weak = [
    { text: 'c', score: 7 },
    { text: 'd', score: 5 },
  ];

  it('keeps strong in-tome sources on a normal answer', () => {
    expect(oracleSourcesForAnswer('The tome teaches that X is Y [1].', strong)).toEqual(strong);
  });

  it('suppresses sources when the answer carries the out-of-tome disclaimer', () => {
    expect(oracleSourcesForAnswer('This goes beyond the current tome, but broadly...', strong)).toEqual([]);
    expect(oracleSourcesForAnswer('That is not covered in the tome.', strong)).toEqual([]);
  });

  it('suppresses sources when the top retrieval score is only a weak lexical hit', () => {
    expect(oracleSourcesForAnswer('Here is what the tome says.', weak)).toEqual([]);
  });

  it('returns [] for empty / missing source lists', () => {
    expect(oracleSourcesForAnswer('anything', [])).toEqual([]);
    expect(oracleSourcesForAnswer('anything', undefined)).toEqual([]);
  });

  it('respects the boundary at ORACLE_SOURCE_MIN_SCORE', () => {
    const atMin = [{ text: 'x', score: ORACLE_SOURCE_MIN_SCORE }];
    const belowMin = [{ text: 'x', score: ORACLE_SOURCE_MIN_SCORE - 1 }];
    expect(oracleSourcesForAnswer('plain answer', atMin)).toEqual(atMin);
    expect(oracleSourcesForAnswer('plain answer', belowMin)).toEqual([]);
  });

  it('isOutOfTomeAnswer matches the disclaimer the system prompt requests', () => {
    expect(isOutOfTomeAnswer('This goes beyond the current tome, but...')).toBe(true);
    expect(isOutOfTomeAnswer('The answer lies in chapter two.')).toBe(false);
  });
});
