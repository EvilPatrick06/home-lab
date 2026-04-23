import type { SpellListName, SpellSchool } from './shared-enums'

// === spells.json (current flat format) ===

export interface SpellData {
  id: string
  name: string
  level: number
  school: SpellSchool
  castingTime: string
  range: string
  duration: string
  concentration: boolean
  ritual: boolean
  components: string
  description: string
  higherLevels?: string
  classes: string[]
  spellList: SpellListName[]
}

// === Spell index entries (spell-index.json) ===

export interface SpellIndexEntry {
  id: string
  name: string
  school: string
  level?: number
  classes: string[]
  ritual?: boolean
  components: {
    verbal?: boolean
    somatic?: boolean
    material?: boolean
  }
  path: string
}

// === Structured spell types (for future migration) ===

export interface SpellAction {
  type: 'Action' | 'BonusAction' | 'Reaction' | 'Minute' | 'Hour' | string
  ritual?: boolean
}

export interface SpellRange {
  type: 'Self' | 'Touch' | 'Ranged' | 'Area' | 'Unlimited' | string
  distance?: number
  unit?: 'feet' | 'miles'
  shape?: 'Sphere' | 'Cone' | 'Cube' | 'Cylinder' | 'Line' | 'Emanation'
  shapeSize?: number
}

export interface SpellComponents {
  verbal: boolean
  somatic: boolean
  material: boolean
  materialDescription?: string
  consumed?: boolean
  cost?: number
}

export interface SpellDuration {
  type: 'Instantaneous' | 'Timed' | 'Permanent' | 'Special' | string
  concentration?: boolean
  amount?: number
  unit?: 'rounds' | 'minutes' | 'hours' | 'days'
}

export interface SpellDamageData {
  dice?: {
    diceCount: number
    diceValue: number
    addCasterMod?: boolean
  }
  type?: string
  applicationType?: string
}

export interface SpellHealingData {
  dice?: {
    diceCount: number
    diceValue: number
    addCasterMod?: boolean
  }
  applicationType?: string
}

export interface SpellD20Modifier {
  appliesTo: string
  dice?: { diceCount: number; diceValue: number }
  fixedBonus?: number
  isBonus: boolean
}

export interface HigherLevelScalingEntry {
  type: string
  diceCountPerLevel?: number
  diceValue?: number
  flatPerLevel?: number
  baseSpellLevel?: number
  description: string
}

export interface HigherLevelCasting {
  scaling?: HigherLevelScalingEntry[]
  overrides?: Array<{ minSlotLevel: number; maxSlotLevel: number; description: string }>
}
