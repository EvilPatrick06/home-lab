import { beforeEach, describe, expect, it, vi } from 'vitest'

// The game store's slices touch `window.api` at import time in some paths;
// stub a minimal shape (same approach as the slice unit tests) so importing the
// store under the node test environment doesn't throw.
vi.stubGlobal('window', { api: { storage: {}, game: {} } })

import { useGameStore } from '../../../stores/use-game-store'
import type { InitiativeEntry, InitiativeState } from '../../../types/game-state'
import { applyDelta } from '../diff'
import { findShard } from '../registry'
import { type InitiativeShardValue, initiativeShard } from './initiative-shard'

function makeEntry(id: string, total: number, isActive = false): InitiativeEntry {
  return {
    id,
    entityId: `ent-${id}`,
    entityName: `Creature ${id}`,
    entityType: 'enemy',
    roll: total,
    modifier: 0,
    total,
    isActive
  }
}

function makeInitiative(entries: InitiativeEntry[], currentIndex: number, round: number): InitiativeState {
  return { entries, currentIndex, round }
}

describe('initiative-shard (Phase 31f / 31k)', () => {
  beforeEach(() => {
    useGameStore.setState({ initiative: null, round: 0, turnMode: 'free', isPaused: false })
  })

  it('registers itself under the name "initiative"', () => {
    expect(initiativeShard.name).toBe('initiative')
    expect(findShard('initiative')).toBe(initiativeShard)
  })

  it('read() returns the live { initiative, round, turnMode, isPaused } bundle', () => {
    const initiative = makeInitiative([makeEntry('a', 18, true)], 0, 1)
    useGameStore.setState({ initiative, round: 1, turnMode: 'initiative', isPaused: true })
    expect(initiativeShard.read()).toEqual({ initiative, round: 1, turnMode: 'initiative', isPaused: true })
  })

  it('diff() returns null when the bundle is structurally unchanged', () => {
    const prev: InitiativeShardValue = {
      initiative: makeInitiative([makeEntry('a', 18, true)], 0, 1),
      round: 1,
      turnMode: 'initiative',
      isPaused: false
    }
    const next: InitiativeShardValue = {
      initiative: makeInitiative([makeEntry('a', 18, true)], 0, 1),
      round: 1,
      turnMode: 'initiative',
      isPaused: false
    }
    expect(initiativeShard.diff(prev, next)).toBeNull()
  })

  it('round-trips combat start (null → active initiative + mode flip)', () => {
    const prev: InitiativeShardValue = { initiative: null, round: 0, turnMode: 'free', isPaused: false }
    const next: InitiativeShardValue = {
      initiative: makeInitiative([makeEntry('a', 18, true), makeEntry('b', 12)], 0, 1),
      round: 1,
      turnMode: 'initiative',
      isPaused: false
    }
    const delta = initiativeShard.diff(prev, next)
    expect(delta).not.toBeNull()
    if (!delta) return
    expect(applyDelta(prev, delta)).toEqual(next)
  })

  it('round-trips a turn advance against the real store via applyDelta', () => {
    // Combat in progress: 'a' is active on round 1.
    const initial = makeInitiative([makeEntry('a', 18, true), makeEntry('b', 12)], 0, 1)
    useGameStore.setState({ initiative: initial, round: 1, turnMode: 'initiative', isPaused: false })

    // Advance: 'b' becomes active, currentIndex 0→1 (still round 1).
    const next: InitiativeShardValue = {
      initiative: makeInitiative([makeEntry('a', 18), makeEntry('b', 12, true)], 1, 1),
      round: 1,
      turnMode: 'initiative',
      isPaused: false
    }
    const delta = initiativeShard.diff(initiativeShard.read(), next)
    expect(delta).not.toBeNull()
    if (!delta) return

    initiativeShard.applyDelta(delta)
    expect(initiativeShard.read()).toEqual(next)
    expect(useGameStore.getState().initiative).toEqual(next.initiative)
    expect(useGameStore.getState().round).toBe(1)
    expect(useGameStore.getState().turnMode).toBe('initiative')
  })

  it('round-trips an entries change + round bump (add a combatant, new round)', () => {
    const initial = makeInitiative([makeEntry('a', 18, true)], 0, 1)
    useGameStore.setState({ initiative: initial, round: 1, turnMode: 'initiative', isPaused: false })

    // A new combatant 'c' joins, 'a' stays active, the round counter bumps to 2.
    const next: InitiativeShardValue = {
      initiative: makeInitiative([makeEntry('a', 18, true), makeEntry('c', 9)], 0, 2),
      round: 2,
      turnMode: 'initiative',
      isPaused: false
    }
    const delta = initiativeShard.diff(initiativeShard.read(), next)
    expect(delta).not.toBeNull()
    if (!delta) return

    initiativeShard.applyDelta(delta)
    expect(initiativeShard.read()).toEqual(next)
  })

  it('round-trips ending combat (active initiative → null, round reset)', () => {
    useGameStore.setState({
      initiative: makeInitiative([makeEntry('a', 18, true)], 0, 3),
      round: 3,
      turnMode: 'initiative',
      isPaused: false
    })
    const next: InitiativeShardValue = { initiative: null, round: 0, turnMode: 'initiative', isPaused: false }
    const delta = initiativeShard.diff(initiativeShard.read(), next)
    expect(delta).not.toBeNull()
    if (!delta) return

    initiativeShard.applyDelta(delta)
    expect(initiativeShard.read()).toEqual(next)
    expect(useGameStore.getState().initiative).toBeNull()
  })

  it('round-trips an isPaused flip against the real store via applyDelta (Phase 31k)', () => {
    useGameStore.setState({ initiative: null, round: 0, turnMode: 'free', isPaused: false })
    const next: InitiativeShardValue = { initiative: null, round: 0, turnMode: 'free', isPaused: true }
    const delta = initiativeShard.diff(initiativeShard.read(), next)
    expect(delta).not.toBeNull()
    if (!delta) return

    initiativeShard.applyDelta(delta)
    expect(initiativeShard.read()).toEqual(next)
    expect(useGameStore.getState().isPaused).toBe(true)
  })

  it('onChange fires when initiative changes and reports the full bundle', () => {
    const cb = vi.fn()
    const off = initiativeShard.onChange(cb)

    // Mutating an unrelated slice must not fire the initiative callback.
    useGameStore.setState({ conditions: [] })
    expect(cb).not.toHaveBeenCalled()

    const initiative = makeInitiative([makeEntry('a', 18, true)], 0, 1)
    useGameStore.setState({ initiative, round: 1, turnMode: 'initiative' })
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenLastCalledWith({ initiative, round: 1, turnMode: 'initiative', isPaused: false })

    off()
    useGameStore.setState({ round: 2 })
    expect(cb).toHaveBeenCalledTimes(1) // unsubscribed → no further calls
  })

  it('onChange fires when only turnMode, round, or isPaused changes (Phase 31k)', () => {
    const cb = vi.fn()
    const off = initiativeShard.onChange(cb)

    useGameStore.setState({ turnMode: 'initiative' })
    expect(cb).toHaveBeenCalledTimes(1)

    useGameStore.setState({ round: 1 })
    expect(cb).toHaveBeenCalledTimes(2)

    // isPaused is now part of the bundle (folded in 31k) → flipping it fires.
    useGameStore.setState({ isPaused: true })
    expect(cb).toHaveBeenCalledTimes(3)
    expect(cb).toHaveBeenLastCalledWith({ initiative: null, round: 1, turnMode: 'initiative', isPaused: true })

    off()
  })
})
