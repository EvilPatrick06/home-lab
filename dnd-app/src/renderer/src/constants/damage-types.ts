import type { DamageType } from '../types/data'

/** All 13 damage types in D&D 5e 2024 (PHB p.15) */
export const DAMAGE_TYPES: readonly DamageType[] = [
  'bludgeoning',
  'piercing',
  'slashing',
  'acid',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'poison',
  'psychic',
  'radiant',
  'thunder'
] as const

/** Physical (weapon) damage types — relevant for Heavy Armor Master, magical/nonmagical resistance */
export const PHYSICAL_DAMAGE_TYPES: readonly DamageType[] = ['bludgeoning', 'piercing', 'slashing'] as const

/** Display-friendly capitalized damage type names */
export const DAMAGE_TYPE_LABELS: readonly string[] = [
  'Acid',
  'Cold',
  'Fire',
  'Force',
  'Lightning',
  'Necrotic',
  'Poison',
  'Psychic',
  'Radiant',
  'Thunder',
  'Bludgeoning',
  'Piercing',
  'Slashing'
] as const
