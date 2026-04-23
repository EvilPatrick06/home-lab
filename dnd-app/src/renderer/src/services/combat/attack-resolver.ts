/**
 * Attack Resolver Service — full weapon attack pipeline.
 *
 * Resolves `/attack <weapon> <target>` by:
 * 1. Fuzzy-matching the weapon from character.weapons[]
 * 2. Determining attack ability (STR/DEX/Finesse picks higher)
 * 3. Calculating attack bonus (ability mod + proficiency + effect bonuses)
 * 4. Evaluating advantage/disadvantage from conditions, flanking, cover
 * 5. Rolling d20 via dice-service
 * 6. Comparing to target AC + cover bonus
 * 7. On hit: rolling damage, applying crits (double dice), routing through damage-resolver
 * 8. Applying weapon mastery effects
 */

import { useGameStore } from '../../stores/use-game-store'
import type { Character5e } from '../../types/character-5e'
import type { WeaponEntry } from '../../types/character-common'
import type { MapToken } from '../../types/map'
import { rollMultiple, rollSingle } from '../dice/dice-service'
import { pluginEventBus } from '../plugin-system/event-bus'
import { getWeatherEffects, type WeatherType } from '../weather-mechanics'
import { getAttackConditionEffects } from './attack-condition-effects'
import { formatAttackResult } from './attack-formatter'
import { applyDamageToToken, buildAttackSummary, doubleDiceInFormula, rollDamage } from './attack-helpers'
import type { AttackOptions, AttackResult } from './attack-types'
import type { MasteryEffectResult } from './combat-rules'
import { checkRangedRange, getCoverACBonus, getMasteryEffect, isAdjacent, isInMeleeRange } from './combat-rules'
import { calculateCover } from './cover-calculator'
import type { DamageResolutionSummary } from './damage-resolver'
import { resolveDamage } from './damage-resolver'
import type { WeaponContext } from './effect-resolver-5e'
import { resolveEffects } from './effect-resolver-5e'
import { resolveUnarmedStrike as resolveUnarmedStrikeBase } from './unarmed-strike-resolver'

// Re-export orphan utilities so consumers can access them through this module
export { formatAttackResult, applyDamageToToken, buildAttackSummary, doubleDiceInFormula, rollDamage }

// Re-export base unarmed strike resolver for consumers that do not need weather support
export { resolveUnarmedStrikeBase }

// ─── Types ────────────────────────────────────────────────────

export type { AttackOptions, AttackResult } from './attack-types'

// ─── Helpers ──────────────────────────────────────────────────

function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

/**
 * Fuzzy-match a weapon name from the character's weapons array.
 * Matches if the weapon name starts with or contains the search string (case-insensitive).
 */
export function findWeapon(weapons: WeaponEntry[], search: string): WeaponEntry | undefined {
  const lower = search.toLowerCase()
  // Exact match first
  const exact = weapons.find((w) => w.name.toLowerCase() === lower)
  if (exact) return exact
  // Starts-with match
  const startsWith = weapons.find((w) => w.name.toLowerCase().startsWith(lower))
  if (startsWith) return startsWith
  // Contains match
  return weapons.find((w) => w.name.toLowerCase().includes(lower))
}

/**
 * Determine if a weapon is a melee weapon (no range property, or has Thrown).
 */
function isMeleeWeapon(weapon: WeaponEntry): boolean {
  return !weapon.range || weapon.properties.some((p) => p.toLowerCase() === 'thrown')
}

/**
 * Determine if a weapon is ranged (has range property).
 */
function isRangedWeapon(weapon: WeaponEntry): boolean {
  return !!weapon.range
}

/**
 * Determine if a weapon has the Finesse property.
 */
function hasFinesse(weapon: WeaponEntry): boolean {
  return weapon.properties.some((p) => p.toLowerCase() === 'finesse')
}

/**
 * Parse range string like "80/320" or "150/600" into normal/long range.
 */
function parseRange(range: string): { normal: number; long: number } | null {
  const match = range.match(/(\d+)\/(\d+)/)
  if (match) {
    return { normal: parseInt(match[1], 10), long: parseInt(match[2], 10) }
  }
  const single = range.match(/(\d+)/)
  if (single) {
    return { normal: parseInt(single[1], 10), long: parseInt(single[1], 10) }
  }
  return null
}

/**
 * Parse a damage string like "1d8", "2d6", "1d10" into count and sides.
 */
function parseDamageFormula(damage: string): { count: number; sides: number } | null {
  const match = damage.match(/(\d+)d(\d+)/)
  if (!match) return null
  return { count: parseInt(match[1], 10), sides: parseInt(match[2], 10) }
}

/**
 * Build a WeaponContext for effect resolution from a weapon entry.
 */
function buildWeaponContext(weapon: WeaponEntry): WeaponContext {
  const props = weapon.properties.map((p) => p.toLowerCase())
  return {
    isMelee: isMeleeWeapon(weapon),
    isRanged: isRangedWeapon(weapon),
    isHeavy: props.includes('heavy'),
    isThrown: props.includes('thrown'),
    isCrossbow: weapon.name.toLowerCase().includes('crossbow'),
    isSpell: false,
    damageType: weapon.damageType
  }
}

// ─── Unarmed Strike (PHB 2024) ────────────────────────────────

/**
 * Resolve an Unarmed Strike (damage option) per PHB 2024.
 *
 * Extends the base implementation in unarmed-strike-resolver.ts with
 * weather effect support (weatherDisadvantageRanged).
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

  const weatherPreset = gameState.weatherOverride?.preset as WeatherType | undefined
  const weatherEffects = weatherPreset ? getWeatherEffects(weatherPreset) : null

  const conditionEffects = getAttackConditionEffects(attackerConditions, targetConditions, {
    isRanged: false,
    isWithin5ft: true,
    anyEnemyWithin5ftOfAttacker: anyEnemyNearAttacker,
    targetIsDodging: targetTurnState?.isDodging,
    targetEntityId: targetToken.entityId ?? targetToken.id,
    isUnderwater: gameState.underwaterCombat,
    weaponDamageType: 'bludgeoning',
    attackerHasSwimSpeed: (character.speeds?.swim ?? 0) > 0,
    weatherDisadvantageRanged: weatherEffects?.disadvantageRanged ?? false
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

// ─── Main Resolver ────────────────────────────────────────────

/**
 * Resolve a full weapon attack from a character against a target token.
 */
export function resolveAttack(
  character: Character5e,
  weapon: WeaponEntry,
  attackerToken: MapToken,
  targetToken: MapToken,
  options: AttackOptions = {}
): AttackResult {
  const gameState = useGameStore.getState()

  // ── 1. Determine attack ability ──
  const strMod = abilityModifier(character.abilityScores.strength)
  const dexMod = abilityModifier(character.abilityScores.dexterity)

  let attackAbilityMod: number
  if (hasFinesse(weapon)) {
    // Finesse: use higher of STR or DEX
    attackAbilityMod = Math.max(strMod, dexMod)
  } else if (isRangedWeapon(weapon) && !isMeleeWeapon(weapon)) {
    // Pure ranged weapon: use DEX
    attackAbilityMod = dexMod
  } else {
    // Melee weapon: use STR
    attackAbilityMod = strMod
  }

  // ── 2. Calculate proficiency bonus ──
  const profBonus = Math.ceil(character.level / 4) + 1

  // ── 3. Resolve character effects ──
  const effects = resolveEffects(character)
  const weaponCtx = buildWeaponContext(weapon)
  const effectAttackBonus = effects.attackBonus(weaponCtx)
  const effectDamageBonus = effects.damageBonus(weaponCtx)

  // ── 4. Calculate total attack bonus ──
  const proficiencyBonus = weapon.proficient !== false ? profBonus : 0
  const weaponAttackBonus = weapon.attackBonus ?? 0
  const totalAttackBonus = attackAbilityMod + proficiencyBonus + weaponAttackBonus + effectAttackBonus

  // ── 5. Determine range category ──
  let rangeCategory: AttackResult['rangeCategory'] = 'melee'
  if (isRangedWeapon(weapon)) {
    const parsedRange = parseRange(weapon.range!)
    if (parsedRange) {
      const rangeResult = checkRangedRange(attackerToken, targetToken, parsedRange.normal, parsedRange.long)
      if (rangeResult === 'out-of-range') {
        rangeCategory = 'out-of-range'
      } else if (rangeResult === 'long') {
        rangeCategory = 'long'
      } else {
        rangeCategory = 'normal'
      }
    }
  } else {
    // Check melee range
    const reach = weapon.properties.some((p) => p.toLowerCase() === 'reach') ? 10 : 5
    if (!isInMeleeRange(attackerToken, targetToken, reach)) {
      rangeCategory = 'out-of-range'
    }
  }

  // ── 6. Calculate cover ──
  const activeMap = gameState.maps.find((m) => m.id === gameState.activeMapId)
  const walls = activeMap?.wallSegments ?? []
  const tokens = activeMap?.tokens ?? []
  const cellSize = activeMap?.grid.cellSize ?? 64
  const coverType = calculateCover(attackerToken, targetToken, walls, cellSize, tokens)
  const coverACBonus = getCoverACBonus(coverType)

  // ── 7. Get target AC ──
  const targetAC = (targetToken.ac ?? 10) + coverACBonus

  // ── 8. Evaluate advantage/disadvantage from conditions ──
  const attackerConditions = gameState.conditions
    .filter((c) => c.entityId === attackerToken.id || c.entityId === attackerToken.entityId)
    .map((c) => ({ name: c.condition, value: c.value }))
  const targetConditions = gameState.conditions
    .filter((c) => c.entityId === targetToken.id || c.entityId === targetToken.entityId)
    .map((c) => ({ name: c.condition, value: c.value }))

  const adjacentToTarget = isAdjacent(attackerToken, targetToken)
  const anyEnemyNearAttacker = tokens.some(
    (t) =>
      t.id !== attackerToken.id && t.id !== targetToken.id && t.entityType === 'enemy' && isAdjacent(attackerToken, t)
  )

  const targetTurnState = gameState.turnStates[targetToken.entityId ?? targetToken.id]

  const weatherPresetMain = gameState.weatherOverride?.preset as WeatherType | undefined
  const weatherEffectsMain = weatherPresetMain ? getWeatherEffects(weatherPresetMain) : null

  const conditionEffects = getAttackConditionEffects(attackerConditions, targetConditions, {
    isRanged: isRangedWeapon(weapon) && rangeCategory !== 'melee',
    isWithin5ft: adjacentToTarget,
    anyEnemyWithin5ftOfAttacker: anyEnemyNearAttacker,
    targetIsDodging: targetTurnState?.isDodging,
    targetEntityId: targetToken.entityId ?? targetToken.id,
    isUnderwater: gameState.underwaterCombat,
    weaponDamageType: weapon.damageType,
    attackerHasSwimSpeed: (character.speeds?.swim ?? 0) > 0,
    weatherDisadvantageRanged: weatherEffectsMain?.disadvantageRanged ?? false
  })

  // Add long range disadvantage
  const advantageSources = [...conditionEffects.advantageSources]
  const disadvantageSources = [...conditionEffects.disadvantageSources]

  if (rangeCategory === 'long') {
    disadvantageSources.push('Long range (disadvantage)')
  }

  if (options.forceAdvantage) {
    advantageSources.push('Forced advantage')
  }
  if (options.forceDisadvantage) {
    disadvantageSources.push('Forced disadvantage')
  }

  // Allow plugins to modify attack modifiers before the roll
  if (pluginEventBus.hasSubscribers('combat:before-attack-roll')) {
    pluginEventBus.emit('combat:before-attack-roll', {
      attackerName: character.name,
      targetName: targetToken.label,
      weaponName: weapon.name,
      totalAttackBonus,
      advantageSources,
      disadvantageSources
    })
  }

  // Final roll mode
  let rollMode: 'advantage' | 'disadvantage' | 'normal' = 'normal'
  if (advantageSources.length > 0 && disadvantageSources.length > 0) {
    rollMode = 'normal' // Cancel out
  } else if (advantageSources.length > 0) {
    rollMode = 'advantage'
  } else if (disadvantageSources.length > 0) {
    rollMode = 'disadvantage'
  }

  // ── 9. Roll d20 ──
  let attackRoll: number
  if (rollMode === 'advantage') {
    const r1 = rollSingle(20)
    const r2 = rollSingle(20)
    attackRoll = Math.max(r1, r2)
  } else if (rollMode === 'disadvantage') {
    const r1 = rollSingle(20)
    const r2 = rollSingle(20)
    attackRoll = Math.min(r1, r2)
  } else {
    attackRoll = rollSingle(20)
  }

  const isCrit = attackRoll === 20
  const isFumble = attackRoll === 1

  // Apply exhaustion penalty
  const exhaustionPenalty = conditionEffects.exhaustionPenalty
  const attackTotal = attackRoll + totalAttackBonus + exhaustionPenalty

  // ── 10. Determine hit/miss ──
  // Natural 20 always hits, natural 1 always misses (PHB 2024)
  const isHit = isCrit || (!isFumble && attackTotal >= targetAC)

  // ── 11. Roll damage ──
  let damageRolls: number[] = []
  let damageTotal = 0
  let damageResolution: DamageResolutionSummary | null = null
  const extraDamage: AttackResult['extraDamage'] = []

  const parsed = parseDamageFormula(weapon.damage)

  if (isHit && parsed) {
    // Roll weapon damage dice (double on crit)
    const diceCount = isCrit ? parsed.count * 2 : parsed.count
    damageRolls = rollMultiple(diceCount, parsed.sides)
    damageTotal = damageRolls.reduce((s, r) => s + r, 0) + attackAbilityMod + effectDamageBonus

    // Roll extra damage dice from effects (e.g., Flame Tongue, Sneak Attack)
    const extraDamageDice = effects.getExtraDamageDice(weaponCtx)
    for (const extra of extraDamageDice) {
      const extraParsed = extra.dice.match(/(\d+)d(\d+)/)
      if (extraParsed) {
        const eCount = parseInt(extraParsed[1], 10) * (isCrit ? 2 : 1)
        const eSides = parseInt(extraParsed[2], 10)
        const eRolls = rollMultiple(eCount, eSides)
        const eTotal = eRolls.reduce((s, r) => s + r, 0)
        extraDamage.push({ dice: extra.dice, rolls: eRolls, total: eTotal, damageType: extra.damageType })
        damageTotal += eTotal
      }
    }

    // Ensure minimum 0 damage
    damageTotal = Math.max(0, damageTotal)

    // ── 12. Resolve damage against target defenses ──
    const targetResistances = targetToken.resistances ?? []
    const targetImmunities = targetToken.immunities ?? []
    const targetVulnerabilities = targetToken.vulnerabilities ?? []
    const isMagical =
      weapon.properties.some((p) => p.toLowerCase() === 'magical') ||
      (character.magicItems ?? []).some((mi) => mi.attuned && mi.name.toLowerCase().includes(weapon.name.toLowerCase()))

    damageResolution = resolveDamage(
      [{ rawDamage: damageTotal, damageType: weapon.damageType, isMagical }],
      targetResistances,
      targetImmunities,
      targetVulnerabilities,
      false, // hasHeavyArmorMaster — target is typically a monster
      false, // targetIsWearingHeavyArmor
      gameState.underwaterCombat,
      profBonus
    )
  }

  // Emit after-attack-roll event (read-only notification)
  if (pluginEventBus.hasSubscribers('combat:after-attack-roll')) {
    pluginEventBus.emit('combat:after-attack-roll', {
      roll: attackRoll,
      total: attackTotal,
      hit: isHit,
      crit: isCrit
    })
  }

  // Emit after-damage event if damage was dealt
  if (isHit && damageTotal > 0 && pluginEventBus.hasSubscribers('combat:after-damage')) {
    pluginEventBus.emit('combat:after-damage', {
      totalDamage: damageResolution?.totalFinalDamage ?? damageTotal,
      damageType: weapon.damageType,
      targetName: targetToken.label
    })
  }

  // ── 13. Apply weapon mastery ──
  let masteryEffect: MasteryEffectResult | null = null
  if (weapon.mastery) {
    // Check if character has this weapon mastery enabled
    const hasMastery = (character.weaponMasteryChoices ?? []).some(
      (m) => m.toLowerCase() === weapon.mastery!.toLowerCase()
    )
    if (hasMastery) {
      masteryEffect = getMasteryEffect(weapon.mastery, attackAbilityMod, profBonus, isHit)
    }
  }

  // For Graze: if miss and mastery returned graze damage, set damage accordingly
  if (!isHit && masteryEffect?.grazeDamage !== undefined && masteryEffect.grazeDamage > 0) {
    damageTotal = masteryEffect.grazeDamage
    damageRolls = [] // Graze damage is flat (ability modifier)

    const targetResistances = targetToken.resistances ?? []
    const targetImmunities = targetToken.immunities ?? []
    const targetVulnerabilities = targetToken.vulnerabilities ?? []
    const isMagical = weapon.properties.some((p) => p.toLowerCase() === 'magical')

    damageResolution = resolveDamage(
      [{ rawDamage: damageTotal, damageType: weapon.damageType, isMagical }],
      targetResistances,
      targetImmunities,
      targetVulnerabilities,
      false,
      false,
      gameState.underwaterCombat,
      profBonus
    )
  }

  return {
    attackerName: character.name,
    targetName: targetToken.label,
    weaponName: weapon.name,
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
    damageType: weapon.damageType,
    damageResolution,
    masteryEffect,
    extraDamage,
    rangeCategory,
    exhaustionPenalty
  }
}

// formatAttackResult is now imported from ./attack-formatter and re-exported above
