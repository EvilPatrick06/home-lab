import { describe, it, expect } from 'vitest';
import { TUTORIAL_STEPS, snapshotBaselines, migrateTutorialIndex } from './tutorial';

describe('tutorial module sanity', () => {
  it('arithmetic still works', () => {
    expect(2 + 2).toBe(4);
  });
});

describe('TUTORIAL_STEPS (14-step shape)', () => {
  it('has 14 steps in the new order', () => {
    expect(TUTORIAL_STEPS).toHaveLength(14);
    expect(TUTORIAL_STEPS.map(s => s.id)).toEqual([
      'welcome',
      'forge_tome',
      'inscribe_tome',
      'library_tour',
      'study_scroll',
      'solve_riddle',
      'face_trial',
      'vault_intro',
      'consult_oracle',
      'quest_board',
      'enter_dungeon',
      'view_achievements',
      'view_titles_levels',
      'manage_saga',
    ]);
  });

  it('total XP across all steps is 425', () => {
    const total = TUTORIAL_STEPS.reduce((s, step) => s + (step.xp || 0), 0);
    expect(total).toBe(425);
  });

  it('every step with autoComplete:true has an autoCondition', () => {
    for (const step of TUTORIAL_STEPS) {
      if (step.autoComplete) {
        expect(step.autoCondition, `step ${step.id} missing autoCondition`).toBeDefined();
      }
    }
  });

  it('every step with actionLabel triggers a known onAction id', () => {
    // The corresponding handler in App.jsx onAction must handle each of these ids.
    // This test enforces that the set of action-bearing steps stays in sync with
    // the dispatch table (manually mirrored — string list below).
    const knownActionIds = new Set([
      'forge_tome',
      'library_tour',
      'vault_intro',
      'quest_board',
      'view_achievements',
      'view_titles_levels',
    ]);
    for (const step of TUTORIAL_STEPS) {
      if (step.actionLabel) {
        expect(knownActionIds.has(step.id), `step ${step.id} has actionLabel but no known dispatch`).toBe(true);
      }
    }
  });
});

describe('migrateTutorialIndex', () => {
  // Old 8-step order — captured here as the source of truth for the migration.
  const OLD_ORDER = [
    'welcome', 'forge_tome', 'inscribe_tome', 'study_scroll',
    'solve_riddle', 'face_trial', 'consult_oracle', 'enter_dungeon',
  ];

  it('maps each old index to the new index of the same step id', () => {
    for (let oldIdx = 0; oldIdx < OLD_ORDER.length; oldIdx++) {
      const id = OLD_ORDER[oldIdx];
      const newIdx = TUTORIAL_STEPS.findIndex(s => s.id === id);
      expect(migrateTutorialIndex(oldIdx)).toBe(newIdx);
    }
  });

  it('returns 0 for negative indices', () => {
    expect(migrateTutorialIndex(-1)).toBe(0);
  });

  it('clamps out-of-range high indices to the last step', () => {
    expect(migrateTutorialIndex(99)).toBe(TUTORIAL_STEPS.length - 1);
  });

  it('passes through indices already in the new range', () => {
    // If the saved index is 8+ (impossible from old data), assume it's already on the new flow.
    // Returning the same index means it stays put. Valid range is [0, TUTORIAL_STEPS.length - 1].
    expect(migrateTutorialIndex(8)).toBe(8);   // first index beyond old range
    expect(migrateTutorialIndex(10)).toBe(10); // mid-range
    expect(migrateTutorialIndex(13)).toBe(13); // last valid index
  });
});

describe('snapshotBaselines', () => {
  it('returns zeros for an empty state', () => {
    const result = snapshotBaselines({});
    expect(result).toEqual({
      libraryCount: 0,
      cardsReviewed: 0,
      quizAnswered: 0,
      labsAttempted: 0,
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

  it('sums labsAttempted across all tomes', () => {
    const state = {
      library: [
        { progress: { labsAttempted: 2 } },
        { progress: { labsAttempted: 3 } },
        { progress: {} }, // missing field defaults to 0
      ],
    };
    expect(snapshotBaselines(state).labsAttempted).toBe(5);
  });

  it('returns zero labsAttempted for empty state', () => {
    expect(snapshotBaselines({}).labsAttempted).toBe(0);
  });
});
