import { useGameStore } from '../../stores/use-game-store'
import type { MapToken } from '../../types/map'
import { type DiceRollResult, roll, rollQuiet } from '../dice/dice-service'
import type { ConditionEffectResult } from './attack-condition-effects'
import type { CoverType, MasteryEffectResult } from './combat-rules'
import type { DamageResolutionSummary } from './damage-resolver'

/**
 * Roll damage with critical hit doubling (PHB 2024: double damage dice, not modifier).
 */
export function rollDamage(
  formula: string,
  isCritical: boolean,
  extraDice: Array<{ formula: string; damageType: string }>,
  isSecret: boolean
): DiceRollResult {
  if (isCritical) {
    // Double the dice count for critical hits
    const critFormula = doubleDiceInFormula(formula)
    const critResult = roll(critFormula, { silent: true, secret: isSecret })

    // Extra damage dice also doubled on crit
    let extraTotal = 0
    for (const extra of extraDice) {
      const doubled = doubleDiceInFormula(extra.formula)
      const extraRoll = rollQuiet(doubled)
      extraTotal += extraRoll.total
    }

    return {
      ...critResult,
      total: critResult.total + extraTotal
    }
  }

  const baseResult = roll(formula, { silent: true, secret: isSecret })
  let extraTotal = 0
  for (const extra of extraDice) {
    const extraRoll = rollQuiet(extra.formula)
    extraTotal += extraRoll.total
  }

  return {
    ...baseResult,
    total: baseResult.total + extraTotal
  }
}

/**
 * Double the dice count in a formula (for critical hits).
 * "2d6+4" -> "4d6+4", "1d8+3" -> "2d8+3"
 */
export function doubleDiceInFormula(formula: string): string {
  return formula.replace(/(\d*)d(\d+)/, (_, count, sides) => {
    const n = count ? parseInt(count, 10) : 1
    return `${n * 2}d${sides}`
  })
}

/** Apply damage to a token's HP via the game store. */
export function applyDamageToToken(token: MapToken, damage: number): void {
  if (damage <= 0) return
  const gameStore = useGameStore.getState()
  const map = gameStore.maps.find((m) => m.id === gameStore.activeMapId)
  if (!map) return

  const currentHP = token.currentHP ?? 0
  const newHP = Math.max(0, currentHP - damage)
  gameStore.updateToken(map.id, token.id, { currentHP: newHP })
}

/** Build a human-readable attack summary. */
export function buildAttackSummary(
  attackerName: string,
  targetName: string,
  weaponName: string,
  attackRoll: DiceRollResult,
  targetAC: number,
  hit: boolean,
  isCritical: boolean,
  isCriticalMiss: boolean,
  damage: DamageResolutionSummary | null,
  grazeDamage: number,
  cover: CoverType,
  conditionEffects: ConditionEffectResult,
  masteryEffect: MasteryEffectResult | null
): string {
  const parts: string[] = []

  // Attack roll
  if (isCritical) {
    parts.push(`${attackerName} rolls a CRITICAL HIT with ${weaponName} against ${targetName}!`)
  } else if (isCriticalMiss) {
    parts.push(`${attackerName} rolls a Critical Miss with ${weaponName} against ${targetName}.`)
  } else if (hit) {
    parts.push(`${attackerName} hits ${targetName} with ${weaponName}! (${attackRoll.total} vs AC ${targetAC})`)
  } else {
    parts.push(`${attackerName} misses ${targetName} with ${weaponName}. (${attackRoll.total} vs AC ${targetAC})`)
  }

  // Cover
  if (cover !== 'none') {
    parts.push(`[${cover} cover]`)
  }

  // Advantage/disadvantage
  if (conditionEffects.rollMode !== 'normal') {
    parts.push(`[${conditionEffects.rollMode}]`)
  }

  // Damage
  if (hit && damage) {
    const dmgParts: string[] = []
    for (const r of damage.results) {
      let desc = `${r.finalDamage} ${r.damageType}`
      if (r.modification !== 'normal') desc += ` (${r.modification})`
      dmgParts.push(desc)
    }
    parts.push(`Damage: ${dmgParts.join(', ')}`)
  }

  // Graze
  if (!hit && grazeDamage > 0) {
    parts.push(`Graze: ${grazeDamage} damage.`)
  }

  // Mastery effect
  if (hit && masteryEffect && masteryEffect.mastery !== 'Graze') {
    parts.push(`[${masteryEffect.mastery}: ${masteryEffect.description}]`)
  }

  return parts.join(' ')
}
