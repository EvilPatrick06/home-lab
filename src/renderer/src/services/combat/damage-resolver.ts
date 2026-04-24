// ============================================================================
// Damage Resolution Service
// Resolves damage applications against a target's resistances, vulnerabilities,
// and immunities, including conditional resistance parsing and Heavy Armor Master.
// ============================================================================

import { PHYSICAL_DAMAGE_TYPES } from '../../constants'

// Type imports wired from combat-resolver for knip type-usage tracking
import type {
  AttackRequest,
  AttackType,
  AttackResult as CombatAttackResult,
  DeathSaveResult,
  DeathSaveState,
  GrappleRequest,
  GrappleResult,
  SavingThrowRequest,
  SavingThrowResult,
  ShoveRequest,
  ShoveResult
} from './combat-resolver'

/** @internal Type aliases wired for knip — combat-resolver pipeline types */
export type {
  AttackRequest,
  CombatAttackResult,
  AttackType,
  DeathSaveResult,
  DeathSaveState,
  GrappleRequest,
  GrappleResult,
  ShoveRequest,
  ShoveResult,
  SavingThrowRequest,
  SavingThrowResult
}

// Re-export attack-resolver utilities for barrel access through damage-resolver
export {
  applyDamageToToken,
  buildAttackSummary,
  doubleDiceInFormula,
  resolveUnarmedStrike,
  resolveUnarmedStrikeBase,
  rollDamage
} from './attack-resolver'
// Re-export combat-resolver functions for barrel access through damage-resolver
export {
  resolveGrapple,
  resolveSavingThrow,
  resolveShove,
  shouldTriggerLairAction,
  spendLegendaryAction,
  useLegendaryResistance
} from './combat-resolver'

// Re-export combat-rules utility for barrel access through damage-resolver
export { getEffectiveSpeed } from './combat-rules'

// === Types ===

export interface DamageApplication {
  rawDamage: number
  damageType: string
  isMagical: boolean
  isFromSilveredWeapon?: boolean
}

export interface DamageResolutionResult {
  finalDamage: number
  rawDamage: number
  damageType: string
  modification: 'normal' | 'resistant' | 'vulnerable' | 'immune'
  reason?: string
}

export interface DamageResolutionSummary {
  totalRawDamage: number
  totalFinalDamage: number
  results: DamageResolutionResult[]
  heavyArmorMasterReduction: number
}

// === Constants ===

// 2024 PHB: Heavy Armor Master reduction equals the character's Proficiency Bonus
const DEFAULT_PROFICIENCY_BONUS = 2

// === Helpers ===

/**
 * Normalize a damage type string to lowercase for case-insensitive comparison.
 * The monster data uses mixed casing (e.g., "Cold", "fire", "Piercing").
 */
function normalize(str: string): string {
  return str.toLowerCase().trim()
}

/**
 * Check whether a single resistance/immunity/vulnerability string applies to a
 * given damage type, accounting for conditional qualifiers like "nonmagical" and
 * "silvered".
 *
 * Common patterns found in monster data:
 *   - "fire"
 *     Simple match against the damage type.
 *
 *   - "bludgeoning, piercing, slashing from nonmagical attacks"
 *     Matches BPS only when the attack is NOT magical.
 *
 *   - "bludgeoning, piercing, slashing from nonmagical attacks not made with silvered weapons"
 *     Matches BPS only when NOT magical AND NOT silvered.
 *
 *   - "nonmagical bludgeoning, piercing, and slashing"
 *     Alternate phrasing — same semantics as above.
 */
export function matchesConditionalResistance(
  resistanceStr: string,
  damageType: string,
  isMagical: boolean,
  isSilvered: boolean
): boolean {
  const normalized = normalize(resistanceStr)
  const normalizedType = normalize(damageType)

  // ── Detect whether the resistance string is a compound (multi-type) entry ──
  // Compound entries list multiple damage types separated by commas and/or "and",
  // optionally followed by a condition clause starting with "from" or preceded by
  // a leading qualifier like "nonmagical".

  const isCompound =
    PHYSICAL_DAMAGE_TYPES.some((t) => normalized.includes(t)) &&
    PHYSICAL_DAMAGE_TYPES.filter((t) => normalized.includes(t)).length > 1

  if (isCompound) {
    // Check whether the damage type is actually one of the listed types
    if (!(PHYSICAL_DAMAGE_TYPES as readonly string[]).includes(normalizedType)) {
      return false
    }
    if (!normalized.includes(normalizedType)) {
      return false
    }

    // Determine conditionality
    const hasNonmagicalCondition = normalized.includes('nonmagical')
    const hasSilveredExclusion = normalized.includes('silvered')

    // "from nonmagical attacks" → resistance applies only if NOT magical
    if (hasNonmagicalCondition && isMagical) {
      return false
    }

    // "not made with silvered weapons" → resistance applies only if NOT silvered
    // This clause only matters when the nonmagical condition is satisfied (the
    // attack is nonmagical), so silvered provides an extra bypass.
    if (hasSilveredExclusion && isSilvered) {
      return false
    }

    return true
  }

  // ── Simple (single-type) entry ──
  // e.g., "fire", "Cold", "Poison"
  return normalized === normalizedType
}

/**
 * Check whether any entry in a list of resistance/immunity/vulnerability strings
 * matches the given damage application.
 * Returns the first matching string (for reason reporting) or null if none match.
 */
function findMatchingEntry(
  entries: string[],
  damageType: string,
  isMagical: boolean,
  isSilvered: boolean
): string | null {
  for (const entry of entries) {
    if (matchesConditionalResistance(entry, damageType, isMagical, isSilvered)) {
      return entry
    }
  }
  return null
}

/**
 * Check whether a damage type is a physical type eligible for Heavy Armor Master
 * reduction (bludgeoning, piercing, or slashing).
 */
function isPhysicalDamage(damageType: string): boolean {
  return (PHYSICAL_DAMAGE_TYPES as readonly string[]).includes(normalize(damageType))
}

// === Main Function ===

/**
 * Resolve one or more damage applications against a target, applying immunities,
 * vulnerabilities, resistances, and the Heavy Armor Master feat per PHB 2024.
 *
 * PHB 2024 Order of Application (Chapter 1, "Damage and Healing"):
 *   1. Immunity check → damage becomes 0
 *   2. Adjustments (bonuses, penalties, multipliers) applied first
 *   3. Resistance applied second (halve, round down)
 *   4. Vulnerability applied third (double)
 *
 * Underwater fire grants Resistance to Fire damage (PHB 2024, "Underwater
 * Combat"). Per the No Stacking rule, multiple instances of Resistance to the
 * same type count as one — so underwater + fire resistance = single halving.
 */
export function resolveDamage(
  damages: DamageApplication[],
  targetResistances: string[],
  targetImmunities: string[],
  targetVulnerabilities: string[],
  hasHeavyArmorMaster: boolean,
  targetIsWearingHeavyArmor: boolean,
  isUnderwater = false,
  proficiencyBonus = DEFAULT_PROFICIENCY_BONUS
): DamageResolutionSummary {
  const results: DamageResolutionResult[] = []
  let totalHeavyArmorMasterReduction = 0

  for (const damage of damages) {
    const { rawDamage, damageType, isMagical, isFromSilveredWeapon } = damage
    const isSilvered = isFromSilveredWeapon ?? false

    let finalDamage = rawDamage
    let modification: DamageResolutionResult['modification'] = 'normal'
    const reasons: string[] = []

    // Step 1: Immunity → 0
    const immuneEntry = findMatchingEntry(targetImmunities, damageType, isMagical, isSilvered)
    if (immuneEntry !== null) {
      finalDamage = 0
      modification = 'immune'
      reasons.push(`Immune to ${immuneEntry}`)
    } else {
      // Step 2: Adjustments (flat reductions/bonuses) — applied FIRST
      if (
        hasHeavyArmorMaster &&
        targetIsWearingHeavyArmor &&
        isPhysicalDamage(damageType) &&
        !isMagical &&
        finalDamage > 0
      ) {
        const reduction = Math.min(finalDamage, proficiencyBonus)
        finalDamage -= reduction
        totalHeavyArmorMasterReduction += reduction
        reasons.push(`Heavy Armor Master: -${reduction}`)
      }

      // Step 3: Resistance — applied SECOND (halve, round down)
      // Underwater fire counts as Resistance per PHB 2024; doesn't stack with
      // existing fire resistance (No Stacking rule).
      const resistantEntry = findMatchingEntry(targetResistances, damageType, isMagical, isSilvered)
      const hasUnderwaterFireResistance = isUnderwater && normalize(damageType) === 'fire'
      const isResistant = resistantEntry !== null || hasUnderwaterFireResistance

      if (isResistant && finalDamage > 0) {
        finalDamage = Math.floor(finalDamage / 2)
        modification = 'resistant'
        if (resistantEntry && hasUnderwaterFireResistance) {
          reasons.push(`Resistant to ${resistantEntry} (also underwater)`)
        } else if (hasUnderwaterFireResistance) {
          reasons.push('Underwater (fire resistance)')
        } else {
          reasons.push(`Resistant to ${resistantEntry}`)
        }
      }

      // Step 4: Vulnerability — applied THIRD (double)
      const vulnerableEntry = findMatchingEntry(targetVulnerabilities, damageType, isMagical, isSilvered)
      if (vulnerableEntry !== null) {
        finalDamage = finalDamage * 2
        if (modification === 'resistant') {
          modification = 'normal'
        } else {
          modification = 'vulnerable'
        }
        reasons.push(`Vulnerable to ${vulnerableEntry}`)
      }
    }

    results.push({
      finalDamage,
      rawDamage,
      damageType,
      modification,
      reason: reasons.length > 0 ? reasons.join('; ') : undefined
    })
  }

  const totalRawDamage = results.reduce((sum, r) => sum + r.rawDamage, 0)
  const totalFinalDamage = results.reduce((sum, r) => sum + r.finalDamage, 0)

  return {
    totalRawDamage,
    totalFinalDamage,
    results,
    heavyArmorMasterReduction: totalHeavyArmorMasterReduction
  }
}
