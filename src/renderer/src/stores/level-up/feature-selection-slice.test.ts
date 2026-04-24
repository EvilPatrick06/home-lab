import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('feature-selection-slice', () => {
  it('can be imported', async () => {
    const mod = await import('./feature-selection-slice')
    expect(mod).toBeDefined()
  })

  it('exports createFeatureSelectionSlice function', async () => {
    const mod = await import('./feature-selection-slice')
    expect(mod.createFeatureSelectionSlice).toBeDefined()
    expect(typeof mod.createFeatureSelectionSlice).toBe('function')
  })

  it('createFeatureSelectionSlice returns expected methods', async () => {
    const { createFeatureSelectionSlice } = await import('./feature-selection-slice')
    const mockSet = vi.fn()
    const mockGet = vi.fn(() => ({
      character: null,
      currentLevel: 0,
      targetLevel: 0,
      hpChoices: {},
      hpRolls: {},
      levelUpSlots: [],
      asiSelections: {},
      generalFeatSelections: {},
      epicBoonSelection: null,
      fightingStyleSelection: null,
      blessedWarriorCantrips: [],
      druidicWarriorCantrips: [],
      primalOrderSelection: null,
      divineOrderSelection: null,
      elementalFurySelection: null,
      expertiseSelections: {},
      invocationSelections: [],
      metamagicSelections: [],
      newSpellIds: [],
      spellsRequired: 0,
      classLevelChoices: {}
    })) as unknown as () => import('./types').LevelUpState
    const slice = createFeatureSelectionSlice(mockSet, mockGet)
    expect(typeof slice.setAsiSelection).toBe('function')
    expect(typeof slice.setSlotSelection).toBe('function')
    expect(typeof slice.setEpicBoonSelection).toBe('function')
    expect(typeof slice.setGeneralFeatSelection).toBe('function')
    expect(typeof slice.setFightingStyleSelection).toBe('function')
    expect(typeof slice.setPrimalOrderSelection).toBe('function')
    expect(typeof slice.setDivineOrderSelection).toBe('function')
    expect(typeof slice.setElementalFurySelection).toBe('function')
    expect(typeof slice.setExpertiseSelections).toBe('function')
    expect(typeof slice.getIncompleteChoices).toBe('function')
  })
})
