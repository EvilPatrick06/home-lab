import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', {
  api: {
    storage: {},
    game: {},
    loadCharacters: vi.fn().mockResolvedValue([]),
    saveCharacter: vi.fn().mockResolvedValue({ success: true }),
    deleteCharacter: vi.fn().mockResolvedValue({ success: true })
  }
})

import { useCharacterStore } from './use-character-store'

describe('useCharacterStore', () => {
  it('can be imported', async () => {
    const mod = await import('./use-character-store')
    expect(mod).toBeDefined()
  })

  it('exports the store hook', () => {
    expect(typeof useCharacterStore).toBe('function')
  })

  it('has expected initial state shape', () => {
    const state = useCharacterStore.getState()
    expect(state).toHaveProperty('characters')
    expect(state).toHaveProperty('selectedCharacterId')
    expect(state).toHaveProperty('loading')
  })

  it('has expected initial state values', () => {
    const state = useCharacterStore.getState()
    expect(state.characters).toEqual([])
    expect(state.selectedCharacterId).toBeNull()
    expect(state.loading).toBe(false)
  })

  it('has expected actions', () => {
    const state = useCharacterStore.getState()
    expect(typeof state.setSelectedCharacter).toBe('function')
    expect(typeof state.loadCharacters).toBe('function')
    expect(typeof state.saveCharacter).toBe('function')
    expect(typeof state.deleteCharacter).toBe('function')
    expect(typeof state.deleteAllCharacters).toBe('function')
    expect(typeof state.toggleArmorEquipped).toBe('function')
    expect(typeof state.addCondition).toBe('function')
    expect(typeof state.removeCondition).toBe('function')
    expect(typeof state.updateConditionValue).toBe('function')
  })
})
