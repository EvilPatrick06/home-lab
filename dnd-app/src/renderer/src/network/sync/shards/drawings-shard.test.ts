import { beforeEach, describe, expect, it, vi } from 'vitest'

// The game store's slices touch `window.api` at import time in some paths;
// stub a minimal shape (same approach as the fog/tokens shard tests) so importing
// the store under the node test environment doesn't throw.
vi.stubGlobal('window', { api: { storage: {}, game: {} } })

import { useGameStore } from '../../../stores/use-game-store'
import type { DrawingData, GameMap } from '../../../types/map'
import { applyDelta } from '../diff'
import { findShard } from '../registry'
import { type DrawingsShardValue, drawingsShard } from './drawings-shard'

function makeDrawing(id: string, overrides: Partial<DrawingData> = {}): DrawingData {
  return {
    id,
    type: 'draw-free',
    points: [
      { x: 0, y: 0 },
      { x: 5, y: 5 }
    ],
    color: '#ff0000',
    strokeWidth: 2,
    visibleToPlayers: true,
    ...overrides
  }
}

function makeMap(id: string, drawings: DrawingData[] | undefined): GameMap {
  return {
    id,
    name: `Map ${id}`,
    campaignId: 'camp-1',
    tokens: [],
    wallSegments: [],
    terrain: [],
    drawings,
    createdAt: new Date().toISOString()
  } as unknown as GameMap
}

describe('drawings-shard (Phase 31i)', () => {
  beforeEach(() => {
    useGameStore.setState({ maps: [] })
  })

  it('registers itself under the name "drawings"', () => {
    expect(drawingsShard.name).toBe('drawings')
    expect(findShard('drawings')).toBe(drawingsShard)
  })

  it('declares NO permissionFilter (drawings are unfiltered on the wire today; visibility is render-surface only)', () => {
    expect(drawingsShard.permissionFilter).toBeUndefined()
  })

  it('read() projects every map drawings into a record keyed by map id (undefined → [])', () => {
    const drawingsA = [makeDrawing('d-a1'), makeDrawing('d-a2')]
    useGameStore.setState({ maps: [makeMap('m-a', drawingsA), makeMap('m-b', undefined)] })
    expect(drawingsShard.read()).toEqual({ 'm-a': drawingsA, 'm-b': [] })
  })

  it('read() carries a DM-only (visibleToPlayers:false) drawing unchanged (behavior-preserving)', () => {
    const hidden = makeDrawing('d-hidden', { visibleToPlayers: false })
    useGameStore.setState({ maps: [makeMap('m-a', [hidden])] })
    expect(drawingsShard.read()['m-a']).toEqual([hidden])
  })

  it('diff() returns null when drawings are structurally unchanged', () => {
    const prev: DrawingsShardValue = { 'm-a': [makeDrawing('d-1')] }
    const next: DrawingsShardValue = { 'm-a': [makeDrawing('d-1')] }
    expect(drawingsShard.diff(prev, next)).toBeNull()
  })

  describe('round-trip via the structural diff', () => {
    it('round-trips an added drawing', () => {
      const prev: DrawingsShardValue = { 'm-a': [makeDrawing('d-1')] }
      const next: DrawingsShardValue = {
        'm-a': [makeDrawing('d-1'), makeDrawing('d-2', { type: 'draw-text', text: 'note' })]
      }
      const delta = drawingsShard.diff(prev, next)
      expect(delta).not.toBeNull()
      if (!delta) return
      expect(applyDelta(prev, delta)).toEqual(next)
    })

    it('round-trips an updated drawing (color/stroke change)', () => {
      const prev: DrawingsShardValue = { 'm-a': [makeDrawing('d-1', { color: '#ff0000', strokeWidth: 2 })] }
      const next: DrawingsShardValue = { 'm-a': [makeDrawing('d-1', { color: '#00ff00', strokeWidth: 5 })] }
      const delta = drawingsShard.diff(prev, next)
      expect(delta).not.toBeNull()
      if (!delta) return
      expect(applyDelta(prev, delta)).toEqual(next)
    })

    it('round-trips a removed drawing', () => {
      const prev: DrawingsShardValue = { 'm-a': [makeDrawing('d-1'), makeDrawing('d-2')] }
      const next: DrawingsShardValue = { 'm-a': [makeDrawing('d-2')] }
      const delta = drawingsShard.diff(prev, next)
      expect(delta).not.toBeNull()
      if (!delta) return
      expect(applyDelta(prev, delta)).toEqual(next)
    })

    it('round-trips an add/update/remove against the real store via applyDelta', () => {
      useGameStore.setState({
        maps: [makeMap('m-a', [makeDrawing('d-1', { color: '#ff0000' }), makeDrawing('d-2')])]
      })

      const next: DrawingsShardValue = {
        'm-a': [makeDrawing('d-1', { color: '#0000ff' }), makeDrawing('d-3', { visibleToPlayers: false })]
      }
      const delta = drawingsShard.diff(drawingsShard.read(), next)
      expect(delta).not.toBeNull()
      if (!delta) return

      drawingsShard.applyDelta(delta)
      expect(drawingsShard.read()).toEqual(next)
      expect(useGameStore.getState().maps[0].drawings).toEqual(next['m-a'])
    })
  })

  it('onChange fires when any map drawings reference changes', () => {
    useGameStore.setState({ maps: [makeMap('m-a', [makeDrawing('d-1')])] })

    const cb = vi.fn()
    const off = drawingsShard.onChange(cb)

    // An unrelated slice mutation must not fire the drawings callback.
    useGameStore.setState({ round: 7 })
    expect(cb).not.toHaveBeenCalled()

    // Add a drawing on m-a → new drawings reference → fires.
    const nextDrawings = [makeDrawing('d-1'), makeDrawing('d-2')]
    useGameStore.setState({ maps: [makeMap('m-a', nextDrawings)] })
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenLastCalledWith({ 'm-a': nextDrawings })

    off()
    useGameStore.setState({ maps: [makeMap('m-a', [makeDrawing('d-9')])] })
    expect(cb).toHaveBeenCalledTimes(1) // unsubscribed → no further calls
  })
})
