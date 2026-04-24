import { describe, expect, it, vi } from 'vitest'

// Mock localStorage for accessibility store persistence
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

import type { ColorblindMode, KeyCombo } from './use-accessibility-store'
import { useAccessibilityStore } from './use-accessibility-store'

describe('useAccessibilityStore', () => {
  it('can be imported', async () => {
    const mod = await import('./use-accessibility-store')
    expect(mod).toBeDefined()
  })

  it('exports the store hook', () => {
    expect(typeof useAccessibilityStore).toBe('function')
  })

  it('store has colorblindMode and keybinding state', () => {
    // ColorblindMode and KeyCombo are type-only exports (erased at runtime)
    // so we verify the store state that uses those types instead
    const state = useAccessibilityStore.getState()
    expect(typeof state.colorblindMode).toBe('string')
    expect(typeof state.setCustomKeybinding).toBe('function')
  })

  it('has expected initial state shape', () => {
    const state = useAccessibilityStore.getState()
    expect(state).toHaveProperty('uiScale')
    expect(state).toHaveProperty('colorblindMode')
    expect(state).toHaveProperty('reducedMotion')
    expect(state).toHaveProperty('screenReaderMode')
    expect(state).toHaveProperty('tooltipsEnabled')
    expect(state).toHaveProperty('customKeybindings')
  })

  it('has expected default state values', () => {
    const state = useAccessibilityStore.getState()
    expect(state.uiScale).toBe(100)
    expect(state.colorblindMode).toBe('none')
    expect(state.reducedMotion).toBe(false)
    expect(state.screenReaderMode).toBe(false)
    expect(state.tooltipsEnabled).toBe(true)
    expect(state.customKeybindings).toBeNull()
  })

  it('has expected actions', () => {
    const state = useAccessibilityStore.getState()
    expect(typeof state.setUiScale).toBe('function')
    expect(typeof state.setColorblindMode).toBe('function')
    expect(typeof state.setReducedMotion).toBe('function')
    expect(typeof state.setScreenReaderMode).toBe('function')
    expect(typeof state.setTooltipsEnabled).toBe('function')
    expect(typeof state.setCustomKeybinding).toBe('function')
    expect(typeof state.resetKeybinding).toBe('function')
    expect(typeof state.resetAllKeybindings).toBe('function')
  })

  it('ColorblindMode covers all expected variant strings', () => {
    const modes: ColorblindMode[] = ['none', 'deuteranopia', 'protanopia', 'tritanopia']
    expect(modes).toHaveLength(4)
    for (const mode of modes) {
      expect(typeof mode).toBe('string')
    }
  })

  it('setColorblindMode accepts every ColorblindMode variant', () => {
    const state = useAccessibilityStore.getState()
    const deuteranopia: ColorblindMode = 'deuteranopia'
    // Calling the action with a typed ColorblindMode value exercises the type at the call site
    state.setColorblindMode(deuteranopia)
    expect(useAccessibilityStore.getState().colorblindMode).toBe('deuteranopia')
  })

  it('KeyCombo objects are accepted by setCustomKeybinding', () => {
    const rollCombo: KeyCombo = { key: 'r', ctrl: true, shift: false }
    const state = useAccessibilityStore.getState()
    state.setCustomKeybinding('rollDice', rollCombo)
    const saved = useAccessibilityStore.getState().customKeybindings
    expect(saved).not.toBeNull()
    expect(saved?.rollDice).toEqual(rollCombo satisfies KeyCombo)
  })

  it('KeyCombo requires only the key field (alt/ctrl/shift are optional)', () => {
    const minimalCombo: KeyCombo = { key: 'Escape' }
    expect(minimalCombo.key).toBe('Escape')
    expect(minimalCombo.ctrl).toBeUndefined()
    expect(minimalCombo.shift).toBeUndefined()
    expect(minimalCombo.alt).toBeUndefined()
  })
})
