import { beforeEach, describe, expect, it, vi } from 'vitest'

const { loadGameState } = vi.hoisted(() => ({ loadGameState: vi.fn() }))
vi.mock('../../use-game-store', () => ({
  useGameStore: { getState: () => ({ loadGameState }) }
}))

import { applyGameState } from './shared'

describe('applyGameState prototype-pollution guard (MP-8)', () => {
  beforeEach(() => loadGameState.mockClear())

  it('applies a normal state update', () => {
    // Regression: the old guard used `'constructor' in data`, which is ALWAYS true
    // (inherited), so it blocked EVERY update and broke all multiplayer sync.
    applyGameState({ round: 3, maps: [], turnMode: 'free' })
    expect(loadGameState).toHaveBeenCalledTimes(1)
    expect(loadGameState).toHaveBeenCalledWith({ round: 3, maps: [], turnMode: 'free' })
  })

  it('blocks a payload with an OWN __proto__ key (real pollution vector)', () => {
    applyGameState(JSON.parse('{"__proto__":{"polluted":true},"round":1}'))
    expect(loadGameState).not.toHaveBeenCalled()
  })

  it('blocks an own constructor / prototype key', () => {
    applyGameState({ constructor: 'x' } as Record<string, unknown>)
    applyGameState({ prototype: 'x' } as Record<string, unknown>)
    expect(loadGameState).not.toHaveBeenCalled()
  })

  it('ignores non-object payloads', () => {
    applyGameState(null as unknown as Record<string, unknown>)
    applyGameState([] as unknown as Record<string, unknown>)
    expect(loadGameState).not.toHaveBeenCalled()
  })
})
