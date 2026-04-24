import type { SpellSchool } from '../types/data'

/** All 8 schools of magic in D&D 5e 2024 (PHB p.236) */
export const SPELL_SCHOOLS: readonly SpellSchool[] = [
  'Abjuration',
  'Conjuration',
  'Divination',
  'Enchantment',
  'Evocation',
  'Illusion',
  'Necromancy',
  'Transmutation'
] as const
