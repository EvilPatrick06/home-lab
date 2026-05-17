import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadFromLocalStorage,
  saveToLocalStorage,
  hasMeaningfulData,
  hashState,
  STORAGE_KEY,
  CURRENT_SCHEMA_VER,
  migrateIfNeeded,
} from './persistence.js';

describe('persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loadFromLocalStorage returns null when key absent', () => {
    expect(loadFromLocalStorage()).toBeNull();
  });

  it('round-trips a state object', () => {
    const state = { level: 5, totalXp: 200, library: [{ id: 'a' }] };
    saveToLocalStorage(state);
    expect(loadFromLocalStorage()).toEqual({ state, schemaVer: CURRENT_SCHEMA_VER });
  });

  it('saveToLocalStorage embeds __schemaVer in the on-disk payload', () => {
    saveToLocalStorage({ level: 2, library: [] });
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(raw.__schemaVer).toBe(CURRENT_SCHEMA_VER);
    expect(raw.level).toBe(2);
  });

  it('loadFromLocalStorage strips __schemaVer from the returned state', () => {
    saveToLocalStorage({ level: 7, totalXp: 50 });
    const loaded = loadFromLocalStorage();
    expect(loaded.state).not.toHaveProperty('__schemaVer');
    expect(loaded.state).toEqual({ level: 7, totalXp: 50 });
  });

  it('loadFromLocalStorage treats legacy saves (no __schemaVer) as schemaVer 0', () => {
    // Simulate a save written before the schemaVer fix landed.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ level: 3, totalXp: 80 }));
    expect(loadFromLocalStorage()).toEqual({
      state: { level: 3, totalXp: 80 },
      schemaVer: 0,
    });
  });

  it('returns null on corrupt JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{bad json');
    expect(loadFromLocalStorage()).toBeNull();
  });

  it('hasMeaningfulData is false for default-shaped state', () => {
    expect(hasMeaningfulData({ level: 1, totalXp: 0, library: [] })).toBe(false);
    expect(hasMeaningfulData(null)).toBe(false);
    expect(hasMeaningfulData(undefined)).toBe(false);
  });

  it('hasMeaningfulData is true when level > 1', () => {
    expect(hasMeaningfulData({ level: 2, totalXp: 0, library: [] })).toBe(true);
  });

  it('hasMeaningfulData is true when there is at least one tome', () => {
    expect(hasMeaningfulData({ level: 1, totalXp: 0, library: [{ id: 'a' }] })).toBe(true);
  });

  it('hasMeaningfulData is true when totalXp > 0', () => {
    expect(hasMeaningfulData({ level: 1, totalXp: 1, library: [] })).toBe(true);
  });

  it('migrateIfNeeded is a no-op for current schema version', () => {
    const state = { level: 3, library: [] };
    expect(migrateIfNeeded(state, CURRENT_SCHEMA_VER)).toBe(state);
  });

  it('migrateIfNeeded returns the state unchanged for unknown future versions (forward-compat)', () => {
    const state = { level: 3, library: [] };
    expect(migrateIfNeeded(state, CURRENT_SCHEMA_VER + 1)).toBe(state);
  });

  it('migrateIfNeeded with schemaVer 0 remaps tutorialStepIndex via migrateTutorialIndex', () => {
    // savedIndex 7 in the old 8-step order = 'enter_dungeon', which lives
    // at a different position in the post-overhaul TUTORIAL_STEPS layout.
    const state = { tutorialStepIndex: 7, level: 1 };
    const migrated = migrateIfNeeded(state, 0);
    expect(typeof migrated.tutorialStepIndex).toBe('number');
    // Concrete check: it must NOT still be 7 (the old position) — that
    // would mean the migration didn't run.
    expect(migrated.tutorialStepIndex).not.toBe(7);
    // Other fields preserved.
    expect(migrated.level).toBe(1);
  });

  it('migrateIfNeeded with schemaVer 0 leaves state alone when tutorialStepIndex is missing', () => {
    const state = { level: 5 };
    expect(migrateIfNeeded(state, 0)).toEqual({ level: 5 });
  });

  describe('hashState', () => {
    it('returns equal hashes for structurally equal states', () => {
      const a = { level: 4, library: [{ id: 't1' }], totalXp: 923 };
      const b = { level: 4, library: [{ id: 't1' }], totalXp: 923 };
      expect(hashState(a)).toBe(hashState(b));
    });

    it('returns equal hashes regardless of key insertion order (Phase 32a — Supabase JSONB reorders keys)', () => {
      // Same content, different insertion order — Supabase JSONB normalizes
      // keys, so a fingerprint that depends on order would falsely flag
      // identical states as divergent.
      const a = { level: 4, totalXp: 944, library: [{ id: 't1', addedAt: 1 }] };
      const b = { totalXp: 944, library: [{ addedAt: 1, id: 't1' }], level: 4 };
      expect(hashState(a)).toBe(hashState(b));
    });

    it('returns equal hashes for nested objects with reordered keys', () => {
      const a = { library: [{ id: 't1', progress: { cardsReviewed: 5, quizAnswered: 12 } }] };
      const b = { library: [{ progress: { quizAnswered: 12, cardsReviewed: 5 }, id: 't1' }] };
      expect(hashState(a)).toBe(hashState(b));
    });

    it('returns different hashes when any content differs', () => {
      expect(hashState({ level: 4 })).not.toBe(hashState({ level: 5 }));
      expect(hashState({ library: [{ id: 'a' }] })).not.toBe(hashState({ library: [{ id: 'b' }] }));
    });

    it('returns empty string for null / undefined / non-object', () => {
      expect(hashState(null)).toBe('');
      expect(hashState(undefined)).toBe('');
      expect(hashState(7)).toBe('');
      expect(hashState('x')).toBe('');
    });

    it('returns empty string when stringify throws (cyclic refs)', () => {
      const cyclic = { level: 1 };
      cyclic.self = cyclic;
      expect(hashState(cyclic)).toBe('');
    });
  });
});
