import type { StateCreator } from 'zustand'
import type { AbilityScoreSet } from '../../../types/character-common'
import { ABILITY_NAMES } from '../../../types/character-common'
import type { AbilityScoreSliceState, BuilderState } from '../types'
import { DEFAULT_SCORES, POINT_BUY_START, roll4d6DropLowest } from '../types'

export const createAbilityScoreSlice: StateCreator<BuilderState, [], [], AbilityScoreSliceState> = (set, get) => ({
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

  setAbilityScores: (scores) => set({ abilityScores: scores }),

  setAbilityScoreMethod: (method) => {
    if (method === 'pointBuy') {
      set({ abilityScoreMethod: method, abilityScores: { ...POINT_BUY_START } })
    } else if (method === 'standard') {
      set({
        abilityScoreMethod: method,
        abilityScores: { ...DEFAULT_SCORES },
        standardArrayAssignments: {
          strength: null,
          dexterity: null,
          constitution: null,
          intelligence: null,
          wisdom: null,
          charisma: null
        }
      })
    } else if (method === 'roll') {
      const scores: AbilityScoreSet = {
        strength: roll4d6DropLowest(),
        dexterity: roll4d6DropLowest(),
        constitution: roll4d6DropLowest(),
        intelligence: roll4d6DropLowest(),
        wisdom: roll4d6DropLowest(),
        charisma: roll4d6DropLowest()
      }
      set({ abilityScoreMethod: method, abilityScores: scores })
    } else {
      set({ abilityScoreMethod: method })
    }
  },

  setStandardArrayAssignment: (ability, value) => {
    const assignments = { ...get().standardArrayAssignments }
    // Clear any ability that already has this value
    if (value !== null) {
      for (const key of Object.keys(assignments)) {
        if (assignments[key] === value) assignments[key] = null
      }
    }
    assignments[ability] = value

    // Build scores from assignments - unassigned abilities default to 10 (not 8)
    const scores: AbilityScoreSet = {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10
    }
    for (const ab of ABILITY_NAMES) {
      if (assignments[ab] !== null) scores[ab] = assignments[ab]!
    }

    set({ standardArrayAssignments: assignments, abilityScores: scores })
  },

  rollAbilityScores: () => {
    const scores: AbilityScoreSet = {
      strength: roll4d6DropLowest(),
      dexterity: roll4d6DropLowest(),
      constitution: roll4d6DropLowest(),
      intelligence: roll4d6DropLowest(),
      wisdom: roll4d6DropLowest(),
      charisma: roll4d6DropLowest()
    }
    set({ abilityScores: scores })
  },

  setActiveAsiSlot: (slotId) => set({ activeAsiSlotId: slotId }),

  confirmAsi: (slotId, abilities) => {
    const { buildSlots, abilityScores, asiSelections } = get()
    const newScores = { ...abilityScores }
    const boost = abilities.length === 1 ? 2 : 1
    for (const ab of abilities) {
      newScores[ab] = Math.min(20, newScores[ab] + boost)
    }

    const label =
      abilities.length === 1
        ? `+2 ${abilities[0].slice(0, 3).toUpperCase()}`
        : abilities.map((a) => `+1 ${a.slice(0, 3).toUpperCase()}`).join(', ')

    const updatedSlots = buildSlots.map((slot) =>
      slot.id === slotId ? { ...slot, selectedId: 'confirmed', selectedName: label } : slot
    )

    set({
      buildSlots: updatedSlots,
      abilityScores: newScores,
      activeAsiSlotId: null,
      customModal: null,
      asiSelections: { ...asiSelections, [slotId]: abilities }
    })
    queueMicrotask(() => get().advanceToNextSlot())
  },

  resetAsi: (slotId) => {
    const { buildSlots, abilityScores, asiSelections } = get()
    const prevAbilities = asiSelections[slotId]
    if (!prevAbilities) return

    const newScores = { ...abilityScores }
    const boost = prevAbilities.length === 1 ? 2 : 1
    for (const ab of prevAbilities) {
      newScores[ab] = Math.max(1, newScores[ab] - boost)
    }

    const updatedSlots = buildSlots.map((slot) =>
      slot.id === slotId ? { ...slot, selectedId: null, selectedName: null } : slot
    )

    const newAsi = { ...asiSelections }
    delete newAsi[slotId]

    set({
      buildSlots: updatedSlots,
      abilityScores: newScores,
      asiSelections: newAsi,
      activeAsiSlotId: slotId,
      customModal: 'asi'
    })
  }
})
