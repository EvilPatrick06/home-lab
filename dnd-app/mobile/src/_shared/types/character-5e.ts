// Phase 28d — canonical home for the `Character5e` type tree. Type-only (no
// runtime), so it is safe to share across the main/renderer process boundary.
// This lets the Electron main process (which can only reach `src/shared/**`)
// type its character pipeline off the real shape instead of `Record<string,
// unknown>`. The original `src/renderer/src/types/character-5e.ts` re-exports
// every type from here and keeps its runtime helpers (totalHitDiceRemaining /
// totalHitDiceMaximum).

import type {
  AbilityName,
  AbilityScoreSet,
  ActiveCondition,
  ArmorEntry,
  CampaignHistoryEntry,
  ClassFeatureEntry,
  ClassResource,
  Currency,
  MagicItemRarity5e,
  SpellEntry,
  WeaponEntry
} from './character-common'
import type { Companion5e } from './companion'
import type { EntryRef } from './library'

// Phase 15c.1 — v4 instance-ref shape. Stable per-entry identity decouples
// the consumer from array index and entry id (both fragile: index changes
// on reorder, entry id collides with twin daggers / duplicate spells).
export interface InstanceRef<C extends string> {
  instanceId: string
  ref: EntryRef<C>
}

// Phase 15c.1 — runtime state for v4 consumer records. Each map is keyed by
// the matching `instanceId`. Persists with the consumer; hot-path sync target.
export interface Character5eState {
  preparedSpellIds?: Record<string, boolean>
  weaponEquipped?: Record<string, boolean>
  armorEquipped?: Record<string, boolean>
  magicItemAttuned?: Record<string, boolean>
  magicItemCharges?: Record<string, number>
}

export interface Character5e {
  id: string
  gameSystem: 'dnd5e'
  campaignId: string | null
  playerId: string

  name: string
  species: string
  subspecies?: string
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

  spellSlotLevels: Record<number, { current: number; max: number }>
  pactMagicSlotLevels?: Record<number, { current: number; max: number }>
  classFeatures: ClassFeatureEntry[]

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
  bonusFeats?: Array<{ id: string; name: string; description: string }>
  customFeatures?: CustomFeature[]
  classResources?: ClassResource[]
  speciesResources?: ClassResource[]
  languageDescriptions: Record<string, string>
  iconPreset?: string
  portraitPath?: string
  createdAt: string
  updatedAt: string

  // Phase 15c.1 — v4 ref shape. Optional + additive: every legacy field
  // above stays in place until 15c.5 sweeps them out, so consumers can
  // adopt the v4 shape one batch at a time without ever breaking the
  // build. New fields:
  //   *Ref / *Refs — pointer(s) to library entries with optional overrides
  //   state         — instance-state maps keyed by stable instanceId
  speciesRef?: EntryRef<'species'> | null
  subspeciesRef?: EntryRef<'species'> | null
  backgroundRef?: EntryRef<'backgrounds'> | null
  classRefs?: Array<{
    instanceId: string
    ref: EntryRef<'classes'>
    level: number
    levelTaken: number
    subclassRef?: EntryRef<'subclasses'> | null
  }>
  featRefs?: Array<InstanceRef<'feats'>>
  knownSpellRefs?: Array<InstanceRef<'spells'>>
  weaponRefs?: Array<InstanceRef<'weapons'>>
  armorRefs?: Array<InstanceRef<'armor'>>
  magicItemRefs?: Array<InstanceRef<'magic-items'>>
  conditionRefs?: Array<InstanceRef<'conditions'>>
  state?: Character5eState
}

// Phase 15c.5 — legacy v3 input shape. The pre-15c.5 inline arrays were stripped
// from the canonical `Character5e` (now v4: refs + state). These fields survive
// ONLY as the input contract for the migration shim and writer-side computation
// (builder, level-up, rest). The shim derives v4 from them and deletes them, so
// they never reach the persisted/canonical shape consumers read.
export interface Character5eV3 extends Character5e {
  classes?: CharacterClass5e[]
  knownSpells?: SpellEntry[]
  preparedSpellIds?: string[]
  weapons?: WeaponEntry[]
  armor?: ArmorEntry[]
  magicItems?: MagicItemEntry5e[]
  feats?: Array<{ id: string; name: string; description: string; choices?: Record<string, string | string[]> }>
  conditions?: ActiveCondition[]
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
  /** Phase 24b — which class this HD pool belongs to (lowercase id). Optional for
   * legacy entries; defaults to the primary class when reading. */
  classId?: string
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
  /** Phase 23k — consumable (potion/scroll/ammo): a "Use" button decrements quantity. */
  consumable?: boolean
  /** PHASE-13 13I — items stored inside this container; their weight counts toward carry weight (recursive). */
  contents?: EquipmentItem[]
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
