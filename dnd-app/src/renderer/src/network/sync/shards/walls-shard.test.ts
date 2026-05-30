import { beforeEach, describe, expect, it, vi } from 'vitest'

// The game store's slices touch `window.api` at import time in some paths;
// stub a minimal shape (same approach as the fog/tokens shard tests) so importing
// the store under the node test environment doesn't throw.
vi.stubGlobal('window', { api: { storage: {}, game: {} } })

import { useGameStore } from '../../../stores/use-game-store'
import type { GameMap, WallSegment } from '../../../types/map'
import { applyDelta } from '../diff'
import { findShard } from '../registry'
import { type WallsShardValue, wallsShard } from './walls-shard'

function makeWall(id: string, overrides: Partial<WallSegment> = {}): WallSegment {
  return {
    id,
    x1: 0,
    y1: 0,
    x2: 10,
    y2: 10,
    type: 'solid',
    ...overrides
  }
}

function makeMap(id: string, wallSegments: WallSegment[] | undefined): GameMap {
  return {
    id,
    name: `Map ${id}`,
    campaignId: 'camp-1',
    tokens: [],
    wallSegments,
    terrain: [],
    createdAt: new Date().toISOString()
  } as unknown as GameMap
}

describe('walls-shard (Phase 31i)', () => {
  beforeEach(() => {
    useGameStore.setState({ maps: [] })
  })

  it('registers itself under the name "walls"', () => {
    expect(wallsShard.name).toBe('walls')
    expect(findShard('walls')).toBe(wallsShard)
  })

  it('declares NO permissionFilter (walls are unfiltered structural geometry)', () => {
    expect(wallsShard.permissionFilter).toBeUndefined()
  })

  it('read() projects every map wallSegments into a record keyed by map id (undefined → [])', () => {
    const wallsA = [makeWall('w-a1'), makeWall('w-a2')]
    useGameStore.setState({ maps: [makeMap('m-a', wallsA), makeMap('m-b', undefined)] })
    expect(wallsShard.read()).toEqual({ 'm-a': wallsA, 'm-b': [] })
  })

  it('diff() returns null when walls are structurally unchanged', () => {
    const prev: WallsShardValue = { 'm-a': [makeWall('w-1')] }
    const next: WallsShardValue = { 'm-a': [makeWall('w-1')] }
    expect(wallsShard.diff(prev, next)).toBeNull()
  })

  describe('round-trip via the structural diff', () => {
    it('round-trips an added wall', () => {
      const prev: WallsShardValue = { 'm-a': [makeWall('w-1')] }
      const next: WallsShardValue = { 'm-a': [makeWall('w-1'), makeWall('w-2', { type: 'door' })] }
      const delta = wallsShard.diff(prev, next)
      expect(delta).not.toBeNull()
      if (!delta) return
      expect(applyDelta(prev, delta)).toEqual(next)
    })

    it('round-trips an updated wall (type/open change)', () => {
      const prev: WallsShardValue = { 'm-a': [makeWall('w-1', { type: 'door', isOpen: false })] }
      const next: WallsShardValue = { 'm-a': [makeWall('w-1', { type: 'door', isOpen: true })] }
      const delta = wallsShard.diff(prev, next)
      expect(delta).not.toBeNull()
      if (!delta) return
      expect(applyDelta(prev, delta)).toEqual(next)
    })

    it('round-trips a removed wall', () => {
      const prev: WallsShardValue = { 'm-a': [makeWall('w-1'), makeWall('w-2')] }
      const next: WallsShardValue = { 'm-a': [makeWall('w-2')] }
      const delta = wallsShard.diff(prev, next)
      expect(delta).not.toBeNull()
      if (!delta) return
      expect(applyDelta(prev, delta)).toEqual(next)
    })

    it('round-trips an add/update/remove against the real store via applyDelta', () => {
      useGameStore.setState({
        maps: [makeMap('m-a', [makeWall('w-1', { type: 'door', isOpen: false }), makeWall('w-2')])]
      })

      const next: WallsShardValue = {
        'm-a': [makeWall('w-1', { type: 'door', isOpen: true }), makeWall('w-3', { type: 'window' })]
      }
      const delta = wallsShard.diff(wallsShard.read(), next)
      expect(delta).not.toBeNull()
      if (!delta) return

      wallsShard.applyDelta(delta)
      expect(wallsShard.read()).toEqual(next)
      expect(useGameStore.getState().maps[0].wallSegments).toEqual(next['m-a'])
    })
  })

  it('onChange fires when any map wallSegments reference changes', () => {
    useGameStore.setState({ maps: [makeMap('m-a', [makeWall('w-1')])] })

    const cb = vi.fn()
    const off = wallsShard.onChange(cb)

    // An unrelated slice mutation must not fire the walls callback.
    useGameStore.setState({ round: 7 })
    expect(cb).not.toHaveBeenCalled()

    // Add a wall on m-a → new wallSegments reference → fires.
    const nextWalls = [makeWall('w-1'), makeWall('w-2')]
    useGameStore.setState({ maps: [makeMap('m-a', nextWalls)] })
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenLastCalledWith({ 'm-a': nextWalls })

    off()
    useGameStore.setState({ maps: [makeMap('m-a', [makeWall('w-9')])] })
    expect(cb).toHaveBeenCalledTimes(1) // unsubscribed → no further calls
  })
})
