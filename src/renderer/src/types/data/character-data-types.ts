import type { FeatCategory } from './shared-enums'

// === species (individual files via origins/species/index.json) ===

export interface SpeciesSize {
  type: 'fixed' | 'choice'
  value?: string
  options?: string[]
}

export interface SpeciesTraitUsageLimit {
  type: string
  rechargesOn?: string
}

export interface SpeciesLineageOption {
  name: string
  description?: string
  darkvisionOverride?: number
  speedOverride?: number
  cantrips?: string[]
  leveledSpells?: Array<{
    spell: string
    requiredCharacterLevel: number
    oncePerLongRestWithoutSlot?: boolean
  }>
}

export interface SpeciesTrait {
  name: string
  description: string
  usageLimit?: SpeciesTraitUsageLimit
  grantsSkillProficiency?: { count: number; from: string | string[] }
  grantsOriginFeat?: { playerChoice: boolean; recommended?: string }
  lineageChoices?: {
    label: string
    spellcastingAbility?: string | string[]
    options: SpeciesLineageOption[]
  }
}

export interface SpeciesData {
  id: string
  name: string
  creatureType: string
  size: SpeciesSize
  speed: number
  darkvision?: number
  traits: SpeciesTrait[]
  description: string
  source: string
  lifespan?: number
}

// === classes.json ===

export interface ClassProficiencies {
  armor: string[]
  weapons: string[]
  tools: string[]
  skills: { numToChoose: number; options: string[] }
}

export interface ClassArmorTraining {
  category?: string
}

export interface ClassWeaponProficiency {
  category?: string
}

export interface ClassSkillProficiencies {
  count: number
  from: string[]
}

export interface ClassCoreTraits {
  primaryAbility: string[]
  hitPointDie: string
  savingThrowProficiencies: string[]
  skillProficiencies: ClassSkillProficiencies
  weaponProficiencies: ClassWeaponProficiency[]
  armorTraining: string[]
  startingEquipment: Array<{
    label: string
    items: string[]
    gp: number
  }>
}

export interface ClassMulticlassing {
  hitPointDie?: boolean
  weaponProficiencies?: ClassWeaponProficiency[]
  armorTraining?: string[]
}

export interface ClassLevelProgression {
  level: number
  proficiencyBonus: number
  features: string[]
  rages?: number
  rageDamage?: number
  weaponMastery?: number
  sneakAttack?: string
  martialArts?: string
  invocationsKnown?: number
  cantripsKnown?: number
  spellsPrepared?: number
  spellSlots?: Record<string, number>
}

export interface FeatureUsesPerRest {
  uses: number | string
  restType: 'Short' | 'Long'
  rechargeAlternative?: string
}

export interface FeatureSavingThrow {
  ability: string
  formula: string
}

export interface FeatureGrantedSpell {
  spell: string
  alwaysPrepared?: boolean
  ritualOnly?: boolean
  spellcastingAbility?: string
}

export interface ClassFeatureEntry {
  name: string
  level: number
  description: string
  activation: string
  replacesOrImproves?: string
  usesPerRest?: FeatureUsesPerRest
  options?: Array<{ name: string; description: string }>
  scalingValues?: Record<string, Array<{ level: number; value: number | string }>>
  grantsSpells?: FeatureGrantedSpell[]
  savingThrow?: FeatureSavingThrow
  conditionImmunities?: string[]
}

export interface SubclassFeatureEntry {
  name: string
  level: number
  description: string
  activation: string
  replacesOrImproves?: string
  usesPerRest?: FeatureUsesPerRest
  savingThrow?: FeatureSavingThrow
  options?: Array<{ name: string; description: string }>
  grantsSpells?: FeatureGrantedSpell[]
  conditionImmunities?: string[]
}

export interface SubclassData {
  id?: string
  name: string
  className?: string
  level?: number
  description: string
  featureLevels?: number[]
  features: SubclassFeatureEntry[]
  alwaysPreparedSpells?: Record<string, string[]>
}

export interface ClassData {
  id?: string
  name: string
  description: string
  coreTraits: ClassCoreTraits
  multiclassing: ClassMulticlassing
  spellcasting?: {
    type: 'full' | 'half' | 'third' | 'pact'
    ability: string
    focus?: string[]
    ritualCasting?: 'none' | 'fromPrepared' | 'fromSpellbook'
    cantripsKnown?: boolean
    preparedSpellsMechanic?: string
    usesSpellbook?: boolean
    spellbookConfig?: {
      initialSpellCount: number
      spellsGainedPerLevel: number
      copyingCostPerLevelGP: number
      copyingTimePerLevel: string
    }
    pactMagic?: boolean
    initialCantrips: number
    initialPreparedSpells: number
  }
  levelProgression: ClassLevelProgression[]
  classFeatures: ClassFeatureEntry[]
  subclassLabel?: string
  subclassFeatureLevels?: number[]
  subclasses: SubclassData[]
}

// === backgrounds (individual files via origins/backgrounds/index.json) ===

export interface BackgroundEquipmentOption {
  option: string
  items: string[]
}

export interface BackgroundData {
  id: string
  name: string
  description: string
  abilityScores: string[]
  skillProficiencies: string[]
  toolProficiency: string
  feat: string
  equipment: BackgroundEquipmentOption[]
  source: string
}

// === class-features.json ===

export interface ClassFeature {
  level: number
  name: string
  description: string
}

export interface ClassFeatureData {
  features: ClassFeature[]
  subclassLevel: number
  spellSlots: Record<string, Record<string, number>> | null
}

export type ClassFeaturesFile = Record<string, ClassFeatureData>

// === feats (individual files via feats/index.json) ===

export interface FeatPrerequisites {
  level?: number | null
  abilityScores?: Array<{
    abilities: string[]
    minimum: number
  }>
}

export interface FeatAbilityScoreOption {
  abilities: string[]
  amount: number
  maximum: number
  count: number
}

export interface FeatBenefit {
  name: string
  description: string
}

export interface FeatChoiceConfig {
  type: 'ability' | 'skill' | 'element' | 'skill-and-expertise'
  label: string
  options?: string[]
}

export interface FeatData {
  id: string
  name: string
  category: FeatCategory
  prerequisites: FeatPrerequisites
  abilityScoreIncrease?: { options: FeatAbilityScoreOption[] } | null
  repeatable?: { restriction: string }
  benefits: FeatBenefit[]
  source: string
  choiceConfig?: Record<string, FeatChoiceConfig>
}

// === Species Spells (species-spells.json) ===

export interface SpeciesSpellEntry {
  name: string
  level: number
  description: string
  castingTime: string
  range: string
  duration: string
  components: string
  school: string
  concentration?: boolean
  ritual?: boolean
}

export type SpeciesSpellsFile = Record<string, SpeciesSpellEntry>

// === Ability Score Config (ability-score-config.json) ===

export interface AbilityScoreConfigFile {
  pointBuyCosts: Record<string, number>
  pointBuyBudget: number
  standardArray: number[]
  defaultScores: Record<string, number>
  pointBuyStart: Record<string, number>
  methods: Array<{ id: string; label: string; desc: string }>
  standardArrayByClass: Record<string, Record<string, number>>
  classDisplayOrder: string[]
}

// === Preset Icons (preset-icons.json) ===

export interface PresetIcon {
  id: string
  label: string
  emoji: string
}

// === Resource Scaling (class-resources.json, species-resources.json) ===

export interface ResourceScaling {
  minLevel: number
  maxLevel?: number
  max?: number
  maxFormula?: 'profBonus' | 'classLevel' | 'classLevel*5' | 'wisdomMod'
}

export interface ResourceDefinition {
  id: string
  name: string
  shortRestRestore: number | 'all'
  scaling: ResourceScaling[]
}

export interface ClassResourcesFile {
  classes: Record<string, { resources: ResourceDefinition[] }>
  feats: Record<string, ResourceDefinition>
}

export interface SpeciesResourceEntry {
  resources: ResourceDefinition[]
  heritages?: Record<string, ResourceDefinition[]>
}

export interface SpeciesResourcesFile {
  species: Record<string, SpeciesResourceEntry>
}
