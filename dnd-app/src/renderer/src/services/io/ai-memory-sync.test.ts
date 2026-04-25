import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../stores/use-game-store', () => ({
  useGameStore: {
    getState: () => ({
      activeMapId: null,
      maps: {},
      initiative: null,
      conditions: {},
      inGameTime: null,
      weatherOverride: null
    }),
    subscribe: vi.fn(() => () => {})
  }
}))

import { useGameStore } from '../../stores/use-game-store'
import { startAiMemorySync, stopAiMemorySync } from './ai-memory-sync'

describe('ai-memory-sync', () => {
  beforeEach(() => {
    stopAiMemorySync()
    vi.mocked(useGameStore.subscribe).mockClear()
  })

  it('stop is safe when nothing is running', () => {
    expect(() => stopAiMemorySync()).not.toThrow()
  })

  it('start subscribes to the game store', () => {
    startAiMemorySync('camp-1')
    expect(useGameStore.subscribe).toHaveBeenCalled()
    stopAiMemorySync()
  })
})
