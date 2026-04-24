import type { StateCreator } from 'zustand'
import {
  type ClassArmorTraining,
  type ClassFeature,
  type ClassProficiencies,
  type ClassSkillProficiencies,
  type ClassWeaponProficiency,
  type FeatureGrantedSpell,
  type FeatureSavingThrow,
  type FeatureUsesPerRest,
  generate5eBuildSlots,
  generate5eLevelUpSlots
} from '../../../services/character/build-tree-5e'

type _ClassProficiencies = ClassProficiencies
type _ClassArmorTraining = ClassArmorTraining
type _ClassWeaponProficiency = ClassWeaponProficiency
type _ClassSkillProficiencies = ClassSkillProficiencies
type _FeatureUsesPerRest = FeatureUsesPerRest
type _FeatureSavingThrow = FeatureSavingThrow
type _FeatureGrantedSpell = FeatureGrantedSpell
type _ClassFeature = ClassFeature

import type { BuilderState, CoreSliceState } from '../types'
import { DEFAULT_SCORES } from '../types'
import { DEFAULT_CHARACTER_DETAILS } from './character-details-slice'

export const createCoreSlice: StateCreator<BuilderState, [], [], CoreSliceState> = (set, get) => ({
  phase: 'system-select',
  gameSystem: null,
  buildSlots: [],
  activeTab: 'details',
  targetLevel: 1,
  editingCharacterId: null,
  classLevelChoices: {},

  selectGameSystem: (system) => {
    const slots = generate5eBuildSlots(1)
    set({ phase: 'building', gameSystem: system, buildSlots: slots })
    const firstCategory = 'class'
    const firstSlot = slots.find((s) => s.level === 0 && s.category === firstCategory)
    if (firstSlot) {
      get().openSelectionModal(firstSlot.id)
    }
  },

  resetBuilder: () =>
    set({
      // Core slice defaults
      phase: 'system-select',
      gameSystem: null,
      buildSlots: [],
      selectionModal: null,
      activeTab: 'details',
      targetLevel: 1,
      editingCharacterId: null,
      classLevelChoices: {},
      // Ability score slice defaults
      abilityScores: { ...DEFAULT_SCORES },
      abilityScoreMethod: 'standard',
      standardArrayAssignments: {
        strength: null,
        dexterity: null,
        constitution: null,
        intelligence: null,
        wisdom: null,
        charisma: null
      },
      activeAsiSlotId: null,
      asiSelections: {},
      // Character details slice defaults
      ...DEFAULT_CHARACTER_DETAILS
    }),

  setTargetLevel: (level) => {
    const { gameSystem, classLevelChoices } = get()
    if (!gameSystem) return
    const currentSlots = get().buildSlots
    const classSlot = currentSlots.find((s) => s.category === 'class')
    const classId = classSlot?.selectedId ?? ''

    let newSlots: import('../../../types/character-common').BuildSlot[]
    const hasMulticlass =
      Object.keys(classLevelChoices).length > 0 && Object.values(classLevelChoices).some((cid) => cid !== classId)

    if (level > 1 && hasMulticlass) {
      // Multiclass: foundation slots + level-up slots
      const foundationSlots = generate5eBuildSlots(1, classId)
      const levelUpSlots = generate5eLevelUpSlots(1, level, classId, classLevelChoices, {})
      newSlots = [...foundationSlots, ...levelUpSlots]
    } else {
      newSlots = generate5eBuildSlots(level, classId)
    }

    // Preserve existing selections
    for (const newSlot of newSlots) {
      const existing = currentSlots.find((s) => s.id === newSlot.id)
      if (existing) {
        newSlot.selectedId = existing.selectedId
        newSlot.selectedName = existing.selectedName
      }
    }

    // Clean up classLevelChoices for levels beyond the new target
    const cleanedChoices: Record<number, string> = {}
    for (const [lvl, cid] of Object.entries(classLevelChoices)) {
      if (Number(lvl) <= level) {
        cleanedChoices[Number(lvl)] = cid
      }
    }

    set({ targetLevel: level, buildSlots: newSlots, classLevelChoices: cleanedChoices })
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  setClassLevelChoice: (level, newClassId) => {
    const { classLevelChoices, targetLevel, buildSlots } = get()
    const classSlot = buildSlots.find((s) => s.category === 'class')
    const primaryClassId = classSlot?.selectedId ?? ''

    const updatedChoices = { ...classLevelChoices, [level]: newClassId }

    // Regenerate level-up slots
    const foundationSlots = generate5eBuildSlots(1, primaryClassId)
    const levelUpSlots = generate5eLevelUpSlots(1, targetLevel, primaryClassId, updatedChoices, {})
    const newSlots = [...foundationSlots, ...levelUpSlots]

    // Preserve existing selections for slots that still exist
    for (const newSlot of newSlots) {
      const existing = buildSlots.find((s) => s.id === newSlot.id)
      if (existing) {
        newSlot.selectedId = existing.selectedId
        newSlot.selectedName = existing.selectedName
      }
    }

    set({ classLevelChoices: updatedChoices, buildSlots: newSlots })
  }
})
