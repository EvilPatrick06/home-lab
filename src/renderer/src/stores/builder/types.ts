import abilityScoreConfigJson from '@data/5e/character/ability-score-config.json'
import presetIconsJson from '@data/5e/character/preset-icons.json'
import { load5eAbilityScoreConfig, load5ePresetIcons } from '../../services/data-provider'
import type { BuilderPhase, ContentTab, SelectionModalState } from '../../types/builder'
import type { Character } from '../../types/character'
import type { Character5e } from '../../types/character-5e'
import type { AbilityName, AbilityScoreSet, BuildSlot, Rarity } from '../../types/character-common'
import { ABILITY_NAMES } from '../../types/character-common'
import type { GameSystem } from '../../types/game-system'

// --- Constants ---

/** IDs that identify foundation-level (level 0) build slots, used to separate them from level-based slots */
export const FOUNDATION_SLOT_IDS = ['class', 'background', 'ancestry', 'heritage', 'ability-scores', 'skill-choices']

export type AbilityScoreMethod = 'standard' | 'pointBuy' | 'roll' | 'custom'

export const POINT_BUY_COSTS: Record<number, number> = Object.fromEntries(
  Object.entries(abilityScoreConfigJson.pointBuyCosts).map(([k, v]) => [Number(k), v])
)
export const POINT_BUY_BUDGET = abilityScoreConfigJson.pointBuyBudget

export const STANDARD_ARRAY = abilityScoreConfigJson.standardArray

export const PRESET_ICONS = presetIconsJson

export const DEFAULT_SCORES: AbilityScoreSet = abilityScoreConfigJson.defaultScores as AbilityScoreSet

export const POINT_BUY_START: AbilityScoreSet = abilityScoreConfigJson.pointBuyStart as AbilityScoreSet

/** Load ability score config from the data store (includes plugin overrides). */
export async function loadAbilityScoreConfigData(): Promise<unknown> {
  return load5eAbilityScoreConfig()
}

/** Load preset icons from the data store (includes plugin additions). */
export async function loadPresetIconData(): Promise<unknown> {
  return load5ePresetIcons()
}

// --- Helper functions ---

export function roll4d6DropLowest(): number {
  const dice = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1)
  dice.sort((a, b) => a - b)
  return dice[1] + dice[2] + dice[3]
}

export function pointBuyTotal(scores: AbilityScoreSet): number {
  return ABILITY_NAMES.reduce((total, ab) => {
    const score = Math.max(8, Math.min(15, scores[ab]))
    return total + (POINT_BUY_COSTS[score] ?? 0)
  }, 0)
}

// --- State interface ---

export interface CoreSliceState {
  phase: BuilderPhase
  gameSystem: GameSystem | null
  buildSlots: BuildSlot[]
  activeTab: ContentTab
  targetLevel: number
  editingCharacterId: string | null
  classLevelChoices: Record<number, string>

  selectGameSystem: (system: GameSystem) => void
  resetBuilder: () => void
  setTargetLevel: (level: number) => void
  setActiveTab: (tab: ContentTab) => void
  setClassLevelChoice: (level: number, classId: string) => void
}

export interface AbilityScoreSliceState {
  abilityScores: AbilityScoreSet
  abilityScoreMethod: AbilityScoreMethod
  standardArrayAssignments: Record<string, number | null>

  setAbilityScores: (scores: AbilityScoreSet) => void
  setAbilityScoreMethod: (method: AbilityScoreMethod) => void
  setStandardArrayAssignment: (ability: AbilityName, value: number | null) => void
  rollAbilityScores: () => void
  setActiveAsiSlot: (slotId: string | null) => void
  activeAsiSlotId: string | null
  asiSelections: Record<string, AbilityName[]>
  confirmAsi: (slotId: string, abilities: AbilityName[]) => void
  resetAsi: (slotId: string) => void
}

export interface SelectionSliceState {
  selectionModal: SelectionModalState | null

  openSelectionModal: (slotId: string) => Promise<void>
  closeSelectionModal: () => void
  setModalRarityFilter: (filter: Rarity | 'all') => void
  setModalSearchQuery: (query: string) => void
  setModalPreviewOption: (optionId: string | null) => void
  acceptSelection: (optionId: string) => void
}

export interface CharacterDetailsSliceState {
  characterName: string
  iconType: 'letter' | 'preset' | 'custom'
  iconPreset: string
  iconCustom: string
  characterGender: string
  characterDeity: string
  characterAge: string
  characterNotes: string
  characterPersonality: string
  characterIdeals: string
  characterBonds: string
  characterFlaws: string
  characterBackstory: string
  characterHeight: string
  characterWeight: string
  characterEyes: string
  characterHair: string
  characterSkin: string
  characterAppearance: string
  characterAlignment: string

  // Derived from selections
  speciesLanguages: string[]
  speciesExtraLangCount: number
  speciesExtraSkillCount: number
  versatileFeatId: string | null
  heritageId: string | null
  derivedSpeciesTraits: Array<{
    name: string
    description: string
    spellGranted?: string | { list: string; count: number }
  }>
  bgLanguageCount: number
  classExtraLangCount: number
  chosenLanguages: string[]
  speciesSize: string
  speciesSpeed: number
  speciesTraits: Array<{ name: string; description: string }>
  speciesProficiencies: string[]
  classEquipment: Array<{ name: string; quantity: number; source: string }>
  bgEquipment: Array<{ option: string; items: string[]; source: string }>
  currency: { pp: number; gp: number; sp: number; cp: number }
  pets: Array<{ name: string; type: string }>
  currentHP: number | null
  tempHP: number
  conditions: Array<{ name: string; type: 'condition' | 'buff'; isCustom: boolean }>
  classSkillOptions: string[]
  classMandatorySkills: string[]
  selectedSkills: string[]
  maxSkills: number
  customModal: 'ability-scores' | 'skills' | 'asi' | 'expertise' | null
  builderExpertiseSelections: Record<string, string[]>
  activeExpertiseSlotId: string | null
  builderFeatSelections: Record<string, { id: string; name: string; description: string }>
  backgroundAbilityBonuses: Record<string, number>
  backgroundEquipmentChoice: 'equipment' | 'gold' | null
  classEquipmentChoice: string | null
  selectedSpellIds: string[]
  higherLevelGoldBonus: number
  selectedMagicItems: Array<{ slotRarity: string; itemId: string; itemName: string }>

  setCharacterName: (name: string) => void
  setSelectedSkills: (skills: string[]) => void
  setIconType: (type: 'letter' | 'preset' | 'custom') => void
  setIconPreset: (preset: string) => void
  setIconCustom: (dataUrl: string) => void
  setChosenLanguages: (languages: string[]) => void
  setCurrency: (currency: { pp: number; gp: number; sp: number; cp: number }) => void
  addPet: (name: string, type: string) => void
  removePet: (index: number) => void
  setCurrentHP: (hp: number | null) => void
  setTempHP: (hp: number) => void
  addCondition: (name: string, type: 'condition' | 'buff', isCustom: boolean) => void
  removeCondition: (index: number) => void
  removeEquipmentItem: (source: 'class' | 'bg', index: number) => void
  addEquipmentItem: (item: { name: string; quantity: number; source: string }) => void
  deductCurrency: (key: 'pp' | 'gp' | 'sp' | 'cp', amount: number) => void
  setBackgroundAbilityBonuses: (bonuses: Record<string, number>) => void
  setBackgroundEquipmentChoice: (choice: 'equipment' | 'gold') => void
  setClassEquipmentChoice: (choice: string) => void
  setSpeciesSize: (size: string) => void
  setSelectedSpellIds: (ids: string[]) => void
  setHigherLevelGoldBonus: (amount: number) => void
  setSelectedMagicItems: (items: Array<{ slotRarity: string; itemId: string; itemName: string }>) => void
  speciesSpellcastingAbility: 'intelligence' | 'wisdom' | 'charisma' | null
  keenSensesSkill: string | null
  blessedWarriorCantrips: string[]
  druidicWarriorCantrips: string[]
  setSpeciesSpellcastingAbility: (ability: 'intelligence' | 'wisdom' | 'charisma' | null) => void
  setKeenSensesSkill: (skill: string | null) => void
  setBlessedWarriorCantrips: (ids: string[]) => void
  setDruidicWarriorCantrips: (ids: string[]) => void
  setVersatileFeat: (featId: string | null) => void
  setBuilderExpertiseSelections: (slotId: string, skills: string[]) => void
  setBuilderFeatSelection: (slotId: string, feat: { id: string; name: string; description: string } | null) => void
  openCustomModal: (modal: 'ability-scores' | 'skills' | 'asi' | 'expertise') => void
  closeCustomModal: () => void
}

export interface BuildActionsSliceState {
  advanceToNextSlot: () => void
  confirmAbilityScores: () => void
  confirmSkills: () => void
  confirmExpertise: (slotId: string) => void
}

export interface SaveSliceState {
  loadCharacterForEdit: (character: Character) => void
  buildCharacter5e: () => Promise<Character5e>
}

export type BuilderState = CoreSliceState &
  AbilityScoreSliceState &
  SelectionSliceState &
  CharacterDetailsSliceState &
  BuildActionsSliceState &
  SaveSliceState
