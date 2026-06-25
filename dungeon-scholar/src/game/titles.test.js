import { describe, expect, it } from 'vitest';
import { getTitle, SPECIAL_TITLES, TITLES, xpForLevel } from './titles.js';

describe('xpForLevel (PHASE-39 39A)', () => {
  it('is strictly monotonic in level', () => {
    for (let lvl = 1; lvl < 100; lvl++) {
      expect(xpForLevel(lvl + 1)).toBeGreaterThan(xpForLevel(lvl));
    }
  });
  it('matches the 100 * lvl^1.5 formula', () => {
    expect(xpForLevel(1)).toBe(100);
    expect(xpForLevel(4)).toBe(800);
  });
});

describe('getTitle (PHASE-39 39A)', () => {
  it('bands by level using the TITLES table', () => {
    expect(getTitle(1, null, [])).toBe('Apprentice');
    expect(getTitle(4, null, [])).toBe('Apprentice');
    expect(getTitle(5, null, [])).toBe('Squire');
    expect(getTitle(100, null, [])).toBe('Mythic Demigod');
    // every band resolves to its own name
    for (const band of TITLES) {
      expect(getTitle(band.min, null, [])).toBe(band.name);
    }
  });

  it('an unlocked selected special title overrides the level band', () => {
    expect(getTitle(1, 'flawless', ['flawless'])).toBe(SPECIAL_TITLES.flawless.name);
  });

  it('a selected-but-not-unlocked special title falls back to the band', () => {
    expect(getTitle(5, 'flawless', [])).toBe('Squire');
  });
});
