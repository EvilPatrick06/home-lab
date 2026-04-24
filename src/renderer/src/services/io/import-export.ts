/**
 * Import/Export service for characters and campaigns.
 *
 * Uses Electron's window.api for file dialogs and file I/O.
 * All functions handle errors gracefully, returning false or null on failure.
 */

import { MAX_READ_FILE_SIZE, MAX_WRITE_CONTENT_SIZE } from '../../constants/app-constants'
import { logger } from '../../utils/logger'

const JSON_FILTER = [{ name: 'JSON Files', extensions: ['json'] }]

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Export a character to a JSON file via save dialog.
 * Returns true if the file was written successfully, false otherwise.
 */
export async function exportCharacter(character: Record<string, unknown>): Promise<boolean> {
  try {
    const filePath = await window.api.showSaveDialog({
      title: 'Export Character',
      filters: JSON_FILTER
    })
    if (!filePath) return false

    const json = JSON.stringify(character, null, 2)
    await window.api.writeFile(filePath, json)
    return true
  } catch {
    return false
  }
}

/**
 * Export a campaign to a JSON file via save dialog.
 * Returns true if the file was written successfully, false otherwise.
 */
export async function exportCampaign(campaign: Record<string, unknown>): Promise<boolean> {
  try {
    const filePath = await window.api.showSaveDialog({
      title: 'Export Campaign',
      filters: JSON_FILTER
    })
    if (!filePath) return false

    const json = JSON.stringify(campaign, null, 2)
    await window.api.writeFile(filePath, json)
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * Import a character from a JSON file via open dialog.
 * Validates that the parsed object contains required fields: id, name, gameSystem.
 * Returns the parsed character object, or null if cancelled/invalid/error.
 */
export async function importCharacter(): Promise<Record<string, unknown> | null> {
  try {
    const filePath = await window.api.showOpenDialog({
      title: 'Import Character',
      filters: JSON_FILTER
    })
    if (!filePath) return null

    const raw = await window.api.readFile(filePath)
    const parsed = JSON.parse(raw)

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.id !== 'string' ||
      typeof parsed.name !== 'string' ||
      typeof parsed.gameSystem !== 'string'
    ) {
      logger.error('Import character: missing required fields (id, name, gameSystem)')
      return null
    }

    return parsed
  } catch (err) {
    logger.error('Import character failed:', err)
    return null
  }
}

/**
 * Import a campaign from a JSON file via open dialog.
 * Validates that the parsed object contains required fields: id, name, system.
 * Returns the parsed campaign object, or null if cancelled/invalid/error.
 */
export async function importCampaign(): Promise<Record<string, unknown> | null> {
  try {
    const filePath = await window.api.showOpenDialog({
      title: 'Import Campaign',
      filters: JSON_FILTER
    })
    if (!filePath) return null

    const raw = await window.api.readFile(filePath)
    const parsed = JSON.parse(raw)

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.id !== 'string' ||
      typeof parsed.name !== 'string' ||
      typeof parsed.system !== 'string'
    ) {
      logger.error('Import campaign: missing required fields (id, name, system)')
      return null
    }

    return parsed
  } catch (err) {
    logger.error('Import campaign failed:', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Full backup: Export / Import ALL data
// ---------------------------------------------------------------------------

const BACKUP_VERSION = 2
const BACKUP_FILTER = [{ name: 'D&D VTT Backup', extensions: ['dndbackup'] }]

const PREFERENCE_PREFIX = 'dnd-vtt-'

interface BackupPayload {
  version: number
  exportedAt: string
  characters: Record<string, unknown>[]
  campaigns: Record<string, unknown>[]
  bastions: Record<string, unknown>[]
  customCreatures: Record<string, unknown>[]
  homebrew: Record<string, unknown>[]
  appSettings: Record<string, unknown>
  preferences: Record<string, string>
}

function gatherLocalStoragePreferences(): Record<string, string> {
  const prefs: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(PREFERENCE_PREFIX)) {
      prefs[key] = localStorage.getItem(key) ?? ''
    }
  }
  return prefs
}

export interface BackupStats {
  characters: number
  campaigns: number
  bastions: number
  customCreatures: number
  homebrew: number
}

/**
 * Gather all app data (characters, campaigns, bastions, settings, preferences)
 * and write it to a single .dndbackup file via a save dialog.
 */
export async function exportAllData(): Promise<BackupStats | null> {
  const [characters, campaigns, bastions, customCreatures, homebrew, appSettings] = await Promise.all([
    window.api.loadCharacters().catch(() => []),
    window.api.loadCampaigns().catch(() => []),
    window.api.loadBastions().catch(() => []),
    window.api.loadCustomCreatures().catch(() => []),
    window.api.loadAllHomebrew().catch(() => []),
    window.api.loadSettings().catch(() => ({}))
  ])

  const payload: BackupPayload = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    characters: Array.isArray(characters) ? characters : [],
    campaigns: Array.isArray(campaigns) ? campaigns : [],
    bastions: Array.isArray(bastions) ? bastions : [],
    customCreatures: Array.isArray(customCreatures) ? customCreatures : [],
    homebrew: Array.isArray(homebrew) ? homebrew : [],
    appSettings: (appSettings ?? {}) as Record<string, unknown>,
    preferences: gatherLocalStoragePreferences()
  }

  const filePath = await window.api.showSaveDialog({
    title: 'Export All Data',
    filters: BACKUP_FILTER
  })
  if (!filePath) return null

  const json = JSON.stringify(payload, null, 2)

  // Validate against IPC write size limit
  if (json.length > MAX_WRITE_CONTENT_SIZE) {
    const limitMb = (MAX_WRITE_CONTENT_SIZE / 1024 / 1024).toFixed(0)
    throw new Error(`Backup is too large to export (limit: ${limitMb} MB). Consider removing unused data first.`)
  }

  await window.api.writeFile(filePath, json)
  return {
    characters: payload.characters.length,
    campaigns: payload.campaigns.length,
    bastions: payload.bastions.length,
    customCreatures: payload.customCreatures.length,
    homebrew: payload.homebrew.length
  }
}

/**
 * Read a .dndbackup file, validate its structure, and restore all data.
 * Existing data with the same IDs will be overwritten.
 */
export async function importAllData(): Promise<BackupStats | null> {
  const filePath = await window.api.showOpenDialog({
    title: 'Import All Data',
    filters: BACKUP_FILTER
  })
  if (!filePath) return null

  const raw = await window.api.readFile(filePath)

  // Validate file size against IPC read limit
  if (raw.length > MAX_READ_FILE_SIZE) {
    throw new Error(`Backup file exceeds maximum read size (${(MAX_READ_FILE_SIZE / 1024 / 1024).toFixed(0)} MB)`)
  }

  let payload: BackupPayload
  try {
    payload = JSON.parse(raw)
  } catch {
    return null
  }

  if (!payload || typeof payload !== 'object' || !payload.version || payload.version > BACKUP_VERSION) {
    return null
  }

  const chars = Array.isArray(payload.characters) ? payload.characters : []
  const camps = Array.isArray(payload.campaigns) ? payload.campaigns : []
  const basts = Array.isArray(payload.bastions) ? payload.bastions : []
  // v1 backups don't have these fields
  const creatures = Array.isArray(payload.customCreatures) ? payload.customCreatures : []
  const hb = Array.isArray(payload.homebrew) ? payload.homebrew : []

  const results = await Promise.allSettled([
    ...chars.map((c) => window.api.saveCharacter(c as Record<string, unknown>)),
    ...camps.map((c) => window.api.saveCampaign(c as Record<string, unknown>)),
    ...basts.map((b) => window.api.saveBastion(b as Record<string, unknown>)),
    ...creatures.map((cr) => window.api.saveCustomCreature(cr as Record<string, unknown>)),
    ...hb.map((h) => window.api.saveHomebrew(h as Record<string, unknown>))
  ])

  const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failed.length > 0) {
    logger.warn(`[Import] ${failed.length} item(s) failed to save during import`)
    if (failed.length === results.length) {
      throw new Error('Import failed: no items could be saved')
    }
  }

  if (payload.appSettings && typeof payload.appSettings === 'object') {
    await window.api
      .saveSettings(payload.appSettings as Parameters<typeof window.api.saveSettings>[0])
      .catch((e) => logger.warn('[Import] Failed to restore app settings', e))
  }

  if (payload.preferences && typeof payload.preferences === 'object') {
    for (const [key, value] of Object.entries(payload.preferences)) {
      if (key.startsWith(PREFERENCE_PREFIX) && typeof value === 'string') {
        localStorage.setItem(key, value)
      }
    }
  }

  return {
    characters: chars.length,
    campaigns: camps.length,
    bastions: basts.length,
    customCreatures: creatures.length,
    homebrew: hb.length
  }
}

// Re-export D&D Beyond importer from dedicated module
export { importDndBeyondCharacter } from './import-dnd-beyond'
