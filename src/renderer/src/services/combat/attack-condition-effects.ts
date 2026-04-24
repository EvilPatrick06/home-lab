/**
 * Condition effect engine for combat — evaluates attacker/target conditions
 * and spatial context to determine advantage, disadvantage, auto-crit, and
 * whether the attacker can act at all.
 *
 * Implements 2024 PHB Ch.1 condition mechanical effects.
 */

export interface AttackConditionContext {
  /** Is this a ranged attack (weapon.range defined)? */
  isRanged: boolean
  /** Is the attacker within 5ft of the target? */
  isWithin5ft: boolean
  /** Is there any hostile creature within 5ft of the attacker? (for ranged-in-close-combat) */
  anyEnemyWithin5ftOfAttacker: boolean
  /** Target's turn state (specifically isDodging) */
  targetIsDodging?: boolean
  /** Entity ID of the target (for Grappled check) */
  targetEntityId?: string
  /** Entity ID of whoever is grappling the attacker (for Grappled disadvantage check) */
  attackerGrapplerEntityId?: string
  /** Is the combat underwater? */
  isUnderwater?: boolean
  /** Weapon damage type (for underwater piercing check) */
  weaponDamageType?: string
  /** Does the attacker have a swim speed? */
  attackerHasSwimSpeed?: boolean
  /** Name of flanking ally if flanking is detected (DMG optional rule) */
  flankingAlly?: string | null
  /** Whether heavy weather imposes disadvantage on ranged attacks */
  weatherDisadvantageRanged?: boolean
}

export interface ConditionEffectResult {
  /** Human-readable reason strings for advantage sources */
  advantageSources: string[]
  /** Human-readable reason strings for disadvantage sources */
  disadvantageSources: string[]
  /** Final roll mode after advantage/disadvantage cancellation */
  rollMode: 'advantage' | 'disadvantage' | 'normal'
  /** True if target is Paralyzed/Unconscious and attacker is within 5ft */
  autoCrit: boolean
  /** True if attacker is Incapacitated/Paralyzed/Stunned/Petrified/Unconscious */
  attackerCannotAct: boolean
  /** Exhaustion penalty (-2 per level, applied to d20 roll) */
  exhaustionPenalty: number
}

interface SimpleCondition {
  name: string
  value?: number
}

/**
 * Evaluate conditions on attacker and target to determine combat modifiers.
 *
 * @param attackerConditions - Conditions on the attacking entity
 * @param targetConditions - Conditions on the target entity
 * @param context - Spatial and weapon context
 */
export function getAttackConditionEffects(
  attackerConditions: SimpleCondition[],
  targetConditions: SimpleCondition[],
  context: AttackConditionContext
): ConditionEffectResult {
  const advantageSources: string[] = []
  const disadvantageSources: string[] = []
  let autoCrit = false
  let attackerCannotAct = false
  let exhaustionPenalty = 0

  const hasCondition = (conditions: SimpleCondition[], name: string): boolean =>
    conditions.some((c) => c.name.toLowerCase() === name.toLowerCase())

  const getConditionValue = (conditions: SimpleCondition[], name: string): number =>
    conditions.find((c) => c.name.toLowerCase() === name.toLowerCase())?.value ?? 0

  // ── Attacker cannot act ──
  const incapacitatingConditions = ['Incapacitated', 'Paralyzed', 'Stunned', 'Petrified', 'Unconscious']
  for (const cond of incapacitatingConditions) {
    if (hasCondition(attackerConditions, cond)) {
      attackerCannotAct = true
      break
    }
  }

  // ── Exhaustion penalty ──
  const exhaustionLevel = getConditionValue(attackerConditions, 'Exhaustion')
  if (exhaustionLevel > 0) {
    exhaustionPenalty = exhaustionLevel * -2
  }

  // ── Attacker disadvantage sources ──

  if (hasCondition(attackerConditions, 'Blinded')) {
    disadvantageSources.push("Blinded (attacker can't see)")
  }

  if (hasCondition(attackerConditions, 'Frightened')) {
    // Disadvantage on attack rolls while source of fear is in line of sight
    // We can't determine LOS to fear source, so always apply and let DM override
    disadvantageSources.push('Frightened (source of fear in sight)')
  }

  if (hasCondition(attackerConditions, 'Poisoned')) {
    disadvantageSources.push('Poisoned (disadvantage on attacks)')
  }

  if (hasCondition(attackerConditions, 'Prone')) {
    disadvantageSources.push('Prone (attacker is prone)')
  }

  if (hasCondition(attackerConditions, 'Restrained')) {
    disadvantageSources.push('Restrained (disadvantage on attacks)')
  }

  // PHB 2024: Grappled condition only sets Speed to 0 — no attack penalty.

  // ── Attacker advantage sources ──

  if (hasCondition(attackerConditions, 'Invisible')) {
    advantageSources.push('Invisible (attacker unseen)')
  }

  // ── Target grants advantage to attacker ──

  if (hasCondition(targetConditions, 'Blinded')) {
    advantageSources.push('Target is Blinded')
  }

  if (hasCondition(targetConditions, 'Paralyzed')) {
    advantageSources.push('Target is Paralyzed')
    if (context.isWithin5ft) {
      autoCrit = true
    }
  }

  if (hasCondition(targetConditions, 'Petrified')) {
    advantageSources.push('Target is Petrified')
  }

  if (hasCondition(targetConditions, 'Prone')) {
    if (!context.isRanged && context.isWithin5ft) {
      advantageSources.push('Target is Prone (melee, within 5ft)')
    } else {
      disadvantageSources.push('Target is Prone (ranged or >5ft)')
    }
  }

  if (hasCondition(targetConditions, 'Restrained')) {
    advantageSources.push('Target is Restrained')
  }

  if (hasCondition(targetConditions, 'Stunned')) {
    advantageSources.push('Target is Stunned')
  }

  if (hasCondition(targetConditions, 'Unconscious')) {
    advantageSources.push('Target is Unconscious')
    if (context.isWithin5ft) {
      autoCrit = true
    }
  }

  // ── Target grants disadvantage ──

  if (context.targetIsDodging) {
    disadvantageSources.push('Target is Dodging')
  }

  // ── Ranged attack in close combat (A4) ──
  if (context.isRanged && context.anyEnemyWithin5ftOfAttacker) {
    disadvantageSources.push('Ranged attack with enemy within 5ft')
  }

  // Underwater combat (PHB 2024)
  if (context.isUnderwater) {
    if (context.isRanged) {
      disadvantageSources.push('Underwater (ranged attack)')
    } else {
      // Melee: disadvantage unless weapon is piercing OR attacker has swim speed
      const isPiercing = context.weaponDamageType?.toLowerCase() === 'piercing'
      if (!isPiercing && !context.attackerHasSwimSpeed) {
        disadvantageSources.push('Underwater (non-piercing melee without swim speed)')
      }
    }
  }

  // ── Flanking (DMG optional rule) ──
  if (context.flankingAlly && !context.isRanged) {
    advantageSources.push(`Flanking (with ${context.flankingAlly})`)
  }

  // ── Weather: heavy weather disadvantage on ranged ──
  if (context.weatherDisadvantageRanged && context.isRanged) {
    disadvantageSources.push('Heavy weather (ranged)')
  }

  // ── Advantage/Disadvantage cancellation (PHB rule) ──
  let rollMode: 'advantage' | 'disadvantage' | 'normal' = 'normal'
  if (advantageSources.length > 0 && disadvantageSources.length > 0) {
    rollMode = 'normal' // They cancel out regardless of how many sources
  } else if (advantageSources.length > 0) {
    rollMode = 'advantage'
  } else if (disadvantageSources.length > 0) {
    rollMode = 'disadvantage'
  }

  return {
    advantageSources,
    disadvantageSources,
    rollMode,
    autoCrit,
    attackerCannotAct,
    exhaustionPenalty
  }
}
