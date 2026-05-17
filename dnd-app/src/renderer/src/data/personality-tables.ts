import { addToast } from '../hooks/use-toast'
import { load5ePersonalityTables } from '../services/data-provider'
import type { AbilityScoreSet } from '../types/character-common'
import { logger } from '../utils/logger'

export const ABILITY_PERSONALITY: Record<string, { high: string[]; low: string[] }> = {}
export const ALIGNMENT_PERSONALITY: Record<string, string[]> = {}

load5ePersonalityTables()
  .then((data) => {
    Object.assign(ABILITY_PERSONALITY, data.ability)
    Object.assign(ALIGNMENT_PERSONALITY, data.alignment)
  })
  .catch((err) => {
    logger.error('Failed to load personality tables', err)
    addToast('Failed to load personality tables', 'error')
  })

// Phase 17l — renamed from `rollD4` (which used a hard-coded `4` for the
// upper bound, silently restricting every personality roll to the first
// four entries of every table). Now samples from the full array length.
function rollFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/**
 * Rolls personality trait suggestions based on ability scores and alignment.
 * PHB pg 39-40 tables.
 *
 * - Ability scores >= 12 → roll on "high" table
 * - Ability scores <= 9 → roll on "low" table
 * - Scores 10-11 → skip (average)
 * - Alignment parsed into components (e.g. "Lawful Good" → Lawful + Good)
 *
 * Phase 17l — deduped at the end so two ability rolls that happen to
 * return the same suggestion don't paint the same trait into the output
 * twice in a row.
 */
export function rollPersonalityTraits(
  abilityScores: AbilityScoreSet,
  backgroundBonuses: Record<string, number>,
  alignment: string
): string[] {
  const traits: string[] = []

  // Ability-based traits
  for (const [ability, table] of Object.entries(ABILITY_PERSONALITY)) {
    const base = abilityScores[ability as keyof AbilityScoreSet] ?? 10
    const bonus = backgroundBonuses[ability] ?? 0
    const final = base + bonus
    if (final >= 12) {
      traits.push(rollFrom(table.high))
    } else if (final <= 9) {
      traits.push(rollFrom(table.low))
    }
  }

  // Alignment-based traits
  if (alignment) {
    const parts = alignment.split(' ')
    if (alignment === 'Neutral') {
      // Pure Neutral — roll once on Neutral table
      traits.push(rollFrom(ALIGNMENT_PERSONALITY.Neutral))
    } else {
      for (const part of parts) {
        const table = ALIGNMENT_PERSONALITY[part]
        if (table) {
          traits.push(rollFrom(table))
        }
      }
    }
  }

  // Dedup so duplicate suggestions from different sources don't repeat.
  return Array.from(new Set(traits))
}
