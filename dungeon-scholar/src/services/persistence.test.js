import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  exportSaveText,
  parseImportedSave,
  loadFromLocalStorage,
  saveToLocalStorage,
  hasMeaningfulData,
  hashState,
  semanticHashState,
  isQuotaExceededError,
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

  describe('semanticHashState', () => {
    it('returns equal hashes when user-observable state matches but internal noise differs (Phase 33a — mistakeVault timestamps)', () => {
      // Same level / totals / tome counts but mistakeVault entries have
      // different `addedAt` timestamps (e.g., backfill ran at different
      // wall-clock times on different devices). The chooser should NOT
      // fire on this kind of difference.
      const a = {
        level: 4, totalXp: 944, totalCorrect: 68, gold: 196,
        library: [{ id: 't1', progress: {
          cardsReviewed: 12, quizAnswered: 68, runsCompleted: 0,
          mistakeVault: [
            { id: 'q1', addedAt: 1700000000000 },
            { id: 'q2', addedAt: 1700000005000 },
          ],
        } }],
      };
      const b = {
        level: 4, totalXp: 944, totalCorrect: 68, gold: 196,
        library: [{ id: 't1', progress: {
          cardsReviewed: 12, quizAnswered: 68, runsCompleted: 0,
          mistakeVault: [
            { id: 'q1', addedAt: 1700009999999 }, // ← different timestamp
            { id: 'q2', addedAt: 1700009999998 },
          ],
        } }],
      };
      expect(semanticHashState(a)).toBe(semanticHashState(b));
    });

    it('returns different hashes when user-observable state differs', () => {
      const a = { level: 4, totalCorrect: 68, library: [{ id: 't1', progress: {} }] };
      const b = { level: 5, totalCorrect: 68, library: [{ id: 't1', progress: {} }] }; // level change
      expect(semanticHashState(a)).not.toBe(semanticHashState(b));
    });

    it('returns different hashes when per-tome counters differ', () => {
      const a = { level: 4, library: [{ id: 't1', progress: { quizAnswered: 5 } }] };
      const b = { level: 4, library: [{ id: 't1', progress: { quizAnswered: 6 } }] };
      expect(semanticHashState(a)).not.toBe(semanticHashState(b));
    });

    it('ignores library array order (tomes are sorted by id)', () => {
      const a = { level: 4, library: [
        { id: 't1', progress: { quizAnswered: 5 } },
        { id: 't2', progress: { quizAnswered: 3 } },
      ] };
      const b = { level: 4, library: [
        { id: 't2', progress: { quizAnswered: 3 } },
        { id: 't1', progress: { quizAnswered: 5 } },
      ] };
      expect(semanticHashState(a)).toBe(semanticHashState(b));
    });

    it('returns empty string for null/undefined', () => {
      expect(semanticHashState(null)).toBe('');
      expect(semanticHashState(undefined)).toBe('');
    });
  });

  describe('100+ tomes (Phase-30 QA gap)', () => {
    // Build a tome entry with realistic, per-index progress so the round-trip
    // and the hash assertions exercise non-trivial nested state.
    const makeTome = (i) => ({
      id: `tome_${i}`,
      data: { metadata: { title: `Tome ${i}`, subject: `Subject ${i % 7}` } },
      addedAt: 1_700_000_000_000 + i,
      lastOpened: 1_700_000_000_000 + i * 10,
      progress: {
        cardsReviewed: i,
        quizAnswered: i * 2,
        labsCompleted: i % 3,
        runsCompleted: i % 5,
        mistakeVault: i % 4 === 0 ? [{ id: `m_${i}`, addedAt: 1_700_000_000_000 + i }] : [],
      },
    });
    const makeLibrary = (n) => Array.from({ length: n }, (_, i) => makeTome(i));

    it('round-trips a 120-tome library, preserving every tome + the schema-version field', () => {
      const library = makeLibrary(120);
      const state = { level: 42, totalXp: 99999, gold: 1234, library };

      const res = saveToLocalStorage(state);
      expect(res).toEqual({ ok: true });

      const loaded = loadFromLocalStorage();
      // The schema marker rides in the on-disk payload and comes back as schemaVer.
      expect(loaded.schemaVer).toBe(CURRENT_SCHEMA_VER);
      // All 120 tomes survive, in order, with their per-tome progress intact.
      expect(loaded.state.library).toHaveLength(120);
      expect(loaded.state.library).toEqual(library);
      expect(loaded.state.library[119].progress.cardsReviewed).toBe(119);
      expect(loaded.state.library[60].progress.quizAnswered).toBe(120);
      // __schemaVer is stripped from the returned state object.
      expect(loaded.state).not.toHaveProperty('__schemaVer');
      expect(loaded.state.level).toBe(42);
    });

    it('semanticHashState is stable under key reordering across a 120-tome library', () => {
      const library = makeLibrary(120);
      const a = { level: 42, totalXp: 99999, gold: 1234, library };
      // Same content, every object's keys reversed (simulating JSONB reorder)
      // and the library array shuffled — semantic hash sorts tomes by id.
      const reorder = (obj) =>
        Object.fromEntries(Object.entries(obj).reverse());
      const shuffledLib = [...library].reverse().map((t) => ({
        ...reorder(t),
        progress: reorder(t.progress),
      }));
      const b = reorder({ level: 42, totalXp: 99999, gold: 1234, library: shuffledLib });

      expect(semanticHashState(a)).toBe(semanticHashState(b));
    });

    it('semanticHashState differs when one tome of 120 bumps its cardsReviewed', () => {
      const library = makeLibrary(120);
      const a = { level: 42, library };
      const bumped = library.map((t, i) =>
        i === 73 ? { ...t, progress: { ...t.progress, cardsReviewed: t.progress.cardsReviewed + 1 } } : t
      );
      const b = { level: 42, library: bumped };

      expect(semanticHashState(a)).not.toBe(semanticHashState(b));
    });
  });

  describe('isQuotaExceededError (M10 / 17F)', () => {
    it('is true for a named QuotaExceededError DOMException', () => {
      expect(isQuotaExceededError(new DOMException('full', 'QuotaExceededError'))).toBe(true);
    });
    it('is true for a code-22 DOMException', () => {
      // jsdom DOMException ignores a custom code, so synthesize the legacy shape.
      const err = new DOMException('full');
      Object.defineProperty(err, 'code', { value: 22 });
      expect(isQuotaExceededError(err)).toBe(true);
    });
    it('is false for a plain Error', () => {
      expect(isQuotaExceededError(new Error('nope'))).toBe(false);
    });
  });

  describe('saveToLocalStorage result (M10 / 17F)', () => {
    afterEach(() => vi.restoreAllMocks());

    it('returns { ok: true } on a normal write', () => {
      expect(saveToLocalStorage({ level: 2 })).toEqual({ ok: true });
    });
    it('returns { ok: false, quota: true } on a quota DOMException', () => {
      vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new DOMException('full', 'QuotaExceededError');
      });
      expect(saveToLocalStorage({ level: 2 })).toEqual({ ok: false, quota: true });
    });
    it('returns { ok: false, quota: false } on a generic throw', () => {
      vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('boom'); });
      expect(saveToLocalStorage({ level: 2 })).toEqual({ ok: false, quota: false });
    });
  });
});

describe("save export / import (S12)", () => {
  it("round-trips a save through exportSaveText -> parseImportedSave", () => {
    const state = { library: [{ id: "t1" }], gold: 42, level: 3 };
    const text = exportSaveText(state);
    expect(text).toContain("dungeon-scholar");
    const res = parseImportedSave(text);
    expect(res.ok).toBe(true);
    expect(res.state.gold).toBe(42);
    expect(res.state.library).toHaveLength(1);
  });

  it("accepts a bare state object (no wrapper)", () => {
    const res = parseImportedSave(JSON.stringify({ library: [], gold: 7 }));
    expect(res.ok).toBe(true);
    expect(res.state.gold).toBe(7);
  });

  it("rejects non-JSON", () => {
    expect(parseImportedSave("not json").ok).toBe(false);
  });

  it("rejects JSON that is not a journal (no library array)", () => {
    expect(parseImportedSave(JSON.stringify({ foo: 1 })).ok).toBe(false);
  });
});
