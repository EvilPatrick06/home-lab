import { useGameStore } from '../../../stores/use-game-store'
import type { SceneRegion } from '../../../types/map'
import { applyDelta, structuralDiff } from '../diff'
import { registerShard } from '../registry'
import type { Shard } from '../shard'

/**
 * Phase 31i — map scene-regions migrated onto the shard pipeline.
 *
 * UNFILTERED — behavior-preserving. Although `SceneRegion` carries a
 * `visibleToPlayers` flag, the EXISTING wire path does NOT filter regions per
 * recipient: `startGameSync` broadcast `dm:region-add/update/remove` (and the
 * join snapshot via the maps array) to every client unconditionally, including
 * regions with `visibleToPlayers: false`. The DM-vs-player visibility split is
 * enforced purely at the PixiJS render surface (`drawRegions` skips
 * `!isHost && !region.visibleToPlayers`), NOT at the network layer — neither
 * `filterGameStateForRole`/`filterMapForPlayer` nor
 * `transformUpdatePayloadForPeer` touch regions (`NetworkMap` doesn't even carry
 * a `regions` field). To preserve that exact behavior, this shard ships the full
 * region set to all recipients and declares NO permissionFilter, mirroring
 * initiative (31f). (A latent client-side DM-only-region leak therefore predates
 * this migration; hardening it is logged as out-of-scope debt rather than a
 * silent behavior change here.)
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
  }
}

registerShard(regionsShard)

export type { RegionsShardValue }
export { regionsShard }
