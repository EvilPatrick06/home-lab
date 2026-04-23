import { useGameStore } from '../../stores/use-game-store'
import type { Character5e } from '../../types/character-5e'
import type { MapToken } from '../../types/map'
import { rollSingle } from '../dice/dice-service'
import { getAttackConditionEffects } from './attack-condition-effects'
import type { AttackOptions, AttackResult } from './attack-types'
import { getCoverACBonus, isAdjacent } from './combat-rules'
import { calculateCover } from './cover-calculator'
import type { DamageResolutionSummary } from './damage-resolver'
import { resolveDamage } from './damage-resolver'

// ─── Helpers ──────────────────────────────────────────────────

function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

// ─── Unarmed Strike (PHB 2024) ────────────────────────────────

/**
 * Resolve an Unarmed Strike (damage option) per PHB 2024.
 *
 * Attack roll: STR mod + proficiency bonus.
 * Damage: 1 + STR modifier (Bludgeoning).
 *
 * For Monk: damage uses martial arts die if higher.
 */
export function resolveUnarmedStrike(
  character: Character5e,
  attackerToken: MapToken,
  targetToken: MapToken,
  options: AttackOptions & { monkDie?: number } = {}
): AttackResult {
  const gameState = useGameStore.getState()

  const strMod = abilityModifier(character.abilityScores.strength)
  const dexMod = abilityModifier(character.abilityScores.dexterity)
  const profBonus = Math.ceil(character.level / 4) + 1

  // Monk can use DEX for unarmed strikes
  const isMonk = character.classes.some((c) => c.name.toLowerCase() === 'monk')
  const attackAbilityMod = isMonk ? Math.max(strMod, dexMod) : strMod

  const totalAttackBonus = attackAbilityMod + profBonus

  // Range: must be adjacent (5ft reach)
  const adjacentToTarget = isAdjacent(attackerToken, targetToken)
  if (!adjacentToTarget) {
    return {
      attackerName: character.name,
      targetName: targetToken.label,
      weaponName: 'Unarmed Strike',
      attackRoll: 0,
      attackTotal: 0,
      targetAC: targetToken.ac ?? 10,
      coverType: 'none',
      coverACBonus: 0,
      isHit: false,
      isCrit: false,
      isFumble: false,
      rollMode: 'normal',
      advantageSources: [],
      disadvantageSources: [],
      damageRolls: [],
      damageTotal: 0,
      damageType: 'bludgeoning',
      damageResolution: null,
      masteryEffect: null,
      extraDamage: [],
      rangeCategory: 'out-of-range',
      exhaustionPenalty: 0
    }
  }

  // Cover
  const activeMap = gameState.maps.find((m) => m.id === gameState.activeMapId)
  const walls = activeMap?.wallSegments ?? []
  const tokens = activeMap?.tokens ?? []
  const cellSize = activeMap?.grid.cellSize ?? 64
  const coverType = calculateCover(attackerToken, targetToken, walls, cellSize, tokens)
  const coverACBonus = getCoverACBonus(coverType)
  const targetAC = (targetToken.ac ?? 10) + coverACBonus

  // Conditions
  const attackerConditions = gameState.conditions
    .filter((c) => c.entityId === attackerToken.id || c.entityId === attackerToken.entityId)
    .map((c) => ({ name: c.condition, value: c.value }))
  const targetConditions = gameState.conditions
    .filter((c) => c.entityId === targetToken.id || c.entityId === targetToken.entityId)
    .map((c) => ({ name: c.condition, value: c.value }))

  const anyEnemyNearAttacker = tokens.some(
    (t) =>
      t.id !== attackerToken.id && t.id !== targetToken.id && t.entityType === 'enemy' && isAdjacent(attackerToken, t)
  )
  const targetTurnState = gameState.turnStates[targetToken.entityId ?? targetToken.id]

  const conditionEffects = getAttackConditionEffects(attackerConditions, targetConditions, {
    isRanged: false,
    isWithin5ft: true,
    anyEnemyWithin5ftOfAttacker: anyEnemyNearAttacker,
    targetIsDodging: targetTurnState?.isDodging,
    targetEntityId: targetToken.entityId ?? targetToken.id,
    isUnderwater: gameState.underwaterCombat,
    weaponDamageType: 'bludgeoning',
    attackerHasSwimSpeed: (character.speeds?.swim ?? 0) > 0
  })

  const advantageSources = [...conditionEffects.advantageSources]
  const disadvantageSources = [...conditionEffects.disadvantageSources]
  if (options.forceAdvantage) advantageSources.push('Forced advantage')
  if (options.forceDisadvantage) disadvantageSources.push('Forced disadvantage')

  let rollMode: 'advantage' | 'disadvantage' | 'normal' = 'normal'
  if (advantageSources.length > 0 && disadvantageSources.length > 0) {
    rollMode = 'normal'
  } else if (advantageSources.length > 0) {
    rollMode = 'advantage'
  } else if (disadvantageSources.length > 0) {
    rollMode = 'disadvantage'
  }

  // Roll attack
  let attackRoll: number
  if (rollMode === 'advantage') {
    attackRoll = Math.max(rollSingle(20), rollSingle(20))
  } else if (rollMode === 'disadvantage') {
    attackRoll = Math.min(rollSingle(20), rollSingle(20))
  } else {
    attackRoll = rollSingle(20)
  }

  const isCrit = attackRoll === 20
  const isFumble = attackRoll === 1
  const exhaustionPenalty = conditionEffects.exhaustionPenalty
  const attackTotal = attackRoll + totalAttackBonus + exhaustionPenalty
  const isHit = isCrit || (!isFumble && attackTotal >= targetAC)

  // Damage: 1 + STR mod (or Monk martial arts die if higher)
  let damageRolls: number[] = []
  let damageTotal = 0
  let damageResolution: DamageResolutionSummary | null = null

  if (isHit) {
    const baseDamage = 1 + (isMonk ? attackAbilityMod : strMod)

    if (options.monkDie && options.monkDie > 0) {
      const monkDmgRoll = rollSingle(options.monkDie)
      const monkDmg = monkDmgRoll + attackAbilityMod
      if (monkDmg > baseDamage) {
        damageRolls = [monkDmgRoll]
        damageTotal = Math.max(0, monkDmg)
      } else {
        damageTotal = Math.max(0, baseDamage)
      }
    } else {
      damageTotal = Math.max(0, baseDamage)
    }

    // On crit: the "1" in "1 + STR" isn't a die, but Monk martial arts die doubles
    if (isCrit && options.monkDie && damageRolls.length > 0) {
      const extraRoll = rollSingle(options.monkDie)
      damageRolls.push(extraRoll)
      damageTotal += extraRoll
    }

    damageResolution = resolveDamage(
      [{ rawDamage: damageTotal, damageType: 'bludgeoning', isMagical: false }],
      targetToken.resistances ?? [],
      targetToken.immunities ?? [],
      targetToken.vulnerabilities ?? [],
      false,
      false,
      gameState.underwaterCombat,
      profBonus
    )
  }

  return {
    attackerName: character.name,
    targetName: targetToken.label,
    weaponName: 'Unarmed Strike',
    attackRoll,
    attackTotal,
    targetAC,
    coverType,
    coverACBonus,
    isHit,
    isCrit,
    isFumble,
    rollMode,
    advantageSources,
    disadvantageSources,
    damageRolls,
    damageTotal,
    damageType: 'bludgeoning',
    damageResolution,
    masteryEffect: null,
    extraDamage: [],
    rangeCategory: 'melee',
    exhaustionPenalty
  }
}
