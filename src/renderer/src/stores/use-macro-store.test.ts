import { describe, expect, it, vi } from 'vitest'

// Mock localStorage for macro store persistence
const localStorageMock = {
  getItem: vi.fn().mockReturnValue(null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn()
}
vi.stubGlobal('localStorage', localStorageMock)
vi.stubGlobal('window', { api: { storage: {}, game: {} } })

import type { Macro } from './use-macro-store'
import { useMacroStore } from './use-macro-store'

describe('useMacroStore', () => {
  it('can be imported', async () => {
    const mod = await import('./use-macro-store')
    expect(mod).toBeDefined()
  })

  it('exports the store hook', () => {
    expect(typeof useMacroStore).toBe('function')
  })

  it('store has macro state properties', () => {
    // Macro is a type-only export (erased at runtime)
    // so we verify the store state that uses that type instead
    const state = useMacroStore.getState()
    expect(Array.isArray(state.macros)).toBe(true)
    expect(typeof state.addMacro).toBe('function')
  })

  it('has expected initial state shape', () => {
    const state = useMacroStore.getState()
    expect(state).toHaveProperty('hotbar')
    expect(state).toHaveProperty('macros')
    expect(state).toHaveProperty('_characterId')
  })

  it('has expected initial state values', () => {
    const state = useMacroStore.getState()
    expect(Array.isArray(state.hotbar)).toBe(true)
    expect(state.hotbar.length).toBe(10)
    expect(state.hotbar.every((slot) => slot === null)).toBe(true)
    expect(state.macros).toEqual([])
    expect(state._characterId).toBeNull()
  })

  it('has expected actions', () => {
    const state = useMacroStore.getState()
    expect(typeof state.setHotbarSlot).toBe('function')
    expect(typeof state.clearHotbarSlot).toBe('function')
    expect(typeof state.swapHotbarSlots).toBe('function')
    expect(typeof state.addMacro).toBe('function')
    expect(typeof state.updateMacro).toBe('function')
    expect(typeof state.removeMacro).toBe('function')
    expect(typeof state.importMacros).toBe('function')
    expect(typeof state.loadForCharacter).toBe('function')
    expect(typeof state.saveForCharacter).toBe('function')
  })

  it('Macro objects with required fields can be added to the store', () => {
    const macro: Macro = {
      id: 'test-macro-1',
      name: 'Attack Longsword',
      command: '/attack longsword'
    }
    const state = useMacroStore.getState()
    state.addMacro(macro)
    const updated = useMacroStore.getState().macros
    const found = updated.find((m) => m.id === macro.id)
    expect(found).toBeDefined()
    expect(found?.name).toBe('Attack Longsword')
    expect(found?.command).toBe('/attack longsword')
  })

  it('Macro optional fields (icon, color) are truly optional', () => {
    const minimal: Macro = { id: 'min-macro', name: 'Roll', command: '/roll 1d20' }
    expect(minimal.icon).toBeUndefined()
    expect(minimal.color).toBeUndefined()

    const full: Macro = {
      id: 'full-macro',
      name: 'Fireball',
      command: '/cast fireball',
      icon: '🔥',
      color: 'bg-red-900/40'
    }
    expect(full.icon).toBe('🔥')
    expect(full.color).toBe('bg-red-900/40')
  })

  it('Macro type is accepted by setHotbarSlot', () => {
    const macro: Macro = { id: 'hotbar-macro', name: 'Shield Bash', command: '/attack shield' }
    const state = useMacroStore.getState()
    state.setHotbarSlot(0, macro)
    const slot = useMacroStore.getState().hotbar[0]
    expect(slot).not.toBeNull()
    expect(slot?.id).toBe('hotbar-macro')
  })
})
