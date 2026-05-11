import { describe, it, expect } from 'vitest';
import {
  EXAM_PRESETS,
  pickStratifiedSample,
  gradeExamItem,
  summarizeExamResults,
} from './examSession.js';

const mc = (id, domain, correctIndex = 0) => ({
  id, domain, type: 'multiplechoice', options: ['a', 'b', 'c', 'd'], correctIndex,
  question: `Q ${id}`,
});

const tf = (id, domain, correctAnswer = true) => ({
  id, domain, type: 'truefalse', correctAnswer, question: `Q ${id}`,
});

const fib = (id, domain, correctAnswer = 'foo', acceptedAnswers = []) => ({
  id, domain, type: 'fillblank', correctAnswer, acceptedAnswers, question: `Q ${id}`,
});

const seededRng = (seed = 1) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
};

describe('EXAM_PRESETS', () => {
  it('declares three presets covering Short/Standard/Full lengths', () => {
    expect(EXAM_PRESETS).toHaveLength(3);
    expect(EXAM_PRESETS.map(p => p.id)).toEqual(['short', 'standard', 'full']);
    expect(EXAM_PRESETS.every(p => p.count > 0 && p.minutes > 0)).toBe(true);
  });
});

describe('pickStratifiedSample', () => {
  it('returns [] when quiz is empty or count is zero', () => {
    expect(pickStratifiedSample([], { A: 50 }, 10)).toEqual([]);
    expect(pickStratifiedSample([mc('q1', 'A')], { A: 50 }, 0)).toEqual([]);
    expect(pickStratifiedSample(null, null, 5)).toEqual([]);
  });

  it('skips entries without an id', () => {
    const out = pickStratifiedSample([{ domain: 'A' }, mc('q1', 'A')], null, 5);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('q1');
  });

  it('returns a stratified sample matching weight proportions (deterministic via RNG)', () => {
    const items = [];
    for (let i = 0; i < 20; i++) items.push(mc(`a${i}`, 'A'));
    for (let i = 0; i < 20; i++) items.push(mc(`b${i}`, 'B'));
    for (let i = 0; i < 20; i++) items.push(mc(`c${i}`, 'C'));
    const out = pickStratifiedSample(items, { A: 50, B: 30, C: 20 }, 10, seededRng(42));
    expect(out).toHaveLength(10);
    const byDomain = out.reduce((m, q) => { m[q.domain] = (m[q.domain] || 0) + 1; return m; }, {});
    expect(byDomain.A).toBe(5);
    expect(byDomain.B).toBe(3);
    expect(byDomain.C).toBe(2);
  });

  it('uses largest-remainder rounding so the count is exact', () => {
    const items = [];
    for (let i = 0; i < 20; i++) items.push(mc(`a${i}`, 'A'));
    for (let i = 0; i < 20; i++) items.push(mc(`b${i}`, 'B'));
    for (let i = 0; i < 20; i++) items.push(mc(`c${i}`, 'C'));
    // 7 items / 3 even domains → 2.33 each → floors 2/2/2 + 1 leftover to first sorted by remainder
    const out = pickStratifiedSample(items, { A: 33, B: 33, C: 34 }, 7, seededRng(1));
    expect(out).toHaveLength(7);
  });

  it('falls back to even distribution when weights are missing', () => {
    const items = [];
    for (let i = 0; i < 5; i++) items.push(mc(`a${i}`, 'A'));
    for (let i = 0; i < 5; i++) items.push(mc(`b${i}`, 'B'));
    const out = pickStratifiedSample(items, null, 6, seededRng(7));
    expect(out).toHaveLength(6);
    const byDomain = out.reduce((m, q) => { m[q.domain] = (m[q.domain] || 0) + 1; return m; }, {});
    expect(byDomain.A).toBe(3);
    expect(byDomain.B).toBe(3);
  });

  it('fills from leftovers when a domain pool is too thin to satisfy its quota', () => {
    const items = [
      ...[1, 2].map(i => mc(`a${i}`, 'A')),         // only 2 in A
      ...[1, 2, 3, 4, 5, 6, 7, 8].map(i => mc(`b${i}`, 'B')),
    ];
    // 10 requested, weights 50/50 → 5/5; but A only has 2, fill 3 from B
    const out = pickStratifiedSample(items, { A: 50, B: 50 }, 10, seededRng(3));
    expect(out).toHaveLength(10);
    const byDomain = out.reduce((m, q) => { m[q.domain] = (m[q.domain] || 0) + 1; return m; }, {});
    expect(byDomain.A).toBe(2);
    expect(byDomain.B).toBe(8);
  });

  it('returns at most the available pool size', () => {
    const items = [mc('q1', 'A'), mc('q2', 'A')];
    expect(pickStratifiedSample(items, { A: 100 }, 99)).toHaveLength(2);
  });

  it('does not duplicate items', () => {
    const items = Array.from({ length: 10 }, (_, i) => mc(`q${i}`, 'A'));
    const out = pickStratifiedSample(items, { A: 100 }, 10, seededRng(99));
    const ids = new Set(out.map(q => q.id));
    expect(ids.size).toBe(10);
  });
});

describe('gradeExamItem', () => {
  it('grades multiple-choice by index', () => {
    const q = mc('q1', 'A', 2);
    expect(gradeExamItem(q, 2)).toBe(true);
    expect(gradeExamItem(q, 1)).toBe(false);
    expect(gradeExamItem(q, null)).toBe(false);
    expect(gradeExamItem(q, '2')).toBe(false); // strict number
  });

  it('grades true/false by boolean equality', () => {
    expect(gradeExamItem(tf('q1', 'A', true), true)).toBe(true);
    expect(gradeExamItem(tf('q1', 'A', true), false)).toBe(false);
    expect(gradeExamItem(tf('q1', 'A', false), false)).toBe(true);
    expect(gradeExamItem(tf('q1', 'A', false), null)).toBe(false);
  });

  it('grades fill-in-the-blank case-insensitively and trims whitespace', () => {
    const q = fib('q1', 'A', 'TCP', ['Transmission Control Protocol']);
    expect(gradeExamItem(q, 'tcp')).toBe(true);
    expect(gradeExamItem(q, '  TCP  ')).toBe(true);
    expect(gradeExamItem(q, 'transmission control protocol')).toBe(true);
    expect(gradeExamItem(q, 'UDP')).toBe(false);
    expect(gradeExamItem(q, '')).toBe(false);
    expect(gradeExamItem(q, null)).toBe(false);
  });

  it('returns false for unknown question types or null input', () => {
    expect(gradeExamItem(null, 'anything')).toBe(false);
    expect(gradeExamItem({ type: 'weird' }, 'a')).toBe(false);
  });
});

describe('summarizeExamResults', () => {
  it('computes totals and per-domain breakdown', () => {
    const items = [
      mc('q1', 'A', 0),
      mc('q2', 'A', 1),
      tf('q3', 'B', true),
      tf('q4', 'B', false),
      fib('q5', 'C', 'foo'),
    ];
    const answers = [0, 0, true, true, 'FOO']; // 1/2 A, 1/2 B, 1/1 C → 3/5 = 60%
    const out = summarizeExamResults(items, answers);
    expect(out.total).toBe(5);
    expect(out.answered).toBe(5);
    expect(out.correct).toBe(3);
    expect(out.scorePct).toBe(60);
    expect(out.byDomain.A).toEqual({ total: 2, answered: 2, correct: 1 });
    expect(out.byDomain.B).toEqual({ total: 2, answered: 2, correct: 1 });
    expect(out.byDomain.C).toEqual({ total: 1, answered: 1, correct: 1 });
  });

  it('treats null/undefined/empty-string entries as unanswered', () => {
    const items = [mc('q1', 'A', 0), mc('q2', 'A', 0), mc('q3', 'A', 0)];
    const answers = [0, null, undefined];
    const out = summarizeExamResults(items, answers);
    expect(out.answered).toBe(1);
    expect(out.correct).toBe(1);
    expect(out.byDomain.A).toEqual({ total: 3, answered: 1, correct: 1 });
  });

  it('groups questions without a domain under "Uncategorized"', () => {
    const items = [{ id: 'q1', type: 'truefalse', correctAnswer: true }];
    const out = summarizeExamResults(items, [true]);
    expect(out.byDomain.Uncategorized).toEqual({ total: 1, answered: 1, correct: 1 });
  });

  it('returns zeros for an empty input', () => {
    expect(summarizeExamResults([], [])).toEqual({ total: 0, answered: 0, correct: 0, scorePct: 0, byDomain: {} });
  });
});
