import type { ConditionEffectResult } from '../../../../services/combat/attack-condition-effects'
import {
  type CoverType,
  getCoverACBonus,
  getMasteryEffect,
  type MasteryEffectResult,
  unarmedStrikeDC
} from '../../../../services/combat/combat-rules'
import { calculateCover } from '../../../../services/combat/cover-calculator'
import type { ResolvedEffects } from '../../../../services/combat/effect-resolver-5e'
import { useGameStore } from '../../../../stores/use-game-store'
import { useLobbyStore } from '../../../../stores/use-lobby-store'
import { useNetworkStore } from '../../../../stores/use-network-store'
import type { Character5e } from '../../../../types/character-5e'
import { abilityModifier } from '../../../../types/character-common'
import type { MapToken } from '../../../../types/map'
import { applyDamageToCharacter, type DamageApplicationResult } from '../../../../utils/damage'
import { trigger3dDice } from '../../dice3d'
import { getWeaponContext } from './attack-computations'
import type { AttackWeapon, UnarmedMode } from './attack-utils'
import { parseDamageDice, rollD20, rollDice } from './attack-utils'

/** Resolved attack roll result */
export interface AttackRollResult {
  d20: number
  d20_2?: number
  modifier: number
  total: number
  isCrit: boolean
  isFumble: boolean
}

/** Resolved damage result */
export interface DamageResult {
  rolls: number[]
  modifier: number
  total: number
  isCrit: boolean
}

/** Roll the attack and return the result + hit/miss determination */
export function executeAttackRoll(opts: {
  selectedWeapon: AttackWeapon
  selectedTarget: MapToken
  character: { name: string; feats?: { id: string }[] }
  attackMod: number
  cover: CoverType
  computedEffects: ConditionEffectResult | null
  conditionOverrides: Record<string, boolean>
  critThreshold?: number
}): { roll: AttackRollResult; isHit: boolean } {
  const { selectedWeapon, selectedTarget, character, attackMod, cover, computedEffects, conditionOverrides } = opts

  // Roll based on advantage/disadvantage (accounting for DM overrides)
  let effectiveRollMode = computedEffects?.rollMode ?? 'normal'

  if (computedEffects) {
    const activeAdv = computedEffects.advantageSources.filter((_, i) => !conditionOverrides[`adv-${i}`])
    const activeDisadv = computedEffects.disadvantageSources.filter((_, i) => !conditionOverrides[`disadv-${i}`])
    if (activeAdv.length > 0 && activeDisadv.length > 0) {
      effectiveRollMode = 'normal'
    } else if (activeAdv.length > 0) {
      effectiveRollMode = 'advantage'
    } else if (activeDisadv.length > 0) {
      effectiveRollMode = 'disadvantage'
    } else {
      effectiveRollMode = 'normal'
    }
  }

  const d20_1 = rollD20()
  let d20: number
  let d20_2: number | undefined

  if (effectiveRollMode === 'advantage') {
    d20_2 = rollD20()
    d20 = Math.max(d20_1, d20_2)
  } else if (effectiveRollMode === 'disadvantage') {
    d20_2 = rollD20()
    d20 = Math.min(d20_1, d20_2)
  } else {
    d20 = d20_1
  }

  // Auto-crit from conditions (Paralyzed/Unconscious within 5ft) + Champion crit range
  const isCrit = d20 >= (opts.critThreshold ?? 20) || (computedEffects?.autoCrit ?? false)
  const isFumble = d20 === 1
  const total = d20 + attackMod

  // Sharpshooter: bypass half/three-quarters cover on ranged weapon attacks
  const charFeats = character.feats ?? []
  const hasSharpshooter = charFeats.some((f) => f.id === 'sharpshooter')
  const isRangedAttack = !!selectedWeapon.range
  const coverBonus = hasSharpshooter && isRangedAttack && cover !== 'total' ? 0 : getCoverACBonus(cover)
  const targetAC = (selectedTarget.ac ?? 10) + coverBonus
  const hit = isFumble ? false : isCrit || total >= targetAC

  const roll: AttackRollResult = {
    d20: d20_2 !== undefined ? d20_1 : d20,
    d20_2,
    modifier: attackMod,
    total,
    isCrit,
    isFumble
  }

  // Trigger 3D dice animation for attack roll
  const rollerName = getRollerName(character.name)
  const attackRolls = d20_2 !== undefined ? [d20_1, d20_2] : [d20_1]
  trigger3dDice({
    formula: d20_2 !== undefined ? '2d20' : '1d20',
    rolls: attackRolls,
    total: d20 + attackMod,
    rollerName
  })

  return { roll, isHit: hit }
}

/** Roll damage and compute the damage application result */
export function executeDamageRoll(opts: {
  selectedWeapon: AttackWeapon
  selectedTarget: MapToken
  character: { name: string; abilityScores: { strength: number; dexterity: number }; level: number }
  char5e: Character5e
  isCrit: boolean
  isUnarmed: boolean
  damageMod: number
  resolved: ResolvedEffects
  strMod: number
  profBonus: number
}): {
  damageResult: DamageResult
  damageAppResult: DamageApplicationResult
  masteryEffect: MasteryEffectResult | null
  knockOutPrompt: boolean
} {
  const {
    selectedWeapon,
    selectedTarget,
    character,
    char5e,
    isCrit,
    isUnarmed,
    damageMod,
    resolved,
    strMod,
    profBonus
  } = opts

  // Unarmed Strike: flat damage (1 + STR mod), no dice
  if (isUnarmed) {
    const total = Math.max(1, damageMod)
    const targetResistances = selectedTarget.resistances ?? []
    const targetVulnerabilities = selectedTarget.vulnerabilities ?? []
    const targetImmunities = selectedTarget.immunities ?? []
    const currentHP = selectedTarget.currentHP ?? 0
    const maxHP = selectedTarget.maxHP ?? 0
    const damageApp = applyDamageToCharacter(
      currentHP,
      maxHP,
      0,
      total,
      'bludgeoning',
      targetResistances,
      targetVulnerabilities,
      targetImmunities
    )
    const isMelee = true
    return {
      damageResult: { rolls: [], modifier: total, total: damageApp.effectiveDamage, isCrit },
      damageAppResult: damageApp,
      masteryEffect: null,
      knockOutPrompt: isMelee && damageApp.reducedToZero && !damageApp.instantDeath
    }
  }

  const parsed = parseDamageDice(selectedWeapon.damage)
  if (!parsed) {
    // Fallback for unparseable damage strings
    return {
      damageResult: { rolls: [], modifier: 0, total: 0, isCrit },
      damageAppResult: {
        tempHpLost: 0,
        hpLost: 0,
        remainingDamage: 0,
        effectiveDamage: 0,
        modifierDescription: null,
        reducedToZero: false,
        instantDeath: false
      },
      masteryEffect: null,
      knockOutPrompt: false
    }
  }

  const diceCount = isCrit ? parsed.count * 2 : parsed.count
  const rolls = rollDice(diceCount, parsed.sides)
  const totalDamageMod = damageMod + parsed.modifier

  // Roll extra damage dice from effects (e.g., Flame Tongue 2d6 fire)
  const weaponCtx = getWeaponContext(selectedWeapon)
  const extraDice = resolved.getExtraDamageDice(weaponCtx)
  let extraDamage = 0
  for (const ed of extraDice) {
    const edParsed = parseDamageDice(ed.dice)
    if (edParsed) {
      const edCount = isCrit ? edParsed.count * 2 : edParsed.count
      const edRolls = rollDice(edCount, edParsed.sides)
      extraDamage += edRolls.reduce((s, r) => s + r, 0)
    }
  }

  const total = Math.max(0, rolls.reduce((s, r) => s + r, 0) + totalDamageMod + extraDamage)

  // Trigger 3D dice animation for damage roll
  const damageRollerName = getRollerName(character.name)
  trigger3dDice({
    formula: `${diceCount}d${parsed.sides}`,
    rolls,
    total,
    rollerName: damageRollerName
  })

  // Apply damage type modifiers (resistance/vulnerability/immunity) from token data
  let targetResistances = selectedTarget.resistances ?? []
  const targetVulnerabilities = selectedTarget.vulnerabilities ?? []
  const targetImmunities = selectedTarget.immunities ?? []

  // Underwater: add fire resistance
  if (useGameStore.getState().underwaterCombat) {
    if (!targetResistances.includes('fire')) {
      targetResistances = [...targetResistances, 'fire']
    }
  }

  const currentHP = selectedTarget.currentHP ?? 0
  const maxHP = selectedTarget.maxHP ?? 0
  const tempHP = 0

  const damageApp = applyDamageToCharacter(
    currentHP,
    maxHP,
    tempHP,
    total,
    selectedWeapon.damageType,
    targetResistances,
    targetVulnerabilities,
    targetImmunities
  )

  // Check weapon mastery effects
  let mastery: MasteryEffectResult | null = null
  const weaponMastery = selectedWeapon.mastery
  const chosenMasteries = char5e.weaponMasteryChoices ?? []
  if (weaponMastery && chosenMasteries.includes(weaponMastery)) {
    const isFinesse = selectedWeapon.properties?.includes('Finesse')
    const isRanged = !!selectedWeapon.range
    const dexMod = abilityModifier(character.abilityScores.dexterity)
    let atkAbilMod: number
    if (isFinesse) atkAbilMod = Math.max(strMod, dexMod)
    else if (isRanged) atkAbilMod = dexMod
    else atkAbilMod = strMod
    mastery = getMasteryEffect(weaponMastery, atkAbilMod, profBonus, true)
  }

  // Check for knock-out opportunity (melee attack reducing target to 0 HP)
  const isMelee = !selectedWeapon.range
  const knockOut = isMelee && damageApp.reducedToZero && !damageApp.instantDeath

  return {
    damageResult: { rolls, modifier: totalDamageMod, total: damageApp.effectiveDamage, isCrit },
    damageAppResult: damageApp,
    masteryEffect: mastery,
    knockOutPrompt: knockOut
  }
}

/** Handle grapple/shove saving throw roll */
export function executeGrappleSave(opts: {
  selectedTarget: MapToken
  character: { abilityScores: { strength: number }; name: string }
  profBonus: number
  unarmedMode: UnarmedMode
}): { success: boolean; message: string } {
  const { selectedTarget, character, profBonus, unarmedMode } = opts
  const dc = unarmedStrikeDC(character.abilityScores.strength, profBonus)
  const roll = rollD20()
  const targetMod = selectedTarget.saveMod ?? 0
  const saveTotal = roll + targetMod
  const success = saveTotal >= dc || roll === 20
  const fail = roll === 1 || !success
  const modStr = targetMod >= 0 ? `+${targetMod}` : `${targetMod}`
  const msg =
    roll === 20
      ? `Natural 20! ${selectedTarget.label} resists the ${unarmedMode}! (${roll}${modStr}=${saveTotal} vs DC ${dc})`
      : roll === 1
        ? `Natural 1! ${selectedTarget.label} fails the ${unarmedMode} save!`
        : success
          ? `${selectedTarget.label} resists! (${roll}${modStr}=${saveTotal} vs DC ${dc})`
          : `${selectedTarget.label} fails! (${roll}${modStr}=${saveTotal} vs DC ${dc})`

  return { success: !fail || roll === 20, message: msg }
}

/** Apply grapple condition to the target */
export function applyGrappleCondition(targetEntityId: string, targetLabel: string, sourceName: string): void {
  const gameStore = useGameStore.getState()
  gameStore.addCondition({
    id: `cond-${Date.now()}`,
    entityId: targetEntityId,
    entityName: targetLabel,
    condition: 'Grappled',
    duration: 'permanent',
    source: sourceName,
    appliedRound: gameStore.round
  })
}

/** Apply prone condition to the target */
export function applyProneCondition(targetEntityId: string, targetLabel: string, sourceName: string): void {
  const gameStore = useGameStore.getState()
  gameStore.addCondition({
    id: `cond-${Date.now()}`,
    entityId: targetEntityId,
    entityName: targetLabel,
    condition: 'Prone',
    duration: 'permanent',
    source: sourceName,
    appliedRound: gameStore.round
  })
}

/** Auto-calculate cover from token positions + walls */
export function autoCalculateCover(attackerToken: MapToken, targetToken: MapToken, allTokens: MapToken[]): CoverType {
  const gs = useGameStore.getState()
  const activeMap = gs.maps.find((m) => m.id === gs.activeMapId)
  const walls = activeMap?.wallSegments ?? []
  const cellSize = activeMap?.grid.cellSize ?? 70
  const otherTokens = allTokens.filter((t) => t.id !== attackerToken.id && t.id !== targetToken.id)
  return calculateCover(attackerToken, targetToken, walls, cellSize, otherTokens)
}

/** Get the display name for the dice roller */
function getRollerName(characterName: string): string {
  const pid = useNetworkStore.getState().localPeerId
  const players = useLobbyStore.getState().players
  const p = pid ? players.find((pl) => pl.peerId === pid) : players.length > 0 ? players[0] : undefined
  return p?.displayName || characterName
}
