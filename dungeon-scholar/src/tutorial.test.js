import { describe, it, expect } from 'vitest';
import { TUTORIAL_STEPS, snapshotBaselines } from './tutorial';

describe('tutorial module sanity', () => {
  it('arithmetic still works', () => {
    expect(2 + 2).toBe(4);
  });
});

describe('TUTORIAL_STEPS (legacy 8-step shape)', () => {
  it('has 8 steps in the legacy order', () => {
    expect(TUTORIAL_STEPS).toHaveLength(8);
    expect(TUTORIAL_STEPS.map(s => s.id)).toEqual([
      'welcome',
      'forge_tome',
      'inscribe_tome',
      'study_scroll',
      'solve_riddle',
      'face_trial',
      'consult_oracle',
      'enter_dungeon',
    ]);
  });
});

describe('snapshotBaselines (legacy)', () => {
  it('returns zeros for an empty state', () => {
    const result = snapshotBaselines({});
    expect(result).toEqual({
      libraryCount: 0,
      cardsReviewed: 0,
      quizAnswered: 0,
      labSteps: 0,
      oracleMessages: 0,
      dungeonAttempts: 0,
    });
  });

  it('sums cardsReviewed across all tomes', () => {
    const state = {
      library: [
        { progress: { cardsReviewed: 3 } },
        { progress: { cardsReviewed: 5 } },
      ],
    };
    expect(snapshotBaselines(state).cardsReviewed).toBe(8);
  });

  it('sums labSteps as labsCompleted plus lab-typed mistakeVault entries', () => {
    const state = {
      library: [
        {
          progress: {
            labsCompleted: 2,
            mistakeVault: [
              { _type: 'lab', id: 'a' },
              { _type: 'quiz', id: 'b' },
              { _type: 'lab', id: 'c' },
            ],
          },
        },
      ],
    };
    expect(snapshotBaselines(state).labSteps).toBe(4); // 2 completed + 2 lab vault entries
  });
});
