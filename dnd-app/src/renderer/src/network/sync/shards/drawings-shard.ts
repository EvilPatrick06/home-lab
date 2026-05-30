import { useGameStore } from '../../../stores/use-game-store'
import type { DrawingData } from '../../../types/map'
import { applyDelta, structuralDiff } from '../diff'
import { registerShard } from '../registry'
import type { Shard } from '../shard'

/**
 * Phase 31i — map drawings/annotations migrated onto the shard pipeline.
 *
 * UNFILTERED — behavior-preserving. Although `DrawingData` carries an optional
 * `visibleToPlayers` flag (the DM can author hidden annotations), the EXISTING
 * wire path does NOT filter drawings per recipient: `startGameSync` (and the
 * direct broadcast in `map-event-handlers`) shipped `dm:drawing-add/remove` to
 * every client unconditionally, including drawings with
 * `visibleToPlayers: false`. The DM-vs-player visibility split is enforced purely
 * at the PixiJS render surface (`drawDrawings` skips
 * `!isHost && drawing.visibleToPlayers === false`), NOT at the network layer —
 * neither `filterGameStateForRole`/`filterMapForPlayer` nor
 * `transformUpdatePayloadForPeer` touch drawings (`NetworkMap` doesn't even carry
 * a `drawings` field). To preserve that exact behavior, this shard ships the full
 * drawing set to all recipients and declares NO permissionFilter, mirroring
 * initiative (31f). (A latent client-side DM-only-drawing leak therefore predates
 * this migration; hardening it is logged as out-of-scope debt rather than a
 * silent behavior change here.)
 *
 * The host's per-map `map.drawings` now streams via the shard broadcaster
 * (`sync:delta`) instead of the bespoke `dm:drawing-add/remove` per-change
 * broadcasts that used to live in `startGameSync` (on
 * `map.drawings !== prevMap.drawings`). Drawings stay in
 * `buildFullGameStatePayload` (carried inside the join-snapshot maps) so the
 * initial drawing set still seeds on join. (The `dm:drawing-*` message types +
 * their client handlers remain for 31l back-compat; the host just no longer
 * originates those per-change broadcasts.)
 *
 * Value shape: `Record<mapId, DrawingData[]>` — one drawing array per map, keyed
 * by map id (mirroring fog/tokens per-map shape). `map.drawings` is optional on
 * `GameMap`; `read` normalizes `undefined → []`. `onChange` fires whenever ANY
 * map's `drawings` reference changes (or a map is added/removed); `diff` is
 * `structuralDiff` (drawings are `{ id }` records → order-exact array patch);
 * `applyDelta` writes the received drawings back onto the matching maps via
 * `setState`.
 */
type DrawingsShardValue = Record<string, DrawingData[]>

function readValue(): DrawingsShardValue {
  const out: DrawingsShardValue = {}
  for (const m of useGameStore.getState().maps) {
    out[m.id] = m.drawings ?? []
  }
  return out
}

const drawingsShard: Shard<DrawingsShardValue> = {
  name: 'drawings',
  read: readValue,
  onChange: (cb) => {
    const drawingRefs = new Map<string, DrawingData[] | undefined>()
    for (const m of useGameStore.getState().maps) drawingRefs.set(m.id, m.drawings)
    return useGameStore.subscribe((state) => {
      let changed = false
      const nextRefs = new Map<string, DrawingData[] | undefined>()
      for (const m of state.maps) {
        nextRefs.set(m.id, m.drawings)
        if (drawingRefs.get(m.id) !== m.drawings) changed = true
      }
      // A removed map also changes the drawing record's key set.
      if (nextRefs.size !== drawingRefs.size) changed = true
      if (changed) {
        drawingRefs.clear()
        for (const [id, drawings] of nextRefs) drawingRefs.set(id, drawings)
        cb(readValue())
      }
    })
  },
  diff: (prev, next) => structuralDiff(prev, next),
  applyDelta: (delta) => {
    const next = applyDelta(readValue(), delta)
    const maps = useGameStore.getState().maps.map((m) => (next[m.id] ? { ...m, drawings: next[m.id] } : m))
    useGameStore.setState({ maps })
  }
}

registerShard(drawingsShard)

export type { DrawingsShardValue }
export { drawingsShard }
