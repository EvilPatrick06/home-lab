import { useGameStore } from '../../../stores/use-game-store'
import type { EntityCondition } from '../../../types/game-state'
import { applyDelta, structuralDiff } from '../diff'
import { registerShard } from '../registry'
import type { Shard } from '../shard'

/**
 * Phase 31e — first feature migrated onto the shard pipeline.
 *
 * The host's `conditions` array (useGameStore) now syncs to clients via the
 * shard broadcaster/applier instead of the bespoke `dm:condition-delta`
 * per-change broadcast that used to live in `startGameSync`. Behavior is
 * preserved: the host still ships condition changes (now as `sync:delta`) and
 * clients still apply them.
 *
 * The game store is a plain zustand store (no `subscribeWithSelector`), so
 * `onChange` subscribes to the whole store and fires the callback only when the
 * `conditions` reference changes — mirroring how `startGameSync` watched it.
 *
 * `applyDelta` writes back with `setState({ conditions })`, which is exactly how
 * the existing client condition handler (`handleConditionDelta`) seeds the array
 * — no dedicated `setConditions` setter exists on the conditions slice.
 */
const conditionsShard: Shard<EntityCondition[]> = {
  name: 'conditions',
  read: () => useGameStore.getState().conditions,
  onChange: (cb) => {
    let prev = useGameStore.getState().conditions
    return useGameStore.subscribe((state) => {
      if (state.conditions !== prev) {
        prev = state.conditions
        cb(state.conditions)
      }
    })
  },
  diff: (prev, next) => structuralDiff(prev, next),
  applyDelta: (delta) => {
    const next = applyDelta(useGameStore.getState().conditions, delta)
    useGameStore.setState({ conditions: next })
  }
}

registerShard(conditionsShard)

export { conditionsShard }
