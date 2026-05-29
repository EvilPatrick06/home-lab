import type { AbilityName, AbilityScoreSet } from '../../types/character-common'

/**
 * Phase 25b — homebrew feat effects. Authors can attach a structured `effects`
 * array to a homebrew feat so it changes derived stats instead of being purely
 * informational. Effects run AFTER official-feat processing so homebrew can
 * stack on top of (but not silently override) the built-in mechanics.
 */
export type HomebrewFeatEffect =
  | { type: 'ability_bonus'; target: AbilityName; value: number }
  | { type: 'skill_proficiency'; target: string }
  | { type: 'damage_resistance'; target: string }
  | { type: 'speed_bonus'; value: number }
  | { type: 'ac_bonus'; value: number }
  | { type: 'custom'; description: string }

export interface HomebrewEffectAccumulator {
  abilityBonuses: Partial<Record<AbilityName, number>>
  skillProficiencies: string[]
  damageResistances: string[]
  speedBonus: number
  acBonus: number
  notes: string[]
}

export function emptyAccumulator(): HomebrewEffectAccumulator {
  return { abilityBonuses: {}, skillProficiencies: [], damageResistances: [], speedBonus: 0, acBonus: 0, notes: [] }
}

/** Fold a single effect into the accumulator. */
export function applyHomebrewEffect(effect: HomebrewFeatEffect, acc: HomebrewEffectAccumulator): void {
  switch (effect.type) {
    case 'ability_bonus':
      acc.abilityBonuses[effect.target] = (acc.abilityBonuses[effect.target] ?? 0) + effect.value
      break
    case 'skill_proficiency':
      if (!acc.skillProficiencies.includes(effect.target)) acc.skillProficiencies.push(effect.target)
      break
    case 'damage_resistance':
      if (!acc.damageResistances.includes(effect.target)) acc.damageResistances.push(effect.target)
      break
    case 'speed_bonus':
      acc.speedBonus += effect.value
      break
    case 'ac_bonus':
      acc.acBonus += effect.value
      break
    case 'custom':
      acc.notes.push(effect.description)
      break
  }
}

/** Collect every homebrew effect across a character's feats into one accumulator. */
export function collectHomebrewFeatEffects(
  feats: ReadonlyArray<{ source?: string; effects?: HomebrewFeatEffect[] }> | null | undefined
): HomebrewEffectAccumulator {
  const acc = emptyAccumulator()
  if (!feats) return acc
  for (const feat of feats) {
    if (feat.source !== 'homebrew' || !Array.isArray(feat.effects)) continue
    for (const effect of feat.effects) applyHomebrewEffect(effect, acc)
  }
  return acc
}

/** Apply collected ability bonuses to a score set (mutates a copy, ability cap 30). */
export function applyAbilityBonuses(
  scores: AbilityScoreSet,
  bonuses: Partial<Record<AbilityName, number>>
): AbilityScoreSet {
  const next = { ...scores }
  for (const [ability, bonus] of Object.entries(bonuses)) {
    const key = ability as AbilityName
    if (key in next && bonus) next[key] = Math.min(30, next[key] + bonus)
  }
  return next
}
