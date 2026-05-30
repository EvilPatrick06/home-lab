import { useGameStore } from '../../../stores/use-game-store'
import type { InitiativeState } from '../../../types/game-state'
import { applyDelta, structuralDiff } from '../diff'
import { registerShard } from '../registry'
import type { Shard } from '../shard'

/**
 * Phase 31f — initiative migrated onto the shard pipeline.
 *
 * Initiative is shared turn-order (no DM-only data), so it carries no
 * permission filter. The host's combat state now syncs to clients via the
 * shard broadcaster/applier (`sync:delta`) instead of the bespoke
 * `dm:initiative-delta` per-change broadcast that used to live in
 * `startGameSync` (~L151-173). Behavior is preserved: the host still ships
 * turn advances / reorders / round bumps / mode flips and clients still apply
 * them. (The `dm:initiative-delta` message type + its client handler remain
 * for 31l back-compat; the host just no longer originates that broadcast.)
 *
 * The synced value bundles the three fields the old block watched together:
 * `initiative` (the `{ entries, currentIndex, round } | null` combat record),
 * the top-level `round` counter (the campaign-wide round, distinct from
 * `initiative.round`), and `turnMode` (`'initiative' | 'free'`). Bundling them
 * in one shard preserves the old "any of these three changed → broadcast"
 * coupling so a single combat mutation that touches more than one field still
 * replicates atomically.
 *
 * Round-trip: `structuralDiff` produces a per-key object patch over the bundle
 * — `entries` (an array of `{ id }` records) gets an order-exact array patch,
 * `round`/`currentIndex`/`turnMode` get primitive replaces, and a non-null ⇄
 * `null` initiative transition falls through to a whole-value replace. Apply
 * writes all three keys back via `setState`, mirroring conditions-shard (no
 * single setter sets all three).
 *
 * Like conditions-shard, the game store is a plain zustand store (no
 * `subscribeWithSelector`), so `onChange` subscribes to the whole store and
 * fires only when one of the three watched references/values changes —
 * mirroring how `startGameSync` watched them.
 */
interface InitiativeShardValue {
  initiative: InitiativeState | null
  round: number
  turnMode: 'initiative' | 'free'
}

function readValue(): InitiativeShardValue {
  const s = useGameStore.getState()
  return { initiative: s.initiative, round: s.round, turnMode: s.turnMode }
}

const initiativeShard: Shard<InitiativeShardValue> = {
  name: 'initiative',
  read: readValue,
  onChange: (cb) => {
    let prevInitiative = useGameStore.getState().initiative
    let prevRound = useGameStore.getState().round
    let prevTurnMode = useGameStore.getState().turnMode
    return useGameStore.subscribe((state) => {
      if (state.initiative !== prevInitiative || state.round !== prevRound || state.turnMode !== prevTurnMode) {
        prevInitiative = state.initiative
        prevRound = state.round
        prevTurnMode = state.turnMode
        cb({ initiative: state.initiative, round: state.round, turnMode: state.turnMode })
      }
    })
  },
  diff: (prev, next) => structuralDiff(prev, next),
  applyDelta: (delta) => {
    const next = applyDelta(readValue(), delta)
    useGameStore.setState({
      initiative: next.initiative,
      round: next.round,
      turnMode: next.turnMode
    })
  }
}

registerShard(initiativeShard)

export { initiativeShard }
export type { InitiativeShardValue }
