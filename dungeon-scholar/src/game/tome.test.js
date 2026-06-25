import { describe, expect, it } from 'vitest';
import {
  blankTomeProgress,
  decodeTomeShareCode,
  encodeTomeShareCode,
  formatDuration,
  generateTomeId,
  normalizeTomeData,
} from './tome.js';

describe('tome share codes (PHASE-39 39A)', () => {
  it('round-trips an object through encode → decode', () => {
    const data = { name: 'Sec+', cards: [{ q: 'a', a: 'b' }], meta: { n: 3, ünïcode: '✓' } };
    const code = encodeTomeShareCode(data);
    expect(code).toMatch(/^TOME-V1:/);
    expect(decodeTomeShareCode(code)).toEqual(data);
  });

  it('tolerates surrounding quotes/whitespace on decode', () => {
    const code = encodeTomeShareCode({ x: 1 });
    expect(decodeTomeShareCode(`  "${code}"  `)).toEqual({ x: 1 });
  });

  it('returns null for malformed / non-TOME-V1 input', () => {
    expect(decodeTomeShareCode('not a code')).toBeNull();
    expect(decodeTomeShareCode('TOME-V1:!!!not-base64!!!')).toBeNull();
  });
});

describe('normalizeTomeData (PHASE-39 39A)', () => {
  it('maps lab.stages → steps without touching labs that already have steps', () => {
    const out = normalizeTomeData({
      labs: [
        { id: 1, stages: ['s1'] },
        { id: 2, steps: ['keep'] },
      ],
    });
    expect(out.labs[0].steps).toEqual(['s1']);
    expect(out.labs[1].steps).toEqual(['keep']);
  });

  it('passes through data with no labs array', () => {
    expect(normalizeTomeData(null)).toBeNull();
    const d = { labs: 'nope' };
    expect(normalizeTomeData(d)).toBe(d);
  });
});

describe('formatDuration (PHASE-39 39A)', () => {
  it('formats sub-minute, minute, and invalid durations', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(90)).toBe('1m 30s');
    expect(formatDuration(605)).toBe('10m 05s');
    expect(formatDuration(0)).toBe('—');
    expect(formatDuration(Infinity)).toBe('—');
  });
});

describe('generateTomeId / blankTomeProgress (PHASE-39 39A)', () => {
  it('generateTomeId matches the tome id charset', () => {
    expect(generateTomeId()).toMatch(/^tome_[a-z0-9_]+$/i);
  });
  it('blankTomeProgress returns a fresh zeroed progress object', () => {
    const p = blankTomeProgress();
    expect(p.cardsReviewed).toBe(0);
    expect(Array.isArray(p.mistakeVault)).toBe(true);
    // fresh object each call (no shared mutable reference)
    expect(blankTomeProgress()).not.toBe(p);
  });
});
