// ============================================================================
// Shared Enums / Literal Unions used across multiple data type files
// ============================================================================

export type AbilityAbbreviation = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA'
export type AbilityName = 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma'

export type DamageType =
  | 'bludgeoning'
  | 'piercing'
  | 'slashing'
  | 'acid'
  | 'cold'
  | 'fire'
  | 'force'
  | 'lightning'
  | 'necrotic'
  | 'poison'
  | 'psychic'
  | 'radiant'
  | 'thunder'

export type SpellSchool =
  | 'Abjuration'
  | 'Conjuration'
  | 'Divination'
  | 'Enchantment'
  | 'Evocation'
  | 'Illusion'
  | 'Necromancy'
  | 'Transmutation'

export type SpellListName = 'arcane' | 'divine' | 'primal'

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'very-rare' | 'legendary' | 'artifact'

export type CreatureSize = 'Tiny' | 'Small' | 'Medium' | 'Large' | 'Huge' | 'Gargantuan'

export type WeaponCategory = 'Simple Melee' | 'Simple Ranged' | 'Martial Melee' | 'Martial Ranged'

export type EncounterDifficulty = 'low' | 'moderate' | 'high'

export type FeatCategory = 'Origin' | 'General' | 'Fighting Style' | 'Epic Boon'

export type WeaponMasteryProperty = 'Cleave' | 'Graze' | 'Nick' | 'Push' | 'Sap' | 'Slow' | 'Topple' | 'Vex'
