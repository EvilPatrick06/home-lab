import type {
  AbilityName,
  AbilityScoreSet,
  ActiveCondition,
  ArmorEntry,
  CampaignHistoryEntry,
  ClassFeatureEntry,
  Currency,
  MagicItemRarity5e,
  SpellEntry,
  WeaponEntry
} from './character-common'
import type { Companion5e } from './companion'

export interface Character5e {
  id: string
  gameSystem: 'dnd5e'
  campaignId: string | null
  playerId: string

  name: string
  species: string
  subspecies?: string
  classes: CharacterClass5e[]
  level: number
  background: string
  alignment: string
  xp: number
  levelingMode: 'xp' | 'milestone'

  abilityScores: AbilityScoreSet
  hitPoints: HitPoints
  hitDice: HitDiceEntry[]
  armorClass: number
  initiative: number
  speed: number
  speeds: { swim: number; fly: number; climb: number; burrow: number }
  size?: string
  creatureType?: string
  senses: string[]
  resistances: string[]
  immunities: string[]
  vulnerabilities: string[]

  details: CharacterDetails
  proficiencies: Proficiencies5e
  skills: SkillProficiency5e[]

  spellcasting?: SpellcastingInfo5e

  equipment: EquipmentItem[]
  treasure: Currency
  features: Feature[]

  knownSpells: SpellEntry[]
  preparedSpellIds: string[]
  spellSlotLevels: Record<number, { current: number; max: number }>
  pactMagicSlotLevels?: Record<number, { current: number; max: number }>
  classFeatures: ClassFeatureEntry[]
  weapons: WeaponEntry[]
  armor: ArmorEntry[]
  feats: Array<{ id: string; name: string; description: string; choices?: Record<string, string | string[]> }>

  buildChoices: BuildChoices5e

  status: 'active' | 'retired' | 'deceased'
  campaignHistory: CampaignHistoryEntry[]

  backstory: string
  notes: string
  pets: Array<{ name: string; type: string }>
  companions?: Companion5e[]
  activeWildShapeFormId?: string
  deathSaves: { successes: number; failures: number }
  heroicInspiration?: boolean
  wildShapeUses?: { current: number; max: number }
  invocationsKnown?: string[]
  metamagicKnown?: string[]
  weaponMasteryChoices?: string[]
  attunement: Array<{ name: string; description: string }>
  magicItems?: MagicItemEntry5e[]
  bonusFeats?: Array<{ id: string; name: string; description: string }>
  customFeatures?: CustomFeature[]
  classResources?: import('./character-common').ClassResource[]
  speciesResources?: import('./character-common').ClassResource[]
  languageDescriptions: Record<string, string>
  conditions: ActiveCondition[]
  iconPreset?: string
  portraitPath?: string
  createdAt: string
  updatedAt: string
}

export interface BuildChoices5e {
  speciesId: string
  subspeciesId?: string
  classId: string
  subclassId?: string
  backgroundId: string
  selectedSkills: string[]
  abilityScoreMethod: 'standard' | 'pointBuy' | 'roll' | 'custom'
  abilityScoreAssignments: Record<string, number>
  asiChoices?: Record<string, string[]>
  chosenLanguages?: string[]
  backgroundAbilityBonuses?: Record<string, number>
  versatileFeatId?: string
  epicBoonId?: string
  generalFeatChoices?: Record<string, string>
  fightingStyleId?: string
  backgroundEquipmentChoice?: 'equipment' | 'gold'
  classEquipmentChoice?: string
  multiclassEntries?: MulticlassEntry[]
  speciesSpellcastingAbility?: 'intelligence' | 'wisdom' | 'charisma'
  keenSensesSkill?: string
  primalOrderChoice?: 'magician' | 'warden'
  divineOrderChoice?: 'protector' | 'thaumaturge'
  elementalFuryChoice?: 'potent-spellcasting' | 'primal-strike'
  blessedWarriorCantrips?: string[]
  druidicWarriorCantrips?: string[]
  expertiseChoices?: Record<string, string[]>
}

export interface MulticlassEntry {
  classId: string
  subclassId?: string
  levelTaken: number
}

export interface CharacterClass5e {
  name: string
  level: number
  subclass?: string
  hitDie: number
}

export interface HitPoints {
  current: number
  maximum: number
  temporary: number
}

export interface HitDiceEntry {
  current: number
  maximum: number
  dieType: number
}

export function totalHitDiceRemaining(hitDice: HitDiceEntry[]): number {
  return hitDice.reduce((sum, hd) => sum + hd.current, 0)
}

export function totalHitDiceMaximum(hitDice: HitDiceEntry[]): number {
  return hitDice.reduce((sum, hd) => sum + hd.maximum, 0)
}

export interface CharacterDetails {
  gender?: string
  deity?: string
  age?: string
  height?: string
  weight?: string
  eyes?: string
  hair?: string
  skin?: string
  appearance?: string
  personality?: string
  ideals?: string
  bonds?: string
  flaws?: string
}

export interface Proficiencies5e {
  weapons: string[]
  armor: string[]
  tools: string[]
  languages: string[]
  savingThrows: AbilityName[]
}

export interface SkillProficiency5e {
  name: string
  ability: AbilityName
  proficient: boolean
  expertise: boolean
}

export interface SpellcastingInfo5e {
  ability: AbilityName
  spellSaveDC: number
  spellAttackBonus: number
}

export interface EquipmentItem {
  name: string
  quantity: number
  weight?: number
  description?: string
  source?: string
  cost?: string
  equipped?: boolean
  type?: string
  ac?: number
  armorClass?: number
  armorType?: string
  category?: string
  magicItemId?: string
  maxCharges?: number
  currentCharges?: number
  rechargeType?: 'dawn' | 'dusk' | 'short-rest' | 'long-rest'
  rechargeFormula?: string
}

export interface Feature {
  name: string
  source: string
  description: string
}

export interface CustomFeature {
  id: string
  name: string
  source: string
  description: string
  grantedAt: string
  temporary?: boolean
}

export type SentientCommunication = 'empathy' | 'speech' | 'telepathy'

export interface SentientItemTraits {
  intelligence: number
  wisdom: number
  charisma: number
  alignment: string
  communication: SentientCommunication
  languages?: string[]
  senses: string
  specialPurpose?: string
  personality?: string
}

export interface MagicItemEntry5e {
  id: string
  name: string
  rarity: MagicItemRarity5e
  type: string
  attunement: boolean
  attuned?: boolean
  description: string
  weight?: number
  linkedWeaponId?: string
  linkedArmorId?: string
  charges?: {
    current: number
    max: number
    rechargeType: 'dawn' | 'long-rest' | 'none'
    rechargeDice?: string
  }
  grantedSpells?: Array<{
    spellId: string
    spellName: string
    charges?: number
  }>
  sentient?: SentientItemTraits
  identified?: boolean
}
