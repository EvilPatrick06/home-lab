# PHASE-37 — Scenario/world seed packs: versioned export/import format + curated starter packs

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Give the AI-DM app a shareable "campaign seed" format: a single versioned JSON file (`.dndseed`) carrying world lore, NPCs, adventure arcs/quest hooks, structured starter quests, random encounter tables, freeform tone/style instructions for the AI narrator, and a prepared opening scene — everything needed to drop into a fresh (or existing) campaign and start playing, with none of the play-state a full `.dndcamp` snapshot drags along. The phase ships (1) the zod-validated pack schema + pure apply/extract functions, (2) export/import through the existing `entity-io` envelope infrastructure, (3) three curated original starter packs bundled as static data and browsable in the campaign wizard, (4) the AI plumbing that makes seeded tone instructions and opening scenes actually reach the model (campaign-context render + scene-prep message), and (5) the UI: a wizard step for new campaigns plus export/apply actions on the campaign detail page. This captures most of the "world marketplace" value competitors monetize (Friends & Fables is the only 2026 product with one) with zero hosted infrastructure — packs are just files.

## Dependencies & cross-phase notes

- **PHASE-25 (entity-memory-lore) — declared dependency (PHASE-INDEX row 37).** Seed lore imports into `Campaign.lore` (`src/renderer/src/types/campaign.ts:52-59,112`), which PHASE-27's plan explicitly identifies as "PHASE-25's substrate — do not duplicate" (PHASE-27-world-state-store.md:119). **At execution: read `docs/phases/completed/PHASE-25-*.md` Completed section first.** If PHASE-25 extended `LoreEntry` (e.g. a `keywords?: string[]` field for world-info triggering) map the seed schema's per-lore-entry `keywords` into it; if PHASE-25 added separate entity-record stores, the seed importer targets `campaign.lore`/`campaign.npcs` regardless (those remain the durable substrate the AI context reads).
- **PHASE-28 (director/quests/oracle) hands quest content to this phase by name.** PHASE-28-director-quests-oracle.md "Out of scope" states: *"Quest content in seed packs (export/import of the quest log file format) — PHASE-37."* PHASE-28 lands before 37 (numeric order, INSTRUCTIONS.md rule 1) and ships a structured quest store: per-campaign `quests.json` behind `MemoryManager.getQuestLog()` / `MemoryManager.mutateQuestLog(op)` (PHASE-28 plan, 28A step 3), an `applyQuestOperation` op union with `add` and `add_objective` ops (28A step 2), and a renderer `window.api.ai.getQuestLog(campaignId)` (28F step 1). Sub-phase 37D builds the quest-seeding IPC on those primitives — verify their exact exported names/op shapes at execution (commands in F8 below) and adapt field names to what actually landed.
- **File-collision coordination** (all phases below run earlier; merge textually, additions here are append-only):
  - `src/renderer/src/types/campaign.ts` — PHASE-28 adds optional booleans to `AiDmConfig`; PHASE-32 extends `SessionZeroConfig` and adds `aiBanList`. This phase adds two NEW optional `Campaign` fields (`toneInstructions`, `openingScene`) — no overlap.
  - `src/renderer/src/components/campaign/CampaignWizard.tsx` — PHASE-32 edits the sessionZero save condition (`:369-376`). This phase inserts a wizard step and touches `handleCreate` — disjoint regions.
  - `src/main/ai/campaign-context.ts` — PHASE-32 deletes the Content Limits lines (`:142-144`) and its test assertion. This phase appends two new render blocks elsewhere in `formatCampaignForContext` — no overlap.
  - `src/shared/ipc-channels.ts`, `src/shared/ipc-schemas.ts`, `src/main/ipc/ai-handlers.ts`, `src/preload/index.ts`, `src/preload/index.d.ts` — PHASE-28/33/34/35 all append channels/handlers; this phase appends one more (`AI_SEED_QUESTS`).
  - `src/renderer/src/i18n/locales/en.json` + `es.json` — nearly every phase touches; keys here are new namespaces (`campaign.seedPacks.*`), no collisions.
- **PHASE-35 (scene mode)** lists "a persisted scene library … pairs with PHASE-37 seed packs" as a v2 candidate — nothing required from this phase; the `extensions` field (37A) is the forward-compatible attachment point.
- **PHASE-38 (plugin platform)** introduces campaign-level `systemId` selection; the pack schema's `system` field uses the same `GameSystem` value (`'dnd5e'`, `src/renderer/src/types/game-system.ts:1`) so packs stay compatible.
- **PHASE-13** owns the `sanitizeCampaignId` retrofit for pre-existing AI IPC handlers; the new `AI_SEED_QUESTS` handler in 37D is born sanitized (same convention PHASE-28 followed).
- **PHASE-33 (image generation)** may later attach portrait/scene-art prompts to packs — that rides the `extensions` field, not a schema change.

## Verified findings

All commands run from the repo root (`/home/patrick/home-lab/...`); paths below are repo-relative. Verified 2026-06-10 against the live tree.

### F1 — The audit's pack ingredients all have existing campaign-level substrates

Audit entry (Product feature ideas, 2026-06-10): *"Shareable scenario/world seed packs. A versioned export/import format for campaign seeds (world lore + opening scene + quest hooks + encounter tables + tone instructions) plus a few curated built-in packs — gets most of the marketplace value with no hosted infrastructure, and seeds slot into the lore/entity system."* Verified mapping to `src/renderer/src/types/campaign.ts`:

- World lore → `Campaign.lore?: LoreEntry[]` (`campaign.ts:112`; `LoreEntry` `:52-59` — `id/title/content/category('world'|'faction'|'location'|'item'|'other')/isVisibleToPlayers/createdAt`). CRUD UI: `src/renderer/src/pages/campaign-detail/LoreManager.tsx:23,42-47`.
- NPCs → `Campaign.npcs: NPC[]` (`campaign.ts:111`; `NPC` `:189-209` — `id/name/description/location?/isVisible/statBlockId?/role?/personality?/motivation?/notes`).
- Quest hooks / arcs → `Campaign.adventures?: AdventureEntry[]` (`campaign.ts:114`; `AdventureEntry` `:220-233` — `id/title/levelTier/premise/hook/villain/setting/playerStakes/encounters/climax/resolution/createdAt`).
- Encounter tables → `Campaign.customRollTables` (`campaign.ts:132-141` — `{id, name, diceFormula, entries: [{min, max, text}]}`), and prepared encounters → `Campaign.encounters?: Encounter[]` (`campaign.ts:113`; `Encounter` `src/renderer/src/types/encounter.ts:45-65` — required `id/name/description/monsters/difficulty/levelRange/totalXP`).
- Tone instructions → **no substrate exists.** `SessionZeroConfig.tone` (`campaign.ts:211-218`) is a single short string (wizard default `'heroic'`, see `CampaignWizard.tsx:371`); there is no freeform narration-style field: `grep -rn "toneInstructions" dnd-app/src --include=*.ts --include=*.tsx` → 0 hits. 37A adds `Campaign.toneInstructions?: string`.
- Opening scene → **no substrate exists.** `grep -rn "openingScene" dnd-app/src --include=*.ts --include=*.tsx` → 0 hits. 37A adds `Campaign.openingScene?: OpeningScene`.

Verify: `sed -n '94,149p' dnd-app/src/renderer/src/types/campaign.ts` and the two greps above.

### F2 — Built-in "Adventures" are the closest existing curated-content mechanism, and they are creation-time-only, not portable

`src/renderer/src/services/adventure-loader.ts:40-68`: `Adventure` (id/name/system/chapters/npcs/encounters/lore/mapAssignments) loaded from `./data/5e/adventures/adventures.json` via the data-provider IPC loader (`loadJson`, `:62`). Four built-ins ship today (verify: `node -e "const a=require('./dnd-app/src/renderer/public/data/5e/adventures/adventures.json'); console.log(a.map(x=>x.id))"` → `lost-mines`, `dragon-icespire`, `death-house`, `sunless-citadel`). The wizard merges a selected adventure's NPCs/lore/encounters/maps into the new campaign with per-item exclusions (`src/renderer/src/components/campaign/CampaignWizard.tsx:277-348`; `presetId: selectedAdventureId` at `:315`). Limitations this phase fixes: built-ins are not exportable/importable, can only apply at campaign creation, and carry no tone instructions, opening scene, quests, or roll tables. The built-in adventure path is NOT modified by this phase — seed packs are a parallel, portable mechanism.

### F3 — A unified versioned export/import envelope already exists (`entity-io`), with 13 entity types and an adventure-arc exporter

`src/renderer/src/services/io/entity-io.ts`: `EntityType` union (`:17-30`, 13 members, no seed-pack type), `ExportEnvelope` (`:32-45` — `{version: 1, schemaVersion: 1, type, exportedAt, count, data}`), `ENTITY_CONFIGS` exhaustive `Record<EntityType, EntityConfig>` (`:57-71` — adding a union member without a config is a compile error), `exportEntities` (`:106-142`, native save dialog + 10 MB write cap), `importEntities` (`:163-214`, envelope validation + bare-object fallback + 50 MB read cap), `reIdItems` (`:231-236`). `adventure-io.ts:5-63` exports a single `AdventureEntry` + related encounters/NPCs as `.dndadv` and re-IDs on import (`:57-61`); used by `src/renderer/src/pages/campaign-detail/AdventureManager.tsx:71`. Verify: `sed -n '17,71p' dnd-app/src/renderer/src/services/io/entity-io.ts`.

### F4 — Full-campaign export exists but is a snapshot, not a seed — and it serializes AI API keys

`src/renderer/src/services/io/campaign-io.ts:7-9`: `exportCampaign` is `JSON.stringify({campaign, gameState})` of the ENTIRE campaign — players, journal, metrics, saved game state, and `campaign.aiDm` including `claudeApiKey`/`openaiApiKey`/`geminiApiKey` (`campaign.ts:63-74`). Import validates 8 required fields by presence only (`:33-38`). Entry points: `MakeGamePage.tsx:20` (import), `CampaignDetailPage.tsx:152-160` + `StartStep.tsx:135` (export). Consequences for this phase: (a) the seed extractor (37A) excludes `aiDm`, `players`, `journal`, `inviteCode`, `metrics`, `savedGameState`, `maps`, `permissions` BY CONSTRUCTION (the schema has no such fields, so they cannot leak); (b) the pre-existing `.dndcamp` API-key serialization is out of scope here but must be logged to `docs/SECURITY-LOG.md` at execution per INSTRUCTIONS.md rule 12 (gitignored log; do not describe it in committed files beyond this note). Verify: `sed -n '1,40p' dnd-app/src/renderer/src/services/io/campaign-io.ts`.

### F5 — AI campaign context renders lore/NPCs/adventures/sessionZero but NOT roll tables, and has no tone-instruction line; budget is 2 000 tokens

`src/main/ai/campaign-context.ts` `formatCampaignForContext` (`:11-274`): name/description `:15-18`, custom rules `:23-30`, NPCs `:33-60`, lore `:63-76`, sessionZero incl. `- Campaign Tone: <tone>` `:126-147`, encounters `:196-207`, adventures ("Adventure Arcs" with hook-bearing fields premise/villain/setting/stakes) `:219-242`. `customRollTables` is never rendered (`grep -n "customRollTables" dnd-app/src/main/ai/campaign-context.ts` → 0 hits). The block is trimmed to `TOKEN_BUDGETS.campaignData` = 2 000 tokens (`src/main/ai/context-builder.ts:271-276`; `src/main/data/token-budgets.json` → `"campaignData": 2000`) — so high-value additions (tone instructions) must render EARLY in the block to survive tail-trimming. `loadCampaignById` is exported from `campaign-context.ts:3-9` and returns the raw campaign record (main process reads campaigns without renderer types). Verify: `sed -n '11,30p' dnd-app/src/main/ai/campaign-context.ts && grep -n "campaignData" dnd-app/src/main/ai/context-builder.ts dnd-app/src/main/data/token-budgets.json`.

### F6 — Scene prep sends one fixed generic message; the IPC handler is already async; both solo and lobby flows route through it

`src/main/ai/ai-service.ts` `prepareScene` (`:943-983`): synchronous today, builds `AiChatRequest` with the hardcoded message `'The adventure begins. Set the scene for the party. Describe the opening location and atmosphere.'` (`:965`) and calls `startChat`. It short-circuits to `ready` when the conversation already has messages (`:957-961`) — so a seeded opening scene naturally applies only to the FIRST scene of a campaign. The IPC handler (`src/main/ipc/ai-handlers.ts:285-288`) is `async` and can `await` a newly-async `prepareScene` without preload/renderer contract changes (`src/preload/index.d.ts:203` returns `Promise<{success, streamId?}>`). Renderer callers: `src/renderer/src/pages/ScenePrepPage.tsx:39` (solo `/prepare/:id` flow, see `CampaignDetailPage.tsx:140-150`) and `src/renderer/src/pages/LobbyPage.tsx:76` (multiplayer lobby prep). `ai-service.ts` does NOT currently import from `campaign-context.ts` (grep → 0 hits) — 37D adds the import. Verify: `sed -n '943,983p' dnd-app/src/main/ai/ai-service.ts && sed -n '285,292p' dnd-app/src/main/ipc/ai-handlers.ts`.

### F7 — Roll tables have exactly one consumer (DM Roll Table modal)

`grep -rln "customRollTables" dnd-app/src --include=*.ts --include=*.tsx` → only `types/campaign.ts` and `src/renderer/src/components/game/modals/dm-tools/RollTableModal.tsx` (reads `:202-206`, creates/deletes `:369-390`). Seeded tables become immediately usable there with no further wiring; 37D additionally renders table NAMES into AI context so the model knows they exist.

### F8 — Quest store contract expected from PHASE-28 (verify at execution)

PHASE-28 (runs before this phase) specifies: `src/main/ai/quest-log.ts` with pure `applyQuestOperation(file, op)` where the op union includes quest-level `add` (accepting optional `chapterQuest`) and objective-level `add_objective` ops; `MemoryManager.getQuestLog()` / `MemoryManager.mutateQuestLog(op)` (serialized via the `mutate()` lock); renderer `window.api.ai.getQuestLog(campaignId)`. Execution-time verification (MUST run before 37D):

```bash
ls dnd-app/docs/phases/completed/ | grep PHASE-28
grep -n "applyQuestOperation\|mutateQuestLog\|getQuestLog" dnd-app/src/main/ai/quest-log.ts dnd-app/src/main/ai/memory-manager.ts
grep -n "getQuestLog" dnd-app/src/preload/index.ts dnd-app/src/preload/index.d.ts
sed -n '1,60p' dnd-app/src/main/ai/quest-log.ts   # read the actual op union field names
```

If the landed op shapes differ from PHASE-28's plan text, adapt 37D's handler to the real ones (the IPC surface this phase adds is independent of those internals). Today (pre-28) none of these exist — `grep -rn "quest-log" dnd-app/src/main/ai` → 0 hits, confirmed 2026-06-10 — which is expected, not drift.

### F9 — Campaign wizard structure (where the seed-pack step plugs in)

`src/renderer/src/components/campaign/CampaignWizard.tsx`: `StepKey` union (`:39-49`), step flow `useMemo` (`:142-147`: `['system','details', ('character' if solo), 'aiDm','adventure','sessionZero','rules','calendar','maps','audio','review']`), `canAdvance()` (`:232-247`; `default: return true` makes new optional steps free), step title from i18n key `campaign.campaignWizard.steps.${stepKey}` (`:472`), step render blocks (`:477-589`), `handleCreate` (`:273` onward; `createCampaign` call `:309-388`; post-create `saveCampaign` of resolved maps/solo players `:391-417`), draft persistence of ALL wizard state to localStorage via `saveWizardDraft`/`loadWizardDraft` (`:106-141`, `:153-180`; `src/renderer/src/services/campaign-wizard-draft.ts:11-23`, value is `Record<string, unknown> & {step:number}` so a serialized pack rides along). `createCampaign` store signature: `Omit<Campaign,'id'|'createdAt'|'updatedAt'|'inviteCode'|'players'|'journal'>` (`src/renderer/src/stores/use-campaign-store.ts:67-69`). `ReviewStep` receives `adventureName` (`:580`). Verify: `sed -n '142,147p;232,247p' dnd-app/src/renderer/src/components/campaign/CampaignWizard.tsx`.

### F10 — File-dialog/file-IO primitives need no new IPC

`DIALOG_SAVE`/`DIALOG_OPEN` channels (`src/shared/ipc-channels.ts:43-44`); preload `showSaveDialog` (`src/preload/index.ts:42`), `writeFile` (`:70`), `readFile`; size caps `MAX_READ_FILE_SIZE` 50 MB / `MAX_WRITE_CONTENT_SIZE` 10 MB (`src/shared/constants.ts:7-8`). `entity-io` already routes through all of them — seed-pack file IO is purely renderer-side composition.

### F11 — Built-in pack JSON must load via the data-provider façade (library boundary test)

`src/renderer/src/services/data-provider.ts:130-141` `loadJson<T>(path)` → `window.api.game.loadJson` (`src/preload/index.ts:316`, strips leading `./`) → `GAME_LOAD_JSON` handler with path-traversal guard (`src/main/ipc/game-data-handlers.ts:15-36`). The boundary spec (`src/renderer/src/services/library/library-boundary.test.ts:20-36`) fails CI on direct `public/data` imports or `fetch('/data/5e/...')` outside the allowlist — `adventure-loader.ts:60-62` documents exactly this routing ("Phase 15g — route through the data-provider IPC loader … so the boundary guard no longer needs to allowlist this file"). The 37B built-in loader copies that pattern; no allowlist change needed. New static data dir: `src/renderer/public/data/5e/seed-packs/`.

### F12 — zod v4 at the IPC boundary; handler validation + campaignId sanitization patterns

`src/shared/ipc-schemas.ts:1-13` (zod schemas; `package.json:238` → `"zod": "^4.4.3"`; `z.looseObject` available — verified `node -e "const {z}=require('./dnd-app/node_modules/zod'); console.log(typeof z.looseObject)"` → `function`). Handler pattern: `Schema.safeParse(...)` → `{success:false, error}` on failure (`src/main/ipc/ai-handlers.ts:109-115,208-217`). `sanitizeCampaignId` helper at `ai-handlers.ts:93`, used by newer handlers (`:326,339,347,…`). Tests exist at `src/shared/ipc-schemas.test.ts` and `src/shared/ipc-channels.test.ts`.

### F13 — i18n + naming-collision + content-verification facts

- Locales: `src/renderer/src/i18n/locales/en.json` + `es.json`; parity enforced by `src/renderer/src/i18n/locale-parity.test.ts`; the compile-time key union regenerates via `npm run i18n:gen-keys` (`package.json:34`; `generated-keys.ts` header says "do not edit by hand").
- **Naming collision warning:** a library category `'adventure-seeds'` already exists (`src/renderer/src/types/library.ts:50,233`, data `public/data/5e/world/adventure-seeds.json`, consumed by `AdventureWizard.tsx:1`) — it is a `Record<string, string[]>` of one-line plot-hook strings for the arc generator, unrelated to this phase. All new identifiers use `seedPack`/`seed-pack(s)` (never `adventure-seed`) and UI copy says "Seed Pack".
- Monster/stat-block ids referenced by curated packs are verifiable against the 379-entry index: `node -e "const m=require('./dnd-app/src/renderer/public/data/5e/dm/npcs/monsters.json'); console.log(m.some(x=>x.id==='goblin-warrior'))"` → `true` (also confirmed: `commoner` is used by built-in adventures as `statBlockId`).
- `GameSystem` is `'dnd5e' | (string & {})` (`src/renderer/src/types/game-system.ts:1`).

## Sub-phases

Order keeps the tree green: types/schema first (37A), IO second (37B), content third (37C), main-process plumbing fourth (37D), UI last (37E), docs final (37F). Run only the listed cheap checks per sub-phase; the full 4-gate runs once at phase end (INSTRUCTIONS.md rule 5).

### 37A — Pack format: types, zod schema, pure apply/extract

**Objective:** the `SeedPack` v1 format exists as a zod-validated TypeScript contract plus pure, fully-unit-tested apply/extract functions; `Campaign` gains the two missing substrates (tone instructions, opening scene).

**Files:** EDIT `src/renderer/src/types/campaign.ts`; NEW `src/renderer/src/services/seed-packs/seed-pack-schema.ts`, `seed-pack-schema.test.ts`, `seed-pack-apply.ts`, `seed-pack-apply.test.ts`.

**Steps:**

1. `campaign.ts` — add (near `LoreEntry`, around `:60`):
   ```ts
   export interface OpeningScene {
     title?: string
     /** Scene text the AI opens the campaign with (narrated in its own voice, not read verbatim). */
     readAloud: string
     /** Private staging notes for the AI/DM — never shown to players. */
     dmNotes?: string
   }
   ```
   and on `Campaign` (after `aiDm?` at `:131`): `toneInstructions?: string` and `openingScene?: OpeningScene`. Both optional ⇒ no migration; existing saves load unchanged.
2. `seed-pack-schema.ts` — zod v4 schemas. Top-level identification follows the Character-Card-V2 pattern (`spec` + version fields; preserve unknown fields):
   ```ts
   export const SEED_PACK_FORMAT = 'dnd-vtt-seed-pack' as const
   export const SEED_PACK_FORMAT_VERSION = 1 as const
   ```
   Section schemas (use `z.looseObject` everywhere so forward/third-party fields survive an import→export round trip; F12 confirms availability):
   - `SeedLoreSchema`: `{ id: z.string().min(1), title: z.string().min(1), content: z.string().min(1), category: z.enum(['world','faction','location','item','other']), isVisibleToPlayers: z.boolean().optional(), keywords: z.array(z.string()).max(20).optional() }` — `keywords` is the PHASE-25 world-info forward hook (see Dependencies).
   - `SeedNpcSchema`: `{ id, name: z.string().min(1), description: z.string(), location/role/personality/motivation/statBlockId/notes optional strings, role constrained to z.enum(['ally','enemy','neutral','patron','shopkeeper']).optional(), isVisible: z.boolean().optional() }`.
   - `SeedAdventureSchema`: the `AdventureEntry` fields minus `createdAt` (`id`,`title` required; `levelTier/premise/hook/villain/setting/playerStakes/encounters/climax/resolution` optional strings, defaulted to `''` on apply).
   - `SeedQuestSchema`: `{ name: z.string().min(1).max(200), description: z.string().max(2000).default(''), objectives: z.array(z.string().min(1).max(500)).max(8).default([]), chapterQuest: z.boolean().default(false) }` (caps mirror PHASE-28's render caps).
   - `SeedRollTableSchema`: `{ id, name: z.string().min(1), diceFormula: z.string().min(2), entries: z.array(z.object({min: z.number().int(), max: z.number().int(), text: z.string().min(1)})).min(1) }` + `.refine` that every entry has `min <= max`.
   - `SeedEncounterSchema`: loose-object with the `Encounter` required core (`id`,`name`,`description`,`monsters: z.array(z.looseObject({monsterId: z.string().min(1), count: z.number().int().min(1)}))`, `difficulty: z.enum(['trivial','easy','moderate','hard','deadly'])`, `levelRange: {min,max}`, `totalXP: z.number()`) — loose so `waves`/`tactics`/`loot` pass through (F1 cites the full interface).
   - `SeedCustomRuleSchema`: `{ id, name, description, category: z.enum(['combat','exploration','social','rest','other']) }`.
   - Top level `SeedPackSchema = z.looseObject({ format: z.literal(SEED_PACK_FORMAT), formatVersion: z.literal(1), id: z.string().min(1).regex(/^[a-z0-9-]+$/), name: z.string().min(1).max(120), description: z.string().max(2000).default(''), author: z.string().max(120).optional(), system: z.string().default('dnd5e'), levelRange: z.object({min: z.number().int().min(1), max: z.number().int().max(20)}).optional(), tags: z.array(z.string()).max(12).optional(), toneInstructions: z.string().max(4000).optional(), openingScene: z.looseObject({title: z.string().optional(), readAloud: z.string().min(1).max(4000), dmNotes: z.string().max(2000).optional()}).optional(), lore: z.array(SeedLoreSchema).max(100).optional(), npcs: z.array(SeedNpcSchema).max(100).optional(), adventures: z.array(SeedAdventureSchema).max(20).optional(), quests: z.array(SeedQuestSchema).max(25).optional(), encounterTables: z.array(SeedRollTableSchema).max(25).optional(), encounters: z.array(SeedEncounterSchema).max(50).optional(), customRules: z.array(SeedCustomRuleSchema).max(50).optional(), extensions: z.record(z.string(), z.unknown()).optional() })`; `export type SeedPack = z.infer<typeof SeedPackSchema>`.
   - `export function parseSeedPack(data: unknown): { ok: true; pack: SeedPack } | { ok: false; error: string }` — distinguishes three failures with user-facing messages: not a seed pack (`format` missing/wrong), newer format (`formatVersion` is a number > 1 → "made with a newer app version"), and field-level zod issues (first issue path + message).
3. `seed-pack-apply.ts` — pure functions, no IO, no `window` access beyond `crypto.randomUUID()`:
   ```ts
   export interface ApplySeedPackOptions { lore?: boolean; npcs?: boolean; adventures?: boolean; encounterTables?: boolean; encounters?: boolean; customRules?: boolean; tone?: boolean; openingScene?: boolean } // every flag defaults true
   export function applySeedPackToCampaign(campaign: Campaign, pack: SeedPack, opts?: ApplySeedPackOptions): Campaign
   export function extractSeedPackFromCampaign(campaign: Campaign, meta?: { id?: string; name?: string; description?: string; author?: string; tags?: string[] }): SeedPack
   export function slugifyPackId(name: string): string  // lowercase, [a-z0-9-], collapse dashes, fallback 'seed-pack'
   ```
   `applySeedPackToCampaign` semantics: returns a NEW campaign object (never mutates); every imported collection entry gets a fresh `crypto.randomUUID()` id and a fresh `createdAt` ISO stamp where the target type has one (lore, adventures); collections APPEND to existing arrays (never replace, never dedupe — AI Dungeon's import-overwrites-everything behavior is the documented failure mode to avoid); `toneInstructions`/`openingScene` are set ONLY when the campaign's current value is unset/empty (seeding never clobbers an author's existing text — the apply modal in 37E surfaces this); `levelRange` is NOT applied here (creation flow handles it, F9); `quests` are NOT applied here (they live main-side in `quests.json`, handled by the 37D IPC); lore `keywords` map onto the `LoreEntry` field of the same name IF it exists at execution time (PHASE-25 check, see Dependencies) and are dropped otherwise; npc `isVisible` defaults to `role !== 'enemy'` when absent (mirrors `CampaignWizard.tsx:327`); npc `notes` defaults to `''`.
   `extractSeedPackFromCampaign` semantics: maps `campaign.lore/npcs/adventures/customRollTables/encounters/customRules` + `toneInstructions` + `openingScene` into a `SeedPack` (keeping original ids — re-ID happens on IMPORT); `meta` defaults from the campaign (`name`, `description`, id via `slugifyPackId(name)`); sets `levelRange` from `campaign.settings.levelRange`; the returned object literal contains NO key for `aiDm/players/journal/maps/inviteCode/metrics/savedGameState/permissions/calendar/customAudio` (exclusion by construction, F4); `quests` left undefined (the 37E export flow fills it from the quest-log IPC when available).
4. Tests:
   - `seed-pack-schema.test.ts`: a full valid pack parses and round-trips; missing `format`/`name` → `ok:false` with the right message; `formatVersion: 2` → the "newer version" message; unknown extra top-level + per-entry fields are PRESERVED through parse (loose-object assertion); `min > max` table entry rejected; objective/string caps enforced.
   - `seed-pack-apply.test.ts`: apply onto an empty campaign populates every section; apply onto a populated campaign appends without dropping or re-ordering existing entries; imported ids are all fresh (stub `crypto.randomUUID` like `entity-io.test.ts:23` does); per-section opt-out flags skip exactly their section; existing `toneInstructions` is not overwritten; extract excludes secrets (assert `JSON.stringify(extracted)` contains none of `claudeApiKey|openaiApiKey|geminiApiKey|inviteCode|players`); extract→parse→apply round trip lands the same titles/names.

**Cheap checks:** `cd dnd-app && npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/renderer/src/services/seed-packs/seed-pack-schema.test.ts src/renderer/src/services/seed-packs/seed-pack-apply.test.ts`

**Acceptance:** both test files green; `grep -n "toneInstructions\|openingScene" dnd-app/src/renderer/src/types/campaign.ts` shows the new fields; no behavior change anywhere yet.

### 37B — File export/import + built-in pack loader

**Objective:** `.dndseed` files save/open through the standard entity-io envelope; bundled packs load through the boundary-safe data-provider path.

**Files:** EDIT `src/renderer/src/services/io/entity-io.ts`, `src/renderer/src/services/io/entity-io.test.ts`; NEW `src/renderer/src/services/seed-packs/seed-pack-io.ts`, `seed-pack-io.test.ts`, `built-in-packs.ts`, (loader unit test lands in 37C with the content).

**Steps:**

1. `entity-io.ts`: add `'seedpack'` to `EntityType` (`:17-30`) and `seedpack: { extension: 'dndseed', label: 'Seed Pack', requiredFields: ['id', 'name', 'formatVersion'] }` to `ENTITY_CONFIGS` (`:57-71`) — the exhaustive `Record` makes the second edit compiler-enforced. Extend `entity-io.test.ts` with a seedpack envelope round-trip case following its existing per-type pattern.
2. `seed-pack-io.ts`:
   - `exportSeedPackToFile(pack: SeedPack): Promise<boolean>` → `exportEntities('seedpack', [pack])` (envelope `{version:1, schemaVersion:1, type:'seedpack', …, data: pack}`).
   - `importSeedPackFromFile(): Promise<SeedPack | null>` → `importEntities<unknown>('seedpack')`; `null` on cancel; take `items[0]`, run `parseSeedPack`, throw `Error(parse.error)` on failure so callers can toast the precise reason. Note: `importEntities`' bare-object fallback (`entity-io.ts:190-199`) also accepts an UN-enveloped pack JSON (required fields `id/name/formatVersion` present) — document this as supported (hand-authored packs work without the envelope).
3. `built-in-packs.ts` (pattern: `adventure-loader.ts:54-68`):
   ```ts
   let cachedPacks: SeedPack[] | null = null
   export async function loadBuiltInSeedPacks(): Promise<SeedPack[]>
   ```
   reads `./data/5e/seed-packs/index.json` (`{ packs: Array<{ id: string; file: string }> }`) via `loadJson` from `../data-provider`, then each `./data/5e/seed-packs/${entry.file}` (bare `SeedPack` JSON, no envelope); validates each with `parseSeedPack`, `logger.warn` + skip on invalid; caches; returns `[]` on any index-level failure (matches `loadAdventures`' catch). The `file` value must be a bare filename (no `/`), enforced with a simple check before interpolation.
4. `seed-pack-io.test.ts`: mock `window.api` per the `entity-io.test.ts:12-23` `vi.stubGlobal` pattern — export writes envelope JSON containing `"type": "seedpack"`; import of a valid envelope returns a parsed pack; import of `formatVersion: 2` throws the newer-version message; cancelled dialog returns null; un-enveloped bare pack JSON imports successfully.

**Cheap checks:** `cd dnd-app && npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/renderer/src/services/io/entity-io.test.ts src/renderer/src/services/seed-packs/seed-pack-io.test.ts`

**Acceptance:** seedpack is a first-class entity-io type; export→import round trip preserves all fields including `extensions`; built-in loader compiles (content arrives in 37C).

### 37C — Three curated starter packs (original content) + content validation test

**Objective:** bundled, immediately playable packs that double as format reference implementations.

**Files:** NEW `src/renderer/public/data/5e/seed-packs/index.json`, `hollowmere.json`, `sunderspire-frontier.json`, `ivory-court.json`; NEW `src/renderer/src/services/seed-packs/built-in-packs.test.ts`.

**Steps:**

1. Author three packs as bare `SeedPack` JSON (`format`/`formatVersion` included). All content ORIGINAL (no Wizards of the Coast product identity — no Forgotten Realms names, no named WotC NPCs/locations; generic SRD monster types only). Every `monsterId`/`statBlockId` must exist in the 379-entry index — verify each with:
   ```bash
   node -e "const m=require('./dnd-app/src/renderer/public/data/5e/dm/npcs/monsters.json'); const ids=new Set(m.map(x=>x.id)); for (const id of process.argv.slice(1)) console.log(id, ids.has(id))" goblin-warrior commoner ...
   ```
   Per-pack minimum content bar — 6-8 lore entries (mixed categories), 5-6 NPCs (roles spread across ally/neutral/enemy/patron/shopkeeper; personalities + motivations filled), 1-2 adventure arcs (all `AdventureEntry` narrative fields filled), 3 quests (2-4 objectives each; exactly one `chapterQuest: true` per pack), 2 encounter tables (one travel/region `1d8`, one location/complication `1d12`, contiguous non-overlapping min/max bands covering the die range), `toneInstructions` (80-150 words of concrete narration guidance: pacing, sentence rhythm, sensory palette, what to avoid), `openingScene` (`readAloud` 100-180 words + `dmNotes` staging guidance), `levelRange`, `tags`.
   - **`hollowmere`** — "The Hollowmere" (levels 1-4): gothic fenland mystery; a drowned village, a lake that returns things wrong, a grief-cult; tone = dread-forward but hopeful, slow sensory dread, no body horror on-screen; chapter quest: discover what the mere actually took. Monster palette: `goblin-warrior`-tier humanoids, beasts, undead-flavored entries from the verified index.
   - **`sunderspire-frontier`** — "Sunderspire Frontier" (levels 1-5): classic heroic frontier around a ruined dwarven sky-spire; competing prospector factions, goblin politics that can be talked to; tone = warm heroic adventure, banter-friendly, fast scene cuts; chapter quest: reopen the spire's waygate.
   - **`ivory-court`** — "Ashes of the Ivory Court" (levels 3-7): succession intrigue in a city-state after the throne burns; three factions, social-first play, assassins as punctuation; tone = court intrigue, secrets-as-currency, violence rare and consequential; chapter quest: crown (or break) a claimant.
2. `index.json`: `{ "packs": [ {"id":"hollowmere","file":"hollowmere.json"}, {"id":"sunderspire-frontier","file":"sunderspire-frontier.json"}, {"id":"ivory-court","file":"ivory-court.json"} ] }`.
3. `built-in-packs.test.ts` — filesystem-direct validation (the `calendar-presets.test.ts:6` pattern: `readFileSync` + `resolve(__dirname, '../../../public/data/5e/seed-packs/…')`, bypassing the IPC loader):
   - index parses; every `file` exists, is a bare filename, and its `id` matches the pack's `id`; ids unique.
   - every pack passes `SeedPackSchema` (strict success, not just no-throw).
   - every `monsterId`/`statBlockId` in every pack exists in `dm/npcs/monsters.json`.
   - every encounter-table's bands are contiguous from 1 to the die max parsed from `diceFormula`, with no gaps/overlaps.
   - content-bar assertions: `lore.length >= 6`, `npcs.length >= 5`, `quests.length >= 3`, exactly one chapter quest, `toneInstructions` and `openingScene.readAloud` non-empty.
   - a `loadBuiltInSeedPacks` unit case with `loadJson` mocked (vi.mock `../data-provider`) returning the real files' contents: returns 3 packs; an injected invalid pack is skipped, not thrown.

**Cheap checks:** `cd dnd-app && npx vitest run src/renderer/src/services/seed-packs/built-in-packs.test.ts`

**Acceptance:** all three packs validate against the live schema and monster index via the test; no app code changes in this sub-phase.

### 37D — Main-process plumbing: tone-instruction context, opening-scene prep, quest-seeding IPC

**Objective:** seeded tone instructions reach every AI request; a seeded opening scene shapes the first scene-prep; pack quests land in the PHASE-28 quest store through one validated, sanitized IPC.

**Files:** EDIT `src/main/ai/campaign-context.ts`, `src/main/ai/campaign-context.test.ts`, `src/main/ai/ai-service.ts`, `src/main/ipc/ai-handlers.ts`, `src/main/ipc/ai-handlers.test.ts`, `src/shared/ipc-channels.ts`, `src/shared/ipc-schemas.ts`, `src/shared/ipc-schemas.test.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`; NEW `src/main/ai/scene-prep-message.ts`, `scene-prep-message.test.ts`; NEW `src/renderer/src/services/seed-packs/seed-quests.ts`, `seed-quests.test.ts`.

**Steps:**

1. `campaign-context.ts` — two additions to `formatCampaignForContext`:
   - Immediately after the `Description:` line (`:16-18`, EARLY so the 2 000-token tail-trim can never drop it — F5):
     ```ts
     if (typeof campaign.toneInstructions === 'string' && campaign.toneInstructions.trim()) {
       parts.push('')
       parts.push('Narrative Tone & Style (follow these instructions in every narration):')
       parts.push(campaign.toneInstructions.trim().slice(0, 2000))
     }
     ```
   - After the Prepared Encounters block (`:196-207`): when `campaign.customRollTables` is a non-empty array, render `Random Tables (DM can roll these on request): <name>, <name>, …` (names only — keeps token cost ~one line).
   - `campaign-context.test.ts`: tone block renders when set and is absent otherwise; appears BEFORE the `Custom Rules` section; table-names line lists names; both absent on a legacy campaign object.
2. `scene-prep-message.ts` (main process must not import renderer types — match `campaign-context.ts`'s structural-cast convention):
   ```ts
   export const DEFAULT_SCENE_PREP_MESSAGE =
     'The adventure begins. Set the scene for the party. Describe the opening location and atmosphere.'
   export function buildScenePrepMessage(openingScene: unknown): string
   ```
   When `openingScene` is an object with a non-empty string `readAloud`: return a message instructing the model to open the campaign with that prepared scene — include the `title` when present, the `readAloud` text quoted as authorial guidance ("narrate this opening in your own voice; do not read it verbatim"), the `dmNotes` as private staging notes, and a closing instruction to end by inviting the party to act. Slice `readAloud` to 4 000 chars and `dmNotes` to 2 000 defensively. Anything else → `DEFAULT_SCENE_PREP_MESSAGE`. Test: default for `undefined`/`{}`/non-string `readAloud`; seeded message contains title, readAloud, dmNotes and the verbatim-prohibition; oversize inputs are clipped.
3. `ai-service.ts` — make `prepareScene` async (F6): `export async function prepareScene(campaignId: string, characterIds: string[]): Promise<string | null>`; import `loadCampaignById` from `./campaign-context` and `buildScenePrepMessage` from `./scene-prep-message`; after the existing short-circuits, `const campaign = await loadCampaignById(campaignId).catch(() => null)` and set `message: buildScenePrepMessage(campaign?.openingScene)` (replacing the literal at `:965`). Update the handler (`ai-handlers.ts:285-288`) to `await aiService.prepareScene(...)` — preload/renderer contracts unchanged (F6). Update any `ai-service.test.ts`/`ai-handlers.test.ts` cases that call `prepareScene` synchronously.
4. Quest-seeding IPC (consumes the PHASE-28 store — run the F8 verification commands FIRST and adapt op field names to what actually landed):
   - `ipc-channels.ts`: `AI_SEED_QUESTS: 'ai:seed-quests'` in the AI block (near `AI_UPDATE_QUEST_LOG`).
   - `ipc-schemas.ts`: `SeedQuestsRequestSchema = z.object({ campaignId: z.string().min(1), quests: z.array(z.object({ name: z.string().min(1).max(200), description: z.string().max(2000).default(''), objectives: z.array(z.string().min(1).max(500)).max(8).default([]), chapterQuest: z.boolean().default(false) })).min(1).max(25) })` + export the inferred type. Extend `ipc-schemas.test.ts` (valid payload parses with defaults applied; empty quests array, missing name, >25 quests all rejected).
   - `ai-handlers.ts`: register a handler — `safeParse` the single request-object arg (F12 pattern), `sanitizeCampaignId(parsed.data.campaignId)` (`:93`), then `getMemoryManager(campaignId)` and for each quest: one quest-level `add` mutation (passing `chapterQuest`) followed by one `add_objective` mutation per objective, all awaited sequentially (the store serializes anyway; sequential keeps error attribution simple). Return `{ success: true, added: n }` or `{ success: false, error }` — never throw across IPC. Add `ai-handlers.test.ts` cases following the file's existing mock conventions: invalid payload → `success:false` without touching the memory manager; traversal campaignId (`'../x'`) rejected; happy path issues the expected mutation sequence (memory manager mocked).
   - `preload/index.ts` (`ai` namespace, `:80+`): `seedQuests: (campaignId: string, quests: Array<{name: string; description?: string; objectives?: string[]; chapterQuest?: boolean}>) => ipcRenderer.invoke(IPC_CHANNELS.AI_SEED_QUESTS, { campaignId, quests })`; mirror the typing in `preload/index.d.ts` returning `Promise<{success: boolean; added?: number; error?: string}>`.
5. `seed-quests.ts` (renderer): `export async function seedQuestsFromPack(campaignId: string, quests: SeedPack['quests']): Promise<{success: boolean; added?: number; error?: string}>` — no-op `{success: true, added: 0}` for empty/undefined; otherwise call `window.api.ai.seedQuests` and catch into `{success: false, error}` (callers toast; a quest-seeding failure must never abort campaign creation). Test with `vi.stubGlobal('window', …)`.

**Cheap checks:** `cd dnd-app && npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/main/ai/campaign-context.test.ts src/main/ai/scene-prep-message.test.ts src/shared/ipc-schemas.test.ts src/main/ipc/ai-handlers.test.ts src/renderer/src/services/seed-packs/seed-quests.test.ts`

**Acceptance:** a campaign with `toneInstructions` shows the tone block at the top of `[CAMPAIGN DATA]`; `prepareScene` on a campaign with `openingScene` sends the seeded message and falls back to the legacy literal otherwise (byte-identical default — assert in the scene-prep-message test); `AI_SEED_QUESTS` round-trips through preload typing; nothing changes for campaigns without the new fields.

### 37E — UI: wizard step, campaign-detail export/apply, i18n

**Objective:** packs are browsable/selectable when creating a campaign, and exportable/appliable from the campaign detail page.

**Files:** NEW `src/renderer/src/components/campaign/SeedPackBrowser.tsx`, `SeedPackBrowser.test.tsx`, `SeedPackStep.tsx`, `SeedPackStep.test.tsx`, `SeedPackApplyModal.tsx`, `SeedPackApplyModal.test.tsx`; EDIT `src/renderer/src/components/campaign/CampaignWizard.tsx`, `src/renderer/src/components/campaign/ReviewStep.tsx`, `src/renderer/src/pages/CampaignDetailPage.tsx`, `src/renderer/src/i18n/locales/en.json`, `src/renderer/src/i18n/locales/es.json`, `src/renderer/src/i18n/generated-keys.ts` (via the script, never by hand).

**Steps:**

1. `SeedPackBrowser.tsx` — shared dumb component: props `{ packs: SeedPack[]; selectedId: string | null; onSelect: (pack: SeedPack | null) => void; onImportFile: () => void }`. Renders a card grid (one `Card` per pack: name, level range, tags, description excerpt, per-section counts e.g. "7 lore · 6 NPCs · 3 quests · 2 tables") + an expanded preview for the selected pack (tone-instructions excerpt, opening-scene title/first line, quest names) + an "Import from file (.dndseed)" button. Follow `AdventureSelector.tsx`'s styling conventions (Card, collapsible sections, role/category color chips at `AdventureSelector.tsx:36-50`). All strings via `t('campaign.seedPacks.*')`.
2. `SeedPackStep.tsx` — wizard step: loads built-ins on mount (`loadBuiltInSeedPacks`), holds an additional imported-pack slot (file import via `importSeedPackFromFile`, errors toasted with the parse message), renders `SeedPackBrowser` plus a "No seed pack" default option. Props `{ selectedPack: SeedPack | null; onSelect: (p: SeedPack | null) => void }`. System mismatch (pack `system` ≠ wizard `system`) renders a warning line but does not block (forward compatibility; `'dnd5e'` is the only system today — F13).
3. `CampaignWizard.tsx` wiring:
   - `StepKey` union (`:39-49`): add `'seedPack'`; flow (`:144`): `f.push('aiDm', 'adventure', 'seedPack', 'sessionZero', …)`. `canAdvance` needs no change (`default: true`, `:244-246`).
   - State `const [seedPack, setSeedPack] = useState<SeedPack | null>(null)`; persist in the draft save effect + restore via `parseSeedPack` guard (never trust localStorage shape — drop silently on parse failure); include in both dependency lists (`:153-180`).
   - On select: prefill `name`/`description` ONLY when currently empty (`if (!name.trim()) setName(pack.name)` etc.).
   - Step render block (after the `'adventure'` block at `:522-539`): `{stepKey === 'seedPack' && <SeedPackStep selectedPack={seedPack} onSelect={…} />}`.
   - `handleCreate` (`:273+`): `settings.levelRange` becomes `selectedAdventure?.levelRange ?? seedPack?.levelRange ?? { min: 1, max: 20 }` (`:353`). After the existing resolved-maps/solo-players block (`:391-417`): build `let finalCampaign = { ...campaign, maps: resolvedMaps, players }`; when `seedPack` is set, `finalCampaign = applySeedPackToCampaign(finalCampaign, seedPack)`; persist via the existing `saveCampaign` call (extend its condition to `|| seedPack !== null`); then `if (seedPack?.quests?.length) { const r = await seedQuestsFromPack(campaign.id, seedPack.quests); if (!r.success) addToast(t('campaign.seedPacks.questSeedFailed'), 'error') }` — creation continues regardless (37D contract).
   - `ReviewStep.tsx`: add optional prop `seedPackName?: string | null` (default `null`) rendered next to `adventureName`; pass `seedPack?.name ?? null` at `:571-589`.
4. `CampaignDetailPage.tsx`:
   - "Export Seed Pack" button beside the existing export (`:282-284`): handler builds `const pack = extractSeedPackFromCampaign(campaign)`; if `window.api.ai.getQuestLog` exists (PHASE-28 — feature-detect with `typeof … === 'function'`), fetch it and map non-completed quests → `pack.quests` (`name`, `description`, objective texts, `chapterQuest`); then `exportSeedPackToFile(pack)` + success/error toasts.
   - "Apply Seed Pack" button: opens `SeedPackApplyModal` — props `{ open, onClose, campaign, onApplied: (c: Campaign) => void }`. Inside: source picker (built-ins via `loadBuiltInSeedPacks` + import-file), `SeedPackBrowser` for selection, then a confirm screen with per-section checkboxes (defaults all-on; sections absent from the pack hidden), an explicit note that content is APPENDED to the campaign and that tone/opening-scene only fill empty slots, and an Apply button: `applySeedPackToCampaign(campaign, pack, opts)` → `saveCampaign` (via `useCampaignStore`) → `seedQuestsFromPack` (when the quests checkbox is on) → toast + `onApplied`. Use the standard `Modal`/`Button`/`ConfirmDialog` components from `../components/ui`.
5. i18n: add ALL new keys to `en.json` AND `es.json` (proper Spanish, matching existing AI-DM terminology — the parity test fails otherwise, F13): `campaign.campaignWizard.steps.seedPack`, the `campaign.seedPacks.*` namespace (browser labels, counts, import button, parse-error toasts, apply-modal copy, `questSeedFailed`), `pages.campaignDetailPage.exportSeedPack` / `applySeedPack` / related toasts. Then `cd dnd-app && npm run i18n:gen-keys` and commit the regenerated `generated-keys.ts` with the locale edits.
6. Component tests (mock `window.api`, `loadBuiltInSeedPacks`, and the io helpers with `vi.mock`): `SeedPackBrowser.test.tsx` (renders pack cards + counts, fires onSelect, import button fires callback); `SeedPackStep.test.tsx` (loads built-ins, shows none-option, system-mismatch warning renders); `SeedPackApplyModal.test.tsx` (section checkboxes gate the options object passed to `applySeedPackToCampaign` — spy on it; apply saves and toasts; close resets).

**Cheap checks:** `cd dnd-app && npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/renderer/src/components/campaign/SeedPackBrowser.test.tsx src/renderer/src/components/campaign/SeedPackStep.test.tsx src/renderer/src/components/campaign/SeedPackApplyModal.test.tsx src/renderer/src/i18n/locale-parity.test.ts`

**Acceptance:** wizard shows the optional Seed Pack step for every hosting mode and a created campaign contains the pack's lore/NPCs/arcs/tables/tone/opening scene with fresh ids; detail page exports a `.dndseed` whose JSON contains no `aiDm`/`players`/`journal`/`inviteCode` keys; apply-modal merges into an existing campaign additively; locale parity green.

### 37F — Format documentation

**Objective:** a self-contained format reference so packs can be hand-authored and shared without reading source.

**Files:** NEW `dnd-app/docs/SEED-PACKS.md`.

**Steps:** document — format identification (`format: 'dnd-vtt-seed-pack'`, `formatVersion: 1`), the full field reference with caps (mirror 37A's schema), the envelope vs bare-file duality (both import), compatibility rules (unknown fields preserved on import/export — the Character-Card-V2 preservation principle; newer `formatVersion` rejected with a clear message; `extensions` is the namespaced escape hatch, e.g. `"myapp/portraits"`), apply semantics (append-only, re-ID on import, tone/opening fill-only-when-empty, quests go to the engine quest log), authoring checklist (original content only; verify `monsterId`/`statBlockId` against `dm/npcs/monsters.json` with the F13 one-liner; contiguous table bands; the 37C content bar), and a minimal hand-written example pack. Note the `'adventure-seeds'` library category is unrelated (F13).

**Cheap checks:** none beyond a markdown read-through (no code).

**Acceptance:** doc exists, matches the shipped schema field-for-field.

## Research notes

- **Scenario anatomy (what a seed must carry).** AI Dungeon scenarios decompose into exactly the slices this format adopts: an opening **Prompt** ("go long — set mood, background, situation, leave it open-ended" → our `openingScene.readAloud`), always-in-context **Plot Essentials** (world facts → our lore), **Author's Note** ("genre, writing style, overall tone", deliberately positioned late/close to generation → our `toneInstructions`, rendered inside `[CAMPAIGN DATA]` which rides the per-request context, after the static system prompt — consistent with PHASE-01's byte-stable-prefix constraint), keyword-triggered **Story Cards** (→ lore `keywords`, activating via PHASE-25's world-info mechanics), and **tags** for discovery. Sources: https://help.aidungeon.com/faq/what-are-scenarios, https://help.aidungeon.com/faq/what-is-the-authors-note, https://help.aidungeon.com/faq/plot-essentials.
- **Import ergonomics (what to copy, what to avoid).** AI Dungeon's story-card JSON import requires only `keys`+`value`, silently ignores invalid array entries, dedupes exact duplicates — and **fully overwrites the previous card set on import**, which their docs flag with a warning. Adopted: lenient top-level (loose objects, bare-file fallback), per-entry validation with precise error surfacing. Rejected: overwrite semantics — `applySeedPackToCampaign` is append-only, with per-section opt-outs in the apply modal. Source: https://help.aidungeon.com/story-cards-import-and-export.
- **Versioning + forward compatibility.** Character Card V2 is the de-facto community standard for portable LLM-content files: a `spec` literal + `spec_version` pair for identification, a hard rule that applications **never destroy unknown fields** on import/export, and a namespaced `extensions` object (`"agnai/voice"`) for third-party data. Adopted wholesale: `format`/`formatVersion` literals, `z.looseObject` round-trip preservation, `extensions: Record<string, unknown>` (the PHASE-33 portrait-prompt and PHASE-35 scene-library attachment point). Source: https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v2.md.
- **Market validation.** The 2026 AI-DM landscape survey identifies a world/scenario marketplace as Friends & Fables' single differentiating strength ("community-created settings you can drop into and play immediately") and notes competitors lack it (StoryRoll: "no world marketplace, no community-created content library"). F&F worlds bundle lore + NPCs + quests + tone — the same section list as this format. A file format + curated built-ins captures the play-value without hosting, moderation, or content-rating infrastructure (AI Dungeon requires automated content rating before publish — out of scope for a files-based approach). Sources: https://storyroll.app/blog/best-ai-dungeon-masters-2026, https://fables.gg/, https://play.aidungeon.com/.
- **Keyword-triggered lore (why `keywords` is in the schema now).** SillyTavern World Info / lorebooks are the genre-standard deterministic retrieval mechanism (entries fire on keyword scan, priority-resolved) and the audit assigns that mechanic to PHASE-25. Carrying optional `keywords` per lore entry from day one means packs authored today work with PHASE-25's injection without a format bump. Source: https://docs.sillytavern.app/usage/core-concepts/worldinfo/.
- **Alternatives considered.** (a) *Extend `.dndcamp` with a "template" flag* — rejected: the full-campaign exporter serializes play-state and `aiDm` API keys (F4); a seed needs exclusion by construction, not by flag. (b) *Extend the built-in `adventures.json` format* — rejected: it is creation-time-only, lacks tone/opening/quests/tables, and editing its loader risks the four shipped adventures; packs are a parallel mechanism (F2). (c) *A new bespoke file pipeline* — rejected: `entity-io` already provides envelopes, dialogs, size caps, and tests (F3). (d) *Zip/binary pack with map images* — rejected for v1: maps/images multiply size and need asset rewriting (`imagePath` baked into `GameMap`); `extensions` leaves the door open, and PHASE-33/34 own art/map generation. (e) *Hosted pack gallery* — rejected: the audit's premise is explicitly "no hosted infrastructure".

## Test plan

- **37A:** NEW `src/renderer/src/services/seed-packs/seed-pack-schema.test.ts` (parse/round-trip/version-gate/caps/loose-field preservation), NEW `seed-pack-apply.test.ts` (apply append/re-ID/opt-outs/no-clobber; extract secret-exclusion; round trip).
- **37B:** EDIT `src/renderer/src/services/io/entity-io.test.ts` (seedpack envelope case), NEW `seed-pack-io.test.ts` (export/import/cancel/bare-file/version-error with stubbed `window.api`).
- **37C:** NEW `built-in-packs.test.ts` (schema validation of shipped JSON, monster-id existence, table-band contiguity, content bar, loader skip-invalid behavior).
- **37D:** EDIT `src/main/ai/campaign-context.test.ts` (tone block presence/position/absence; table-names line), NEW `src/main/ai/scene-prep-message.test.ts` (default fallback byte-identical; seeded message contents; clipping), EDIT `src/shared/ipc-schemas.test.ts` (`SeedQuestsRequestSchema` cases), EDIT `src/main/ipc/ai-handlers.test.ts` (seed-quests validation/sanitization/happy path; async `prepareScene`), NEW `src/renderer/src/services/seed-packs/seed-quests.test.ts`.
- **37E:** NEW `SeedPackBrowser.test.tsx`, `SeedPackStep.test.tsx`, `SeedPackApplyModal.test.tsx`; the i18n additions are covered by the existing `locale-parity.test.ts` + regenerated key union.
- **End-of-phase 4-gate** (INSTRUCTIONS.md rule 5): `cd dnd-app && npm run lint && npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json && npx vitest run`. No Pi code touched → no pytest.

## Acceptance criteria

1. A `.dndseed` file exported from one campaign imports into another (and into the wizard) with every section intact, fresh ids, and zero play-state or credential fields — `grep` of an exported file for `claudeApiKey|openaiApiKey|geminiApiKey|inviteCode|"players"` finds nothing.
2. Three curated packs ship as static data, validate against the live schema in CI (37C test), reference only existing monster ids, and are selectable in the wizard's Seed Pack step for every hosting mode.
3. A campaign created from a pack: lore/NPCs visible in their campaign-detail managers, arcs in the Adventure manager, tables rollable in the DM Roll Table modal, quests (when PHASE-28's store is present) visible in the quest panel, and the first AI scene-prep narrates the pack's opening scene.
4. `toneInstructions` renders at the top of `[CAMPAIGN DATA]` for every AI request on seeded campaigns; campaigns without the new fields produce byte-identical context and the byte-identical legacy scene-prep message (no behavior change for existing campaigns — the feature is inert until a pack is applied or the fields are set).
5. Applying a pack to an EXISTING campaign appends content per the chosen sections and never overwrites existing tone/opening-scene text.
6. Unknown/extension fields in an imported pack survive a subsequent export (preservation round trip).
7. All new IPC traffic (`AI_SEED_QUESTS`) is zod-validated and campaignId-sanitized; malformed payloads return `{success:false}` without side effects.
8. 4-gate green; one phase commit; plan moved to `completed/` per INSTRUCTIONS.md rule 8.

## Out of scope

- Hosted pack gallery / marketplace, content rating, or any server-side sharing — deliberately excluded by the audit premise (files only).
- Maps, images, or audio inside packs (binary assets, `imagePath` rewriting) — image/battlemap generation is **PHASE-33/34**; a scene library that could join packs is the **PHASE-35** v2 candidate.
- Keyword-triggered lore *injection mechanics* (scan depth, priority, state toggles) — **PHASE-25**; this phase only carries `keywords` data.
- Quest checking, chapter advancement, director/oracle behavior — **PHASE-28** (this phase only writes seed quests through its store).
- The campaign-level `systemId`/plugin packaging surface — **PHASE-38**.
- Fixing the pre-existing `.dndcamp` full-campaign exporter's serialization of `aiDm` API keys (`campaign-io.ts:7-9`) — out of scope here (seed packs exclude it by construction); log to `docs/SECURITY-LOG.md` at execution per INSTRUCTIONS.md rule 12.
- Sanitizing the ten pre-existing unsanitized AI IPC handlers — **PHASE-13** (the one handler added here is born sanitized).
- Translating pack CONTENT (lore text, scene prose) — packs ship English-only; only UI chrome is localized.

## Completed

(Filled during execution per INSTRUCTIONS.md rule 17 — one line per sub-phase with file:line citations.)
