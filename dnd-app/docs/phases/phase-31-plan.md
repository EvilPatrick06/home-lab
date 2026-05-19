# Phase 31 — Live-state sync overhaul

> Replace the current per-feature broadcast model ("each piece of state has its own broadcaster + its own receiver") with a unified shard-based sync. After this phase, adding sync for a new field is "register it in the shard schema" — no new broadcaster, no new receiver, no new bridge hook.
>
> Renumbered from "Phase C" in conversation planning. Depends on **Phase 17** (Player-as-Host rewrite) landing first.

---

## Context

The dnd-app sync model has been growing organically since the initial multiplayer phases. Every synced piece of state has its own ad-hoc pair of broadcaster (somewhere in `game-sync.ts` or inline at the action site) and receiver (a bridge hook or a switch case in `client-handlers.ts`). That's produced three recurring failure modes:

1. **Forgot the broadcaster.** State changes locally, never goes on the wire. Examples shipped in the recent Phase 14 / 15 / 16 / 17 / 18 / 19 work (in the OLD numbering — Windows 11 QA bundle and follow-ups): map switch not syncing (fixed v2.1.38 17x), DM drawings dropping (fixed v2.1.38 17y), shared journals not syncing (fixed v2.1.38 17ad).
2. **Forgot the receiver.** Broadcaster fires, message hits the wire, nothing listens. Most recent example: in-game chat one-way bug (fixed `b2bb1e0` after v2.1.39) — `useChatBridge` was scoped to `LobbyPage` and tore down on `/lobby → /game` navigation, so messages broadcast fine but no receiver was mounted.
3. **Forgot the dep.** Zustand subscriber's reference-equality check misses a mutation that didn't create a fresh array. Drawings dropped intermittently because rapid additions sometimes collapsed into one subscription tick.

Each fix patched one of these three holes, but the pattern keeps producing new ones. The structural problem is that **synced state is fragmented across N independent broadcaster/receiver pairs.** Each pair is an opportunity to forget one half of the loop.

Goal: one broadcaster (per shard, registered once), one receiver (per shard, always mounted), one diff engine, one transport message type for state changes. Adding a new synced piece of state becomes "add a shard descriptor." The three failure modes become structurally impossible.

This phase is invisible to users — the same gameplay works the same way. It pays off in (a) future bug prevention and (b) shrinking Phase 19 (Cloud host) by ~30% because the Pi only needs to implement one sync protocol instead of porting 30 feature-specific message handlers.

---

## Sub-phase summary

| # | Sub-phase | Scope |
|---|-----------|-------|
| 18a | Shard interface + registry | Define `Shard<T>` interface; collect shards in a registry; document the schema |
| 18b | Diff engine | Generic structural diff for plain JSON; produces minimal deltas; reversible apply |
| 18c | Host-side shard broadcaster | One subscriber per shard inside `GameAuthority`; emits `state:delta` messages |
| 18d | Client-side shard applier | Always-mounted at App level (NOT scoped to any page); routes deltas to shards |
| 18e | Migrate chat shard | First feature ported. Drop `useChatBridge` + handler switch cases |
| 18f | Migrate map shards | activeMapId, tokens, drawings, fog, pins, walls, regions per-map |
| 18g | Migrate initiative + conditions + custom effects | Drop `dm:initiative-delta` + `dm:condition-delta` + custom-effect broadcasters |
| 18h | Migrate journals + sidebar entries + handouts | Drop the corresponding broadcasters |
| 18i | Migrate remaining state (player presence, color preview, character updates, party vision, weather, calendar, ambient light, shop) | Each becomes a shard or stays an event (whispers / dice rolls / AI prompts stay as events) |
| 18j | Permission-aware shard filtering | Each shard declares which permission keys gate which fields; per-peer filter at broadcast time |
| 18k | Sequence + replay support | Monotonic delta sequence numbers; bounded server-side log; client requests "since N" on reconnect |
| 18l | Drop the now-unused bridges + switch cases | Big subtractive commit |
| 18m | Verify-don't-assume sweep | 2-peer end-to-end test for every shard, every page, every reconnect scenario |
| 18n | Add-a-shard documentation | One-page guide so future features don't slip back into the old pattern |

14 sub-phases. Each ends with the 4-gate suite. One release: **v5.0.0** (major bump — internal protocol change, semantic version reflects "stop calling the old API directly").

---

## Sub-phase details

### 18a — Shard interface + registry

**Files (new):**
- `src/renderer/src/network/sync/shard.ts` — interface:
  ```typescript
  interface Shard<TValue> {
    name: string                    // e.g. 'chat', 'maps', 'initiative'
    source: () => TValue            // current value extractor (reads from Zustand store, etc.)
    onChange: (cb: () => void) => () => void  // subscribe to source changes
    diff: (prev: TValue, next: TValue) => Delta<TValue> | null  // structural diff (uses 18b)
    applyDelta: (delta: Delta<TValue>) => void  // mutates target store
    permissionFilter?: (delta: Delta<TValue>, peer: PeerInfo, campaign: Campaign) => Delta<TValue>
  }

  interface Delta<TValue> {
    kind: 'replace' | 'patch'
    payload: unknown  // shard-specific
    sequence: number  // assigned at broadcast time
  }
  ```
- `src/renderer/src/network/sync/registry.ts` — `registerShard(shard)` + `getShards() → Shard[]` + `findShard(name) → Shard | undefined`. Module-level array initialized at import time.

**Acceptance:**
- Interface compiles and is reachable from the renderer.
- No shards registered yet — that happens in 18e onwards.

---

### 18b — Diff engine

**Files (new):**
- `src/renderer/src/network/sync/diff.ts` — exports:
  - `structuralDiff<T>(prev: T, next: T) → Delta<T> | null` — returns `null` when prev and next are deep-equal. Otherwise produces a minimal delta:
    - Primitives → `{ kind: 'replace', payload: next }`.
    - Arrays of records with `id` field → `{ kind: 'patch', payload: { added: [...], removed: [...], updated: [...] } }`.
    - Plain objects → recursive descent producing per-field deltas.
  - `applyDelta<T>(target: T, delta: Delta<T>) → T` — pure function returning the new value.

The diff format is designed to be:
- **Minimal:** unchanged fields are NOT in the delta.
- **Reversible:** `applyDelta(prev, structuralDiff(prev, next))` produces `next`.
- **Self-describing:** receiver doesn't need to know what kind of state it's applying — the delta says.

**Acceptance:**
- Unit tests cover primitives, arrays-of-records, nested objects, edge cases (empty array → populated, undefined ↔ value, etc.).
- Round-trip property test: `applyDelta(prev, structuralDiff(prev, next)) === next` for random JSON-shaped inputs.

---

### 18c — Host-side shard broadcaster

**Files (modify):**
- `src/renderer/src/network/authority/game-authority.ts` (from Phase 17) — gain a `startShardBroadcasting()` method that:
  1. Iterates `getShards()`.
  2. For each shard, snapshots its `source()` and stores as `lastBroadcast[shard.name]`.
  3. Subscribes via `shard.onChange(...)` so the broadcaster fires on any source mutation.
  4. On change: new snapshot → `shard.diff(lastBroadcast, new)` → if non-null, emit `state:delta` message per-peer (applying `permissionFilter` if defined).
  5. Updates `lastBroadcast`.
- New message type `state:delta` registered in `network/message-types.ts` + `network/schemas.ts`.

**Acceptance:**
- Broadcaster runs but no shards are registered yet, so nothing actually broadcasts. Boilerplate is wired and tested.

---

### 18d — Client-side shard applier

**Files (new):**
- `src/renderer/src/network/sync/applier.ts` — `startShardApplier(transport: TransportAdapter)`:
  1. Subscribes to `transport.onMessage` for `state:delta` messages.
  2. Routes to `findShard(msg.payload.shardName).applyDelta(msg.payload.delta)`.
  3. Tracks `lastAppliedSequence[shardName]` for the replay path (18k).

**Files (modify):**
- `src/renderer/src/App.tsx` (or root component) — mount the applier ONCE at app level via a hook. It survives page navigation. The bug class from the in-game chat hotfix (`b2bb1e0`) becomes structurally impossible.

**Acceptance:**
- Applier mounted at app root. Subscribes to transport. Routes deltas. No shards registered yet, so no actual deltas to route.

---

### 18e — Migrate chat shard

First real migration. Establishes the pattern.

**Files (new):**
- `src/renderer/src/network/sync/shards/chat.ts` — defines the chat shard:
  - `source` reads `useLobbyStore.getState().chatMessages`.
  - `onChange` subscribes to `useLobbyStore`.
  - `diff` is the array-of-records diff (each chat message has an `id`).
  - `applyDelta` calls `useLobbyStore.getState().addChatMessage` for each added entry. Removed entries are ignored (chat is append-only; we don't currently delete messages over the wire — that's a separate clear-chat feature).
  - `permissionFilter` strips whispers that aren't addressed to this peer.

**Files (modify / delete):**
- `src/renderer/src/pages/lobby/use-lobby-bridges.ts` — `useChatBridge` becomes a deprecation shim that just logs a warning if called (no behavior; the shard applier handles incoming chat now). Call site removed in 18l.
- `src/renderer/src/components/game/GameLayout.tsx` — `useChatBridge` call from `b2bb1e0` removed.
- `src/renderer/src/stores/network-store/host-handlers.ts` — `case 'chat:message'` block removed (chat changes flow through the shard system now).
- `src/renderer/src/stores/network-store/client-handlers.ts` — `case 'chat:message'` block removed.

**Acceptance:**
- Send chat in lobby → all peers see it.
- Send chat in /game/ → all peers see it (the bug `b2bb1e0` patched is now structurally impossible).
- Navigate lobby ↔ game mid-session → in-flight messages keep arriving on both ends.

---

### 18f — Migrate map shards

Per-map shards: activeMapId (scalar), maps[].tokens, maps[].drawings, maps[].fogOfWar, maps[].pins, maps[].wallSegments, maps[].regions.

**Files (new):**
- `src/renderer/src/network/sync/shards/active-map.ts`
- `src/renderer/src/network/sync/shards/map-tokens.ts`
- `src/renderer/src/network/sync/shards/map-drawings.ts`
- `src/renderer/src/network/sync/shards/map-fog.ts`
- `src/renderer/src/network/sync/shards/map-pins.ts`
- `src/renderer/src/network/sync/shards/map-walls.ts`
- `src/renderer/src/network/sync/shards/map-regions.ts`

Each shard reads from `useGameStore.maps.find(m => m.id === activeMapId)?.X`.

**Files (modify / delete):**
- Drop the `dm:map-change`, `dm:drawing-add`, `dm:drawing-remove`, `dm:drawings-clear`, `dm:fog-reveal`, `dm:region-add`, `dm:region-update`, `dm:region-remove` broadcasters in `network/game-sync.ts` and the corresponding handler cases in client-handlers.
- The Phase 17x and Phase 17y belt-and-suspenders direct broadcasts also get cleaned up (no longer needed — the subscriber-based path is reliable now because shard diffs use structural-equality on plain values, not reference-equality on arrays).

**Acceptance:**
- DM switches map → all clients render the new map.
- DM draws 20 lines rapidly → all clients see all 20 (Phase 17y's "rapid successive drawings dropped" bug is structurally fixed).
- All map-tied features work as before.

---

### 18g — Migrate initiative + conditions + custom effects

**Files (new):**
- `src/renderer/src/network/sync/shards/initiative.ts`
- `src/renderer/src/network/sync/shards/conditions.ts`
- `src/renderer/src/network/sync/shards/custom-effects.ts`

**Files (modify / delete):**
- Drop `dm:initiative-delta`, `dm:condition-delta` broadcasters and handlers.

**Acceptance:**
- Initiative add/advance/remove syncs to all peers.
- Conditions apply/remove sync.
- Custom effects sync.

---

### 18h — Migrate journals + sidebar entries + handouts

**Files (new):**
- `src/renderer/src/network/sync/shards/shared-journal.ts`
- `src/renderer/src/network/sync/shards/sidebar-allies.ts`
- `src/renderer/src/network/sync/shards/sidebar-enemies.ts`
- `src/renderer/src/network/sync/shards/sidebar-places.ts`
- `src/renderer/src/network/sync/shards/handouts.ts`

**Files (modify / delete):**
- Drop the corresponding broadcasters. Phase 17ad's explicit sharedJournal watcher in `game-sync.ts` is no longer needed.

**Acceptance:**
- Journals, allies, enemies, places, handouts all sync.

---

### 18i — Migrate remaining state

Everything else that's currently game-synced:

- Player presence + role assignment (lobby store `players` array — but with care to exclude transient fields like `latencyMs`)
- Color preview (Phase 17d's `previewColor` field)
- Character updates (remoteCharacters)
- Party vision cells
- Weather override
- Calendar / in-game time
- Ambient light
- Shop inventory
- Saved weather presets

**What stays as one-shot events (NOT shards):**
- Whispers (request/response, not state)
- Dice rolls (events, written into the chat shard which IS synced; the roll trigger itself is an event)
- AI prompts / completions
- Toast notifications
- Reaction prompts (counterspell / shield / OA)

These remain bespoke message types because they're not "state that two peers should agree on" — they're "an event happening once."

**Acceptance:**
- Every former state-update path is now a shard.
- One-shot events still work as before (no migration; they're orthogonal).

---

### 18j — Permission-aware shard filtering

**Files (modify):**
- Each shard's `permissionFilter` (where applicable) reads Phase 16 permissions to strip hidden / DM-only fields per peer. Examples:
  - `map-tokens` shard: tokens with `isHidden === true` get filtered out for peers lacking `view_hidden_tokens`.
  - `shared-journal` shard: private entries authored by other peers get filtered for peers lacking `view_dm_journal_entries`.
  - `handouts` shard: handouts with `visibility: 'dm-only'` filter for peers lacking that view permission.
- Existing `filterGameStateForRole` in `network-store/index.ts` becomes a deprecated shim that the broadcaster no longer calls. Removed in 18l.

**Acceptance:**
- DM hides a token → players see the token disappear (Phase 17 had this working; now the same behavior comes from the shard filter, not from the bespoke filter function).
- DM unhides → players see it appear with full data.
- CoDM (built-in role) sees everything the DM sees, same as Phase 17b set up.

---

### 18k — Sequence + replay support

**Files (modify):**
- `GameAuthority` keeps a bounded log of recent deltas per shard (say, last 500 per shard, or 30 seconds — whichever is greater).
- New message type `state:resync-request` (client → host) with `{ lastSequenceByShard: Record<string, number> }`.
- Host responds with either a `state:delta-replay` (if all client cursors are within the log window) or a `state:snapshot-full` (if any cursor is outside — full re-bootstrap for that shard).

**Acceptance:**
- Client disconnects briefly, reconnects → server replays missed deltas, client catches up without seeing a full state-flash.
- Client disconnects for an hour, reconnects → server detects the cursor is out of window, ships a full snapshot for affected shards.

---

### 18l — Drop the now-unused bridges + switch cases

Subtractive commit. Big readability win.

**Files (delete or strip):**
- `src/renderer/src/pages/lobby/use-lobby-bridges.ts` — `useChatBridge`, `useCharacterUpdateBridge`, `useModerationBridge`, `useChatTimeoutBridge` all removed (their behavior is now in shards). `usePeerSync` stays — peer presence is its own shard but the React side may still need a hook to map shard updates into the lobby store's `players` array.
- `src/renderer/src/stores/network-store/client-handlers.ts` — strip every `case 'dm:foo':` block that's been replaced by shard sync. Keep one-shot event cases (whispers, dice, AI, reactions).
- `src/renderer/src/stores/network-store/host-handlers.ts` — same.
- `src/renderer/src/network/game-sync.ts` — most of the file deleted. Only one-shot event broadcasts remain.
- `filterGameStateForRole` and `transformUpdatePayloadForPeer` in `network-store/index.ts` — deleted (shard `permissionFilter` replaces them).

**Acceptance:**
- `git diff --stat` shows a large net deletion.
- All tests still pass.

---

### 18m — Verify-don't-assume sweep

Each migrated feature gets end-to-end tested with at least 2 peers:

- Send chat in lobby + game + cross-page navigation.
- DM draws rapidly; observer count > 1; all see all drawings.
- DM switches map; rapid switches; everyone follows.
- Initiative add / advance / remove; conditions; custom effects.
- Shared journal entries from different peers.
- Sidebar entries add/remove.
- DM disconnect → reconnect → state catches up via replay.
- DM transfers host (Phase 17 feature) → all shards continue syncing through the new host.

**Acceptance:**
- Manual test plan documented. Each item verified pass.

---

### 18n — Add-a-shard documentation

**Files (new):**
- `src/renderer/src/network/sync/README.md` — one-page guide:
  1. What a shard is.
  2. Anatomy of a `Shard<T>` descriptor.
  3. How to register one.
  4. How to write a `permissionFilter`.
  5. When to use a shard vs. a one-shot event.
  6. Common pitfalls (e.g., don't reference Zustand state in `diff` — use the passed snapshots).

**Acceptance:**
- README is committed. Anyone adding a synced feature can follow it without asking.

---

## Cross-cutting decisions

- **Shards run inside `GameAuthority`** (from Phase 17). The authority owns the state, runs the diffs, emits the deltas.
- **Diff is structural, not reference-equality.** This eliminates the Phase 17y class of bug where rapid mutations collapsed into one subscription tick.
- **Permission filtering is per-shard, not global.** Reasoning about "what's hidden for which peer" lives next to the data it filters.
- **One-shot events stay as one-shot events.** Whispers / dice / AI prompts are not state; they're events. They keep dedicated message types.
- **Replay is bounded.** Server keeps last N deltas per shard. Beyond N → full snapshot. Same pattern as Phase 29h reconnect-resync, generalized.

---

## Critical files (multi-touch hotspots)

- `src/renderer/src/network/sync/shard.ts` *(new — interface)*
- `src/renderer/src/network/sync/registry.ts` *(new)*
- `src/renderer/src/network/sync/diff.ts` *(new)*
- `src/renderer/src/network/sync/applier.ts` *(new)*
- `src/renderer/src/network/sync/shards/*.ts` *(new — ~20 files)*
- `src/renderer/src/network/sync/README.md` *(new)*
- `src/renderer/src/network/authority/game-authority.ts` — gains shard broadcasting
- `src/renderer/src/App.tsx` — mounts the applier at root
- Big deletions: `game-sync.ts`, much of `host-handlers.ts` / `client-handlers.ts`, `use-lobby-bridges.ts`

---

## Commit cadence

```
18a — feat(sync): Shard interface + registry
18b — feat(sync): structural diff engine
18c — feat(sync): host-side shard broadcaster inside GameAuthority
18d — feat(sync): client-side shard applier mounted at App root
18e — refactor(sync): migrate chat to shard model
18f — refactor(sync): migrate map shards (active-map / tokens / drawings / fog / pins / walls / regions)
18g — refactor(sync): migrate initiative + conditions + custom effects shards
18h — refactor(sync): migrate journals + sidebar entries + handouts shards
18i — refactor(sync): migrate remaining state (presence, color, characters, vision, weather, calendar, ambient, shop)
18j — feat(sync): permission-aware filter per shard (replaces filterGameStateForRole)
18k — feat(sync): sequence numbers + bounded replay log + resync protocol
18l — chore(sync): drop unused bridges + handler switch cases
18m — test(sync): end-to-end verify-don't-assume sweep across all shards
18n — docs(sync): add-a-shard guide
```

One release: **v5.0.0** after 18n. Major version bump reflects the protocol overhaul, even though user-visible behavior is unchanged.

---

## Estimated scope

8–12 working sessions. Two factors mitigate the apparent size:

1. **Each migration sub-phase is small.** A typical shard is ~50 lines of code. Most of the work is verifying the migrated behavior matches the pre-migration behavior.
2. **The deletions in 18l are large.** Total commit count is high but per-commit complexity is low.

The hardest sub-phases are 18b (diff engine — has to be correct for every JSON shape) and 18m (verify-don't-assume — has to be thorough).

---

## Dependencies

- **Requires Phase 17.** Shards live inside `GameAuthority`. The TransportAdapter abstraction is what the applier subscribes to.
- **Blocks Phase 19** (Cloud host). Phase 19's Pi-side implementation only needs to implement the shard protocol — not 30 feature-specific message handlers.

---

## Why this isn't optional before Phase 19

Phase 19 builds a Pi-side `GameAuthority` implementation. If we skip Phase 18 and try to port the current scattered broadcaster code to Pi as-is:

- Pi has to implement 30+ feature-specific message handlers in Python.
- Every future feature requires editing both TypeScript and Python.
- The "forgot the broadcaster / forgot the receiver" bug class follows us to the Pi.

Doing Phase 18 first means Phase 19's Pi-side authority implements ONE protocol (shard deltas) and inherits all the future-feature scalability for free. Phase 18 shrinks Phase 19 by an estimated 30–40%.

---

## Plans superseded or modified by Phase 31

| Plan | Item | Disposition |
|------|------|-------------|
| Phase 16 (Sub-Phase B — Map Pins constraint) | "Pin CRUD broadcast via `dm:map-update`" | Pins become the `map-pins` shard; explicit broadcast call disappears. |
| Phase 23 (Sub-Phase C — S3 Step 5) | `dm:character-update` handler | Message type ceases to exist; character state propagates through the character shard. Conflict-resolution UI (Sub-Phase D) moves into the shard-applier layer. |
| Phase 24 | level-up character mutations | No explicit broadcaster needed — character shard picks up mutations automatically. |
| Phase 25 (Sub-Phase E / M1) | campaign-scoped homebrew sync | Library/homebrew updates broadcast as a library shard delta; campaign filtering via per-shard `permissionFilter` (requires Phase 29 keys). |
| Phase 26 (Step 5 `smartPlaceTokens`, Step 11 `executeLoadEncounter`) | token broadcast calls | Drop `sendMessage('dm:token-add', ...)` — `map-tokens` shard diff picks up mutations. Wave-trigger "Reinforcements arrive!" stays a one-shot chat-shard message. |
| Phase 26 (encounter object) | encounter state sharing | Encounter becomes its own shard (Sub-Phase 31i — remaining state migration). |
| Phase 27 Sub-Phase D (A4 duplicate handlers) | `use-game-network.ts:114-126` vs `client-handlers.ts:624-650` | Structurally eliminated — single shard applier replaces all per-feature handler pairs. |
| Phase 27 Sub-Phase E (A5 chat command sync) | `/sound ambient` doesn't broadcast | Ambient becomes a shard; chat command mutates the shard. |
| Phase 27 Sub-Phase I (late-joiner ambient) | Ambient missing in late-joiner sync | Absorbed — initial state-bootstrap ships every shard snapshot to joiners. |
| Phase 17 medium network items (NET-21–NET-50) | Many error-handling / validation gaps | Re-scope after Phase 31 — many disappear with the single sync protocol. |
| Phase 15 | per-shard `permissionFilter` | Uses Phase 29 keys; Phase 31 wires the call. |
| Phase 15 | `useLibraryStore` mutation broadcast | Phase 15 introduces a new canonical store. Phase 31 registers a `library` shard so library mutations (homebrew edits, plugin loads, official errata patches) propagate to peers via the standard shard diff path. Without this, Phase 15 has no network propagation for library changes. |
| Phase 23 | `lobbyStore.remoteCharacters` + `dm:character-update` flow | Phase 31's character shard fully absorbs both — `dm:character-update` ceases to exist, `lobbyStore.remoteCharacters` becomes dead code. Phase 23 S3's interim fix (single-canonical-write to `useCharacterStore`) bridges the gap until Phase 31 lands. |
| Phase 36 | Library shard wiring for homebrew sync | Phase 36 routes `upsertHomebrew` writes through Pi via HTTP; Phase 31's library shard handles the in-session live propagation to other connected peers (so they don't have to round-trip through Pi). Phase 36 explicitly hooks `useLibraryStore.upsertHomebrew` to the library shard's broadcast path. |

---

## Open questions to lock before starting

1. **Does any current synced state genuinely need per-peer broadcasting that ISN'T just a permission filter?** Default answer: no — the existing `transformUpdatePayloadForPeer` work (visibility-transition rewrites) is exactly the kind of thing a `permissionFilter` does cleanly. Confirm by surveying the existing transform logic in 18a.
2. **Replay window size.** Last N=500 deltas or last 30 seconds, whichever is larger? Tunable per shard? Default: 500 deltas globally, no per-shard tuning.
3. **Do we need a "snapshot version" concept for migration?** If we add fields to a shard's state later, do replayed deltas need version-aware decoding? Default: out of scope for this phase — shards are versioned by their `name`. Schema changes get new shard names + deprecation of the old one.
