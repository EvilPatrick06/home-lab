export const STORAGE_KEY = 'dungeon-scholar:save:v1';
export const SYNC_META_KEY = 'dungeon-scholar:sync:v1';
export const CURRENT_SCHEMA_VER = 1;

export function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveToLocalStorage(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
  // v1 is current. No migrations defined yet. Future versions add cases here.
  return state;
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
