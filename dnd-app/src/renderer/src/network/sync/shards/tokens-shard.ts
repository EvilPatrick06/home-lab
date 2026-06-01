import type { NetworkGameState, NetworkMap } from '../../../network'
import { hasPermission } from '../../../services/permissions/has-permission'
import { getNetworkCampaignId } from '../../../stores/network-store/network-session-ref'
import { filterGameStateForRole } from '../../../stores/network-store/network-state-filter'
import { useCampaignStore } from '../../../stores/use-campaign-store'
import { useGameStore } from '../../../stores/use-game-store'
import type { MapToken } from '../../../types/map'
import { getConnectedPeers } from '../../host-manager'
import { applyDelta, structuralDiff } from '../diff'
import { registerShard } from '../registry'
import type { Shard } from '../shard'

/**
 * Phase 31h — map tokens migrated onto the shard pipeline as a permission-
 * FILTERED shard (the second filtered shard after fog, 31g).
 *
 * Tokens are the highest-traffic, most security-sensitive feature on the wire:
 * a HIDDEN token (a token whose existence the DM is keeping from the party) must
 * never reach a player — not the token, not its hidden flag, not any DM-only
 * field on it. Previously the host originated per-token add/update/remove
 * broadcasts from `startGameSync` (~L180-206), with the network store's
 * `transformUpdatePayloadForPeer` rewriting hide→removeToken / reveal→addToken
 * and suppressing hidden-token updates on the player wire. That bespoke block is
 * gone; the host's per-map `map.tokens` now streams to clients via the shard
 * broadcaster (`sync:delta`) through the per-recipient `permissionFilter` below.
 * Tokens stay in `buildFullGameStatePayload`, but that join snapshot is itself
 * role-filtered (`buildFilteredStateForRole` → `filterGameStateForRole`), so the
 * initial token set a peer receives is already correct per recipient.
 *
 * The token message types + their client handlers remain for 31l back-compat;
 * the host just no longer originates those per-change broadcasts for live token
 * changes.
 *
 * Value shape: `Record<mapId, MapToken[]>` — one tokens array per map, keyed by
 * map id. `read` projects every `map.tokens` into this record; `onChange` fires
 * whenever ANY map's `tokens` reference changes (or a map is added/removed);
 * `diff` is `structuralDiff` (tokens are `{ id }` records → order-exact array
 * patch); `applyDelta` writes the received tokens back onto the matching maps via
 * `setState`.
 */
type TokensShardValue = Record<string, MapToken[]>

function readValue(): TokensShardValue {
  const out: TokensShardValue = {}
  for (const m of useGameStore.getState().maps) {
    out[m.id] = m.tokens
  }
  return out
}

/**
 * SECURITY-CRITICAL token-visibility gate.
 *
 * A recipient gets the FULL token set (hidden tokens + DM-only fields intact)
 * only when it can see DM-level token data — mirroring the host bucket gate used
 * by `setGameStateProvider` and the `game:state-update` per-peer path in the
 * network store: `isHost`/`isCoDM` as the fast path + legacy fallback, otherwise
 * the dedicated `view_hidden_tokens` AND `view_dm_only_stats` view permissions
 * (the same pair that promotes a peer into the 'host' transform bucket). Everyone
 * else — including an UNKNOWN recipient not in the connected-peer list
 * (deny-by-default) — gets the reduced player view.
 */
function recipientSeesAllTokens(recipientClientId: string): boolean {
  const peers = getConnectedPeers()
  const peer = peers.find((p) => p.clientId === recipientClientId)
  if (!peer) {
    // Unknown recipient (not in the connected-peer list): deny-by-default,
    // never leak hidden tokens / DM-only fields to an unresolved peer.
    return false
  }
  if (peer.isHost || peer.isCoDM === true) return true
  const campaignId = getNetworkCampaignId()
  const campaign = useCampaignStore.getState().campaigns.find((c) => c.id === campaignId) ?? null
  return hasPermission(peer, 'view_hidden_tokens', campaign) && hasPermission(peer, 'view_dm_only_stats', campaign)
}

/**
 * Reduce the token record to the player-visible set by REUSING the authoritative
 * `filterGameStateForRole(state, 'player')` rule — the single source of truth for
 * which tokens are hidden and which token fields are DM-only. We wrap the shard
 * value in a minimal `NetworkGameState` (only `maps` populated; every other slice
 * is a safe empty so the helper's `Array.isArray` / object guards no-op), run the
 * player filter, then project the filtered `maps[i].tokens` back into the record.
 *
 * This guarantees the shard can never drift from the network store's hidden-token
 * rule: if `filterMapForPlayer` / `collectHiddenTokenIds` change, this follows.
 */
function toPlayerTokens(value: TokensShardValue): TokensShardValue {
  const maps: NetworkMap[] = Object.entries(value).map(([id, tokens]) => ({
    id,
    name: '',
    campaignId: '',
    imagePath: '',
    width: 0,
    height: 0,
    grid: null,
    tokens,
    fogOfWar: null,
    wallSegments: [],
    terrain: [],
    createdAt: ''
  }))
  const minimalState: NetworkGameState = {
    activeMapId: null,
    maps,
    turnMode: 'free',
    initiative: null,
    round: 0,
    conditions: [],
    isPaused: false,
    turnStates: {},
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
  const out: TokensShardValue = {}
  for (const m of filtered.maps) {
    out[m.id] = m.tokens as MapToken[]
  }
  return out
}

const tokensShard: Shard<TokensShardValue> = {
  name: 'tokens',
  read: readValue,
  onChange: (cb) => {
    const tokenRefs = new Map<string, MapToken[]>()
    for (const m of useGameStore.getState().maps) tokenRefs.set(m.id, m.tokens)
    return useGameStore.subscribe((state) => {
      let changed = false
      const nextRefs = new Map<string, MapToken[]>()
      for (const m of state.maps) {
        nextRefs.set(m.id, m.tokens)
        if (tokenRefs.get(m.id) !== m.tokens) changed = true
      }
      // A removed map also changes the token record's key set.
      if (nextRefs.size !== tokenRefs.size) changed = true
      if (changed) {
        tokenRefs.clear()
        for (const [id, tokens] of nextRefs) tokenRefs.set(id, tokens)
        cb(readValue())
      }
    })
  },
  diff: (prev, next) => structuralDiff(prev, next),
  applyDelta: (delta) => {
    const next = applyDelta(readValue(), delta)
    const maps = useGameStore.getState().maps.map((m) => (next[m.id] ? { ...m, tokens: next[m.id] } : m))
    useGameStore.setState({ maps })
  },
  permissionFilter: (value, recipientClientId) => {
    if (recipientSeesAllTokens(recipientClientId)) return value
    return toPlayerTokens(value)
  }
}

registerShard(tokensShard)

export type { TokensShardValue }
export { tokensShard }
