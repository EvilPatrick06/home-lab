import { beforeEach, describe, expect, it, vi } from 'vitest'

// The game store's slices touch `window.api` at import time in some paths;
// stub a minimal shape (same approach as the fog/tokens shard tests) so importing
// the store under the node test environment doesn't throw.
vi.stubGlobal('window', { api: { storage: {}, game: {} } })

// The regions shard's permissionFilter resolves the recipient clientId against
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
import type { GameMap, SceneRegion } from '../../../types/map'
import type { PeerInfo } from '../../state-types'
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

/** A campaign whose built-in roles include the DM (has `use_dm_tools`) and the
 * player (does not). */
function makeCampaign(): Campaign {
  return {
    id: 'camp-1',
    permissions: { roles: structuredClone(BUILTIN_ROLES), playerOverrides: {} }
  } as unknown as Campaign
}

describe('regions-shard (Phase 31i)', () => {
  beforeEach(() => {
    useGameStore.setState({ maps: [] })
    connectedPeers.value = []
    useCampaignStore.setState({ campaigns: [makeCampaign()] })
    useNetworkStore.setState({ campaignId: 'camp-1' })
  })

  it('registers itself under the name "regions"', () => {
    expect(regionsShard.name).toBe('regions')
    expect(findShard('regions')).toBe(regionsShard)
  })

  it('declares a permissionFilter (it is now a FILTERED shard)', () => {
    expect(typeof regionsShard.permissionFilter).toBe('function')
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

  describe('permissionFilter (DM-only region visibility gate)', () => {
    const visible = makeRegion('r-visible', { visibleToPlayers: true })
    const hidden = makeRegion('r-hidden', { visibleToPlayers: false })
    const value: RegionsShardValue = { 'm-a': [visible, hidden] }

    it('returns the FULL region set for a DM-permissioned recipient', () => {
      connectedPeers.value = [peer({ clientId: 'cid-dm', peerId: 'p-dm', roleId: 'role-dm' })]
      expect(regionsShard.permissionFilter?.(value, 'cid-dm')).toEqual(value)
    })

    it('returns the FULL set for the literal host (fast path)', () => {
      connectedPeers.value = [peer({ clientId: 'cid-host', peerId: 'p-host', isHost: true })]
      const out = regionsShard.permissionFilter?.(value, 'cid-host') as RegionsShardValue
      expect(out['m-a'].map((r) => r.id)).toContain('r-hidden')
    })

    it('returns the FULL set for a co-DM (fast path)', () => {
      connectedPeers.value = [peer({ clientId: 'cid-codm', peerId: 'p-codm', isCoDM: true })]
      const out = regionsShard.permissionFilter?.(value, 'cid-codm') as RegionsShardValue
      expect(out['m-a'].map((r) => r.id)).toContain('r-hidden')
    })

    it('DROPS the visibleToPlayers:false region for a player recipient', () => {
      connectedPeers.value = [peer({ clientId: 'cid-player', peerId: 'p-player', roleId: 'role-player' })]
      const out = regionsShard.permissionFilter?.(value, 'cid-player') as RegionsShardValue
      expect(out['m-a'].map((r) => r.id)).toEqual(['r-visible'])
      expect(out['m-a'].some((r) => r.visibleToPlayers === false)).toBe(false)
    })

    it('denies-by-default (hidden dropped) for an unknown recipient', () => {
      connectedPeers.value = []
      const out = regionsShard.permissionFilter?.(value, 'cid-ghost') as RegionsShardValue
      expect(out['m-a'].map((r) => r.id)).toEqual(['r-visible'])
    })
  })
})
