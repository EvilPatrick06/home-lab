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
import type { Character5e } from '../../types/character-5e'
import type { EntityCondition, TurnState } from '../../types/game-state'
import type { MapToken, WallSegment } from '../../types/map'
import { getDamageTypeFeatEffects } from '../character/feat-mechanics-5e'
import { type DiceRollOptions, type DiceRollResult, roll, rollD20, rollQuiet } from '../dice/dice-service'
import {
  type AttackConditionContext,
  type ConditionEffectResult,
  getAttackConditionEffects
} from './attack-condition-effects'
import { broadcastCombatResult, logCombatEntry } from './combat-log'
import {
  type CoverType,
  canGrappleOrShove,
  checkRangedRange,
  getCoverACBonus,
  getCoverDexSaveBonus,
  getMasteryEffect,
  isInMeleeRange,
  type MasteryEffectResult,
  unarmedStrikeDC
} from './combat-rules'
import { calculateCover } from './cover-calculator'
import { type DamageApplication, type DamageResolutionSummary, resolveDamage } from './damage-resolver'
import { type AttackTracker, useAttack } from './multi-attack-tracker'
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

export type AttackType = 'melee_weapon' | 'ranged_weapon' | 'melee_spell' | 'ranged_spell'

export interface AttackRequest {
  attackerToken: MapToken
  targetToken: MapToken
  attackType: AttackType
  /** Attack roll bonus (STR/DEX mod + proficiency + magic) */
  attackBonus: number
  /** Damage formula (e.g. "1d8+4") */
  damageFormula: string
  /** Damage type (e.g. "slashing") */
  damageType: string
  /** Full attacker character (for feat mechanics), optional */
  attackerCharacter?: Character5e
  /** Multi-attack tracker for this turn, optional */
  attackTracker?: AttackTracker
  /** Whether the weapon/attack is magical */
  isMagical?: boolean
  /** Whether the weapon is silvered */
  isSilvered?: boolean
  /** Weapon mastery property, if any */
  weaponMastery?: string
  /** Ability modifier used for attack (for weapon mastery calculations) */
  abilityModifier: number
  /** Attacker's proficiency bonus */
  proficiencyBonus: number
  /** Weapon normal range (for ranged only) */
  normalRange?: number
  /** Weapon long range (for ranged only) */
  longRange?: number
  /** Melee reach in feet (default 5) */
  reach?: number
  /** Additional damage dice from effects (e.g. Sneak Attack, Smite) */
  extraDamageDice?: Array<{ formula: string; damageType: string }>
  /** Extra flat damage bonuses from feats/effects */
  extraDamageBonus?: number
  /** Override advantage/disadvantage */
  forceAdvantage?: boolean
  /** Override advantage/disadvantage */
  forceDisadvantage?: boolean
  /** Attacker's name for display */
  attackerName: string
  /** Target's name for display */
  targetName: string
  /** Weapon/spell name for display */
  weaponName: string
  /** Is this a DM roll (hidden from players)? */
  isSecretRoll?: boolean
}

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

/**
 * Builds a failed/blocked AttackResult with a zero attack roll and no damage.
 * Used for early-return cases: attacker blocked, out-of-range, or total cover.
 */
function makeFailedAttackResult(
  summary: string,
  targetAC: number,
  cover: CoverType,
  conditionEffects: ConditionEffectResult,
  overrides?: {
    attackerBlocked?: boolean
    rangeCategory?: 'normal' | 'long' | 'out-of-range'
  }
): AttackResult {
  return {
    hit: false,
    isCritical: false,
    isCriticalMiss: false,
    attackRoll: { formula: '—', rolls: [0], total: 0, natural20: false, natural1: false },
    targetAC,
    cover,
    conditionEffects,
    damage: null,
    rawDamageRoll: null,
    masteryEffect: null,
    grazeDamage: 0,
    attackerBlocked: overrides?.attackerBlocked ?? false,
    rangeCategory: overrides?.rangeCategory,
    featEffects: [],
    summary
  }
}

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
 * Resolve a full attack action: roll → check AC → damage → mastery → broadcast.
 */
export function resolveAttack(
  request: AttackRequest,
  walls: WallSegment[],
  cellSize: number,
  allTokens: MapToken[],
  conditions: EntityCondition[],
  turnStates: Record<string, TurnState>,
  underwaterCombat: boolean,
  flankingAlly: string | null
): AttackResult {
  const {
    attackerToken,
    targetToken,
    attackType,
    attackBonus,
    damageFormula,
    damageType,
    isMagical = false,
    isSilvered = false,
    weaponMastery,
    abilityModifier: abilityMod,
    proficiencyBonus,
    normalRange,
    longRange,
    reach = 5,
    extraDamageDice = [],
    extraDamageBonus = 0,
    forceAdvantage,
    forceDisadvantage,
    attackerName,
    targetName,
    weaponName,
    isSecretRoll = false
  } = request

  const isRanged = attackType === 'ranged_weapon' || attackType === 'ranged_spell'

  // ── Check attacker conditions ──
  const attackerConditions = conditions
    .filter((c) => c.entityId === attackerToken.entityId)
    .map((c) => ({ name: c.condition, value: c.value }))
  const targetConditions = conditions
    .filter((c) => c.entityId === targetToken.entityId)
    .map((c) => ({ name: c.condition, value: c.value }))

  const targetTurn = turnStates[targetToken.entityId]

  // Check for enemies within 5ft of attacker (for ranged disadvantage)
  const enemyWithin5ft = allTokens.some(
    (t) => t.id !== attackerToken.id && t.entityType !== attackerToken.entityType && isInMeleeRange(attackerToken, t)
  )

  const conditionContext: AttackConditionContext = {
    isRanged,
    isWithin5ft: isInMeleeRange(attackerToken, targetToken, reach),
    anyEnemyWithin5ftOfAttacker: enemyWithin5ft,
    targetIsDodging: targetTurn?.isDodging,
    isUnderwater: underwaterCombat,
    weaponDamageType: damageType,
    attackerHasSwimSpeed: (attackerToken.swimSpeed ?? 0) > 0,
    flankingAlly
  }

  const conditionEffects = getAttackConditionEffects(attackerConditions, targetConditions, conditionContext)

  // ── Check if attacker can act ──
  if (conditionEffects.attackerCannotAct) {
    return makeFailedAttackResult(
      `${attackerName} cannot attack (incapacitated).`,
      targetToken.ac ?? 10,
      'none',
      conditionEffects,
      { attackerBlocked: true }
    )
  }

  // ── Check range ──
  let rangeCategory: 'normal' | 'long' | 'out-of-range' | undefined
  if (isRanged && normalRange && longRange) {
    rangeCategory = checkRangedRange(attackerToken, targetToken, normalRange, longRange)
    if (rangeCategory === 'out-of-range') {
      return makeFailedAttackResult(
        `${attackerName}'s ${weaponName} attack is out of range!`,
        targetToken.ac ?? 10,
        'none',
        conditionEffects,
        { rangeCategory }
      )
    }
  } else if (!isRanged) {
    if (!isInMeleeRange(attackerToken, targetToken, reach)) {
      return makeFailedAttackResult(
        `${attackerName}'s ${weaponName} attack is out of melee range!`,
        targetToken.ac ?? 10,
        'none',
        conditionEffects
      )
    }
  }

  // ── Calculate cover ──
  const cover = calculateCover(attackerToken, targetToken, walls, cellSize, allTokens)
  if (cover === 'total') {
    return makeFailedAttackResult(
      `${targetName} has total cover — ${attackerName} cannot target them.`,
      targetToken.ac ?? 10,
      cover,
      conditionEffects
    )
  }

  const coverACBonus = getCoverACBonus(cover)
  const targetAC = (targetToken.ac ?? 10) + coverACBonus

  // ── Determine advantage/disadvantage ──
  const rollOptions: DiceRollOptions = {
    label: `${weaponName} Attack`,
    silent: true,
    secret: isSecretRoll
  }

  // Long range gives disadvantage
  if (rangeCategory === 'long') {
    conditionEffects.disadvantageSources.push('Long range')
    // Recompute rollMode
    if (conditionEffects.advantageSources.length > 0) {
      conditionEffects.rollMode = 'normal'
    } else {
      conditionEffects.rollMode = 'disadvantage'
    }
  }

  // Apply forced advantage/disadvantage
  if (forceAdvantage) {
    rollOptions.advantage = true
  } else if (forceDisadvantage) {
    rollOptions.disadvantage = true
  } else {
    rollOptions.advantage = conditionEffects.rollMode === 'advantage'
    rollOptions.disadvantage = conditionEffects.rollMode === 'disadvantage'
  }

  // ── Roll attack ──
  const totalBonus = attackBonus + conditionEffects.exhaustionPenalty
  const attackRoll = rollD20(totalBonus, rollOptions)

  // ── Determine hit/miss ──
  // PHB 2024: Natural 20 always hits, Natural 1 always misses
  const isCritical = attackRoll.natural20 && !conditionEffects.attackerCannotAct
  const isCriticalMiss = attackRoll.natural1
  const hit = isCritical || (!isCriticalMiss && attackRoll.total >= targetAC)

  // Auto-crit if target is Paralyzed/Unconscious within 5ft
  const effectiveCrit = isCritical || (hit && conditionEffects.autoCrit)

  // ── Resolve damage on hit ──
  let damage: DamageResolutionSummary | null = null
  let rawDamageRoll: DiceRollResult | null = null
  let grazeDamage = 0

  if (hit) {
    // Roll damage
    rawDamageRoll = rollDamage(damageFormula, effectiveCrit, extraDamageDice, isSecretRoll)

    // Build damage applications
    const damages: DamageApplication[] = [
      {
        rawDamage: rawDamageRoll.total + extraDamageBonus,
        damageType,
        isMagical,
        isFromSilveredWeapon: isSilvered
      }
    ]

    // Resolve against target resistances/immunities
    damage = resolveDamage(
      damages,
      targetToken.resistances ?? [],
      targetToken.immunities ?? [],
      targetToken.vulnerabilities ?? [],
      false, // Heavy Armor Master (would need character data)
      false, // Wearing heavy armor
      underwaterCombat
    )
  }

  // ── Weapon mastery effect ──
  let masteryEffect: MasteryEffectResult | null = null
  if (weaponMastery) {
    masteryEffect = getMasteryEffect(weaponMastery, abilityMod, proficiencyBonus, hit)

    // Graze: deal ability modifier damage on miss
    if (!hit && masteryEffect?.grazeDamage) {
      grazeDamage = masteryEffect.grazeDamage
      // Apply graze damage through resolution
      const grazeDamages: DamageApplication[] = [
        { rawDamage: grazeDamage, damageType, isMagical, isFromSilveredWeapon: isSilvered }
      ]
      const grazeResolved = resolveDamage(
        grazeDamages,
        targetToken.resistances ?? [],
        targetToken.immunities ?? [],
        targetToken.vulnerabilities ?? [],
        false,
        false,
        underwaterCombat
      )
      grazeDamage = grazeResolved.totalFinalDamage
    }
  }

  // ── Feat effects (Crusher/Piercer/Slasher) ──
  let featEffects: Array<{ feat: string; effect: string }> = []
  if (hit && request.attackerCharacter) {
    featEffects = getDamageTypeFeatEffects(request.attackerCharacter, damageType, effectiveCrit)
  }

  // ── Track multi-attack usage ──
  let updatedAttackTracker: AttackTracker | undefined
  if (request.attackTracker) {
    updatedAttackTracker = useAttack(request.attackTracker)
  }

  // ── Build summary ──
  const summary = buildAttackSummary(
    attackerName,
    targetName,
    weaponName,
    attackRoll,
    targetAC,
    hit,
    effectiveCrit,
    isCriticalMiss,
    damage,
    grazeDamage,
    cover,
    conditionEffects,
    masteryEffect
  )

  // Append feat effect descriptions to summary
  const featSuffix = featEffects.map((fe) => `[${fe.feat}: ${fe.effect}]`).join(' ')
  const fullSummary = featSuffix ? `${summary} ${featSuffix}` : summary

  // ── Apply damage to token HP ──
  if (hit && damage) {
    applyDamageToToken(targetToken, damage.totalFinalDamage)
  } else if (grazeDamage > 0) {
    applyDamageToToken(targetToken, grazeDamage)
  }

  // ── Log to combat log ──
  logCombatEntry({
    type: 'attack',
    sourceEntityId: attackerToken.entityId,
    sourceEntityName: attackerName,
    targetEntityId: targetToken.entityId,
    targetEntityName: targetName,
    value: hit ? (damage?.totalFinalDamage ?? 0) : grazeDamage,
    damageType: hit ? damageType : grazeDamage > 0 ? `${damageType} (graze)` : undefined,
    description: fullSummary
  })

  // ── Broadcast result ──
  broadcastCombatResult(fullSummary, isSecretRoll)

  return {
    hit,
    isCritical: effectiveCrit,
    isCriticalMiss,
    attackRoll,
    targetAC,
    cover,
    conditionEffects,
    damage,
    rawDamageRoll,
    masteryEffect,
    grazeDamage,
    attackerBlocked: false,
    rangeCategory,
    featEffects,
    updatedAttackTracker,
    summary: fullSummary
  }
}

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

/**
 * Roll damage with critical hit doubling (PHB 2024: double damage dice, not modifier).
 */
function rollDamage(
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
 * "2d6+4" → "4d6+4", "1d8+3" → "2d8+3"
 */
function doubleDiceInFormula(formula: string): string {
  return formula.replace(/(\d*)d(\d+)/, (_, count, sides) => {
    const n = count ? parseInt(count, 10) : 1
    return `${n * 2}d${sides}`
  })
}

/** Apply damage to a token's HP via the game store. */
function applyDamageToToken(token: MapToken, damage: number): void {
  if (damage <= 0) return
  const gameStore = useGameStore.getState()
  const map = gameStore.maps.find((m) => m.id === gameStore.activeMapId)
  if (!map) {
    console.warn(
      `[CombatResolver] applyDamageToToken: no active map found (activeMapId=${gameStore.activeMapId}). Damage of ${damage} to "${token.label}" was not applied.`
    )
    return
  }

  const currentHP = token.currentHP ?? 0
  const newHP = Math.max(0, currentHP - damage)
  gameStore.updateToken(map.id, token.id, { currentHP: newHP })
}

/** Build a human-readable attack summary. */
function buildAttackSummary(
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
