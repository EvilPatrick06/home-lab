/**
 * Unified import/export service for all entity types.
 *
 * Every exported file uses a versioned envelope format:
 * { version, type, exportedAt, count, data }
 *
 * Supports both single-item and bulk (array) exports.
 */

import { MAX_READ_FILE_SIZE, MAX_WRITE_CONTENT_SIZE } from '../../constants/app-constants'
import { logger } from '../../utils/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EntityType =
  | 'monster'
  | 'npc'
  | 'encounter'
  | 'map'
  | 'lore'
  | 'bastion'
  | 'companion'
  | 'mount'
  | 'journal'
  | 'ai'
  | 'settings'
  | 'adventure'

export interface ExportEnvelope<T = unknown> {
  version: 1
  type: EntityType
  exportedAt: string
  count: number
  data: T | T[]
}

interface EntityConfig {
  extension: string
  label: string
  requiredFields: string[]
}

// ---------------------------------------------------------------------------
// Entity configs
// ---------------------------------------------------------------------------

const ENTITY_CONFIGS: Record<EntityType, EntityConfig> = {
  monster: { extension: 'dndmonster', label: 'Monster / Creature', requiredFields: ['id', 'name'] },
  npc: { extension: 'dndnpc', label: 'NPC', requiredFields: ['id', 'name'] },
  encounter: { extension: 'dndencounter', label: 'Encounter', requiredFields: ['id', 'name'] },
  map: { extension: 'dndmap', label: 'Map', requiredFields: ['id', 'name'] },
  lore: { extension: 'dndlore', label: 'Lore Entry', requiredFields: ['id', 'title'] },
  bastion: { extension: 'dndbastion', label: 'Bastion', requiredFields: ['id', 'name'] },
  companion: { extension: 'dndcompanion', label: 'Companion', requiredFields: ['id', 'name'] },
  mount: { extension: 'dndmount', label: 'Mount', requiredFields: ['id', 'name'] },
  journal: { extension: 'dndjournal', label: 'Journal Entry', requiredFields: ['id', 'title'] },
  ai: { extension: 'dndai', label: 'AI Conversation', requiredFields: [] },
  settings: { extension: 'dndsettings', label: 'Settings', requiredFields: [] },
  adventure: { extension: 'dndadv', label: 'Adventure Module', requiredFields: ['adventure'] }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateItem(item: unknown, config: EntityConfig): boolean {
  if (typeof item !== 'object' || item === null) return false
  const obj = item as Record<string, unknown>
  return config.requiredFields.every((field) => obj[field] !== undefined)
}

function validateEnvelope(parsed: unknown, expectedType: EntityType): ExportEnvelope | null {
  if (typeof parsed !== 'object' || parsed === null) return null
  const env = parsed as Record<string, unknown>

  if (env.version !== 1) return null
  if (env.type !== expectedType) return null
  if (env.data === undefined) return null

  return env as unknown as ExportEnvelope
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Export one or more entities to a file via the native save dialog.
 * Returns true if saved, false if cancelled or errored.
 */
export async function exportEntities<T>(type: EntityType, items: T[], _suggestedName?: string): Promise<boolean> {
  const config = ENTITY_CONFIGS[type]
  if (!config) return false

  try {
    const envelope: ExportEnvelope<T> = {
      version: 1,
      type,
      exportedAt: new Date().toISOString(),
      count: items.length,
      data: items.length === 1 ? items[0] : items
    }

    const filePath = await window.api.showSaveDialog({
      title: `Export ${config.label}${items.length > 1 ? 's' : ''}`,
      filters: [{ name: config.label, extensions: [config.extension] }]
    })
    if (!filePath) return false

    const json = JSON.stringify(envelope, null, 2)

    // Validate against IPC write size limit
    if (json.length > MAX_WRITE_CONTENT_SIZE) {
      logger.error(
        `Export ${type}: content exceeds max write size (${(MAX_WRITE_CONTENT_SIZE / 1024 / 1024).toFixed(0)} MB)`
      )
      return false
    }

    await window.api.writeFile(filePath, json)
    return true
  } catch (err) {
    logger.error(`Export ${type} failed:`, err)
    return false
  }
}

/** Convenience: export a single entity. */
export async function exportSingleEntity<T>(type: EntityType, item: T): Promise<boolean> {
  return exportEntities(type, [item])
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface ImportResult<T> {
  items: T[]
  count: number
}

/**
 * Import entities from a file via the native open dialog.
 * Validates the envelope format and required fields per entity type.
 * Returns null if cancelled, throws on validation errors.
 */
export async function importEntities<T>(type: EntityType): Promise<ImportResult<T> | null> {
  const config = ENTITY_CONFIGS[type]
  if (!config) throw new Error(`Unknown entity type: ${type}`)

  try {
    const filePath = await window.api.showOpenDialog({
      title: `Import ${config.label}`,
      filters: [{ name: config.label, extensions: [config.extension] }]
    })
    if (!filePath) return null

    const raw = await window.api.readFile(filePath)

    // Validate file size against IPC limits
    if (raw.length > MAX_READ_FILE_SIZE) {
      throw new Error(`File exceeds maximum read size (${(MAX_READ_FILE_SIZE / 1024 / 1024).toFixed(0)} MB)`)
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error(`Invalid ${config.label} file: malformed JSON`)
    }

    const envelope = validateEnvelope(parsed, type)
    if (!envelope) {
      // Attempt bare-object import (no envelope, just raw data)
      if (validateItem(parsed, config)) {
        return { items: [parsed as T], count: 1 }
      }
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((it) => validateItem(it, config))) {
        return { items: parsed as T[], count: parsed.length }
      }
      throw new Error(
        `Invalid ${config.label} file: missing envelope or required fields (${config.requiredFields.join(', ')})`
      )
    }

    const items: T[] = Array.isArray(envelope.data) ? (envelope.data as T[]) : [envelope.data as T]

    const invalid = items.filter((it) => !validateItem(it, config))
    if (invalid.length > 0) {
      throw new Error(`${invalid.length} item(s) missing required fields (${config.requiredFields.join(', ')})`)
    }

    return { items, count: items.length }
  } catch (err) {
    if (err instanceof Error && err.message.includes('cancelled')) return null
    throw err
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the file extension for an entity type (without dot). */
export function getEntityExtension(type: EntityType): string {
  return ENTITY_CONFIGS[type]?.extension ?? 'json'
}

/** Get the display label for an entity type. */
export function getEntityLabel(type: EntityType): string {
  return ENTITY_CONFIGS[type]?.label ?? type
}

/** Re-ID imported items to prevent collisions. Returns new items with fresh UUIDs. */
export function reIdItems<T extends { id?: string }>(items: T[]): T[] {
  return items.map((item) => ({
    ...item,
    id: crypto.randomUUID()
  }))
}
