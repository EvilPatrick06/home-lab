/**
 * Bridge between Custom DM Effects (effects-slice) and combat resolution.
 *
 * Reads active CustomEffect[] for a given entity and computes aggregate
 * AC bonuses, attack bonuses, damage bonuses, and resistances/immunities/vulnerabilities.
 */

import { useGameStore } from '../../stores/use-game-store'
import type { MechanicalEffect } from '../../types/effects'

export interface EffectBonuses {
  acBonus: number
  attackBonus: number
  damageBonus: number
  spellDcBonus: number
  savingThrowBonus: number
  resistances: string[]
  immunities: string[]
  vulnerabilities: string[]
}

/**
 * Aggregate mechanical effects for a given entity from the custom effects store.
 * Only considers effects whose condition is 'always' or unset.
 */
export function getCustomEffectBonuses(entityId: string): EffectBonuses {
  const effects = useGameStore.getState().customEffects.filter((e) => e.targetEntityId === entityId)

  const result: EffectBonuses = {
    acBonus: 0,
    attackBonus: 0,
    damageBonus: 0,
    spellDcBonus: 0,
    savingThrowBonus: 0,
    resistances: [],
    immunities: [],
    vulnerabilities: []
  }

  for (const effect of effects) {
    for (const me of effect.effects) {
      if (me.condition && me.condition !== 'always') continue
      applyMechanicalEffect(me, result)
    }
  }

  return result
}

function applyMechanicalEffect(me: MechanicalEffect, result: EffectBonuses): void {
  const val = me.value ?? 0
  switch (me.type) {
    case 'ac_bonus':
      result.acBonus += val
      break
    case 'attack_bonus':
      result.attackBonus += val
      break
    case 'damage_bonus':
      result.damageBonus += val
      break
    case 'spell_dc_bonus':
      result.spellDcBonus += val
      break
    case 'saving_throw_bonus':
      result.savingThrowBonus += val
      break
    case 'resistance':
      if (me.stringValue) result.resistances.push(me.stringValue)
      break
    case 'immunity':
      if (me.stringValue) result.immunities.push(me.stringValue)
      break
    case 'vulnerability':
      if (me.stringValue) result.vulnerabilities.push(me.stringValue)
      break
  }
}

/**
 * Returns the effective AC for a token after applying custom effects.
 */
export function getEffectiveAC(entityId: string, baseAC: number): number {
  const bonuses = getCustomEffectBonuses(entityId)
  return baseAC + bonuses.acBonus
}
