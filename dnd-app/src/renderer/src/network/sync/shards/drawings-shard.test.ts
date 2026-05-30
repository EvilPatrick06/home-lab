import { beforeEach, describe, expect, it, vi } from 'vitest'

// The game store's slices touch `window.api` at import time in some paths;
// stub a minimal shape (same approach as the fog/tokens shard tests) so importing
// the store under the node test environment doesn't throw.
vi.stubGlobal('window', { api: { storage: {}, game: {} } })

// The drawings shard's permissionFilter resolves the recipient clientId against
// the live connected-peer list (host-manager). Mock it so the test drives the
// DM-vs-player split without standing up a real PeerJS mesh.
const connectedPeers = vi.hoisted(() => ({ value: [] as import('../../state-types').PeerInfo[] }))
vi.mock('../../host-manager', () => ({
  getConnectedPeers: () => connectedPeers.value
}))

import { BUILTIN_ROLES } from '../../../data/builtin-roles'
import { useNetworkStore } from '../../../stores/network-store'
import { useCampaignStore } from '../../../stores/use-campaign-store'
import { useGameStore } from '../../../stores/use-game-store'
import type { Campaign } from '../../../types/campaign'
import type { DrawingData, GameMap } from '../../../types/map'
import type { PeerInfo } from '../../state-types'
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

function peer(overrides: Partial<PeerInfo>): PeerInfo {
  return {
    peerId: 'p',
    clientId: 'cid',
    role: 'player',
    displayName: 'Someone',
    characterId: null,
    characterName: null,
    isReady: true,
    isHost: false,
    ...overrides
  }
}

/** A campaign whose built-in roles include the DM (has `draw_dm_only`) and the
 * player (does not). */
function makeCampaign(): Campaign {
  return {
    id: 'camp-1',
    permissions: { roles: structuredClone(BUILTIN_ROLES), playerOverrides: {} }
  } as unknown as Campaign
}

describe('drawings-shard (Phase 31i)', () => {
  beforeEach(() => {
    useGameStore.setState({ maps: [] })
    connectedPeers.value = []
    useCampaignStore.setState({ campaigns: [makeCampaign()] })
    useNetworkStore.setState({ campaignId: 'camp-1' })
  })

  it('registers itself under the name "drawings"', () => {
    expect(drawingsShard.name).toBe('drawings')
    expect(findShard('drawings')).toBe(drawingsShard)
  })

  it('declares a permissionFilter (it is now a FILTERED shard)', () => {
    expect(typeof drawingsShard.permissionFilter).toBe('function')
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

  describe('permissionFilter (DM-only drawing visibility gate)', () => {
    const visible = makeDrawing('d-visible', { visibleToPlayers: true })
    const hidden = makeDrawing('d-hidden', { visibleToPlayers: false })
    // visibleToPlayers omitted → undefined → must STAY visible to players.
    const undef = makeDrawing('d-undef', { visibleToPlayers: undefined })
    const value: DrawingsShardValue = { 'm-a': [visible, hidden, undef] }

    it('returns the FULL drawing set for a DM-permissioned recipient', () => {
      connectedPeers.value = [peer({ clientId: 'cid-dm', peerId: 'p-dm', roleId: 'role-dm' })]
      expect(drawingsShard.permissionFilter?.(value, 'cid-dm')).toEqual(value)
    })

    it('returns the FULL set (incl. hidden) for the literal host (fast path)', () => {
      connectedPeers.value = [peer({ clientId: 'cid-host', peerId: 'p-host', isHost: true })]
      const out = drawingsShard.permissionFilter?.(value, 'cid-host') as DrawingsShardValue
      expect(out['m-a'].map((d) => d.id)).toContain('d-hidden')
    })

    it('returns the FULL set for a co-DM (fast path)', () => {
      connectedPeers.value = [peer({ clientId: 'cid-codm', peerId: 'p-codm', isCoDM: true })]
      const out = drawingsShard.permissionFilter?.(value, 'cid-codm') as DrawingsShardValue
      expect(out['m-a'].map((d) => d.id)).toContain('d-hidden')
    })

    it('DROPS only visibleToPlayers:false for a player (undefined stays visible)', () => {
      connectedPeers.value = [peer({ clientId: 'cid-player', peerId: 'p-player', roleId: 'role-player' })]
      const out = drawingsShard.permissionFilter?.(value, 'cid-player') as DrawingsShardValue
      // d-hidden dropped; d-undef kept — proves `=== false`, not `!d.visibleToPlayers`.
      expect(out['m-a'].map((d) => d.id)).toEqual(['d-visible', 'd-undef'])
    })

    it('denies-by-default (hidden dropped, undefined kept) for an unknown recipient', () => {
      connectedPeers.value = []
      const out = drawingsShard.permissionFilter?.(value, 'cid-ghost') as DrawingsShardValue
      expect(out['m-a'].map((d) => d.id)).toEqual(['d-visible', 'd-undef'])
    })
  })
})
