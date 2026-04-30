export const STORAGE_KEY = 'dungeon-scholar:save:v1';
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
