import { useGameStore } from '../../../stores/use-game-store'
import { applyDelta, structuralDiff } from '../diff'
import { registerShard } from '../registry'
import type { Shard } from '../shard'

/**
 * Phase 31k — the party vision cells migrated onto the shard pipeline as an
 * UNFILTERED shard.
 *
 * `partyVisionCells` is the set of grid cells the party can currently see —
 * COMPUTED from the player tokens' vision, so it carries no DM-only data.
 * `filterGameStateForRole` documents it as intentionally NOT stripped
 * ("computed from player tokens — the input"), so it carries NO permission
 * filter and broadcasts to all clients, preserving the prior all-clients wire
 * behavior of the bespoke `dm:vision-update` broadcast.
 *
 * Previously the host originated a bespoke `dm:vision-update { partyVisionCells }`
 * per-change broadcast from `startGameSync`; that block is gone.
 * `partyVisionCells` now streams via the shard broadcaster (`sync:delta`) and
 * stays in `buildFullGameStatePayload` so the join snapshot still seeds it. The
 * `dm:vision-update` message type + its client handler (`handleVisionUpdate`,
 * which calls `setPartyVisionCells`) remain for 31l back-compat.
 *
 * Value shape: `Array<{ x: number; y: number }>` — a plain coordinate array (the
 * elements carry no `id`), so `structuralDiff` treats it as a non-record array
 * and ships a whole-value `replace` on any change. `onChange` fires whenever the
 * array reference changes; `applyDelta` writes the received array back via
 * `setPartyVisionCells` (mirroring the existing client `handleVisionUpdate`).
 */
type PartyVisionShardValue = Array<{ x: number; y: number }>

const partyVisionShard: Shard<PartyVisionShardValue> = {
  name: 'partyVisionCells',
  read: () => useGameStore.getState().partyVisionCells,
  onChange: (cb) => {
    let prev = useGameStore.getState().partyVisionCells
    return useGameStore.subscribe((state) => {
      if (state.partyVisionCells !== prev) {
        prev = state.partyVisionCells
        cb(state.partyVisionCells)
      }
    })
  },
  diff: (prev, next) => structuralDiff(prev, next),
  applyDelta: (delta) => {
    const next = applyDelta(useGameStore.getState().partyVisionCells, delta)
    useGameStore.getState().setPartyVisionCells(next)
  }
}

registerShard(partyVisionShard)

export type { PartyVisionShardValue }
export { partyVisionShard }
