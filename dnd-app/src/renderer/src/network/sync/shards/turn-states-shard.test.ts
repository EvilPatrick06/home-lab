import { beforeEach, describe, expect, it, vi } from 'vitest'

// The game store's slices touch `window.api` at import time in some paths;
// stub a minimal shape (same approach as the slice unit tests) so importing the
// store under the node test environment doesn't throw.
vi.stubGlobal('window', { api: { storage: {}, game: {} } })

// The turn-states shard's permissionFilter resolves the recipient clientId
// against the live connected-peer list (host-manager). Mock it so the test
// drives the DM-vs-player split without standing up a real PeerJS mesh.
const connectedPeers = vi.hoisted(() => ({ value: [] as import('../../state-types').PeerInfo[] }))
vi.mock('../../host-manager', () => ({
  getConnectedPeers: () => connectedPeers.value
}))

import { BUILTIN_ROLES } from '../../../data/builtin-roles'
import { useNetworkStore } from '../../../stores/network-store'
import { useCampaignStore } from '../../../stores/use-campaign-store'
import { useGameStore } from '../../../stores/use-game-store'
import type { Campaign } from '../../../types/campaign'
import type { TurnState } from '../../../types/game-state'
import type { GameMap, MapToken } from '../../../types/map'
import type { PeerInfo } from '../../state-types'
import { applyDelta } from '../diff'
import { findShard } from '../registry'
import { type TurnStatesShardValue, turnStatesShard } from './turn-states-shard'

function makeTurnState(entityId: string): TurnState {
  return {
    entityId,
    movementRemaining: 30,
    movementMax: 30,
    actionUsed: false,
    bonusActionUsed: false,
    reactionUsed: false,
    freeInteractionUsed: false,
    isDashing: false,
    isDisengaging: false,
    isDodging: false,
    isHidden: false
  }
}

function makeToken(id: string, isHidden: boolean): MapToken {
  return { id, isHidden } as unknown as MapToken
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

/** A campaign whose built-in roles include the DM (view_hidden_tokens +
 * view_dm_only_stats) and the player (neither). */
function makeCampaign(): Campaign {
  return {
    id: 'camp-1',
    permissions: { roles: structuredClone(BUILTIN_ROLES), playerOverrides: {} }
  } as unknown as Campaign
}

describe('turn-states-shard (Phase 31k)', () => {
  beforeEach(() => {
    useGameStore.setState({ turnStates: {}, maps: [] })
    connectedPeers.value = []
    useCampaignStore.setState({ campaigns: [makeCampaign()] })
    useNetworkStore.setState({ campaignId: 'camp-1' })
  })

  it('registers itself under the name "turnStates"', () => {
    expect(turnStatesShard.name).toBe('turnStates')
    expect(findShard('turnStates')).toBe(turnStatesShard)
  })

  it('declares a permissionFilter (it is a FILTERED shard)', () => {
    expect(typeof turnStatesShard.permissionFilter).toBe('function')
  })

  it('read() returns the live turnStates record', () => {
    const ts: TurnStatesShardValue = { e1: makeTurnState('e1') }
    useGameStore.setState({ turnStates: ts })
    expect(turnStatesShard.read()).toBe(ts)
  })

  it('diff() returns null when the record is structurally unchanged', () => {
    const prev: TurnStatesShardValue = { e1: makeTurnState('e1') }
    const next: TurnStatesShardValue = { e1: makeTurnState('e1') }
    expect(turnStatesShard.diff(prev, next)).toBeNull()
  })

  it('round-trips an add: applyDelta(read, diff(prev, next)) deep-equals next', () => {
    const prev: TurnStatesShardValue = {}
    const next: TurnStatesShardValue = { e1: makeTurnState('e1'), e2: makeTurnState('e2') }
    const delta = turnStatesShard.diff(prev, next)
    expect(delta).not.toBeNull()
    if (!delta) return
    expect(applyDelta(prev, delta)).toEqual(next)
  })

  it('round-trips a movement spend + a key removal against the real store via applyDelta', () => {
    const initial: TurnStatesShardValue = { e1: makeTurnState('e1'), e2: makeTurnState('e2') }
    useGameStore.setState({ turnStates: initial })

    // e1 spends movement + uses its action; e2's turn ends (key removed).
    const next: TurnStatesShardValue = {
      e1: { ...makeTurnState('e1'), movementRemaining: 5, actionUsed: true }
    }
    const delta = turnStatesShard.diff(turnStatesShard.read(), next)
    expect(delta).not.toBeNull()
    if (!delta) return

    turnStatesShard.applyDelta(delta)
    expect(useGameStore.getState().turnStates).toEqual(next)
  })

  it('onChange fires only when the turnStates reference changes', () => {
    const cb = vi.fn()
    const off = turnStatesShard.onChange(cb)

    // Mutating an unrelated slice must not fire the turnStates callback.
    useGameStore.setState({ round: 5 })
    expect(cb).not.toHaveBeenCalled()

    const next: TurnStatesShardValue = { e1: makeTurnState('e1') }
    useGameStore.setState({ turnStates: next })
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith(next)

    off()
    useGameStore.setState({ turnStates: { e2: makeTurnState('e2') } })
    expect(cb).toHaveBeenCalledTimes(1) // unsubscribed → no further calls
  })

  describe('permissionFilter (SECURITY-CRITICAL DM-vs-player split)', () => {
    // 'hidden-tok' is a HIDDEN token; its turnStates key must be stripped on the
    // player wire. 'vis-tok' is a visible token; its key stays for everyone.
    const value: TurnStatesShardValue = {
      'vis-tok': makeTurnState('vis-tok'),
      'hidden-tok': makeTurnState('hidden-tok')
    }

    beforeEach(() => {
      useGameStore.setState({
        maps: [makeMap('m-a', [makeToken('vis-tok', false), makeToken('hidden-tok', true)])]
      })
    })

    it('returns the FULL record (incl. the hidden-token key) for a DM-permissioned recipient', () => {
      connectedPeers.value = [peer({ clientId: 'cid-dm', peerId: 'p-dm', roleId: 'role-dm' })]
      const out = turnStatesShard.permissionFilter?.(value, 'cid-dm') as TurnStatesShardValue
      expect(out).toEqual(value)
      expect(out['hidden-tok']).toBeDefined()
    })

    it('returns the FULL record for the literal network host (fast path)', () => {
      connectedPeers.value = [peer({ clientId: 'cid-host', peerId: 'p-host', isHost: true })]
      const out = turnStatesShard.permissionFilter?.(value, 'cid-host')
      expect(out).toEqual(value)
    })

    it('STRIPS the hidden-token key for a player recipient', () => {
      connectedPeers.value = [peer({ clientId: 'cid-player', peerId: 'p-player', roleId: 'role-player' })]
      const out = turnStatesShard.permissionFilter?.(value, 'cid-player') as TurnStatesShardValue
      // The visible token's turn state survives; the hidden one is gone.
      expect(out['vis-tok']).toEqual(value['vis-tok'])
      expect(out['hidden-tok']).toBeUndefined()
    })

    it('denies-by-default (player view) for an unknown recipient not in the peer list', () => {
      connectedPeers.value = []
      const out = turnStatesShard.permissionFilter?.(value, 'cid-ghost') as TurnStatesShardValue
      expect(out['vis-tok']).toEqual(value['vis-tok'])
      expect(out['hidden-tok']).toBeUndefined()
    })
  })
})
