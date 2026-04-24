export interface AbilityScoreSet {
  strength: number
  dexterity: number
  constitution: number
  intelligence: number
  wisdom: number
  charisma: number
}

export type AbilityName = keyof AbilityScoreSet

export const ABILITY_NAMES: AbilityName[] = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma'
]

export type Rarity = 'common' | 'uncommon' | 'rare' | 'unique'

export type MagicItemRarity5e = 'common' | 'uncommon' | 'rare' | 'very-rare' | 'legendary' | 'artifact'

export type BuildSlotCategory =
  | 'ancestry'
  | 'heritage'
  | 'background'
  | 'class'
  | 'ancestry-feat'
  | 'class-feat'
  | 'skill-feat'
  | 'general-feat'
  | 'ability-boost'
  | 'class-feature'
  | 'skill-choice'
  | 'ability-scores'
  | 'epic-boon'
  | 'fighting-style'
  | 'primal-order'
  | 'divine-order'
  | 'expertise'

export interface BuildSlot {
  id: string
  label: string
  category: BuildSlotCategory
  level: number
  selectedId: string | null
  selectedName: string | null
  selectedDescription?: string | null
  selectedDetailFields?: DetailField[] | null
  required: boolean
  isAutoGranted?: boolean
}

export const STANDARD_LANGUAGES_5E = [
  'Common',
  'Common Sign Language',
  'Draconic',
  'Dwarvish',
  'Elvish',
  'Giant',
  'Gnomish',
  'Goblin',
  'Halfling',
  'Orc'
]

export const RARE_LANGUAGES_5E = [
  'Abyssal',
  'Celestial',
  'Deep Speech',
  'Druidic',
  'Infernal',
  'Primordial',
  'Sylvan',
  "Thieves' Cant",
  'Undercommon'
]

export const PRIMORDIAL_DIALECTS = ['Aquan', 'Auran', 'Ignan', 'Terran'] as const

export const ALL_LANGUAGES_5E = [...STANDARD_LANGUAGES_5E, ...RARE_LANGUAGES_5E]

export interface SelectableOption {
  id: string
  name: string
  rarity: Rarity
  description: string
  traits: string[]
  level?: number
  prerequisites?: string[]
  source: string
  detailFields: DetailField[]
}

export interface DetailField {
  label: string
  value: string
}

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

export interface CampaignHistoryEntry {
  campaignId: string
  campaignName: string
  joinedAt: string
  leftAt?: string
  role: 'player' | 'dm'
}

export function formatMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`
}

/**
 * PHB 2024: A creature is Bloodied while it has half its Hit Points or fewer remaining.
 * Bloodied has no mechanical effect on its own but may trigger other game effects.
 */
export function isBloodied(currentHP: number, maxHP: number): boolean {
  return currentHP > 0 && currentHP <= Math.floor(maxHP / 2)
}

// === Unified types for new character sheet ===

export interface SpellEntry {
  id: string
  name: string
  level: number
  description: string
  castingTime: string
  range: string
  duration: string
  components: string
  school?: string
  concentration?: boolean
  ritual?: boolean
  traditions?: string[]
  traits?: string[]
  heightened?: Record<string, string>
  higherLevels?: string
  classes?: string[]
  prepared?: boolean
  source?: 'species' | 'class' | 'feat' | 'item'
  innateUses?: { max: number; remaining: number }
}

export interface WeaponEntry {
  id: string
  name: string
  damage: string
  damageType: string
  attackBonus: number
  properties: string[]
  description?: string
  hands?: string
  group?: string
  bulk?: string
  range?: string
  proficient?: boolean
  mastery?: string
  cost?: string
  weight?: number
}

export interface ArmorEntry {
  id: string
  name: string
  acBonus: number
  equipped: boolean
  type: 'armor' | 'shield' | 'clothing'
  description?: string
  category?: string
  dexCap?: number | null
  stealthDisadvantage?: boolean
  checkPenalty?: number
  speedPenalty?: number
  strength?: number
  bulk?: number
  hardness?: number
  shieldHP?: number
  shieldBT?: number
  currentShieldHP?: number
  cost?: string
  weight?: number
}

export interface Currency {
  cp: number
  sp: number
  gp: number
  pp: number
  ep?: number
}

export interface ClassFeatureEntry {
  level: number
  name: string
  source: string
  description: string
}

export interface ActiveCondition {
  name: string
  type: 'condition' | 'buff'
  isCustom: boolean
  value?: number
}

export interface ClassResource {
  id: string
  name: string
  current: number
  max: number
  shortRestRestore: number | 'all'
}
