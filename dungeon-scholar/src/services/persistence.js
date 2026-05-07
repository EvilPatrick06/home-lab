import { migrateTutorialIndex } from '../tutorial.js';

export const STORAGE_KEY = 'dungeon-scholar:save:v1';
export const SYNC_META_KEY = 'dungeon-scholar:sync:v1';
export const CURRENT_SCHEMA_VER = 1;

// Saves embed `__schemaVer` so a future load can run the right migrations.
// Pre-existing saves on disk that lack the marker are treated as schemaVer 0
// — see `loadFromLocalStorage` and `migrateIfNeeded`.

export function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    // Pull the schema marker out of the payload so the rest of the app
    // never sees it. Default to 0 so legacy saves trigger the v0→v1
    // tutorial-index migration (otherwise it's a silent no-op).
    const schemaVer = typeof parsed.__schemaVer === 'number' ? parsed.__schemaVer : 0;
    const { __schemaVer, ...state } = parsed; // eslint-disable-line no-unused-vars
    return { state, schemaVer };
  } catch {
    return null;
  }
}

export function saveToLocalStorage(state) {
  try {
    const payload = { ...(state || {}), __schemaVer: CURRENT_SCHEMA_VER };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota exceeded or unavailable — silent. Cloud / Export still work.
  }
}

export function hasMeaningfulData(state) {
  if (!state) return false;
  if ((state.level ?? 1) > 1) return true;
  if ((state.totalXp ?? 0) > 0) return true;
  if (Array.isArray(state.library) && state.library.length > 0) return true;
  return false;
}

export function migrateIfNeeded(state, schemaVer) {
  if (!state) return state;
  let next = state;
  // schemaVer < 1 → tutorial overhaul: pre-overhaul saves used a different
  // 8-step ordering. Remap the savedIndex to the current TUTORIAL_STEPS
  // layout so the resumed tutorial picks up at the right step.
  //
  // localStorage saves now carry __schemaVer in the payload (since
  // commit "persist schemaVer in localStorage"). Saves written before
  // that fix are treated as schemaVer 0 by loadFromLocalStorage, so
  // they hit this case once on next load.
  if (schemaVer < 1 && typeof next.tutorialStepIndex === 'number') {
    next = { ...next, tutorialStepIndex: migrateTutorialIndex(next.tutorialStepIndex) };
  }
  return next;
}

// Sync metadata (separate from playerState — these are about the device's
// relationship with the cloud, not data that should travel between devices).
//
// lastSyncedAt: ISO string of cloud's updated_at at the last successful sync.
//               null means we have never synced this device with this account.
// dirty: true if the user has made any changes since the last successful sync.

const DEFAULT_SYNC_META = { lastSyncedAt: null, dirty: false };

export function loadSyncMeta() {
  try {
    const raw = localStorage.getItem(SYNC_META_KEY);
    if (!raw) return { ...DEFAULT_SYNC_META };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SYNC_META, ...parsed };
  } catch {
    return { ...DEFAULT_SYNC_META };
  }
}

export function saveSyncMeta(meta) {
  try {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
  } catch {
    // ignore
  }
}

export function clearSyncMeta() {
  try {
    localStorage.removeItem(SYNC_META_KEY);
  } catch {
    // ignore
  }
}
