import { beforeEach, describe, expect, it, vi } from 'vitest'

// The game store's slices touch `window.api` at import time in some paths;
// stub a minimal shape (same approach as the slice unit tests) so importing the
// store under the node test environment doesn't throw.
vi.stubGlobal('window', { api: { storage: {}, game: {} } })

import { useGameStore } from '../../../stores/use-game-store'
import { applyDelta } from '../diff'
import { findShard } from '../registry'
import { partyVisionShard } from './party-vision-shard'

type Cell = { x: number; y: number }

describe('party-vision-shard (Phase 31k)', () => {
  beforeEach(() => {
    useGameStore.setState({ partyVisionCells: [] })
  })

  it('registers itself under the name "partyVisionCells"', () => {
    expect(partyVisionShard.name).toBe('partyVisionCells')
    expect(findShard('partyVisionCells')).toBe(partyVisionShard)
  })

  it('is UNFILTERED (declares no permissionFilter)', () => {
    expect(partyVisionShard.permissionFilter).toBeUndefined()
  })

  it('read() returns the live store partyVisionCells array', () => {
    const cells: Cell[] = [{ x: 1, y: 1 }]
    useGameStore.setState({ partyVisionCells: cells })
    expect(partyVisionShard.read()).toBe(cells)
  })

  it('diff() returns null when the array is structurally unchanged', () => {
    const prev: Cell[] = [{ x: 1, y: 1 }]
    const next: Cell[] = [{ x: 1, y: 1 }]
    expect(partyVisionShard.diff(prev, next)).toBeNull()
  })

  it('diffs a non-record coordinate array as a whole-value replace', () => {
    const prev: Cell[] = [{ x: 1, y: 1 }]
    const next: Cell[] = [
      { x: 1, y: 1 },
      { x: 2, y: 2 }
    ]
    const delta = partyVisionShard.diff(prev, next)
    expect(delta).not.toBeNull()
    if (!delta) return
    // Coordinate objects carry no `id`, so structuralDiff replaces wholesale.
    expect(delta.kind).toBe('replace')
    expect(applyDelta(prev, delta)).toEqual(next)
  })

  it('round-trips a reveal against the real store via applyDelta (setPartyVisionCells)', () => {
    useGameStore.setState({ partyVisionCells: [{ x: 0, y: 0 }] })

    const next: Cell[] = [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 6, y: 6 }
    ]
    const delta = partyVisionShard.diff(partyVisionShard.read(), next)
    expect(delta).not.toBeNull()
    if (!delta) return

    partyVisionShard.applyDelta(delta)
    expect(partyVisionShard.read()).toEqual(next)
    expect(useGameStore.getState().partyVisionCells).toEqual(next)
  })

  it('onChange fires only when the partyVisionCells reference changes', () => {
    const cb = vi.fn()
    const off = partyVisionShard.onChange(cb)

    // Mutating an unrelated slice must not fire the vision callback.
    useGameStore.setState({ round: 3 })
    expect(cb).not.toHaveBeenCalled()

    const next: Cell[] = [{ x: 4, y: 4 }]
    useGameStore.setState({ partyVisionCells: next })
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith(next)

    off()
    useGameStore.setState({ partyVisionCells: [{ x: 9, y: 9 }] })
    expect(cb).toHaveBeenCalledTimes(1) // unsubscribed → no further calls
  })
})
