import type { DeepPartial } from './library'
import type { MonsterStatBlock } from './monster'

export interface EncounterMonster {
  monsterId: string
  count: number
  notes?: string
  /**
   * Stable per-placement id (Phase 15e / Phase 26). Two patterns for "N of the same
   * monster": `count: N` for identical stamp-outs that share one entry, vs. separate
   * entries with distinct `instanceId` + `instanceOverrides` for individually-customized
   * copies. Optional for backward compatibility with `{ monsterId, count }` records.
   */
  instanceId?: string
  /** Pre-position on the encounter map, in grid squares (Phase 26 coordinates against this). */
  startX?: number
  startY?: number
  /**
   * Per-instance overrides deep-merged over the live library stat block resolved from
   * `monsterId`. Arrays replace atomically (e.g. `instanceOverrides.actions = [...]` forks
   * that instance's action list); object fields merge key-by-key so unrelated library
   * fixes still propagate. Runtime state (current HP, conditions) never lives here — it
   * lives on the placed token, not the encounter record.
   */
  instanceOverrides?: DeepPartial<MonsterStatBlock>
}

/**
 * Phase 26d — encounter waves. A wave is a group of monsters that deploys
 * together (e.g. reinforcements arriving on round 3). `triggerCondition` is
 * free-text only — no automation.
 */
export interface EncounterWave {
  id: string
  name: string
  monsters: EncounterMonster[]
  triggerCondition?: string
}

export interface EncounterLoot {
  currency?: { cp?: number; sp?: number; ep?: number; gp?: number; pp?: number }
  items?: Array<{ name: string; quantity: number; description?: string }>
}

export interface Encounter {
  id: string
  name: string
  description: string
  readAloudText?: string
  monsters: EncounterMonster[]
  /**
   * Phase 26d — optional wave breakdown. When present, `monsters` is the flat
   * union of every wave's monsters (kept for back-compat with consumers that
   * don't understand waves); `waves` carries the staged grouping.
   */
  waves?: EncounterWave[]
  difficulty: 'trivial' | 'easy' | 'moderate' | 'hard' | 'deadly'
  levelRange: { min: number; max: number }
  tactics?: string
  environment?: string
  trigger?: string
  loot?: EncounterLoot
  mapId?: string
  totalXP: number
}

/**
 * Phase 26d — normalize a raw/legacy encounter so `waves` is always populated.
 * A flat `monsters` list with no `waves` becomes a single "Wave 1". `monsters`
 * is kept as the flat union for back-compat.
 */
export function migrateEncounter(raw: Record<string, unknown>): Encounter {
  const enc = raw as unknown as Encounter
  const monsters = Array.isArray(enc.monsters) ? enc.monsters : []
  if (Array.isArray(enc.waves) && enc.waves.length > 0) {
    // Ensure the flat list mirrors the union of waves.
    const flat = enc.waves.flatMap((w) => w.monsters ?? [])
    return { ...enc, monsters: monsters.length > 0 ? monsters : flat }
  }
  return {
    ...enc,
    monsters,
    waves: [{ id: 'wave-1', name: 'Wave 1', monsters }]
  }
}
