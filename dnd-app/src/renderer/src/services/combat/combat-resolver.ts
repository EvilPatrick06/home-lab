/**
 * Unified Combat Resolution Pipeline — D&D 5e 2024
 *
 * Wires together dice-service, damage-resolver, effect-resolver-5e,
 * attack-condition-effects, cover-calculator, and combat-rules into
 * a single attack → AC check → damage → broadcast flow.
 *
 * PHB 2024 Chapter 1 (Combat), Chapter 7 (Spellcasting)
 */

import { useGameStore } from '../../stores/use-game-store'
import type { MapToken } from '../../types/map'
import { logger } from '../../utils/logger'
import { type DiceRollResult, rollD20, rollQuiet } from '../dice/dice-service'
import type { ConditionEffectResult } from './attack-condition-effects'
import { broadcastCombatResult, logCombatEntry } from './combat-log'
import {
  type CoverType,
  canGrappleOrShove,
  getCoverDexSaveBonus,
  type MasteryEffectResult,
  unarmedStrikeDC
} from './combat-rules'
import { type DamageResolutionSummary, resolveDamage } from './damage-resolver'
import type { AttackTracker } from './multi-attack-tracker'
import { checkCounterspell, type ReactionPrompt } from './reaction-tracker'

// Re-export extracted modules for backwards compatibility
export {
  type DeathSaveResult,
  type DeathSaveState,
  deathSaveDamageAtZero,
  resolveConcentrationCheck,
  resolveDeathSave
} from './death-mechanics'
export { shouldTriggerLairAction, spendLegendaryAction, useLegendaryResistance } from './legendary-actions'
export {
  canCastAsRitual,
  expendSpellSlot,
  getCantripDiceCount,
  type SpellSlotState,
  scaleCantrip
} from './spell-slot-manager'

// ─── Types ────────────────────────────────────────────────────

export interface AttackResult {
  /** Whether the attack hit */
  hit: boolean
  /** Whether it was a critical hit (nat 20) */
  isCritical: boolean
  /** Whether it was a critical miss (nat 1) */
  isCriticalMiss: boolean
  /** The attack roll result */
  attackRoll: DiceRollResult
  /** Target AC (including cover) */
  targetAC: number
  /** Cover type applied */
  cover: CoverType
  /** Condition effects applied */
  conditionEffects: ConditionEffectResult
  /** Damage resolution (null if miss) */
  damage: DamageResolutionSummary | null
  /** Raw damage rolled before resolution (null if miss) */
  rawDamageRoll: DiceRollResult | null
  /** Weapon mastery effect (null if none) */
  masteryEffect: MasteryEffectResult | null
  /** Graze damage applied on miss (Graze mastery) */
  grazeDamage: number
  /** Whether the attacker couldn't act (incapacitated) */
  attackerBlocked: boolean
  /** Range category for ranged attacks */
  rangeCategory?: 'normal' | 'long' | 'out-of-range'
  /** Feat effects triggered by this attack (Crusher/Piercer/Slasher) */
  featEffects: Array<{ feat: string; effect: string }>
  /** Updated attack tracker after this attack (if tracking multi-attacks) */
  updatedAttackTracker?: AttackTracker
  /** Human-readable summary for chat */
  summary: string
}

export interface SavingThrowRequest {
  /** Entity making the save */
  targetToken: MapToken
  targetName: string
  /** Ability for the save (e.g. "dexterity") */
  ability: string
  /** Save DC */
  dc: number
  /** Save modifier (ability mod + proficiency if proficient) */
  saveModifier: number
  /** Damage formula on failed save (optional) */
  damageFormula?: string
  /** Damage type */
  damageType?: string
  /** Half damage on success? */
  halfOnSuccess?: boolean
  /** Additional effects on failure */
  failureEffect?: string
  /** Caster/source name */
  sourceName: string
  /** Spell/ability name */
  abilityName: string
  /** Conditions on the target (for advantage/disadvantage on saves) */
  targetConditions?: Array<{ name: string; value?: number }>
  /** Whether this is a DM roll */
  isSecretRoll?: boolean
  /** Cover type for DEX saves (provides bonus) */
  cover?: CoverType
  /** Caster's token (for counterspell range checking) */
  casterToken?: MapToken
  /** Nearby enemies who might counterspell (for reaction checks) */
  nearbyCounterspellers?: Array<{
    entityId: string
    entityName: string
    x: number
    y: number
    hasCounterspell: boolean
    hasSpellSlots: boolean
  }>
  /** Grid cell size in pixels (for distance calculation) */
  cellSizeFt?: number
}

export interface SavingThrowResult {
  /** Whether the save succeeded */
  success: boolean
  /** The save roll */
  saveRoll: DiceRollResult
  /** Total rolled (including modifier) */
  total: number
  /** The DC */
  dc: number
  /** Damage dealt (0 if save succeeded with no half-damage) */
  damage: DamageResolutionSummary | null
  /** Counterspell reaction prompts triggered by this spell cast */
  counterspellPrompts: ReactionPrompt[]
  /** Summary for chat */
  summary: string
}

export interface GrappleRequest {
  attackerToken: MapToken
  targetToken: MapToken
  attackerName: string
  targetName: string
  /** Attacker's Athletics modifier (not used for DC, kept for display) */
  attackerAthleticsBonus: number
  /** Target's STR or DEX saving throw modifier (target's choice per PHB 2024) */
  targetEscapeBonus: number
  /** Attacker's STR score (for Unarmed Strike DC: 8 + STR mod + proficiency) */
  attackerStrScore: number
  /** Attacker's proficiency bonus */
  proficiencyBonus: number
}

export interface GrappleResult {
  success: boolean
  /** Attacker's contested roll */
  attackerRoll: DiceRollResult
  /** Target's save roll */
  targetRoll: DiceRollResult
  /** Unarmed strike DC */
  dc: number
  summary: string
}

export interface ShoveRequest {
  attackerToken: MapToken
  targetToken: MapToken
  attackerName: string
  targetName: string
  /** Attacker's Athletics modifier (not used for DC, kept for display) */
  attackerAthleticsBonus: number
  /** Target's STR or DEX saving throw modifier (target's choice per PHB 2024) */
  targetEscapeBonus: number
  /** Attacker's STR score (for Unarmed Strike DC: 8 + STR mod + proficiency) */
  attackerStrScore: number
  /** Attacker's proficiency bonus */
  proficiencyBonus: number
  /** Shove prone or push 5ft */
  shoveType: 'prone' | 'push'
}

export type ShoveResult = GrappleResult

// ─── Internal Helpers ─────────────────────────────────────────

/** The zero-roll sentinel shared by grapple/shove "too large" early-returns. */
const ZERO_DICE_ROLL: GrappleResult['attackerRoll'] = {
  formula: '—',
  rolls: [0],
  total: 0,
  natural20: false,
  natural1: false
}

/**
 * Builds a failed GrappleResult / ShoveResult for the size-check early-exit.
 */
function makeGrappleShoveFailure(summary: string): GrappleResult {
  return { success: false, attackerRoll: ZERO_DICE_ROLL, targetRoll: ZERO_DICE_ROLL, dc: 0, summary }
}

// ─── Combat Resolver Functions ────────────────────────────────

/**
 * Resolve a saving throw (typically from a spell or ability).
 */
export function resolveSavingThrow(request: SavingThrowRequest): SavingThrowResult {
  const {
    targetToken,
    targetName,
    ability,
    dc,
    saveModifier,
    damageFormula,
    damageType,
    halfOnSuccess = false,
    failureEffect,
    sourceName,
    abilityName: _abilityName,
    targetConditions = [],
    isSecretRoll = false,
    cover,
    casterToken,
    nearbyCounterspellers,
    cellSizeFt = 5
  } = request

  // ── Check for counterspell reactions ──
  let counterspellPrompts: ReactionPrompt[] = []
  if (casterToken && nearbyCounterspellers && nearbyCounterspellers.length > 0) {
    counterspellPrompts = checkCounterspell(
      casterToken.entityId,
      sourceName,
      casterToken.gridX,
      casterToken.gridY,
      nearbyCounterspellers,
      cellSizeFt
    )
  }

  // DEX save cover bonus
  let totalModifier = saveModifier
  if (ability.toLowerCase() === 'dexterity' && cover) {
    totalModifier += getCoverDexSaveBonus(cover)
  }

  // Check for condition-based advantage on saves
  const hasAdvantage = targetConditions.some(
    (c) => c.name.toLowerCase() === 'magic resistance' // Monsters with Magic Resistance
  )

  const saveRoll = rollD20(totalModifier, {
    label: `${ability} Save`,
    silent: true,
    secret: isSecretRoll,
    advantage: hasAdvantage
  })

  const total = saveRoll.total
  const success = total >= dc

  // Resolve damage
  let damage: DamageResolutionSummary | null = null
  if (damageFormula && damageType) {
    const rawDmg = rollQuiet(damageFormula)
    let damageAmount = rawDmg.total

    if (success && halfOnSuccess) {
      damageAmount = Math.floor(damageAmount / 2)
    } else if (success) {
      damageAmount = 0
    }

    if (damageAmount > 0) {
      damage = resolveDamage(
        [{ rawDamage: damageAmount, damageType, isMagical: true }],
        targetToken.resistances ?? [],
        targetToken.immunities ?? [],
        targetToken.vulnerabilities ?? [],
        false,
        false
      )

      // Apply damage
      applyDamageToToken(targetToken, damage.totalFinalDamage)
    }
  }

  // Build summary
  const parts: string[] = []
  parts.push(`${targetName} rolls ${ability} save: ${saveRoll.total} vs DC ${dc}`)
  parts.push(success ? '— Success!' : '— Failure!')
  if (damage && damage.totalFinalDamage > 0) {
    parts.push(`Takes ${damage.totalFinalDamage} ${damageType} damage.`)
  } else if (success && halfOnSuccess && damage) {
    parts.push(`Takes ${damage.totalFinalDamage} ${damageType} damage (halved).`)
  }
  if (!success && failureEffect) {
    parts.push(`Effect: ${failureEffect}`)
  }
  const summary = parts.join(' ')

  // Log
  logCombatEntry({
    type: 'save',
    sourceEntityName: sourceName,
    targetEntityId: targetToken.entityId,
    targetEntityName: targetName,
    value: damage?.totalFinalDamage ?? 0,
    damageType,
    description: summary
  })

  broadcastCombatResult(summary, isSecretRoll)

  return { success, saveRoll, total, dc, damage, counterspellPrompts, summary }
}

/**
 * Resolve a grapple attempt (PHB 2024).
 * Attacker: Unarmed Strike save DC (8 + STR mod + proficiency).
 * Target: STR or DEX save (target's choice).
 */
export function resolveGrapple(request: GrappleRequest): GrappleResult {
  const {
    attackerToken,
    targetToken,
    attackerName,
    targetName,
    attackerStrScore,
    proficiencyBonus,
    targetEscapeBonus
  } = request

  // Size check
  if (!canGrappleOrShove(attackerToken, targetToken)) {
    return makeGrappleShoveFailure(`${attackerName} cannot grapple ${targetName} — target is too large!`)
  }

  const dc = unarmedStrikeDC(attackerStrScore, proficiencyBonus)
  const attackerRoll = rollD20(0, { label: 'Grapple DC', silent: true })
  const targetRoll = rollD20(targetEscapeBonus, { label: 'Escape Grapple', silent: true })
  const success = targetRoll.total < dc

  const summary = success
    ? `${attackerName} grapples ${targetName}! (DC ${dc}, target rolled ${targetRoll.total}) — ${targetName} is Grappled.`
    : `${attackerName}'s grapple attempt fails! (DC ${dc}, target rolled ${targetRoll.total})`

  // Apply grappled condition on success
  if (success) {
    const gameStore = useGameStore.getState()
    gameStore.addCondition({
      id: crypto.randomUUID(),
      entityId: targetToken.entityId,
      entityName: targetName,
      condition: 'Grappled',
      duration: 'permanent',
      source: `Grappled by ${attackerName}`,
      sourceEntityId: attackerToken.entityId,
      appliedRound: gameStore.round
    })
  }

  logCombatEntry({
    type: 'attack',
    sourceEntityId: attackerToken.entityId,
    sourceEntityName: attackerName,
    targetEntityId: targetToken.entityId,
    targetEntityName: targetName,
    description: summary
  })

  broadcastCombatResult(summary, false)

  return { success, attackerRoll, targetRoll, dc, summary }
}

/**
 * Resolve a shove attempt (PHB 2024).
 * Same DC as grapple. Target falls Prone or is pushed 5 ft.
 */
export function resolveShove(request: ShoveRequest): ShoveResult {
  const {
    attackerToken,
    targetToken,
    attackerName,
    targetName,
    attackerStrScore,
    proficiencyBonus,
    targetEscapeBonus,
    shoveType
  } = request

  if (!canGrappleOrShove(attackerToken, targetToken)) {
    return makeGrappleShoveFailure(`${attackerName} cannot shove ${targetName} — target is too large!`)
  }

  const dc = unarmedStrikeDC(attackerStrScore, proficiencyBonus)
  const attackerRoll = rollD20(0, { label: 'Shove DC', silent: true })
  const targetRoll = rollD20(targetEscapeBonus, { label: 'Resist Shove', silent: true })
  const success = targetRoll.total < dc

  let summary: string
  if (success && shoveType === 'prone') {
    summary = `${attackerName} shoves ${targetName} Prone! (DC ${dc}, target rolled ${targetRoll.total})`
    const gameStore = useGameStore.getState()
    gameStore.addCondition({
      id: crypto.randomUUID(),
      entityId: targetToken.entityId,
      entityName: targetName,
      condition: 'Prone',
      duration: 'permanent',
      source: `Shoved by ${attackerName}`,
      sourceEntityId: attackerToken.entityId,
      appliedRound: gameStore.round
    })
  } else if (success && shoveType === 'push') {
    summary = `${attackerName} pushes ${targetName} 5 ft away! (DC ${dc}, target rolled ${targetRoll.total})`
  } else {
    summary = `${attackerName}'s shove attempt fails! (DC ${dc}, target rolled ${targetRoll.total})`
  }

  logCombatEntry({
    type: 'attack',
    sourceEntityId: attackerToken.entityId,
    sourceEntityName: attackerName,
    targetEntityId: targetToken.entityId,
    targetEntityName: targetName,
    description: summary
  })

  broadcastCombatResult(summary, false)

  return { success, attackerRoll, targetRoll, dc, summary }
}

// ─── Helpers ──────────────────────────────────────────────────

/** Apply damage to a token's HP via the game store. */
function applyDamageToToken(token: MapToken, damage: number): void {
  if (damage <= 0) return
  const gameStore = useGameStore.getState()
  const map = gameStore.maps.find((m) => m.id === gameStore.activeMapId)
  if (!map) {
    logger.warn(
      `[CombatResolver] applyDamageToToken: no active map found (activeMapId=${gameStore.activeMapId}). Damage of ${damage} to "${token.label}" was not applied.`
    )
    return
  }

  const currentHP = token.currentHP ?? 0
  const newHP = Math.max(0, currentHP - damage)
  gameStore.updateToken(map.id, token.id, { currentHP: newHP })
}
