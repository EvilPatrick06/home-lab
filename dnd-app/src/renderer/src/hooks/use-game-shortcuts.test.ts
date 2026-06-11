// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// PHASE-09 09H — Ctrl+Z / Ctrl+Y operate the undo-manager, DM-gated.
const mocks = vi.hoisted(() => ({
  undo: vi.fn(),
  redo: vi.fn(),
  // captures the action handler registered by the hook
  handler: null as null | ((action: string) => void)
}))

vi.mock('../services/keyboard-shortcuts', () => ({
  init: vi.fn(),
  destroy: vi.fn(),
  registerHandler: vi.fn((h: (action: string) => void) => {
    mocks.handler = h
    return () => {
      mocks.handler = null
    }
  })
}))
vi.mock('../services/undo-manager', () => ({ undo: mocks.undo, redo: mocks.redo }))
vi.mock('../stores/use-game-store', () => ({
  useGameStore: { getState: vi.fn(() => ({})) }
}))

import { useGameShortcuts } from './use-game-shortcuts'

describe('useGameShortcuts undo/redo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.handler = null
  })

  it('routes undo/redo to the undo-manager for a DM', () => {
    renderHook(() => useGameShortcuts(true))
    expect(mocks.handler).toBeTypeOf('function')
    mocks.handler?.('undo')
    mocks.handler?.('redo')
    expect(mocks.undo).toHaveBeenCalledTimes(1)
    expect(mocks.redo).toHaveBeenCalledTimes(1)
  })

  it('is a no-op for a non-DM', () => {
    renderHook(() => useGameShortcuts(false))
    mocks.handler?.('undo')
    mocks.handler?.('redo')
    expect(mocks.undo).not.toHaveBeenCalled()
    expect(mocks.redo).not.toHaveBeenCalled()
  })
})
