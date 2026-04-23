import { rollMultiple, rollSingle } from '../../../../services/dice/dice-service'
import type { WeaponEntry } from '../../../../types/character-common'

export type Step = 'weapon' | 'unarmed-mode' | 'target' | 'roll' | 'damage' | 'result'
export type UnarmedMode = 'damage' | 'grapple' | 'shove'

/** Weapon type used throughout the attack modal — compatible with WeaponEntry */
export type AttackWeapon = WeaponEntry

export function rollD20(): number {
  return rollSingle(20)
}

export function rollDice(count: number, sides: number): number[] {
  return rollMultiple(count, sides)
}

export function parseDamageDice(damage: string): { count: number; sides: number; modifier: number } | null {
  const match = damage.trim().match(/^(\d*)d(\d+)\s*([+-]\s*\d+)?/)
  if (!match) return null
  return {
    count: match[1] ? parseInt(match[1], 10) : 1,
    sides: parseInt(match[2], 10),
    modifier: match[3] ? parseInt(match[3].replace(/\s/g, ''), 10) : 0
  }
}

export const UNARMED_STRIKE: AttackWeapon = {
  id: '__unarmed__',
  name: 'Unarmed Strike',
  damage: '0', // Special: 1 + STR mod, no dice
  damageType: 'bludgeoning',
  proficient: true,
  properties: [],
  attackBonus: 0
}

export const IMPROVISED_WEAPON: AttackWeapon = {
  id: '__improvised__',
  name: 'Improvised Weapon',
  damage: '1d4',
  damageType: 'bludgeoning',
  proficient: false, // No proficiency bonus
  properties: [],
  range: '20/60',
  attackBonus: 0
}
