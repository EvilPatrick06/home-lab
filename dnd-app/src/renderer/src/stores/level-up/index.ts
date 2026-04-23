import { create } from 'zustand'
import { generate5eLevelUpSlots } from '../../services/character/build-tree-5e'
import type { Character } from '../../types/character'
import { is5eCharacter } from '../../types/character'
import type { Character5e } from '../../types/character-5e'
import type { AbilityName } from '../../types/character-common'
import { apply5eLevelUp } from './apply-level-up'
import { createFeatureSelectionSlice } from './feature-selection-slice'
import { createHpSlice } from './hp-slice'
import { createSpellSlotSlice } from './spell-slot-slice'
import type { HpChoice, LevelUpState } from './types'
import { initialState } from './types'

export type { HpChoice } from './types'

export const useLevelUpStore = create<LevelUpState>((set, get) => ({
  ...initialState,

  ...createHpSlice(set),
  ...createSpellSlotSlice(set, get),
  ...createFeatureSelectionSlice(set, get),

  initLevelUp: (character: Character) => {
    const targetLevel = Math.min(20, character.level + 1)

    // Default class choices: all levels go to primary class
    const classLevelChoices: Record<number, string> = {}
    if (is5eCharacter(character)) {
      for (let lvl = character.level + 1; lvl <= targetLevel; lvl++) {
        classLevelChoices[lvl] = character.buildChoices.classId
      }
    }

    const slots = generate5eLevelUpSlots(character.level, targetLevel, character.buildChoices.classId)

    set({
      character,
      currentLevel: character.level,
      targetLevel,
      levelUpSlots: slots,
      hpChoices: {},
      hpRolls: {},
      asiSelections: {},
      generalFeatSelections: {},
      fightingStyleSelection: null,
      primalOrderSelection: null,
      divineOrderSelection: null,
      elementalFurySelection: null,
      newSpellIds: [],
      invocationSelections: is5eCharacter(character) ? [...(character.invocationsKnown ?? [])] : [],
      metamagicSelections: is5eCharacter(character) ? [...(character.metamagicKnown ?? [])] : [],
      epicBoonSelection: null,
      blessedWarriorCantrips: [],
      druidicWarriorCantrips: [],
      expertiseSelections: {},
      classLevelChoices,
      loading: false
    })
  },

  setTargetLevel: (level: number) => {
    const { character, currentLevel, hpChoices, hpRolls, asiSelections, classLevelChoices } = get()
    if (!character) return
    const clamped = Math.max(currentLevel + 1, Math.min(20, level))

    // Preserve/extend class level choices
    const newClassChoices: Record<number, string> = {}
    if (is5eCharacter(character)) {
      for (let lvl = currentLevel + 1; lvl <= clamped; lvl++) {
        newClassChoices[lvl] = classLevelChoices[lvl] ?? character.buildChoices.classId
      }
    }

    // Compute existing class levels for multiclass slot generation
    let existingClassLevels: Record<string, number> | undefined
    if (
      is5eCharacter(character) &&
      Object.values(newClassChoices).some((id) => id !== character.buildChoices.classId)
    ) {
      existingClassLevels = {}
      for (const cls of character.classes) {
        existingClassLevels[cls.name.toLowerCase()] = cls.level
      }
    }

    const slots = generate5eLevelUpSlots(
      currentLevel,
      clamped,
      character.buildChoices.classId,
      existingClassLevels ? newClassChoices : undefined,
      existingClassLevels
    )

    // Preserve existing HP choices/rolls for levels that still exist
    const newHpChoices: Record<number, HpChoice> = {}
    const newHpRolls: Record<number, number> = {}
    for (let lvl = currentLevel + 1; lvl <= clamped; lvl++) {
      if (hpChoices[lvl]) newHpChoices[lvl] = hpChoices[lvl]
      if (hpRolls[lvl] !== undefined) newHpRolls[lvl] = hpRolls[lvl]
    }

    // Preserve ASI selections for slots that still exist
    const slotIds = new Set(slots.map((s) => s.id))
    const newAsi: Record<string, AbilityName[]> = {}
    for (const [key, val] of Object.entries(asiSelections)) {
      if (slotIds.has(key)) newAsi[key] = val
    }

    // Preserve general feat selections for slots that still exist
    const newGeneralFeats: Record<string, { id: string; name: string; description: string }> = {}
    for (const [key, val] of Object.entries(get().generalFeatSelections)) {
      if (slotIds.has(key)) newGeneralFeats[key] = val
    }

    // Clear selections if their slots are no longer in the level-up range
    const hasEpicBoonSlot = slots.some((s) => s.category === 'epic-boon')
    const hasFightingStyleSlot = slots.some((s) => s.category === 'fighting-style')
    const hasPrimalOrderSlot = slots.some((s) => s.category === 'primal-order')
    const hasDivineOrderSlot = slots.some((s) => s.category === 'divine-order')
    set({
      targetLevel: clamped,
      levelUpSlots: slots,
      hpChoices: newHpChoices,
      hpRolls: newHpRolls,
      asiSelections: newAsi,
      generalFeatSelections: newGeneralFeats,
      classLevelChoices: newClassChoices,
      ...(hasEpicBoonSlot ? {} : { epicBoonSelection: null }),
      ...(hasFightingStyleSlot ? {} : { fightingStyleSelection: null }),
      ...(hasPrimalOrderSlot ? {} : { primalOrderSelection: null }),
      ...(hasDivineOrderSlot ? {} : { divineOrderSelection: null })
    })
  },

  setClassLevelChoice: (level: number, classId: string) => {
    const { character, currentLevel, targetLevel, classLevelChoices } = get()
    if (!character || !is5eCharacter(character)) return

    const newChoices = { ...classLevelChoices, [level]: classId }

    // Recompute existing class levels for slot generation
    const existingClassLevels: Record<string, number> = {}
    for (const cls of character.classes) {
      existingClassLevels[cls.name.toLowerCase()] = cls.level
    }

    const isMulticlass = Object.values(newChoices).some((id) => id !== character.buildChoices.classId)
    const slots = generate5eLevelUpSlots(
      currentLevel,
      targetLevel,
      character.buildChoices.classId,
      isMulticlass ? newChoices : undefined,
      isMulticlass ? existingClassLevels : undefined
    )

    // Preserve valid ASI and general feat selections
    const slotIds = new Set(slots.map((s) => s.id))
    const newAsi: Record<string, AbilityName[]> = {}
    for (const [key, val] of Object.entries(get().asiSelections)) {
      if (slotIds.has(key)) newAsi[key] = val
    }
    const newGeneralFeats: Record<string, { id: string; name: string; description: string }> = {}
    for (const [key, val] of Object.entries(get().generalFeatSelections)) {
      if (slotIds.has(key)) newGeneralFeats[key] = val
    }

    set({
      classLevelChoices: newChoices,
      levelUpSlots: slots,
      asiSelections: newAsi,
      generalFeatSelections: newGeneralFeats,
      ...(slots.some((s) => s.category === 'fighting-style') ? {} : { fightingStyleSelection: null })
    })
  },

  applyLevelUp: async () => {
    const {
      character,
      currentLevel,
      targetLevel,
      hpChoices,
      hpRolls,
      asiSelections,
      newSpellIds,
      epicBoonSelection,
      classLevelChoices,
      generalFeatSelections,
      fightingStyleSelection,
      primalOrderSelection,
      divineOrderSelection,
      elementalFurySelection,
      invocationSelections,
      metamagicSelections,
      blessedWarriorCantrips,
      druidicWarriorCantrips,
      expertiseSelections
    } = get()
    if (!character) throw new Error('No character to level up')

    return apply5eLevelUp(
      character as Character5e,
      currentLevel,
      targetLevel,
      hpChoices,
      hpRolls,
      asiSelections,
      newSpellIds,
      epicBoonSelection,
      classLevelChoices,
      generalFeatSelections,
      fightingStyleSelection,
      primalOrderSelection,
      divineOrderSelection,
      elementalFurySelection,
      invocationSelections,
      metamagicSelections,
      blessedWarriorCantrips,
      druidicWarriorCantrips,
      expertiseSelections
    )
  },

  reset: () => set(initialState)
}))
