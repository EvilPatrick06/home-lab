import { describe, expect, it } from 'vitest';
import {
  blankTomeProgress,
  decodeTomeShareCode,
  encodeTomeShareCode,
  formatDuration,
  generateTomeId,
  normalizeTomeData,
  quizImportReport,
  stripLocalOnlyTomeFields,
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

  it('strips device-local notes from a share code (privacy guard)', () => {
    const code = encodeTomeShareCode({ metadata: { title: 'T' }, flashcards: [], notes: { ct: 'secret', salt: 's' } });
    const back = decodeTomeShareCode(code);
    expect(back.notes).toBeUndefined();
    expect(back.metadata.title).toBe('T');
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

  it('strips an injected device-local notes field on import', () => {
    const out = normalizeTomeData({ metadata: { title: 'T' }, flashcards: [{ id: '1' }], notes: { ct: 'x' } });
    expect(out.notes).toBeUndefined();
    expect(out.metadata.title).toBe('T');
  });

  it('stripLocalOnlyTomeFields returns the same ref when there is nothing to strip', () => {
    const clean = { metadata: { title: 'T' } };
    expect(stripLocalOnlyTomeFields(clean)).toBe(clean);
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

describe('normalizeTomeData quiz answer-key normalization (PHASE-04 04A)', () => {
  it('normalizes a numeric `answer` synonym to correctIndex', () => {
    const out = normalizeTomeData({ quiz: [{ question: 'q', options: ['a', 'b', 'c', 'd'], answer: 1 }] });
    expect(out.quiz[0].correctIndex).toBe(1);
  });
  it('resolves a text answer matching an option to its index', () => {
    const out = normalizeTomeData({ quiz: [{ question: 'q', options: ['Red', 'Green', 'Blue'], answer: 'Green' }] });
    expect(out.quiz[0].correctIndex).toBe(1);
  });
  it('resolves a 1-based numeric answer when 0-based is out of range', () => {
    const out = normalizeTomeData({ quiz: [{ question: 'q', options: ['a', 'b'], answer: 2 }] });
    expect(out.quiz[0].correctIndex).toBe(1);
  });
  it('drops an MCQ item with no resolvable answer key', () => {
    const out = normalizeTomeData({
      quiz: [
        { question: 'good', options: ['a', 'b'], correctIndex: 0 },
        { question: 'bad', options: ['a', 'b'], answer: 'nope' },
      ],
    });
    expect(out.quiz).toHaveLength(1);
    expect(out.quiz[0].question).toBe('good');
  });
  it('normalizes true/false synonyms to a boolean correctAnswer', () => {
    const out = normalizeTomeData({ quiz: [{ question: 'q', type: 'truefalse', answer: 'true' }] });
    expect(out.quiz[0].correctAnswer).toBe(true);
  });
  it('is idempotent on canonical items and a no-op on quiz-less tomes', () => {
    const canon = { quiz: [{ question: 'q', options: ['a', 'b'], correctIndex: 1 }] };
    expect(normalizeTomeData(canon).quiz[0].correctIndex).toBe(1);
    const noQuiz = { metadata: { title: 'x' }, flashcards: [{ front: 'a', back: 'b' }] };
    expect(normalizeTomeData(noQuiz)).toEqual(noQuiz);
  });
  it('quizImportReport counts unresolvable items without mutating', () => {
    const data = {
      quiz: [
        { question: 'ok', options: ['a', 'b'], answer: 0 },
        { question: 'bad', options: ['a', 'b'], answer: 'zzz' },
      ],
    };
    expect(quizImportReport(data)).toEqual({ dropped: 1, total: 2 });
    expect(data.quiz).toHaveLength(2);
  });
});
