import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

import { POINT_BUY_BUDGET, POINT_BUY_COSTS, PRESET_ICONS, STANDARD_ARRAY, useBuilderStore } from './use-builder-store'

describe('useBuilderStore', () => {
  it('can be imported', async () => {
    const mod = await import('./use-builder-store')
    expect(mod).toBeDefined()
  })

  it('exports the store hook', () => {
    expect(typeof useBuilderStore).toBe('function')
  })

  it('exports constants', () => {
    expect(typeof POINT_BUY_BUDGET).toBe('number')
    expect(POINT_BUY_BUDGET).toBeGreaterThan(0)
    expect(typeof POINT_BUY_COSTS).toBe('object')
    expect(Array.isArray(STANDARD_ARRAY)).toBe(true)
    expect(STANDARD_ARRAY.length).toBe(6)
    expect(Array.isArray(PRESET_ICONS)).toBe(true)
  })

  it('has expected initial core state shape', () => {
    const state = useBuilderStore.getState()
    expect(state).toHaveProperty('phase')
    expect(state).toHaveProperty('gameSystem')
    expect(state).toHaveProperty('buildSlots')
    expect(state).toHaveProperty('activeTab')
    expect(state).toHaveProperty('targetLevel')
    expect(state).toHaveProperty('editingCharacterId')
    expect(state).toHaveProperty('classLevelChoices')
  })

  it('has expected initial core state values', () => {
    const state = useBuilderStore.getState()
    expect(state.phase).toBe('system-select')
    expect(state.gameSystem).toBeNull()
    expect(state.buildSlots).toEqual([])
    expect(state.activeTab).toBe('details')
    expect(state.targetLevel).toBe(1)
    expect(state.editingCharacterId).toBeNull()
    expect(state.classLevelChoices).toEqual({})
  })

  it('has ability score slice state', () => {
    const state = useBuilderStore.getState()
    expect(state).toHaveProperty('abilityScores')
    expect(state).toHaveProperty('abilityScoreMethod')
    expect(state).toHaveProperty('standardArrayAssignments')
    expect(state.abilityScoreMethod).toBe('standard')
    expect(typeof state.abilityScores).toBe('object')
  })

  it('has selection slice state', () => {
    const state = useBuilderStore.getState()
    expect(state).toHaveProperty('selectionModal')
    expect(state.selectionModal).toBeNull()
  })

  it('has character details slice state', () => {
    const state = useBuilderStore.getState()
    expect(state).toHaveProperty('characterName')
    expect(state).toHaveProperty('iconType')
    expect(state).toHaveProperty('iconPreset')
    expect(state).toHaveProperty('iconCustom')
    expect(state).toHaveProperty('characterGender')
    expect(state).toHaveProperty('characterAlignment')
    expect(state).toHaveProperty('selectedSkills')
    expect(state).toHaveProperty('chosenLanguages')
    expect(state).toHaveProperty('currency')
    expect(state.characterName).toBe('')
    expect(state.iconType).toBe('letter')
  })

  it('has expected actions from all slices', () => {
    const state = useBuilderStore.getState()
    // Core slice
    expect(typeof state.selectGameSystem).toBe('function')
    expect(typeof state.resetBuilder).toBe('function')
    expect(typeof state.setTargetLevel).toBe('function')
    expect(typeof state.setActiveTab).toBe('function')
    // Ability score slice
    expect(typeof state.setAbilityScores).toBe('function')
    expect(typeof state.setAbilityScoreMethod).toBe('function')
    expect(typeof state.rollAbilityScores).toBe('function')
    // Selection slice
    expect(typeof state.openSelectionModal).toBe('function')
    expect(typeof state.closeSelectionModal).toBe('function')
    expect(typeof state.acceptSelection).toBe('function')
    // Character details slice
    expect(typeof state.setCharacterName).toBe('function')
    expect(typeof state.setSelectedSkills).toBe('function')
    expect(typeof state.setChosenLanguages).toBe('function')
    // Build actions slice
    expect(typeof state.advanceToNextSlot).toBe('function')
    expect(typeof state.confirmAbilityScores).toBe('function')
    expect(typeof state.confirmSkills).toBe('function')
    // Save slice
    expect(typeof state.loadCharacterForEdit).toBe('function')
    expect(typeof state.buildCharacter5e).toBe('function')
  })
})
