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
  difficulty: 'trivial' | 'easy' | 'moderate' | 'hard' | 'deadly'
  levelRange: { min: number; max: number }
  tactics?: string
  environment?: string
  trigger?: string
  loot?: EncounterLoot
  mapId?: string
  totalXP: number
}
