import { beforeEach, describe, expect, it, vi } from 'vitest'

// The game store's slices touch `window.api` at import time in some paths;
// stub a minimal shape (same approach as the slice unit tests) so importing the
// store under the node test environment doesn't throw.
vi.stubGlobal('window', { api: { storage: {}, game: {} } })

import { useGameStore } from '../../../stores/use-game-store'
import type { EntityCondition } from '../../../types/game-state'
import { applyDelta } from '../diff'
import { findShard } from '../registry'
import { conditionsShard } from './conditions-shard'

function makeCondition(id: string, condition: string, entityId = 'e1'): EntityCondition {
  return {
    id,
    entityId,
    entityName: 'Goblin',
    condition,
    duration: 'permanent',
    source: 'test',
    appliedRound: 1
  }
}

describe('conditions-shard (Phase 31e)', () => {
  beforeEach(() => {
    useGameStore.setState({ conditions: [] })
  })

  it('registers itself under the name "conditions"', () => {
    expect(conditionsShard.name).toBe('conditions')
    expect(findShard('conditions')).toBe(conditionsShard)
  })

  it('read() returns the live store conditions array', () => {
    const conds = [makeCondition('c1', 'Poisoned')]
    useGameStore.setState({ conditions: conds })
    expect(conditionsShard.read()).toBe(conds)
  })

  it('diff() returns null when the array is structurally unchanged', () => {
    const prev = [makeCondition('c1', 'Poisoned')]
    const next = [makeCondition('c1', 'Poisoned')]
    expect(conditionsShard.diff(prev, next)).toBeNull()
  })

  it('round-trips an add: applyDelta(read, diff(prev, next)) deep-equals next', () => {
    const prev: EntityCondition[] = []
    const next = [makeCondition('c1', 'Prone'), makeCondition('c2', 'Frightened')]
    const delta = conditionsShard.diff(prev, next)
    expect(delta).not.toBeNull()
    if (!delta) return
    expect(applyDelta(prev, delta)).toEqual(next)
  })

  it('round-trips an update + a removal against the real store via applyDelta', () => {
    const initial = [makeCondition('c1', 'Poisoned'), makeCondition('c2', 'Stunned')]
    useGameStore.setState({ conditions: initial })

    // c1 gains a duration value, c2 is removed.
    const next: EntityCondition[] = [{ ...makeCondition('c1', 'Poisoned'), value: 2 }]
    const delta = conditionsShard.diff(conditionsShard.read(), next)
    expect(delta).not.toBeNull()
    if (!delta) return

    conditionsShard.applyDelta(delta)
    expect(useGameStore.getState().conditions).toEqual(next)
  })

  it('onChange fires only when the conditions reference changes', () => {
    const cb = vi.fn()
    const off = conditionsShard.onChange(cb)

    // Mutating an unrelated slice must not fire the conditions callback.
    useGameStore.setState({ round: 5 })
    expect(cb).not.toHaveBeenCalled()

    const next = [makeCondition('c1', 'Charmed')]
    useGameStore.setState({ conditions: next })
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith(next)

    off()
    useGameStore.setState({ conditions: [makeCondition('c2', 'Blinded')] })
    expect(cb).toHaveBeenCalledTimes(1) // unsubscribed → no further calls
  })
})
