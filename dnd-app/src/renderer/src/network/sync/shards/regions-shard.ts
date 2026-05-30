import { hasPermission } from '../../../services/permissions/has-permission'
import { useNetworkStore } from '../../../stores/network-store'
import { useCampaignStore } from '../../../stores/use-campaign-store'
import { useGameStore } from '../../../stores/use-game-store'
import type { SceneRegion } from '../../../types/map'
import { getConnectedPeers } from '../../host-manager'
import { applyDelta, structuralDiff } from '../diff'
import { registerShard } from '../registry'
import type { Shard } from '../shard'

/**
 * Phase 31i — map scene-regions migrated onto the shard pipeline.
 *
 * FILTERED — DM-only regions are stripped per recipient (hardens the latent
 * wire-leak the 31i migration logged as out-of-scope debt). `SceneRegion`
 * carries a required `visibleToPlayers` boolean; the DM-vs-player split was
 * previously enforced ONLY at the PixiJS render surface (`drawRegions` skips
 * `!isHost && !region.visibleToPlayers`), so the full DM-only set still reached
 * every client over the network. This shard now mirrors that render-surface
 * predicate on the wire via `permissionFilter`: DM/CoDM (host/co-DM fast path)
 * and holders of `use_dm_tools` see the full set; everyone else — including
 * unknown recipients (deny-by-default) — only receives `visibleToPlayers: true`
 * regions, so a hidden region never reaches a player's client. (Mirrors
 * `fog-shard`/`tokens-shard`; `use_dm_tools` is the closest semantic gate — no
 * region-specific view key exists, and region authoring is itself a DM tool,
 * matching `region-layer`'s `!isHost` render gate.)
 *
 * The host's per-map `map.regions` now streams via the shard broadcaster
 * (`sync:delta`) instead of the bespoke `dm:region-add/update/remove`
 * per-change broadcasts that used to live in `startGameSync` (on
 * `map.regions !== prevMap.regions`). Regions stay in `buildFullGameStatePayload`
 * (carried inside the join-snapshot maps) so the initial region set still seeds
 * on join. (The `dm:region-*` message types + their client handlers remain for
 * 31l back-compat; the host just no longer originates those per-change
 * broadcasts.)
 *
 * Value shape: `Record<mapId, SceneRegion[]>` — one region array per map, keyed
 * by map id (mirroring fog/tokens per-map shape). `map.regions` is optional on
 * `GameMap`; `read` normalizes `undefined → []`. `onChange` fires whenever ANY
 * map's `regions` reference changes (or a map is added/removed); `diff` is
 * `structuralDiff` (regions are `{ id }` records → order-exact array patch, with
 * a per-region object sub-patch when a single region is updated); `applyDelta`
 * writes the received regions back onto the matching maps via `setState`.
 */
type RegionsShardValue = Record<string, SceneRegion[]>

function readValue(): RegionsShardValue {
  const out: RegionsShardValue = {}
  for (const m of useGameStore.getState().maps) {
    out[m.id] = m.regions ?? []
  }
  return out
}

/**
 * SECURITY-CRITICAL region-visibility gate (mirrors `recipientSeesFullFog`).
 *
 * A recipient gets the full region set only when it can see DM-level regions —
 * the `isHost`/`isCoDM` fast path plus the `use_dm_tools` permission (the gate
 * that governs region authoring; no region-specific view key exists). Everyone
 * else — including an unresolved recipient (deny-by-default) — gets the DM-only
 * regions stripped.
 */
function recipientSeesDmRegions(recipientClientId: string): boolean {
  const peers = getConnectedPeers()
  const peer = peers.find((p) => p.clientId === recipientClientId)
  if (!peer) return false
  if (peer.isHost || peer.isCoDM === true) return true
  const net = useNetworkStore.getState()
  const campaign = useCampaignStore.getState().campaigns.find((c) => c.id === net.campaignId) ?? null
  return hasPermission(peer, 'use_dm_tools', campaign)
}

const regionsShard: Shard<RegionsShardValue> = {
  name: 'regions',
  read: readValue,
  onChange: (cb) => {
    const regionRefs = new Map<string, SceneRegion[] | undefined>()
    for (const m of useGameStore.getState().maps) regionRefs.set(m.id, m.regions)
    return useGameStore.subscribe((state) => {
      let changed = false
      const nextRefs = new Map<string, SceneRegion[] | undefined>()
      for (const m of state.maps) {
        nextRefs.set(m.id, m.regions)
        if (regionRefs.get(m.id) !== m.regions) changed = true
      }
      // A removed map also changes the region record's key set.
      if (nextRefs.size !== regionRefs.size) changed = true
      if (changed) {
        regionRefs.clear()
        for (const [id, regions] of nextRefs) regionRefs.set(id, regions)
        cb(readValue())
      }
    })
  },
  diff: (prev, next) => structuralDiff(prev, next),
  applyDelta: (delta) => {
    const next = applyDelta(readValue(), delta)
    const maps = useGameStore.getState().maps.map((m) => (next[m.id] ? { ...m, regions: next[m.id] } : m))
    useGameStore.setState({ maps })
  },
  permissionFilter: (value, recipientClientId) => {
    if (recipientSeesDmRegions(recipientClientId)) return value
    const reduced: RegionsShardValue = {}
    for (const [mapId, regions] of Object.entries(value)) {
      // SceneRegion.visibleToPlayers is a required boolean; mirror the
      // render-surface predicate (`!region.visibleToPlayers` hides) exactly.
      reduced[mapId] = regions.filter((r) => r.visibleToPlayers === true)
    }
    return reduced
  }
}

registerShard(regionsShard)

export type { RegionsShardValue }
export { regionsShard }
