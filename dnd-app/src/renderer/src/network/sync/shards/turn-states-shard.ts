import type { NetworkGameState } from '../../../network'
import { hasPermission } from '../../../services/permissions/has-permission'
import { filterGameStateForRole, useNetworkStore } from '../../../stores/network-store'
import { useCampaignStore } from '../../../stores/use-campaign-store'
import { useGameStore } from '../../../stores/use-game-store'
import type { TurnState } from '../../../types/game-state'
import { getConnectedPeers } from '../../host-manager'
import { applyDelta, structuralDiff } from '../diff'
import { registerShard } from '../registry'
import type { Shard } from '../shard'

/**
 * Phase 31k — per-entity turn state migrated onto the shard pipeline as a
 * permission-FILTERED shard.
 *
 * `turnStates` is `Record<entityId, TurnState>` — the per-combatant turn-economy
 * record (movement remaining, action/bonus/reaction used, dash/dodge/hide flags,
 * concentration, etc.), keyed by the same entity id a map token carries. It is
 * SECURITY-SENSITIVE because a key whose entity id belongs to a HIDDEN token
 * leaks that token's existence: `filterGameStateForRole(state, 'player')` strips
 * exactly those keys (`turnStates` keys matching a hidden token id). Previously
 * the host originated a bespoke `game:state-update { turnStates }` broadcast from
 * `startGameSync`; that block is gone. The host's `turnStates` now streams to
 * clients via the shard broadcaster (`sync:delta`) through the per-recipient
 * `permissionFilter` below. `turnStates` stays in `buildFullGameStatePayload`,
 * but that join snapshot is itself role-filtered (`buildFilteredStateForRole` →
 * `filterGameStateForRole`), so the initial set a peer receives is already
 * correct per recipient.
 *
 * The `game:state-update` message type + its client handler remain for 31l
 * back-compat; the host just no longer originates that per-change broadcast.
 *
 * Value shape: `Record<entityId, TurnState>` — top-level game state, not
 * per-map. `read` returns the live record; `onChange` fires whenever the
 * `turnStates` reference changes; `diff` is `structuralDiff` (a plain object →
 * per-key object patch); `applyDelta` writes the received record back via
 * `setState`, mirroring how the existing `applyGameState` path seeds it (no
 * dedicated whole-record setter beyond `loadGameState`).
 */
type TurnStatesShardValue = Record<string, TurnState>

function readValue(): TurnStatesShardValue {
  return useGameStore.getState().turnStates
}

/**
 * SECURITY-CRITICAL turn-state visibility gate.
 *
 * A recipient gets the FULL turnStates record (including keys for hidden-token
 * entities) only when it can see DM-level token data — the SAME gate the
 * tokens-shard uses (`isHost`/`isCoDM` fast path + the `view_hidden_tokens` AND
 * `view_dm_only_stats` permission pair that promotes a peer into the 'host'
 * transform bucket). An UNKNOWN recipient not in the connected-peer list is
 * denied-by-default and gets the reduced player record.
 */
function recipientSeesAllTurnStates(recipientClientId: string): boolean {
  const peers = getConnectedPeers()
  const peer = peers.find((p) => p.clientId === recipientClientId)
  if (!peer) {
    // Unknown recipient (not in the connected-peer list): deny-by-default,
    // never leak hidden-entity turn states to an unresolved peer.
    return false
  }
  if (peer.isHost || peer.isCoDM === true) return true
  const net = useNetworkStore.getState()
  const campaign = useCampaignStore.getState().campaigns.find((c) => c.id === net.campaignId) ?? null
  return hasPermission(peer, 'view_hidden_tokens', campaign) && hasPermission(peer, 'view_dm_only_stats', campaign)
}

/**
 * Reduce the turnStates record to the player-visible set by REUSING the
 * authoritative `filterGameStateForRole(state, 'player')` rule — the single
 * source of truth for which turnStates keys are stripped (those matching a hidden
 * token id). We wrap the live maps + the shard value in a minimal
 * `NetworkGameState` (only `maps` + `turnStates` populated; every other slice is
 * a safe empty so the helper's guards no-op), run the player filter, then read
 * the filtered `turnStates` back out. This guarantees the shard can never drift
 * from the network store's hidden-token rule.
 */
function toPlayerTurnStates(value: TurnStatesShardValue): TurnStatesShardValue {
  const minimalState: NetworkGameState = {
    activeMapId: null,
    maps: useGameStore.getState().maps,
    turnMode: 'free',
    initiative: null,
    round: 0,
    conditions: [],
    isPaused: false,
    turnStates: value,
    underwaterCombat: false,
    flankingEnabled: false,
    groupInitiativeEnabled: false,
    ambientLight: 'bright',
    diagonalRule: 'standard',
    travelPace: null,
    marchingOrder: [],
    inGameTime: null,
    allies: [],
    enemies: [],
    places: [],
    handouts: []
  }
  const filtered = filterGameStateForRole(minimalState, 'player')
  return filtered.turnStates as TurnStatesShardValue
}

const turnStatesShard: Shard<TurnStatesShardValue> = {
  name: 'turnStates',
  read: readValue,
  onChange: (cb) => {
    let prev = useGameStore.getState().turnStates
    return useGameStore.subscribe((state) => {
      if (state.turnStates !== prev) {
        prev = state.turnStates
        cb(state.turnStates)
      }
    })
  },
  diff: (prev, next) => structuralDiff(prev, next),
  applyDelta: (delta) => {
    const next = applyDelta(readValue(), delta)
    useGameStore.setState({ turnStates: next })
  },
  permissionFilter: (value, recipientClientId) => {
    if (recipientSeesAllTurnStates(recipientClientId)) return value
    return toPlayerTurnStates(value)
  }
}

registerShard(turnStatesShard)

export type { TurnStatesShardValue }
export { turnStatesShard }
