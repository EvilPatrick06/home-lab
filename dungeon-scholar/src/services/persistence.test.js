import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadFromLocalStorage,
  saveToLocalStorage,
  hasMeaningfulData,
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
    expect(loadFromLocalStorage()).toEqual(state);
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
});
