import { useGameStore } from '../../../stores/use-game-store'
import type { SharedJournalEntry } from '../../../types/game-state'
import { applyDelta, structuralDiff } from '../diff'
import { registerShard } from '../registry'
import type { Shard } from '../shard'

/**
 * Phase 31k — the shared (player-visible) journal migrated onto the shard
 * pipeline as an UNFILTERED shard.
 *
 * `sharedJournal` is the SHARED journal — entries authored by players or the DM
 * that the party can see (distinct from the DM-only campaign journal, which is a
 * separate store and never crosses this wire). It is NOT touched by
 * `filterGameStateForRole`, so it carries NO permission filter and broadcasts
 * the structural diff to all clients — preserving the prior all-clients wire
 * behavior. (Per-entry `visibility === 'private'` filtering stays a
 * render-surface concern, exactly as the old bespoke broadcast comment in
 * `startGameSync` documented; private entries remain visible to their author +
 * the host, and players currently see all shared entries.)
 *
 * Previously the host originated a bespoke `game:state-update { sharedJournal }`
 * broadcast from `startGameSync` (Phase 17ad) whenever an entry was added /
 * updated / deleted (each mutation returns a fresh array reference). That block
 * is gone; `sharedJournal` now streams via the shard broadcaster (`sync:delta`).
 * It stays in `buildFullGameStatePayload` so the join snapshot still seeds it.
 * The `game:state-update` message type + its client handler remain for 31l
 * back-compat.
 *
 * Value shape: `SharedJournalEntry[]` — an array of `{ id }` records, so
 * `structuralDiff` produces an order-exact array patch (add/remove/update by id);
 * `onChange` fires whenever the array reference changes; `applyDelta` writes the
 * received array back via `setState` (mirroring `setSharedJournal`).
 */
type SharedJournalShardValue = SharedJournalEntry[]

const sharedJournalShard: Shard<SharedJournalShardValue> = {
  name: 'sharedJournal',
  read: () => useGameStore.getState().sharedJournal,
  onChange: (cb) => {
    let prev = useGameStore.getState().sharedJournal
    return useGameStore.subscribe((state) => {
      if (state.sharedJournal !== prev) {
        prev = state.sharedJournal
        cb(state.sharedJournal)
      }
    })
  },
  diff: (prev, next) => structuralDiff(prev, next),
  applyDelta: (delta) => {
    const next = applyDelta(useGameStore.getState().sharedJournal, delta)
    useGameStore.setState({ sharedJournal: next })
  }
}

registerShard(sharedJournalShard)

export type { SharedJournalShardValue }
export { sharedJournalShard }
