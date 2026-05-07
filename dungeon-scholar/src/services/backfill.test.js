import { describe, it, expect } from 'vitest';
import {
  CURRENT_BACKFILL_VER,
  backfillDungeonAnswers,
  applyBackfills,
} from './backfill.js';

const buildState = ({ totalCorrect = 0, library = [], backfillVer } = {}) => {
  const state = { totalCorrect, library };
  if (typeof backfillVer === 'number') state.backfillVer = backfillVer;
  return state;
};

const buildRun = (questionLog) => ({ questionLog });

describe('backfillDungeonAnswers', () => {
  it('is a no-op when there is no run history', () => {
    const state = buildState({ totalCorrect: 50, library: [{ id: 'a', progress: {} }] });
    const out = backfillDungeonAnswers(state);
    expect(out.totalCorrect).toBe(50);
    expect(out.library[0].progress.mistakeVault || []).toEqual([]);
  });

  it('subtracts inflation: total - correct from totalCorrect', () => {
    // 5 dungeon answers, 2 correct → inflation = 3 (3 wrongs were counted as correct).
    const log = [
      { id: 'q1', correct: true, prompt: 'Q1' },
      { id: 'q2', correct: true, prompt: 'Q2' },
      { id: 'q3', correct: false, prompt: 'Q3' },
      { id: 'q4', correct: false, prompt: 'Q4' },
      { id: 'q5', correct: false, prompt: 'Q5' },
    ];
    const state = buildState({
      totalCorrect: 100,
      library: [{ id: 'tome1', progress: { runHistory: [buildRun(log)] } }],
    });
    const out = backfillDungeonAnswers(state);
    expect(out.totalCorrect).toBe(97);
  });

  it('clamps totalCorrect at 0 (never goes negative)', () => {
    const log = [
      { id: 'q1', correct: false, prompt: 'Q1' },
      { id: 'q2', correct: false, prompt: 'Q2' },
    ];
    const state = buildState({
      totalCorrect: 1,
      library: [{ id: 'tome1', progress: { runHistory: [buildRun(log)] } }],
    });
    const out = backfillDungeonAnswers(state);
    expect(out.totalCorrect).toBe(0);
  });

  it('repopulates mistakeVault with missing wrong-answer dungeon entries', () => {
    const log = [
      { id: 'q1', correct: true, prompt: 'Q1' },
      { id: 'q2', correct: false, prompt: 'Q2', type: 'multiplechoice', domain: 'crypto' },
    ];
    const state = buildState({
      totalCorrect: 10,
      library: [{ id: 'tome1', progress: { runHistory: [buildRun(log)] } }],
    });
    const out = backfillDungeonAnswers(state);
    const vault = out.library[0].progress.mistakeVault;
    expect(vault).toHaveLength(1);
    expect(vault[0].id).toBe('q2');
    expect(vault[0].domain).toBe('crypto');
    expect(vault[0].question).toBe('Q2');
  });

  it('does not duplicate vault entries already present', () => {
    const log = [{ id: 'q2', correct: false, prompt: 'Q2' }];
    const state = buildState({
      totalCorrect: 10,
      library: [{
        id: 'tome1',
        progress: {
          runHistory: [buildRun(log)],
          mistakeVault: [{ id: 'q2', addedAt: 1000 }],
        },
      }],
    });
    const out = backfillDungeonAnswers(state);
    expect(out.library[0].progress.mistakeVault).toHaveLength(1);
  });

  it('preserves other tome progress fields', () => {
    const log = [{ id: 'q1', correct: false, prompt: 'Q1' }];
    const state = buildState({
      totalCorrect: 5,
      library: [{
        id: 'tome1',
        progress: { runHistory: [buildRun(log)], runsCompleted: 7, somethingElse: 'x' },
      }],
    });
    const out = backfillDungeonAnswers(state);
    expect(out.library[0].progress.runsCompleted).toBe(7);
    expect(out.library[0].progress.somethingElse).toBe('x');
  });

  it('handles multiple tomes independently', () => {
    const stateA = { runHistory: [buildRun([{ id: 'q1', correct: false, prompt: 'A' }])] };
    const stateB = { runHistory: [buildRun([{ id: 'q2', correct: false, prompt: 'B' }])] };
    const state = buildState({
      totalCorrect: 10,
      library: [
        { id: 'tomeA', progress: stateA },
        { id: 'tomeB', progress: stateB },
      ],
    });
    const out = backfillDungeonAnswers(state);
    expect(out.library[0].progress.mistakeVault.map(m => m.id)).toEqual(['q1']);
    expect(out.library[1].progress.mistakeVault.map(m => m.id)).toEqual(['q2']);
  });
});

describe('applyBackfills', () => {
  it('runs backfillDungeonAnswers and bumps backfillVer for v0 state', () => {
    const log = [{ id: 'q1', correct: false, prompt: 'Q1' }];
    const state = buildState({
      totalCorrect: 5,
      library: [{ id: 'tome1', progress: { runHistory: [buildRun(log)] } }],
    });
    const out = applyBackfills(state);
    expect(out.backfillVer).toBe(CURRENT_BACKFILL_VER);
    expect(out.totalCorrect).toBe(4);
    expect(out.library[0].progress.mistakeVault).toHaveLength(1);
  });

  it('is a no-op when state.backfillVer is already current', () => {
    const log = [{ id: 'q1', correct: false, prompt: 'Q1' }];
    const state = buildState({
      totalCorrect: 5,
      library: [{ id: 'tome1', progress: { runHistory: [buildRun(log)] } }],
      backfillVer: CURRENT_BACKFILL_VER,
    });
    const out = applyBackfills(state);
    // totalCorrect untouched, vault not added to (idempotency).
    expect(out.totalCorrect).toBe(5);
    expect(out.library[0].progress.mistakeVault || []).toEqual([]);
  });

  it('returns the state unchanged when null/undefined', () => {
    expect(applyBackfills(null)).toBeNull();
    expect(applyBackfills(undefined)).toBeUndefined();
  });
});
