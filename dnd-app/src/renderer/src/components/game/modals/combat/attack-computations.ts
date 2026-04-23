import type { ConditionEffectResult } from '../../../../services/combat/attack-condition-effects'
import { getAttackConditionEffects } from '../../../../services/combat/attack-condition-effects'
import { isAdjacent, isInMeleeRange } from '../../../../services/combat/combat-rules'
import type { ResolvedEffects, WeaponContext } from '../../../../services/combat/effect-resolver-5e'
import { checkFlanking as checkFlankingFn } from '../../../../services/combat/flanking'
import { useGameStore } from '../../../../stores/use-game-store'
import type { EntityCondition } from '../../../../types/game-state'
import type { MapToken } from '../../../../types/map'
import type { AttackWeapon } from './attack-utils'

/** Build a WeaponContext for the effect resolver from a weapon's properties */
export function getWeaponContext(
  weapon: { range?: string; properties?: string[]; damageType?: string } | null
): WeaponContext | undefined {
  if (!weapon) return undefined
  const isRanged = !!weapon.range
  return {
    isMelee: !isRanged,
    isRanged,
    isHeavy: weapon.properties?.includes('Heavy') ?? false,
    isThrown: weapon.properties?.includes('Thrown') ?? false,
    isCrossbow: weapon.properties?.some((p) => p.toLowerCase().includes('crossbow')) ?? false,
    isSpell: false,
    damageType: weapon.damageType
  }
}

/** Calculate the attack modifier for a given weapon */
export function getAttackMod(opts: {
  selectedWeapon: AttackWeapon | null
  isUnarmed: boolean
  isImprovised: boolean
  strMod: number
  dexMod: number
  profBonus: number
  hasArcheryFS: boolean
  resolved: ResolvedEffects
}): number {
  const { selectedWeapon, isUnarmed, isImprovised, strMod, dexMod, profBonus, hasArcheryFS, resolved } = opts
  if (!selectedWeapon) return 0

  // Unarmed Strike: always STR + PB
  if (isUnarmed) return strMod + profBonus

  // Improvised Weapon: ability mod only (no proficiency)
  if (isImprovised) {
    const isRanged = !!selectedWeapon.range
    return isRanged ? dexMod : strMod
  }

  const isFinesse = selectedWeapon.properties?.includes('Finesse')
  const isRanged = !!selectedWeapon.range

  let abilMod: number
  if (isFinesse) {
    abilMod = Math.max(strMod, dexMod)
  } else if (isRanged) {
    abilMod = dexMod
  } else {
    abilMod = strMod
  }

  const prof = selectedWeapon.proficient !== false ? profBonus : 0
  let bonus = abilMod + prof

  // Archery FS: +2 to ranged weapon attacks
  if (hasArcheryFS && isRanged) bonus += 2

  // Add effect resolver attack bonuses (magic weapon +X, etc.)
  bonus += resolved.attackBonus(getWeaponContext(selectedWeapon))

  return bonus
}

/** Calculate the damage modifier for a given weapon */
export function getDamageMod(opts: {
  selectedWeapon: AttackWeapon | null
  isUnarmed: boolean
  isImprovised: boolean
  isOffhandAttack: boolean
  strMod: number
  dexMod: number
  profBonus: number
  hasDuelingFS: boolean
  hasThrownWeaponFS: boolean
  hasGWM: boolean
  resolved: ResolvedEffects
}): number {
  const {
    selectedWeapon,
    isUnarmed,
    isImprovised,
    isOffhandAttack,
    strMod,
    dexMod,
    profBonus,
    hasDuelingFS,
    hasThrownWeaponFS,
    hasGWM,
    resolved
  } = opts
  if (!selectedWeapon) return 0

  // Unarmed Strike damage: 1 + STR mod (flat, no dice)
  if (isUnarmed) return 1 + strMod

  if (isImprovised) {
    const isRanged = !!selectedWeapon.range
    return isRanged ? dexMod : strMod
  }

  const isFinesse = selectedWeapon.properties?.includes('Finesse')
  const isRanged = !!selectedWeapon.range
  const isThrown = selectedWeapon.properties?.includes('Thrown')
  const isHeavy = selectedWeapon.properties?.includes('Heavy')

  let baseMod: number
  if (isFinesse) baseMod = Math.max(strMod, dexMod)
  else if (isRanged) baseMod = dexMod
  else baseMod = strMod

  if (isOffhandAttack) {
    let bonus = baseMod < 0 ? baseMod : 0
    bonus += resolved.damageBonus(getWeaponContext(selectedWeapon))
    return bonus
  }

  let bonus = baseMod

  // Dueling FS: +2 damage when wielding melee weapon in one hand with no other weapon
  if (hasDuelingFS && !isRanged && !selectedWeapon.properties?.includes('Two-Handed')) {
    bonus += 2
  }

  // Thrown Weapon Fighting FS: +2 damage with thrown weapons
  if (hasThrownWeaponFS && isThrown && isRanged) {
    bonus += 2
  }

  // Great Weapon Master: +PB damage with Heavy weapons
  if (hasGWM && isHeavy) {
    bonus += profBonus
  }

  // Add effect resolver damage bonuses (magic weapon +X, etc.)
  bonus += resolved.damageBonus(getWeaponContext(selectedWeapon))

  return bonus
}

/** Compute condition-based effects for an attack (advantage/disadvantage, auto-crit, etc.) */
export function computeConditionEffects(opts: {
  selectedWeapon: AttackWeapon | null
  selectedTarget: MapToken | null
  attackerToken: MapToken | null
  gameConditions: EntityCondition[]
  turnStates: Record<string, { isDodging?: boolean }>
  tokens: MapToken[]
}): ConditionEffectResult | null {
  const { selectedWeapon, selectedTarget, attackerToken, gameConditions, turnStates, tokens } = opts
  if (!selectedWeapon || !selectedTarget || !attackerToken) return null

  const attackerConds = gameConditions
    .filter((c) => c.entityId === attackerToken.entityId)
    .map((c) => ({ name: c.condition, value: c.value }))
  const targetConds = gameConditions
    .filter((c) => c.entityId === selectedTarget.entityId)
    .map((c) => ({ name: c.condition, value: c.value }))

  const isRanged = !!selectedWeapon.range
  const within5ft = isInMeleeRange(attackerToken, selectedTarget)

  // Check if any enemy is within 5ft of attacker (for ranged-in-close-combat)
  const anyEnemyWithin5ft = tokens.some(
    (t) => t.id !== attackerToken.id && t.entityType !== attackerToken.entityType && isAdjacent(attackerToken, t)
  )

  const targetTs = turnStates[selectedTarget.entityId]

  // Flanking check (DMG optional rule)
  const gameState = useGameStore.getState()
  let flankingAlly: string | null = null
  if (gameState.flankingEnabled && !isRanged) {
    const incapConditions = ['Incapacitated', 'Paralyzed', 'Stunned', 'Petrified', 'Unconscious']
    const incapIds = new Set(gameConditions.filter((c) => incapConditions.includes(c.condition)).map((c) => c.entityId))
    flankingAlly = checkFlankingFn(attackerToken, selectedTarget, tokens, incapIds)
  }

  return getAttackConditionEffects(attackerConds, targetConds, {
    isRanged,
    isWithin5ft: within5ft,
    anyEnemyWithin5ftOfAttacker: anyEnemyWithin5ft,
    targetIsDodging: targetTs?.isDodging,
    targetEntityId: selectedTarget.entityId,
    attackerGrapplerEntityId: (() => {
      const grappleCond = gameConditions.find(
        (c) => c.entityId === attackerToken.entityId && c.condition === 'Grappled'
      )
      return grappleCond?.sourceEntityId
    })(),
    isUnderwater: gameState.underwaterCombat,
    weaponDamageType: selectedWeapon.damageType,
    attackerHasSwimSpeed: !!(attackerToken.swimSpeed && attackerToken.swimSpeed > 0),
    flankingAlly
  })
}
