import { beforeEach, describe, expect, it, vi } from 'vitest'

// The game store's slices touch `window.api` at import time in some paths;
// stub a minimal shape (same approach as the slice unit tests) so importing the
// store under the node test environment doesn't throw.
vi.stubGlobal('window', { api: { storage: {}, game: {} } })

// The fog shard's permissionFilter resolves the recipient clientId against the
// live connected-peer list (host-manager). Mock it so the test drives the
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
import type { FogOfWarData, GameMap } from '../../../types/map'
import type { PeerInfo } from '../../state-types'
import { applyDelta } from '../diff'
import { findShard } from '../registry'
import { type FogShardValue, fogShard } from './fog-shard'

function makeMap(id: string, fogOfWar: FogOfWarData): GameMap {
  return {
    id,
    name: `Map ${id}`,
    campaignId: 'camp-1',
    tokens: [],
    wallSegments: [],
    terrain: [],
    createdAt: new Date().toISOString(),
    fogOfWar
  } as unknown as GameMap
}

function fullFog(revealed: Array<{ x: number; y: number }>): FogOfWarData {
  return {
    enabled: true,
    revealedCells: revealed,
    // DM-only fields a player must NOT receive:
    exploredCells: [
      { x: 9, y: 9 },
      { x: 8, y: 8 }
    ],
    dynamicFogEnabled: true
  }
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

/** A campaign whose built-in roles include the DM (has `view_full_fog`) and the
 * player (does not). */
function makeCampaign(): Campaign {
  return {
    id: 'camp-1',
    permissions: { roles: structuredClone(BUILTIN_ROLES), playerOverrides: {} }
  } as unknown as Campaign
}

describe('fog-shard (Phase 31g)', () => {
  beforeEach(() => {
    useGameStore.setState({ maps: [] })
    connectedPeers.value = []
    useCampaignStore.setState({ campaigns: [makeCampaign()] })
    useNetworkStore.setState({ campaignId: 'camp-1' })
  })

  it('registers itself under the name "fog"', () => {
    expect(fogShard.name).toBe('fog')
    expect(findShard('fog')).toBe(fogShard)
  })

  it('declares a permissionFilter (it is the first FILTERED shard)', () => {
    expect(typeof fogShard.permissionFilter).toBe('function')
  })

  it('read() projects every map fogOfWar into a record keyed by map id', () => {
    const fogA = fullFog([{ x: 1, y: 1 }])
    const fogB = fullFog([{ x: 2, y: 2 }])
    useGameStore.setState({ maps: [makeMap('m-a', fogA), makeMap('m-b', fogB)] })
    expect(fogShard.read()).toEqual({ 'm-a': fogA, 'm-b': fogB })
  })

  it('diff() returns null when fog is structurally unchanged', () => {
    const prev: FogShardValue = { 'm-a': fullFog([{ x: 1, y: 1 }]) }
    const next: FogShardValue = { 'm-a': fullFog([{ x: 1, y: 1 }]) }
    expect(fogShard.diff(prev, next)).toBeNull()
  })

  it('round-trips a reveal change: applyDelta(read, diff(prev, next)) deep-equals next', () => {
    const prev: FogShardValue = { 'm-a': fullFog([{ x: 1, y: 1 }]) }
    const next: FogShardValue = {
      'm-a': fullFog([
        { x: 1, y: 1 },
        { x: 2, y: 2 },
        { x: 3, y: 3 }
      ])
    }
    const delta = fogShard.diff(prev, next)
    expect(delta).not.toBeNull()
    if (!delta) return
    expect(applyDelta(prev, delta)).toEqual(next)
  })

  it('round-trips a reveal against the real store via applyDelta', () => {
    const initial = fullFog([{ x: 1, y: 1 }])
    useGameStore.setState({ maps: [makeMap('m-a', initial)] })

    const next: FogShardValue = {
      'm-a': fullFog([
        { x: 1, y: 1 },
        { x: 5, y: 5 }
      ])
    }
    const delta = fogShard.diff(fogShard.read(), next)
    expect(delta).not.toBeNull()
    if (!delta) return

    fogShard.applyDelta(delta)
    expect(fogShard.read()).toEqual(next)
    expect(useGameStore.getState().maps[0].fogOfWar).toEqual(next['m-a'])
  })

  it('onChange fires when any map fogOfWar reference changes', () => {
    const fogA = fullFog([{ x: 1, y: 1 }])
    useGameStore.setState({ maps: [makeMap('m-a', fogA)] })

    const cb = vi.fn()
    const off = fogShard.onChange(cb)

    // An unrelated slice mutation must not fire the fog callback.
    useGameStore.setState({ round: 7 })
    expect(cb).not.toHaveBeenCalled()

    // Reveal a cell on m-a → new fogOfWar reference → fires.
    const revealed = fullFog([
      { x: 1, y: 1 },
      { x: 2, y: 2 }
    ])
    useGameStore.setState({ maps: [makeMap('m-a', revealed)] })
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenLastCalledWith({ 'm-a': revealed })

    off()
    useGameStore.setState({ maps: [makeMap('m-a', fullFog([{ x: 9, y: 9 }]))] })
    expect(cb).toHaveBeenCalledTimes(1) // unsubscribed → no further calls
  })

  describe('permissionFilter (SECURITY-CRITICAL DM-vs-player split)', () => {
    const fog = fullFog([
      { x: 1, y: 1 },
      { x: 2, y: 2 }
    ])
    const value: FogShardValue = { 'm-a': fog }

    it('returns the FULL fog mask (incl. exploredCells + dynamicFogEnabled) for a DM-permissioned recipient', () => {
      connectedPeers.value = [peer({ clientId: 'cid-dm', peerId: 'p-dm', roleId: 'role-dm' })]
      const out = fogShard.permissionFilter?.(value, 'cid-dm')
      expect(out).toEqual(value)
      // The DM still sees the DM-only fields untouched.
      expect((out as FogShardValue)['m-a'].exploredCells).toEqual(fog.exploredCells)
      expect((out as FogShardValue)['m-a'].dynamicFogEnabled).toBe(true)
    })

    it('returns the FULL fog mask for the literal network host (fast path)', () => {
      connectedPeers.value = [peer({ clientId: 'cid-host', peerId: 'p-host', isHost: true })]
      const out = fogShard.permissionFilter?.(value, 'cid-host')
      expect(out).toEqual(value)
    })

    it('returns ONLY the revealed mask (strips exploredCells + dynamicFogEnabled) for a player recipient', () => {
      connectedPeers.value = [peer({ clientId: 'cid-player', peerId: 'p-player', roleId: 'role-player' })]
      const out = fogShard.permissionFilter?.(value, 'cid-player') as FogShardValue
      expect(out['m-a']).toEqual({ enabled: true, revealedCells: fog.revealedCells })
      // The DM-only fields MUST be absent on the player wire.
      expect(out['m-a'].exploredCells).toBeUndefined()
      expect(out['m-a'].dynamicFogEnabled).toBeUndefined()
    })

    it('denies-by-default (player mask) for an unknown recipient not in the peer list', () => {
      connectedPeers.value = []
      const out = fogShard.permissionFilter?.(value, 'cid-ghost') as FogShardValue
      expect(out['m-a']).toEqual({ enabled: true, revealedCells: fog.revealedCells })
      expect(out['m-a'].exploredCells).toBeUndefined()
    })

    it('denies a player even when they share a clientId-keyed override that lacks view_full_fog', () => {
      // Sanity: a player with no override and the player role never sees the
      // DM-only history, across multiple maps.
      const twoMaps: FogShardValue = { 'm-a': fog, 'm-b': fullFog([{ x: 4, y: 4 }]) }
      connectedPeers.value = [peer({ clientId: 'cid-player', peerId: 'p-player', roleId: 'role-player' })]
      const out = fogShard.permissionFilter?.(twoMaps, 'cid-player') as FogShardValue
      for (const mapId of Object.keys(twoMaps)) {
        expect(out[mapId].exploredCells).toBeUndefined()
        expect(out[mapId].dynamicFogEnabled).toBeUndefined()
        expect(out[mapId].revealedCells).toEqual(twoMaps[mapId].revealedCells)
      }
    })
  })
})
