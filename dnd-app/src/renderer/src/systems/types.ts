import type { AbilityName, ClassFeatureEntry, Currency, SpellEntry } from '../types/character-common'
import type { GameSystemConfig } from '../types/game-system'

export interface SheetConfig {
  showInitiative: boolean
  showPerception: boolean
  showClassDC: boolean
  showBulk: boolean
  showElectrum: boolean
  showFocusPoints: boolean
  proficiencyStyle: 'dots' | 'teml'
}

export interface AbilityScoreConfig {
  abilities: Array<{ id: AbilityName; name: string; shortName: string }>
  defaultScores: number[]
  pointBuyBudget?: number
}

export interface BuilderStepDef {
  id: string
  label: string
  category: string
}

export interface GameSystemPlugin {
  id: string
  name: string

  getSpellSlotProgression(className: string, level: number): Record<number, number>
  getSpellList(className: string): Promise<SpellEntry[]>
  isSpellcaster(className: string): boolean
  getStartingGold(classId: string, backgroundId: string): Promise<Currency>
  getClassFeatures(classId: string, level: number): Promise<ClassFeatureEntry[]>
  loadEquipment(): Promise<{ weapons: unknown[]; armor: unknown[]; shields: unknown[]; gear: unknown[] }>

  getSkillDefinitions(): Array<{ name: string; ability: AbilityName }>

  getSheetConfig(): SheetConfig

  // Optional extension points for plugin-provided game systems
  getConfig?(): GameSystemConfig
  getAbilityScores?(): AbilityScoreConfig
  getBuilderSteps?(): BuilderStepDef[]
  getDataPaths?(): Partial<Record<string, string>>
  calculateHP?(classId: string, level: number, conMod: number): number
  calculateAC?(equipment: unknown[], dexMod: number): number
  getProficiencyBonus?(level: number): number
}
