import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('level-up store index', () => {
  it('can be imported', async () => {
    const mod = await import('./index')
    expect(mod).toBeDefined()
  })

  it('exports useLevelUpStore', async () => {
    const mod = await import('./index')
    expect(mod.useLevelUpStore).toBeDefined()
    expect(typeof mod.useLevelUpStore).toBe('function')
  })

  it('store has initial state fields', async () => {
    const { useLevelUpStore } = await import('./index')
    const state = useLevelUpStore.getState()
    expect(state.character).toBeNull()
    expect(state.currentLevel).toBe(0)
    expect(state.targetLevel).toBe(0)
    expect(Array.isArray(state.levelUpSlots)).toBe(true)
    expect(state.loading).toBe(false)
  })

  it('store has action methods', async () => {
    const { useLevelUpStore } = await import('./index')
    const state = useLevelUpStore.getState()
    expect(typeof state.initLevelUp).toBe('function')
    expect(typeof state.setTargetLevel).toBe('function')
    expect(typeof state.setHpChoice).toBe('function')
    expect(typeof state.setHpRoll).toBe('function')
    expect(typeof state.setAsiSelection).toBe('function')
    expect(typeof state.setNewSpellIds).toBe('function')
    expect(typeof state.toggleNewSpell).toBe('function')
    expect(typeof state.applyLevelUp).toBe('function')
    expect(typeof state.reset).toBe('function')
    expect(typeof state.getIncompleteChoices).toBe('function')
  })
})
