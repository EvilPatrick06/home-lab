/**
 * Downtime activity service — PHB 2024 Ch.8 / DMG 2024 Ch.7
 * Manages between-adventure activities: crafting, training, recuperating, etc.
 */

import type { Campaign, DowntimeProgressEntry } from '../types/campaign'
import { load5eDowntime, loadJson } from './data-provider'

export interface DowntimeActivity {
  id: string
  name: string
  description: string
  daysRequired: number
  goldCostPerDay: number
  requirements: string[]
  outcome: string
  reference: string
  rarityTable?: Array<{ rarity: string; days: number; goldCost: number; minLevel: number }>
  spellLevelTable?: Array<{ level: number; days: number; goldCost: number }>
  potionTable?: Array<{ type: string; days: number; goldCost: number; heals: string }>
}

export interface DowntimeProgress {
  activityId: string
  characterId: string
  characterName: string
  daysSpent: number
  daysRequired: number
  goldSpent: number
  goldRequired: number
  startedAt: string
  details?: string
}

// ─── Extended DMG Activity Types ─────────────────────────────

export interface ExtendedDowntimeCheck {
  check: string
  description: string
}

export interface ExtendedDowntimeResult {
  successes?: number
  rollMin?: number
  rollMax?: number
  result: string
}

export interface ExtendedDowntimeActivity {
  id: string
  name: string
  description: string
  costPerDayGP: number
  minimumDuration?: string
  requirements?: string[]
  resolution: string
  checks?: ExtendedDowntimeCheck[]
  dcBase?: number
  dcGuidelines?: Record<string, number>
  results: ExtendedDowntimeResult[]
  costs?: Record<string, { costPerDayGP: number; description: string }>
  favorExamples?: string[]
  costByLevel?: Array<{
    spellLevel: string
    time: string
    timeDays: number
    cost: string
    costGP: number
  }>
  progressPerDay?: { gpValuePerDay: number; description: string }
  notes?: string
}

// ─── Complication Types ──────────────────────────────────────

export interface ComplicationEntry {
  min: number
  max: number
  result: string
}

export interface ComplicationTables {
  tables: Record<string, ComplicationEntry[]>
}

// ─── PHB Activity Loader ─────────────────────────────────────

let cachedActivities: DowntimeActivity[] | null = null

export async function loadDowntimeActivities(): Promise<DowntimeActivity[]> {
  if (cachedActivities) return cachedActivities
  const data = await load5eDowntime()
  cachedActivities = data as unknown as DowntimeActivity[]
  return cachedActivities
}

// ─── Extended Activity Loaders ───────────────────────────────

const EXTENDED_ACTIVITY_FILES = [
  './data/5e/game/mechanics/downtime/carousing.json',
  './data/5e/game/mechanics/downtime/crime.json',
  './data/5e/game/mechanics/downtime/pit-fighting.json',
  './data/5e/game/mechanics/downtime/religious-service.json',
  './data/5e/game/mechanics/downtime/research.json',
  './data/5e/game/mechanics/downtime/scribing-scrolls.json',
  './data/5e/game/mechanics/downtime/crafting-items.json'
]

let cachedExtended: ExtendedDowntimeActivity[] | null = null

export async function loadExtendedDowntimeActivities(): Promise<ExtendedDowntimeActivity[]> {
  if (cachedExtended) return cachedExtended
  const results = await Promise.all(EXTENDED_ACTIVITY_FILES.map((f) => loadJson<ExtendedDowntimeActivity>(f)))
  cachedExtended = results
  return cachedExtended
}

let cachedComplications: ComplicationTables | null = null

export async function loadComplications(): Promise<ComplicationTables> {
  if (cachedComplications) return cachedComplications
  cachedComplications = await loadJson<ComplicationTables>('./data/5e/game/mechanics/downtime/complications.json')
  return cachedComplications
}

/**
 * Roll on a complication table. Returns the result text.
 */
export function rollComplication(tables: ComplicationTables, tableId: string): ComplicationEntry | null {
  const table = tables.tables[tableId]
  if (!table || table.length === 0) return null
  const max = Math.max(...table.map((e) => e.max))
  const roll = Math.floor(Math.random() * max) + 1
  return table.find((e) => roll >= e.min && roll <= e.max) ?? null
}

/**
 * Calculate the gold cost for a downtime activity.
 */
export function calculateDowntimeCost(
  activity: DowntimeActivity,
  days: number,
  option?: { rarity?: string; spellLevel?: number; potionType?: string }
): { days: number; goldCost: number } {
  // Magic item crafting uses rarity table
  if (activity.rarityTable && option?.rarity) {
    const entry = activity.rarityTable.find((r) => r.rarity === option.rarity)
    if (entry) return { days: entry.days, goldCost: entry.goldCost }
  }

  // Spell scroll uses spell level table
  if (activity.spellLevelTable && option?.spellLevel !== undefined) {
    const entry = activity.spellLevelTable.find((r) => r.level === option.spellLevel)
    if (entry) return { days: entry.days, goldCost: entry.goldCost }
  }

  // Potion brewing uses potion table
  if (activity.potionTable && option?.potionType) {
    const entry = activity.potionTable.find((r) => r.type === option.potionType)
    if (entry) return { days: entry.days, goldCost: entry.goldCost }
  }

  // Standard per-day activities
  return {
    days,
    goldCost: activity.goldCostPerDay * days
  }
}

/**
 * Create a new downtime progress tracker.
 */
export function startDowntime(
  activity: DowntimeActivity,
  characterId: string,
  characterName: string,
  daysRequired: number,
  goldRequired: number,
  details?: string
): DowntimeProgress {
  return {
    activityId: activity.id,
    characterId,
    characterName,
    daysSpent: 0,
    daysRequired,
    goldSpent: 0,
    goldRequired,
    startedAt: new Date().toISOString(),
    details
  }
}

/**
 * Advance a downtime activity by one or more days.
 * Returns updated progress and whether the activity is complete.
 */
export function advanceDowntime(
  progress: DowntimeProgress,
  days: number
): { progress: DowntimeProgress; complete: boolean; goldPerDay: number } {
  const goldPerDay =
    progress.daysRequired > 0 && progress.goldRequired > 0 ? progress.goldRequired / progress.daysRequired : 0
  const goldForDays = goldPerDay * days
  const newDaysSpent = Math.min(progress.daysRequired, progress.daysSpent + days)
  const newGoldSpent = Math.min(progress.goldRequired, progress.goldSpent + goldForDays)

  return {
    progress: {
      ...progress,
      daysSpent: newDaysSpent,
      goldSpent: newGoldSpent
    },
    complete: newDaysSpent >= progress.daysRequired,
    goldPerDay
  }
}

// ─── Campaign Progress Helpers ───────────────────────────────

/**
 * Add a new downtime progress entry to a campaign.
 * Returns updated campaign (caller must save via window.api.saveCampaign).
 */
export function addDowntimeProgress(campaign: Campaign, entry: DowntimeProgressEntry): Campaign {
  return {
    ...campaign,
    downtimeProgress: [...(campaign.downtimeProgress ?? []), entry],
    updatedAt: new Date().toISOString()
  }
}

/**
 * Update an existing downtime progress entry on a campaign.
 */
export function updateDowntimeProgress(
  campaign: Campaign,
  entryId: string,
  updates: Partial<DowntimeProgressEntry>
): Campaign {
  return {
    ...campaign,
    downtimeProgress: (campaign.downtimeProgress ?? []).map((e) => (e.id === entryId ? { ...e, ...updates } : e)),
    updatedAt: new Date().toISOString()
  }
}

/**
 * Remove a downtime progress entry from a campaign.
 */
export function removeDowntimeProgress(campaign: Campaign, entryId: string): Campaign {
  return {
    ...campaign,
    downtimeProgress: (campaign.downtimeProgress ?? []).filter((e) => e.id !== entryId),
    updatedAt: new Date().toISOString()
  }
}

/**
 * Get active (in-progress) downtime entries for a specific character.
 */
export function getActiveDowntimeForCharacter(campaign: Campaign, characterId: string): DowntimeProgressEntry[] {
  return (campaign.downtimeProgress ?? []).filter((e) => e.characterId === characterId && e.status === 'in-progress')
}

/**
 * Advance a tracked downtime entry by N days. Returns the updated campaign
 * and whether the activity is now complete.
 */
export function advanceTrackedDowntime(
  campaign: Campaign,
  entryId: string,
  days: number
): { campaign: Campaign; complete: boolean } {
  const entry = (campaign.downtimeProgress ?? []).find((e) => e.id === entryId)
  if (!entry) return { campaign, complete: false }

  const goldPerDay = entry.daysRequired > 0 && entry.goldRequired > 0 ? entry.goldRequired / entry.daysRequired : 0
  const newDays = Math.min(entry.daysRequired, entry.daysSpent + days)
  const newGold = Math.min(entry.goldRequired, entry.goldSpent + goldPerDay * days)
  const complete = newDays >= entry.daysRequired

  const updated = updateDowntimeProgress(campaign, entryId, {
    daysSpent: newDays,
    goldSpent: newGold,
    status: complete ? 'completed' : 'in-progress'
  })

  return { campaign: updated, complete }
}
