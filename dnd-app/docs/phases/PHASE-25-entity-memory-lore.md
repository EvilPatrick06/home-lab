# PHASE-25 — Entity memory & lore: auto-extracted entity records, editable lore context, keyword-triggered world info

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Give the AI DM a durable, **player-correctable** descriptive memory: discrete entity records (NPC / location / item / faction) that are auto-extracted from play (via a flat `record_entity` DM-action verb plus an optional post-turn structured-extraction call), stored per campaign, viewable AND editable in a DM-facing panel (the Friends & Fables "Franz 2.0" pattern — editability is the mechanism that corrects AI memory drift without restarting a campaign), and injected into the prompt as labeled `[ENTITY RECORDS]` context blocks. Alongside, the existing campaign lore substrate (`Campaign.lore` + `LoreManager`) gains SillyTavern-style **keyword-triggered world-info injection**: per-entry trigger keywords, a deterministic zero-embedding scan over recent chat + game state, and a labeled `[LORE]` block — so large lorebooks stop being dumped (and tail-trimmed) wholesale into every prompt. All new AI-facing behavior is **opt-in and off by default**: with the flags off, prompts are content-identical to today (the only always-on change is relabeling the existing lore lines from `Lore:` to a `[LORE]`…`[/LORE]` block, which PHASE-31's Q&A assembler depends on).

## Dependencies & cross-phase notes

**Prerequisites (phases run in numeric order; both land before this one):**

- **PHASE-23 (structured-outputs)** — ships `src/main/ai/structured-extraction.ts` with a `structuredOnce` provider capability (Ollama `format` = JSON schema, `stream:false`) and the flat small-model schema discipline. Sub-phase 25C's entity-extraction call prefers `provider.structuredOnce` when present and falls back to the existing `chatOnce` (`src/main/ai/llm-provider.ts:33`, verified present today) with tolerant JSON parsing — so 25C works whether or not 23's capability landed exactly as planned. **At execution, re-verify 23's landed shape** (`grep -n "structuredOnce" src/main/ai/llm-provider.ts src/main/ai/ollama-client.ts`).
- **PHASE-24 (rules-rag-hybrid)** — declared dependency (PHASE-INDEX row 25). PHASE-24 owns *retrieval indexing* of campaign content (journals/handouts/lore into the search engine). PHASE-25 owns the complementary *deterministic* mechanisms: discrete editable records and keyword-triggered injection. **At execution, read `completed/PHASE-24-*.md`'s Completed section**: if 24 changed `src/main/ai/search-engine.ts`, `context-builder.ts` step 1, or began indexing `campaign.lore`, keep both mechanisms (they are complementary — RAG is similarity-ranked, world-info is keyword-deterministic), but re-verify every `context-builder.ts` line citation below (rule 3/22).

**Downstream consumers (their plans are already written against this phase):**

- **PHASE-27 (world-state-store)** — "PHASE-25 owns descriptive/editable knowledge (who an NPC is, lore text); PHASE-27 owns mutable mechanical state" (PHASE-27-world-state-store.md:14). PHASE-27 references NPCs by the same slugified-name id convention; 25A exports `slugifyId` from `entity-store.ts` so 27A may import it instead of redefining (27's plan allows either). PHASE-27F prepends its `[WORLD STATE]` block to the same step-7 memory segment 25E uses — 27 rebases on 25's landed shape.
- **PHASE-31 (recaps-qa-assistant)** — expects `[ENTITY RECORDS]` / `[LORE]` labeled blocks "via whatever context-block builder Phase 25 shipped" (PHASE-31:181,191). 25A's `buildEntityContextBlock` and 25E's exported `buildLoreBlock` are those builders — keep them exported, pure where possible, and documented.
- **PHASE-37 (seed-packs)** — pre-commits to mapping seed-pack per-lore-entry `keywords` into a `LoreEntry.keywords?: string[]` field "IF it exists at execution time" (PHASE-37:11,130,146). Sub-phase 25D adds exactly that field — keep the name `keywords` and type `string[]`.
- **PHASE-28** (director/quests) and **PHASE-21** (per-NPC voice casting) name entity records as substrate; nothing here needs to change for them beyond stable exports.

**Same-file coordination:**

- `src/main/ai/ai-service.ts` — PHASE-23 edits `handleStreamCompletion`'s terminal block (adds the mutation-extraction call) and threads a resolved-model parameter into it. 25C inserts a fire-and-forget call in the same terminal block and 25E adds one argument at the `buildContext` call site (`:654`). Land 25 after re-verifying 23's landed diff; cite the post-23 line numbers in the Completed section.
- `src/main/ai/context-builder.ts` — PHASE-24 (retrieval) and PHASE-26 (scene summarization; runs after 25) touch adjacent steps; PHASE-27F later prepends to the same step-7 segment. 25E's edits are additive (new optional parameter, new gated block).
- `src/shared/ipc-channels.ts` / `ipc-schemas.ts` / `src/preload/index.ts` / `index.d.ts` — PHASE-27D appends its own channel block after this phase's; keep the new block clearly delimited.
- `src/main/ipc/ai-handlers.ts` — PHASE-13 extends `sanitizeCampaignId` to ten legacy handlers. Every **new** handler added here calls `sanitizeCampaignId` (`ai-handlers.ts:92-103`) from day one; do not touch the legacy ones.
- `src/renderer/src/types/campaign.ts` — PHASE-23 adds `structuredExtraction` to `AiDmConfig` (`:63-74`); 25D adds `keywords` to `LoreEntry` (`:52-59`). Different interfaces, same file — no conflict expected.
- `src/main/ai/prompt-sections/dm-actions-schema.ts` — PHASE-11 owns it. This phase deliberately does NOT edit it: the `record_entity` verb documentation lives in a NEW gated context block (`prompt-sections/entity-records.ts`), mirroring PHASE-27F's rationale (sync prompt assembly cannot read per-campaign flags; see F7).

## Verified findings

All verifications run 2026-06-10 against the live tree (worktree `ai-p6-roadmap`, branch `master`, pre-PHASE-01..24 execution). Re-run each command before implementing; line numbers WILL drift after phases 01–24 land.

### F1 — CORRECTED: the player-authored-lore substrate already exists (audit proposed building it)

The audit entry ("Player-authored lore that joins AI context… Equivalent here: a 'Lore' library category (or journal flag) whose entries the memory-manager injects by relevance") drifted from reality on two counts:

1. The substrate exists. `LoreEntry` is defined at `src/renderer/src/types/campaign.ts:52-59` — `{ id, title, content, category: 'world'|'faction'|'location'|'item'|'other', isVisibleToPlayers: boolean, createdAt }` — stored on `Campaign.lore?: LoreEntry[]` (`campaign.ts:112`). A full CRUD UI exists: `src/renderer/src/pages/campaign-detail/LoreManager.tsx` (202 lines — add/edit/delete/visibility-toggle/import/export via `services/io/entity-io`). `CampaignWizard.tsx:346` seeds wizard lore with `isVisibleToPlayers: l.category !== 'faction'`.
2. The memory-manager does NOT inject lore and nothing injects "by relevance". Lore reaches the AI through `formatCampaignForContext` (`src/main/ai/campaign-context.ts:62-76`): EVERY entry, EVERY turn, as plain `- Title [category]: content` lines inside the `[CAMPAIGN DATA]` block, which `buildContext` step 4 (`src/main/ai/context-builder.ts:270-283`) trims to `TOKEN_BUDGETS.campaignData` = 2000 tokens (`src/main/data/token-budgets.json`). `trimToTokenBudget` cuts the TAIL (`src/main/ai/token-budget.ts:41-51`), so a large lorebook silently truncates everything after its position (maps/settings/journal) and is itself at risk.

What's genuinely missing (this phase's lore scope): per-entry trigger keywords, a deterministic relevance scan, and a labeled block.

```bash
cd dnd-app
sed -n '52,59p;110,114p' src/renderer/src/types/campaign.ts        # LoreEntry + Campaign.lore
sed -n '62,76p' src/main/ai/campaign-context.ts                    # unconditional lore dump
sed -n '270,283p;306,319p' src/main/ai/context-builder.ts          # step 4 (campaign) + step 7 (memory)
sed -n '41,51p' src/main/ai/token-budget.ts                        # tail-trim
grep '"campaignData"\|"memory"' src/main/data/token-budgets.json   # → 2000 / 2000
grep -rn "keywords" src/renderer/src/types/campaign.ts             # → no keywords field yet
```

### F2 — No keyword/state-triggered injection mechanism exists anywhere

Nothing in the AI pipeline scans recent messages or game state for trigger words. `src/main/ai/keyword-extractor.ts` is a stop-word/compound-term tokenizer consumed only by the rules `search-engine.ts` (`search-engine.ts:1,56`) — it extracts keywords FROM a query for BM25-ish rules scoring; it does not match lore/entity keys against a transcript. Conversation history is available at context-build time: `startChat` adds the user message to the conversation (`src/main/ai/ai-service.ts:634`) BEFORE calling `buildContext` (`:654-661`), and `ConversationManager.getMessages()` exposes the full message array (`src/main/ai/conversation-manager.ts:45-47`) — so a scan-text can be assembled at the `buildContext` call site without new plumbing.

```bash
grep -rn "extractKeywords\|keyword-extractor" src/main --include='*.ts' | grep -v test   # search-engine only
sed -n '630,661p' src/main/ai/ai-service.ts                       # addMessage → buildContext ordering
sed -n '45,47p' src/main/ai/conversation-manager.ts               # getMessages()
```

### F3 — Entity records do not exist; the closest things are two disjoint NPC stores and a writer-less places file

- AI-written NPC memory: `npcs.json` (`NPCMemory`, `src/main/ai/memory-manager.ts:37-46` — global attitude, role, location, notes) written only from `npc_attitude` stat-changes in the stream-done path (`ai-service.ts:888-896` → `npcMemoryFromAttitude`, `memory-manager.ts:61-78`), and `npc-personalities.json` (`NPCPersonality`, `src/main/ai/types.ts:102-112`) written by seven DM-action verbs (F4).
- DM-authored campaign NPCs: `campaign.npcs: NPC[]` (campaign-detail page), injected via `formatCampaignForContext` (`campaign-context.ts:32-60`).
- Locations: `PlaceMemory` (`memory-manager.ts:80-88`) has **zero production writers** — `upsertPlace`/`getPlaces` are called only by `memory-manager.ts` itself and its test, so `[PLACES]` is always empty in production (also independently verified by PHASE-27 F2).
- Items / factions: no descriptive records at all (`faction-reputation.json` is a numeric standing, `memory-manager.ts:487-509`; attunement is per-character state).

There is no unified record shape, no aliases, no keywords, no view/edit surface, and nothing the audit's "auto-extract NPCs/locations/items/factions into discrete records" describes.

```bash
grep -rn "upsertPlace\|getPlaces" src --include='*.ts' | grep -v test | grep -v 'memory-manager.ts'   # → empty
sed -n '37,46p;61,78p;80,88p' src/main/ai/memory-manager.ts
sed -n '885,900p' src/main/ai/ai-service.ts
```

### F4 — The DM-action verb pipeline this phase extends (pattern to copy exactly)

Seven NPC/world verbs already flow end-to-end and are the template for `record_entity`:

- zod schemas `src/main/ai/ai-schemas.ts:1187-1247` (`log_npc_interaction`, `set_npc_relationship`, `update_quest_log`, `adjust_faction_standing`, `set_npc_faction`, `set_npc_location`, `set_npc_secret_motivation`), registered in the `DM_ACTION_SCHEMAS` map (`:1276`, entries at `:1382-1388`); `validateDmAction` (`:1461`) **silently drops** any action missing from the map (the documented `light_source` lesson — comment above `LightSourceSchema` at `:1255-1257`).
- renderer executors `src/renderer/src/services/game-actions/effect-actions.ts:563-638` (fire-and-forget `window.api.ai.X?.(…)`), dispatched from `src/renderer/src/services/game-action-executor.ts:442-455`.
- IPC handlers `src/main/ipc/ai-handlers.ts:455-524` → `MemoryManager`. These legacy handlers lack `sanitizeCampaignId` — **owned by PHASE-13, do not fix here**; the helper to call in NEW handlers is at `ai-handlers.ts:92-103` (UUID regex + resolved-path containment).
- preload bridge `src/preload/index.ts:128-160`, typed in `src/preload/index.d.ts:272-299`.
- IPC channel constants: AI memory/NPC block at `src/shared/ipc-channels.ts:102-116`; boundary zod lives in `src/shared/ipc-schemas.ts` (pattern: `AiConfigSchema` at `:5-13`).

```bash
sed -n '1187,1247p;1276,1280p;1382,1388p' src/main/ai/ai-schemas.ts
sed -n '563,638p' src/renderer/src/services/game-actions/effect-actions.ts
sed -n '442,455p' src/renderer/src/services/game-action-executor.ts
sed -n '92,103p;455,524p' src/main/ipc/ai-handlers.ts
sed -n '102,116p' src/shared/ipc-channels.ts
```

### F5 — The only memory UI is a raw read-only file viewer with a nuke button

`src/renderer/src/components/game/bottom/AiContextPanel.tsx` (149 lines) lists `ai-context/` files via `AI_LIST_MEMORY_FILES`, shows raw JSON via `AI_READ_MEMORY_FILE` in a `<pre>` (`:132-141`), and offers only `AI_CLEAR_MEMORY` (delete EVERYTHING, `:65-78`). No per-record view, no editing, no per-record delete. It is lazy-mounted in the DM-only `DMTabPanel.tsx` (`:11`, mount at `:280`). The handlers behind it walk/read/rm `userData/campaigns/{id}/ai-context/` (`ai-handlers.ts:367-419`) — a new `entities.json` in that directory is automatically visible to this raw viewer and cleared by the existing clear-all (acceptable; the new panel adds the structured surface).

```bash
sed -n '28,78p;109,145p' src/renderer/src/components/game/bottom/AiContextPanel.tsx
grep -n "AiContextPanel" src/renderer/src/components/game/bottom/DMTabPanel.tsx
sed -n '367,419p' src/main/ipc/ai-handlers.ts
```

### F6 — Memory-manager storage patterns to mirror (locking, size caps, factory, slug)

`MemoryManager` (`src/main/ai/memory-manager.ts`) establishes the conventions the new entity store must copy: per-file promise-chain write lock (`mutate()`, `:162-179` — keeps the chain alive via `.catch(() => {})`), per-file 1 MB cap with oldest-first array pruning (`writeJson`, `:119-138`, `MAX_MEMORY_FILE_SIZE` `:8`), directory-total 10 MB budget with `.old` rotation (`enforceTotalSize`, `:143-160` — only enforced on MemoryManager's own writes; the entity store implements its own per-file cap), module-level factory cache (`getMemoryManager`, `:644-651`), and the slug derivation `trim → lowercase → [^a-z0-9]+ → '-' → strip edge dashes` (`npcMemoryFromAttitude`, `:65-69`) that PHASE-27 standardizes on. Test mocking pattern: `memory-manager.test.ts:1-25` (vi.mock `electron` `app.getPath`, vi.hoisted `fs.promises`, stubbed `crypto.randomUUID`).

```bash
sed -n '8,9p;65,69p;119,138p;143,179p;644,651p' src/main/ai/memory-manager.ts
sed -n '1,25p' src/main/ai/memory-manager.test.ts
```

### F7 — System-prompt assembly is synchronous and campaign-agnostic; gated content belongs in the context

`assembleSystemPrompt(gameMode)` (`src/main/ai/prompt-assembler.ts:25`) is sync and takes no campaign id, so per-campaign feature flags cannot gate system-prompt sections without an invasive refactor. `buildContext` is async and per-campaign. Therefore (same conclusion PHASE-27F reached independently): the `record_entity` verb documentation and the `[ENTITY RECORDS]` block are injected via the context, gated by the store's `enabled` flag, NOT added to `dm-actions-schema.ts`. Verb-doc style to imitate: `prompt-sections/dm-actions-schema.ts:222-233` (backticked verb + param shape + one-sentence guidance).

```bash
sed -n '20,30p' src/main/ai/prompt-assembler.ts
sed -n '215,240p' src/main/ai/prompt-sections/dm-actions-schema.ts
```

### F8 — Flags storage precedent and config threading

The campaign object IS main-readable (`loadCampaignById`, `campaign-context.ts:3-9`), but this phase stores its three flags (`enabled`, `autoExtract`, `loreMode`) inside `ai-context/entities.json` (engine-owned, toggled over IPC) rather than on `campaign.aiDm` — consistent with PHASE-27G's choice for its flag, avoiding renderer save-path churn in `AiDmCard.tsx` (which PHASE-10 and PHASE-23 both edit) and keeping campaign-schema changes limited to the PHASE-37-contracted `LoreEntry.keywords`. `AiChatRequest.gameState` (renderer-formatted snapshot string) is already passed into `buildContext` (`ai-service.ts:659`) and serves as the **state** source for state-triggered keys ("under attack" entries fire when the game-state text contains the phrase).

```bash
sed -n '3,9p' src/main/ai/campaign-context.ts
sed -n '24,31p' src/shared/ipc-schemas.ts        # AiChatRequestSchema.gameState
```

## Sub-phases

Order keeps the tree green: store module first, then transport/verb plumbing, then the extraction call, then the renderer type + lore UI, then context injection, then the panel UI, then docs + gate.

### 25A — `entity-store.ts`: schema, serialized IO, merge/lock semantics, context block

**Objective:** the per-campaign entity-record store module. No behavior change anywhere else.

**Files:** NEW `src/main/ai/entity-store.ts`, NEW `src/main/ai/entity-store.test.ts`.

**Steps:**

1. Zod schemas (strict, bounded) + inferred types, all exported:

   ```ts
   export const EntityKindSchema = z.enum(['npc', 'location', 'item', 'faction'])
   export const EntityRecordSchema = z.object({
     id: z.string(),                                  // slugifyId(name) — ids ARE names (Intra/PHASE-27 convention)
     name: z.string().min(1).max(120),
     kind: EntityKindSchema,
     summary: z.string().max(400).default(''),        // one-paragraph "who/what this is"
     details: z.string().max(1200).default(''),       // optional longer notes
     aliases: z.array(z.string().max(60)).max(6).default([]),
     keywords: z.array(z.string().max(40)).max(8).default([]),
     injection: z.enum(['auto', 'always', 'never']).default('auto'),
     source: z.enum(['ai', 'extraction', 'dm']),
     locked: z.boolean().default(false),              // true once a DM edits — AI/extraction may then only bump lastSeenAt/mentions
     mentions: z.number().int().min(0).default(0),
     createdAt: z.string(),
     updatedAt: z.string(),
     lastSeenAt: z.string()
   })
   export const EntityStoreConfigSchema = z.object({
     enabled: z.boolean().default(false),             // master flag: context block + verb docs + extraction
     autoExtract: z.boolean().default(false),         // post-turn extraction call (25C); requires enabled
     loreMode: z.enum(['all', 'triggered']).default('all')   // lore injection mode (25E)
   })
   export const EntityStoreFileSchema = z.object({
     version: z.literal(1),
     config: EntityStoreConfigSchema.default({}),
     records: z.array(EntityRecordSchema).max(400).default([]),
     updatedAt: z.string()
   })
   ```

2. `export function slugifyId(name: string): string` — byte-identical derivation to `npcMemoryFromAttitude` (`memory-manager.ts:65-69`), with a comment cross-referencing it and PHASE-27 (which may import this export).
3. Class `EntityStore` (constructor takes `campaignId`; file `app.getPath('userData')/campaigns/{id}/ai-context/entities.json`; campaignId is sanitized at the IPC boundary in 25B — same trust model as `MemoryManager`):
   - Single serialized mutation queue: `withLock<T>(fn)` chains on a private promise (alive via `.catch(() => {})`, mirroring `memory-manager.ts:174-177`), reads + `safeParse`s the file inside the lock (corrupt/absent → empty store with default config), runs the mutator, then writes `entities.json.tmp` + `fs.rename` (atomic). Before write, enforce the 1 MB per-file cap by evicting records — eviction order: unlocked `source:'ai'|'extraction'` records by oldest `lastSeenAt` first; never evict `locked` or `source:'dm'` records; also FIFO-evict past the 400-record schema cap with the same priority.
   - `getSnapshot(): Promise<{config, records}>` (read-only, may read outside the lock); `getConfig()`; `setConfig(partial: Partial<EntityStoreConfig>)` (via lock; maintain a module-level `Map<campaignId, EntityStoreConfig>` cache refreshed on every read/write so 25E's per-turn hot path doesn't hit disk twice — invalidated by `setConfig`).
   - `upsertEntity(input: {name, kind, summary?, details?, aliases?, keywords?, injection?, source}): Promise<{applied: boolean, detail: string}>` — resolve case-insensitively against existing `name`+`aliases`, then by `slugifyId`. New → create with timestamps, `mentions:1`. Existing → always bump `lastSeenAt` + `mentions`; if existing record is `locked` and incoming `source !== 'dm'`, change NOTHING else (`applied:false`, detail `'locked by DM edit'`); if incoming `source==='dm'`, apply all provided fields and set `locked:true`, `source:'dm'`; otherwise (AI→unlocked) fill only *empty* `summary`/`details`, union-merge `aliases`/`keywords` (respecting caps), and update `kind` only if the existing record was a bare stub (empty summary). Never throws on semantic rejection.
   - `deleteEntity(idOrName: string): Promise<boolean>`; `touchEntity(name: string)` (lastSeenAt/mentions bump used by the extraction dedupe path).
   - `selectEntities(scanText: string, caps?: {maxRecords?: number}): Promise<EntityRecord[]>` — pure selection logic in an exported helper `pickEntities(records, scanText, caps)` (testable without IO): include all `injection:'always'`; include `injection:'auto'` records whose `name`, any `alias`, or any `keyword` matches `scanText` case-insensitively on **whole-word boundaries** (escape the key, wrap in `(?:^|[^a-z0-9])key(?:[^a-z0-9]|$)` — SillyTavern's default "match whole words" behavior, see Research notes); exclude `injection:'never'`; rank matched-then-always by `lastSeenAt` desc; cap at `maxRecords ?? 12`.
   - `buildEntityContextBlock(scanText: string): Promise<string>` — deterministic, bounded, the builder PHASE-31 consumes:

     ```
     [ENTITY RECORDS]
     NPC — Ama Tilen (aka "the herbalist"): summary…
       details… (details line only for the first 4 selected records with non-empty details)
     LOCATION — Brindlemark: summary…
     FACTION — Ashen Veil: summary…
     [/ENTITY RECORDS]
     ```

     Empty selection → empty string. Records grouped by kind in the order npc, location, faction, item.
   - Factory `getEntityStore(campaignId)` with a module `Map` cache (mirror `getMemoryManager`, `memory-manager.ts:644-651`).
4. Tests (`entity-store.test.ts`, mock pattern from `memory-manager.test.ts:1-25`; for atomic-write coverage add `rename` to the mocked `fs.promises`): schema round-trip + defaults; corrupt file → empty store; 10 concurrent `upsertEntity` for the same new name → exactly ONE record (lock); locked-record AI upsert is a no-op except lastSeenAt/mentions; DM upsert sets `locked`; alias-based resolution; `pickEntities` whole-word matching ("rose" does not match "rosewood"), case-insensitivity, `always`/`never` handling, cap + ranking; eviction never removes locked/dm records; `buildEntityContextBlock` snapshot; `slugifyId` parity with `npcMemoryFromAttitude` (import both, property-test a few names).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json`; `npx vitest run src/main/ai/entity-store.test.ts`.

**Acceptance:** module + tests green; no other file touched; `entities.json` is only created when the factory is used.

### 25B — `record_entity` verb + full IPC plumbing (channels, schemas, preload, handlers)

**Objective:** the AI can emit `record_entity` and the renderer/UI can read, upsert, delete, and configure records — typed, zod-validated, sanitized end-to-end.

**Files:** `src/main/ai/ai-schemas.ts` (+ `ai-schemas.test.ts`), `src/renderer/src/services/game-actions/effect-actions.ts` (+ its test), `src/renderer/src/services/game-action-executor.ts`, `src/shared/ipc-channels.ts`, `src/shared/ipc-schemas.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`, `src/main/ipc/ai-handlers.ts`.

**Steps:**

1. `ai-schemas.ts` — one flat schema next to the NPC-tracking block (~`:1187`):

   ```ts
   const RecordEntitySchema = z.object({
     action: z.literal('record_entity'),
     kind: z.enum(['npc', 'location', 'item', 'faction']),
     name: z.string(),
     summary: z.string(),
     keywords: z.array(z.string()).optional()
   })
   ```

   **Register it in `DM_ACTION_SCHEMAS`** (~`:1382` block) — the `light_source` lesson: unmapped = silently dropped. Add a map-membership assertion + parse tests to `ai-schemas.test.ts`. Upsert semantics make a separate `update_entity` verb unnecessary (one verb = less prompt surface for small models).
2. `ipc-channels.ts` — append a delimited block after `AI_ADJUST_FACTION_STANDING` (`:116`):

   ```ts
   // === AI DM: Entity records & lore injection (PHASE-25) ===
   AI_ENTITIES_GET: 'ai:entities-get',
   AI_ENTITY_UPSERT: 'ai:entity-upsert',
   AI_ENTITY_DELETE: 'ai:entity-delete',
   AI_ENTITIES_SET_CONFIG: 'ai:entities-set-config',
   ```

3. `ipc-schemas.ts` — boundary schemas (separate from the DM-action zod, repo convention):

   ```ts
   export const EntityUpsertPayloadSchema = z.object({
     kind: z.enum(['npc', 'location', 'item', 'faction']),
     name: z.string().min(1).max(120),
     summary: z.string().max(400).optional(),
     details: z.string().max(1200).optional(),
     aliases: z.array(z.string().max(60)).max(6).optional(),
     keywords: z.array(z.string().max(40)).max(8).optional(),
     injection: z.enum(['auto', 'always', 'never']).optional(),
     source: z.enum(['ai', 'dm']).default('ai')
   })
   export const EntityStoreConfigPatchSchema = z.object({
     enabled: z.boolean().optional(),
     autoExtract: z.boolean().optional(),
     loreMode: z.enum(['all', 'triggered']).optional()
   })
   export type EntityUpsertPayload = z.infer<typeof EntityUpsertPayloadSchema>
   ```

4. `ai-handlers.ts` — four handlers via the existing `handle()` wrapper, each beginning with `sanitizeCampaignId(campaignId)`:
   - `AI_ENTITIES_GET` → `{ success: true, ...await getEntityStore(id).getSnapshot() }`.
   - `AI_ENTITY_UPSERT` `(campaignId, payload: unknown)` → `EntityUpsertPayloadSchema.safeParse`; fail → `{success:false, error}`; pass → `upsertEntity(parsed.data)` → `{success:true, applied, detail}`.
   - `AI_ENTITY_DELETE` `(campaignId, idOrName: unknown)` → coerce `z.string().min(1).max(160)`, `deleteEntity`, `{success, deleted}`.
   - `AI_ENTITIES_SET_CONFIG` `(campaignId, patch: unknown)` → `EntityStoreConfigPatchSchema.safeParse`, `setConfig`, return the new config.
5. Preload (`index.ts` `api.ai` block, `:128-160` region): `getEntities(campaignId)`, `upsertEntity(campaignId, payload)`, `deleteEntity(campaignId, idOrName)`, `setEntitiesConfig(campaignId, patch)`; mirror in `index.d.ts` (pattern at `:272-299`), importing payload types from `src/shared/ipc-schemas`.
6. `effect-actions.ts` — `executeRecordEntity(action, gameStore)` following `executeLogNpcInteraction` (`:563-573`): throw on missing `kind`/`name`/`summary` (matches the existing executors' failure contract), then fire-and-forget `window.api.ai.upsertEntity?.(campaignId, { kind, name, summary, keywords, source: 'ai' })`. Dispatch case `'record_entity'` in `game-action-executor.ts` beside `:442-455`.
7. Note (code comment in the handler): the verb is registered unconditionally so a model that emits it with the feature disabled still validates (no scary "unknown action" surface); records written while disabled are inert until the flag turns on (never injected, panel hidden).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json`; `npx vitest run src/main/ai/ai-schemas.test.ts`.

**Acceptance:** `validateDmAction` accepts `record_entity`; all four channels registered with zod boundary schemas; every new handler sanitizes campaignId; preload typed; both tsc configs green.

### 25C — Post-turn entity auto-extraction call (`entity-extraction.ts`)

**Objective:** when `enabled && autoExtract` (both default false), a fire-and-forget structured call after each completed AI turn drafts/refreshes entity records from the narration — the WorldInfo-Recommender / Franz "research-and-record" pattern. Never delays the stream-done path; never overwrites DM edits.

**Files:** NEW `src/main/ai/entity-extraction.ts`, NEW `src/main/ai/entity-extraction.test.ts`, `src/main/ai/ai-service.ts`.

**Steps:**

1. `entity-extraction.ts`:
   - `EXTRACTION_SCHEMA` — flat JSON schema (small-model discipline, same as PHASE-23): `{ type:'object', properties:{ entities:{ type:'array', maxItems:6, items:{ type:'object', properties:{ kind:{enum:[…4]}, name:{type:'string'}, summary:{type:'string'}, keywords:{type:'array', items:{type:'string'}, maxItems:6} }, required:['kind','name','summary'], additionalProperties:false } } }, required:['entities'], additionalProperties:false }`; mirrored zod `ExtractionResultSchema` for parsing.
   - `buildExtractionPrompt(narration: string, knownNames: string[])` — instructs: extract ONLY named, campaign-significant NPCs/locations/items/factions introduced or substantially developed in this narration; skip generic objects and the player characters; echo the schema in the prompt; instruct `{"entities": []}` when nothing qualifies; list `knownNames` (existing record names) with "only include these if this narration adds NEW information about them".
   - `export async function extractEntities(provider: LLMProvider, model: string, narration: string, knownNames: string[]): Promise<Array<{kind, name, summary, keywords?}> | null>` — feature-detect PHASE-23's capability: `if ('structuredOnce' in provider && typeof provider.structuredOnce === 'function')` call it with `EXTRACTION_SCHEMA`, `stream:false`, temperature 0; else fall back to `provider.chatOnce` (`llm-provider.ts:33`) and tolerant-parse (strip ``` fences, `JSON.parse`, `ExtractionResultSchema.safeParse`); any throw/parse failure → `logToFile('WARN', '[AI Entities] …')`, return `null`. Do NOT import `ai-service.ts` (no cycles; PHASE-29 may route this call to a small model by swapping arguments — same contract as PHASE-23's orchestrator).
   - `export async function runEntityExtraction(campaignId: string, provider: LLMProvider, model: string, narration: string): Promise<void>` — orchestrator: read config via `getEntityStore(campaignId).getConfig()`; bail unless `enabled && autoExtract`; `extractEntities`; for each result (cap 6) `upsertEntity({…, source:'extraction' as never})` — note: the store treats `'extraction'` like `'ai'` for lock semantics (25A); dedupe is inherent to upsert (known names just bump lastSeenAt/mentions and fill blanks).
2. `ai-service.ts` — in `handleStreamCompletion`'s terminal block, after the existing memory-persistence `try` (`:884-908` pre-23; re-verify post-23 numbers), insert a **fire-and-forget** (not awaited — `AI_STREAM_DONE` timing is untouched, unlike PHASE-23's mutation extraction which must merge before `onDone`):

   ```ts
   runEntityExtraction(request.campaignId, getActiveProvider(), <resolved model>, displayText).catch((err) =>
     logToFile('WARN', '[AI Entities] extraction failed:', String(err))
   )
   ```

   Reuse the resolved-model parameter PHASE-23 threaded into `handleStreamCompletion`; if 23 landed differently, fall back to `currentConfig.model` with a comment.
3. Tests: prompt embeds schema + known names + empty-result instruction; structuredOnce path preferred when present; chatOnce fallback parses clean/fenced JSON and returns null on garbage; orchestrator bails when flags off (no provider call — assert via spy); cap at 6 upserts; locked records untouched end-to-end (store-level test already exists; add one orchestrator-level assertion).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json`; `npx vitest run src/main/ai/entity-extraction.test.ts src/main/ai/ai-service.test.ts`.

**Acceptance:** with flags off (default) zero new provider calls and zero new awaits in the stream-done path (test-asserted); extraction failures are logged and swallowed; no import cycle (`structured-extraction`-style standalone module).

### 25D — `LoreEntry.keywords` + LoreManager editing UI (the PHASE-37 contract)

**Objective:** lore entries can carry trigger keywords, editable in the existing manager. Pure data/UI addition; injection behavior is unchanged until 25E + the `loreMode` flag.

**Files:** `src/renderer/src/types/campaign.ts`, `src/renderer/src/pages/campaign-detail/LoreManager.tsx` (+ a colocated `LoreManager.test.tsx` if absent — create minimal), `src/renderer/src/i18n/locales/en.json`, `src/renderer/src/i18n/locales/es.json`.

**Steps:**

1. `campaign.ts:52-59` — add `keywords?: string[]` to `LoreEntry` with a doc comment: "Trigger words for keyword-mode lore injection (PHASE-25). Empty/absent ⇒ the entry is always injected (constant). Seed packs map their per-entry `keywords` here (PHASE-37)." Field name and type are a cross-phase contract — do not rename.
2. `LoreManager.tsx` — extend the `useCrudModal` form type + `emptyForm` + `toForm` (`:24-37`) with `keywords: string` (comma-separated text input in the modal, split on `,`, trimmed, empties dropped, deduped, cap 8 on save in `handleSave` `:39-46`); render existing keywords as small chips on each entry row (`:98-105` region). Persist `keywords` only when non-empty (keep old entries shape-stable).
3. i18n: `pages.loreManager.keywordsLabel`, `.keywordsPlaceholder` ("e.g. ashen veil, the veil, cult"), `.keywordsHelp` ("Used by keyword-triggered lore injection. Leave empty to always include this entry.") in **both** `en.json` and `es.json` (professional Spanish).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json`; `npx vitest run src/renderer/src/pages/campaign-detail/LoreManager.test.tsx`.

**Acceptance:** keywords editable + persisted on `campaign.lore` entries; entries without keywords unchanged on disk; both locales updated.

### 25E — Context injection: `[LORE]` block, keyword scan, `[ENTITY RECORDS]` block, verb docs

**Objective:** the labeled blocks PHASE-31 consumes; keyword-triggered selection when opted in; byte-stable defaults otherwise (sole exception: the lore label swap, documented below).

**Files:** NEW `src/main/ai/lore-injection.ts`, NEW `src/main/ai/lore-injection.test.ts`, NEW `src/main/ai/prompt-sections/entity-records.ts`, `src/main/ai/campaign-context.ts` (+ `campaign-context.test.ts`), `src/main/ai/context-builder.ts` (+ `context-builder.test.ts`), `src/main/ai/ai-service.ts`.

**Steps:**

1. `lore-injection.ts` (pure, no IO — PHASE-31 reuses these):
   - `export const LORE_SCAN_DEPTH = 4` (messages).
   - `export function buildScanText(messages: Array<{role: string; content: string}>, gameState?: string): string` — last `LORE_SCAN_DEPTH` message contents + `gameState ?? ''`, joined with `\n`. Including the game-state snapshot is what makes keys **state-triggered** (an entry keyed "under attack" fires while the snapshot says so) — the SillyTavern state-variant mechanic without extra machinery.
   - `export function matchesKey(scanText: string, key: string): boolean` — case-insensitive whole-word match (regex-escaped key, `(?:^|[^a-z0-9])` boundaries — same rule as 25A's `pickEntities`; factor the helper here and import it in `entity-store.ts` to keep one implementation).
   - `export function selectLore(entries: LoreEntryLike[], mode: 'all' | 'triggered', scanText: string): LoreEntryLike[]` — `'all'` → identity; `'triggered'` → entries with no/empty `keywords` (constant) plus entries with ≥1 key matching `scanText`, original array order preserved (stable output = prefix-cache-friendlier across turns, see Research notes).
   - `export function buildLoreBlock(entries: LoreEntryLike[]): string` — `[LORE]\n- Title [category]: content\n…\n[/LORE]`, empty array → `''`. Entry-line format is byte-identical to today's lines (`campaign-context.ts:74`); only the wrapper changes (`Lore:` → `[LORE]`/`[/LORE]`).
   - `LoreEntryLike` = `{ title: string; content: string; category?: string; keywords?: string[] }` (main-side structural type; the renderer `LoreEntry` satisfies it — no cross-process type import).
2. `campaign-context.ts` — change `formatCampaignForContext(campaign)` to `formatCampaignForContext(campaign, opts?: { lore?: LoreEntryLike[] | null })`: when `opts.lore` is provided use it (already-selected), else fall back to `campaign.lore` as today; replace the inline lore lines (`:62-76`) with `buildLoreBlock(selected)` at the SAME position inside `[CAMPAIGN DATA]` (preserves `trimToTokenBudget` tail-trim semantics and the campaignData budget — `token-budgets.json` is NOT modified; PHASE-01 owns budgets). Update `campaign-context.test.ts` for the new wrapper + param.
3. `prompt-sections/entity-records.ts` — `export const ENTITY_RECORDS_PROMPT`: a `[ENTITY ACTIONS]`…`[/ENTITY ACTIONS]` block in the `dm-actions-schema.ts:222-233` doc style documenting `record_entity: {kind: 'npc'|'location'|'item'|'faction', name, summary, keywords?}` — "when a NEW named NPC, location, item, or faction becomes significant, or an existing one changes materially, record it; the [ENTITY RECORDS] block below is your persistent memory of them; the DM may edit records — edited records are authoritative."
4. `context-builder.ts`:
   - `buildContext(query, activeCharacterIds, campaignId?, activeCreatures?, gameState?, actingCharacterId?, scanText?)` — new trailing optional param; default `scanText = \`${query}\n${gameState ?? ''}\``.
   - Step 4 (`:270-283`): read the store config once (`campaignId ? await getEntityStore(campaignId).getConfig() : null` — module cache makes this cheap, F8/25A): `const selectedLore = selectLore((campaign.lore ?? []) as LoreEntryLike[], cfg?.loreMode ?? 'all', scanText)`; pass `{ lore: selectedLore }` into `formatCampaignForContext`.
   - Step 7 (`:306-319`): when `cfg?.enabled`, prepend `ENTITY_RECORDS_PROMPT + '\n\n' + await getEntityStore(campaignId).buildEntityContextBlock(scanText)` to `memoryContext` BEFORE the existing `trimTracked(…, TOKEN_BUDGETS.memory)` (slice-first = survives trimming, inside the existing 2000-token memory budget; identical placement strategy to PHASE-27F, which later prepends its own block — coordinate there). `cfg` absent/disabled → step 7 byte-identical to today.
   - Track tokens in the existing `breakdown.memory` / `breakdown.campaignData` fields (no `ContextTokenBreakdown` shape change — PHASE-14 owns observability surface).
5. `ai-service.ts:654-661` — pass the real scan text: `buildContext(request.message, …, request.actingCharacterId, buildScanText(conv.getMessages(), request.gameState))`. Other `buildContext` callers (`ai-handlers.ts:16` token-budget preview) compile unchanged via the default.
6. Tests:
   - `lore-injection.test.ts`: whole-word matching ("rose" ≠ "rosewood"), case-insensitivity, constant (keyword-less) entries always selected in `triggered` mode, state-trigger via gameState text, `all` mode identity, block formatting + empty cases, `buildScanText` depth.
   - `context-builder.test.ts` (extend): disabled store → no `[ENTITY RECORDS]`/`[ENTITY ACTIONS]` substrings and lore content unchanged except the `[LORE]` wrapper; enabled store → blocks present within the memory budget.
   - `campaign-context.test.ts` (extend): `[LORE]` wrapper at the legacy position; `opts.lore` override respected; no-lore campaigns unchanged.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json`; `npx vitest run src/main/ai/lore-injection.test.ts src/main/ai/campaign-context.test.ts src/main/ai/context-builder.test.ts`.

**Acceptance:** defaults (store disabled, `loreMode:'all'`) → context identical to pre-phase except the lore wrapper relabel (test-asserted); `triggered` mode selects deterministically; entity block + verb docs appear only when enabled; exported builders (`buildLoreBlock`, `buildEntityContextBlock`, `selectLore`, `buildScanText`) are stable for PHASE-31.

### 25F — Entity records panel: view, edit, delete, toggles (DM-facing)

**Objective:** the editability half of the Franz pattern — records and the three flags surfaced in the DM tab. In solo play the player IS the DM, so this is also the player-facing correction surface.

**Files:** NEW `src/renderer/src/components/game/bottom/EntityRecordsPanel.tsx`, NEW `src/renderer/src/components/game/bottom/EntityRecordsPanel.test.tsx`, `src/renderer/src/components/game/bottom/DMTabPanel.tsx`, `src/renderer/src/i18n/locales/en.json`, `src/renderer/src/i18n/locales/es.json`.

**Steps:**

1. `EntityRecordsPanel.tsx` (`{ campaignId: string }` props, styled after `AiContextPanel.tsx`):
   - On mount + Refresh: `window.api.ai.getEntities?.(campaignId)` → `{config, records}`.
   - Header row: master toggle "Entity memory" (`config.enabled`), sub-toggle "Auto-extract after each AI turn" (`config.autoExtract`, disabled while `enabled` is off), select "Lore injection: All entries / Keyword-triggered" (`config.loreMode`) — each change → `setEntitiesConfig(campaignId, patch)` and local-state update from the response.
   - Records list grouped by kind with count badges; each row: name, kind chip, summary preview, `locked` padlock indicator, injection-mode chip, Edit + Delete buttons. Empty state explains records appear via the AI's `record_entity` / auto-extraction or the Add button.
   - Edit/Add modal (reuse `Modal` from `components/ui`, pattern `LoreManager.tsx:24-46`): name, kind select, summary textarea (maxLength 400), details textarea (1200), aliases + keywords comma-inputs, injection select (`auto`/`always`/`never`). Save → `upsertEntity(campaignId, {…, source:'dm'})` (sets `locked` server-side per 25A). Delete → confirm + `deleteEntity`.
2. `DMTabPanel.tsx` — lazy-import (pattern `:11`) and mount under `AiContextPanel` (`:280`) inside the same `Suspense` region: `<EntityRecordsPanel campaignId={campaign.id} />`.
3. i18n keys under `game.entityRecordsPanel.*` (heading, toggles + help lines, kind labels, injection labels, empty state, modal labels, delete confirm) in **both** `en.json` and `es.json`.
4. `EntityRecordsPanel.test.tsx`: renders from a mocked `window.api.ai.getEntities`; toggle calls `setEntitiesConfig` with the right patch; saving the modal calls `upsertEntity` with `source:'dm'`; locked indicator renders.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json`; `npx vitest run src/renderer/src/components/game/bottom/EntityRecordsPanel.test.tsx`.

**Acceptance:** DM can view/add/edit/delete records and flip all three flags from the DM tab; defaults render OFF; both locales updated.

### 25G — Contract docs, integration test, end-of-phase gate

**Objective:** document the new surface; one integration test across the seams; phase gate.

**Files:** `src/main/ai/AI_ACTION_CONTRACT.md`, `src/main/ai/entity-store.test.ts` (integration describe-block).

**Steps:**

1. `AI_ACTION_CONTRACT.md` — new "Entity records & lore injection (PHASE-25)" section: the `record_entity` verb + params; upsert/lock semantics ("DM edits are authoritative; AI/extraction writes never overwrite a locked record"); the three flags + defaults; the `[ENTITY RECORDS]`/`[ENTITY ACTIONS]`/`[LORE]` blocks and their gating; the keyword-match rules (case-insensitive, whole-word, scan = last 4 messages + game state); pointers for PHASE-27/31/37 consumers.
2. Integration test (in `entity-store.test.ts`): simulate the full path — `validateDmAction` a `record_entity` payload (import from `ai-schemas.ts`) → `EntityUpsertPayloadSchema.parse` → `upsertEntity` → DM `upsertEntity(source:'dm')` edit → AI re-upsert is lock-rejected → `buildEntityContextBlock` reflects the DM's text → `selectLore`/`buildLoreBlock` triggered-mode selection over a fabricated transcript.
3. Run the end-of-phase 4-gate per INSTRUCTIONS.md rule 5 (`npm run lint`; `npx tsc --noEmit -p tsconfig.web.json`; `npx tsc --noEmit -p tsconfig.node.json`; full `npx vitest run`), fix anything red, then the single phase commit + push and move this plan to `completed/`.

**Acceptance:** contract doc updated; integration test green; 4-gate green.

## Research notes

- **Editable records as the drift-correction mechanism (Friends & Fables "Franz 2.0").** Franz auto-creates NPC records for characters the party meets ("named NPCs appear in the campaign's NPCs list… you can open any generated NPC and edit their details"), generates long-term memories that are **editable**, and manages "context blocks" (instruction/memory/entity/lore types) that are themselves editable with priority ordering — editability is the product answer to AI memory drift, adopted here as the `locked`-on-DM-edit rule (an edited record stays authoritative; AI writes can no longer clobber it). Franz's research step selects lore by "folder titles, page titles, and page headings", i.e. title/heading-keyed retrieval — our keyword field is the explicit equivalent. Sources: https://fables.gg/patch-notes/franz-20-working-context-lore-improved-planning-and-more , https://fables.gg/
- **Keyword-triggered world info (SillyTavern mechanics, selectively adopted).** SillyTavern's verified defaults: matching is case-insensitive by default with **whole-word matching on** ("king" matches "long live the king", not "liking"); **Scan Depth** = N recent messages; **constant** ("Blue Circle") entries always inject while keyed ("Green Circle") entries need a match; once the WI token budget is exhausted no further entries activate. Adopted: whole-word case-insensitive matching, a fixed scan depth of 4 messages + the game-state snapshot, constant-when-keyword-less lore entries, `always/auto/never` per entity record, deterministic caps. Deliberately NOT adopted in this phase (complexity ⋙ value for one campaign-scale lorebook; logged as future options in the contract doc): regex keys, secondary-key AND/NOT logic, recursion, probability/sticky/cooldown timers, inclusion groups. Source: https://docs.sillytavern.app/usage/core-concepts/worldinfo/
- **Drafting entries from chat (WorldInfo-Recommender pattern).** The ST extension ecosystem's answer to "who writes the lorebook?" is an LLM pass that drafts/updates entries from chat context — our 25C extraction call, constrained to ≤6 flat records per turn, dedupe-by-upsert, locked-record protection. Source: https://rpfiend.com/sillytavern-lorebooks-worldinfo-recommender-by-bmen25124/
- **Entity/temporal memory upgrade path (audit's research framing).** 2025-26 agent-memory systems (Zep temporal knowledge graphs, Mem0, hierarchical memory orchestration) show recall quality jumps when memories carry entities + relations + timestamps with retrieval/decay policies. This phase implements the pragmatic slice: typed entity records with timestamps (`createdAt/updatedAt/lastSeenAt`), mention counts, recency-ranked retrieval, and eviction policy — while relations (NPC↔NPC) stay in the existing `NPCPersonality.relationships` and per-PC opinions land in PHASE-27's store. Full graph/temporal queries remain future work. Sources: https://www.emergentmind.com/topics/memory-mechanisms-in-llm-based-agents , https://github.com/Shichun-Liu/Agent-Memory-Paper-List , https://arxiv.org/pdf/2604.01670
- **Flat extraction schema for small local models** (re-used from the audit + PHASE-23's research): 7–9B models are reliable under constrained decoding only with flat schemas, few optionals, temperature 0, schema echoed in the prompt; constrained decoding guarantees shape, not truth — hence the engine-side upsert validation, caps, and lock semantics. Sources: https://docs.ollama.com/capabilities/structured-outputs , https://www.glukhov.org/post/2025/10/ollama-gpt-oss-structured-output-issues/
- **Prefix-cache awareness (PHASE-01 synergy).** Keyword-triggered selection changes context content between turns by design; keeping `selectLore` output in stable array order and placing the gated blocks inside the already-volatile context segment (never the system prompt) limits additional KV-cache invalidation — consistent with PHASE-01's static-first ordering and PHASE-27F's identical reasoning. Source: https://jonathanding.github.io/llm-learning/en/articles/ollama-kv-cache-scheduling/
- **Why ids are slugified names** (shared with PHASE-27): Ian Bicking's Intra postmortem — models reliably reference entities by name, not abstract ids; id↔name translation is a failure source. Source: https://ianbicking.org/blog/2025/07/intra-llm-text-adventure
- **Alternatives considered:** (a) storing entity records in `campaign.lore` (one substrate) — rejected: lore is renderer-saved campaign data with manual authorship semantics, while records are engine-written every turn (write-frequency and locking mismatch); PHASE-37 confirms both substrates coexist (seeds target `campaign.lore`/`campaign.npcs`; records are runtime memory). (b) flags on `campaign.aiDm` — rejected per F8 (AiDmCard churn shared with PHASES 10/23; engine-owned file is main-readable without threading). (c) a separate `update_entity` verb — rejected: upsert semantics on one verb minimizes prompt surface and small-model confusion. (d) embedding-based lore relevance — rejected here: PHASE-24 owns similarity retrieval; this phase's value is the deterministic, explainable, zero-dependency trigger path that pairs well with small local models.

## Test plan

- **25A** `src/main/ai/entity-store.test.ts` (new): schema defaults, corrupt-file fallback, lock serialization, upsert/merge/lock matrix, alias resolution, whole-word selection, eviction priorities, context-block snapshot, `slugifyId` parity.
- **25B** `src/main/ai/ai-schemas.test.ts` (extend): `record_entity` parses + present in `DM_ACTION_SCHEMAS`; `effect-actions` test (extend): executor throws on missing params, calls `upsertEntity` with `source:'ai'`.
- **25C** `src/main/ai/entity-extraction.test.ts` (new): prompt content, structuredOnce-preferred/chatOnce-fallback, garbage→null, flag-gating (no provider call when off), per-turn cap; `ai-service.test.ts` (extend): default path adds no awaits/calls.
- **25D** `src/renderer/src/pages/campaign-detail/LoreManager.test.tsx` (new/extend): keywords round-trip comma-input → array, chips render, keyword-less entries untouched.
- **25E** `src/main/ai/lore-injection.test.ts` (new), `campaign-context.test.ts` + `context-builder.test.ts` (extend): selection semantics, wrapper relabel, gating on/off, budget containment.
- **25F** `EntityRecordsPanel.test.tsx` (new): render, toggles → config patches, modal save → dm-source upsert.
- **25G** integration describe-block in `entity-store.test.ts`.
- **End-of-phase 4-gate** (INSTRUCTIONS.md rule 5): `npm run lint`; `npx tsc --noEmit -p tsconfig.web.json`; `npx tsc --noEmit -p tsconfig.node.json`; full `npx vitest run`. No Pi code touched — no pytest leg.

## Acceptance criteria

1. A per-campaign `ai-context/entities.json` holds zod-validated entity records (npc/location/item/faction) behind a single serialized write queue with atomic writes, size/record caps, and DM-edit lock semantics (AI/extraction writes never alter a locked record's content — regression-tested).
2. The AI can create/refresh records two ways, both inert by default: the `record_entity` DM-action verb (registered in schema + map + executor + dispatch + sanitized IPC) and the opt-in post-turn extraction call (fire-and-forget, flat schema, ≤6 records/turn, zero impact on the stream-done path when off).
3. `LoreEntry` carries `keywords?: string[]` (the PHASE-37 contract name/type), editable in `LoreManager`, and lore reaches the AI as a labeled `[LORE]` block whose entry-line format is unchanged; with `loreMode:'triggered'` (opt-in) only constant (keyword-less) + keyword-matched entries inject, matched case-insensitively on whole words against the last 4 messages + game state.
4. With `enabled:true`, the context carries `[ENTITY ACTIONS]` verb docs + a bounded, recency-ranked `[ENTITY RECORDS]` block inside the existing 2000-token memory budget; with all flags default-off, context output is byte-identical to pre-phase except the `[LORE]` wrapper relabel (test-asserted).
5. A DM-tab panel lists, adds, edits, and deletes records and controls all three flags; DM edits set `locked`; i18n complete in en + es.
6. Exported, documented builders (`buildEntityContextBlock`, `buildLoreBlock`, `selectLore`, `buildScanText`, `slugifyId`) are stable for PHASES 27/31/37; `AI_ACTION_CONTRACT.md` documents the verb, blocks, flags, and lock semantics.
7. All new IPC channels registered in `ipc-channels.ts` with boundary schemas in `ipc-schemas.ts`; every new handler calls `sanitizeCampaignId`; preload + `index.d.ts` typed.
8. End-of-phase 4-gate green; one commit; plan moved to `completed/`.

## Out of scope

- Indexing lore/journals/handouts into the retrieval (BM25/vector) engine — **PHASE-24** (complementary similarity path; this phase is the deterministic path).
- Scene-boundary summarization / conversation compaction — **PHASE-26**.
- Mutable mechanical world state (party position, exits, per-NPC-per-PC opinions, facts ledger) and the memory-manager race fixes — **PHASE-27** (joins entity records via the shared slug convention).
- Quest objects, director agent, oracle rolls — **PHASE-28**.
- Campaign Q&A / recap consumption of these blocks — **PHASE-31**.
- Seed-pack import of lore + keywords — **PHASE-37** (this phase only provides the `keywords` field).
- Sanitizing the ten legacy unsanitized-campaignId AI handlers — **PHASE-13**.
- Per-NPC TTS voice casting keyed off entity records — **PHASE-21**.
- SillyTavern advanced WI mechanics (regex keys, secondary-key logic, recursion, probability/sticky/cooldown, inclusion groups) — future work, noted in the contract doc; no phase owns them yet.
- Context-inspector/observability surfacing of the new blocks — **PHASE-14**.

## Completed

<!-- Filled during execution per INSTRUCTIONS.md rule 17 — one line per sub-phase with file:line citations. -->
