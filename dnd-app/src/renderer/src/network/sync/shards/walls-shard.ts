import { useGameStore } from '../../../stores/use-game-store'
import type { WallSegment } from '../../../types/map'
import { applyDelta, structuralDiff } from '../diff'
import { registerShard } from '../registry'
import type { Shard } from '../shard'

/**
 * Phase 31i — map wall segments migrated onto the shard pipeline.
 *
 * Walls are shared structural geometry (a `WallSegment` is `{ id, x1, y1, x2,
 * y2, type, ... }` — no DM-only fields; the only DM-vs-player difference is
 * render alpha at the PixiJS surface, not the data). So walls carry NO
 * permission filter — they are an UNFILTERED shard, mirroring initiative
 * (31f). The host's per-map `map.wallSegments` now streams to clients via the
 * shard broadcaster (`sync:delta`) instead of the bespoke
 * `game:state-update { wallSegments }` per-change broadcast that used to live
 * in `startGameSync` (on `map.wallSegments !== prevMap.wallSegments`). Walls
 * stay in `buildFullGameStatePayload` (carried inside the join-snapshot maps)
 * so the initial wall set still seeds on join. (The `game:state-update`
 * wallSegments message + its client handler remain for 31l back-compat; the
 * host just no longer originates that per-change broadcast.)
 *
 * Value shape: `Record<mapId, WallSegment[]>` — one wall-segment array per map,
 * keyed by map id (mirroring fog/tokens per-map shape). `map.wallSegments` is
 * optional on `GameMap`; `read` normalizes `undefined → []` so the record always
 * carries an array (the structural diff never has to reconcile `[] ⇄ undefined`).
 * `onChange` fires whenever ANY map's `wallSegments` reference changes (or a map
 * is added/removed); `diff` is `structuralDiff` (walls are `{ id }` records →
 * order-exact array patch); `applyDelta` writes the received walls back onto the
 * matching maps via `setState`.
 */
type WallsShardValue = Record<string, WallSegment[]>

function readValue(): WallsShardValue {
  const out: WallsShardValue = {}
  for (const m of useGameStore.getState().maps) {
    out[m.id] = m.wallSegments ?? []
  }
  return out
}

const wallsShard: Shard<WallsShardValue> = {
  name: 'walls',
  read: readValue,
  onChange: (cb) => {
    const wallRefs = new Map<string, WallSegment[] | undefined>()
    for (const m of useGameStore.getState().maps) wallRefs.set(m.id, m.wallSegments)
    return useGameStore.subscribe((state) => {
      let changed = false
      const nextRefs = new Map<string, WallSegment[] | undefined>()
      for (const m of state.maps) {
        nextRefs.set(m.id, m.wallSegments)
        if (wallRefs.get(m.id) !== m.wallSegments) changed = true
      }
      // A removed map also changes the wall record's key set.
      if (nextRefs.size !== wallRefs.size) changed = true
      if (changed) {
        wallRefs.clear()
        for (const [id, walls] of nextRefs) wallRefs.set(id, walls)
        cb(readValue())
      }
    })
  },
  diff: (prev, next) => structuralDiff(prev, next),
  applyDelta: (delta) => {
    const next = applyDelta(readValue(), delta)
    const maps = useGameStore.getState().maps.map((m) => (next[m.id] ? { ...m, wallSegments: next[m.id] } : m))
    useGameStore.setState({ maps })
  }
}

registerShard(wallsShard)

export type { WallsShardValue }
export { wallsShard }
