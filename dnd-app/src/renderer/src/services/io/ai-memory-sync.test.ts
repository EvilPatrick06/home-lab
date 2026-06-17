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
import { buildWorldState, startAiMemorySync, stopAiMemorySync } from './ai-memory-sync'

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

  // PHASE-27 27C — the consolidated writer carries hp in token positions (formerly only the
  // deleted use-ai-memory-sync hook did).
  it('buildWorldState includes hp for tokens with currentHP', () => {
    // biome-ignore lint/suspicious/noExplicitAny: minimal token/map fixtures
    const map: any = { name: 'Tavern', tokens: [{ label: 'Goblin', gridX: 1, gridY: 2, currentHP: 5, maxHP: 7 }] }
    const ws = buildWorldState(map, 'map-1', null, null)
    const positions = ws.activeTokenPositions as Array<{ name: string; hp?: string }>
    expect(positions[0].name).toBe('Goblin')
    expect(positions[0].hp).toMatch(/^5\//)
  })

  it('buildWorldState omits hp for tokens without currentHP', () => {
    // biome-ignore lint/suspicious/noExplicitAny: minimal token/map fixtures
    const map: any = { name: 'Tavern', tokens: [{ label: 'Statue', gridX: 0, gridY: 0 }] }
    const positions = buildWorldState(map, 'map-1', null, null).activeTokenPositions as Array<{ hp?: string }>
    expect(positions[0].hp).toBeUndefined()
  })
})
