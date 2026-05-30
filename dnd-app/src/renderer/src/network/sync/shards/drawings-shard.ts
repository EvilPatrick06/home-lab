import { hasPermission } from '../../../services/permissions/has-permission'
import { useNetworkStore } from '../../../stores/network-store'
import { useCampaignStore } from '../../../stores/use-campaign-store'
import { useGameStore } from '../../../stores/use-game-store'
import type { DrawingData } from '../../../types/map'
import { getConnectedPeers } from '../../host-manager'
import { applyDelta, structuralDiff } from '../diff'
import { registerShard } from '../registry'
import type { Shard } from '../shard'

/**
 * Phase 31i — map drawings/annotations migrated onto the shard pipeline.
 *
 * FILTERED — DM-only drawings are stripped per recipient (hardens the latent
 * wire-leak the 31i migration logged as out-of-scope debt). `DrawingData`
 * carries an OPTIONAL `visibleToPlayers` flag (undefined ⇒ visible); the
 * DM-vs-player split was previously enforced ONLY at the PixiJS render surface
 * (`drawDrawings` skips `!isHost && drawing.visibleToPlayers === false`), so the
 * full DM-only set still reached every client over the network. This shard now
 * mirrors that render-surface predicate on the wire via `permissionFilter`:
 * DM/CoDM (host/co-DM fast path) and holders of `draw_dm_only` see the full set;
 * everyone else — including unknown recipients (deny-by-default) — only receives
 * drawings whose `visibleToPlayers !== false` (so legacy/undefined drawings stay
 * visible, exactly matching the render surface). (Mirrors `fog-shard`/
 * `tokens-shard`; `draw_dm_only` is the exact semantic gate — whoever may author
 * DM-only drawings may see them.)
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

/**
 * SECURITY-CRITICAL drawing-visibility gate (mirrors `recipientSeesFullFog`).
 *
 * A recipient gets the full drawing set only when it can see DM-only drawings —
 * the `isHost`/`isCoDM` fast path plus the `draw_dm_only` permission (whoever may
 * author DM-only drawings may see them). Everyone else — including an unresolved
 * recipient (deny-by-default) — gets the DM-only drawings stripped.
 */
function recipientSeesDmDrawings(recipientClientId: string): boolean {
  const peers = getConnectedPeers()
  const peer = peers.find((p) => p.clientId === recipientClientId)
  if (!peer) return false
  if (peer.isHost || peer.isCoDM === true) return true
  const net = useNetworkStore.getState()
  const campaign = useCampaignStore.getState().campaigns.find((c) => c.id === net.campaignId) ?? null
  return hasPermission(peer, 'draw_dm_only', campaign)
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
  },
  permissionFilter: (value, recipientClientId) => {
    if (recipientSeesDmDrawings(recipientClientId)) return value
    const reduced: DrawingsShardValue = {}
    for (const [mapId, drawings] of Object.entries(value)) {
      // visibleToPlayers is OPTIONAL (undefined ⇒ visible); drop ONLY explicit
      // `=== false`, mirroring the render surface. `!d.visibleToPlayers` would
      // wrongly hide legacy/default drawings players currently see.
      reduced[mapId] = drawings.filter((d) => d.visibleToPlayers !== false)
    }
    return reduced
  }
}

registerShard(drawingsShard)

export type { DrawingsShardValue }
export { drawingsShard }
