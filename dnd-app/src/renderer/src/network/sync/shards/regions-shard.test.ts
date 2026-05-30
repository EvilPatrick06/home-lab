import { beforeEach, describe, expect, it, vi } from 'vitest'

// The game store's slices touch `window.api` at import time in some paths;
// stub a minimal shape (same approach as the fog/tokens shard tests) so importing
// the store under the node test environment doesn't throw.
vi.stubGlobal('window', { api: { storage: {}, game: {} } })

import { useGameStore } from '../../../stores/use-game-store'
import type { GameMap, SceneRegion } from '../../../types/map'
import { applyDelta } from '../diff'
import { findShard } from '../registry'
import { type RegionsShardValue, regionsShard } from './regions-shard'

function makeRegion(id: string, overrides: Partial<SceneRegion> = {}): SceneRegion {
  return {
    id,
    name: id,
    shape: { type: 'rectangle', x: 0, y: 0, width: 2, height: 2 },
    trigger: 'enter',
    action: { type: 'alert-dm', message: 'tripped' },
    enabled: true,
    visibleToPlayers: true,
    oneShot: false,
    ...overrides
  }
}

function makeMap(id: string, regions: SceneRegion[] | undefined): GameMap {
  return {
    id,
    name: `Map ${id}`,
    campaignId: 'camp-1',
    tokens: [],
    wallSegments: [],
    terrain: [],
    regions,
    createdAt: new Date().toISOString()
  } as unknown as GameMap
}

describe('regions-shard (Phase 31i)', () => {
  beforeEach(() => {
    useGameStore.setState({ maps: [] })
  })

  it('registers itself under the name "regions"', () => {
    expect(regionsShard.name).toBe('regions')
    expect(findShard('regions')).toBe(regionsShard)
  })

  it('declares NO permissionFilter (regions are unfiltered on the wire today; visibility is render-surface only)', () => {
    expect(regionsShard.permissionFilter).toBeUndefined()
  })

  it('read() projects every map regions into a record keyed by map id (undefined → [])', () => {
    const regionsA = [makeRegion('r-a1'), makeRegion('r-a2')]
    useGameStore.setState({ maps: [makeMap('m-a', regionsA), makeMap('m-b', undefined)] })
    expect(regionsShard.read()).toEqual({ 'm-a': regionsA, 'm-b': [] })
  })

  it('read() carries a DM-only (visibleToPlayers:false) region unchanged (behavior-preserving)', () => {
    const hidden = makeRegion('r-hidden', { visibleToPlayers: false })
    useGameStore.setState({ maps: [makeMap('m-a', [hidden])] })
    expect(regionsShard.read()['m-a']).toEqual([hidden])
  })

  it('diff() returns null when regions are structurally unchanged', () => {
    const prev: RegionsShardValue = { 'm-a': [makeRegion('r-1')] }
    const next: RegionsShardValue = { 'm-a': [makeRegion('r-1')] }
    expect(regionsShard.diff(prev, next)).toBeNull()
  })

  describe('round-trip via the structural diff', () => {
    it('round-trips an added region', () => {
      const prev: RegionsShardValue = { 'm-a': [makeRegion('r-1')] }
      const next: RegionsShardValue = { 'm-a': [makeRegion('r-1'), makeRegion('r-2')] }
      const delta = regionsShard.diff(prev, next)
      expect(delta).not.toBeNull()
      if (!delta) return
      expect(applyDelta(prev, delta)).toEqual(next)
    })

    it('round-trips an updated region (enabled/visibility toggle)', () => {
      const prev: RegionsShardValue = { 'm-a': [makeRegion('r-1', { enabled: true, visibleToPlayers: true })] }
      const next: RegionsShardValue = { 'm-a': [makeRegion('r-1', { enabled: false, visibleToPlayers: false })] }
      const delta = regionsShard.diff(prev, next)
      expect(delta).not.toBeNull()
      if (!delta) return
      expect(applyDelta(prev, delta)).toEqual(next)
    })

    it('round-trips a removed region', () => {
      const prev: RegionsShardValue = { 'm-a': [makeRegion('r-1'), makeRegion('r-2')] }
      const next: RegionsShardValue = { 'm-a': [makeRegion('r-2')] }
      const delta = regionsShard.diff(prev, next)
      expect(delta).not.toBeNull()
      if (!delta) return
      expect(applyDelta(prev, delta)).toEqual(next)
    })

    it('round-trips an add/update/remove against the real store via applyDelta', () => {
      useGameStore.setState({
        maps: [makeMap('m-a', [makeRegion('r-1', { enabled: true }), makeRegion('r-2')])]
      })

      const next: RegionsShardValue = {
        'm-a': [makeRegion('r-1', { enabled: false }), makeRegion('r-3', { visibleToPlayers: false })]
      }
      const delta = regionsShard.diff(regionsShard.read(), next)
      expect(delta).not.toBeNull()
      if (!delta) return

      regionsShard.applyDelta(delta)
      expect(regionsShard.read()).toEqual(next)
      expect(useGameStore.getState().maps[0].regions).toEqual(next['m-a'])
    })
  })

  it('onChange fires when any map regions reference changes', () => {
    useGameStore.setState({ maps: [makeMap('m-a', [makeRegion('r-1')])] })

    const cb = vi.fn()
    const off = regionsShard.onChange(cb)

    // An unrelated slice mutation must not fire the regions callback.
    useGameStore.setState({ round: 7 })
    expect(cb).not.toHaveBeenCalled()

    // Add a region on m-a → new regions reference → fires.
    const nextRegions = [makeRegion('r-1'), makeRegion('r-2')]
    useGameStore.setState({ maps: [makeMap('m-a', nextRegions)] })
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenLastCalledWith({ 'm-a': nextRegions })

    off()
    useGameStore.setState({ maps: [makeMap('m-a', [makeRegion('r-9')])] })
    expect(cb).toHaveBeenCalledTimes(1) // unsubscribed → no further calls
  })
})
