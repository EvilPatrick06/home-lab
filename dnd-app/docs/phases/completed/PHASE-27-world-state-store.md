# PHASE-27 — Durable world-state store (engine owns truth, LLM emits deltas)

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Move durable campaign world state out of the chat transcript and the racy flat-file memory layer into a single, engine-owned, schema-validated per-campaign store: a spatial location graph (named locations with exits, visited flags, party position) that keeps backtracking consistent, per-NPC-per-PC opinion records that persist across encounters and sessions, and an append-style world-fact ledger. The LLM never owns this truth — it emits small, flat, validated **deltas** (new `[DM_ACTIONS]` verbs) that deterministic main-process code clamps, resolves, and applies through one serialized write queue; each turn the context receives only a bounded, relevance-sliced view (current location + exits + NPCs present + their opinions of the party + recent facts) instead of the all-or-nothing memory dump. Along the way the phase fixes the verified concurrency bugs in the existing memory layer (read-modify-write paths that bypass the `mutate()` lock; two competing renderer world-sync writers). The new AI-facing behavior (delta verbs in the prompt, store-driven context block) is **opt-in per campaign and off by default**; the store module, race fixes, and sync consolidation are always-on internal correctness work.

## Dependencies & cross-phase notes

**Prerequisites (from PHASE-INDEX.md):**

- **PHASE-23 (structured-outputs)** — delivers the two-call structured extraction path (`format` = JSON schema, `stream:false`) and the flat small-model schema discipline. PHASE-27's delta verbs are deliberately designed flat (one literal `action`, string targets, one numeric field, few optionals) so they parse reliably through whichever extraction path PHASE-23 left in place (`[DM_ACTIONS]` tag parse and/or the structured second call). No new parser is built here.
- **PHASE-25 (entity-memory-lore)** — delivers entity records (NPC/location/item/faction auto-extraction) and player-editable lore pages. Division of labor: **PHASE-25 owns descriptive/editable knowledge** (who an NPC is, lore text); **PHASE-27 owns mutable mechanical state** (where the party is, which exits exist, what each NPC currently thinks of each PC, established facts). The world store references NPCs by the same slugified-name id convention so PHASE-28 can join the two. If PHASE-25 changed `src/main/ai/memory-manager.ts` or `src/main/ai/context-builder.ts`, re-verify the line citations below before editing (INSTRUCTIONS.md rule 3/22).

**Downstream:** **PHASE-28 (director-quests-oracle)** depends on this phase — quest objectives and the director agent read/write the world store. Keep `world-state-store.ts` exports stable and documented (28 adds quest objects to the same store file under a new key; the `version` field and zod `passthrough`-free strict schema make that an explicit v2 migration there).

**Same-file coordination:**

- `src/main/ipc/ai-handlers.ts` — **PHASE-13** extends `sanitizeCampaignId` to the ten legacy unsanitized AI handlers (incl. `AI_SYNC_WORLD_STATE`, `AI_SET_NPC_FIELDS`, `AI_UPDATE_QUEST_LOG`). PHASE-13 runs before this phase; do NOT re-fix those here, but every **new** handler added in 27D calls `sanitizeCampaignId` from day one.
- `src/renderer/src/hooks/use-game-effects.ts` — PHASE-05 (listener lifecycle) edits the same AI-init effects. 27C only touches the `startAiMemorySync` effect (lines ~203-207 pre-phase-05); re-verify after 05.
- `src/renderer/src/services/game-action-executor.ts` — PHASE-08 (executor batch correctness) rewrites snapshot handling. 27E only appends new dispatch cases; rebase on 08's landed shape.
- `src/main/ai/prompt-sections/dm-actions-schema.ts` — PHASE-11 (prompt schema contract) edits the same file. 27F adds a **separate new file** (`world-state-verbs.ts`) injected via the context, not the system prompt, partly to avoid colliding with 11 and partly to keep `assembleSystemPrompt` synchronous.
- `src/renderer/src/pages/campaign-detail/AiDmCard.tsx` — PHASE-10 fixes the wrong-provider key prefill there. 27G adds a toggle to the same card; 10 lands first.
- `src/main/data/token-budgets.json` — PHASE-01 reconciles budgets against `num_ctx`. 27F deliberately does NOT change this file (the new block lives inside the existing `memory: 2000` budget).
- `src/main/ai/memory-manager.ts` / `context-builder.ts` — PHASE-26 (scene summarization) and PHASE-25 touch adjacent code; both run before 27.

## Verified findings

All verifications run 2026-06-10 against the live tree (worktree `ai-p6-roadmap`, branch `master`). Re-run each command before implementing; line numbers may drift after PHASES 01–26.

### F1 — No engine-owned world state exists; "world state" is five flat JSON files trailing the transcript

The audit's recommendation entry ("Move durable world state out of the transcript into a queryable store — LLM emits deltas, engine owns truth") is a feature gap; the current state it builds on:

`src/main/ai/memory-manager.ts` (651 lines) stores per-campaign AI memory under `userData/campaigns/{campaignId}/ai-context/` as flat JSON files: `world-state.json` (`WorldState`: `currentMapId`, `currentMapName`, `timeOfDay`, `weather`, `currentScene`, `activeTokenPositions`, lines 13-21), `combat-state.json` (lines 23-35), `npcs.json` (`NPCMemory` with a **single global** `attitude: 'friendly'|'neutral'|'hostile'|'unknown'`, lines 37-46), `npc-personalities.json` (`NPCPersonality`, `src/main/ai/types.ts:102-112` — `faction?`, `location?`, `secretMotivation?`, `relationships?`, `conversationLog?`), `world-state-summary.json` (`WorldStateSummary`, `types.ts:115-122` — `currentLocation: string`, `activeQuests: string[]`, `recentEvents: string[]`), `faction-reputation.json` (`FactionReputation`, `types.ts:125-129`), plus `places.json`, `rulings-log.json`, `characters.json`, `campaign-notes.md`, `session-history/`.

Verification:

```bash
cd dnd-app
sed -n '13,46p;80,104p' src/main/ai/memory-manager.ts          # WorldState/NPCMemory/PlaceMemory shapes
sed -n '95,130p' src/main/ai/types.ts                          # NPCPersonality/WorldStateSummary/FactionReputation
```

Context injection is **all-or-nothing**: `MemoryManager.assembleContext()` (`memory-manager.ts:512-638`) concatenates `[WORLD STATE]`, `[WORLD SUMMARY]`, `[FACTION STANDINGS]`, `[DM RULINGS]`, `[COMBAT]`, `[NPCS]` (top 20 by recency), `[NPC PERSONALITIES]` (top 15), `[NPC RELATIONSHIPS]`, `[NPC INTERACTION HISTORY]` (top 5), `[PLACES]`, `[CAMPAIGN NOTES]` — no per-turn relevance slice — and `buildContext` step 7 (`src/main/ai/context-builder.ts:306-319`) trims the whole thing to `TOKEN_BUDGETS.memory` = 2000 (`src/main/data/token-budgets.json`).

```bash
sed -n '512,545p' src/main/ai/memory-manager.ts
sed -n '306,319p' src/main/ai/context-builder.ts
grep '"memory"' src/main/data/token-budgets.json               # → "memory": 2000
```

### F2 — Spatial consistency is impossible today: `places.json` has NO production writer, and `WorldStateSummary.currentLocation` is forever "Unknown"

- `upsertPlace`/`getPlaces` (`memory-manager.ts:231-250`) have **zero callers** outside `memory-manager.ts` itself and its test. There is no IPC channel, no DM action, and no renderer path that records a place — the `[PLACES]` context section is always empty in production. `PlaceMemory` has no exits/connections concept either (lines 80-88: `id,name,type,description,discovered,linkedMapId,firstVisited`).
- `setWorldStateSummary` is only invoked by `updateQuestLog` (`memory-manager.ts:453-485`), which defaults `currentLocation: 'Unknown'` and never updates it; **no other caller exists**, so the `[WORLD SUMMARY] Location:` line shows "Unknown" for the life of every campaign.
- The only spatial data the AI sees is the live map snapshot (token grid coordinates, `src/renderer/src/services/game-actions/state-snapshot.ts:30`, distances at lines 214-227) — narrative locations (towns, taverns, dungeon rooms the party left) evaporate when the map changes.

Verification:

```bash
grep -rn "upsertPlace\|getPlaces" src --include='*.ts' | grep -v test | grep -v 'src/main/ai/memory-manager.ts'   # → empty
grep -rn "setWorldStateSummary\|getWorldStateSummary" src --include='*.ts' | grep -v test | grep -v memory-manager.ts  # → empty
sed -n '453,465p' src/main/ai/memory-manager.ts                # currentLocation: 'Unknown' default
```

### F3 — Per-NPC opinion of individual party members does not exist

NPC sentiment is a single global scalar: `NPCMemory.attitude` (one value per NPC, `memory-manager.ts:41`), written solely from `npc_attitude` stat-changes in the stream-done path (`src/main/ai/ai-service.ts:888-896` → `npcMemoryFromAttitude`, `memory-manager.ts:61-78`), and `NPCConversationLog.attitudeAfter` (also global, `types.ts:95-99`). Nothing records that Ama likes Brovic (+40) but distrusts Tula (-10). `NPCPersonality.relationships` (`addNpcRelationship`, `memory-manager.ts:397-422`) is NPC↔NPC only.

```bash
sed -n '885,900p' src/main/ai/ai-service.ts                    # npc_attitude → upsertNPC, global attitude
grep -n "attitude" src/main/ai/memory-manager.ts | head
```

### F4 — Memory-manager read-modify-write paths bypass the `mutate()` lock (lost updates; duplicate NPC stubs)

The per-file write queue exists (`mutate()`, `memory-manager.ts:162-179`, Phase 17d/NET-11) but only `upsertNPC`, `upsertPlace`, `addRuling`, `setNpcPersonality`, `adjustFactionReputation` use it. Verified bypasses (audit claim confirmed, with the full path list):

- `updateWorldState` (`memory-manager.ts:186-197`): `getWorldState()` → spread → `writeJson` outside any lock.
- `updateQuestLog` (`memory-manager.ts:453-485`): `getWorldStateSummary()` → switch → `setWorldStateSummary` outside the lock; races with concurrent quest dm-actions (renderer fire-and-forget at `src/renderer/src/services/game-actions/effect-actions.ts:627`).
- `logNpcInteraction` (`:353-377`), `updateNpcFields` (`:384-394`), `addNpcRelationship` (`:397-422`): each does `getNpcByName` (unlocked read, `:347-350`) → possibly `setNpcPersonality` stub-create → second `setNpcPersonality` with fields. Two concurrent calls for the same unknown NPC each miss the read and create **duplicate personalities with different `npcId`s**; interleaved field writes lose updates (each inner `setNpcPersonality` is individually serialized, but the read-decide-write spans multiple lock acquisitions).

```bash
sed -n '162,179p;186,197p;347,377p;384,422p;453,485p' src/main/ai/memory-manager.ts
```

### F5 — TWO independent debounced renderer paths both write `world-state.json`/`combat-state.json`, with different shapes and different gates

Both run simultaneously for a DM with AI enabled:

- `src/renderer/src/services/io/ai-memory-sync.ts` (`startAiMemorySync`) — started by `use-game-effects.ts:203-207` (gate: `isDM && campaign.aiDm?.enabled`), 2000 ms world / 1500 ms combat debounce, writes the **full** `WorldState` shape (timeOfDay via `deriveTimeOfDay`, weather, currentScene, positions without HP).
- `src/renderer/src/hooks/use-ai-memory-sync.ts` (`useAiMemorySync`) — mounted by `GameLayout.tsx:498` (`useAiMemorySync(isDM ? campaign.id : null)`; gate: zustand `networkRole === 'host'`), 3000 ms debounce, writes a **divergent** shape: adds `tokenCount` (not in the `WorldState` interface) and `hp: "cur/max"` inside `activeTokenPositions`, omits `timeOfDay`/`weather`/`currentScene` (spread-merge in `updateWorldState` keeps stale values rather than nulling them).

Net effect: interleaved last-write-wins between two writers with different field sets (the F4 `updateWorldState` race's concrete trigger), double IPC traffic on every map/initiative change, and a `world-state.json` whose shape depends on which timer fired last.

```bash
grep -rn "startAiMemorySync\|useAiMemorySync(" src/renderer/src --include='*.ts*' | grep -v test
sed -n '25,55p' src/renderer/src/hooks/use-ai-memory-sync.ts   # divergent payload (tokenCount, hp)
sed -n '25,43p' src/renderer/src/services/io/ai-memory-sync.ts # full WorldState payload
```

`use-ai-memory-sync.ts` has no test file; `ai-memory-sync.ts` has `ai-memory-sync.test.ts`.

### F6 — Existing "delta" channel is renderer fire-and-forget with no engine validation or feedback

World-state-ish verbs already flow `[DM_ACTIONS]` → zod (`src/main/ai/ai-schemas.ts:1187-1247`: `log_npc_interaction`, `set_npc_relationship`, `update_quest_log`, `adjust_faction_standing`, `set_npc_faction`, `set_npc_location`, `set_npc_secret_motivation`) → executor dispatch (`src/renderer/src/services/game-action-executor.ts:443-455`) → `effect-actions.ts:563-638` → `window.api.ai.X?.()` **with the returned promise discarded** (e.g. line 627) → IPC handlers (`src/main/ipc/ai-handlers.ts:423-524`) → memory-manager. No value validation against state (any `delta`, any name), no result surfaced to DM or AI. The handlers' missing `sanitizeCampaignId` (vs the helper at `ai-handlers.ts:92-103`) is owned by **PHASE-13**.

```bash
sed -n '563,638p' src/renderer/src/services/game-actions/effect-actions.ts
sed -n '421,524p' src/main/ipc/ai-handlers.ts
```

### F7 — Integration points for the new work (current shapes)

- IPC channel constants: `src/shared/ipc-channels.ts:102-116` (AI memory/state-sync block); zod boundary schemas: `src/shared/ipc-schemas.ts` (`AiConfigSchema` at lines 5-13 — pattern for new schemas); preload bridge: `src/preload/index.ts:120-160` (`api.ai.*` invoke wrappers) typed in `src/preload/index.d.ts` (e.g. `syncWorldState` at `:246`).
- System prompt assembly is **synchronous** (`assembleSystemPrompt(gameMode)`, `src/main/ai/prompt-assembler.ts:25`, called from `conversation-manager.ts:95`) — a per-campaign async flag cannot gate it without an invasive refactor; `buildContext` (`context-builder.ts`) is already async and per-campaign → the gated verb documentation and state slice belong in the context, not the system prompt.
- Campaign-level AI config: `AiDmConfig` (`src/renderer/src/types/campaign.ts:63-74`); campaign `lore?: LoreEntry[]` exists at `campaign.ts:52-59,112` (PHASE-25's substrate — do not duplicate).
- New-action checklist precedent (the `light_source` lesson, comment at `ai-schemas.ts` above `LightSourceSchema`): an action missing from the `DM_ACTION_SCHEMAS` map is **silently dropped** by `validateDmAction` — every new verb must land in schema + map + prompt doc + executor dispatch together.
- `src/main/ai/AI_ACTION_CONTRACT.md` documents the action surface; update it with the new verbs.

```bash
sed -n '102,116p' src/shared/ipc-channels.ts
sed -n '1,35p' src/shared/ipc-schemas.ts
sed -n '25,27p' src/main/ai/prompt-assembler.ts
sed -n '63,74p' src/renderer/src/types/campaign.ts
```

## Sub-phases

Order keeps the tree green: pure additions first (27A), then always-on bug fixes (27B/27C), then plumbing → verbs → injection → UI, tests colocated throughout.

### 27A — `world-state-store.ts`: schema, atomic IO, serialized mutations, legacy seed

**Objective:** the engine-owned store module. No behavior change anywhere else yet.

**Files:** NEW `src/main/ai/world-state-store.ts`, NEW `src/main/ai/world-state-store.test.ts`.

**Steps:**

1. Define zod schemas (strict, no passthrough) + inferred types, exported:

   ```ts
   const WorldExitSchema = z.object({ toLocationId: z.string(), label: z.string().max(60) })
   const WorldLocationSchema = z.object({
     id: z.string(),                      // slugified name — ids ARE names (see Research notes)
     name: z.string().max(120),
     type: z.string().max(40).default(''),         // 'town' | 'tavern' | 'dungeon-room' | freeform
     description: z.string().max(500).default(''),
     exits: z.array(WorldExitSchema).max(12).default([]),
     visited: z.boolean().default(false),
     firstVisited: z.string().nullable().default(null),   // ISO
     lastVisited: z.string().nullable().default(null)
   })
   const NpcOpinionSchema = z.object({
     characterName: z.string().max(120),
     characterId: z.string().nullable().default(null),    // wired when resolvable
     score: z.number().int().min(-100).max(100),
     summary: z.string().max(300).default(''),
     updatedAt: z.string()
   })
   const WorldNpcStateSchema = z.object({
     id: z.string(),                      // slugified name, same derivation as npcMemoryFromAttitude
     name: z.string().max(120),
     locationId: z.string().nullable().default(null),
     opinions: z.array(NpcOpinionSchema).max(12).default([])
   })
   const WorldFactSchema = z.object({
     id: z.string(),                      // crypto.randomUUID()
     text: z.string().max(300),
     tags: z.array(z.string().max(40)).max(6).default([]),
     createdAt: z.string()
   })
   export const WorldStoreSchema = z.object({
     version: z.literal(1),
     enabled: z.boolean().default(false),
     partyLocationId: z.string().nullable().default(null),
     locations: z.array(WorldLocationSchema).max(300).default([]),
     npcs: z.array(WorldNpcStateSchema).max(300).default([]),
     facts: z.array(WorldFactSchema).max(200).default([]),
     updatedAt: z.string()
   })
   ```

2. `export function slugifyId(name: string): string` — identical derivation to `npcMemoryFromAttitude` (`memory-manager.ts:65-69`: trim → lowercase → `[^a-z0-9]+`→`-` → strip edge dashes), with a code comment cross-referencing it.
3. Class `WorldStateStore` (constructor takes `campaignId`; path `app.getPath('userData')/campaigns/{id}/ai-context/world-store.json` — campaignId is sanitized at the IPC boundary in 27D, mirror `MemoryManager`'s trust model):
   - **Single serialized mutation queue** (`private queue: Promise<unknown> = Promise.resolve()`): `private withLock<T>(fn: (s: WorldStore) => T | Promise<T>): Promise<T>` chains on the queue (`.catch(() => {})` to keep the chain alive, like `memory-manager.ts:174-177`), reads the file fresh **inside** the lock, `safeParse`s (corrupt/absent → `emptyStore()`), runs `fn` on a deep clone, then atomic-writes: `world-store.json.tmp` + `fs.rename`. Every public mutator goes through `withLock`; reads (`getSnapshot()`) may read outside it.
   - `async getSnapshot(): Promise<WorldStore>`; `async setEnabled(v: boolean)`; `async isEnabled(): Promise<boolean>` (reads snapshot; also maintain a module-level `Map<campaignId, boolean>` cache updated on every read/write so 27F's hot path doesn't re-read disk each token-budget build — invalidated by `setEnabled`).
   - Mutators consumed by 27E (all resolve names case-insensitively against existing records first, then by `slugifyId`): `discoverLocation({name, type?, description?, connectsFromId?, exitLabel?})`, `movePartyTo(name)`, `linkLocations(fromName, toName, label?)`, `setNpcOpinion({npcName, characterName, delta?, score?, summary?})` (clamp to [-100,100]; `delta` applies to existing score defaulting 0; `score` sets absolutely; both present → `score` wins), `recordFact(text, tags?)` (case-insensitive exact-text dedupe; FIFO eviction past 200), `setNpcLocation(npcName, locationName)` (creates unvisited location stub if needed). Each returns `{applied: boolean, detail: string}` — never throws on semantic rejection.
   - `async seedFromLegacy(): Promise<void>` — called once when the file is first created: read (read-only, never modify) `npc-personalities.json` → seed `npcs[]` (name, `locationId` from slugified `location` field when present, empty opinions) and `world-state-summary.json` → if `currentLocation` exists and ≠ 'Unknown', create that location with `visited:true` and set `partyLocationId`. Wrap in try/catch; an unreadable legacy file seeds nothing.
   - Factory `getWorldStateStore(campaignId)` with a module `Map` cache (mirror `getMemoryManager`, `memory-manager.ts:642-651`).
4. Tests (`world-state-store.test.ts`, mock `electron`'s `app.getPath` + use `fs` tmpdir like `memory-manager.test.ts:1-40` does): schema round-trip; corrupt file → empty store (no throw); `Promise.all` of 10 concurrent `recordFact` yields 10 facts (serialization); opinion clamp at ±100; `discoverLocation` idempotence by case-insensitive name; `seedFromLegacy` happy path + missing-files path; FIFO fact eviction.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json`; `npx vitest run src/main/ai/world-state-store.test.ts`.

**Acceptance:** module compiles; all new tests green; no other file touched; `world-store.json` is never created unless the factory is invoked (verified by the test layout, not by runtime).

### 27B — Serialize the legacy memory-manager read-modify-write paths (F4)

**Objective:** every read-modify-write in `memory-manager.ts` goes through `mutate()`; the duplicate-NPC-stub race dies.

**Files:** `src/main/ai/memory-manager.ts`, `src/main/ai/memory-manager.test.ts`.

**Steps:**

1. `updateWorldState` (lines 186-197): rewrite as `await this.mutate<WorldState>('world-state.json', (current) => ({...defaults, ...current, ...updates, updatedAt: ...}), defaultWorldState)` — fold the default object into the fallback arg.
2. `updateQuestLog` (lines 453-485): rewrite the whole read-switch-write as one `mutate<WorldStateSummary>('world-state-summary.json', mutator, defaultSummary)`; the mutator performs the existing add/update/complete/remove logic and stamps `lastUpdated` (subsuming what `setWorldStateSummary` did — keep `setWorldStateSummary` itself for external API compatibility but route it through `mutate` too).
3. Add `private async mutateNpcPersonality(npcName: string, fn: (p: NPCPersonality) => NPCPersonality): Promise<void>` — a single `mutate<NPCPersonality[]>('npc-personalities.json', ...)` whose mutator does case-insensitive find-by-name, **creates the stub inside the mutator** when absent (`{npcId: crypto.randomUUID(), name: npcName, personality: ''}`), applies `fn`, and writes back. Rewrite `logNpcInteraction` (353-377), `updateNpcFields` (384-394), and the source-NPC half of `addNpcRelationship` (397-422) on top of it. For `addNpcRelationship`'s target NPC, do a first `mutateNpcPersonality(targetNpcName, p => p)` to ensure existence, then read `getNpcByName(target)` for its npcId, then mutate the source — two serialized steps on the same file queue cannot interleave with each other, which removes the duplicate-stub window.
4. Extend `memory-manager.test.ts`: (a) `Promise.all([updateWorldState({weather:'rain'}), updateWorldState({timeOfDay:'night'})])` → final file has both; (b) two concurrent `logNpcInteraction('Brand-new NPC', ...)` → exactly ONE personality record; (c) concurrent `updateQuestLog('add', 'Q1')` + `updateQuestLog('add', 'Q2')` → both quests present. Keep all existing tests passing unchanged (the public API signatures do not change).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json`; `npx vitest run src/main/ai/memory-manager.test.ts`.

**Acceptance:** no `readJson`→`writeJson` pair outside `mutate` remains for `world-state.json`, `world-state-summary.json`, `npc-personalities.json` (verify: `grep -n "writeJson\|setWorldStateSummary\|setNpcPersonality" src/main/ai/memory-manager.ts` and trace each); concurrency tests green.

### 27C — One renderer world-sync writer (F5)

**Objective:** exactly one renderer path writes `AI_SYNC_WORLD_STATE`/`AI_SYNC_COMBAT_STATE`.

**Files:** `src/renderer/src/services/io/ai-memory-sync.ts` (+ its `.test.ts`), DELETE `src/renderer/src/hooks/use-ai-memory-sync.ts`, `src/renderer/src/components/game/GameLayout.tsx` (import at line 4, call at line 498), `src/main/ai/memory-manager.ts` (interface only).

**Steps:**

1. Enrich the surviving service (`ai-memory-sync.ts`) with the hook's one useful extra: in `buildWorldState`, add `hp: t.currentHP != null ? \`${t.currentHP}/${getTokenStats(t).maxHP ?? '?'}\` : undefined` to each `activeTokenPositions` entry (import `getTokenStats` from `../game/token-stats`, as the hook did).
2. Extend the `WorldState` interface (`memory-manager.ts:19`): `activeTokenPositions: Array<{ name: string; gridX: number; gridY: number; hp?: string }>`.
3. Delete `src/renderer/src/hooks/use-ai-memory-sync.ts`; remove the `GameLayout.tsx` import (line 4) and call (line 498). The surviving gate is `use-game-effects.ts` (`isDM && campaign.aiDm?.enabled`) — intentionally: world-state sync is an AI-DM feature, and the hook's `networkRole==='host'` gate wrote AI memory even for campaigns with the AI disabled.
4. Update `ai-memory-sync.test.ts` for the new hp field.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json`; `npx vitest run src/renderer/src/services/io/ai-memory-sync.test.ts`; `grep -rn "syncWorldState" src/renderer/src --include='*.ts*' | grep -v test` → exactly one call site.

**Acceptance:** single writer; deleted hook referenced nowhere (`grep -rn "use-ai-memory-sync" src` → empty); tests green.

### 27D — IPC plumbing: channels, boundary schemas, preload, handlers

**Objective:** typed, validated, sanitized transport for store reads, the enable flag, and delta application.

**Files:** `src/shared/ipc-channels.ts`, `src/shared/ipc-schemas.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`, `src/main/ipc/ai-handlers.ts`.

**Steps:**

1. `ipc-channels.ts` — append to the AI block (after `AI_ADJUST_FACTION_STANDING`, line ~116):

   ```ts
   // === AI DM: World-state store (PHASE-27) ===
   AI_WORLD_STATE_GET: 'ai:world-state-get',
   AI_WORLD_STATE_SET_ENABLED: 'ai:world-state-set-enabled',
   AI_WORLD_DELTA: 'ai:world-delta',
   ```

2. `ipc-schemas.ts` — add the wire schema for deltas (discriminated union on `op`; bounded strings; this is the IPC boundary, separate from the DM-action zod in `ai-schemas.ts`):

   ```ts
   export const WorldDeltaSchema = z.discriminatedUnion('op', [
     z.object({ op: z.literal('discover_location'), name: z.string().min(1).max(120), type: z.string().max(40).optional(), description: z.string().max(500).optional(), connectsTo: z.string().max(120).optional(), exitLabel: z.string().max(60).optional() }),
     z.object({ op: z.literal('move_party'), locationName: z.string().min(1).max(120) }),
     z.object({ op: z.literal('link_locations'), fromName: z.string().min(1).max(120), toName: z.string().min(1).max(120), label: z.string().max(60).optional() }),
     z.object({ op: z.literal('set_npc_opinion'), npcName: z.string().min(1).max(120), characterName: z.string().min(1).max(120), delta: z.number().int().min(-100).max(100).optional(), score: z.number().int().min(-100).max(100).optional(), summary: z.string().max(300).optional() }),
     z.object({ op: z.literal('record_fact'), text: z.string().min(1).max(300), tags: z.array(z.string().max(40)).max(6).optional() })
   ])
   export type WorldDelta = z.infer<typeof WorldDeltaSchema>
   ```

3. `ai-handlers.ts` — three handlers via the existing `handle()` wrapper, each starting with `sanitizeCampaignId(campaignId)` (helper at lines 92-103):
   - `AI_WORLD_STATE_GET` → `{success:true, store: await getWorldStateStore(id).getSnapshot()}`.
   - `AI_WORLD_STATE_SET_ENABLED` `(campaignId, enabled: unknown)` → coerce with `z.boolean().safeParse`, `setEnabled`, `{success}`.
   - `AI_WORLD_DELTA` `(campaignId, delta: unknown)` → `WorldDeltaSchema.safeParse`; on fail `{success:false, error}`; on pass switch on `op` → the 27A mutators → `{success:true, applied, detail}`.
4. Preload (`index.ts` `api.ai` block, ~line 120-160) — `getWorldState(campaignId)`, `setWorldStateEnabled(campaignId, enabled)`, `applyWorldDelta(campaignId, delta)` invoke wrappers; mirror signatures in `index.d.ts` (pattern at `:246`), typing `delta` as the shared `WorldDelta` import and the delta result as `{ success: boolean; applied?: boolean; detail?: string; error?: string }`.
5. Also in `AI_SET_NPC_FIELDS`'s handler (lines ~486-498): when `fields.location` is set AND `await getWorldStateStore(campaignId).isEnabled()`, mirror it via `setNpcLocation(npcName, fields.location)` (fire-and-forget `.catch`) so the legacy verb keeps the store coherent.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json`.

**Acceptance:** channels registered in `ipc-channels.ts` + schemas in `ipc-schemas.ts` (repo convention); every new handler sanitizes campaignId and zod-parses payloads; both tsc configs green.

### 27E — Delta verbs: DM-action schemas, executors, dispatch

**Objective:** the five LLM-emittable verbs, validated end-to-end, with failure feedback (not fire-and-forget).

**Files:** `src/main/ai/ai-schemas.ts` (+ `ai-schemas.test.ts`), `src/renderer/src/services/game-actions/effect-actions.ts` (+ colocated test), `src/renderer/src/services/game-action-executor.ts`.

**Steps:**

1. `ai-schemas.ts` — five literal schemas next to the NPC-tracking block (~line 1187): `DiscoverLocationSchema` (`action:'discover_location'`, `name`, `type?`, `description?`, `connectsTo?`, `exitLabel?`), `MovePartySchema` (`action:'move_party'`, `locationName`), `LinkLocationsSchema` (`action:'link_locations'`, `fromName`, `toName`, `label?`), `SetNpcOpinionSchema` (`action:'set_npc_opinion'`, `npcName`, `characterName`, `delta?: z.number()`, `score?: z.number()`, `summary?`), `RecordFactSchema` (`action:'record_fact'`, `text`, `tags?: z.array(z.string())`). **Register all five in the `DM_ACTION_SCHEMAS` map** (~line 1382) — the `light_source` lesson: unmapped actions are silently dropped. Add map-membership assertions to `ai-schemas.test.ts`.
2. `effect-actions.ts` — five executors following the `executeUpdateQuestLog` pattern (lines 621-629) but with feedback: build the `WorldDelta` payload, call `window.api.ai.applyWorldDelta?.(campaignId, delta)` and attach `.then((res) => { if (res && (!res.success || res.applied === false)) postDmChatMessage(stores, 'ai-world-state', \`World state: ${detail-or-error}\`) }).catch(() => {})` — DM-visible rejection notes without making the synchronous executor pipeline async (executors return `boolean`; full async results are PHASE-08's pattern, do not rebuild it here). Throw on missing required params (matching the existing executors' contract so `executeDmActions` counts them failed).
3. `game-action-executor.ts` — five dispatch cases beside the existing NPC-tracking cases (~lines 443-455), passing `(action, gameStore, stores)` as each executor needs. No `action-validator.ts` change is required (these verbs target no tokens), but verify `filterValidActions` passes them through (`npx vitest run` the executor test).
4. Engine-owns-truth semantics (implemented in the 27A mutators, asserted by tests here): `move_party` to an unknown name auto-creates an unvisited stub linked from the current location (lenient resolution beats hard rejection for small local models — see Research notes) and marks it visited; `set_npc_opinion` auto-creates the NPC state record; opinion clamped; `record_fact` deduped; `link_locations` is bidirectional and idempotent.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json`; `npx vitest run src/main/ai/ai-schemas.test.ts src/renderer/src/services/game-actions/effect-actions.test.ts` (create/extend the latter as needed — match the existing test-file layout under `game-actions/`).

**Acceptance:** all five verbs parse through `validateDmAction`; executors dispatch and surface rejections as DM chat notes; targeted tests green.

### 27F — Gated context slice + verb documentation block

**Objective:** when (and only when) the store is enabled for a campaign, each turn's context carries the bounded world-state slice and the verb docs; when disabled, byte-identical context to today.

**Files:** `src/main/ai/world-state-store.ts`, NEW `src/main/ai/prompt-sections/world-state-verbs.ts`, `src/main/ai/context-builder.ts` (+ `context-builder.test.ts`).

**Steps:**

1. `world-state-verbs.ts` — `export const WORLD_STATE_VERBS_PROMPT` documenting the five verbs in the exact style of `dm-actions-schema.ts:222-231` (one backticked verb + param shape + one-sentence usage guidance each), framed as a `[WORLD STATE ACTIONS]`…`[/WORLD STATE ACTIONS]` block, including the two behavioral rules: "the World State block below is authoritative — never contradict it; when the party moves, emit `move_party`; when an NPC's view of a specific character shifts, emit `set_npc_opinion`". This lives in the **context**, not `assembleSystemPrompt` (F7: sync prompt assembly cannot read the per-campaign flag; also avoids the PHASE-11 file collision). Static text → place it BEFORE volatile state inside the block ordering so PHASE-01's prefix-cache ordering is respected as far as possible within the context segment.
2. `WorldStateStore.buildContextBlock(): Promise<string>` — deterministic, bounded:

   ```
   [WORLD STATE]
   Party location: <name> (<type>). <description>
   Exits: north gate → Market Row; cellar stair → Smugglers' Tunnel
   NPCs here: Ama — opinion of Brovic: +40 (grateful since the rescue); opinion of Tula: -10 (suspicious)
   Other known locations: Market Row (visited), Temple Gate (unvisited)
   Established facts: <last 8 facts, newest last>
   [/WORLD STATE]
   ```

   Caps: exits ≤ 12 (schema), NPCs-here ≤ 8 with ≤ 4 opinions each shown, other-locations ≤ 15 names, facts ≤ 8. Empty store → empty string.
3. `context-builder.ts` step 7 (lines 306-319): when `campaignId` and `await getWorldStateStore(campaignId).isEnabled()`, prepend `WORLD_STATE_VERBS_PROMPT + '\n\n' + await store.buildContextBlock()` to `memoryContext` BEFORE the existing `trimTracked(..., TOKEN_BUDGETS.memory)` call so the combined memory segment still fits the existing 2000-token budget (slice first = slice survives trimming; **`token-budgets.json` is not modified** — PHASE-01 owns budget totals). Disabled flag (the default) → code path identical to today.
4. Tests (`context-builder.test.ts` + `world-state-store.test.ts`): block formatting snapshot for a seeded store; disabled-flag produces unchanged context (assert no `[WORLD STATE]`/`[WORLD STATE ACTIONS]` substring); combined segment respects the memory budget.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json`; `npx vitest run src/main/ai/context-builder.test.ts src/main/ai/world-state-store.test.ts`.

**Acceptance:** flag off → byte-identical memory context; flag on → slice + verbs present and bounded; tests green.

### 27G — Opt-in toggle in campaign AI settings (off by default)

**Objective:** the DM can enable world-state tracking per campaign; nothing changes until they do.

**Files:** `src/renderer/src/pages/campaign-detail/AiDmCard.tsx`, `src/renderer/src/i18n/locales/en.json`, `src/renderer/src/i18n/locales/es.json`.

**Steps:**

1. In `AiDmCard` (post-PHASE-10 shape — re-verify the card layout first), inside the section rendered only when `aiDm.enabled`, add a checkbox row "World state tracking (experimental)" with helper text "The engine keeps a persistent map of locations, NPC opinions, and facts the AI must honor." On mount, load current value via `window.api.ai.getWorldState?.(campaign.id)` (`store.enabled`); on toggle, `window.api.ai.setWorldStateEnabled?.(campaign.id, next)` and update local state from the response. Default unchecked (store default `enabled:false`).
2. i18n keys (`campaignDetail.aiDm.worldState.label`, `.help` — follow the card's existing key namespace) in BOTH `en.json` and `es.json` (repo rule: es.json stays in sync; professional Spanish, e.g. "Seguimiento del estado del mundo (experimental)").
3. No campaign-object schema change: the flag lives in `world-store.json` (engine-owned, main-readable without renderer threading — see F7/Research).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json`; `npx vitest run src/renderer/src/pages/campaign-detail/AiDmCard.test.tsx` if the card has a test (extend it with a toggle render assertion; create a minimal one if PHASE-10 didn't).

**Acceptance:** toggle renders only for AI-enabled campaigns, persists across reload via the store file, defaults off; i18n keys present in both locales.

### 27H — Contract docs + integration pass

**Objective:** document the new surface; one integration-style test of the full delta path; leave the tree ready for the end-of-phase gate.

**Files:** `src/main/ai/AI_ACTION_CONTRACT.md`, `src/main/ai/world-state-store.test.ts`.

**Steps:**

1. `AI_ACTION_CONTRACT.md`: add a "World-state deltas (PHASE-27)" section — the five verbs, their param shapes, the engine-validation semantics (clamping, lenient location resolution, dedupe), the opt-in flag, and the statement of ownership ("the store is authoritative; AI output that contradicts it is a model error, not a state change").
2. Integration test (main-side, in `world-state-store.test.ts`): simulate the handler path — `WorldDeltaSchema.parse` a `discover_location` → `move_party` → `set_npc_opinion` → `record_fact` sequence applied to one store; assert final snapshot (party located, exit linked, opinion clamped/summarized, fact recorded) and that `buildContextBlock()` reflects all four.
3. Run the full end-of-phase 4-gate per INSTRUCTIONS.md rule 5 (`npm run lint`, `tsc` web + node, `npx vitest run`), fix anything red, then the single phase commit + push and move this plan to `completed/`.

**Acceptance:** contract doc updated; integration test green; 4-gate green.

## Research notes

- **Engine owns truth / LLM emits deltas** is the strongest recurring pattern across working LLM-GM systems. Neo4j's agentic-memory MUD models rooms as nodes with four directional `DOOR` edges, persists per-NPC opinion as a `THINKS_OF` edge **per player** updated by an explicit tool after each interaction, and injects only `getCurrentRoom()` + `getGhosts()` (room metadata, door availability, inhabitants with cached opinions) per turn — the direct template for 27A's locations/exits/opinions and 27F's slice. It also pre-creates empty adjacent rooms to preserve referential integrity, which motivates 27E's "auto-create unvisited stub" leniency. Source: https://neo4j.com/blog/developer/agentic-memory-multi-user-dungeon/
- **Ian Bicking's Intra postmortem** supplies the hard-won specifics adopted here: keep a formal ground truth ("is the door locked, what room you are in") separate from narrative; **room IDs should match titles exactly** so the model never translates between abstract ids and names (hence `slugifyId(name)` ids and name-keyed verbs); persist emotional/relational state as **separate fields** rather than expecting recall from event history (hence opinion records with a `summary`); and let state examples teach schema implicitly (hence the formatted `[WORLD STATE]` block mirroring the verb vocabulary). Its failure catalog (on-the-fly invention feels arbitrary; hallucinated objects inflate) is why facts/locations are recorded eagerly via deltas instead of re-derived from prose. Source: https://ianbicking.org/blog/2025/07/intra-llm-text-adventure
- **VirtualGameMaster** (cited by the original audit entry) keeps game state in YAML template fields outside the transcript, edited via commands and refreshed during chat compaction — validation that out-of-transcript state + explicit mutation commands is workable even without function calling; its weakness (free-form `/edit_field`, no validation) is exactly what the zod-validated delta union avoids. Source: https://github.com/Maximilian-Winter/VirtualGameMaster
- **Function calling for AI game masters** ("You Have Thirteen Hours…", AIIDE/arXiv 2024) found GM narration stays consistent with rules and state only when state mutations go through typed functions the engine executes — supporting the verb-per-mutation design over a single "update world JSON" blob. Source: https://arxiv.org/html/2409.06949v1
- **Small-model schema discipline** (re-used from the audit's Recommendations): 7–9B local models handle constrained extraction reliably only on **flat** schemas — flat array of `{type-enum, string target, one number}`, few optionals, schema echoed in the prompt; deep nesting produces field hallucination. The five verbs are deliberately flat and PHASE-23-compatible; constrained decoding guarantees shape, not truth, hence the engine-side clamps/resolution. Sources: https://docs.ollama.com/capabilities/structured-outputs , https://www.glukhov.org/post/2025/10/ollama-gpt-oss-structured-output-issues/
- **Storage choice:** plain per-campaign JSON (zod-validated, atomic tmp+rename, single serialized writer) over SQLite/graph DB — matches the repo's existing `ai-context/` JSON convention, needs no native deps in the Electron main process, and the audit's own framing ("graph DB **or plain JSON**") blesses it at this scale (≤300 locations/NPCs). A graph DB only pays off with multi-hop queries PHASE-28 may eventually want; the versioned schema leaves that door open.
- **Why the verbs doc lives in the context, not the system prompt:** `assembleSystemPrompt` is synchronous and campaign-agnostic (F7), and PHASE-01's KV-prefix-cache work wants the system prompt byte-stable; a per-campaign block in the (already volatile) context segment costs no extra cache misses and avoids an async refactor.
- **Alternatives considered:** (a) storing the flag on `campaign.aiDm` — rejected: main-process prompt/context code would need the renderer to thread it through every request, whereas the store file is main-readable; (b) making executors async to await delta results — rejected: the executor pipeline is synchronous-boolean and PHASE-08 owns its semantics; `.then`-based DM chat notes deliver the feedback without the refactor; (c) hard-rejecting `move_party` to unknown locations — rejected per the Neo4j/Intra leniency evidence (misspellings from small models would dead-end the narration); auto-stub + DM-visible note degrades gracefully.

## Test plan

- **27A** `src/main/ai/world-state-store.test.ts` (new): schema, atomicity/corruption fallback, concurrency serialization, clamps, dedupe, seed, eviction.
- **27B** `src/main/ai/memory-manager.test.ts` (extended): three concurrency regressions (world-state merge, single-stub NPC, parallel quest adds); existing 15 describe-blocks stay green.
- **27C** `src/renderer/src/services/io/ai-memory-sync.test.ts` (extended): hp field in positions payload; (deleted hook had no test).
- **27D** covered by tsc both configs + 27H integration test exercising `WorldDeltaSchema`.
- **27E** `src/main/ai/ai-schemas.test.ts` (extended): five schemas parse + are present in `DM_ACTION_SCHEMAS`; `effect-actions` test: executor → `applyWorldDelta` called with correct payload, rejection → DM chat note.
- **27F** `src/main/ai/context-builder.test.ts` (extended) + store block snapshot: gated injection on/off, budget respected.
- **27G** `AiDmCard` test: toggle renders + invokes `setWorldStateEnabled`.
- **27H** integration sequence test.
- **End-of-phase 4-gate** (INSTRUCTIONS.md rule 5): `npm run lint`; `npx tsc --noEmit -p tsconfig.web.json`; `npx tsc --noEmit -p tsconfig.node.json`; full `npx vitest run`. No Pi code is touched — no pytest leg.

## Acceptance criteria

1. A per-campaign `world-store.json` exists behind a zod-validated, version-tagged schema; every mutation flows through one serialized queue with atomic writes; corrupt files self-heal to empty.
2. `memory-manager.ts` has zero read-modify-write paths outside `mutate()` for world-state, world-state-summary, and npc-personalities files; concurrent same-NPC interactions can no longer create duplicate personalities (regression tests prove all three).
3. Exactly one renderer code path writes `AI_SYNC_WORLD_STATE`/`AI_SYNC_COMBAT_STATE`; `use-ai-memory-sync.ts` is deleted.
4. Five flat delta verbs (`discover_location`, `move_party`, `link_locations`, `set_npc_opinion`, `record_fact`) parse through `validateDmAction`, dispatch through the executor, cross IPC under `WorldDeltaSchema`, and are applied — clamped, name-resolved, deduped — by main-process code that returns applied/rejected detail; rejections surface as DM chat notes.
5. Per-NPC-per-PC opinions persist across sessions in the store and render in the context slice when enabled.
6. With the toggle OFF (default), prompts/context are byte-identical to pre-phase behavior; with it ON, the bounded `[WORLD STATE]` slice + `[WORLD STATE ACTIONS]` docs appear inside the existing 2000-token memory budget.
7. New IPC channels registered in `ipc-channels.ts` with zod schemas in `ipc-schemas.ts`; all new handlers call `sanitizeCampaignId`; preload + `index.d.ts` typed; i18n keys in en + es; `AI_ACTION_CONTRACT.md` updated.
8. End-of-phase 4-gate green; one commit; plan moved to `completed/`.

## Out of scope

- Sanitizing the TEN legacy unsanitized-campaignId AI handlers (`AI_SYNC_WORLD_STATE` et al.) — **PHASE-13** (runs earlier; new 27D handlers are born sanitized).
- Entity record auto-extraction, player-editable lore pages, keyword-triggered world-info injection — **PHASE-25**.
- Scene-boundary summarization / conversation compaction — **PHASE-26**.
- Quest objects in the store, objective auto-checking, director agent, oracle rolls — **PHASE-28** (consumes this store; `updateQuestLog` here only gets the 27B race fix, not a redesign).
- Two-call structured extraction mechanics and `repairJson` retirement — **PHASE-23**.
- Async executor results / batch snapshot correctness — **PHASE-08**.
- Token-budget totals reconciliation (`token-budgets.json`) — **PHASE-01**.
- Surfacing the world store in a DM-facing inspector UI beyond the enable toggle — **PHASE-14** owns context observability; a store browser is future work for the PHASE-28 era.

## Completed

- **27A — `world-state-store.ts`.** NEW store module: zod schemas (`WorldStoreSchema` v1 + location/
  exit/npc/opinion/fact), `slugifyId` (shared derivation), serialized `withLock` + atomic tmp+rename,
  `getSnapshot`/`isEnabled` (module enabled-cache)/`setEnabled`, mutators `discoverLocation`/`movePartyTo`
  (auto-stub + link)/`linkLocations`/`setNpcOpinion` (clamp ±100, score>delta)/`setNpcLocation`/`recordFact`
  (dedupe + FIFO 200), `seedFromLegacy` (read-only npc-personalities + world-state-summary), `buildContextBlock`
  (27F slice), `getWorldStateStore` factory. NEW `world-state-store.test.ts` (17, incl. the 27H integration).
- **27B — memory-manager race fixes.** `updateWorldState` + `updateQuestLog` + `setWorldStateSummary` now go
  through `mutate()`; new private `mutateNpcPersonality` (stub created INSIDE the mutator) rewrites
  `logNpcInteraction`/`updateNpcFields`/`addNpcRelationship` (target ensured + re-read for its id, then source
  mutated) — the duplicate-stub + lost-update races are gone. `memory-manager.test.ts` +3 concurrency regressions
  (parallel world-state merge, single-stub NPC, parallel quest adds); addNpcRelationship test rewritten stateful.
- **27C — one renderer world-sync writer.** `ai-memory-sync.ts` `buildWorldState` now carries `hp` (the one
  useful field of the deleted writer); `WorldState.activeTokenPositions` += `hp?`. DELETED
  `hooks/use-ai-memory-sync.ts` + its `GameLayout.tsx` import/call (single `AI_SYNC_WORLD_STATE` writer, gated
  by use-game-effects `isDM && aiDm.enabled`). `ai-memory-sync.test.ts` +2 hp cases (`buildWorldState` exported).
- **27D — IPC plumbing.** `ipc-channels.ts` `AI_WORLD_STATE_GET`/`AI_WORLD_STATE_SET_ENABLED`/`AI_WORLD_DELTA`;
  `ipc-schemas.ts` `WorldDeltaSchema` (discriminated on `op`, bounded). `ai-handlers.ts` three sanitized handlers
  (delta switch → store mutators) + `AI_SET_NPC_FIELDS` mirrors `location` into the store when enabled
  (fire-and-forget). preload `index.ts`/`index.d.ts` (`getWorldState`/`setWorldStateEnabled`/`applyWorldDelta`).
- **27E — delta verbs.** `ai-schemas.ts` 5 schemas + registered in `DM_ACTION_SCHEMAS`; `dm-actions.ts` 5 `DmAction`
  union variants (schema↔union contract test passes). `effect-actions.ts` 5 executors (build delta → `applyWorldDelta`,
  surface engine rejection as a DM-only chat note via `postDmChatMessage`, throw on missing params);
  `game-action-executor.ts` 5 dispatch cases. Tests: `ai-schemas.test.ts` (5 parse + map-membership + reject),
  `effect-actions.test.ts` (payload + rejection-note + throws).
- **27F — gated context slice + verb docs.** NEW `prompt-sections/world-state-verbs.ts` `WORLD_STATE_VERBS_PROMPT`;
  `context-builder.ts` step 7 prepends `[WORLD STATE ACTIONS]` + the `[WORLD STATE]` slice to `memoryContext`
  (slice-first, inside the existing `budgets.memory`) only when `getWorldStateStore(id).isEnabled()`; disabled
  (default) ⇒ byte-identical (no `token-budgets.json` change). `context-builder.test.ts` +2 gated on/off.
- **27G — opt-in toggle.** `AiDmCard.tsx` world-state checkbox in the AI-enabled view (own IPC-backed state via
  `getWorldState`/`setWorldStateEnabled`, NOT `campaign.aiDm`). en+es `pages.aiDmCard.{worldState,worldStateHint,
  worldStateSaveFailed}`. `AiDmCard.test.tsx` +3 (render + toggle + hidden-when-disabled).
- **27H — contract doc + integration + gate.** `AI_ACTION_CONTRACT.md` "World-state deltas (PHASE-27)" section.
  Integration test in `world-state-store.test.ts` (validate → apply → snapshot + block reflect all; schema rejects
  malformed). End-of-phase 4-gate: lint, tsc web+node, full vitest — all green. No Pi code (no pytest leg).
