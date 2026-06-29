import { dynamicKeys, SETTINGS_KEYS } from '../../constants'
import { addToast } from '../../hooks/use-toast'
import { idbAvailable, idbDeleteSnapshot, idbGetSnapshot, idbPutSnapshot } from './autosave-snapshot-store'
// ---------------------------------------------------------------------------
// Auto-Save Service
// ---------------------------------------------------------------------------
// Periodically persists the current game state to localStorage so the user
// can roll back to any of the last N save points. Each "version" is stored
// under its own localStorage key and a manifest of versions is maintained
// per-campaign.
// ---------------------------------------------------------------------------

export interface AutoSaveConfig {
  enabled: boolean
  intervalMs: number // default: 5 * 60 * 1000 (5 minutes)
  maxVersions: number // default: 10
}

export interface SaveVersion {
  id: string
  timestamp: number
  label: string // e.g., "Auto-save Round 3" or "Auto-save 2:30 PM"
}

// ---- module-level state ----------------------------------------------------

const CONFIG_STORAGE_KEY = SETTINGS_KEYS.AUTOSAVE_CONFIG

let config: AutoSaveConfig = loadConfigFromStorage()

let intervalId: ReturnType<typeof setInterval> | null = null

// ---- helpers ---------------------------------------------------------------

function versionListKey(campaignId: string): string {
  return dynamicKeys.autosaveVersions(campaignId)
}

function versionDataKey(campaignId: string, versionId: string): string {
  return dynamicKeys.autosaveVersion(campaignId, versionId)
}

function loadConfigFromStorage(): AutoSaveConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AutoSaveConfig>
      return {
        enabled: parsed.enabled ?? true,
        intervalMs: parsed.intervalMs ?? 5 * 60 * 1000,
        maxVersions: parsed.maxVersions ?? 10
      }
    }
  } catch {
    // Ignore parse errors – fall through to defaults
  }
  return {
    enabled: true,
    intervalMs: 5 * 60 * 1000,
    maxVersions: 10
  }
}

function saveConfigToStorage(): void {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config))
  } catch {
    // Storage may be full – silently ignore
  }
}

function loadVersionList(campaignId: string): SaveVersion[] {
  try {
    const raw = localStorage.getItem(versionListKey(campaignId))
    if (raw) {
      return JSON.parse(raw) as SaveVersion[]
    }
  } catch {
    // Ignore parse errors
  }
  return []
}

function persistVersionList(campaignId: string, versions: SaveVersion[]): void {
  try {
    localStorage.setItem(versionListKey(campaignId), JSON.stringify(versions))
  } catch {
    // Storage may be full – silently ignore
  }
}

function generateVersionId(): string {
  return `v-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
}

function formatTimeLabel(timestamp: number): string {
  const d = new Date(timestamp)
  const hours = d.getHours()
  const minutes = d.getMinutes().toString().padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const h12 = hours % 12 || 12
  return `${h12}:${minutes} ${ampm}`
}

function buildLabel(timestamp: number, data: unknown): string {
  // Attempt to extract round number from the save data
  let roundSuffix = ''
  if (data && typeof data === 'object' && 'round' in (data as Record<string, unknown>)) {
    const round = (data as Record<string, unknown>).round
    if (typeof round === 'number' && round > 0) {
      roundSuffix = ` Round ${round}`
    }
  }
  const time = formatTimeLabel(timestamp)
  return roundSuffix ? `Auto-save${roundSuffix} (${time})` : `Auto-save ${time}`
}

/** Remove a snapshot body from both backends (IndexedDB best-effort + localStorage). */
function removeSnapshot(campaignId: string, versionId: string): void {
  const key = versionDataKey(campaignId, versionId)
  if (idbAvailable()) {
    idbDeleteSnapshot(key).catch(() => {
      // best-effort
    })
  }
  try {
    localStorage.removeItem(key)
  } catch {
    // Ignore removal errors
  }
}

function trimVersions(campaignId: string, versions: SaveVersion[]): SaveVersion[] {
  // Sort newest first
  const sorted = [...versions].sort((a, b) => b.timestamp - a.timestamp)

  // Remove excess versions from storage
  const excess = sorted.slice(config.maxVersions)
  for (const v of excess) {
    removeSnapshot(campaignId, v.id)
  }

  return sorted.slice(0, config.maxVersions)
}

/**
 * QuotaExceededError detection across browsers (Chromium name/code 22, Firefox
 * NS_ERROR_DOM_QUOTA_REACHED / code 1014). A non-quota write failure (e.g. a
 * serialization error) is deliberately NOT treated as a quota problem, so we
 * never evict save history for an unrelated error.
 */
function isQuotaExceeded(err: unknown): boolean {
  if (!(err instanceof DOMException)) return false
  return (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.code === 22 ||
    err.code === 1014
  )
}

/**
 * Persist one snapshot payload, evicting the oldest stored versions one at a
 * time and retrying until the write fits or no history remains. Returns true on
 * success. Unlike the previous single-shot retry this drains as many old
 * versions as needed, so a large snapshot can still save on a near-full store.
 */
function persistSnapshotWithEviction(campaignId: string, versionId: string, serialized: string): boolean {
  try {
    localStorage.setItem(versionDataKey(campaignId, versionId), serialized)
    return true
  } catch (err) {
    if (!isQuotaExceeded(err)) return false
  }
  let versions = loadVersionList(campaignId)
  while (versions.length > 0) {
    const oldest = [...versions].sort((a, b) => a.timestamp - b.timestamp)[0]
    try {
      localStorage.removeItem(versionDataKey(campaignId, oldest.id))
    } catch {
      // ignore removal errors
    }
    versions = versions.filter((v) => v.id !== oldest.id)
    persistVersionList(campaignId, versions)
    try {
      localStorage.setItem(versionDataKey(campaignId, versionId), serialized)
      return true
    } catch (err) {
      if (!isQuotaExceeded(err)) return false
      // still over quota — keep evicting
    }
  }
  return false
}

// ---- core save logic -------------------------------------------------------

async function performSave(campaignId: string, data: unknown, label?: string): Promise<void> {
  const now = Date.now()
  const versionId = generateVersionId()
  const saveLabel = label ?? buildLabel(now, data)

  const version: SaveVersion = {
    id: versionId,
    timestamp: now,
    label: saveLabel
  }

  // Serialize first; a serialization failure (e.g. a cyclic snapshot) is not a
  // storage problem, so we give up quietly rather than show a scary toast.
  let serialized: string
  try {
    serialized = JSON.stringify(data)
  } catch {
    return
  }

  // Persist the data payload, evicting old versions on quota pressure. If it
  // still cannot be written, FAIL LOUD (toast) instead of silently dropping the
  // save — the user should know their work is no longer being backed up.
  // Prefer IndexedDB for the (potentially large) snapshot body: async, a far
  // bigger quota, and no synchronous main-thread localStorage write. Fall back
  // to localStorage (with quota-eviction) when IndexedDB is unavailable or fails.
  let stored = false
  if (idbAvailable()) {
    try {
      await idbPutSnapshot(versionDataKey(campaignId, versionId), serialized)
      // Drop any stale localStorage copy now that IndexedDB owns this body.
      try {
        localStorage.removeItem(versionDataKey(campaignId, versionId))
      } catch {
        // ignore
      }
      stored = true
    } catch {
      // fall back to localStorage below
    }
  }
  if (!stored && !persistSnapshotWithEviction(campaignId, versionId, serialized)) {
    addToast(
      'Auto-save failed: device storage is full. Free up space or lower the number of saved versions in Settings.',
      'error'
    )
    return
  }

  // Update the version manifest
  const versions = loadVersionList(campaignId)
  versions.push(version)
  const trimmed = trimVersions(campaignId, versions)
  persistVersionList(campaignId, trimmed)
}

// ---- public API ------------------------------------------------------------

/**
 * Start the auto-save timer for a given campaign.
 *
 * `getSaveData` is called on each tick to obtain the current state snapshot.
 * Any previously running timer is stopped first.
 */
export function startAutoSave(campaignId: string, getSaveData: () => unknown): void {
  stopAutoSave()
  if (!config.enabled) return

  intervalId = setInterval(async () => {
    try {
      await performSave(campaignId, getSaveData())
    } catch {
      // Swallow errors so the timer keeps running
    }
  }, config.intervalMs)
}

/**
 * Stop the auto-save timer if one is running.
 */
export function stopAutoSave(): void {
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
}

/**
 * Manually trigger a save right now (outside the normal interval).
 */
export async function saveNow(campaignId: string, data: unknown, label?: string): Promise<void> {
  await performSave(campaignId, data, label)
}

/**
 * Return the list of available save versions for a campaign, newest first.
 */
export function getSaveVersions(campaignId: string): SaveVersion[] {
  return loadVersionList(campaignId).sort((a, b) => b.timestamp - a.timestamp)
}

/**
 * Restore (load) the data payload from a specific save version.
 *
 * Returns `null` if the version is not found.
 */
export async function restoreVersion(campaignId: string, versionId: string): Promise<unknown | null> {
  const key = versionDataKey(campaignId, versionId)
  // IndexedDB owns bodies on the web target; older saves may still be in localStorage.
  if (idbAvailable()) {
    try {
      const raw = await idbGetSnapshot(key)
      if (raw !== null) return JSON.parse(raw) as unknown
    } catch {
      // fall through to localStorage
    }
  }
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      return JSON.parse(raw) as unknown
    }
  } catch {
    // Ignore parse errors
  }
  return null
}

/**
 * Delete a single save version and its data payload.
 */
export function deleteVersion(campaignId: string, versionId: string): void {
  removeSnapshot(campaignId, versionId)

  const versions = loadVersionList(campaignId)
  const filtered = versions.filter((v) => v.id !== versionId)
  persistVersionList(campaignId, filtered)
}

/**
 * Update auto-save configuration. Partial updates are merged with current
 * config. Changes are persisted to localStorage.
 *
 * Note: Changing `enabled` or `intervalMs` does **not** automatically
 * restart a running timer. Call `startAutoSave` again if needed.
 */
export function setConfig(cfg: Partial<AutoSaveConfig>): void {
  config = { ...config, ...cfg }
  saveConfigToStorage()
}

/**
 * Return a copy of the current auto-save configuration.
 */
export function getConfig(): AutoSaveConfig {
  return { ...config }
}

/**
 * Returns `true` if the auto-save interval timer is currently active.
 */
export function isRunning(): boolean {
  return intervalId !== null
}
