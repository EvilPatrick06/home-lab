# PHASE-26 — Scene-boundary layered summarization (scene → session → campaign)

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Replace the AI DM's message-count-threshold conversation compaction (which today fires an *awaited* LLM summarize call on the chat request path roughly every 2–3 player turns and rewrites the summary prefix each time) with an opt-in, scene-boundary layered memory: completed scenes are summarized once, off the request path, at narrative boundaries (map change, rest, combat end, an explicit DM command, or a size backstop); scene summaries roll up into session summaries and session summaries into a single campaign summary, so the conversation prefix the model sees changes only at scene boundaries instead of every few turns. This is the CALYPSO-pattern compaction keyed to narrative structure rather than buffer pressure: it removes the periodic mid-conversation latency spike (a full non-streaming LLM call blocking `getMessagesForApi`), bounds long-campaign memory by tier instead of by repeated summary-of-summary erosion, and synergizes with PHASE-01's prefix-cache work by keeping the history segment of the prompt byte-stable between boundaries. The feature is **off by default, per campaign**; with the flag off, runtime behavior is byte-identical to today.

## Dependencies & cross-phase notes

- **Depends on PHASE-01 (ollama-context-window).** 01 establishes `num_ctx`/`keep_alive`, static-first prompt ordering in `context-builder.ts`, and `getEffectiveBudgets()`/`getActiveContextWindow()` in `token-budget.ts`. This phase must NOT re-tune budget scaling or `token-budgets.json` totals (01 owns them — see 01C) and must not reorder `buildContext` parts. The KV-synergy claims below are scoped to what 01 leaves cacheable (see Verified findings F8).
- **Depends on PHASE-07 (conversation-persistence).** 07 explicitly left `maybeSummarize` untouched for this phase ("Keep `maybeSummarize` untouched here" — PHASE-07 line 13). After 07: `getMessagesForApi` has signature `(contextBlock: string, contextTruncated = false)`, the truncation flag uses `withinBudget.length < recentMessages.length`, `getLastTokenBreakdown` is no longer read inside `conversation-manager.ts`, and `AI_RESTORE_CONVERSATION` validates its payload with a zod `ConversationData` schema whose `summaries` items are `z.object({ content: z.string(), coversUpTo: z.number() })`. **26D must extend that schema** with the new optional summary fields or zod will silently strip them on restore (zod strips unknown object keys by default). Re-verify the schema's location from PHASE-07's Completed section (07D placed it in `src/main/ipc/ai-handlers.ts` or `src/shared/ipc-schemas.ts`).
- **PHASE-08 (executor-batch-correctness)** deletes the dead `ai-stream-handler.ts`/`finalizeAiResponse` pipeline. Its `getMessagesForApi` caller (`ai-stream-handler.ts:132`) and the duplicate `saveConversation` in `ai-response-parser.ts:139` should be gone by execution time — re-verify with `grep -rn "getMessagesForApi" dnd-app/src/main --include='*.ts' | grep -v test` and treat `ai-service.ts` as the only production pipeline.
- **PHASE-09 (chat-commands-cleanup)** adds a registry collision test for chat commands; the new `/scene` command in 26E must pass it (verified today: no `/scene` command or alias exists).
- **PHASE-10 (ai-dm-ui-truth)** edits `src/renderer/src/pages/campaign-detail/AiDmCard.tsx`. 26E adds a toggle to the same card — 10 lands first; re-verify the card layout before editing.
- **PHASE-13 (dnd-platform-debt)** extends `sanitizeCampaignId` to the unsanitized AI IPC handlers (including `AI_SYNC_WORLD_STATE`). 26D adds a boundary hook *inside* `AI_SYNC_WORLD_STATE` but does NOT add the sanitize call there (13 owns it; if 13 already landed, keep its sanitize line intact). All NEW handlers added by 26D call `sanitizeCampaignId` from day one.
- **PHASE-25 (entity-memory-lore)** runs immediately before this phase and touches `ai-service.ts` `handleStreamCompletion`'s terminal block (25C fire-and-forget entity extraction) and the `buildContext` call site (25E). 26C inserts into the same terminal block — re-verify post-25 line numbers (rule 3) and place the 26C hook after 25C's insertion.
- **PHASE-23 (structured-outputs)** also edits the terminal block (mutation extraction merged before `onDone`). Same re-verify note.
- **Coordinate with PHASE-27 (world-state-store):** 27G adds a sibling opt-in toggle row to `AiDmCard` and follows the same engine-owned-flag-file pattern this phase uses; 27's plan already notes "PHASE-26 … run[s] before 27".
- **Coordinate with PHASE-29 (model-routing):** 29B will route the summarize callback (`ai-service.ts:464-470`) to a small model under the `'summary'` task class and explicitly scans this phase's Completed section for new LLM call sites. Keep all new summarization traffic flowing through the existing `summarizeCallback`/`chatOnce` funnel so 29 has a single seam.
- **Coordinate with PHASE-31 (recaps):** 31 builds on `generateSessionSummary` (`conversation-manager.ts:156-181`, `ai-service.ts:999-1015`, IPC `AI_GENERATE_END_OF_SESSION_RECAP`). 26 must preserve that export's signature and its `appendSessionLog` side-effect; in scene mode the recap becomes a roll-up of scene summaries (better input, same contract).
- **Coordinate with PHASE-32 (safety-tools):** 32D adds `ConversationManager.removeLastAssistantMessage()` and relies on the invariant "summaries cover a pruned prefix; the un-summarized tail is `this.messages`" — this phase KEEPS that invariant (`coversUpTo: -1` for all new summaries; pruning only ever splices a prefix).

## Verified findings

All verifications run 2026-06-10 against the live tree (worktree `ai-p6-roadmap`, branch `master`). Line numbers cited are pre-PHASE-01/07/23/25; re-run each command before implementing (rule 3).

### F1 — Compaction today is a MESSAGE-COUNT threshold (not a token threshold as the audit said), fires every ~2–3 turns, and runs an awaited LLM call on the chat request path

**Corrected claim** (audit said "token thresholds"; reality is a message-count threshold — and the audit under-stated the cost: the summarize call is *awaited inside the request path*):

- `src/main/ai/conversation-manager.ts:9` — `const MAX_RECENT_MESSAGES = 10`.
- `:74` — `getMessagesForApi` begins with `await this.maybeSummarize()` — every chat request first runs compaction *synchronously in its own latency path*.
- `:183-208` — `maybeSummarize()` (audit cited 187-204; actual body is 183-208): returns early if `this.messages.length < MAX_RECENT_MESSAGES` (`:185`); otherwise summarizes the older half (`halfPoint = floor(length/2)`, `:187`), `await this.summarizeCallback(...)` (`:195` — a full **non-streaming** LLM round-trip via `chatOnce`), then `this.messages.splice(0, halfPoint)` (`:200`) and pushes `{ content, coversUpTo: -1 }` (`:201-204`). Errors are logged and swallowed (`:205-207`).
- Cadence trace: after a fire, 5 messages remain; each player turn adds 2 (user `ai-service.ts:634`, assistant `:881`), so the threshold (≥10) re-fires after ~2.5 turns. On a local CPU model, each fire re-pays a multi-thousand-token prefill (PHASE-01 F-series) *before the player's actual request even starts streaming*.
- The FILE_READ/WEB_SEARCH restream path also calls `getMessagesForApi('')` (`ai-service.ts:760`), so compaction can additionally fire mid-recursion.

```bash
sed -n '9p;74p;183,208p' dnd-app/src/main/ai/conversation-manager.ts
grep -n "getMessagesForApi(" dnd-app/src/main/ai/ai-service.ts        # → :663 (startChat), :760 (restream)
```

### F2 — Summary model: a flat list, only the LATEST entry is ever injected, prepended into the first user message of the window

- `src/main/ai/types.ts:171-174` — `ConversationSummary { content: string; coversUpTo: number }`; `:176-180` — `ConversationData { messages, summaries, activeCharacterIds }`.
- `conversation-manager.ts:102-105` — `latestSummary = summaries[summaries.length - 1]`; older summaries are dead weight (serialized forever, never read).
- `:107-114` — history budget loop packs newest-first against `TOKEN_BUDGETS.conversationHistory`.
- `:116-131` — injection: `[Previous conversation summary: <latest>]\n\n` prepended to the first user message of the window (or a synthetic `Please continue from where we left off.` user message when the window starts with an assistant message / is empty).
- Post-prune invariant (established by an earlier fix, comments at `:196-199` and `:222-236`): the latest summary precedes ALL of `this.messages`; `coversUpTo === -1`; `restore()` migrates legacy absolute-index data by splicing the summarized prefix (`:218-237`).

```bash
sed -n '102,131p' dnd-app/src/main/ai/conversation-manager.ts
sed -n '171,180p' dnd-app/src/main/ai/types.ts
```

### F3 — One summarize funnel: a generic ≤200-word prompt on the primary model; the manager already embeds per-call instructions in the text

- `src/main/ai/ai-service.ts:461-474` — `getConversation()` installs the callback: `chatOnce('You are a conversation summarizer. Summarize the following D&D conversation concisely, preserving key facts, decisions, NPC names, locations, and combat outcomes. Keep it under 200 words.', text)`.
- `:934-939` — `chatOnce(systemPrompt, userMessage)` → `provider.chatOnce(...)` with `currentConfig.model` (the primary model — PHASE-29 routes this later).
- `conversation-manager.ts:164-171` — `generateSessionSummary` already prepends its own instruction ("Generate an end-of-session recap…") into the `text` argument — precedent for tier-specific prompts flowing through the single callback without changing its signature.

```bash
sed -n '461,474p;934,939p' dnd-app/src/main/ai/ai-service.ts
```

### F4 — Session-summary machinery exists and has IPC consumers whose contracts must survive

- `conversation-manager.ts:156-181` — `generateSessionSummary()`: messages since last summary → `Player:`/`DM:` transcript (500-char cap per message, `:165`) → callback → pushes `{ content, coversUpTo: messages.length - 1 }` (NOTE: absolute index — pre-prune format! — `restore()` re-normalizes it; new code must use `-1`).
- `ai-service.ts:999-1015` — exported `generateSessionSummary(campaignId)`: delegates, then `memMgr.appendSessionLog(sessionId, '\n--- SESSION SUMMARY ---\n…')` with `sessionId = new Date().toISOString().slice(0, 10)`.
- Consumers: `src/main/ipc/ai-handlers.ts:311-321` (`AI_GENERATE_END_OF_SESSION_RECAP` — returns `{success, data|error}`; PHASE-31 repairs its missing preload wire) and `:325-336` (`AI_SAVE_CONVERSATION` generates a summary alongside the save).

```bash
grep -n "generateSessionSummary" dnd-app/src/main/ai/ai-service.ts dnd-app/src/main/ai/conversation-manager.ts dnd-app/src/main/ipc/ai-handlers.ts
```

### F5 — "Scene" today: prep status + a synced map-name string; NO narrative scene tracking in the conversation layer

- `ai-service.ts:147-160, 941-991` — `scenePrepStatus` is a per-campaign `idle|preparing|ready|error` map for the OPENING scene-prep stream only (PHASE-06's territory). It is not a scene-boundary concept.
- `src/main/ai/memory-manager.ts:13-21` — `WorldState.currentScene: string` (`:18`); `:182-197` — `get/updateWorldState` persists to `ai-context/world-state.json`.
- The renderer writes it: `src/renderer/src/services/io/ai-memory-sync.ts:36` — `currentScene: activeMap?.name ?? ''` inside `buildWorldState`, debounced 2000 ms (`:6`), sent via `window.api.ai.syncWorldState` (`:98`, preload `src/preload/index.ts:123`), handled at `src/main/ipc/ai-handlers.ts:423-432` (`AI_SYNC_WORLD_STATE` → `memMgr.updateWorldState`). **A map change therefore already reaches the main process as a `currentScene` string change** — a deterministic, renderer-truth boundary signal needing no new plumbing.
- `ConversationManager` has zero scene awareness: `grep -n "scene" dnd-app/src/main/ai/conversation-manager.ts` → no hits.

```bash
sed -n '13,21p;182,197p' dnd-app/src/main/ai/memory-manager.ts
sed -n '25,43p;89,103p' dnd-app/src/renderer/src/services/io/ai-memory-sync.ts
sed -n '423,432p' dnd-app/src/main/ipc/ai-handlers.ts
```

### F6 — Boundary signals available at stream completion: parsed DM actions (with an approval caveat)

- `ai-service.ts:863-922` — `handleStreamCompletion` terminal block: `parseDmActions(cleaned)` at `:873` yields `DmActionData[]` (`{ action: string; [key: string]: unknown }`, `types.ts:55-58`); assistant message appended `:881`; auto-save `:883-885`; fire-and-forget memory persistence `:887-905`; `onDone` `:917`.
- Action names verified in the `DmAction` union (`src/main/ai/dm-actions.ts`): `switch_map` (`:96`, carries `mapName`), `long_rest`/`short_rest` (`:178-179`), `end_initiative` (`:60`).
- **Caveat:** parsed actions execute renderer-side and may be rejected in the approval flow — a boundary fired on a parse that the DM later rejects compresses slightly early. Accepted: the summary still accurately covers what was narrated; the world-sync hook (F5) covers the executed-map-change case with renderer truth.

```bash
sed -n '863,922p' dnd-app/src/main/ai/ai-service.ts
grep -n "switch_map\|'long_rest'\|'short_rest'\|'end_initiative'" dnd-app/src/main/ai/dm-actions.ts
```

### F7 — Opt-in flag pattern: engine-owned per-campaign file (NOT `AiConfig`), matching PHASE-27G

- Global AI config (`AiConfig`, `types.ts:5-14`; zod `AiConfigSchema`, `src/shared/ipc-schemas.ts:5-13`; persisted by `configure()`/`getConfig()` at `ai-service.ts:325-374/376-395`) is app-wide, not per-campaign, and is contested by PHASES 03/10/29 — wrong home for this flag.
- Precedent: PHASE-25 stores its flags in `ai-context/entities.json`; PHASE-27 stores `enabled` in its store file with IPC set-enabled + an `AiDmCard` toggle, explicitly because main-process prompt code can't read renderer-threaded campaign fields without invasive plumbing. This phase mirrors that: `ai-context/scene-memory.json`, default `{ enabled: false }`.
- Atomic write helper exists: `src/main/storage/atomic-write.ts:20` `atomicWriteFile` (already imported by `ai-service.ts:9`).
- `sanitizeCampaignId` (UUID regex + path containment) lives at `ai-handlers.ts:92-103`; all new handlers must call it.

```bash
sed -n '5,13p' dnd-app/src/shared/ipc-schemas.ts
grep -n "atomicWriteFile" dnd-app/src/main/storage/atomic-write.ts dnd-app/src/main/ai/ai-service.ts
sed -n '92,103p' dnd-app/src/main/ipc/ai-handlers.ts
```

### F8 — KV-cache synergy: what this phase can and cannot buy (honest scoping of the audit's claim)

The audit claimed scene-boundary compaction "means every mid-scene turn stays a warm KV-cache hit." Verified against the prompt assembly: the cache invalidates at the FIRST differing byte, and the system prompt *precedes* the message array. Post-PHASE-01, the system prompt is ordered static-first with the volatile `[GAME STATE]`/`[GAME TIME]` block LAST, but retrieved rulebook chunks are query-volatile and game-time changes every message — so tokens *after* that point (including all conversation history) are re-prefilled each turn regardless. What this phase actually delivers:

1. **Removes the recurring extra LLM call** (F1) from the request path entirely — the largest, indisputable win on local CPU.
2. **Stops the summary-prefix rewrite churn**: today the `[Previous conversation summary: …]` text mutates every ~2–3 turns; after this phase it mutates only at scene boundaries, so the history segment is append-only between boundaries (maximal *suffix* reuse for providers/configurations where the context segment is stable, and a smaller re-prefill region in all cases since the layered block is compact and bounded).
3. **Bounds prompt growth**: layered roll-ups keep the recap block ≤ a fixed token budget instead of letting the flat `summaries` list and message tail wander.

Sources for the cache-invalidation mechanics: PHASE-01 Research notes ([Ollama prompt caching](https://leanpub.com/read/ollama/prompt-caching), [KV cache & scheduling](https://jonathanding.github.io/llm-learning/en/articles/ollama-kv-cache-scheduling/), [Ollama FAQ](https://docs.ollama.com/faq)).

### F9 — Renderer surfaces for 26E exist and have no collisions

- No `/scene` chat command or alias: `grep -rn "'scene'" dnd-app/src/renderer/src/services/chat-commands/*.ts | grep -v test` → no hits. `sessionCommand` pattern to copy: `commands-dm-campaign.ts:115-144` (`dmOnly: true`, `category: 'dm'`, sub-command switch). `CommandContext` (`chat-commands/types.ts:16-26`) has no campaignId, but the leaf module `src/renderer/src/services/active-campaign-ref.ts:24-27` exposes `getActiveCampaignId()` synchronously (built exactly for store-cycle-free reads). Commands may be async (`execute` returns `CommandReturn | Promise<...>`, `types.ts:36`).
- `AiDmCard.tsx` renders an enabled-state card + a configure modal (`:16-23, 58-90`); the toggle row lands in the `campaign.aiDm?.enabled` branch. (Re-verify post-PHASE-10.)
- Preload `api.ai` block starts at `src/preload/index.ts:80`; type declarations pattern at `src/preload/index.d.ts:246` (`syncWorldState`). `generateEndOfSessionRecap` is absent from preload (PHASE-31 F1 — do not add it here).

```bash
grep -rn "'scene'" dnd-app/src/renderer/src/services/chat-commands/*.ts | grep -v test   # → empty
sed -n '24,27p' dnd-app/src/renderer/src/services/active-campaign-ref.ts
```

### F10 — Existing test base

`src/main/ai/conversation-manager.test.ts` mocks `dm-system-prompt`, `prompt-sections/combat-tactics`, `prompt-sections/narrative-rules`, and `token-budget` (TOKEN_BUDGETS with `conversationHistory: 2000`) at module level (`:1-31`), then exercises add/serialize/restore/getMessagesForApi/maybeSummarize ("prunes messages array after summarize", "triggers summarization when many messages exist") and `generateSessionSummary`. New tests extend this file with the same mock setup. `ai-service.test.ts` and `src/shared/ipc-channels.test.ts` (uniqueness/format assertions auto-cover new channels) also exist.

## Sub-phases

Constants used throughout (define once in `conversation-manager.ts`, exported for tests):

```ts
const SCENE_CARRYOVER_MESSAGES = 4   // recent messages kept verbatim across a boundary
const SCENE_SUMMARY_MIN_MESSAGES = 6 // smaller scenes are not worth an LLM call
const SCENE_ROLLUP_KEEP = 4          // scene summaries kept verbatim after a session roll-up
const SCENE_ROLLUP_THRESHOLD = 8     // scene-tier count that triggers a session roll-up
const SESSION_ROLLUP_THRESHOLD = 4   // session-tier count that triggers a campaign roll-up
const SUMMARY_BLOCK_BUDGET = 1200    // token cap for the assembled [CAMPAIGN MEMORY] block
```

### 26A — Tiered summary model + scene-mode core in `ConversationManager`

**Objective:** the manager supports two summarization modes; `'threshold'` (default) is byte-identical to today; `'scene'` adds `endScene`, tier roll-ups, and layered injection.

**Files:** `src/main/ai/types.ts`, `src/main/ai/conversation-manager.ts`, `src/main/ai/conversation-manager.test.ts`.

**Steps:**

1. `types.ts` — extend `ConversationSummary` (`:171-174`) with optional fields (backward-compatible with all stored JSON):
   ```ts
   export interface ConversationSummary {
     content: string
     coversUpTo: number
     /** Layered-memory tier (PHASE-26). Untiered legacy entries are treated as 'scene'. */
     tier?: 'scene' | 'session' | 'campaign'
     /** Human label for the scene (map name, '/scene end' argument, …). */
     label?: string
     createdAt?: string
   }
   ```
2. `conversation-manager.ts` — add `private summarizationMode: 'threshold' | 'scene' = 'threshold'` + `setSummarizationMode(mode)` setter, the constants above, and a private `tierOf(s: ConversationSummary)` helper (`s.tier ?? 'scene'` — legacy entries are scene-tier).
3. `endScene(label?: string): Promise<{ summarized: boolean }>` —
   - If `this.messages.length - SCENE_CARRYOVER_MESSAGES < SCENE_SUMMARY_MIN_MESSAGES` or no `summarizeCallback` → `{ summarized: false }` (no LLM call).
   - **Capture `const cut = this.messages.length - SCENE_CARRYOVER_MESSAGES` BEFORE the await** (messages appended during the await land at indices ≥ `cut` and survive — this avoids the mis-splice class PHASE-07 documented for `maybeSummarize`).
   - Transcript from `messages[0..cut)` in the existing `${role}: ${content.slice(0, 500)}` format; instruction embedded in the text (F3 precedent): "Summarize this completed scene of a D&D game. Preserve: outcomes, decisions, NPC names and attitudes, locations, items gained/lost, promises made, and unresolved hooks. Under 150 words." 
   - On success: `this.messages.splice(0, cut)`; push `{ content, coversUpTo: -1, tier: 'scene', label, createdAt: new Date().toISOString() }`; `await this.maybeRollUp()`; return `{ summarized: true }`. On callback throw: `logToFile('WARN', …)`, messages untouched, `{ summarized: false }`.
4. `private async maybeRollUp(): Promise<void>` —
   - **Scene→session:** if scene-tier count > `SCENE_ROLLUP_THRESHOLD`: take all scene-tier entries except the newest `SCENE_ROLLUP_KEEP`, summarize their concatenated contents ("Combine these scene summaries into one session summary… focus on character development, goals, tensions, resolutions, and persistent changes. Under 200 words." — consolidation of *existing summaries*, never raw chat, per the MemoryBooks pattern), replace the consumed entries with one `{ tier: 'session', coversUpTo: -1, createdAt }`.
   - **Session→campaign:** if session-tier count > `SESSION_ROLLUP_THRESHOLD`: merge existing campaign-tier content (if any) + all session-tier contents into ONE new `{ tier: 'campaign' }`, replacing both.
   - After any mutation, keep `this.summaries` ordered `[campaign…, session…, scene…]` (stable within tier). Callback failures: warn-log + leave the array untouched (a retry happens at the next boundary).
5. `getMessagesForApi` — branch at the top: in `'scene'` mode SKIP `maybeSummarize()` (`:74` stays for `'threshold'` mode only). Scene-mode injection replaces the `latestSummary` prepend (`:102-131`) with a layered block assembled from all tiers in array order:
   ```
   [CAMPAIGN MEMORY]
   Campaign so far: <campaign-tier content>
   Recent sessions: <session-tier contents, oldest first>
   Earlier this session: <scene-tier contents, oldest first, with labels>
   [/CAMPAIGN MEMORY]
   ```
   Omit empty tiers; trim the whole block with `trimToTokenBudget(block, SUMMARY_BLOCK_BUDGET)` (`token-budget.ts`, the existing export); prepend to the first user message of the window exactly like the current pattern (same synthetic-user fallback `:124-131`). The budget loop (`:107-114`) is unchanged. The existing `_lastTokenEstimate` sum (`:141`) automatically includes the block since it sums final message contents.
6. Overflow backstop: in scene mode, when the budget loop dropped messages (post-07 expression `withinBudget.length < recentMessages.length`), set `private _overflowSplitNeeded = true` (cleared in `endScene` and `clear()`); expose `get overflowSplitNeeded(): boolean`. No inline summarization — 26C consumes the flag off the request path.
7. `generateSessionSummary` — scene-mode branch: build input = all scene-tier summary contents since the last session-tier entry + transcript of remaining `this.messages` (same 500-char caps); one callback call with the existing end-of-session instruction (`:170`); on success REPLACE the consumed scene-tier entries with the new `{ tier: 'session', coversUpTo: -1 }`, splice `this.messages` down to the last `SCENE_CARRYOVER_MESSAGES`, return the string. Threshold mode: keep current behavior, but fix the new entry to `coversUpTo: -1` ONLY if PHASE-07's Completed section did not already touch it — otherwise leave as-is (the `restore()` migration normalizes either way; do not churn).
8. Tests (`conversation-manager.test.ts`, same mock preamble): tier fields round-trip serialize/restore; `endScene` happy path (prunes to carryover, pushes scene-tier, label/createdAt set); short-scene no-op (no callback call — assert with `vi.fn`); callback-throw leaves messages intact; message appended during the awaited callback survives (resolve the callback manually with a deferred promise); scene→session roll-up at threshold (consumed entries replaced, newest `SCENE_ROLLUP_KEEP` kept); session→campaign roll-up; layered block contents + ordering + `SUMMARY_BLOCK_BUDGET` trim; scene mode never calls `maybeSummarize`'s callback below boundary conditions ("triggers summarization when many messages exist" must NOT hold in scene mode — copy that test, flip the mode, assert no call); `overflowSplitNeeded` flips when the window drops messages; threshold-mode default leaves every existing test green unchanged.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/main/ai/conversation-manager.test.ts`

**Acceptance:** all pre-existing `conversation-manager.test.ts` tests pass without modification; new tests green; `grep -n "setSummarizationMode\|endScene\|overflowSplitNeeded" src/main/ai/conversation-manager.ts` shows the new API.

### 26B — Per-campaign scene-memory settings store (main)

**Objective:** engine-owned opt-in flag, default off, cached for synchronous-adjacent reads.

**Files:** NEW `src/main/ai/scene-memory.ts`, NEW `src/main/ai/scene-memory.test.ts`.

**Steps:**

1. `scene-memory.ts` — module with:
   - `export interface SceneMemorySettings { enabled: boolean }` persisted at `path.join(app.getPath('userData'), 'campaigns', campaignId, 'ai-context', 'scene-memory.json')` (same dir the `MemoryManager` uses, `memory-manager.ts:103`).
   - `export async function getSceneMemorySettings(campaignId: string): Promise<SceneMemorySettings>` — in-memory `Map<string, SceneMemorySettings>` cache; on miss, read+JSON.parse with a zod safeParse (`z.object({ enabled: z.boolean() })`); any failure → `{ enabled: false }` (cached).
   - `export async function setSceneMemoryEnabled(campaignId: string, enabled: boolean): Promise<void>` — update cache + `atomicWriteFile` (`src/main/storage/atomic-write.ts:20`), `mkdir -p` the ai-context dir first (pattern: `memory-manager.ts:106-108`).
   - `export function clearSceneMemoryCache(campaignId?: string): void` — for tests and the campaign-delete cascade (call it from `removeConversation`, `ai-service.ts:485-488`, in 26C).
2. Tests: default-off on missing/corrupt file; set→get round-trip (mock `electron` `app.getPath` to a temp dir — copy the mock approach used by `memory-manager.test.ts`); cache invalidation via `clearSceneMemoryCache`.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/main/ai/scene-memory.test.ts`

**Acceptance:** store reads default `{enabled:false}` with no file present; writes survive a re-read with a cleared cache.

### 26C — `ai-service` wiring: mode resolution, boundary detection, public `endScene`

**Objective:** with the flag on, boundaries fire scene compaction off the request path; with it off (default), zero new behavior.

**Files:** `src/main/ai/ai-service.ts`, `src/main/ai/ai-service.test.ts`.

**Steps:**

1. `export async function endSceneForCampaign(campaignId: string, label?: string): Promise<{ summarized: boolean }>` — `getConversation(campaignId)` → `conv.endScene(label)` → on `{summarized:true}` persist via `saveConversation(campaignId, conv.serialize())` (await; log errors like `:883-885`) → return the result.
2. `startChat` (`:610`) — inside the async IIFE, immediately before `conv.getMessagesForApi(...)` (`:663`): `conv.setSummarizationMode((await getSceneMemorySettings(request.campaignId)).enabled ? 'scene' : 'threshold')`. (Cached read — no per-request disk IO after the first.)
3. `handleStreamCompletion` terminal block — after the memory-persistence `try` (`:887-908`; re-verify post-23/25 positions) insert a fire-and-forget boundary check:
   ```ts
   void (async () => {
     if (!(await getSceneMemorySettings(request.campaignId)).enabled) return
     const BOUNDARY_ACTIONS = new Set(['switch_map', 'long_rest', 'short_rest', 'end_initiative'])
     const boundary = dmActions.find((a) => BOUNDARY_ACTIONS.has(a.action))
     if (boundary) {
       const label = boundary.action === 'switch_map' && typeof boundary.mapName === 'string' ? boundary.mapName : boundary.action.replace(/_/g, ' ')
       await endSceneForCampaign(request.campaignId, label)
     } else if (conv.overflowSplitNeeded) {
       await endSceneForCampaign(request.campaignId, 'scene continues')
     }
   })().catch((err) => logToFile('WARN', '[AI SceneMemory] boundary check failed:', String(err)))
   ```
   Must NOT delay `onDone` (`:917`) — it is not awaited.
4. `removeConversation` (`:485-488`) — add `clearSceneMemoryCache(campaignId)`.
5. `generateSessionSummary` export (`:999-1015`) — unchanged signature/behavior (the scene-mode branch lives in the manager, 26A step 7).
6. Tests (`ai-service.test.ts`, follow its existing mocking style): flag off → `setSummarizationMode('threshold')` and no `endScene` calls (spy on the manager); flag on + `switch_map` in parsed actions → `endSceneForCampaign` invoked with the map name; flag on + `overflowSplitNeeded` → invoked with `'scene continues'`; `endSceneForCampaign` persists after a successful summarize (spy `saveConversation`); boundary path never blocks `onDone` (assert `onDone` resolves while the summarize callback promise is still pending).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/main/ai/ai-service.test.ts src/main/ai/conversation-manager.test.ts`

**Acceptance:** with `scene-memory.json` absent, a full chat round-trip exercises only pre-phase code paths (assert via spies that `endScene` is never called and `maybeSummarize` still drives compaction).

### 26D — IPC channels + zod + handlers + world-sync boundary hook + restore-schema extension

**Objective:** typed transport for the flag, status, and the manual boundary; map changes from the renderer fire boundaries; tiered summaries survive restore validation.

**Files:** `src/shared/ipc-channels.ts`, `src/shared/ipc-schemas.ts`, `src/main/ipc/ai-handlers.ts`, `src/preload/index.ts`, `src/preload/index.d.ts` (+ existing `src/shared/ipc-channels.test.ts` / `ipc-schemas.test.ts` pick up the additions).

**Steps:**

1. `ipc-channels.ts` — new section after `=== AI DM: Live State Sync ===` (`:107-109`):
   ```ts
   // === AI DM: Scene Memory (PHASE-26) ===
   AI_SCENE_MEMORY_GET: 'ai:scene-memory-get',
   AI_SCENE_MEMORY_SET_ENABLED: 'ai:scene-memory-set-enabled',
   AI_END_SCENE: 'ai:end-scene',
   ```
2. `ipc-schemas.ts` — `export const SceneLabelSchema = z.string().trim().min(1).max(120)` (used by the END_SCENE handler for the optional label).
3. `ai-handlers.ts` — three handlers, each starting with `sanitizeCampaignId(campaignId)` (F7):
   - `AI_SCENE_MEMORY_GET` → `{ success: true, data: { enabled, sceneSummaryCount, sessionSummaryCount, hasCampaignSummary, currentSceneMessageCount } }` (settings from `getSceneMemorySettings`; counts from `aiService.getConversationManager(campaignId)` — add a small `getSummaryTierCounts()` accessor to the manager in 26A if not already exposed via `serialize()` inspection; prefer the accessor over serializing).
   - `AI_SCENE_MEMORY_SET_ENABLED` `(campaignId, enabled: unknown)` → `z.boolean().safeParse`, `setSceneMemoryEnabled`, `{ success }`.
   - `AI_END_SCENE` `(campaignId, label?: unknown)` → optional `SceneLabelSchema.safeParse` (invalid → treat as absent), require the flag enabled (`{ success:false, error:'Scene memory is not enabled for this campaign.' }` otherwise), `await aiService.endSceneForCampaign(...)`, return `{ success: true, summarized }`.
4. `AI_SYNC_WORLD_STATE` handler (`:423-432`) — before `updateWorldState`, read `const prev = await memMgr.getWorldState()`; after the update, fire-and-forget: if scene memory enabled AND `prev?.currentScene` is a non-empty string AND incoming `state.currentScene` is a non-empty string AND they differ → `void aiService.endSceneForCampaign(campaignId, prev.currentScene).catch(...)`. (Label = the scene just LEFT.) Do not add `sanitizeCampaignId` here — PHASE-13 owns it; keep 13's line if already present.
5. Extend PHASE-07's `ConversationData` restore schema (location per 07's Completed section) so `summaries` items include `tier: z.enum(['scene','session','campaign']).optional(), label: z.string().optional(), createdAt: z.string().optional()`.
6. Preload `index.ts` (ai block, after `syncCombatState` ~`:126`): `sceneMemoryGet(campaignId)`, `sceneMemorySetEnabled(campaignId, enabled)`, `endScene(campaignId, label?)` invoke wrappers; mirror in `index.d.ts` (pattern at `:246`) with result types `{ success: boolean; data?: {...}; error?: string }` / `{ success: boolean; summarized?: boolean; error?: string }`.
7. Tests: `ipc-channels.test.ts` uniqueness/format assertions cover the new constants automatically (run it); add handler tests only if `ai-handlers` has a test file at execution time (re-check `ls src/main/ipc/*.test.ts`) — otherwise the handler logic is covered through 26C's service tests plus the schema test: add a `SceneLabelSchema` case to `ipc-schemas.test.ts` (rejects empty/oversize, trims).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/shared/ipc-channels.test.ts src/shared/ipc-schemas.test.ts`

**Acceptance:** channels registered + unique; restore round-trips a tiered summary without stripping `tier` (extend the 07D handler test if present); map-name change with flag on triggers one `endSceneForCampaign` (unit test the extracted comparison helper if the handler is untestable directly).

### 26E — Renderer: AiDmCard toggle + `/scene` command + i18n

**Objective:** the DM can enable the feature per campaign and force a boundary manually; everything else is invisible.

**Files:** `src/renderer/src/pages/campaign-detail/AiDmCard.tsx` (+ `AiDmCard.test.tsx` — extend or create minimal), `src/renderer/src/services/chat-commands/commands-dm-campaign.ts` (+ its `.test.ts`), `src/renderer/src/i18n/locales/en.json`, `src/renderer/src/i18n/locales/es.json`.

**Steps:**

1. `AiDmCard` (post-PHASE-10 shape — re-verify first): inside the `campaign.aiDm?.enabled` branch, add a checkbox row — label `t('pages.aiDmCard.sceneMemory')` ("Scene-based AI memory (experimental)"), helper `t('pages.aiDmCard.sceneMemoryHint')` ("Summarizes finished scenes into layered memory instead of compacting mid-scene. Changes how the AI remembers long campaigns."). On mount: `window.api.ai.sceneMemoryGet(campaign.id)` → set local state from `data.enabled`; on toggle: `sceneMemorySetEnabled(campaign.id, next)` and reflect the response. Default unchecked.
2. `/scene` command in `commands-dm-campaign.ts` (copy `sessionCommand` shape, `:115-144`): `name: 'scene'`, `aliases: []` (PHASE-09's collision test guards), `dmOnly: true`, `category: 'dm'`, usage `/scene <end [label]|status>`. `end`: `getActiveCampaignId()` (`services/active-campaign-ref.ts`) — null → error result; else `await window.api.ai.endScene(id, label || undefined)` → system message "Scene closed and summarized." / "Scene too short to summarize — kept in full." / the error (including the not-enabled error passthrough). `status`: `sceneMemoryGet` → system message with enabled + tier counts. Register in the file's exported `commands` array.
3. i18n: add the two `aiDmCard` keys + any command feedback strings routed through i18n in BOTH `en.json` and `es.json` (match surrounding style; professional Spanish).
4. Tests: command test (mock `window.api.ai` + `active-campaign-ref`) for end/status/no-campaign/not-enabled paths; AiDmCard test asserts the toggle renders for AI-enabled campaigns and invokes `sceneMemorySetEnabled`.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/renderer/src/services/chat-commands/commands-dm-campaign.test.ts src/renderer/src/pages/campaign-detail/AiDmCard.test.tsx`

**Acceptance:** toggle persists across reload via the store file; `/scene end` produces a scene-tier summary visible in `AI_SCENE_MEMORY_GET` counts; both locales have the new keys (`node -e "const en=require('./src/renderer/src/i18n/locales/en.json');const es=require('./src/renderer/src/i18n/locales/es.json');console.log(!!en.pages.aiDmCard.sceneMemory, !!es.pages.aiDmCard.sceneMemory)"` from `dnd-app/`).

### 26F — Documentation

**Objective:** the behavior is discoverable by future contributors and operators.

**Files:** `src/main/ai/AI_ACTION_CONTRACT.md`, `docs/OLLAMA-TUNING.md` (created by PHASE-01; if absent, create the section as a new file note).

**Steps:**

1. `AI_ACTION_CONTRACT.md`: add a "Scene boundaries (PHASE-26)" section — boundaries are ENGINE-driven (parsed `switch_map`/`long_rest`/`short_rest`/`end_initiative`, renderer map-change sync, `/scene end`, overflow backstop); **no new AI-emitted verbs exist or should be added here** (a model-declared `end_scene` verb is PHASE-28 director territory); the summaries-cover-a-pruned-prefix invariant (`coversUpTo === -1`) and the tier ladder.
2. `docs/OLLAMA-TUNING.md`: short subsection "Scene-based memory and the KV cache" — what the flag does, why mid-scene turns no longer rewrite the history prefix, and the honest scoping from F8 (volatile context still re-prefills; the wins are the removed inline LLM call + append-only history between boundaries). Cite the same source URLs as Research notes.

**Cheap checks:** none beyond a markdown read-through (no code).

**Acceptance:** both docs mention the flag name, the boundary signal list, and the default-off behavior.

## Research notes

- **CALYPSO (AIIDE '23)** — LLM assistance for D&D DMs; distills game context "into bite-sized prose"; DMs valued distillation that preserved creative control. Motivates keying compression to narrative units (scenes/encounters) rather than buffer pressure. [arXiv 2308.07540](https://arxiv.org/abs/2308.07540).
- **Summary-of-summary erosion** — repeated compaction compresses prior summaries again and again until early rationale vanishes ("after 9 or more compactions … decision rationale from early in the session erodes completely"). The tier ladder fixes the cadence: scene content is summarized ONCE from raw transcript; higher tiers consolidate *summaries* at low frequency with stricter "persistent facts" prompts, instead of re-summarizing on every fire the way `maybeSummarize` does today. [Codex/Claude-Code compaction analysis](https://tonylee.im/en/blog/codex-compaction-encrypted-summary-session-handover/), [TiMem: temporal-hierarchical memory consolidation (arXiv 2601.02845)](https://arxiv.org/pdf/2601.02845).
- **SillyTavern ecosystem (closest production analogues for RP chat memory):**
  - [MemoryBooks](https://github.com/aikohanasaki/SillyTavern-MemoryBooks) — scene memories over explicit message ranges + multi-tier consolidation (Arc→Chapter→Book…); consolidation **combines existing memories, not raw chat**, and disables the consumed sources — directly mirrored by 26A's roll-up design. Notably it has **no automatic scene-boundary detection** (manual marking only) — this phase goes further with deterministic engine signals because a VTT, unlike a chat UI, *knows* when the map changes or combat ends.
  - [ReMemory](https://github.com/InspectorCaracal/SillyTavern-ReMemory) — "End Scene" button generating a summary of everything since the last scene mark = the `/scene end` UX.
  - [Qvink MessageSummarize](https://github.com/qvink/SillyTavern-MessageSummarize) — per-message summarization alternative (rejected here: N× more LLM calls; weak fit for a latency-sensitive local-CPU deployment).
  - [Summarize (core docs)](https://docs.sillytavern.app/extensions/summarize/) — interval-based auto-summary with a `{{summary}}` injection template; docs warn summaries hallucinate/lose detail and advise manual correction — supporting the DM-facing `/scene status` visibility and the PHASE-25 editable-records direction rather than fully invisible memory.
- **KV-cache mechanics** (why boundary-stable prefixes matter and where the ceiling is): cache reuse requires a byte-identical prefix and a still-loaded model; invalidation is at the first differing byte. [Ollama prompt caching](https://leanpub.com/read/ollama/prompt-caching), [KV cache & scheduling internals](https://jonathanding.github.io/llm-learning/en/articles/ollama-kv-cache-scheduling/), [Ollama FAQ](https://docs.ollama.com/faq). Honest scoping in F8.
- **Alternatives considered:**
  - *AI-emitted scene-break verb* (`end_scene` in `[DM_ACTIONS]`): rejected for this phase — adds action-contract surface PHASE-11/23 are actively reshaping, and small local models misuse meta-verbs; deterministic engine signals + DM command cover the cases. PHASE-28's director agent is the right future owner.
  - *Storing scene summaries in `MemoryManager` files instead of `ConversationData`*: rejected — summaries are conversation-lifecycle data (pruned/restored/exported with messages); splitting them across two stores would duplicate the PHASE-07 race-hardening surface. The memory layer keeps owning world facts (PHASE-25/27).
  - *Global `AiConfig` flag*: rejected (F7) — per-campaign semantics + three other phases contesting that file.
  - *Embedding-based retrieval over old scenes instead of in-prompt summaries*: out of scope; PHASE-24/25 own retrieval. The layered block keeps the always-present recap small; retrieval can later augment it ("a mediocre summary with good retrieval outperforms an excellent summary with no retrieval" — Codex compaction article above).

## Test plan

- **26A** — `src/main/ai/conversation-manager.test.ts` (extend): tier round-trips; `endScene` prune/carryover/label; short-scene no-op; callback-failure safety; append-during-await safety; both roll-ups; layered block assembly + budget trim; scene mode skips `maybeSummarize`; `overflowSplitNeeded`; legacy tests untouched.
- **26B** — NEW `src/main/ai/scene-memory.test.ts`: default-off, round-trip, corrupt-file fallback, cache clear.
- **26C** — `src/main/ai/ai-service.test.ts` (extend): mode resolution from settings; boundary-action → `endSceneForCampaign`; overflow → forced split; persistence on success; `onDone` not blocked; flag-off inertness.
- **26D** — `src/shared/ipc-channels.test.ts` (existing assertions), `src/shared/ipc-schemas.test.ts` (SceneLabelSchema), restore-schema tier round-trip wherever 07D's handler test lives.
- **26E** — `commands-dm-campaign.test.ts` (`/scene` paths), `AiDmCard.test.tsx` (toggle render + IPC call).
- **End-of-phase 4-gate** (INSTRUCTIONS.md rule 5): `npm run lint`, `npx tsc --noEmit -p tsconfig.web.json`, `npx tsc --noEmit -p tsconfig.node.json`, full `npx vitest run` — all from `dnd-app/`. No Pi code is touched, so no pytest.

## Acceptance criteria

1. With `scene-memory.json` absent or `{enabled:false}` (the default), every prompt, message array, summary mutation, and IPC behavior is byte-identical to pre-phase behavior; all pre-existing tests pass unmodified.
2. With the flag on: no LLM summarize call ever runs inside `getMessagesForApi`; compaction happens only via `endScene` (boundary signals, `/scene end`, world-sync map change, or overflow backstop) off the request path, and `AI_STREAM_DONE` timing is unaffected.
3. Scene summaries carry `tier:'scene'` + label; >8 scenes consolidate into a session summary keeping the newest 4 verbatim; >4 sessions consolidate into one campaign summary; the injected `[CAMPAIGN MEMORY]` block stays ≤ `SUMMARY_BLOCK_BUDGET` tokens; `coversUpTo === -1` invariant holds for every new summary.
4. The mid-scene history segment is append-only between boundaries (no summary-text rewrites between two consecutive boundaries — assertable in tests by snapshotting the injected block across turns).
5. `generateSessionSummary` keeps its export signature and session-log side-effect in both modes (PHASE-31 contract).
6. Tiered summaries survive `AI_RESTORE_CONVERSATION` validation and legacy untiered data still loads.
7. The three new IPC channels are registered in `ipc-channels.ts`, schema-validated, sanitize campaignId, and are typed in preload `index.ts`/`index.d.ts`.
8. 4-gate green; one phase commit + push; plan moved to `completed/`.

## Out of scope

- Routing summarize calls to a small model + mid-campaign model swap — **PHASE-29**.
- An AI-emitted `end_scene`/scene-framing verb and pacing decisions — **PHASE-28** (director agent).
- Entity extraction, lore records, keyword-triggered injection — **PHASE-25**; durable world-state store / opinion persistence — **PHASE-27**.
- Recap UI (modal, "Previously on…", BMO/Discord recap fetch) and the broken recap preload wire — **PHASE-31**.
- `num_ctx`/`keep_alive`/budget scaling/prompt part ordering — **PHASE-01**; truncation-flag and restore-race correctness — **PHASE-07**.
- Rules/lore retrieval quality (hybrid BM25+vector) — **PHASE-24**.
- X-card rewind interactions with summaries beyond preserving the pruned-prefix invariant — **PHASE-32**.

## Completed

- **26A — tiered summary model + scene-mode core.** `types.ts` `ConversationSummary` += optional
  `tier`/`label`/`createdAt`. `conversation-manager.ts`: exported constants
  (`SCENE_CARRYOVER_MESSAGES=4`, `SCENE_SUMMARY_MIN_MESSAGES=6`, `SCENE_ROLLUP_KEEP=4`,
  `SCENE_ROLLUP_THRESHOLD=8`, `SESSION_ROLLUP_THRESHOLD=4`, `SUMMARY_BLOCK_BUDGET=1200`),
  `summarizationMode` + `setSummarizationMode`, `tierOf`, `endScene` (captures `cut` before the
  await; prunes to carryover; pushes scene-tier; `maybeRollUp`), `maybeRollUp` (scene→session,
  session→campaign — consolidates EXISTING summaries), `getMessagesForApi` scene branch (skips
  `maybeSummarize`; injects the layered `[CAMPAIGN MEMORY]` block via the unified `summaryPrefix`;
  sets `overflowSplitNeeded`), `buildLayeredBlock` (+`trimToTokenBudget`), `generateSessionSummary`
  scene branch, `getSummaryTierCounts`, `overflowSplitNeeded` getter, `clear()` resets it. Threshold
  mode byte-identical (42 pre-existing tests pass unchanged; +10 scene tests).
- **26B — scene-memory settings store.** NEW `scene-memory.ts`: `getSceneMemorySettings`
  (cached, missing/corrupt → `{enabled:false}`), `setSceneMemoryEnabled` (cache + mkdir +
  `atomicWriteFile`), `clearSceneMemoryCache`. NEW `scene-memory.test.ts` (4: default-off,
  round-trip, corrupt fallback, cache hit) using a real temp dir + mocked `app.getPath`.
- **26C — ai-service wiring.** `ai-service.ts`: exported `endSceneForCampaign` (endScene →
  persist on summarized); `startChat` sets the mode from `getSceneMemorySettings` before
  `getMessagesForApi` (cached); `handleStreamCompletion` fire-and-forget boundary check AFTER the
  PHASE-25 `runEntityExtraction` (boundary action → map-name/action label, else `overflowSplitNeeded`
  → `'scene continues'`; never awaited, never delays `onDone`); `removeConversation` clears the
  cache. `ai-service.test.ts` (+6: mode resolution, boundary→endScene, overflow, onDone-not-blocked,
  persist-on-summarize). ConversationManager test mock gained `setSummarizationMode`/`endScene`/`overflowSplitNeeded`.
- **26D — IPC + schema + handlers + world-sync hook + restore extension.** `ipc-channels.ts`
  `AI_SCENE_MEMORY_GET`/`AI_SCENE_MEMORY_SET_ENABLED`/`AI_END_SCENE`. `ipc-schemas.ts` `SceneLabelSchema`
  + extended `ConversationDataSchema` summaries item with optional `tier`/`label`/`createdAt` (else
  zod strips them on restore). `ai-handlers.ts` three sanitized handlers + the `AI_SYNC_WORLD_STATE`
  boundary hook (prev vs incoming `currentScene` differ → `endSceneForCampaign(prevScene)`, gated on
  enabled, fire-and-forget). preload `index.ts`/`index.d.ts` (`sceneMemoryGet`/`sceneMemorySetEnabled`/
  `endScene`). `ipc-schemas.test.ts` (+SceneLabelSchema + tiered/legacy round-trip); `ipc-channels.test.ts`
  auto-covers the new channels.
- **26E — renderer toggle + `/scene` command.** `AiDmCard.tsx`: scene-memory checkbox in the
  AI-enabled view, own IPC-backed state (`sceneMemoryGet` on mount, `sceneMemorySetEnabled` on toggle —
  NOT written to `campaign.aiDm`). `commands-dm-campaign.ts`: `/scene <end [label]|status>` (`aliases:[]`,
  `dmOnly`, via `getActiveCampaignId` + `window.api.ai.endScene`/`sceneMemoryGet`), registered in `commands`.
  en+es `pages.aiDmCard.{sceneMemory,sceneMemoryHint,sceneMemorySaveFailed}`. Tests: `AiDmCard.test.tsx`
  (+3 toggle), `commands-dm-campaign.test.ts` (+6 /scene paths).
- **26F — docs.** `AI_ACTION_CONTRACT.md` "Scene boundaries (PHASE-26)" section (engine-driven
  boundaries, no AI verb, `coversUpTo===-1` invariant, tier ladder). `docs/OLLAMA-TUNING.md`
  "Scene-based memory and the KV cache" subsection (flag behavior + honest F8 scoping).
- **End-of-phase 4-gate:** lint, tsc web+node, full vitest — all green. No Pi code (no pytest leg).
