import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

import { useLevelUpStore } from './use-level-up-store'

describe('useLevelUpStore', () => {
  it('can be imported', async () => {
    const mod = await import('./use-level-up-store')
    expect(mod).toBeDefined()
  })

  it('exports the store hook', () => {
    expect(typeof useLevelUpStore).toBe('function')
  })

  it('store has hp choice state properties', () => {
    // HpChoice is a type-only export (erased at runtime)
    // so we verify the store state that uses that type instead
    const state = useLevelUpStore.getState()
    expect(typeof state.hpChoices).toBe('object')
    expect(typeof state.setHpChoice).toBe('function')
  })

  it('has expected initial state shape', () => {
    const state = useLevelUpStore.getState()
    expect(state).toHaveProperty('character')
    expect(state).toHaveProperty('currentLevel')
    expect(state).toHaveProperty('targetLevel')
    expect(state).toHaveProperty('levelUpSlots')
    expect(state).toHaveProperty('hpChoices')
    expect(state).toHaveProperty('hpRolls')
    expect(state).toHaveProperty('asiSelections')
    expect(state).toHaveProperty('generalFeatSelections')
    expect(state).toHaveProperty('fightingStyleSelection')
    expect(state).toHaveProperty('primalOrderSelection')
    expect(state).toHaveProperty('divineOrderSelection')
    expect(state).toHaveProperty('elementalFurySelection')
    expect(state).toHaveProperty('newSpellIds')
    expect(state).toHaveProperty('invocationSelections')
    expect(state).toHaveProperty('metamagicSelections')
    expect(state).toHaveProperty('epicBoonSelection')
    expect(state).toHaveProperty('blessedWarriorCantrips')
    expect(state).toHaveProperty('druidicWarriorCantrips')
    expect(state).toHaveProperty('expertiseSelections')
    expect(state).toHaveProperty('classLevelChoices')
    expect(state).toHaveProperty('spellsRequired')
    expect(state).toHaveProperty('loading')
  })

  it('has expected initial state values', () => {
    const state = useLevelUpStore.getState()
    expect(state.character).toBeNull()
    expect(state.currentLevel).toBe(0)
    expect(state.targetLevel).toBe(0)
    expect(state.levelUpSlots).toEqual([])
    expect(state.hpChoices).toEqual({})
    expect(state.hpRolls).toEqual({})
    expect(state.asiSelections).toEqual({})
    expect(state.generalFeatSelections).toEqual({})
    expect(state.fightingStyleSelection).toBeNull()
    expect(state.primalOrderSelection).toBeNull()
    expect(state.divineOrderSelection).toBeNull()
    expect(state.elementalFurySelection).toBeNull()
    expect(state.newSpellIds).toEqual([])
    expect(state.invocationSelections).toEqual([])
    expect(state.metamagicSelections).toEqual([])
    expect(state.epicBoonSelection).toBeNull()
    expect(state.blessedWarriorCantrips).toEqual([])
    expect(state.druidicWarriorCantrips).toEqual([])
    expect(state.expertiseSelections).toEqual({})
    expect(state.classLevelChoices).toEqual({})
    expect(state.spellsRequired).toBe(0)
    expect(state.loading).toBe(false)
  })

  it('has expected actions', () => {
    const state = useLevelUpStore.getState()
    expect(typeof state.initLevelUp).toBe('function')
    expect(typeof state.setTargetLevel).toBe('function')
    expect(typeof state.setHpChoice).toBe('function')
    expect(typeof state.setHpRoll).toBe('function')
    expect(typeof state.setAsiSelection).toBe('function')
    expect(typeof state.setNewSpellIds).toBe('function')
    expect(typeof state.toggleNewSpell).toBe('function')
    expect(typeof state.setEpicBoonSelection).toBe('function')
    expect(typeof state.setGeneralFeatSelection).toBe('function')
    expect(typeof state.setFightingStyleSelection).toBe('function')
    expect(typeof state.setClassLevelChoice).toBe('function')
    expect(typeof state.applyLevelUp).toBe('function')
    expect(typeof state.reset).toBe('function')
  })
})
