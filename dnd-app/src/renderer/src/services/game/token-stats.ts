import { useMemo } from 'react'
import { useLibraryStore } from '../../stores/use-library-store'
import type { MapToken } from '../../types/map'
import type { MonsterStatBlock } from '../../types/monster'
import { logger } from '../../utils/logger'

/**
 * Phase 15e — token live stat resolution.
 *
 * A placed token references its source stat block by `monsterStatBlockId`. Library-derived
 * base stats (max HP, AC, speeds, senses, resistances/immunities/vulnerabilities, CR) should
 * resolve LIVE from the library so a DM's rebalance of the source monster reaches every token
 * that references it — no rebuild, no reload. The inline fields on the token act as
 * per-instance overrides (a DM bumping THIS goblin's HP) and as the fallback for tokens that
 * have no library backing at all (player characters, custom creatures, summons/companions).
 *
 * Resolution order per field: inline override (if defined) → live library value → undefined.
 */

const STAT_BLOCK_CATEGORIES = ['monsters', 'npcs', 'creatures'] as const

export interface EffectiveTokenStats {
  maxHP?: number
  ac?: number
  walkSpeed?: number
  flySpeed?: number
  swimSpeed?: number
  climbSpeed?: number
  resistances?: string[]
  vulnerabilities?: string[]
  immunities?: string[]
  darkvision?: boolean
  darkvisionRange?: number
  specialSenses?: Array<{ type: 'blindsight' | 'tremorsense' | 'truesight'; range: number }>
  cr?: string
  /** True when a live library stat block backed this resolution (vs. pure inline fallback). */
  libraryBacked: boolean
}

/** Build the token-shaped specialSenses array from a monster's senses block (excludes darkvision). */
function monsterSpecialSenses(monster: MonsterStatBlock): EffectiveTokenStats['specialSenses'] {
  const out: NonNullable<EffectiveTokenStats['specialSenses']> = []
  if (monster.senses.blindsight) out.push({ type: 'blindsight', range: monster.senses.blindsight })
  if (monster.senses.tremorsense) out.push({ type: 'tremorsense', range: monster.senses.tremorsense })
  if (monster.senses.truesight) out.push({ type: 'truesight', range: monster.senses.truesight })
  return out.length > 0 ? out : undefined
}

/**
 * Pure resolver. Given a token and its (optionally) resolved source stat block, return the
 * effective base stats. Inline token fields override the library value when defined.
 */
export function resolveTokenStats(token: MapToken, monster?: MonsterStatBlock): EffectiveTokenStats {
  const libraryBacked = monster != null
  return {
    maxHP: token.maxHP ?? monster?.hp,
    ac: token.ac ?? monster?.ac,
    walkSpeed: token.walkSpeed ?? monster?.speed.walk,
    flySpeed: token.flySpeed ?? monster?.speed.fly,
    swimSpeed: token.swimSpeed ?? monster?.speed.swim,
    climbSpeed: token.climbSpeed ?? monster?.speed.climb,
    resistances: token.resistances ?? monster?.resistances,
    vulnerabilities: token.vulnerabilities ?? monster?.vulnerabilities,
    immunities: token.immunities ?? monster?.damageImmunities,
    darkvision: token.darkvision ?? (monster?.senses.darkvision != null ? true : undefined),
    darkvisionRange: token.darkvisionRange ?? monster?.senses.darkvision,
    specialSenses: token.specialSenses ?? (monster ? monsterSpecialSenses(monster) : undefined),
    cr: monster?.cr,
    libraryBacked
  }
}

/**
 * Look up a token's source stat block in the library truth store, scanning the three
 * stat-block categories (`monsters`, `npcs`, `creatures`) that `loadAllStatBlocks` aggregates.
 * Returns `undefined` when the token has no `monsterStatBlockId` or the entry isn't loaded
 * (bootstrap incomplete, custom/player token, deleted entry).
 */
export function lookupTokenStatBlock(id: string | undefined): MonsterStatBlock | undefined {
  if (!id) return undefined
  const { getEntry } = useLibraryStore.getState()
  for (const category of STAT_BLOCK_CATEGORIES) {
    const entry = getEntry(category, id)
    if (entry) return entry as unknown as MonsterStatBlock
  }
  return undefined
}

/**
 * Imperative accessor: effective, live-resolved base stats for a token. For use outside React
 * (canvas draw loops, services, network sync, chat commands). Resolves the source stat block
 * from the library truth store at call time, applying inline token fields as per-instance
 * overrides. React components that need re-render-on-library-edit should prefer
 * `useEffectiveTokenStats`.
 */
export function getTokenStats(token: MapToken): EffectiveTokenStats {
  return resolveTokenStats(token, lookupTokenStatBlock(token.monsterStatBlockId))
}

/**
 * React hook: effective, live-resolved base stats for a token. Re-renders when the referenced
 * library stat block changes (a rebalance propagates to the open token panel within one frame).
 */
export function useEffectiveTokenStats(token: MapToken): EffectiveTokenStats {
  const entries = useLibraryStore((s) => s.entries)
  return useMemo(() => {
    let monster: MonsterStatBlock | undefined
    const id = token.monsterStatBlockId
    if (id) {
      for (const category of STAT_BLOCK_CATEGORIES) {
        const found = entries[category]?.[id]
        if (found) {
          monster = found as unknown as MonsterStatBlock
          break
        }
      }
    }
    return resolveTokenStats(token, monster)
  }, [token, entries])
}

/**
 * Phase 17c (LOG-4) — the target's saving-throw modifier for an area-effect save. Pulls the
 * proficient save bonus (or the bare ability modifier) from the token's linked library stat
 * block. Falls back to +0 with a logged warning for tokens with no stat block (player/custom),
 * which is safer than silently inflating AoE damage by omitting the modifier entirely.
 *
 * `ability` accepts long or short names ("dexterity"/"dex"); only the first three letters matter.
 */
export function getCreatureSaveMod(token: MapToken, ability: string): number {
  const key = ability.slice(0, 3).toLowerCase() as 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'
  const monster = lookupTokenStatBlock(token.monsterStatBlockId)
  if (monster) {
    const save = monster.savingThrows?.[key]
    if (save !== undefined) return save
    const score = monster.abilityScores?.[key]
    if (score !== undefined) return Math.floor((score - 10) / 2)
  }
  logger.warn(`[combat] AoE save: no stat block for token "${token.label}" — using +0 save modifier`)
  return 0
}
