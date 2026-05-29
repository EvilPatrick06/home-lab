/**
 * Ability score extraction for the D&D Beyond import.
 * Maps DDB stat ids + ability-score bonus modifiers into an AbilityScoreSet,
 * plus the class → hit die lookup.
 */

import type { AbilityName, AbilityScoreSet } from '../../../types/character-common'
import type { DdbModifiers } from './ddb-types'

const ID_TO_ABILITY: Record<number, AbilityName> = {
  1: 'strength',
  2: 'dexterity',
  3: 'constitution',
  4: 'intelligence',
  5: 'wisdom',
  6: 'charisma'
}

export function extractAbilityScores(stats: Array<{ id?: number; value?: number }> | undefined): AbilityScoreSet {
  const scores: AbilityScoreSet = {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10
  }
  if (!Array.isArray(stats)) return scores

  for (const stat of stats) {
    const name = ID_TO_ABILITY[stat.id ?? 0]
    if (name && typeof stat.value === 'number') {
      scores[name] = stat.value
    }
  }
  return scores
}

export function applyAbilityBonuses(baseScores: AbilityScoreSet, modifiers: DdbModifiers | undefined): AbilityScoreSet {
  const scores = { ...baseScores }
  if (!modifiers || typeof modifiers !== 'object') return scores

  const subTypeToAbility: Record<string, AbilityName> = {
    'strength-score': 'strength',
    'dexterity-score': 'dexterity',
    'constitution-score': 'constitution',
    'intelligence-score': 'intelligence',
    'wisdom-score': 'wisdom',
    'charisma-score': 'charisma'
  }

  const allModifiers = Object.values(modifiers).flat()
  for (const mod of allModifiers) {
    if (mod.type === 'bonus' && mod.subType && typeof mod.value === 'number') {
      const ability = subTypeToAbility[mod.subType]
      if (ability) {
        scores[ability] += mod.value
      }
    }
  }
  return scores
}

export function getHitDie(className: string): number {
  const hitDice: Record<string, number> = {
    barbarian: 12,
    bard: 8,
    cleric: 8,
    druid: 8,
    fighter: 10,
    monk: 8,
    paladin: 10,
    ranger: 10,
    rogue: 8,
    sorcerer: 6,
    warlock: 8,
    wizard: 6
  }
  return hitDice[className.toLowerCase()] ?? 8
}
