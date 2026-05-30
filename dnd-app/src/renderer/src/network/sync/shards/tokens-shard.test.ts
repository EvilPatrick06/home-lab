import { beforeEach, describe, expect, it, vi } from 'vitest'

// The game store's slices touch `window.api` at import time in some paths;
// stub a minimal shape (same approach as the fog-shard test) so importing the
// store under the node test environment doesn't throw.
vi.stubGlobal('window', { api: { storage: {}, game: {} } })

// The tokens shard's permissionFilter resolves the recipient clientId against
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
import type { GameMap, MapToken } from '../../../types/map'
import type { PeerInfo } from '../../state-types'
import { applyDelta } from '../diff'
import { findShard } from '../registry'
import { type TokensShardValue, tokensShard } from './tokens-shard'

/**
 * The network-layer hidden-token rule keys on the wire flag `isHidden` (see
 * `filterMapForPlayer` / `collectHiddenTokenIds` in the network store + the
 * matching `index.test.ts` fixtures), which the runtime `MapToken` carries on
 * the wire. We model tokens the same way so the shard exercises the EXACT rule
 * `filterGameStateForRole` enforces rather than an approximation.
 */
function makeToken(id: string, overrides: Partial<MapToken> & { isHidden?: boolean } = {}): MapToken {
  return {
    id,
    entityId: id,
    entityType: 'npc',
    label: id,
    gridX: 0,
    gridY: 0,
    sizeX: 1,
    sizeY: 1,
    visibleToPlayers: true,
    conditions: [],
    ...overrides
  } as MapToken
}

function makeMap(id: string, tokens: MapToken[]): GameMap {
  return {
    id,
    name: `Map ${id}`,
    campaignId: 'camp-1',
    tokens,
    wallSegments: [],
    terrain: [],
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

/** A campaign whose built-in roles include the DM (has `view_hidden_tokens` +
 * `view_dm_only_stats`) and the player (has neither). */
function makeCampaign(): Campaign {
  return {
    id: 'camp-1',
    permissions: { roles: structuredClone(BUILTIN_ROLES), playerOverrides: {} }
  } as unknown as Campaign
}

describe('tokens-shard (Phase 31h)', () => {
  beforeEach(() => {
    useGameStore.setState({ maps: [] })
    connectedPeers.value = []
    useCampaignStore.setState({ campaigns: [makeCampaign()] })
    useNetworkStore.setState({ campaignId: 'camp-1' })
  })

  it('registers itself under the name "tokens"', () => {
    expect(tokensShard.name).toBe('tokens')
    expect(findShard('tokens')).toBe(tokensShard)
  })

  it('declares a permissionFilter (it is a FILTERED shard)', () => {
    expect(typeof tokensShard.permissionFilter).toBe('function')
  })

  it('read() projects every map tokens array into a record keyed by map id', () => {
    const tokensA = [makeToken('t-a1'), makeToken('t-a2')]
    const tokensB = [makeToken('t-b1')]
    useGameStore.setState({ maps: [makeMap('m-a', tokensA), makeMap('m-b', tokensB)] })
    expect(tokensShard.read()).toEqual({ 'm-a': tokensA, 'm-b': tokensB })
  })

  it('diff() returns null when tokens are structurally unchanged', () => {
    const prev: TokensShardValue = { 'm-a': [makeToken('t-1')] }
    const next: TokensShardValue = { 'm-a': [makeToken('t-1')] }
    expect(tokensShard.diff(prev, next)).toBeNull()
  })

  describe('round-trip via the structural diff', () => {
    it('round-trips an added token', () => {
      const prev: TokensShardValue = { 'm-a': [makeToken('t-1')] }
      const next: TokensShardValue = { 'm-a': [makeToken('t-1'), makeToken('t-2')] }
      const delta = tokensShard.diff(prev, next)
      expect(delta).not.toBeNull()
      if (!delta) return
      expect(applyDelta(prev, delta)).toEqual(next)
    })

    it('round-trips a moved token (gridX/gridY change)', () => {
      const prev: TokensShardValue = { 'm-a': [makeToken('t-1', { gridX: 0, gridY: 0 })] }
      const next: TokensShardValue = { 'm-a': [makeToken('t-1', { gridX: 4, gridY: 7 })] }
      const delta = tokensShard.diff(prev, next)
      expect(delta).not.toBeNull()
      if (!delta) return
      expect(applyDelta(prev, delta)).toEqual(next)
    })

    it('round-trips a removed token', () => {
      const prev: TokensShardValue = { 'm-a': [makeToken('t-1'), makeToken('t-2')] }
      const next: TokensShardValue = { 'm-a': [makeToken('t-2')] }
      const delta = tokensShard.diff(prev, next)
      expect(delta).not.toBeNull()
      if (!delta) return
      expect(applyDelta(prev, delta)).toEqual(next)
    })

    it('round-trips an add/move/remove against the real store via applyDelta', () => {
      useGameStore.setState({ maps: [makeMap('m-a', [makeToken('t-1', { gridX: 0, gridY: 0 }), makeToken('t-2')])] })

      const next: TokensShardValue = {
        'm-a': [makeToken('t-1', { gridX: 9, gridY: 9 }), makeToken('t-3')]
      }
      const delta = tokensShard.diff(tokensShard.read(), next)
      expect(delta).not.toBeNull()
      if (!delta) return

      tokensShard.applyDelta(delta)
      expect(tokensShard.read()).toEqual(next)
      expect(useGameStore.getState().maps[0].tokens).toEqual(next['m-a'])
    })
  })

  it('onChange fires when any map tokens reference changes', () => {
    useGameStore.setState({ maps: [makeMap('m-a', [makeToken('t-1')])] })

    const cb = vi.fn()
    const off = tokensShard.onChange(cb)

    // An unrelated slice mutation must not fire the tokens callback.
    useGameStore.setState({ round: 7 })
    expect(cb).not.toHaveBeenCalled()

    // Add a token on m-a → new tokens reference → fires.
    const nextTokens = [makeToken('t-1'), makeToken('t-2')]
    useGameStore.setState({ maps: [makeMap('m-a', nextTokens)] })
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenLastCalledWith({ 'm-a': nextTokens })

    off()
    useGameStore.setState({ maps: [makeMap('m-a', [makeToken('t-9')])] })
    expect(cb).toHaveBeenCalledTimes(1) // unsubscribed → no further calls
  })

  describe('permissionFilter (SECURITY-CRITICAL hidden-token + DM-only split)', () => {
    // A visible token, a HIDDEN token (player must never see it), each carrying a
    // DM-only field on the wire.
    const visible = makeToken('t-visible', { isHidden: false } as Partial<MapToken>)
    const hidden = makeToken('t-hidden', { isHidden: true } as Partial<MapToken>)
    const value: TokensShardValue = { 'm-a': [visible, hidden] }

    it('returns the FULL token set (incl. the hidden token) for a DM-permissioned recipient', () => {
      connectedPeers.value = [peer({ clientId: 'cid-dm', peerId: 'p-dm', roleId: 'role-dm' })]
      const out = tokensShard.permissionFilter?.(value, 'cid-dm') as TokensShardValue
      expect(out).toEqual(value)
      const ids = out['m-a'].map((t) => t.id)
      expect(ids).toContain('t-hidden')
    })

    it('returns the FULL token set for the literal network host (fast path)', () => {
      connectedPeers.value = [peer({ clientId: 'cid-host', peerId: 'p-host', isHost: true })]
      const out = tokensShard.permissionFilter?.(value, 'cid-host') as TokensShardValue
      expect(out).toEqual(value)
      expect(out['m-a'].map((t) => t.id)).toContain('t-hidden')
    })

    it('returns the FULL token set for a co-DM (fast path)', () => {
      connectedPeers.value = [peer({ clientId: 'cid-codm', peerId: 'p-codm', isCoDM: true })]
      const out = tokensShard.permissionFilter?.(value, 'cid-codm') as TokensShardValue
      expect(out['m-a'].map((t) => t.id)).toContain('t-hidden')
    })

    it('DROPS the hidden token entirely for a player recipient (existence does not leak)', () => {
      connectedPeers.value = [peer({ clientId: 'cid-player', peerId: 'p-player', roleId: 'role-player' })]
      const out = tokensShard.permissionFilter?.(value, 'cid-player') as TokensShardValue
      const ids = out['m-a'].map((t) => t.id)
      expect(ids).toEqual(['t-visible'])
      // The hidden token must be wholly absent — not present-with-flag-stripped.
      expect(ids).not.toContain('t-hidden')
      expect(out['m-a'].some((t) => (t as { isHidden?: boolean }).isHidden === true)).toBe(false)
    })

    it('denies-by-default (player view, hidden dropped) for an unknown recipient', () => {
      connectedPeers.value = []
      const out = tokensShard.permissionFilter?.(value, 'cid-ghost') as TokensShardValue
      const ids = out['m-a'].map((t) => t.id)
      expect(ids).toEqual(['t-visible'])
      expect(ids).not.toContain('t-hidden')
    })

    it('drops hidden tokens across every map for a player recipient', () => {
      const twoMaps: TokensShardValue = {
        'm-a': [visible, hidden],
        'm-b': [makeToken('t-b-hidden', { isHidden: true } as Partial<MapToken>), makeToken('t-b-visible')]
      }
      connectedPeers.value = [peer({ clientId: 'cid-player', peerId: 'p-player', roleId: 'role-player' })]
      const out = tokensShard.permissionFilter?.(twoMaps, 'cid-player') as TokensShardValue
      expect(out['m-a'].map((t) => t.id)).toEqual(['t-visible'])
      expect(out['m-b'].map((t) => t.id)).toEqual(['t-b-visible'])
    })
  })
})
