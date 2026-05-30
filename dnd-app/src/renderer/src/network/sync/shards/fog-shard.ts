import { hasPermission } from '../../../services/permissions/has-permission'
import { useNetworkStore } from '../../../stores/network-store'
import { useCampaignStore } from '../../../stores/use-campaign-store'
import { useGameStore } from '../../../stores/use-game-store'
import type { FogOfWarData } from '../../../types/map'
import { getConnectedPeers } from '../../host-manager'
import { applyDelta, structuralDiff } from '../diff'
import { registerShard } from '../registry'
import type { Shard } from '../shard'

/**
 * Phase 31g — fog-of-war migrated onto the shard pipeline as the FIRST
 * permission-FILTERED shard.
 *
 * Fog is DM-vs-player filtered: the DM sees the full fog state (including the
 * DM-only `exploredCells` history + the `dynamicFogEnabled` toggle), while a
 * player only receives the player-visible reveal mask (`{ enabled,
 * revealedCells }`). The host's per-map `map.fogOfWar` now streams to clients
 * via the shard broadcaster (`sync:delta`) — through the per-recipient
 * `permissionFilter` (31j) — instead of the bespoke `dm:fog-reveal` per-change
 * broadcast that used to live in `startGameSync` (~L208-213). Fog stays in
 * `buildFullGameStatePayload`, but that join snapshot is itself role-filtered by
 * `buildFilteredStateForRole`, so the initial fog a peer receives is already
 * correct per recipient.
 *
 * The `dm:fog-reveal` message type + its client handler remain for 31l
 * back-compat; the host just no longer originates that broadcast for live fog
 * changes.
 *
 * Value shape: `Record<mapId, FogOfWarData>` — one fog entry per map, keyed by
 * map id. (Maps with fog disabled are still carried so a disable→enable flip
 * round-trips.) `read` projects every `map.fogOfWar` into this record; `onChange`
 * fires whenever ANY map's `fogOfWar` reference changes; `applyDelta` writes the
 * received fog back onto the matching maps via `setState`, mirroring the
 * existing client `dm:fog-reveal` handler (no dedicated whole-fog setter exists
 * on the fog slice — `revealFog`/`hideFog` are cell-incremental).
 */
type FogShardValue = Record<string, FogOfWarData>

function readValue(): FogShardValue {
  const out: FogShardValue = {}
  for (const m of useGameStore.getState().maps) {
    out[m.id] = m.fogOfWar
  }
  return out
}

/**
 * SECURITY-CRITICAL fog-visibility rule.
 *
 * A recipient gets the full fog state only when it can see DM-level fog —
 * mirroring the host bucket gate used by `setGameStateProvider` and the
 * `game:state-update` per-peer path in the network store (`isHost`/`isCoDM`
 * fast path), additionally honoring the dedicated `view_full_fog` permission.
 * Everyone else gets the reduced player-visible mask with the DM-only fog
 * fields stripped: `exploredCells` (the auto-revealed movement history the DM
 * uses for dynamic fog) and `dynamicFogEnabled` (a DM toggle) are removed,
 * leaving only `{ enabled, revealedCells }` — exactly what a player is allowed
 * to render.
 */
function recipientSeesFullFog(recipientClientId: string): boolean {
  const peers = getConnectedPeers()
  const peer = peers.find((p) => p.clientId === recipientClientId)
  if (!peer) {
    // Unknown recipient (not in the connected-peer list): deny-by-default,
    // strip to the player mask. Never leak the full fog to an unresolved peer.
    return false
  }
  if (peer.isHost || peer.isCoDM === true) return true
  const net = useNetworkStore.getState()
  const campaign = useCampaignStore.getState().campaigns.find((c) => c.id === net.campaignId) ?? null
  return hasPermission(peer, 'view_full_fog', campaign)
}

/** Reduce a single map's fog to the player-visible mask (drops DM-only fields). */
function toPlayerFog(fog: FogOfWarData): FogOfWarData {
  return { enabled: fog.enabled, revealedCells: fog.revealedCells }
}

const fogShard: Shard<FogShardValue> = {
  name: 'fog',
  read: readValue,
  onChange: (cb) => {
    const fogRefs = new Map<string, FogOfWarData>()
    for (const m of useGameStore.getState().maps) fogRefs.set(m.id, m.fogOfWar)
    return useGameStore.subscribe((state) => {
      let changed = false
      const nextRefs = new Map<string, FogOfWarData>()
      for (const m of state.maps) {
        nextRefs.set(m.id, m.fogOfWar)
        if (fogRefs.get(m.id) !== m.fogOfWar) changed = true
      }
      // A removed map also changes the fog record's key set.
      if (nextRefs.size !== fogRefs.size) changed = true
      if (changed) {
        fogRefs.clear()
        for (const [id, fog] of nextRefs) fogRefs.set(id, fog)
        cb(readValue())
      }
    })
  },
  diff: (prev, next) => structuralDiff(prev, next),
  applyDelta: (delta) => {
    const next = applyDelta(readValue(), delta)
    const maps = useGameStore.getState().maps.map((m) => (next[m.id] ? { ...m, fogOfWar: next[m.id] } : m))
    useGameStore.setState({ maps })
  },
  permissionFilter: (value, recipientClientId) => {
    if (recipientSeesFullFog(recipientClientId)) return value
    const reduced: FogShardValue = {}
    for (const [mapId, fog] of Object.entries(value)) {
      reduced[mapId] = toPlayerFog(fog)
    }
    return reduced
  }
}

registerShard(fogShard)

export { fogShard }
export type { FogShardValue }
