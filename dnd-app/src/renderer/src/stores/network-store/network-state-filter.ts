// --- Per-peer state filtering ---
//
// The host's authoritative game state contains DM-only data (hidden tokens,
// unrevealed traps, DM-only handouts, sidebar entries with `notes` or
// `visibleToPlayers: false`). Without filtering, every peer that joins
// receives this data and can read it via DevTools or a modified client.
//
// `filterGameStateForRole` strips DM-only fields when the role is not the DM.
// Role bucketing (who counts as DM) happens upstream in `network-store/index.ts`
// `setGameStateProvider` (Phase 29e): the literal host, co-DMs (`isCoDM`), and peers
// with both view_hidden_tokens + view_dm_only_stats receive the unfiltered 'host'
// bucket. This module only implements the per-role strip for the non-DM bucket.
//
// This lives in a leaf module (imports only network state TYPES, no store
// singleton) so the sync shards can reuse `filterGameStateForRole` without
// importing `network-store/index.ts` — which would form a shard ↔ network-store
// import cycle. `network-store/index.ts` re-exports `filterGameStateForRole`
// from here to preserve its public surface.

import type { NetworkGameState, NetworkMap } from '../../network/state-types'

interface MaybeHiddenToken {
  id?: string
  isHidden?: boolean
}

interface MaybeRevealedTrap {
  revealed?: boolean
}

interface SidebarEntryShape {
  visibleToPlayers?: boolean
  notes?: string
  // DM-only stat / lookup pointers — stripped on the player wire
  monsterStatBlockId?: unknown
  linkedMonsterId?: unknown
  statBlock?: unknown
}

interface HandoutShape {
  visibility?: 'all' | 'dm-only'
  pages?: Array<{ dmOnly?: boolean }>
}

interface InitiativeEntryShape {
  entityId?: string
}

interface ConditionEntryShape {
  entityId?: string
}

interface CustomEffectShape {
  targetEntityId?: string
}

function filterMapForPlayer(m: NetworkMap): NetworkMap {
  const tokens = Array.isArray(m.tokens)
    ? (m.tokens as MaybeHiddenToken[]).filter((t) => t?.isHidden !== true)
    : m.tokens
  // PHASE-34 34E — strip DM-only pins (default visible; drop only explicit false) at join time too,
  // so AI-generated enemy-spawn / secret-door pins never reach a joining player.
  const mp = m as NetworkMap & { pins?: Array<{ visibleToPlayers?: boolean }> }
  const pins = Array.isArray(mp.pins) ? mp.pins.filter((p) => p.visibleToPlayers !== false) : mp.pins
  return { ...m, tokens, ...(pins !== undefined ? { pins } : {}) }
}

/**
 * Collect every hidden token's `id` across all maps. Used to filter
 * entity-keyed collateral state (initiative, turnStates, conditions, etc.)
 * so non-DM peers don't see references to tokens they can't see.
 */
function collectHiddenTokenIds(maps: NetworkMap[]): Set<string> {
  const hidden = new Set<string>()
  for (const m of maps) {
    if (!Array.isArray(m.tokens)) continue
    for (const t of m.tokens as MaybeHiddenToken[]) {
      if (t && t.isHidden === true && typeof t.id === 'string') {
        hidden.add(t.id)
      }
    }
  }
  return hidden
}

function filterSidebarForPlayer(entries: unknown[]): unknown[] {
  if (!Array.isArray(entries)) return entries
  return (entries as SidebarEntryShape[])
    .filter((e) => e?.visibleToPlayers !== false)
    .map((e) => {
      if (!e || typeof e !== 'object') return e
      // Strip DM-only fields: notes, monster stat-block links, full embedded statBlock
      const { notes: _notes, monsterStatBlockId: _msbId, linkedMonsterId: _lmId, statBlock: _sb, ...rest } = e
      return rest
    })
}

function filterHandoutsForPlayer(handouts: unknown[]): unknown[] {
  if (!Array.isArray(handouts)) return handouts
  return (handouts as HandoutShape[])
    .filter((h) => h?.visibility !== 'dm-only')
    .map((h) => {
      if (!h || typeof h !== 'object' || !Array.isArray(h.pages)) return h
      // Drop DM-only pages within a player-visible handout
      return { ...h, pages: h.pages.filter((p) => p?.dmOnly !== true) }
    })
}

function filterTrapsForPlayer(traps: unknown[] | undefined): unknown[] | undefined {
  if (!Array.isArray(traps)) return traps
  return (traps as MaybeRevealedTrap[]).filter((t) => !t || t.revealed === true)
}

/**
 * Strip DM-only data from a NetworkGameState payload when the recipient is not the DM.
 * Pass-through for the DM (`role === 'host'`).
 *
 * Stripped on the non-DM wire:
 * - `maps[i].tokens` where `isHidden === true`
 * - `placedTraps` where `revealed !== true`
 * - `allies` / `enemies` / `places` where `visibleToPlayers === false` AND each entry's
 *   `notes`, `monsterStatBlockId`, `linkedMonsterId`, `statBlock` (DM-only stat refs)
 * - `handouts` where `visibility === 'dm-only'` AND `pages[].dmOnly === true` within visible handouts
 * - `initiative.entries` whose `entityId` belongs to a hidden token
 * - `turnStates` keys that match a hidden token id
 * - `conditions` whose `entityId` matches a hidden token id
 * - `customEffects` whose `targetEntityId` matches a hidden token id
 * - `marchingOrder` ids that match a hidden token id
 *
 * Not stripped (intentional — design):
 * - `fogOfWar` (the visible-to-players reveal mask is by definition player-visible)
 * - `combatLog` / `sessionLog` (player-readable game journal)
 * - `partyVisionCells` (computed from player tokens — the input)
 */
export function filterGameStateForRole(
  state: NetworkGameState,
  role: 'host' | 'player' | 'spectator'
): NetworkGameState {
  // Host (and Co-DM at the same trust level) sees the unfiltered state.
  // Player + Spectator share the same view: DM-only data stripped, hidden
  // tokens omitted, traps/handouts gated by isRevealed/visibility flags.
  // Spectator-specific *action* gating happens in host-handlers (drop token
  // moves, dice rolls, etc.) — the view itself doesn't differ from a player.
  if (role === 'host') return state

  const hiddenIds = collectHiddenTokenIds(state.maps)

  let initiative: unknown = state.initiative
  if (initiative && typeof initiative === 'object' && Array.isArray((initiative as { entries?: unknown }).entries)) {
    const init = initiative as { entries: InitiativeEntryShape[] }
    initiative = {
      ...init,
      entries: init.entries.filter((e) => !e?.entityId || !hiddenIds.has(e.entityId))
    }
  }

  let turnStates = state.turnStates
  if (turnStates && typeof turnStates === 'object' && hiddenIds.size > 0) {
    const filtered: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(turnStates)) {
      if (!hiddenIds.has(k)) filtered[k] = v
    }
    turnStates = filtered
  }

  const conditions = Array.isArray(state.conditions)
    ? (state.conditions as ConditionEntryShape[]).filter((c) => !c?.entityId || !hiddenIds.has(c.entityId))
    : state.conditions

  const customEffects = Array.isArray(state.customEffects)
    ? (state.customEffects as CustomEffectShape[]).filter((e) => !e?.targetEntityId || !hiddenIds.has(e.targetEntityId))
    : state.customEffects

  const marchingOrder = Array.isArray(state.marchingOrder)
    ? state.marchingOrder.filter((id) => typeof id !== 'string' || !hiddenIds.has(id))
    : state.marchingOrder

  return {
    ...state,
    maps: state.maps.map(filterMapForPlayer),
    allies: filterSidebarForPlayer(state.allies),
    enemies: filterSidebarForPlayer(state.enemies),
    places: filterSidebarForPlayer(state.places),
    handouts: filterHandoutsForPlayer(state.handouts),
    placedTraps: filterTrapsForPlayer(state.placedTraps),
    initiative,
    turnStates,
    conditions,
    customEffects,
    marchingOrder
  }
}
