# PHASE-34 — Text-to-battlemap generation (structured spec → procedural tile engine)

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Give the app text-to-battlemap generation: a DM (or, behind an opt-in flag, the AI DM itself) describes an encounter location in prose, an LLM emits a compact **structured map spec** (rooms, corridors, doors, lights, terrain, spawn points), and a deterministic **procedural tile engine** compiles that spec into a real `GameMap` — rendered floor/wall artwork as the map image, real `WallSegment[]` (including openable doors) for line-of-sight and movement blocking, terrain cells, token-attached light sources, fog-of-war enabled, and spawn-point pins. Every AI-generated encounter can then play out on a fog-of-war-ready tactical map instead of a blank grid. The LLM only authors the small JSON spec; all geometry, wall derivation, and pixel rendering are deterministic engine code — the approach the audit recommends over pure image-model map generators, which produce pictures without walls/door/light metadata (benchmark: [Dungeon Alchemist](https://www.dungeonalchemist.com/), whose VTT exports carry walls + lights + doors).

## Dependencies & cross-phase notes

- **Depends on PHASE-08 (executor batch correctness)** per PHASE-INDEX row 34. This phase adds a new DM action (`generate_battlemap`) to the same executor whose pre-batch snapshot staleness PHASE-08 fixes (`game-action-executor.ts:216` takes one `getState()` snapshot per batch); a generate-then-place combo in one batch depends on that fix. PHASE-08 also deletes dead duplicate executors — verify cited executor line numbers after it lands.
- **PHASE-01 (Ollama context window)** lands first (numeric order). It migrates the Ollama client from `/v1/chat/completions` to the **native `/api/chat`** endpoint with a byte-stable `options` block (`num_ctx`) + `keep_alive`. This phase's Ollama structured call MUST reuse PHASE-01's options/keep-alive resolution and the native endpoint (the native endpoint is also the only one that accepts the `format` JSON-schema parameter cleanly). At execution: `grep -n "num_ctx\|/api/chat" dnd-app/src/main/ai/ollama-client.ts` and reuse whatever helper PHASE-01 exported. Do NOT add a divergent options block (a changed model-load option forces a model reload and wipes the KV cache).
- **PHASE-23 (structured outputs)** lands first and builds two-call structured extraction (`format` = JSON schema, `stream:false`). If PHASE-23 left a reusable main-side structured-call helper (check `grep -rn "json_schema\|format" dnd-app/src/main/ai/*.ts | grep -v test`), reuse it for sub-phase 34B's provider calls instead of duplicating; otherwise implement the local helper specified in 34B.
- **Coordinate with PHASE-30 (combat automation)** on `src/main/ai/ai-schemas.ts`, `src/main/ai/dm-actions.ts`, `src/renderer/src/services/game-action-executor.ts`, `src/main/ai/prompt-sections/dm-actions-schema.ts`, and `src/renderer/src/services/chat-commands/` — PHASE-30 adds `run_monster_turn` + `/monsterturn` + `/suggestturn` to the same files. Merge textually; no semantic conflict. This phase's command names (`/genmap`, alias `generatemap`) were verified unused (see F11).
- **Coordinate with PHASE-09 (chat commands cleanup)** — it adds a registry collision test to `services/chat-commands/index.ts`; if it landed, the test guards the new command automatically.
- **Coordinate with PHASE-10 (AI DM UI truth)** on `src/renderer/src/pages/campaign-detail/AiDmCard.tsx` — PHASE-10 fixes prefill/Save gating in the same card where 34H adds the `allowMapGeneration` toggle.
- **Coordinate with PHASE-11 (prompt/schema contract)** on `prompt-sections/dm-actions-schema.ts` — PHASE-11 rewords action documentation in the same file; this phase appends one new action doc block.
- **Coordinate with PHASE-04 (approval hygiene)** on `MutationApprovalPanel` labels — the new `generate_battlemap` action flows through the same `dmApprovalRequired` → `pendingActions` gate (`game-action-executor.ts:196-207`); whichever phase lands second adds/keeps a label for it.
- **PHASE-33 (image generation)** is adjacent but independent: it does diffusion-model art, this phase does metadata-bearing procedural maps. No shared files expected beyond `ipc-channels.ts`/`preload/index.ts` (merge textually).

## Verified findings

All claims re-verified against the live tree 2026-06-10. bmo = Python, dnd-app = TypeScript; everything here is dnd-app.

### F1 — No map-generation capability exists today (audit recommendation confirmed as net-new)

**Claim (verified 2026-06-10):** The repo has zero procedural or AI map generation. The only map-creation paths are manual: `CreateMapModal` (blank grid or uploaded image) and campaign-wizard `MapConfigStep`.

Verification:
```bash
grep -rn "procedural\|generateMap\|generate_map\|battlemap" dnd-app/src --include='*.ts' --include='*.tsx' -i | grep -v test
#  → only an AboutPage i18n feature-list string (generated-keys.ts:4334, AboutPage.tsx:31). No code.
```
The audit entry (Feature ideas, "Text-to-battlemap generation with walls/doors/light metadata") is a pure recommendation; this plan verifies the *current state the feature builds on* (F2–F15).

### F2 — `GameMap` already models everything the spec needs (walls, doors, fog, terrain, darkness, pins, audio)

**Claim (verified 2026-06-10):** `src/renderer/src/types/map.ts` defines:
- `GameMap` (`:3-39`): `imagePath: string`, `width`/`height` **in pixels**, `grid: GridSettings`, `tokens: MapToken[]`, `fogOfWar: FogOfWarData`, `wallSegments?: WallSegment[]`, `terrain: TerrainCell[]`, `pins?: MapPin[]`, `darknessZones?`, `regions?`, `floors?`.
- `WallSegment` (`:223-235`): `{ id, x1, y1, x2, y2, type: 'solid'|'door'|'window'|'one-way'|'transparent', isOpen?, oneWayDirection?, floor? }` — coordinates are **grid-cell units** (consumed directly as cells by `token-placement.ts:19-41` `rasterizeWall` and converted to pixels by the lighting engine).
- `TerrainCell` (`:59-78`): `{ x, y, type: 'difficult'|'hazard'|'water'|'climbing'|'portal', movementCost, hazardType?: 'fire'|'acid'|'pit'|'spikes', hazardDamage? }`.
- `MapPin` (`:42-57`): `{ id, gridX, gridY, label, icon: 'note'|'quest'|'shop'|'danger'|'npc'|'custom', color, visibleToPlayers? }`.
- `FogOfWarData` (`:248-255`): `{ enabled, revealedCells, exploredCells?, dynamicFogEnabled? }`.
- `GridSettings` (`:84-92`): `cellSize` (px per cell), `type: 'square'|'hex'|…|'gridless'`.

There are **no locked/secret door types** on `WallSegment` — the compiler must map `locked` → `door` + DM-only pin, `secret` → `solid` + DM-only pin (34C).

Verification: `sed -n 223,235p dnd-app/src/renderer/src/types/map.ts` and `grep -n "type:" dnd-app/src/renderer/src/types/map.ts | head`.

### F3 — Map creation today: data-URL `imagePath` is the established pipeline; empty `imagePath` = blank canvas

**Claim (verified 2026-06-10):**
- `DMMapEditor.tsx:119-155` (`handleCreateMap`) builds a `GameMap` with `imagePath: mapConfig.imageData || ''` — `imageData` is a **base64 data URL** from `FileReader.readAsDataURL` (`CreateMapModal.tsx:128-137`); `width: cells × cellSize`, grid `cellSize` default 40 (`CreateMapModal.tsx:5`), `fogOfWar: { enabled: false, revealedCells: [] }`, then `gameStore.addMap(newMap)` + `setActiveMap`.
- `use-map-background.ts:39-43` skips background load when `imagePath` is empty (`if (!map?.imagePath) return`) and otherwise `Assets.load(map.imagePath)` (PixiJS `^8.18.1`, `package.json:212`) — data URLs already flow through this exact call today, so a canvas-rendered PNG data URL needs no renderer changes.
- Minor drift noted: `CreateMapModal` collects `backgroundColor` but `handleCreateMap` never uses it (preview-only). Not fixed here.

Verification: `sed -n 119,155p dnd-app/src/renderer/src/components/game/modals/dm-tools/DMMapEditor.tsx`; `sed -n 35,45p dnd-app/src/renderer/src/components/game/map/map-canvas/use-map-background.ts`.

### F4 — Mid-session map creation broadcasts automatically; no new sync code needed

**Claim (verified 2026-06-10):** `network/game-sync.ts:148-160` — the host's game-sync subscription detects new entries in `state.maps` and sends `game:state-update { addMap: map }` carrying the **full map** (walls/regions/drawings/tokens/fog) so mid-session creation reaches clients before per-map shard deltas begin. Clients apply it via `stores/network-store/client-handlers/shared.ts:49-51` (`gs.addMap(payload.addMap)`). The join-time path (`buildFullGameStatePayload`, `game-sync.ts:176+`) "encodes map images as base64 data URLs" — data-URL images are already the wire norm. Map switching broadcasts separately via `dm:map-change` (`effect-actions.ts:307-319`, `executeSwitchMap`).

Verification: `sed -n 148,162p dnd-app/src/renderer/src/network/game-sync.ts`; `grep -n "addMap" dnd-app/src/renderer/src/stores/network-store/client-handlers/shared.ts`.

### F5 — DM-only map pins are NOT wire-filtered (gap this phase must close before emitting DM-only spawn pins)

**Claim (verified 2026-06-10):** The outbound `addMap` sanitizer (`stores/network-store/index.ts:939-958`) strips hidden **tokens**, DM-only **regions**, and DM-only **drawings** from the broadcast map — but not pins. `network-state-filter.ts` has zero occurrences of `pin`:
```bash
grep -rn "pins" dnd-app/src/renderer/src/stores/network-store/ | grep -v test   # → no filter hits
grep -n "visibleToPlayers" dnd-app/src/renderer/src/stores/network-store/network-state-filter.ts
```
`MapPin.visibleToPlayers === false` is today only a render-side concern. Since 34C/34E creates DM-only enemy-spawn pins programmatically, this phase wire-strips DM-only pins in both spots (34E) — otherwise enemy spawn positions leak to players in the `addMap` payload and the join snapshot.

### F6 — Light sources are token-attached, not free-standing; data keys + broadcast message verified

**Claim (verified 2026-06-10):** There is no free-standing map light object. Lighting derives from:
- `ActiveLightSource` entries in the game store (`stores/game/time-slice.ts:92-112`): `lightSource(entityId, entityName, sourceName, durationSeconds, animation?)` — requires `inGameTime` non-null (`:99 if (!inGameTime) return`), supports `durationSeconds: Infinity` (never expires, `checkExpiredSources` skips Infinity, `:116-131`).
- `MapCanvas.tsx:421-433` resolves each `ActiveLightSource` to its carrier **token position** (`tokens.find(tk => tk.id === ls.entityId)`) and radius from the `LIGHT_SOURCES` dict.
- `LIGHT_SOURCES` (`data/light-sources.ts:13-30`) is populated from `public/data/5e/equipment/light-sources.json` via `load5eLightSources` (`data-provider.ts:551`, path key `data-paths.ts:12`). **Actual keys:** `torch` (bright 20/dim 40, 3600 s), `lantern-hooded`, `lantern-bullseye`, `candle`, `light-cantrip`, `continual-flame`, `daylight-spell`, `lamp`, `dancing-lights`.
- The AI-path executor `executeLightSource` (`services/game-actions/visibility-actions.ts:58-80`) resolves token by label, calls `gameStore.lightSource(...)`, then broadcasts `dm:light-source-update { entityId, entityName, sourceName, action: 'light' }` — the compiler's apply layer must mirror this exact pattern (slice call + broadcast) per generated light fixture.

Consequence: generated "lights" = small scenery tokens (`entityType: 'npc'`, 1×1, `visibleToPlayers: true`) + a `lightSource` slice call with `durationSeconds: Infinity` + the `dm:light-source-update` broadcast. NOTE: `MapCanvas.tsx:425` resolves by **token id** (`tk.id === ls.entityId`) while `executeLightSource:73-74` passes `token?.entityId ?? entityName` — at execution, pass the value the renderer actually matches on (`token.id`); re-verify with `sed -n 420,433p dnd-app/src/renderer/src/components/game/map/MapCanvas.tsx`.

Verification: `python3 -c "import json; d=json.load(open('dnd-app/src/renderer/public/data/5e/equipment/light-sources.json')); print(list(d))"`.

### F7 — DM-action contract: 3 sync points + CI contract test; executor entry/approval/validation verified

**Claim (verified 2026-06-10):** `src/main/ai/AI_ACTION_CONTRACT.md` — a `[DM_ACTIONS]` action lives in exactly three places kept in sync by the contract test (`ai-schemas.test.ts` → "DM action schema ↔ executor contract"):
1. Zod schema registered in `DM_ACTION_SCHEMAS` (`src/main/ai/ai-schemas.ts`, e.g. `AddWallSegmentSchema` at `:922`, registry map at `:1334`).
2. `case '<name>':` in the renderer executor switch (`services/game-action-executor.ts:254+`; unknown actions throw at `:555-561`).
3. Prompt documentation (`src/main/ai/prompt-sections/dm-actions-schema.ts`, e.g. wall doc at `:147`).

Plus the main-side TS union `DmAction` in `src/main/ai/dm-actions.ts:9-475` (the `// Map` group with `switch_map` at `:96`). Executor entry `executeDmActions(actions, bypassApproval)` (`game-action-executor.ts:194`): queues to `useAiDmStore.pendingActions` when `dmApprovalRequired` (`:196-207`; flag default `false`, `use-ai-dm-store.ts:167`), caps batches at 50 (`:166,211-214`), pre-validates via `filterValidActions` (`game-actions/action-validator.ts` — only inspects a fixed list of spatial actions; new action does not need an entry), takes ONE store snapshot per batch (`:216-217` — PHASE-08 territory). Async-needing executors use the fire-and-forget dynamic-import pattern (`trigger-action-executor.ts:56-58`).

Verification: `cat dnd-app/src/main/ai/AI_ACTION_CONTRACT.md`; `sed -n 194,230p dnd-app/src/renderer/src/services/game-action-executor.ts`.

### F8 — One-shot LLM infrastructure exists per provider; Ollama path has NO structured-output support today

**Claim (verified 2026-06-10):** `LLMProvider` (`src/main/ai/llm-provider.ts:21-38`) declares `chatOnce(systemPrompt, messages, model, maxTokens?)` next to `streamChat`. Implementations:
- Ollama: `ollamaChatOnce` (`ollama-client.ts:221-243`) — currently posts to `${ollamaBaseUrl}/v1/chat/completions` with `stream: false` and `AbortSignal.timeout(OLLAMA_PREFILL_TIMEOUT_MS)`. `grep -c "format" src/main/ai/ollama-client.ts` → **0**: no JSON-schema constrained decoding anywhere yet. (PHASE-01 migrates this file to native `/api/chat`; see Dependencies.)
- Claude: `claude-client.ts:84-108` via `@anthropic-ai/sdk ^0.100.1` `client.messages.create`.
- OpenAI: `openai-client.ts:64-87` via `openai ^6.39.1` `client.chat.completions.create` (`max_tokens: 4096`).
- Gemini: `gemini-client.ts:71-93` via `@google/generative-ai ^0.24.1` `getGenerativeModel({ model, systemInstruction })` + `startChat/sendMessage`.

The one-shot IPC pattern to copy: `AI_GENERATE_END_OF_SESSION_RECAP` (`ipc-channels.ts:122`, handler `src/main/ipc/ai-handlers.ts:311-322` returning `{ success, data?/error? }`). Preload `ai:` block spans `src/preload/index.ts:80-228`; typings in `src/preload/index.d.ts`. JSON repair util `repairJson` + block parsing live in `ai-schemas.ts` (used by `dm-actions.ts:504`).

Verification: `grep -n "chatOnce" dnd-app/src/main/ai/*.ts`; `sed -n 221,243p dnd-app/src/main/ai/ollama-client.ts`.

### F9 — System-prompt assembly is static; main can read campaign config from disk

**Claim (verified 2026-06-10):** `assembleSystemPrompt(gameMode)` (`src/main/ai/prompt-assembler.ts:25`) unconditionally pushes `DM_ACTIONS_SCHEMA_PROMPT` (`:58`), a static template string (`prompt-sections/dm-actions-schema.ts:7`). Sole caller: `conversation-manager.ts:95` (ConversationManager is per-campaign — `getConversationManager(campaignId)`, `ai-service.ts`). Main can load the campaign JSON via `loadCampaignById` (`src/main/ai/campaign-context.ts:3-9` → `storage/campaign-storage.ts loadCampaign`), so a per-campaign conditional prompt section is feasible (the section toggles only when the DM flips the setting — campaign-stable, so it does not churn the Ollama KV-cache prefix between turns).

Verification: `grep -rn "assembleSystemPrompt" dnd-app/src/main --include='*.ts' | grep -v test`.

### F10 — Campaign-persisted AI-DM config + settings card location

**Claim (verified 2026-06-10):** `AiDmConfig` (`src/renderer/src/types/campaign.ts:63-74`): `{ enabled, provider?, model?, ollamaUrl?, *ApiKey?, discordBridge?, ollamaModel? (deprecated) }`, stored at `Campaign.aiDm` (`:131`). The settings card is `src/renderer/src/pages/campaign-detail/AiDmCard.tsx` (NOT `components/campaign/` — drift from older notes), which builds and saves the `aiDm` object (`:100-103`). Campaign list lives in `useCampaignStore` (`stores/use-campaign-store.ts:57 campaigns: Campaign[]`); the active id mirror is `getActiveCampaignId()` (`services/active-campaign-ref.ts:24-26`) — usable from executor-adjacent code without store import cycles.

Verification: `sed -n 63,74p dnd-app/src/renderer/src/types/campaign.ts`; `find dnd-app/src -name "AiDmCard.tsx"`.

### F11 — Chat-command registry shape; `/genmap` + `generatemap` are free

**Claim (verified 2026-06-10):** `ChatCommand` (`services/chat-commands/types.ts:28-37`): `{ name, aliases, description, usage, examples?, category: 'player'|'dm'|'ai', dmOnly, execute(args, ctx) }` — `execute` may return a Promise. Registry: `allCommands` spread list (`services/chat-commands/index.ts:72-135`); DM map commands live in `commands-dm-map.ts` (existing names: `fog, map, token, summon, light, elevate, measure, grid, zoom, center, darkness, setweather, sunmoon, tokenclone, tokenhide, tokenshow, tokenmove`). `grep -rn "genmap\|generatemap" dnd-app/src --include='*.ts' -i` → no hits; names free. PHASE-30 takes `/monsterturn` + `/suggestturn` — no collision.

### F12 — Vitest runs in `environment: 'node'`: the tile renderer cannot assume DOM

**Claim (verified 2026-06-10):** `vitest.config.ts:7` — `environment: 'node'`. There is no `document`/canvas in tests (no `canvas` npm package either). The tile renderer must therefore take an injected canvas factory (`() => HTMLCanvasElement`) so production passes `document.createElement('canvas')` while tests pass a stub context recorder; pure layout math (floor mask, wall tracing, segment merging, PRNG, palettes) must live in DOM-free functions.

### F13 — Library/tooling versions pinned for this phase

**Claim (verified 2026-06-10):** `package.json`: `zod ^4.4.3` (zod v4 has native `z.toJSONSchema()` — [zod.dev/json-schema](https://zod.dev/json-schema)), `pixi.js ^8.18.1`, `@anthropic-ai/sdk ^0.100.1`, `openai ^6.39.1`, `@google/generative-ai ^0.24.1`, i18n key-union generator `npm run i18n:gen-keys` (`package.json:34` → `scripts/i18n/gen-key-union.mjs`).

### F14 — The AI already receives map dimensions + coordinates in `[GAME STATE]`

**Claim (verified 2026-06-10):** `services/game-actions/state-snapshot.ts:19-23` emits `Active Map: "<name>" (<cols>x<rows> cells, 5ft/cell)` and token positions; `:270-272` lists `Available Maps:` when more than one exists — so after generation the AI can `switch_map` by name and `place_creature` at spawn coordinates the engine reports back in chat (34E posts them).

### F15 — Smart token-placement helper exists for spawn sanity

**Claim (verified 2026-06-10):** `services/game-actions/token-placement.ts` provides `findEmptyCell(startX, startY, occupied, blocked, cols, rows, sizeX, sizeY)` (spiral search honoring wall-rasterized blocked cells, `:44+`) and `rasterizeWall` (`:19-41`) — reuse both in the compiler's spawn-repair step instead of re-implementing.

## Sub-phases

Order keeps every intermediate state green: shared schema first (no consumers), then main-side generation (depends on schema only), then the pure compiler, then the renderer-side renderer, then application/wiring, then UI, command, and finally the AI-initiated action (which reuses everything).

### 34A — Battlemap spec: shared zod schema + deterministic repair

**Objective:** A single source of truth for the spec shape, importable from main and renderer, plus a pure repair/clamp pass so imperfect LLM output still compiles.

**Files:** new `src/shared/battlemap-spec.ts`, new `src/shared/battlemap-spec.test.ts`.

**Steps:**
1. Define the LLM-facing schema with zod (flat, enum-heavy, few optionals — small-model-reliability guidance from the audit's extraction-schema research):
   ```ts
   export const BATTLEMAP_THEMES = ['dungeon', 'cave', 'crypt', 'sewer', 'tavern', 'forest', 'urban', 'ship'] as const
   export const BATTLEMAP_LIGHT_KINDS = ['torch', 'lantern', 'candle', 'lamp', 'magical'] as const // → LIGHT_SOURCES keys: torch, lantern-hooded, candle, lamp, continual-flame (F6)
   export const BattlemapSpecSchema = z.object({
     name: z.string().min(1).max(60),
     theme: z.enum(BATTLEMAP_THEMES),
     width: z.number().int().min(10).max(60),    // grid cells
     height: z.number().int().min(10).max(60),
     ambientLight: z.enum(['bright', 'dim', 'darkness']),
     rooms: z.array(z.object({
       id: z.string().min(1).max(20),
       x: z.number().int(), y: z.number().int(),
       w: z.number().int(), h: z.number().int(),
       label: z.string().max(60).optional(),
       floor: z.enum(['stone', 'wood', 'dirt', 'grass', 'sand', 'water']).optional()
     })).min(1).max(20),
     corridors: z.array(z.object({
       from: z.string(), to: z.string(), width: z.number().int().min(1).max(2).optional()
     })).max(30).default([]),
     doors: z.array(z.object({
       x: z.number().int(), y: z.number().int(),
       type: z.enum(['door', 'open', 'locked', 'secret', 'window'])
     })).max(20).default([]),
     lights: z.array(z.object({
       x: z.number().int(), y: z.number().int(), kind: z.enum(BATTLEMAP_LIGHT_KINDS)
     })).max(20).default([]),
     terrain: z.array(z.object({
       x: z.number().int(), y: z.number().int(),
       type: z.enum(['difficult', 'water', 'hazard']),
       hazardType: z.enum(['fire', 'acid', 'pit', 'spikes']).optional()
     })).max(80).default([]),
     spawns: z.object({
       party: z.object({ x: z.number().int(), y: z.number().int() }),
       enemies: z.array(z.object({
         x: z.number().int(), y: z.number().int(), label: z.string().max(40).optional()
       })).max(12).default([])
     })
   })
   export type BattlemapSpec = z.infer<typeof BattlemapSpecSchema>
   ```
2. Export `battlemapSpecJsonSchema(): Record<string, unknown>` using zod v4 `z.toJSONSchema(BattlemapSpecSchema)` ([zod JSON Schema docs](https://zod.dev/json-schema)). Post-process the result: ensure every object node carries `additionalProperties: false`, and (for the Ollama/OpenAI decoders that accept them) keep `minimum`/`maximum`; structured-output backends that reject numeric constraints get the prompt-text version instead (34B handles per-provider).
3. Export `repairBattlemapSpec(spec: BattlemapSpec): { spec: BattlemapSpec; warnings: string[] }` — pure, deterministic:
   - clamp every room rect into `[0, width-1] × [0, height-1]`; drop rooms whose clamped `w`/`h` < 2; error if zero rooms survive (throw `BattlemapSpecError` with reason);
   - drop corridors whose `from`/`to` reference unknown room ids; dedupe identical corridor pairs;
   - clamp door/light/terrain/spawn coordinates into bounds; dedupe same-cell lights and terrain;
   - move `spawns.party` (and each enemy spawn) onto the nearest floor cell if it lands outside every room/corridor — floor membership is recomputed cheaply here as the union of room rects (corridor carving happens in 34C; this is a coarse pre-pass, the compiler re-repairs against the true floor mask);
   - cap totals at the schema maxima (slice extras, warn).
4. Tests (`battlemap-spec.test.ts`): valid spec round-trips; out-of-bounds room clamped; unknown corridor ref dropped with warning; zero-room spec throws; JSON schema output has `additionalProperties: false` on the root and on `rooms.items`.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json` (shared is compiled by both), `npx vitest run src/shared/battlemap-spec.test.ts`.

**Acceptance:** schema + repair exported from `src/shared/battlemap-spec.ts`; both tsc configs green; test file passes.

### 34B — Main-side generator: prompt, provider calls, parse/retry, IPC

**Objective:** `AI_GENERATE_BATTLEMAP` IPC that turns `{ campaignId, prompt, theme?, widthCells?, heightCells? }` into a validated `BattlemapSpec` (or a structured error) using the configured provider.

**Files:** new `src/main/ai/battlemap-generator.ts` + `battlemap-generator.test.ts`; edit `src/main/ai/ollama-client.ts` (one exported function), `src/shared/ipc-channels.ts`, `src/shared/ipc-schemas.ts`, `src/main/ipc/ai-handlers.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`.

**Steps:**
1. `ipc-channels.ts`: add `AI_GENERATE_BATTLEMAP: 'ai:generate-battlemap'` next to `AI_GENERATE_END_OF_SESSION_RECAP` (`:122`).
2. `ipc-schemas.ts`: add
   ```ts
   export const BattlemapGenerationRequestSchema = z.object({
     campaignId: z.string().min(1),
     prompt: z.string().min(1).max(2000),
     theme: z.enum(BATTLEMAP_THEMES).optional(),
     widthCells: z.number().int().min(10).max(60).optional(),
     heightCells: z.number().int().min(10).max(60).optional()
   })
   ```
   (import the theme tuple from `src/shared/battlemap-spec.ts`).
3. `battlemap-generator.ts`:
   - `buildBattlemapSystemPrompt(jsonSchemaText: string): string` — a SMALL dedicated prompt (not the 9k-token DM prompt): role ("You design D&D 5e battlemaps as JSON"), coordinate rules (0-indexed grid, 5 ft/cell, rooms are rectangles, corridors connect room ids, doors sit on room edges), the JSON schema echoed in-prompt (echoing the schema measurably improves small-model compliance — audit extraction-schema finding), and "Output ONLY the JSON object — no markdown fences, no commentary."
   - `generateBattlemapSpec(request): Promise<{ success: true; spec: BattlemapSpec; warnings: string[] } | { success: false; error: string }>`:
     a. Resolve provider/model from the existing config source used by `ai-service`/`ai-handlers` (verify accessor at execution: `grep -n "getConfig\|currentProvider" dnd-app/src/main/ai/ai-service.ts | head`).
     b. **Ollama:** call a new exported `ollamaGenerateStructured(systemPrompt, userPrompt, model, format: object)` in `ollama-client.ts` that POSTs the **native** `/api/chat` with `{ model, messages, stream: false, format: <json schema>, ...PHASE-01 options/keep_alive }` and returns `data.message.content`. Native `format` is decoder-level constrained generation — guaranteed shape ([Ollama structured outputs](https://ollama.com/blog/structured-outputs), [/api/chat reference](https://docs.ollama.com/api/chat)). `stream:false` is mandatory: `format` is not enforced when streaming with thinking enabled ([ollama#14440](https://github.com/ollama/ollama/issues/14440)). Reuse PHASE-01's options block verbatim (Dependencies note) and `AbortSignal.timeout(OLLAMA_PREFILL_TIMEOUT_MS)` like `ollamaChatOnce` (`ollama-client.ts:233-234`).
     c. **OpenAI:** `client.chat.completions.create({ model, messages, response_format: { type: 'json_schema', json_schema: { name: 'battlemap_spec', strict: true, schema } }, max_tokens: 4096 })` — same client/timeout shape as `openai-client.ts:64-87`. Expose as a small exported helper in `battlemap-generator.ts` that imports the provider's client accessor, or add a `chatOnceStructured` beside `chatOnce` in `openai-client.ts` (prefer the latter; keeps client/key handling in one file). Strict mode requires `additionalProperties:false` everywhere (34A step 2) ([OpenAI structured outputs](https://platform.openai.com/docs/guides/structured-outputs)).
     d. **Gemini:** reuse `chatOnce` flow but with `getGenerativeModel({ model, systemInstruction, generationConfig: { responseMimeType: 'application/json' } })` (JSON mode; schema text rides in the prompt — `responseSchema` on `@google/generative-ai 0.24.1` accepts only an OpenAPI-style subset and is fussier than it is useful here; [Gemini structured output docs](https://ai.google.dev/gemini-api/docs/structured-output)).
     e. **Claude:** plain `chatOnce` with the schema-echoing prompt (frontier models are reliable on a flat schema; the installed `@anthropic-ai/sdk 0.100.1` predates a typed `output_config.format` — adding the param under a type assertion is brittle, prompt+validate is the stable baseline; note for a future SDK bump: structured outputs are `output_config: { format: { type: 'json_schema', schema } }` per [Anthropic structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), with `additionalProperties:false` required and numeric `minimum`/`maximum` unsupported — keep client-side clamping regardless).
     f. Parse: strip ``` fences if present → `repairJson` (`ai-schemas.ts`, same util `dm-actions.ts:504` uses) → `JSON.parse` → `BattlemapSpecSchema.safeParse`. On failure, ONE retry: append a user message "Your previous output failed validation: <zod issues>. Output ONLY corrected JSON." On second failure return `{ success: false, error }` with the issue list.
     g. On parse success run `repairBattlemapSpec` (34A) and apply `request.theme/widthCells/heightCells` as hard overrides if provided (clamp spec to requested dims before repair).
4. `ai-handlers.ts`: register `handle(IPC_CHANNELS.AI_GENERATE_BATTLEMAP, async (_e, request) => { const parsed = BattlemapGenerationRequestSchema.safeParse(request); if (!parsed.success) return { success: false, error: 'Invalid request' }; return generateBattlemapSpec(parsed.data) })` — mirror the recap handler's result envelope (`ai-handlers.ts:311-322`).
5. Preload: in the `ai:` block (`src/preload/index.ts:80-228`) add `generateBattlemap: (request: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.AI_GENERATE_BATTLEMAP, request)`; type it in `src/preload/index.d.ts` as `generateBattlemap: (request: { campaignId: string; prompt: string; theme?: string; widthCells?: number; heightCells?: number }) => Promise<{ success: boolean; spec?: unknown; warnings?: string[]; error?: string }>`. (PHASE-31 fixes the recap entry that exists only in `index.d.ts` — make sure this one lands in BOTH files.)
6. Tests (`battlemap-generator.test.ts`): prompt builder embeds the schema text and the no-fences instruction; parse path accepts fenced JSON; retry fires exactly once on invalid JSON then surfaces the error; provider routing picks the Ollama structured helper when provider is `ollama` (mock the client modules with `vi.mock`).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json`, `npx vitest run src/main/ai/battlemap-generator.test.ts`.

**Acceptance:** IPC channel registered + schema-validated; all four providers have a generation path; one-retry behavior tested; preload entry present in BOTH `index.ts` and `index.d.ts` (`grep -n "generateBattlemap" dnd-app/src/preload/index.ts dnd-app/src/preload/index.d.ts` → 2 files).

### 34C — Compiler: spec → map geometry (floor mask, walls, doors, terrain, lights, pins)

**Objective:** Pure, DOM-free functions that turn a repaired `BattlemapSpec` into `GameMap`-shaped data.

**Files:** new `src/renderer/src/services/map/battlemap/compile-spec.ts` + `compile-spec.test.ts`.

**Steps:**
1. `buildFloorMask(spec): Set<string>` — keys `"x,y"`: union of room rects plus corridor carvings. Corridor carving: L-shaped path from `from`-room center to `to`-room center (horizontal leg then vertical leg; `width 2` carves a parallel second row/column). Deterministic; no randomness.
2. `traceWalls(mask, spec): WallSegment-shaped data` (grid coords, F2): for every floor cell, each of its 4 edges bordering a non-floor cell is a wall edge; merge collinear contiguous edges into maximal segments (greedy row/column run-merge). Output `{ x1, y1, x2, y2, type: 'solid' }` with vertex coordinates on cell corners (an edge between cell `(x,y)` and `(x,y-1)` is the segment `(x,y)→(x+1,y)` — matches how `rasterizeWall` (`token-placement.ts:19-41`) and the raycaster consume grid-unit walls; sanity-check one hand-drawn 3×3 room → exactly 4 segments).
3. `applyDoors(walls, doors)`: snap each door to the nearest wall-segment cell edge within 2 cells (drop with warning if none); split the host segment at the door cell and insert a 1-cell segment with: `door`/`locked` → `type:'door', isOpen:false`; `open` → `type:'door', isOpen:true`; `window` → `type:'window'`; `secret` → keep `type:'solid'` (no gap) and record a secret-door pin. `locked` and `secret` each also yield a DM-only `MapPin` (`icon:'danger'`, `visibleToPlayers:false`, label "Locked door"/"Secret door") since `WallSegment` has no locked/secret types (F2).
4. `compileSpec(spec, cellSize = 40): CompiledBattlemap` returning:
   - `wallSegments: WallSegment[]` (with `crypto.randomUUID()` ids),
   - `terrain: TerrainCell[]` (`difficult` → `movementCost:2`; `water` → `type:'water', movementCost:2`; `hazard` → `type:'hazard'` + `hazardType`, `hazardDamage` defaults: fire/spikes 3, acid 7, pit 3 — informational, DM-adjustable),
   - `lightFixtures: Array<{ token: MapToken; sourceKey: string }>` — token: `{ id: uuid, entityId: uuid, entityType: 'npc', label: 'Torch 1'…, gridX/Y, sizeX/Y: 1, visibleToPlayers: true, conditions: [], nameVisible: false }`; `kind` → key map per F6 (`torch→torch`, `lantern→lantern-hooded`, `candle→candle`, `lamp→lamp`, `magical→continual-flame`),
   - `pins: MapPin[]` — party spawn (`icon:'note'`, color `#22c55e`, `visibleToPlayers:true`, label "Party Start"), enemy spawns (`icon:'danger'`, color `#ef4444`, **`visibleToPlayers:false`**, label from spec or "Enemy spawn N"), plus door pins from step 3,
   - `floorMask`, `widthPx = spec.width*cellSize`, `heightPx`, `ambientLight`, plus `warnings`.
   - Spawn repair against the TRUE mask: if a spawn cell is not floor or collides with a light-fixture token, relocate via `findEmptyCell` (`token-placement.ts`, F15) with walls rasterized through `rasterizeWall`.
5. Tests: single room → 4 merged wall segments; two rooms + corridor → mask connects them and walls flank the corridor; door splits a segment into 3 (left solid / door / right solid); secret door leaves wall solid + DM-only pin; out-of-floor spawn relocated onto floor; light kind→key mapping exact (`continual-flame` etc.).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json`, `npx vitest run src/renderer/src/services/map/battlemap/compile-spec.test.ts`.

**Acceptance:** all compiler outputs typed against `types/map.ts`; tests pass; no `document`/`window` references (`grep -n "document\.\|window\." compile-spec.ts` → none).

### 34D — Procedural tile renderer (canvas → PNG data URL)

**Objective:** Deterministic themed artwork for the compiled map, returned as a data URL that drops straight into `GameMap.imagePath` (F3).

**Files:** new `src/renderer/src/services/map/battlemap/tile-renderer.ts` + `tile-renderer.test.ts`.

**Steps:**
1. `mulberry32(seed: number)` PRNG + `hashString(s: string): number` — seed from `spec.name + width + height` so re-rendering the same spec is pixel-identical.
2. `THEME_PALETTES: Record<BattlemapTheme, { background, floorBase, floorJitter, wallColor, wallShadow, gridTint, accents }>` — e.g. dungeon: near-black `#0b0e13` background, grey flagstone floor `#3f4350` ±6% jitter; cave: brown/umber, jagged accent specks; tavern: wood-plank floor (`floor:'wood'` rooms draw plank lines); forest: grass greens with mottling; ship: planks + rope-brown accents. Room-level `floor` overrides the theme floor color per room rect.
3. `renderBattlemap(spec, compiled, cellSize, createCanvas: () => HTMLCanvasElement): string | null`:
   - canvas sized `widthPx × heightPx` (≤ 2400×2400 at the 60-cell cap); `getContext('2d')` null → return `null` (caller falls back to `imagePath: ''`, which the map background hook tolerates — F3);
   - paint background; for each floor cell paint `floorBase` jittered by the PRNG (per-cell ±lightness), plus theme accents (cracks/specks) on ~5% of cells;
   - terrain overlays: water = translucent blue fill, difficult = diagonal hatch, hazard = tinted cell + small glyph color;
   - walls: stroke each wall segment at `wallColor`, line width `cellSize*0.18`, with a 1px darker `wallShadow` inner stroke; doors: gap + door-jamb rectangles in accent color; windows: thin double line;
   - lights: radial-gradient warm glow (radius 1.5 cells, additive alpha ~0.25) baked under the dynamic lighting (real LoS lighting still comes from the engine — the bake is cosmetic);
   - return `canvas.toDataURL('image/png')`.
4. Tests (node env, F12): fake canvas factory returning a stub whose `getContext('2d')` yields a call-recording proxy — assert: determinism (same spec ⇒ identical recorded op list twice), null-context returns `null`, fillRect count ≥ floor-cell count, theme palette lookup is exhaustive over `BATTLEMAP_THEMES` (compile-time `satisfies Record<BattlemapTheme, …>`).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json`, `npx vitest run src/renderer/src/services/map/battlemap/tile-renderer.test.ts`.

**Acceptance:** renderer is injectable-canvas only (no direct `document` reference); deterministic; returns `null` gracefully without throwing when 2D context is unavailable.

### 34E — Apply layer: build the GameMap, sync it, attach lights — plus DM-only pin wire-filtering

**Objective:** One function that takes a spec and mutates game state correctly (store + network), and closure of the pin-leak gap (F5) that the feature would otherwise widen.

**Files:** new `src/renderer/src/services/map/battlemap/apply-spec.ts` + `apply-spec.test.ts`; edit `src/renderer/src/stores/network-store/index.ts` (addMap sanitizer), `src/renderer/src/stores/network-store/network-state-filter.ts` (+ its test file).

**Steps:**
1. `applyBattlemapSpec(spec, opts: { campaignId: string; switchTo: boolean; stores: StoreAccessors }): { mapId: string; mapName: string; warnings: string[] }`:
   - `compileSpec` → `renderBattlemap` (canvas factory = `() => document.createElement('canvas')`);
   - build `GameMap` mirroring `handleCreateMap` (`DMMapEditor.tsx:127-148`): `id: crypto.randomUUID()`, `name: spec.name`, `campaignId`, `imagePath: dataUrl ?? ''`, `width/height` px, grid `{ enabled: true, cellSize: 40, offsetX/Y: 0, color: '#4b5563', opacity: 0.4, type: 'square' }`, `tokens: lightFixture tokens`, `wallSegments`, `terrain`, `pins`, `fogOfWar: { enabled: true, revealedCells: [], dynamicFogEnabled: true }`, `createdAt`;
   - `gameStore.addMap(map)` (auto-broadcasts per F4);
   - per light fixture: `gameStore.lightSource(<id the renderer matches — see F6 note>, token.label, sourceKey, Infinity)` + `sendMessage('dm:light-source-update', { entityId, entityName: token.label, sourceName: sourceKey, action: 'light' })` — mirror `visibility-actions.ts:58-80`; skip silently when `inGameTime` is null (F6) and append a warning;
   - if `opts.switchTo`: `gameStore.setActiveMap(map.id)` + `sendMessage('dm:map-change', { mapId })` + `gameStore.setAmbientLight(spec.ambientLight)` (mirror `executeSwitchMap`, `effect-actions.ts:307-319`; only set ambient when switching — ambient light is global, not per-map);
   - `postDmMessage(stores, 'battlemap', …)` (`broadcast-helpers.ts:41-56`) with a summary the AI can read on its next turn: map name, size, party spawn coords, enemy spawn coords/labels — this is how the AI learns where to `place_creature` (F14).
2. **Pin wire-filtering (gap closure, F5):** in `stores/network-store/index.ts` `addMap` sanitizer (`:939-958`) also strip `pins` entries with `visibleToPlayers === false` for non-DM recipients, exactly parallel to the regions/drawings stripping; add the same stripping for the `pins` field wherever `network-state-filter.ts` filters per-map DM-only collections (follow the existing regions/drawings code path — `grep -n "regions\|drawings" network-state-filter.ts` to find the insertion points). Update/extend the colocated tests (`network-store/index.test.ts`, `network-state-filter.test.ts`) with a DM-only pin that must survive for the DM and vanish for players.
3. Tests (`apply-spec.test.ts`): with mocked stores — addMap called with fog enabled + walls/terrain/pins from compiler; light fixture triggers `lightSource(…, Infinity)` + `dm:light-source-update`; `switchTo:false` does not change `activeMapId` or ambient; null `inGameTime` yields warning, not throw.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json`, `npx vitest run src/renderer/src/services/map/battlemap/apply-spec.test.ts src/renderer/src/stores/network-store/network-state-filter.test.ts`.

**Acceptance:** one call yields a playable synced map; DM-only pins no longer cross the wire to players (test-proven).

### 34F — DM tool UI: Generate Battlemap modal

**Objective:** Manual, DM-only entry point with preview before committing.

**Files:** new `src/renderer/src/components/game/modals/dm-tools/GenerateBattlemapModal.tsx` + `GenerateBattlemapModal.test.tsx`; edit `DMMapEditor.tsx`, `src/renderer/src/i18n/locales/en.json`, `es.json`, regenerate `generated-keys.ts`.

**Steps:**
1. Modal (follow `CreateMapModal.tsx` structure incl. `useEscapeKey`): description textarea (required), optional theme select (from `BATTLEMAP_THEMES`), optional width/height selects (10–60), "Switch to map after creating" checkbox (default on), Generate button.
2. Generate → `setBusy` → `window.api.ai.generateBattlemap({ campaignId, prompt, theme, widthCells, heightCells })`. On success: run `compileSpec` + `renderBattlemap` locally and show the PNG preview (`<img src={dataUrl}>`) + name + warnings list + Regenerate / Create buttons. Create → `applyBattlemapSpec` → `onClose`. On error: inline error with the provider message + Retry (no toast-only failure).
3. `DMMapEditor.tsx`: add `showGenerateMap` state and a top-bar button beside the existing map controls (`:190-205` area) labeled via i18n; DMMapEditor itself is already DM-only, so no extra gating.
4. i18n: add `game.generateBattlemap.*` keys (title, descriptionLabel, descriptionPlaceholder, themeLabel, themeAuto, sizeLabel, switchToLabel, generate, regenerate, create, generating, error, warningsTitle) to BOTH `en.json` and `es.json` (professional Spanish, consistent with existing `game.dmMapEditor.*` tone), then `npm run i18n:gen-keys`.
5. Test: renders, Generate disabled while textarea empty, success path shows preview + Create, error path shows the error string (mock `window.api.ai.generateBattlemap`).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json`, `npx vitest run src/renderer/src/components/game/modals/dm-tools/GenerateBattlemapModal.test.tsx`.

**Acceptance:** DM can prompt → preview → create → (optionally) auto-switch; all strings i18n'd in both locales; key-union regenerated.

### 34G — Chat command `/genmap`

**Objective:** Keyboard-first path to the same pipeline.

**Files:** edit `src/renderer/src/services/chat-commands/commands-dm-map.ts` + `commands-dm-map.test.ts`, `src/renderer/src/services/chat-commands/index.ts` (only if the new command isn't part of an exported group already spread — `dmMapCommands` group is spread at `index.ts:79`; verify the export list at the bottom of `commands-dm-map.ts` and add there).

**Steps:**
1. New command: `{ name: 'genmap', aliases: ['generatemap'], category: 'dm', dmOnly: true, usage: '/genmap <description>', description: i18n'd, async execute(args, ctx) }` — args = the prose description; empty args → usage feedback. Execute calls `window.api.ai.generateBattlemap` then `applyBattlemapSpec(spec, { switchTo: true, … })`, returning progress/success/failure as command feedback messages (follow the async command pattern already used in this file — `ChatCommand.execute` supports promises, F11).
2. Resolve `campaignId` the same way neighboring DM commands do (check `ctx` shape in `chat-commands/types.ts` at execution; fall back to `getActiveCampaignId()` from `services/active-campaign-ref.ts:24-26`).
3. Test: name/alias registered exactly once in `allCommands` (no collision); non-DM rejected; empty args → usage; happy path calls the API mock and posts success feedback.

**Cheap checks:** `npx vitest run src/renderer/src/services/chat-commands/commands-dm-map.test.ts`.

**Acceptance:** `/genmap a two-room crypt with a locked door` produces a map end-to-end (API mocked in tests); registry collision test (PHASE-09, if landed) stays green.

### 34H — AI-initiated generation: `generate_battlemap` DM action behind an opt-in flag (default OFF)

**Objective:** Let the AI DM create maps itself — but only when the DM explicitly enables it (behavior-risky feature ⇒ opt-in, off by default).

**Files:** edit `src/renderer/src/types/campaign.ts` (`AiDmConfig`), `src/renderer/src/pages/campaign-detail/AiDmCard.tsx` (+ test), `src/main/ai/ai-schemas.ts`, `src/main/ai/dm-actions.ts`, `src/main/ai/prompt-sections/dm-actions-schema.ts`, `src/main/ai/prompt-assembler.ts`, `src/main/ai/conversation-manager.ts`, `src/renderer/src/services/game-action-executor.ts`; new `src/renderer/src/services/game-actions/battlemap-actions.ts` + `battlemap-actions.test.ts`.

**Steps:**
1. `AiDmConfig` (`campaign.ts:63-74`): add `allowMapGeneration?: boolean` (undefined ⇒ false). `AiDmCard.tsx`: add a checkbox row "Allow the AI DM to generate battlemaps" inside the configure modal (`:82+`), persisted into the `aiDm` object it already saves (`:100-103`); default unchecked. i18n both locales + `npm run i18n:gen-keys`.
2. Action contract (all three places per F7, keeping the contract test green in one edit):
   - `ai-schemas.ts`: `GenerateBattlemapActionSchema = z.object({ action: z.literal('generate_battlemap'), description: z.string().min(1), theme: z.enum(BATTLEMAP_THEMES).optional(), widthCells: z.number().int().optional(), heightCells: z.number().int().optional(), switchTo: z.boolean().optional() })`, registered in `DM_ACTION_SCHEMAS` (registry map at `:1334`).
   - `dm-actions.ts`: add the matching union member under the `// Map` group (`:96`).
   - `prompt-sections/dm-actions-schema.ts`: doc line — `generate_battlemap: {description, theme?, widthCells?, heightCells?, switchTo?} — generate a brand-new tactical battlemap from a prose description (rooms/corridors/doors/lights/terrain/spawns). Use when the party enters a location with no existing map. After the map is created, a system message reports its name and spawn coordinates — then use switch_map and place_creature.` — but emitted **conditionally** (step 3).
3. Conditional prompt advertisement: change `assembleSystemPrompt(gameMode)` (`prompt-assembler.ts:25`) to `assembleSystemPrompt(gameMode, opts?: { allowMapGeneration?: boolean })`; append the action doc (exported as a separate `GENERATE_BATTLEMAP_PROMPT` constant from `dm-actions-schema.ts`) only when the flag is true. In `conversation-manager.ts:95`, resolve the flag from the campaign via `loadCampaignById(campaignId)` (`campaign-context.ts:3-9`) reading `(campaign.aiDm as AiDmConfig | undefined)?.allowMapGeneration === true` — cache it on the manager so the system prompt stays byte-stable between turns (KV-cache, F9); refresh when the conversation is (re)created. Verify the call-site has async room (the surrounding function's signature) — if `:95` sits in a sync path, hoist the flag lookup to where the ConversationManager is constructed (`ai-service.ts getConversationManager`) and pass it in.
4. Executor: `case 'generate_battlemap':` → `executeGenerateBattlemap(action, gameStore, activeMap, stores)` in the new `battlemap-actions.ts`:
   - hard gate: load campaign from `useCampaignStore.getState().campaigns.find(c => c.id === getActiveCampaignId())` (dynamic import to respect the lazy-accessor convention, F10); `allowMapGeneration !== true` → `throw new Error('Map generation is disabled — enable it in AI DM settings')` (surfaces in `ExecutionResult.failed` and back to the AI);
   - dedupe guard: module-level `inFlight` flag; a second action while one is generating throws "already generating";
   - fire-and-forget async runner (pattern: `trigger-action-executor.ts:56-58`): `postDmMessage` "Generating battlemap…", `await window.api.ai.generateBattlemap(...)`, then `applyBattlemapSpec(spec, { switchTo: action.switchTo !== false, stores })`, then the success summary message (spawn coords); failure → `postDmMessage` with the error. Return `true` synchronously (kick-off succeeded — consistent with the resolve-now/narrate-next-message contract the executor already uses for AoE).
5. Approval flow: nothing extra — when `dmApprovalRequired` is on the action queues like any other (`game-action-executor.ts:196-207`). If PHASE-04's labeled approval panel landed, add a `generate_battlemap` label there; otherwise note for PHASE-04.
6. Tests (`battlemap-actions.test.ts`): flag off → throws with the settings message and no IPC call; flag on → IPC called with description/theme; in-flight dedupe; failure path posts a DM message and never throws asynchronously. `ai-schemas.test.ts` contract test must stay green (schema + executor case land in the same edit). Add a `prompt-assembler` test: flag false ⇒ prompt does NOT contain `generate_battlemap`; flag true ⇒ it does.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json`, `npx vitest run src/renderer/src/services/game-actions/battlemap-actions.test.ts src/main/ai/ai-schemas.test.ts src/main/ai/prompt-assembler.test.ts`.

**Acceptance:** with the toggle off (default) the AI never sees the action in its prompt and the executor rejects it anyway; with it on, the AI can generate + switch + place creatures at the reported spawn coordinates; contract test green.

## Research notes

- **Structured spec beats image-model generation.** Pure image generators produce demand-proven pictures but no walls/doors/lights, so no fog-of-war or LoS. [Dungeon Alchemist](https://www.dungeonalchemist.com/) (the audit's benchmark) ships VTT exports where "all walls, lights and doors" import as metadata — that metadata-first shape is what this phase reproduces natively. The wider ecosystem standardized on JSON-with-metadata: the [Universal VTT (.dd2vtt/.uvtt) format](https://arkenforge.com/universal-vtt-files/) is "an image with extra data attached — what size the image is, what colliders/obstacles exist, and what lights are in the scene", consumed by Foundry's [Universal Battlemap Importer](https://foundryvtt.com/packages/dd-import/) and Roll20 scripts; Foundry's [Battlemap Importer](https://foundryvtt.com/packages/quick-battlemap-importer) likewise takes JSON "walls, lights and doors". Our `BattlemapSpec` is intentionally UVTT-adjacent (walls/portals/lights + grid resolution), which leaves a cheap future export/import path (out of scope here).
- **LLM emits intent, engine derives geometry.** The LLM authors rooms/corridors/doors — not individual wall segments. Wall tracing from a floor mask is deterministic and cheap, while asking a 7–9B model for 80 coordinated wall segments invites contradictions; the audit's small-model schema research (flat objects, enums, few optionals, schema echoed in prompt, validate-against-state afterwards) drove the 34A shape. Prior art for "rect rooms + door list is enough": [watabou's One Page Dungeon generator](https://watabou.itch.io/one-page-dungeon) ([app](https://watabou.github.io/dungeon.html)) exports exactly "a list of rectangular rooms (including corridors) and a list of doors" plus water/columns, and downstream tools (Dungeondraft importer, Dungeon Scrawl) reconstruct full maps from it.
- **Per-provider structured output.** Ollama: native `/api/chat` `format: <json schema>` is decoder-level constrained generation — guaranteed shape, recommended with deterministic settings and `stream:false` ([blog](https://ollama.com/blog/structured-outputs), [API docs](https://docs.ollama.com/api/chat)); `format` is NOT enforced when streaming with thinking enabled ([ollama#14440](https://github.com/ollama/ollama/issues/14440)) — our call is non-streaming. The OpenAI-compatible endpoint also accepts `response_format` json_schema, but PHASE-01 moves the client to the native endpoint anyway (the compat endpoint can't set `num_ctx`). OpenAI: `response_format: { type:'json_schema', strict:true }` requires `additionalProperties:false` on every object ([guide](https://platform.openai.com/docs/guides/structured-outputs)). Gemini: `responseMimeType: 'application/json'` JSON mode; `responseSchema` exists but accepts only an OpenAPI-flavored subset on the pinned SDK ([docs](https://ai.google.dev/gemini-api/docs/structured-output)). Anthropic: structured outputs are `output_config: { format: { type:'json_schema', schema } }` with `additionalProperties:false` required and numeric min/max constraints unsupported (validate client-side) ([docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)) — the pinned SDK 0.100.1 lacks the typed param, so the Claude path stays prompt+zod-validate with a noted upgrade path. In ALL paths zod + `repairBattlemapSpec` remain the authority: constrained decoding guarantees shape, not sanity.
- **Why not a new "map lights" data model:** the engine's lighting is entirely token-attached (`ActiveLightSource` → carrier token position, F6); fixtures-as-scenery-tokens reuse raycast lighting, expiry, and the existing `dm:light-source-update` sync with zero new sync surface. A first-class static-light field would have touched the lighting overlay, both sync planes, and save migration for cosmetic gain.
- **Determinism & cache discipline:** seeded PRNG (mulberry32) keeps re-renders byte-identical (preview === final map; re-render after resize is stable). The new AI prompt section toggles only on a campaign setting change, preserving Ollama prefix-cache stability per PHASE-01's static-first rule. The dedicated generation prompt is small (~600 tokens + schema) — it deliberately does NOT reuse the ~9.6k-token DM system prompt, so CPU-only Ollama prefill stays in the seconds range for this call.
- **Alternatives considered:** (a) emitting the map as inline `[DM_ACTIONS]` (add_wall_segment × N…) — rejected: token-expensive, batch cap 50 (`game-action-executor.ts:166`), unreliable for small models; (b) rot.js/BSP procedural fallback generator with no LLM ([RogueBasin BSP reference](https://www.roguebasin.com/index.php/Basic_BSP_Dungeon_generation)) — rejected for scope; the spec+compiler split leaves room to add it later as a no-AI path; (c) image-model floorplan generation — rejected: no metadata (see first note).

## Test plan

- **34A** `src/shared/battlemap-spec.test.ts` — schema validation, repair/clamp/dedupe, JSON-schema post-processing.
- **34B** `src/main/ai/battlemap-generator.test.ts` — prompt content, fence-stripping/repair parse, single-retry, provider routing (mocked clients).
- **34C** `src/renderer/src/services/map/battlemap/compile-spec.test.ts` — floor mask, wall trace/merge counts, door splitting, secret/locked mapping, spawn repair, light key mapping.
- **34D** `…/tile-renderer.test.ts` — determinism via recorded-ops equality, null-context fallback, palette exhaustiveness.
- **34E** `…/apply-spec.test.ts` + updated `network-state-filter.test.ts` / `network-store/index.test.ts` — store/network effects, light attach + broadcast, DM-only pin stripping.
- **34F** `GenerateBattlemapModal.test.tsx` — gating, preview, error surface.
- **34G** `commands-dm-map.test.ts` — registration, dmOnly, usage, happy path.
- **34H** `battlemap-actions.test.ts`, extended `ai-schemas.test.ts` (contract auto-covers), `prompt-assembler.test.ts` (conditional section), `AiDmCard.test.tsx` (toggle persists).
- **End-of-phase 4-gate** (INSTRUCTIONS.md rule 5): `npm run lint`, `npx tsc --noEmit -p tsconfig.web.json`, `npx tsc --noEmit -p tsconfig.node.json`, full `npx vitest run`. No Pi code touched ⇒ no pytest. Coverage thresholds (`vitest.config.ts:21-26`) are satisfied by the new colocated suites (all new services land with tests).

## Acceptance criteria

1. A DM can open Map Editor → Generate Battlemap, type a prose description, preview the rendered map, and create it — the created `GameMap` has a non-empty rendered `imagePath`, wall segments with at least one openable `door` (when the spec has doors), terrain cells, fog-of-war enabled, a player-visible party-spawn pin and DM-only enemy-spawn pins, and light-fixture tokens with attached non-expiring light sources.
2. `/genmap <description>` produces the same result and switches to the map.
3. The generated map syncs: a connected player receives it via `addMap` WITHOUT DM-only pins (wire-verified by test), sees fog + walls, and door open/close works like hand-placed doors.
4. With `aiDm.allowMapGeneration` unset/false (default): the AI system prompt contains no `generate_battlemap` documentation and an injected `generate_battlemap` action fails with a settings-pointing error. With it true: the action generates, announces spawn coordinates in chat, and honors `switchTo`.
5. Generation works on all four providers (Ollama via native `format` constrained decoding; cloud via JSON modes/prompt) with one automatic repair-retry; invalid output yields a user-readable error, never a crash or a half-built map.
6. Same spec ⇒ identical rendered image (determinism test).
7. End-of-phase 4-gate green; `ai-schemas.test.ts` schema↔executor contract test green with the new action.

## Out of scope

- Diffusion/image-model scene or portrait art — **PHASE-33**.
- Cinematic scene-mode toggle (full-bleed art view) — **PHASE-35**.
- Auto-placing/statting enemy creatures on the generated map (the AI follows up with existing `place_creature`; automated monster turns are **PHASE-30**).
- Universal VTT (.uvtt/.dd2vtt) import/export of generated maps — future idea; log to `docs/SUGGESTIONS-LOG-DNDAPP.md` if desired during execution.
- Multi-floor generated maps (`floors[]`), hex-grid generation, and a no-LLM BSP fallback generator — deliberate v1 cuts; none blocks later addition.
- Rewriting how ambient light persists per-map (it is global state today) — unchanged.
- The unused `backgroundColor` field in `CreateMapModal` (F3 drift note) — cosmetic, log if touched.

## Completed

- **34A — shared spec.** NEW `src/shared/battlemap-spec.ts`: flat enum-heavy `BattlemapSpecSchema`
  (rooms/corridors/doors/lights/terrain/spawns), `battlemapSpecJsonSchema()` (zod-v4 emitter +
  recursive `additionalProperties:false`), deterministic `repairBattlemapSpec` (clamp/drop/dedupe,
  relocate spawns to nearest room cell, `BattlemapSpecError` on zero rooms) + test (7). Both tsconfigs.
- **34B — generator + IPC.** NEW `main/ai/battlemap-generator.ts`: `buildBattlemapSystemPrompt` (small
  schema-echoing prompt) + `generateBattlemapSpec` (Ollama via existing `ollamaStructuredOnce` native
  `format`; cloud via new `ai-service.chatOncePrimary` — primary model, NOT task-routed; fence-strip +
  `repairJson` + safeParse + ONE retry + repair + dim/theme overrides) + test (6). `ai-service`
  `getPrimaryProviderInfo`/`chatOncePrimary`. IPC `AI_GENERATE_BATTLEMAP` + `BattlemapGenerationRequestSchema`
  + handler + preload BOTH files.
- **34C — compiler.** NEW `services/map/battlemap/compile-spec.ts` (pure, DOM-free): `buildFloorMask`
  (rooms + L-corridors), `traceWalls` (cell-edge → merged maximal segments; 3×3 → 4 segs), `compileSpec`
  → wallSegments (door-split: door/window/secret + locked/secret DM-only pins), terrain, light fixtures
  (kind→LIGHT_SOURCES key), pins (party visible / enemies DM-only), spawn relocation vs the true mask + test (7).
- **34D — tile renderer.** NEW `tile-renderer.ts`: `mulberry32`+`hashString` seeded PRNG, exhaustive
  `THEME_PALETTES`, `renderBattlemap(spec, compiled, cellSize, createCanvas)` → PNG data URL (floor jitter,
  terrain overlays, walls/doors/windows, light glows), null on no-2D-context. Injected canvas factory + test
  (6, node-env stub, determinism).
- **34E — apply + pin filter.** NEW `apply-spec.ts` `applyBattlemapSpec` (compile→render→build GameMap→
  `addMap`→light fixtures `lightSource(Infinity)`+broadcast→optional switch+ambient→DM summary) + test (5).
  Closed the F5 gap: DM-only pins (`visibleToPlayers === false`) now stripped in the `addMap` wire sanitizer
  (`network-store/index.ts`) AND the join-time `filterMapForPlayer` (`network-state-filter.ts`) + index test.
- **34F — modal.** NEW `GenerateBattlemapModal.tsx` (prompt/theme/size/switch → generate → preview → create)
  + `active-modal-types` `'generateBattlemap'` (+test) + DmModals mount + DMTabPanel button + i18n + test (3).
- **34G — `/genmap`.** `commands-dm-map.ts` `genmap`/`generatemap` (dynamic-imports apply-spec + store-accessors
  to avoid cycles) + test; collision test green.
- **34H — AI action (opt-in).** `AiDmConfig.allowMapGeneration` + AiDmCard toggle (4 sites + persist) + i18n.
  `generate_battlemap` action: ai-schemas `GenerateBattlemapActionSchema` + `DM_ACTION_SCHEMAS` + dm-actions
  union + `GENERATE_BATTLEMAP_PROMPT` (conditional). `assembleSystemPrompt({allowMapGeneration})` appends the
  doc only when on; `conversation-manager.mapGenerationAllowed` set from the campaign in the chat path.
  NEW `battlemap-actions.ts` `executeGenerateBattlemap` (hard gate + single-flight + fire-and-forget) + executor
  dispatch + test (4). prompt-assembler test (flag on/off).
- **Gate.** Full 4-gate (lint, tsc web+node, vitest) green. No `bmo/pi/` touched. Default-OFF: the AI never
  sees `generate_battlemap` unless the flag is on (and the executor rejects it anyway); DM-only spawn pins
  never cross the wire.

(filled during execution per INSTRUCTIONS.md rule 17 — one line per sub-phase with file:line citations)
