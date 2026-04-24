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

const CONFIG_STORAGE_KEY = 'autosave:config'

let config: AutoSaveConfig = loadConfigFromStorage()

let intervalId: ReturnType<typeof setInterval> | null = null

// ---- helpers ---------------------------------------------------------------

function versionListKey(campaignId: string): string {
  return `autosave:${campaignId}:versions`
}

function versionDataKey(campaignId: string, versionId: string): string {
  return `autosave:${campaignId}:${versionId}`
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

function trimVersions(campaignId: string, versions: SaveVersion[]): SaveVersion[] {
  // Sort newest first
  const sorted = [...versions].sort((a, b) => b.timestamp - a.timestamp)

  // Remove excess versions from storage
  const excess = sorted.slice(config.maxVersions)
  for (const v of excess) {
    try {
      localStorage.removeItem(versionDataKey(campaignId, v.id))
    } catch {
      // Ignore removal errors
    }
  }

  return sorted.slice(0, config.maxVersions)
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

  // Persist the data payload
  try {
    localStorage.setItem(versionDataKey(campaignId, versionId), JSON.stringify(data))
  } catch {
    // localStorage full – try to make room by removing the oldest version
    const versions = loadVersionList(campaignId)
    if (versions.length > 0) {
      const oldest = [...versions].sort((a, b) => a.timestamp - b.timestamp)[0]
      localStorage.removeItem(versionDataKey(campaignId, oldest.id))
      const trimmed = versions.filter((v) => v.id !== oldest.id)
      persistVersionList(campaignId, trimmed)
      // Retry
      try {
        localStorage.setItem(versionDataKey(campaignId, versionId), JSON.stringify(data))
      } catch {
        // Still failing – give up silently
        return
      }
    } else {
      return
    }
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
  try {
    const raw = localStorage.getItem(versionDataKey(campaignId, versionId))
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
  try {
    localStorage.removeItem(versionDataKey(campaignId, versionId))
  } catch {
    // Ignore removal errors
  }

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
