import { describe, expect, it } from 'vitest';
import {
  COURSE_SET_GATED,
  isValidScreen,
  SCREENS,
  SEALED_GATED,
  screenRequiresCourseSet,
  screenSealedGated,
} from './screens.js';
import { SCREENS as ROUTE_SCREENS } from './useHashRoute.js';

describe('screen registry', () => {
  it('exposes the 21 canonical screens and re-exports them via useHashRoute', () => {
    expect(SCREENS).toHaveLength(21);
    expect(ROUTE_SCREENS).toBe(SCREENS); // single source of truth
  });

  it('gating sets are subsets of the valid screens', () => {
    for (const s of COURSE_SET_GATED) expect(SCREENS).toContain(s);
    for (const s of SEALED_GATED) expect(SCREENS).toContain(s);
  });

  it('course-set gating matches the historical list', () => {
    expect([...COURSE_SET_GATED].sort()).toEqual(
      ['chat', 'dungeon', 'flashcards', 'lab', 'practiceExam', 'quiz'].sort(),
    );
    expect(screenRequiresCourseSet('dungeon')).toBe(true);
    expect(screenRequiresCourseSet('home')).toBe(false);
  });

  it('sealed gating matches the historical list', () => {
    expect([...SEALED_GATED].sort()).toEqual(
      ['chat', 'domainStudy', 'dungeon', 'flashcards', 'lab', 'practiceExam', 'quiz', 'vault'].sort(),
    );
    expect(screenSealedGated('vault')).toBe(true);
    expect(screenSealedGated('shop')).toBe(false);
  });

  it('isValidScreen guards membership', () => {
    expect(isValidScreen('ledger')).toBe(true);
    expect(isValidScreen('nope')).toBe(false);
  });
});
