# PHASE-28 — Director agent, structured quest objectives, and dice-driven oracle

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Give the AI DM a narrative engine instead of a memory: (1) replace today's unstructured quest log (a `string[]` of free-text lines inside `world-state-summary.json`) with a structured quest store — quests with discrete objectives, statuses, and a chapter pointer — that the engine owns and the LLM mutates only through validated actions; (2) add an opt-in quest-checker post-pass that validates objective completion against the transcript after each AI response and gates chapter advancement (the RPGGO goal-manager pattern); (3) add an opt-in "director" planning pass, separate from the prose narrator, that periodically produces private pacing/foreshadowing/scene-framing notes injected into subsequent prompts (the multi-agent GM pattern that measurably improved immersion and coherence in user studies); and (4) add a dice-driven yes/no oracle with a chaos factor and random-event twists (solo-RPG GM-emulator practice) whose engine-rolled results enter the prompt as authoritative facts, countering the LLM's "yes-and" agreeability bias. All three behavior-changing features ship **off by default** behind per-campaign toggles; the only always-on change is the quest-log storage upgrade, which preserves the existing `update_quest_log` action contract.

## Dependencies & cross-phase notes

- **Depends on PHASE-27 (world-state store).** PHASE-27 owns "durable world-state store — engine owns truth, LLM emits deltas" plus the memory-manager lost-update races (the unlocked read-modify-write paths, including today's `updateQuestLog`). This phase's quest store is a sibling truth store: before implementing 28A, read `docs/phases/completed/PHASE-27-*.md` Completed section and reuse whatever persistence/locking primitives it landed in `src/main/ai/memory-manager.ts` (at minimum the `mutate()` lock at `memory-manager.ts:167`). If PHASE-27 generalized world-state into a new module, put the quest store alongside it using the same conventions instead of the file layout written here — keep the public function names from this plan so later phases (29) can find them.
- **Depends transitively on PHASE-23 (structured outputs, via 27).** The quest-checker and director passes emit JSON. PHASE-23 lands a structured-extraction helper (Ollama `format` = JSON schema, `stream:false`). Locate it at execution time (`grep -rn "format" dnd-app/src/main/ai --include=*.ts | grep -i "schema\|json"` and read `docs/phases/completed/PHASE-23-*.md`). Use it for both passes; the fallback path in 28C/28E (strict-JSON instruction + `repairJson` + zod) exists only if the helper's API doesn't fit.
- **PHASE-29 (model routing) routes this phase's new LLM call sites afterward.** PHASE-29's plan explicitly expects "PHASE-28 quest-checker/director call sites" and will reclassify them to its `'mechanics'` task class (`docs/phases/PHASE-29-model-routing.md:133,140,260`). Therefore: make every new non-narration LLM call go through ONE clearly named exported helper per module (`runQuestCheck`, `runDirectorPass`) that ultimately calls `getActiveProvider().chatOnce(...)` — never inline anonymous calls — and record the call sites in this plan's Completed section so PHASE-29 finds them.
- **Coordinate with PHASE-04 on `src/renderer/src/components/game/overlays/MutationApprovalPanel.tsx`** — PHASE-04 adds human-readable labels for unlabeled pending-action types. This phase adds two new `[DM_ACTIONS]` types (`update_quest_objective`, `advance_chapter`); PHASE-04 lands first (numeric order), so 28B must add labels for the two new types to whatever labeling map PHASE-04 created.
- **Coordinate with PHASE-09 on `src/renderer/src/services/chat-commands/`** — PHASE-09 dedupes command registrations and adds a registry collision test. This phase registers one new command (`/oracle`, alias `/fate`); verified unused today (see F9). The collision test will guard it.
- **Coordinate with PHASE-10 on `src/renderer/src/pages/campaign-detail/AiDmCard.tsx`** — PHASE-10 fixes wrong-provider prefill + ungated Save in the same file. 28F adds three toggles + one number input to the configure modal; merge textually.
- **Coordinate with PHASE-11 on `src/main/ai/prompt-sections/dm-actions-schema.ts`** — PHASE-11 fixes prompt/schema contract drift there; 28B updates the `update_quest_log` doc line and appends two new action doc lines. Merge textually, no semantic conflict. Per PHASE-30's cross-phase note, this phase must NOT touch `prompt-sections/combat-tactics.ts`.
- **Coordinate with PHASE-13** — PHASE-13 retrofits `sanitizeCampaignId` onto the ten unsanitized AI IPC handlers (including `AI_UPDATE_QUEST_LOG`). All NEW handlers in this phase call `sanitizeCampaignId` from day one so PHASE-13's inventory doesn't grow.
- **Coordinate with PHASE-26 (scene summarization)** — if PHASE-26 landed a scene-boundary hook in the conversation/summarization pipeline, the director cadence in 28E should ALSO fire on scene transitions (check `docs/phases/completed/PHASE-26-*.md`); the turn-count cadence written here is the baseline that works either way.
- **PHASE-01 (context window)** landed `num_ctx`/`keep_alive` + prefix-cache prompt ordering. Two binding constraints inherited from it: (a) the system prompt must stay byte-stable across requests — so ALL new prompt matter from this phase ([QUEST LOG], [DIRECTOR NOTES], [ORACLE] and their instruction headers) goes into the per-request **context block**, never into `assembleSystemPrompt` output; (b) the new context blocks are volatile and belong late in the prompt, which they get for free by living inside `assembleContext()`/`buildContext()` output (the audit-verified static-first ordering keeps context after the fixed system prompt).
- No Pi/bmo code is touched; the end-of-phase gate is the standard dnd-app 4-gate only.

## Verified findings

All verified 2026-06-10 against the live tree. Paths relative to `dnd-app/` unless noted; verification commands run from the repo root.

### F1 — Today's quest log is an unstructured `string[]`; no objectives, statuses, or chapters exist anywhere

`WorldStateSummary` (`src/main/ai/types.ts:115-122`) holds `activeQuests: string[]`. `MemoryManager.updateQuestLog(operation, name, description?)` (`src/main/ai/memory-manager.ts:453-486`) mutates that array with four operations (`add`/`update`/`complete`/`remove`), matching quests by case-insensitive **name prefix** (`q.toLowerCase().startsWith(name.toLowerCase())` — so a quest named "Find the smith" collides with "Find the smith's hammer"), storing each quest as the single string `` `${name}: ${description}` ``. `complete` drops the entry and appends a `recentEvents` line. There is no objective, status, timestamp, or chapter concept; `grep -rn "objective" dnd-app/src/main/ai --include=*.ts` → no quest-related hits; `grep -rni "chapter" dnd-app/src/main/ai --include=*.ts` → no hits.

```bash
sed -n '115,122p' dnd-app/src/main/ai/types.ts
sed -n '453,486p' dnd-app/src/main/ai/memory-manager.ts
```

### F2 — The full `update_quest_log` action chain (the contract 28A must preserve)

- Union member: `src/main/ai/dm-actions.ts:464-469` — `{ action: 'update_quest_log'; operation: 'add'|'update'|'complete'|'remove'; name: string; description?: string }`.
- Zod schema: `src/main/ai/ai-schemas.ts:1202-1207` (`UpdateQuestLogSchema`), registered in the action-schema map at `:1387`.
- Prompt documentation: `src/main/ai/prompt-sections/dm-actions-schema.ts:230` — one doc line telling the model to "maintain the structured quest log shown in [WORLD SUMMARY] → Active Quests".
- Renderer executor: `src/renderer/src/services/game-actions/effect-actions.ts:621-628` — `executeUpdateQuestLog` calls `window.api.ai.updateQuestLog?.(campaignId, operation, name, description)` **fire-and-forget** (no await, no error surface). Dispatch: `src/renderer/src/services/game-action-executor.ts:110` (import) and `:452-453` (case).
- IPC: channel `AI_UPDATE_QUEST_LOG = 'ai:update-quest-log'` (`src/shared/ipc-channels.ts:115`); handler `src/main/ipc/ai-handlers.ts:500-516` (validates `operation` against a literal array, does NOT call `sanitizeCampaignId` — PHASE-13 owns that retrofit); preload `src/preload/index.ts:150-155`, typing `src/preload/index.d.ts:290`.

```bash
grep -n "update_quest_log" dnd-app/src/main/ai/dm-actions.ts dnd-app/src/main/ai/ai-schemas.ts \
  dnd-app/src/main/ai/prompt-sections/dm-actions-schema.ts dnd-app/src/renderer/src/services/game-action-executor.ts
grep -n "executeUpdateQuestLog" dnd-app/src/renderer/src/services/game-actions/effect-actions.ts
grep -n "AI_UPDATE_QUEST_LOG" dnd-app/src/shared/ipc-channels.ts dnd-app/src/main/ipc/ai-handlers.ts dnd-app/src/preload/index.ts
```

### F3 — `updateQuestLog` bypasses the `mutate()` lock (lost updates under concurrency)

`MemoryManager` has a per-file serialized `mutate<T>(filename, mutator, fallback)` (`memory-manager.ts:167`) used by e.g. `adjustFactionReputation` (`:494-510`), but `updateQuestLog` does a bare `getWorldStateSummary()` → `setWorldStateSummary()` read-modify-write (`:458`, `:484`). Two concurrent quest dm-actions (the executor at F2 is fire-and-forget, so a single response with multiple quest actions runs them concurrently) can drop one write. This matches the consolidated-audit race finding; the world-state-summary race generally is PHASE-27's to fix — this phase fixes it for quests by giving the new `quests.json` store `mutate()`-locked operations from day one.

```bash
grep -n "private async mutate" dnd-app/src/main/ai/memory-manager.ts        # :167
sed -n '453,486p' dnd-app/src/main/ai/memory-manager.ts                      # no mutate() in quest path
```

### F4 — Quests reach the AI only as one line inside [WORLD SUMMARY]; they reach players not at all

`assembleContext()` (`memory-manager.ts:512`) renders `Active Quests: <joined strings>` into the `[WORLD SUMMARY]` line (`:536-543`). That output is part 7 of `buildContext` (`src/main/ai/context-builder.ts:305-318`), trimmed to `TOKEN_BUDGETS.memory` = **2000 tokens** (`src/main/data/token-budgets.json` → `"memory": 2000`). No renderer component consumes quests: `grep -rn "activeQuests" dnd-app/src --include=*.ts --include=*.tsx | grep -v "/main/ai/"` → zero hits. The only renderer view onto this data is the raw memory-file viewer (`src/renderer/src/components/game/bottom/AiContextPanel.tsx:54` reads files via `window.api.ai.readMemoryFile`).

### F5 — Single narrator pipeline; no planning/director layer; the post-response finalize hook is at `ai-service.ts:863-925`

`startChat` (`src/main/ai/ai-service.ts:610-731`) is the only narrative path: resolve model → `buildContext` (`:654-661`) → `conv.getMessagesForApi(context + providerContext)` → stream. The only secondary LLM call in the whole main process is the module-local summarizer `chatOnce` (`ai-service.ts:935-939`, wired as the conversation summarize callback at `:461-474`). The finalize branch of `handleStreamCompletion` (`:863-925`) is where parsed `statChanges`/`rulings` already get persisted fire-and-forget into the memory manager (`:887-910`) before `onDone` (`:921`) — this is the exact hook point for the 28C quest-checker and 28E director passes. `prepareScene` (`:943-983`) reuses `startChat`, so anything injected via `assembleContext` automatically reaches scene prep too.

```bash
grep -n "async function chatOnce\|setSummarizeCallback\|onDone(cleaned" dnd-app/src/main/ai/ai-service.ts
sed -n '863,925p' dnd-app/src/main/ai/ai-service.ts
```

### F6 — No oracle or engine-injected randomness exists; dice utilities are renderer-side

No `/oracle`, `/fate`, or chaos-factor concept exists (`grep -rni "oracle\|chaos factor\|fate check" dnd-app/src --include=*.ts --include=*.tsx` → no hits outside unrelated words). Dice rolling lives in the renderer: `src/renderer/src/services/dice/dice-engine.ts` (`parseDiceFormula:15`, `rollDice:25`, `rollFormula:39`, `evalDiceExpression:85`) and `src/renderer/src/services/game-actions/dice-helpers.ts:8` (`rollDiceFormula`). Nothing in `src/main` rolls dice or injects random results into prompts (`grep -rn "randomInt" dnd-app/src/main --include=*.ts` → no hits). The AI can *request* rolls from players (`request_roll` action, `src/main/ai/dm-actions.ts:120`) but nothing rolls *at* the AI. Consequence for 28D: the oracle rolls main-side (Node `crypto.randomInt`) at the moment of the command, and trustworthiness comes from posting the full roll math to chat, not from reusing the renderer dice engine.

### F7 — Per-campaign AI feature flags: `campaign.aiDm` is the right home and main can already read it

`AiDmConfig` (`src/renderer/src/types/campaign.ts:63-74`) holds `enabled/provider/model/ollamaUrl/…/discordBridge?: boolean` and hangs off `Campaign.aiDm?` (`:131`). The campaign-detail editor is `src/renderer/src/pages/campaign-detail/AiDmCard.tsx` (builds the `aiDm` object around `:100-104`). The main process can read these flags without any IPC/schema change: `loadCampaignById` (`src/main/ai/campaign-context.ts:3-9`) returns the raw campaign record and is already imported by `context-builder.ts`. The renderer store gate is `initFromCampaign` (`src/renderer/src/stores/use-ai-dm-store.ts:278-286`: `if (!aiDm?.enabled)` → disabled). So 28C/28D/28E flags are optional booleans on `AiDmConfig`, read main-side via `loadCampaignById` — absent on existing campaigns ⇒ `undefined` ⇒ off (backward compatible, no migration).

### F8 — Chat-command registry shape and the DM-command precedent

`ChatCommand` = `{ name, aliases?, description, usage, dmOnly?, category, execute(args, ctx) }` — see `src/renderer/src/services/chat-commands/commands-dm-ai.ts:4-17` (`/dm` with aliases `ai`, `aidm`, `dmOnly: true`, `category: 'dm'`, returning `{ type: 'system'|'error', content }`). Commands aggregate in `src/renderer/src/services/chat-commands/index.ts` (`allCommands` array, `:72+`).

### F9 — `/oracle`, `/fate`, `/quest` names are free

```bash
grep -rn "name: 'oracle'\|'fate'\|name: 'quest'" dnd-app/src/renderer/src/services/chat-commands/   # → no hits
```

### F10 — DM tab panel structure for the quest UI

DM tabs are defined in `src/renderer/public/data/ui/dm-tabs.json` (13 tabs incl. `aidm`); `DMTabPanel.tsx` lazy-loads `AiContextPanel` and renders it inside the `aidm` tab (`src/renderer/src/components/game/bottom/DMTabPanel.tsx:11`, `:280`), gated on `aiEnabled`. i18n keys follow `t('game.dmTabPanel.*')` (both `src/renderer/src/i18n/locales/en.json` and `es.json` must carry new keys). The quest panel (28F) mounts here — no new tab, no `dm-tabs.json` edit.

### F11 — `LLMProvider.chatOnce` has no structured-output parameter today

`src/main/ai/llm-provider.ts:21-38`: `chatOnce(systemPrompt, messages, model, maxTokens?)`. The Ollama implementation (`src/main/ai/ollama-client.ts:221-244`) posts `{ model, messages, stream:false }` to `/v1/chat/completions` with `OLLAMA_PREFILL_TIMEOUT_MS` and no `format`/options. This confirms the checker/director JSON reliability work rides on PHASE-23's helper (see Dependencies); `repairJson` (used by `dm-actions.ts` parsing) is the in-tree fallback JSON repairer.

### F12 — Main→renderer event precedent

`handleStreamCompletion` pushes events via `BrowserWindow.getAllWindows()[0]?.webContents.send(IPC_CHANNELS.AI_STREAM_FILE_READ, {...})` (`ai-service.ts:810-816`); the events section of `src/shared/ipc-channels.ts` (`AI_STREAM_CHUNK` etc., `:133+`) is where 28C's `AI_QUEST_STATE_CHANGED` belongs. Preload event subscriptions return unsubscribe functions (pattern per PHASE-05's lifecycle fixes — copy whatever pattern PHASE-05 left in `src/preload/index.ts` for `onStreamChunk`).

### F13 — Correction to the audit's director citation

The audit entry framed arXiv 2502.19519 as "a planner agent that reasons over pacing, tracks secrets/foreshadowing, frames scenes, and decides when to trigger encounters." Reading the paper: its v2 ("ChatRPG") is a **two-agent ReAct split — a Narrator (prose + combat tools) and an Archivist (state-tracking tools: UpdateCharacter/UpdateEnvironment)** — and is reactive; it does NOT implement a pacing/secrets planner. What the paper actually establishes: separating state-keeping from narration under ReAct produced statistically significant gains in mastery (p=0.004), immersion (p=0.034), curiosity (p=0.047), and story coherence (p=0.040) vs a prompt-only GM, and the authors note a single agent doing both was slower. The pacing/foreshadowing director concept is drawn from the broader game-AI literature (director systems watching player state and nudging encounter density/downtime) and RPGGO's goal-manager. The feature stands; the design in 28E is grounded accordingly: an asynchronous post-pass planner (so the narrator's latency is untouched — the paper's main caveat) producing private notes, not an in-line ReAct loop.

## Sub-phases

Order keeps the tree green: pure storage first, then the action surface, then the opt-in passes, then UI.

### 28A — Structured quest store (main process)

**Objective:** `quests.json` per campaign — engine-owned structured quests with objectives and a chapter pointer; existing `update_quest_log` semantics preserved on top of it; AI context renders a `[QUEST LOG]` block.

**Files:** NEW `src/main/ai/quest-log.ts`, NEW `src/main/ai/quest-log.test.ts`; EDIT `src/main/ai/memory-manager.ts`, `src/main/ai/memory-manager.test.ts`.

**Steps:**
1. In `quest-log.ts`, define and export (TS strict, no `any`):
   ```ts
   export interface QuestObjective {
     id: string                      // 'o1', 'o2', … unique within the quest
     text: string
     status: 'pending' | 'completed' | 'failed'
     completedAt?: string            // ISO
     evidence?: string               // transcript quote from the checker (28C)
   }
   export interface QuestRecord {
     id: string                      // slug of name + '-2' suffix on collision (reuse the slug regex from npcMemoryFromAttitude, memory-manager.ts:63-70)
     name: string
     description: string
     status: 'active' | 'completed' | 'failed' | 'abandoned'
     chapterQuest: boolean           // counts toward chapter advancement
     objectives: QuestObjective[]
     createdAt: string
     updatedAt: string
   }
   export interface ChapterState { number: number; title?: string; goal?: string; startedAt: string }
   export interface QuestLogFile {
     version: 1
     chapter: ChapterState
     pendingChapterAdvance?: { proposedAt: string; reason: string }
     quests: QuestRecord[]
   }
   ```
2. Export pure functions (no I/O — fully unit-testable): `emptyQuestLog(): QuestLogFile` (chapter 1); `migrateLegacyQuests(legacy: string[]): QuestRecord[]` (each `"Name: desc"` string → one active quest, `chapterQuest: false`, one pending objective `o1` with the description text, splitting on the first `: `); `applyQuestOperation(file, op)` where `op` is a discriminated union covering quest-level ops (`add`/`update`/`complete`/`remove` — exact-name match case-insensitively first, then prefix match, preserving F2 behavior; `add` accepts optional `chapterQuest`), objective ops (`add_objective`/`complete_objective`/`fail_objective`/`reopen_objective` keyed by quest name + objective id OR objective text match), and `advance_chapter` (increments `chapter.number`, sets title/goal, clears `pendingChapterAdvance`, stamps `startedAt`); `chapterReadyToAdvance(file): boolean` (every `chapterQuest` quest's objectives all `completed` AND at least one chapter quest exists); `renderQuestLogBlock(file): string` — produces:
   ```
   [QUEST LOG]
   (Engine-tracked truth. Reference objectives exactly; mark progress ONLY via update_quest_log / update_quest_objective actions — never invent or silently drop quests.)
   Chapter 2: The Mines of Khel — Goal: find the source of the tremors
   - Find the missing smith [active] (chapter quest)
     [x] o1 Ask around the tavern
     [ ] o2 Search the abandoned forge
   [/QUEST LOG]
   ```
   Caps: render at most 10 non-completed quests (most recently updated first) and 8 objectives each; completed quests render as a single one-line tail section (`Recently completed: A, B`) capped at 3.
3. In `MemoryManager` add: `getQuestLog(): Promise<QuestLogFile>` — reads `quests.json`; on null, builds from `emptyQuestLog()` + `migrateLegacyQuests(summary.activeQuests)` (one-time migration; write the result); `mutateQuestLog(op): Promise<QuestLogFile>` — `this.mutate<QuestLogFile>('quests.json', f => applyQuestOperation(f, op), …)` (the F3 fix: locked), then mirror quest names into `world-state-summary.json.activeQuests` (names only — keeps the raw-file viewer and any legacy reader coherent) and, for `complete`/`advance_chapter`, append the existing `recentEvents` lines.
4. Rewrite `updateQuestLog(operation, name, description?)` (`memory-manager.ts:453-486`) as a thin delegate to `mutateQuestLog` — signature unchanged, so the F2 chain (handler `ai-handlers.ts:500-516`, preload, executor) is untouched in this sub-phase.
5. In `assembleContext()` replace the `Active Quests:` fragment (`:536-543`) with `renderQuestLogBlock(await this.getQuestLog())` pushed as its own section (keep `[WORLD SUMMARY]` for location/time/weather/recentEvents). It remains inside the part-7 memory budget (F4) — no `ContextTokenBreakdown` change, no token-budgets.json change.

**Checks:** `npx vitest run src/main/ai/quest-log.test.ts src/main/ai/memory-manager.test.ts` + `npx tsc --noEmit -p tsconfig.node.json`.

**Acceptance:** legacy `activeQuests` migrate on first read; all four legacy operations behave per F2 on the new store; concurrent `mutateQuestLog` calls serialize (test: fire 10 parallel adds, expect 10 quests); `assembleContext` output contains `[QUEST LOG]`.

### 28B — Quest-objective + chapter actions end-to-end

**Objective:** the model (and the renderer) can manipulate objectives and chapters through validated `[DM_ACTIONS]` + IPC.

**Files:** EDIT `src/main/ai/dm-actions.ts`, `src/main/ai/ai-schemas.ts`, `src/main/ai/ai-schemas.test.ts`, `src/main/ai/prompt-sections/dm-actions-schema.ts`, `src/main/ai/AI_ACTION_CONTRACT.md`, `src/renderer/src/services/game-actions/effect-actions.ts`, `effect-actions.test.ts`, `src/renderer/src/services/game-action-executor.ts`, `src/shared/ipc-channels.ts`, `src/shared/ipc-schemas.ts`, `src/shared/ipc-schemas.test.ts`, `src/main/ipc/ai-handlers.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`, `src/renderer/src/components/game/overlays/MutationApprovalPanel.tsx` (labels only, per PHASE-04 coordination).

**Steps:**
1. `dm-actions.ts` union (next to `update_quest_log`, F2): add
   `{ action: 'update_quest_objective'; questName: string; operation: 'add'|'complete'|'fail'|'reopen'; objective: string }` (`objective` = text for `add`, id-or-text for the rest) and
   `{ action: 'advance_chapter'; title?: string; goal?: string; reason?: string }`.
   Extend the existing `update_quest_log` member with `chapterQuest?: boolean`.
2. `ai-schemas.ts`: matching zod object schemas + register both in the action map (pattern of `:1202-1207` / `:1387`); extend `UpdateQuestLogSchema` with `chapterQuest: z.boolean().optional()`. Add cases to `ai-schemas.test.ts` (valid + rejected-shape rows, mirroring existing table style).
3. `dm-actions-schema.ts`: update the `:230` doc line ("…shown in [QUEST LOG]…", mention `chapterQuest`) and add two doc lines: `update_quest_objective` ("tick concrete objectives when the fiction completes them; ids are shown in [QUEST LOG]") and `advance_chapter` ("only when [QUEST LOG] shows every chapter-quest objective completed, or the DM instructs"). Update `AI_ACTION_CONTRACT.md`'s action table.
4. IPC: channels `AI_GET_QUEST_LOG = 'ai:get-quest-log'`, `AI_UPDATE_QUEST_OBJECTIVE = 'ai:update-quest-objective'`, `AI_ADVANCE_CHAPTER = 'ai:advance-chapter'` (NPC-tracking section, after `:115`). Request schemas in `ipc-schemas.ts` (`QuestObjectiveUpdateSchema`, `AdvanceChapterSchema`) + tests. Handlers in `ai-handlers.ts` next to `:500`: each calls `sanitizeCampaignId(campaignId)` (F2 note), zod-parses the payload, calls `getMemoryManager(...).getQuestLog()/mutateQuestLog(...)`, returns `{ success, data?, error? }`. Preload `window.api.ai.getQuestLog/updateQuestObjective/advanceChapter` + `index.d.ts` typings.
5. Renderer executors in `effect-actions.ts` (after `:628`): `executeUpdateQuestObjective`, `executeAdvanceChapter` — same fire-and-forget invoke pattern as `executeUpdateQuestLog` (`:621-628`); dispatch cases in `game-action-executor.ts` next to `:452`. Labels for both new types in `MutationApprovalPanel`'s map (whatever shape PHASE-04 left).

**Checks:** `npx vitest run src/main/ai/ai-schemas.test.ts src/renderer/src/services/game-actions/effect-actions.test.ts src/shared/ipc-schemas.test.ts` + both tsc configs on changed surface.

**Acceptance:** a `[DM_ACTIONS]` block containing `update_quest_objective`/`advance_chapter` parses, validates, dispatches, and mutates `quests.json`; malformed payloads are rejected with logged issues (existing `validateDmActions` path).

### 28C — Quest-checker post-pass + chapter gating (opt-in: `aiDm.questTrackingEnabled`)

**Objective:** after each finalized AI response, a small structured LLM call proposes objective ticks validated against the store; chapter advancement is proposed, never auto-applied.

**Files:** NEW `src/main/ai/quest-checker.ts`, NEW `src/main/ai/quest-checker.test.ts`; EDIT `src/main/ai/ai-service.ts`, `src/renderer/src/types/campaign.ts` (`questTrackingEnabled?: boolean` on `AiDmConfig`), `src/shared/ipc-channels.ts` (event `AI_QUEST_STATE_CHANGED = 'ai:quest-state-changed'`), `src/preload/index.ts` + `index.d.ts` (`onQuestStateChanged` subscription returning unsubscribe), `src/renderer/src/components/game/GameLayout.tsx` (listener → system chat note).

**Steps:**
1. `quest-checker.ts`: export `runQuestCheck(campaignId: string, recentExchanges: Array<{role: string; content: string}>): Promise<QuestCheckResult>`:
   - Load `getQuestLog()`; if no pending objectives → return early (no LLM call).
   - Flat schema (small-model-reliable per the structured-outputs research — flat array, enum + string only):
     ```json
     { "updates": [ { "objectiveId": "string", "questId": "string", "result": "completed|failed", "evidence": "string" } ] }
     ```
   - Prompt: system = "You are a quest-objective auditor… Output ONLY JSON matching the schema; if nothing was clearly completed or failed, output {\"updates\":[]}". User = the rendered `[QUEST LOG]` block + the last 6 exchanges (cap each at 600 chars). Echo the schema in the prompt.
   - Call via the PHASE-23 structured-output helper (Dependencies); fallback: provider `chatOnce` + `repairJson` + zod `safeParse`, ONE retry on parse failure, then give up silently (log WARN).
   - **Engine validation (constrained decoding guarantees shape, not truth):** drop any update whose `questId`/`objectiveId` doesn't exist or whose objective isn't `pending`; cap evidence at 200 chars. Apply survivors via `mutateQuestLog`.
   - After applying, if `chapterReadyToAdvance(file)` and no `pendingChapterAdvance`, set `pendingChapterAdvance` (reason = completed chapter-quest names). Never call `advance_chapter` itself.
2. `ai-service.ts`: in the finalize branch after `onDone` (F5, `:921`), add a fire-and-forget `runPostResponsePasses(request, conv)` guarded by a module-level per-campaign in-flight flag (skip if a pass is already running). Inside: `const campaign = await loadCampaignById(request.campaignId)`; read `(campaign?.aiDm as { questTrackingEnabled?: boolean } | undefined)`; if enabled → `runQuestCheck(...)`. Wrap in try/catch + `logToFile('WARN', …)`; it must NEVER reject into the stream path or delay `onDone` (it runs after).
3. When `runQuestCheck` applied ≥1 update or set `pendingChapterAdvance`, push `AI_QUEST_STATE_CHANGED` with `{ campaignId, applied: [...], pendingChapterAdvance? }` via the F12 send pattern. GameLayout registers `onQuestStateChanged` once (alongside the other AI listeners, DM-side only) and posts a system chat note per applied update: `Objective completed: <quest> — <objective> (auto-detected; review in AI DM tab)`.

**Checks:** `npx vitest run src/main/ai/quest-checker.test.ts` (mock provider returning: valid updates, hallucinated ids, malformed JSON, empty updates) + tsc node.

**Acceptance:** flag off (default/absent) ⇒ zero extra LLM calls (test asserts the provider mock is not invoked); hallucinated objective ids are dropped; chapter advance is only ever *proposed*.

### 28D — Dice oracle (opt-in: `aiDm.oracleEnabled`)

**Objective:** engine-rolled yes/no fate checks with chaos factor and random-event twists, surfaced transparently in chat and injected as authoritative context.

**Files:** NEW `src/main/ai/oracle.ts`, NEW `src/main/ai/oracle.test.ts`; NEW `src/renderer/src/services/chat-commands/commands-dm-oracle.ts` + `commands-dm-oracle.test.ts`; EDIT `src/renderer/src/services/chat-commands/index.ts` (register), `src/shared/ipc-channels.ts` (`AI_ORACLE_FATE_CHECK`, `AI_ORACLE_SET_CHAOS`), `src/shared/ipc-schemas.ts` (+test), `src/main/ipc/ai-handlers.ts`, `src/preload/index.ts` + `index.d.ts`, `src/main/ai/memory-manager.ts` (oracle-state persistence + context render), `src/main/ai/ai-service.ts` (consume-on-finalize), `src/renderer/src/types/campaign.ts` (`oracleEnabled?: boolean`).

**Steps:**
1. `oracle.ts` — pure logic with injectable RNG (`rng: () => number` over [0,1); default wraps `crypto.randomInt`):
   - `type Likelihood = 'impossible'|'very-unlikely'|'unlikely'|'even'|'likely'|'very-likely'|'sure-thing'` with base d100 targets `5/15/35/50/65/85/95`, shifted by `(chaos − 5) × 5`, clamped to 1..99. (Original formula. Do NOT copy the Mythic GME Fate Chart tables verbatim — they are commercial content from Word Mill Games; the mechanic of odds-ladder + chaos shift is what we implement, with our own numbers and our own word tables.)
   - `fateCheck(question, likelihood, chaos, rng)` → `{ question, likelihood, chaos, roll, threshold, answer: 'yes'|'no'|'exceptional-yes'|'exceptional-no', randomEvent?: { focus, meaning: [verb, subject] } }`. Exceptional bands: `roll ≤ ceil(threshold/5)` ⇒ exceptional yes; `roll > threshold + floor((100−threshold)×4/5)` ⇒ exceptional no. Random event trigger: doubles (11,22,…,99) whose digit ≤ chaos.
   - Random-event tables (original wordings, module constants): `EVENT_FOCUS` d10 — `npc-acts`, `pc-setback`, `pc-boon`, `new-npc-appears`, `faction-moves`, `environment-shifts`, `object-revealed`, `omen-or-clue`, `threat-advances`, `quest-twist`; `MEANING_VERBS` and `MEANING_SUBJECTS` — two original 20-word lists (write plain evocative words: e.g. verbs `betray, conceal, pursue, …`; subjects `ally, relic, rumor, …`).
   - `sceneTest(chaos, rng)` → `{ roll: 1..10, result: 'as-planned'|'altered'|'interrupt' }` (≤ chaos: odd ⇒ altered, even ⇒ interrupt) — consumed by the director (28E).
   - `renderOracleBlock(entries)` →
     ```
     [ORACLE]
     (Engine dice results. These are established facts — weave them in; do not contradict or re-roll them.)
     Q: "Is the bridge guarded?" → NO (rolled 78 vs 50, chaos 5)
     Q: "Does the captain recognize them?" → EXCEPTIONAL YES (rolled 9 vs 65, chaos 6) + EVENT: faction-moves — betray / rumor
     [/ORACLE]
     ```
2. Persistence on `MemoryManager`: `oracle-state.json` `{ version: 1, chaos: number, pending: OracleEntry[], history: OracleEntry[] }` — `getOracleState`/`mutateOracleState` via `mutate()`; `history` capped at 50; `pending` are entries not yet seen by the model. `assembleContext()` appends `renderOracleBlock(pending)` (cap 5, newest last) when non-empty. In `ai-service.ts` finalize (F5 hook, same place as 28C), move `pending` → `history` (fire-and-forget) so each result is shown to the model until a response actually lands.
3. IPC: `AI_ORACLE_FATE_CHECK(campaignId, question, likelihood)` → rolls (reads chaos from state), appends to `pending` + `history`, returns the full result envelope; `AI_ORACLE_SET_CHAOS(campaignId, delta|value)` clamps 1..9. Both sanitize campaignId + zod-parse payloads. Preload + typings.
4. `/oracle` command (`commands-dm-oracle.ts`, `dmOnly: true`, alias `fate`, category `'dm'`, usage `/oracle [likelihood] <question> | /oracle chaos <+1|-1|N>`): parses an optional leading likelihood token (accept `impossible|very-unlikely|unlikely|even|50/50|likely|very-likely|sure-thing`, default `even`), invokes the IPC, and returns a `{ type: 'system' }` chat message with the FULL math: `Oracle: "Is the bridge guarded?" → NO — d100=78 vs target 50 (even odds, chaos 5)`, plus the event line when triggered. If `campaign.aiDm.oracleEnabled` is false → return an error result telling the DM to enable it in campaign AI settings (the command is the only renderer gate; main rolls regardless of the flag to keep the handler simple — the flag gates *use*, not capability).
5. Register in `chat-commands/index.ts`. Add usage line to `CommandReferenceModal` data if the registry doesn't feed it automatically (check `src/renderer/src/components/game/modals/utility/CommandReferenceModal.tsx` — it reads command metadata; verify at execution).

**Checks:** `npx vitest run src/main/ai/oracle.test.ts src/renderer/src/services/chat-commands/commands-dm-oracle.test.ts` — oracle tests use a scripted RNG: exact threshold math per likelihood × chaos 1/5/9, exceptional band edges, doubles-event gating (22 with chaos 1 vs chaos 5), clamping, scene-test parity.

**Acceptance:** `/oracle likely Does the guard sleep?` posts a transparent system chat line and the next AI request's context contains the `[ORACLE]` block exactly once (consumed after finalize); deterministic given a seeded RNG.

### 28E — Director planning pass (opt-in: `aiDm.directorEnabled`, cadence `aiDm.directorCadence` default 6)

**Objective:** an asynchronous planner produces private pacing/foreshadowing/scene-frame notes that steer subsequent narration, refreshed every N responses, with oracle scene-tests injecting genuine surprise.

**Files:** NEW `src/main/ai/director.ts`, NEW `src/main/ai/director.test.ts`; EDIT `src/main/ai/ai-service.ts` (extend `runPostResponsePasses`), `src/main/ai/memory-manager.ts` (`director-notes.json` + context render), `src/renderer/src/types/campaign.ts` (`directorEnabled?: boolean; directorCadence?: number`).

**Steps:**
1. `director.ts`: export `runDirectorPass(campaignId, recentExchanges): Promise<void>`:
   - Inputs assembled main-side: rendered `[QUEST LOG]`, `[WORLD SUMMARY]` + faction standings (reuse memory-manager getters), last 12 exchanges (600-char cap each), and — when `oracleEnabled` — a `sceneTest` roll (28D) whose `altered`/`interrupt` result MUST be reflected in the output notes ("the engine rolled an interrupt: introduce an unplanned complication of focus X").
   - Output schema (flat): `{ "sceneFrame": "string", "pacing": "build|peak|cooldown", "foreshadow": ["string"], "encounterSuggestion": "string", "secretToSurface": "string" }` (all fields required; empty string / empty array allowed — flat + required beats optional-heavy for small models). Same structured-output helper + fallback + ONE retry as 28C.
   - Persist via `MemoryManager` to `director-notes.json`: `{ version: 1, notes, generatedAt, responsesSinceRun: 0 }`; cap rendered length (`renderDirectorBlock` truncates each field, total ≤ ~150 words):
     ```
     [DIRECTOR NOTES]
     (Private planning guidance for you, the DM. Never reveal or quote these notes to players; let them shape pacing and what happens next.)
     Scene frame: …  Pacing: build.  Foreshadow: …  If an encounter fits: …
     [/DIRECTOR NOTES]
     ```
   - `assembleContext()` appends the block when the file exists and `directorEnabled` was true at generation time (store the flag snapshot in the file; context assembly itself stays flag-free and cheap).
2. `ai-service.ts` `runPostResponsePasses` extension: increment `responsesSinceRun` (via `mutateDirectorState`) on every finalize; when `directorEnabled` and `responsesSinceRun ≥ (directorCadence ?? 6)` — or when 28C just set/cleared `pendingChapterAdvance` (chapter turns are natural planning beats) — run `runDirectorPass` and reset the counter. Sequence AFTER `runQuestCheck` inside the same guarded async block so the director sees fresh quest state; both share the per-campaign in-flight flag.
3. Failure mode: any error/parse failure ⇒ keep the previous notes file untouched (stale notes beat no notes), log WARN, reset counter anyway (prevents a failing model from retrying every single response).

**Checks:** `npx vitest run src/main/ai/director.test.ts` (mock provider; cadence gating incl. flag-off ⇒ no call; malformed JSON keeps prior notes; scene-test text reaches the prompt; render cap) + tsc node.

**Acceptance:** flag off ⇒ no director LLM calls and no context block; flag on ⇒ `[DIRECTOR NOTES]` appears in `assembleContext` output after the cadence-th finalize and narration latency is unaffected (the pass runs post-`onDone`).

### 28F — Quest log UI, campaign settings, i18n

**Objective:** make engine quest truth visible/correctable by the DM, and expose the three opt-in toggles.

**Files:** NEW `src/renderer/src/components/game/bottom/QuestLogPanel.tsx` + `QuestLogPanel.test.tsx`; EDIT `src/renderer/src/components/game/bottom/DMTabPanel.tsx`, `src/renderer/src/pages/campaign-detail/AiDmCard.tsx` (+ its test), `src/renderer/src/i18n/locales/en.json`, `src/renderer/src/i18n/locales/es.json`.

**Steps:**
1. `QuestLogPanel` (props `{ campaignId: string }`): on mount + on `onQuestStateChanged`, fetch via `window.api.ai.getQuestLog(campaignId)`. Render chapter header (`number/title/goal`), quests grouped active→completed/failed, objectives as checkbox rows. Interactions (all through 28B IPC): toggle objective complete/reopen, mark failed (small ✕), and — when `pendingChapterAdvance` is set — an amber banner with the reason and an "Advance to chapter N+1" button calling `advanceChapter`. This is also the auto-tick undo surface (28C note text points here). Tailwind classes consistent with `AiContextPanel`; all strings via `t('game.questLog.*')`.
2. `DMTabPanel.tsx`: lazy-import and render `<QuestLogPanel campaignId={campaign.id} />` inside the `aidm` tab content directly below `<AiContextPanel …/>` (`:280`), inside the same `aiEnabled` gate and a `Suspense` fallback.
3. `AiDmCard.tsx` configure modal: a "Narrative engine" section with three checkboxes (quest auto-tracking / director / oracle — all default unchecked) + a cadence number input (2–20, shown only when director is on), persisted onto the `aiDm` object alongside the existing fields (around `:100-104`). Helper text states each is experimental and adds background model calls.
4. i18n: add every new key to BOTH `en.json` and `es.json` (translate es properly — match existing es.json AI-DM terminology).

**Checks:** `npx vitest run src/renderer/src/components/game/bottom/QuestLogPanel.test.tsx src/renderer/src/pages/campaign-detail/AiDmCard.test.tsx` + `npx tsc --noEmit -p tsconfig.web.json`.

**Acceptance:** with mocked `window.api.ai`, the panel renders quests/objectives, fires the right IPC on toggle, and shows the chapter-advance banner only when proposed; AiDmCard round-trips the three flags + cadence.

## Research notes

- **Director/narrator split.** arXiv 2502.19519 ("Static vs. Agentic Game Master AI for Facilitating Solo Role-Playing Experiences", 2025) — two ReAct agents (Narrator + Archivist state-keeper) significantly beat a prompt-only GM on mastery/immersion/curiosity/story-coherence (n=12, p<0.05 each); the authors flag single-agent in-line state updates as a latency problem. Design consequence: our planner runs **asynchronously after** a response (fire-and-forget post-pass) rather than as an in-line pre-pass, so narration latency is unchanged and a director failure degrades to "no notes". The pacing/secrets content of the notes follows the game-director literature (director systems tracking player state and nudging encounter density/downtime). Sources: https://arxiv.org/abs/2502.19519, https://arxiv.org/html/2502.19519, https://medium.com/@Nexumo_/ai-dungeon-masters-88c27c8f3d5d, https://github.com/deusversus/aidm (24-agent orchestrator — evidence the pattern scales, and a warning: we deliberately stop at TWO extra call sites to keep local-model token costs sane).
- **Structured quests + checker agent.** RPGGO's engine (arXiv 2407.08195, "A Text-to-Game Engine for UGC-Based Role-Playing Games") treats chapter goals as first-class structured objects; a **Game Status Manager** detects completion by inspecting dialogue history AND structured state, then concludes chapters and pushes new tasks. Two specifics adopted here: goals decompose into checkable sub-objectives ("anchor points" with completion criteria), and goal-checking is a *separate lightweight model task* validated against engine truth — we add the hard rule that checker output is filtered against the store (only existing, pending objective ids apply) because constrained decoding guarantees shape, not truth. Chapter advancement is proposed-not-applied: RPGGO auto-advances, but in a tabletop VTT the DM owns pacing, so a human confirm gate is the safer default. Sources: https://arxiv.org/html/2407.08195v2, https://blog.rpggo.ai/2025/02/21/technical-overview-rpggos-text-to-game-framework-for-ai-rpg/, https://docs.ollama.com/capabilities/structured-outputs, https://www.glukhov.org/post/2025/10/ollama-gpt-oss-structured-output-issues/ (flat schemas, few optionals, temperature 0, echo schema in prompt — followed in 28C/28E schema design).
- **Oracle/GM-emulator randomness.** Mythic GME mechanics (fate chart: odds tier × chaos factor 1–9 → d100 yes/no with exceptional bands; doubles whose digit ≤ chaos → random event; end-of-scene d10 vs chaos → altered scene/interrupt) are the proven solo-RPG fix for GM predictability — and map directly onto an LLM's "yes-and" agreeability bias. **Copyright caveat:** Mythic is a commercial product (Word Mill Games); the implementation uses an original formula (base targets 5/15/35/50/65/85/95, ±5×(chaos−5), original exceptional-band math) and original event/meaning word tables — mechanics are not protectable, exact tables/text are. Free alternatives studied for shape (CRGE's "Loom of Fate" d100 + qualifiers; MUNE's 3d6 variant) confirm the yes/no-with-qualifiers + twist-injection core is genre-standard. The "engine rolls, chat shows the math" transparency requirement comes from the solo-play practice that oracle trust depends on visible dice. Sources: https://wispsoftime.com/content/rolling-solo-chapter-6-part-mythic-game-master-emulator/, https://matthewsantacruz.substack.com/p/how-i-use-the-mythic-gm-emulator, https://jasonholtdigital.itch.io/mythic-gme-digital, https://oracle-rpg.com/2025/01/how-to-create-an-ai-gm-emulator-for-free-with-chatgpt/, https://boardgamegeek.com/geeklist/274079/solo-engines-and-gm-emulators, https://liberludorum.com/2021/03/14/rolling-solo/, https://www.dieheart.net/solo-rpg-resources/.
- **Why context blocks, not system prompt.** PHASE-01's prefix-cache work makes the system prompt byte-stability load-bearing (any early changed byte busts Ollama's KV cache and re-pays a ~9.6k-token prefill). All three new blocks are volatile, so they ride the per-request context (already positioned after the static prompt) with their authority/privacy instructions inlined in the block header — paying their tokens only when the features are on. Source: https://docs.ollama.com/faq (cache invalidates at first differing byte; also the keep_alive interaction).
- **Alternatives considered.** (a) In-line ReAct director pre-pass — rejected: adds a full LLM round-trip of latency to every narration on CPU-bound local models (the 2502.19519 latency caveat). (b) Reviving the dead `ai-renderer-actions.ts` `[ACTION:…]` tag system for quest ticks — rejected: that module is slated for deletion (audit; PHASE-08/09 cleanup) and the canonical `[DM_ACTIONS]` JSON path already has schema validation. (c) Letting the checker auto-advance chapters — rejected, DM-confirm gate (see RPGGO note). (d) Renderer-side oracle rolls via `dice-engine.ts` — rejected: prompt injection happens main-side at context-assembly time; a main-side roll with full math posted to chat keeps one source of truth (F6).

## Test plan

- **28A:** `src/main/ai/quest-log.test.ts` (pure ops: each legacy op parity case from F2, objective ops, chapter math, migration, render caps, prefix-vs-exact matching) and `memory-manager.test.ts` additions (locked concurrent mutations; `assembleContext` contains `[QUEST LOG]`; activeQuests mirror).
- **28B:** `ai-schemas.test.ts` (2 new action schemas + `chapterQuest` extension), `effect-actions.test.ts` (2 new executors), `ipc-schemas.test.ts` (new request schemas).
- **28C:** `quest-checker.test.ts` (provider mocked: applies valid updates, drops hallucinated ids/non-pending objectives, malformed JSON → one retry → silent skip, flag-off → no provider call, proposes chapter advance exactly once).
- **28D:** `oracle.test.ts` (seeded-RNG determinism: thresholds per likelihood × chaos, exceptional bands, doubles events, scene test, clamps), `commands-dm-oracle.test.ts` (parse forms, disabled-flag error, system-message format).
- **28E:** `director.test.ts` (cadence gating, flag-off, parse-failure keeps prior notes, scene-test injection, render cap).
- **28F:** `QuestLogPanel.test.tsx` (render + IPC wiring + advance banner), `AiDmCard.test.tsx` additions (toggle round-trip).
- **End-of-phase 4-gate** (INSTRUCTIONS.md rule 5): `npm run lint`, `npx tsc --noEmit -p tsconfig.web.json`, `npx tsc --noEmit -p tsconfig.node.json`, full `npx vitest run`. No Pi code → no pytest.

## Acceptance criteria

1. `quests.json` is the single quest truth: structured quests/objectives/chapter survive restart, migrate from legacy `activeQuests`, and all mutations go through the `mutate()` lock.
2. The legacy `update_quest_log` action and IPC behave identically from the model's and renderer's perspective (same schema accepted, same operations honored).
3. The model can tick objectives and propose chapters via validated `[DM_ACTIONS]`; invalid targets are dropped and logged, never crash the executor.
4. With all three flags absent/false (every existing campaign): zero new LLM calls, zero new context blocks except `[QUEST LOG]` (which replaces the old `Active Quests` line at comparable token cost), zero UI changes outside the read-only quest panel in the DM-only `aidm` tab.
5. With `questTrackingEnabled`: objective auto-ticks appear as system chat notes with evidence, are undoable in the quest panel, and chapter advancement always requires a human click (or an explicit approved `advance_chapter` action).
6. With `oracleEnabled`: `/oracle` produces a transparently-rolled answer in chat and the next AI request carries it as an authoritative `[ORACLE]` context block consumed exactly once.
7. With `directorEnabled`: `[DIRECTOR NOTES]` regenerates on the configured cadence with no added narration latency; notes never appear in player-visible text (prompt instruction + DM-only surfaces).
8. 4-gate green; one phase commit; plan moved to `completed/` per INSTRUCTIONS.md rule 8.

## Out of scope

- Generalized world-state delta store, NPC opinion persistence, spatial consistency, and the broader memory-manager lock retrofits — **PHASE-27**.
- Routing the new checker/director calls to a small model + model-swap UI — **PHASE-29** (this phase just keeps the call sites singular and named).
- Entity/lore record extraction and keyword-triggered world-info injection — **PHASE-25**.
- Scene-boundary summarization (and any scene-transition hook the director may later consume) — **PHASE-26**.
- Session recaps / campaign Q&A side-channel — **PHASE-31**.
- Safety constraints (lines/veils, X-card) on narration including director/oracle outputs — **PHASE-32**.
- Deterministic monster turns and encounter execution (the director only *suggests* encounters) — **PHASE-30**.
- Quest content in seed packs (export/import of the quest log file format) — **PHASE-37**.
- Sanitizing the ten PRE-EXISTING unsanitized AI IPC handlers — **PHASE-13** (new handlers here are born sanitized).

## Completed

(Filled during execution per INSTRUCTIONS.md rule 17 — one line per sub-phase step with file:line citations.)
