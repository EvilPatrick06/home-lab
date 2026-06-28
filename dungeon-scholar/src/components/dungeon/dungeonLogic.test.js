import { describe, expect, it } from 'vitest';
import { TILE } from '../../game/dungeonMap.js';
import { checkAnswerCorrect, DIR_DELTAS, isWalkable, pickOneQuestion, pickQuestions } from './dungeonLogic.js';

describe('isWalkable', () => {
  it('allows floor, doors, and stairs', () => {
    expect(isWalkable(TILE.FLOOR)).toBe(true);
    expect(isWalkable(TILE.DOOR)).toBe(true);
    expect(isWalkable(TILE.STAIRS_UP)).toBe(true);
    expect(isWalkable(TILE.STAIRS_DOWN)).toBe(true);
  });
  it('blocks walls and the locked boss door', () => {
    expect(isWalkable(TILE.WALL)).toBe(false);
    expect(isWalkable(TILE.BOSS_DOOR)).toBe(false);
  });
});

describe('DIR_DELTAS', () => {
  it('maps the four cardinals to [dx, dy]', () => {
    expect(DIR_DELTAS.up).toEqual([0, -1]);
    expect(DIR_DELTAS.down).toEqual([0, 1]);
    expect(DIR_DELTAS.left).toEqual([-1, 0]);
    expect(DIR_DELTAS.right).toEqual([1, 0]);
  });
});

describe('checkAnswerCorrect', () => {
  it('grades multiple choice by correctIndex', () => {
    const q = { type: 'multiplechoice', correctIndex: 2 };
    expect(checkAnswerCorrect(q, 2)).toBe(true);
    expect(checkAnswerCorrect(q, 1)).toBe(false);
  });
  it('grades true/false by numeric correctIndex', () => {
    const q = { type: 'truefalse', correctIndex: 0 };
    expect(checkAnswerCorrect(q, 0)).toBe(true);
    expect(checkAnswerCorrect(q, 1)).toBe(false);
  });
  it('grades true/false by string correctAnswer (0 => true, 1 => false)', () => {
    expect(checkAnswerCorrect({ type: 'truefalse', correctAnswer: 'true' }, 0)).toBe(true);
    expect(checkAnswerCorrect({ type: 'truefalse', correctAnswer: 'TRUE' }, 0)).toBe(true);
    expect(checkAnswerCorrect({ type: 'truefalse', correctAnswer: 'false' }, 1)).toBe(true);
    expect(checkAnswerCorrect({ type: 'truefalse', correctAnswer: 'true' }, 1)).toBe(false);
  });
  it('is false for a missing question or unknown type', () => {
    expect(checkAnswerCorrect(null, 0)).toBe(false);
    expect(checkAnswerCorrect({ type: 'essay' }, 0)).toBe(false);
  });
});

describe('pickQuestions / pickOneQuestion', () => {
  const courseSet = {
    quiz: [
      { id: 'a', type: 'multiplechoice', correctIndex: 0 },
      { id: 'b', type: 'truefalse', correctIndex: 1 },
      { id: 'c', type: 'multiplechoice', correctIndex: 2 },
      { id: 'd', type: 'shortanswer' }, // excluded: not MC/TF
    ],
  };
  it('returns up to count eligible (MC/TF) questions', () => {
    const out = pickQuestions(courseSet, 2);
    expect(out).toHaveLength(2);
    for (const q of out) expect(['multiplechoice', 'truefalse']).toContain(q.type);
  });
  it('excludes used ids', () => {
    const out = pickQuestions(courseSet, 5, new Set(['a', 'b']));
    expect(out.map((q) => q.id)).toEqual(['c']);
  });
  it('never returns short-answer items', () => {
    const ids = pickQuestions(courseSet, 5).map((q) => q.id);
    expect(ids).not.toContain('d');
  });
  it('pickOneQuestion falls back to the full pool when all are excluded', () => {
    const used = new Set(['a', 'b', 'c']);
    const one = pickOneQuestion(courseSet, used);
    expect(one).not.toBeNull();
    expect(['a', 'b', 'c']).toContain(one.id);
  });
  it('pickOneQuestion returns null for an empty course set', () => {
    expect(pickOneQuestion({ quiz: [] })).toBeNull();
  });
});
