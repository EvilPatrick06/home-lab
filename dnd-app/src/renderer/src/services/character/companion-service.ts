import type { Companion5e, CompanionType } from '../../types/companion'
import {
  CHAIN_PACT_FAMILIAR_FORMS,
  STANDARD_FAMILIAR_FORMS,
  STEED_FORMS,
  WILD_SHAPE_TIERS
} from '../../types/companion'
import type { MapToken } from '../../types/map'
import type { MonsterStatBlock } from '../../types/monster'
import { crToNumber, getSizeTokenDimensions } from '../../types/monster'

/**
 * Get wild shape eligible beasts for a druid of the given level.
 */
export function getWildShapeEligibleBeasts(druidLevel: number, monsters: MonsterStatBlock[]): MonsterStatBlock[] {
  // Find the highest tier the druid qualifies for
  let maxCR = 0
  let allowFlying = false
  let allowSwimming = false

  for (const tier of WILD_SHAPE_TIERS) {
    if (druidLevel >= tier.minLevel) {
      maxCR = tier.maxCR
      allowFlying = tier.allowFlying
      allowSwimming = tier.allowSwimming
    }
  }

  return monsters
    .filter((m) => {
      if (m.type !== 'Beast') return false
      if (crToNumber(m.cr) > maxCR) return false
      if (!allowFlying && m.speed?.fly && m.speed.fly > 0) return false
      if (!allowSwimming && m.speed?.swim && m.speed.swim > 0 && (!m.speed?.walk || m.speed.walk === 0)) return false
      return true
    })
    .sort((a, b) => crToNumber(b.cr) - crToNumber(a.cr) || a.name.localeCompare(b.name))
}

/**
 * Get eligible familiar forms from the monster list.
 */
export function getFamiliarForms(monsters: MonsterStatBlock[], hasChainPact: boolean): MonsterStatBlock[] {
  const eligibleIds = new Set<string>([...STANDARD_FAMILIAR_FORMS, ...(hasChainPact ? CHAIN_PACT_FAMILIAR_FORMS : [])])

  return monsters.filter((m) => eligibleIds.has(m.id)).sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Get eligible steed forms from the monster list.
 */
export function getSteedForms(monsters: MonsterStatBlock[]): MonsterStatBlock[] {
  const steedIds = new Set<string>(STEED_FORMS)
  return monsters.filter((m) => steedIds.has(m.id)).sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Create a MapToken from a companion and its stat block data.
 */
export function createCompanionToken(
  companion: Companion5e,
  statBlock: MonsterStatBlock,
  gridX: number,
  gridY: number
): Omit<MapToken, 'id'> {
  const tokenDims = getSizeTokenDimensions(statBlock.size)

  return {
    entityId: companion.id,
    entityType: companion.type === 'steed' ? 'npc' : companion.type === 'familiar' ? 'npc' : 'npc',
    label: companion.name,
    gridX,
    gridY,
    sizeX: tokenDims.x,
    sizeY: tokenDims.y,
    visibleToPlayers: true,
    conditions: [],
    currentHP: companion.currentHP,
    maxHP: companion.maxHP,
    ac: statBlock.ac,
    monsterStatBlockId: statBlock.id,
    walkSpeed: statBlock.speed.walk ?? 0,
    swimSpeed: statBlock.speed.swim,
    climbSpeed: statBlock.speed.climb,
    flySpeed: statBlock.speed.fly,
    initiativeModifier: statBlock.abilityScores ? Math.floor((statBlock.abilityScores.dex - 10) / 2) : 0,
    resistances: statBlock.resistances,
    vulnerabilities: statBlock.vulnerabilities,
    immunities: statBlock.damageImmunities,
    darkvision: !!(statBlock.senses.darkvision && statBlock.senses.darkvision > 0),
    darkvisionRange: statBlock.senses.darkvision || undefined,
    specialSenses: [
      ...(statBlock.senses.blindsight ? [{ type: 'blindsight' as const, range: statBlock.senses.blindsight }] : []),
      ...(statBlock.senses.tremorsense ? [{ type: 'tremorsense' as const, range: statBlock.senses.tremorsense }] : []),
      ...(statBlock.senses.truesight ? [{ type: 'truesight' as const, range: statBlock.senses.truesight }] : [])
    ],
    ownerEntityId: companion.ownerId,
    companionType: companion.type as CompanionType,
    sourceSpell: companion.sourceSpell
  }
}
