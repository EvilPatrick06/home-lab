/**
 * Per-entity local sync bookkeeping, persisted in localStorage (works in both
 * the Electron renderer and the web build). For each synced entity key
 * (`<domain>/<id>`) it records the last server-acknowledged `version` and the
 * `syncedHash` of the content we last pushed/pulled — so the engine can tell a
 * locally-changed entity (hash drift) from an in-sync one, and resolve conflicts
 * by version.
 */

const STORAGE_KEY = 'dnd-vtt:sync-state:v1'

export interface EntitySyncState {
  version: number
  syncedHash: string
}

export type SyncStateMap = Record<string, EntitySyncState>

export function loadSyncState(): SyncStateMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SyncStateMap) : {}
  } catch {
    return {}
  }
}

export function saveSyncState(state: SyncStateMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* quota / unavailable — next reconcile rebuilds what it can */
  }
}

/** Wipe local sync bookkeeping (on sign-out, so a different account starts fresh). */
export function clearSyncState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
