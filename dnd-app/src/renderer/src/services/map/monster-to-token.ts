import type { MapToken } from '../../types/map'
import type { MonsterStatBlock } from '../../types/monster'

export function monsterToTokenData(monster: MonsterStatBlock): Omit<MapToken, 'id' | 'gridX' | 'gridY'> {
  const specialSenses = [
    ...(monster.senses.blindsight ? [{ type: 'blindsight' as const, range: monster.senses.blindsight }] : []),
    ...(monster.senses.tremorsense ? [{ type: 'tremorsense' as const, range: monster.senses.tremorsense }] : []),
    ...(monster.senses.truesight ? [{ type: 'truesight' as const, range: monster.senses.truesight }] : [])
  ]

  return {
    entityId: crypto.randomUUID(),
    entityType: 'enemy',
    label: monster.name,
    sizeX: monster.tokenSize.x,
    sizeY: monster.tokenSize.y,
    visibleToPlayers: false,
    conditions: [],
    currentHP: monster.hp,
    maxHP: monster.hp,
    ac: monster.ac,
    walkSpeed: monster.speed.walk,
    monsterStatBlockId: monster.id,
    initiativeModifier: monster.initiative?.modifier,
    darkvision: monster.senses.darkvision ? true : undefined,
    darkvisionRange: monster.senses.darkvision || undefined,
    resistances: monster.resistances,
    vulnerabilities: monster.vulnerabilities,
    immunities: monster.damageImmunities,
    flySpeed: monster.speed.fly || undefined,
    swimSpeed: monster.speed.swim || undefined,
    climbSpeed: monster.speed.climb || undefined,
    specialSenses: specialSenses.length > 0 ? specialSenses : undefined
  }
}
