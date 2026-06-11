# PHASE-07 — Conversation persistence correctness

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Make the AI DM's conversation persistence layer truthful and race-safe: the import/restore path must refresh the in-memory `ConversationManager` (today it writes disk only, so an in-flight stream's auto-save can clobber a just-imported conversation); the load path must stop mutating state mid-stream (a read that writes); the history-truncation flag must actually flip when messages are dropped (today it is a false negative in virtually every real truncation); the per-request token breakdown must stop being a single module global that previews and parallel builds clobber; and the `contextChunkIds` RAG-provenance field — plumbed through types, serialization, and `addMessage` but never populated — must be wired end-to-end. This phase is the data-correctness foundation that PHASE-14 (observability UI) and PHASE-26 (scene summarization) build on.

## Dependencies & cross-phase notes

- **No prerequisite phases** (index row 07: depends on "—"; phases 1–19 are independent).
- **PHASE-14 depends on this phase.** It surfaces `wasContextTruncated()` / `getLastTokenEstimate()` / the token breakdown in DM-facing UI. This phase must leave those APIs campaign-correct (per-campaign breakdown keyed by `campaignId`, truncation flag that actually flips) so PHASE-14 only adds UI. Do not build any new UI surface here beyond the one-line `DMTabPanel` call-site update.
- **PHASE-26 depends on this phase** (scene-boundary summarization will rework `conversation-manager.ts` `maybeSummarize`). Keep `maybeSummarize` untouched here.
- **Coordinate with PHASE-01 on `src/main/ai/context-builder.ts` and `conversation-manager.ts`** (PHASE-01 reorders prompt assembly for prefix-cache stability and wires `num_ctx`). PHASE-01 runs first numerically; re-verify line numbers in those files before editing (rule 3 / rule 22).
- **Coordinate with PHASE-06 on `src/main/ipc/ai-handlers.ts`, `src/shared/ipc-channels.ts`, `src/preload/index.ts`** (PHASE-06 adds an `AI_CANCEL_SCENE` channel). Additive in both phases; merge order is irrelevant but re-check line numbers.
- **Coordinate with PHASE-08**: it deletes the dead `src/main/ai/ai-stream-handler.ts` pipeline and `finalizeAiResponse` (`ai-response-parser.ts`). Those files contain 7 of the 15 `addMessage` call sites. This phase keeps `addMessage`'s signature backward compatible (third arg stays optional) so PHASE-08's deletion is independent. Do NOT delete those files here.
- **Coordinate with PHASE-11 on `src/shared/ipc-schemas.ts`** (PHASE-11 adds `actingCharacterId` to `AiChatRequestSchema`). This phase adds a *new* `ConversationDataSchema` to the same file — additive, no overlap.
- **PHASE-24 (rules RAG) consumes the `contextChunkIds` provenance wired here** and owns making chunk ids content-stable (see Research notes — today's ids are positional and only stable per index build).

## Verified findings

All findings verified against the live tree on 2026-06-10. The audit file is gone; this section is the authoritative record.

### F1 — `AI_RESTORE_CONVERSATION` writes disk only; the cached in-memory `ConversationManager` is never refreshed (bug/high)

`src/main/ipc/ai-handlers.ts:338-344`:

```ts
handle(IPC_CHANNELS.AI_RESTORE_CONVERSATION, async (_event, campaignId: string, data: Record<string, unknown>) => {
  sanitizeCampaignId(campaignId)
  // IPC boundary: renderer hands back type-erased JSON typed as Record; assert the domain shape.
  const result = await saveConversation(campaignId, data as unknown as ConversationData)
  if (!result.success) return { success: false, error: result.error }
  return { success: true }
})
```

It calls `saveConversation` (disk write, `src/main/storage/ai-conversation-storage.ts:19-36`) and never touches the per-campaign `ConversationManager` cached in the module-level `conversations` Map (`src/main/ai/ai-service.ts:86`). Asymmetric with `AI_LOAD_CONVERSATION` (`ai-handlers.ts:346-355`), which DOES call `conv.restore(result.data)`.

The renderer caller is the backup-import path only: `src/renderer/src/services/io/import-export.ts:448-451` (`window.api.ai.restoreConversation(...)` inside `importAllData`). The common case is rescued by every game/lobby entry calling load-then-restore first (`use-ai-dm-store.ts:304` `initFromCampaign`, `use-game-effects.ts:295,342`), but two real windows remain:

1. **A main-process stream in flight during import.** Stream completion auto-saves the stale manager over the just-imported file — `ai-service.ts:883-885`:
   ```ts
   saveConversation(request.campaignId, conv.serialize()).catch((err) =>
     logToFile('ERROR', '[AI] Failed to auto-save conversation:', String(err))
   )
   ```
2. **A failed post-import `loadConversation`** leaves the stale manager to be serialized by the next save.

Also: the payload is cast `as unknown as ConversationData` — no zod validation at the IPC boundary (repo convention violation; a crafted `.dndbackup` writes arbitrary JSON into `ai-conversations/<id>.json`).

Verification commands (re-run before implementing):

```bash
sed -n '338,355p' dnd-app/src/main/ipc/ai-handlers.ts          # restore handler = disk-only; load handler restores manager
grep -n "conversations = new Map" dnd-app/src/main/ai/ai-service.ts   # :86
sed -n '881,886p' dnd-app/src/main/ai/ai-service.ts            # completion auto-save
sed -n '448,451p' dnd-app/src/renderer/src/services/io/import-export.ts  # sole restoreConversation caller
grep -rn "restoreConversation" dnd-app/src/renderer --include="*.ts*" | grep -v test  # exactly 1 hit (import-export.ts:450)
```

### F2 — `AI_LOAD_CONVERSATION` performs a write (`conv.restore`) on a read path — mid-stream race window (hardening/low)

`src/main/ipc/ai-handlers.ts:346-355`:

```ts
handle(IPC_CHANNELS.AI_LOAD_CONVERSATION, async (_event, campaignId: string) => {
  sanitizeCampaignId(campaignId)
  const result = await loadConversation(campaignId)
  if (result.success && result.data) {
    const conv = aiService.getConversationManager(campaignId)
    conv.restore(result.data)
    return { success: true, data: result.data }
  }
  return { success: false, error: result.error }
})
```

The deterministic "scene narration lost" clobber from the original report does NOT exist (verified): fresh campaigns get `data: null` so `restore()` is skipped entirely (`ai-conversation-storage.ts:44` returns `{ success: true, data: null }` when no file → handler falls to the failure branch because `result.data` is null); returning campaigns restore BEFORE the prep stream starts; and every completed assistant turn auto-saves (`ai-service.ts:883-885`) so disk tracks memory. The real residue:

- A `loadConversation` firing while a chat stream is mid-flight for the same campaign — realistically only **Export All Data** during an active AI response, `import-export.ts:289-301` (loops every campaign calling `window.api.ai.loadConversation(campaign.id)` at `:294`) — replaces `this.messages` wholesale (`conversation-manager.ts:218-237`), wiping the pending user message added at `startChat` (`ai-service.ts:634`); the stream completion then appends the assistant reply onto the restored array.
- A restore landing inside `maybeSummarize`'s awaited callback (`conversation-manager.ts:183-208`; the `splice` at `:200` runs after an `await`) can mis-splice messages that arrived/changed during the await.
- The handler's `getConversationManager` call instantiates managers for **every exported campaign**, growing the `conversations` Map (`ai-service.ts:461-474` — `getConversation` creates on miss).

There is no campaign→stream association anywhere in `ai-service.ts`: `activeStreams` is keyed by `streamId` only (`ai-service.ts:89`), so nothing today can even ask "is a stream running for campaign X".

Verification commands:

```bash
sed -n '346,355p' dnd-app/src/main/ipc/ai-handlers.ts
sed -n '289,301p' dnd-app/src/renderer/src/services/io/import-export.ts   # export loop calls loadConversation per campaign
sed -n '218,237p' dnd-app/src/main/ai/conversation-manager.ts             # restore() = wholesale replace
grep -n "activeStreams" dnd-app/src/main/ai/ai-service.ts                  # streamId-keyed only; no campaign map
grep -rn "loadConversation" dnd-app/src/renderer --include="*.ts*" | grep -v test
#   use-ai-dm-store.ts:304,320  use-game-effects.ts:295,342  import-export.ts:294
```

### F3 — Conversation-history truncation flag is a false negative in the common case (bug/high)

`src/main/ai/conversation-manager.ts:107-114` — the budget loop breaks BEFORE adding the message that would exceed `TOKEN_BUDGETS.conversationHistory` (4000, from `src/main/data/token-budgets.json`):

```ts
let tokenCount = 0
const withinBudget: ConversationMessage[] = []
for (let i = recentMessages.length - 1; i >= 0; i--) {
  const msgTokens = estimateTokens(recentMessages[i].content)
  if (tokenCount + msgTokens > TOKEN_BUDGETS.conversationHistory && withinBudget.length > 0) break
  tokenCount += msgTokens
  withinBudget.unshift(recentMessages[i])
}
```

So whenever messages are actually dropped, `tokenCount` is strictly *below* budget — and the flag check at `:146-147`:

```ts
this._contextTruncated =
  tokenCount >= TOKEN_BUDGETS.conversationHistory || (getLastTokenBreakdown()?.truncated ?? false)
```

is false. The only way `tokenCount >= budget` can be true is the degenerate single-oversized-message case (first message admitted unconditionally via `withinBudget.length > 0` guard) — in which nothing was dropped at all, i.e. the check is wrong in both directions. Correct check: `withinBudget.length < recentMessages.length`. Downstream consumers `wasContextTruncated()` / `getLastTokenEstimate()` (`ai-service.ts:1021-1032`) therefore lie; PHASE-14 will surface them, so they must be fixed here first.

Verification commands:

```bash
sed -n '107,114p' dnd-app/src/main/ai/conversation-manager.ts
sed -n '140,148p' dnd-app/src/main/ai/conversation-manager.ts
sed -n '1021,1032p' dnd-app/src/main/ai/ai-service.ts
grep -n "conversationHistory" dnd-app/src/main/data/token-budgets.json     # 4000
```

### F4 — `lastTokenBreakdown` is a single module global; previews/parallel builds clobber the live stream's truncation state (bug/medium)

`src/main/ai/context-builder.ts:145`:

```ts
let lastTokenBreakdown: ContextTokenBreakdown | null = null
```

written unconditionally by EVERY `buildContext` at `:321-323`:

```ts
const result = parts.join('\n\n')
breakdown.total = estimateTokens(result)
lastTokenBreakdown = breakdown
```

and read by `getLastTokenBreakdown()` (`:155-157`). Three clobber paths, all verified:

1. `AI_TOKEN_BUDGET_PREVIEW` (`ai-handlers.ts:301-309`) runs a throwaway `buildContext('preview query for token budget', …)` and the renderer triggers it from `DMTabPanel.tsx:75-86` (`refreshTokenBudget`) every time the DM opens the AI DM tab — overwriting the live stream's breakdown.
2. Concurrent builds for other campaigns (any second `startChat`) overwrite it.
3. `conversation-manager.ts` reads the global *during message assembly* (`:147` via the import at `:2`), i.e. AFTER `buildContext` returned in `startChat` (`ai-service.ts:654-663`) — a preview landing in that gap makes the manager record the wrong campaign's `truncated` flag.

`AI_TOKEN_BUDGET` (`ai-handlers.ts:297-299`) takes no campaign argument at all — it returns whatever build ran last, regardless of campaign. Preload: `src/preload/index.ts:119-121` (`getTokenBudget()` / `previewTokenBudget(campaignId, characterIds)`); the only renderer consumer is `DMTabPanel.tsx:75`.

`ContextTokenBreakdown` is defined at `src/main/ai/token-budget.ts:8-19` (fields `rulebookChunks, srdData, characterData, campaignData, creatures, gameState, memory, total, truncated?`).

Verification commands:

```bash
sed -n '144,157p' dnd-app/src/main/ai/context-builder.ts
sed -n '321,325p' dnd-app/src/main/ai/context-builder.ts
sed -n '297,309p' dnd-app/src/main/ipc/ai-handlers.ts
grep -rn "getLastTokenBreakdown" dnd-app/src --include="*.ts" | grep -v test
#   context-builder.ts (def), ai-handlers.ts:16,298,305, conversation-manager.ts:2,147
grep -n "getTokenBudget" dnd-app/src/renderer/src/components/game/bottom/DMTabPanel.tsx   # :75
```

### F5 — `ConversationMessage.contextChunkIds` plumbed but never populated (stub/low) → WIRE (decision)

`src/main/ai/types.ts:164-169`:

```ts
export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  contextChunkIds?: string[]
}
```

`addMessage` accepts it (`conversation-manager.ts:36-43`) and serialization round-trips it, but **all 15 production call sites pass two args** (verified 2026-06-10):

```bash
grep -rn "addMessage(" dnd-app/src --include="*.ts" | grep -v ".test.ts"
# ai-response-parser.ts:137,170 (2 — dead pipeline, PHASE-08 deletes)
# ai-service.ts:634,826,827,843,847,856,881,920 (8)
# ai-stream-handler.ts:194,195,211,215,224 (5 — dead pipeline, PHASE-08 deletes)
```

The retrieval source exists: `context-builder.ts:193-203` calls `searchEngine.search(query, 5)` returning `ScoredChunk[]` where every chunk has an `id: string` (`types.ts:148-160`); ids are formatted into the context text but the ids themselves are discarded. Decision for this phase: **wire it** (the scope bullet's "wire-or-drop"). PHASE-24/25 (RAG/entity memory) need per-message retrieval provenance; the field, serialization, and storage already exist, so wiring costs one threaded parameter. Provenance semantics: attach the chunk ids that informed a reply to the **assistant** message recorded at finalize (the user message is added at `ai-service.ts:634` *before* `buildContext` runs at `:654`, so it cannot carry them without reordering message insertion — which `getMessagesForApi` at `:663` depends on).

Caveat recorded for PHASE-24: chunk ids are positional (`${idPrefix}-${counter}`, `chunk-builder.ts:197,210,214`) — stable within one index build, not across rebuilds. Acceptable for in-app provenance now; PHASE-24 owns content-hash ids.

## Sub-phases

Order keeps the tree green: 07A makes `buildContext` structured while keeping the no-arg `getLastTokenBreakdown()` working; 07B then removes the manager's global read; 07C consumes 07A's chunk ids; 07D/07E are independent of A–C but share `ai-service.ts`, so they come last to minimize rebase friction within the phase.

### 07A — Pure `buildContext` + per-campaign token-breakdown recording

**Objective:** `buildContext` returns its breakdown (and chunk ids) per call instead of writing a module global; live chat builds are recorded per campaign; previews record nothing.

**Files:** `src/main/ai/context-builder.ts`, `src/main/ai/ai-service.ts`, `src/main/ipc/ai-handlers.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`, `src/renderer/src/components/game/bottom/DMTabPanel.tsx`, `src/main/ai/context-builder.test.ts`, `src/main/ai/ai-service.test.ts`.

**Steps:**

1. `context-builder.ts` — define and export:
   ```ts
   export interface BuiltContext {
     text: string
     breakdown: ContextTokenBreakdown
     /** Ids of rulebook chunks retrieved for this build (provenance; may be empty). */
     chunkIds: string[]
   }
   ```
   Change `buildContext(...)` (same parameters, `:164-171`) to return `Promise<BuiltContext>`. Inside: collect `const chunkIds = results.map((c) => c.id)` in section 1 (`:194-203`); at the end (`:321-325`) DELETE the `lastTokenBreakdown = breakdown` global write and `return { text: result, breakdown, chunkIds }`.
2. Replace the module global (`:145`) with a campaign-keyed store + explicit recording API:
   ```ts
   const lastTokenBreakdownByCampaign = new Map<string, ContextTokenBreakdown>()
   let lastLiveBreakdown: ContextTokenBreakdown | null = null

   /** Record the breakdown of a LIVE chat build (never previews). */
   export function recordTokenBreakdown(campaignId: string | undefined, breakdown: ContextTokenBreakdown): void {
     lastLiveBreakdown = breakdown
     if (campaignId) lastTokenBreakdownByCampaign.set(campaignId, breakdown)
   }
   export function getLastTokenBreakdown(campaignId?: string): ContextTokenBreakdown | null {
     if (campaignId) return lastTokenBreakdownByCampaign.get(campaignId) ?? null
     return lastLiveBreakdown
   }
   export function clearTokenBreakdown(campaignId: string): void {
     lastTokenBreakdownByCampaign.delete(campaignId)
   }
   ```
   The no-arg `getLastTokenBreakdown()` keeps `conversation-manager.ts:147` compiling until 07B removes it.
3. `ai-service.ts` `startChat` (`:654-663`): destructure the new shape —
   ```ts
   const built = await buildContext(request.message, request.characterIds, request.campaignId,
     request.activeCreatures, request.gameState, request.actingCharacterId)
   recordTokenBreakdown(request.campaignId, built.breakdown)
   const providerContext = `\n\n[PROVIDER CONTEXT]\n…`
   const { systemPrompt, messages } = await conv.getMessagesForApi(built.text + providerContext)
   ```
   Import `recordTokenBreakdown` (and `clearTokenBreakdown`) from `./context-builder`. In `removeConversation` (`:485-488`) add `clearTokenBreakdown(campaignId)` so the campaign-delete cascade clears the map.
4. `ai-handlers.ts`:
   - `AI_TOKEN_BUDGET` (`:297-299`): accept an optional campaignId — `handle(IPC_CHANNELS.AI_TOKEN_BUDGET, async (_event, campaignId?: string) => getLastTokenBreakdown(typeof campaignId === 'string' ? campaignId : undefined))`.
   - `AI_TOKEN_BUDGET_PREVIEW` (`:301-309`): return the build's own result without recording —
     ```ts
     const built = await buildContext('preview query for token budget', characterIds, campaignId)
     return built.breakdown
     ```
5. `src/preload/index.ts:119`: `getTokenBudget: (campaignId?: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_TOKEN_BUDGET, campaignId)`. Mirror the signature in `src/preload/index.d.ts:248`.
6. `DMTabPanel.tsx:75`: `const data = await window.api.ai.getTokenBudget(campaign.id)` — the meter now shows this campaign's last live build instead of "whatever ran last".
7. Tests:
   - `context-builder.test.ts` — update every `buildContext` assertion from string to `result.text` (hits at `:33,39,49,60,71,78,84` etc.); add: `result.breakdown.total` reflects content; `result.chunkIds` carries mock search-engine ids; `recordTokenBreakdown`/`getLastTokenBreakdown(campaignId)` round-trip; a second build for campaign B does not disturb `getLastTokenBreakdown('campaign-A')`; `buildContext` alone records nothing.
   - `ai-service.test.ts` — the hoisted `vi.mock('./context-builder', …)` (`:38-41`) must return the new shape: `buildContext: vi.fn(async () => ({ text: '', breakdown: { rulebookChunks: 0, srdData: 0, characterData: 0, campaignData: 0, creatures: 0, gameState: 0, memory: 0, total: 0 }, chunkIds: [] }))` plus `recordTokenBreakdown: vi.fn()`, `clearTokenBreakdown: vi.fn()`, `setSearchEngine: vi.fn()`.

**Targeted checks:** `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json`; `npx vitest run src/main/ai/context-builder.test.ts src/main/ai/ai-service.test.ts`.

**Acceptance:** `grep -n "lastTokenBreakdown = breakdown" src/main/ai/context-builder.ts` → no hits; preview handler contains no `recordTokenBreakdown` call; `DMTabPanel` passes `campaign.id`; both test files green.

### 07B — Truncation flag tells the truth

**Objective:** `contextWasTruncated` flips exactly when history messages were dropped OR a context section was trimmed — and the manager stops reading the context-builder global.

**Files:** `src/main/ai/conversation-manager.ts`, `src/main/ai/ai-service.ts`, `src/main/ai/conversation-manager.test.ts`.

**Steps:**

1. `conversation-manager.ts` — change the signature (`:70`) to `async getMessagesForApi(contextBlock: string, contextTruncated = false)`. The optional-with-default second parameter keeps the two dead-pipeline callers (`ai-stream-handler.ts:132`, owned by PHASE-08) compiling unchanged.
2. Replace `:146-147` with the dropped-message check:
   ```ts
   this._contextTruncated = withinBudget.length < recentMessages.length || contextTruncated
   ```
   Delete the `import { getLastTokenBreakdown } from './context-builder'` at `:2` (no remaining use). Update the stale comment at `:143-145` to describe the new contract (history-drop OR caller-reported context trim).
3. `ai-service.ts` callers:
   - `startChat` (`:663` post-07A): `conv.getMessagesForApi(built.text + providerContext, built.breakdown.truncated ?? false)`.
   - `restreamConversation` (`:760`): leave as `conv.getMessagesForApi('')` — the restream's own build has no context sections, so the default `false` is honest; history-drop is recomputed inside.
4. `conversation-manager.test.ts` — add to the `getMessagesForApi` describe block:
   - many large messages exceeding the 4000-token history budget → some dropped → `contextWasTruncated === true` (this is the regression test for the false negative — it FAILS against the old `tokenCount >= budget` check);
   - few small messages → `false`;
   - few small messages but `getMessagesForApi('ctx', true)` → `true` (caller-reported context trim);
   - a single message larger than the whole budget (admitted unconditionally, nothing dropped) → `false`.

**Targeted checks:** `npx tsc --noEmit -p tsconfig.node.json`; `npx vitest run src/main/ai/conversation-manager.test.ts`.

**Acceptance:** `grep -n "getLastTokenBreakdown" src/main/ai/conversation-manager.ts` → no hits; new truncation tests green; `grep -n "tokenCount >= TOKEN_BUDGETS" src/main/ai/conversation-manager.ts` → no hits.

### 07C — Wire `contextChunkIds` provenance

**Objective:** the assistant message recorded at stream finalize carries the ids of the rulebook chunks retrieved for that turn; persisted and round-tripped via the existing serialization.

**Files:** `src/main/ai/ai-service.ts`, `src/main/ai/context-builder.test.ts` (if not already covered in 07A), `src/main/ai/ai-service.test.ts`.

**Steps:**

1. `ai-service.ts` — thread the ids from `startChat` into the completion pipeline:
   - In `startChat`, capture `const contextChunkIds = built.chunkIds.length > 0 ? built.chunkIds : undefined` after the 07A `buildContext` call.
   - Add a parameter to the module-private `handleStreamCompletion` (`:735-752`) after `fileReadDepth`: `contextChunkIds?: string[]` (keep `deps: StreamHandlerDeps = getStreamDeps()` last). Pass it at both call sites: the initial call from `startChat`'s `onDone` (`:687-697`) and the recursive call inside `restreamConversation`'s `nextCallbacks.onDone` (`:771-782`) — recursion forwards the original ids (FILE_READ/WEB_SEARCH restreams still derive from the original retrieval).
   - At the finalize call sites, attach: `conv.addMessage('assistant', displayText, contextChunkIds)` (`:881`) and the parse-error fallback `conv.addMessage('assistant', fullText, contextChunkIds)` (`:920`). Leave the intermediate FILE_READ/WEB_SEARCH `addMessage` calls (`:826,827,843,847,856`) two-arg — synthetic tool messages have no retrieval of their own.
2. No schema/storage change needed: `ConversationMessage.contextChunkIds` (`types.ts:168`) already serializes through `serialize()`/`restore()` and `ai-conversation-storage.ts` writes plain JSON. (`ConversationDataSchema` in 07E includes the field.)
3. Tests:
   - `conversation-manager.test.ts` already covers `addMessage` storing the third arg (`:59`) — extend the `serialize / restore` block with a round-trip assertion for `contextChunkIds` if absent.
   - `ai-service.test.ts` — in the `startChat` describe block, set the mocked `buildContext` to resolve `chunkIds: ['phb-1','dmg-2']`, drive a provider mock that calls `onDone('reply')`, then assert the conversation manager received an assistant `addMessage` whose third argument equals `['phb-1','dmg-2']` (extend the mocked `ConversationManager` class at `ai-service.test.ts:43-60` to record `addMessage` args).

**Targeted checks:** `npx tsc --noEmit -p tsconfig.node.json`; `npx vitest run src/main/ai/ai-service.test.ts src/main/ai/conversation-manager.test.ts`.

**Acceptance:** a completed stream's final assistant message in `conv.getMessages()` carries the build's chunk ids (test-asserted); `grep -n "contextChunkIds" src/main/ai/ai-service.ts` shows the threaded param + two finalize attachments.

### 07D — Campaign-scoped stream tracking + read-only export path + `AI_LOAD` guard

**Objective:** the main process can answer "is a stream running for campaign X" and cancel them; Export All Data reads conversations from disk without instantiating managers or restoring state; `AI_LOAD_CONVERSATION` refuses the in-memory restore while a stream for that campaign is in flight.

**Files:** `src/main/ai/ai-service.ts`, `src/main/ipc/ai-handlers.ts`, `src/shared/ipc-channels.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`, `src/renderer/src/services/io/import-export.ts`, `src/main/ai/ai-service.test.ts`, `src/main/ipc/ai-handlers.test.ts`.

**Steps:**

1. `ai-service.ts` — campaign association for streams:
   ```ts
   const activeStreamCampaigns = new Map<string, string>() // streamId → campaignId
   ```
   Set in `startChat` next to the other registrations (`:624-627`): `activeStreamCampaigns.set(streamId, request.campaignId)`. Delete in `removeStream` (`:96-100`). Export:
   ```ts
   export function hasActiveStreamForCampaign(campaignId: string): boolean {
     for (const cid of activeStreamCampaigns.values()) if (cid === campaignId) return true
     return false
   }
   /** Abort every active stream for a campaign. Returns how many were cancelled. */
   export function cancelStreamsForCampaign(campaignId: string): number {
     let n = 0
     for (const [streamId, cid] of activeStreamCampaigns) {
       if (cid === campaignId) { cancelChat(streamId); n++ }
     }
     return n
   }
   ```
   (`cancelChat` at `:925-932` already aborts + unregisters + clears pending web-search approvals.)
2. New read-only channel — register in `src/shared/ipc-channels.ts` next to `AI_LOAD_CONVERSATION` (`:81`): `AI_PEEK_CONVERSATION: 'ai:peek-conversation'`. Handler in `ai-handlers.ts` (conversation-persistence section):
   ```ts
   // Read-only load for export: disk only — never instantiates or restores a ConversationManager (CQS).
   handle(IPC_CHANNELS.AI_PEEK_CONVERSATION, async (_event, campaignId: string) => {
     sanitizeCampaignId(campaignId)
     return await loadConversation(campaignId)
   })
   ```
   Preload `src/preload/index.ts` (after `loadConversation`, `:99`): `peekConversation: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_PEEK_CONVERSATION, campaignId)`; mirror in `index.d.ts:229` area (`peekConversation: (campaignId: string) => Promise<{ success: boolean; data?: unknown }>`).
3. `import-export.ts:294` — switch the export loop to the read-only path: `window.api.ai.peekConversation(campaign.id)`. Export no longer instantiates a manager per campaign and no longer overwrites in-memory state mid-stream.
4. `AI_LOAD_CONVERSATION` guard (`ai-handlers.ts:346-355`):
   ```ts
   const result = await loadConversation(campaignId)
   if (result.success && result.data) {
     if (aiService.hasActiveStreamForCampaign(campaignId)) {
       logToFile('warn', `[AI] AI_LOAD_CONVERSATION: stream in flight for ${campaignId}; returning disk data without in-memory restore`)
     } else {
       aiService.getConversationManager(campaignId).restore(result.data)
     }
     return { success: true, data: result.data }
   }
   return { success: false, error: result.error }
   ```
   Renderer contract unchanged (same return shape); the only behavior change is *not* clobbering an active conversation — strictly safer, no opt-in needed.
5. Tests:
   - `ai-service.test.ts` — `hasActiveStreamForCampaign` false initially; true after `startChat` for that campaign (and false for another campaignId); false again after `cancelChat(streamId)`; `cancelStreamsForCampaign` aborts the stream's controller and returns 1.
   - `ai-handlers.test.ts` — follow the existing harness pattern (`:1-100`): `AI_PEEK_CONVERSATION` returns disk data and never calls `aiService.getConversationManager` (assert the mock has zero calls); `AI_LOAD_CONVERSATION` with `hasActiveStreamForCampaign` mocked true returns `{success:true,data}` without calling `restore`; mocked false → `restore` called.

**Targeted checks:** `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json`; `npx vitest run src/main/ai/ai-service.test.ts src/main/ipc/ai-handlers.test.ts`.

**Acceptance:** `grep -rn "peekConversation" dnd-app/src` shows channel + handler + preload (×2) + the import-export call site; `grep -n "ai.loadConversation" src/renderer/src/services/io/import-export.ts` → no hits; new tests green.

### 07E — `AI_RESTORE_CONVERSATION`: validate, cancel, write through

**Objective:** the import path zod-validates the payload at the IPC boundary, cancels any in-flight stream for the campaign (closing clobber window 1), writes disk, and refreshes the in-memory manager (closing window 2) — write-through to both stores.

**Files:** `src/shared/ipc-schemas.ts`, `src/main/ipc/ai-handlers.ts`, `src/main/ipc/ai-handlers.test.ts`.

**Steps:**

1. `src/shared/ipc-schemas.ts` — add (near the AI schemas at the top; PHASE-11 edits `AiChatRequestSchema` in the same region, keep this additive):
   ```ts
   export const ConversationMessageSchema = z.object({
     role: z.enum(['user', 'assistant']),
     content: z.string(),
     // Lenient defaults: older .dndbackup payloads may omit fields; '' is falsy so the
     // renderer's `m.timestamp ? … : Date.now()` fallback still applies.
     timestamp: z.string().default(''),
     contextChunkIds: z.array(z.string()).optional()
   })
   export const ConversationDataSchema = z.object({
     messages: z.array(ConversationMessageSchema).default([]),
     summaries: z.array(z.object({ content: z.string(), coversUpTo: z.number() })).default([]),
     activeCharacterIds: z.array(z.string()).default([])
   })
   export type ValidatedConversationData = z.infer<typeof ConversationDataSchema>
   ```
   `ValidatedConversationData` is structurally assignable to `ConversationData` (`src/main/ai/types.ts:176-180`).
2. `ai-handlers.ts:338-344` — rewrite the handler:
   ```ts
   handle(IPC_CHANNELS.AI_RESTORE_CONVERSATION, async (_event, campaignId: string, data: Record<string, unknown>) => {
     sanitizeCampaignId(campaignId)
     const parsed = ConversationDataSchema.safeParse(data)
     if (!parsed.success) {
       return { success: false, error: `Invalid conversation data: ${parsed.error.issues[0]?.message}` }
     }
     // A stream completing after this write would auto-save the stale in-memory manager
     // over the imported file (ai-service stream-completion auto-save) — cancel first.
     aiService.cancelStreamsForCampaign(campaignId)
     const result = await saveConversation(campaignId, parsed.data)
     if (!result.success) return { success: false, error: result.error }
     // Write-through: refresh the cached manager so memory and disk agree immediately.
     aiService.getConversationManager(campaignId).restore(parsed.data)
     return { success: true }
   })
   ```
   Import `ConversationDataSchema` from `../../shared/ipc-schemas`; the now-unused `as unknown as ConversationData` cast (and the `ConversationData` type import, if it has no other use in the file — it does at `:51`, keep it only if still referenced) goes away.
3. Tests (`ai-handlers.test.ts`): malformed payload (`{messages: 'nope'}`) → `{success:false}` and `saveConversation` NOT called; valid payload → `cancelStreamsForCampaign` called with the campaignId, `saveConversation` called with the parsed data, and the manager's `restore` called with the same object; legacy payload missing `summaries`/`activeCharacterIds` → accepted with defaulted empty arrays.

**Targeted checks:** `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json`; `npx vitest run src/main/ipc/ai-handlers.test.ts`.

**Acceptance:** `grep -n "as unknown as ConversationData" src/main/ipc/ai-handlers.ts` → no hits; restore handler calls `safeParse`, `cancelStreamsForCampaign`, `saveConversation`, `restore` in that order; tests green.

## Research notes

- **Read paths must not mutate state (Command–Query Separation).** F2 is a textbook CQS violation: `AI_LOAD_CONVERSATION` is a query that performs a destructive write (`conv.restore`). Fowler: separating state-changing commands from value-returning queries lets queries be "introduced anywhere, in any order" with confidence — exactly what the export loop needs. The fix keeps the game-entry load (which legitimately wants restore-on-load) but adds a pure query (`AI_PEEK_CONVERSATION`) for export and guards the restore behind the stream check, rather than splitting every caller. Source: https://martinfowler.com/bliki/CommandQuerySeparation.html (also https://en.wikipedia.org/wiki/Command%E2%80%93query_separation).
- **Validate renderer payloads in the main process; never trust IPC input.** Electron's security checklist (#17, "Validate the sender of all IPC messages") and current Electron-IPC guidance both converge on schema-validating every `ipcMain.handle` payload — zod is the standard choice and is already this repo's convention (`AiChatRequestSchema`, `AiConfigSchema` in `ipc-schemas.ts`). The `as unknown as ConversationData` cast in the restore handler is the one conversation-persistence boundary without it. Sources: https://www.electronjs.org/docs/latest/tutorial/security, https://www.oflight.co.jp/en/columns/electron-ipc-communication-guide.
- **Write-through, not write-around, for the import path.** The restore handler currently "writes around" the in-memory cache (disk only), leaving the cached `ConversationManager` stale — the classic external-write staleness failure of cache-aside systems. Write-through (update cache + backing store together) is the standard remedy when stale reads are unacceptable; here memory is additionally the *writer* (auto-save serializes the manager), which upgrades staleness from wrong-reads to data loss, hence also cancelling in-flight streams before the write. Sources: https://codeahoy.com/2017/08/11/caching-strategies-and-how-to-choose-the-right-one/, https://www.ituonline.com/tech-definitions/what-is-write-through-cache/.
- **Per-message retrieval provenance (chunk ids) is the established RAG citation pattern.** Production RAG guidance: persist source/chunk identifiers alongside each generated answer — without provenance you cannot cite or debug answers; ids should ultimately be content-stable (doc id + version + content hash) so they survive reindexing. This phase wires the storage half (ids onto the assistant message); the id-stability half belongs to PHASE-24's retrieval rebuild (today's `${idPrefix}-${counter}` ids from `chunk-builder.ts:197-214` are positional and only valid per index build — acceptable since the bundled index and conversations ship/rebuild together, but worth the recorded caveat). Sources: https://app.ailog.fr/en/blog/guides/citation-sourcing-rag, https://www.buzzi.ai/insights/ai-document-retrieval-rag-citation-architecture, https://www.tensorlake.ai/blog/rag-citations.
- **Alternatives considered.**
  - *Truncation flag:* keeping the token-count comparison with `>=` → still wrong (loop breaks pre-add, so count never reaches budget when dropping); counting dropped messages is exact and free.
  - *Breakdown scoping:* AsyncLocalStorage per request — overkill for two call sites; returning the breakdown per call (pure function) plus an explicit campaign-keyed recorder is simpler, testable, and gives PHASE-14 the campaign-scoped getter it needs.
  - *contextChunkIds on the user message:* would require moving `addMessage('user', …)` after `buildContext`, but `getMessagesForApi` (which needs the user message in the array) runs immediately after the build in the same flow — reordering risks the exact mis-splice class F2 describes. Assistant-message provenance ("what the reply was grounded on") is also the semantically useful direction for PHASE-24/31.
  - *Dropping contextChunkIds entirely:* rejected — PHASE-24/25 are committed in the index and need provenance; the plumbing already exists end-to-end except the one threaded argument.
  - *Locking `restore()` inside ConversationManager:* the manager has no knowledge of streams; campaign→stream tracking in `ai-service.ts` (which owns both) is the smaller, single-owner change.

## Test plan

- **07A** — `src/main/ai/context-builder.test.ts` (updated: structured return; new: per-campaign recording, preview isolation, chunkIds emission); `src/main/ai/ai-service.test.ts` (mock-shape update for `./context-builder`).
- **07B** — `src/main/ai/conversation-manager.test.ts` (new: dropped-messages → truncated true [regression for the false negative], within-budget → false, caller-reported context-trim OR'd in, single-oversized-message → false).
- **07C** — `src/main/ai/ai-service.test.ts` (assistant finalize message carries chunk ids); `src/main/ai/conversation-manager.test.ts` (serialize/restore round-trips `contextChunkIds`).
- **07D** — `src/main/ai/ai-service.test.ts` (`hasActiveStreamForCampaign` lifecycle, `cancelStreamsForCampaign`); `src/main/ipc/ai-handlers.test.ts` (peek = disk-only/no manager; load guard honors active stream).
- **07E** — `src/main/ipc/ai-handlers.test.ts` (restore: schema rejection, cancel→save→restore ordering, lenient legacy payloads).

End-of-phase 4-gate (INSTRUCTIONS.md rule 5, run once after 07E):

```bash
cd dnd-app
npm run lint
npx tsc --noEmit -p tsconfig.web.json
npx tsc --noEmit -p tsconfig.node.json
npx vitest run
```

No Pi code is touched — pytest not required.

## Acceptance criteria

1. Importing a `.dndbackup` refreshes both disk AND the in-memory `ConversationManager`; an in-flight stream for that campaign is cancelled first, so its completion can no longer auto-save stale state over the import (test-asserted ordering in the restore handler).
2. `AI_RESTORE_CONVERSATION` rejects payloads that fail `ConversationDataSchema`; no `as unknown as ConversationData` cast remains in `ai-handlers.ts`.
3. Export All Data uses the read-only `AI_PEEK_CONVERSATION` path: no `ConversationManager` is instantiated or restored during export.
4. `AI_LOAD_CONVERSATION` never overwrites the in-memory conversation while a stream for that campaign is active, and still returns the disk data either way.
5. `ConversationManager.contextWasTruncated` is true exactly when history messages were dropped or the context build trimmed a section — verified by the regression test that fails against the old `tokenCount >= budget` check.
6. `buildContext` is pure (returns `{text, breakdown, chunkIds}`, writes no module global); token-budget previews can no longer clobber a live stream's breakdown; `getLastTokenBreakdown(campaignId)` returns per-campaign data and `DMTabPanel` requests its own campaign's breakdown.
7. Completed assistant turns persist `contextChunkIds` naming the rulebook chunks retrieved for that turn, surviving serialize/restore.
8. No renderer-visible behavior regressions: load/save/delete conversation contracts unchanged; all changes are correctness fixes (no new user-facing toggles required).
9. End-of-phase 4-gate green; one commit; plan moved to `completed/`.

## Out of scope

- **Surfacing truncation/token data in UI** (truncation alert, context-inspector panel, connection-status badge, fileReadStatus) — PHASE-14 (depends on this phase).
- **Replacing token-threshold compaction with scene-boundary summarization** (`maybeSummarize` rework) — PHASE-26.
- **Deleting the dead `ai-stream-handler.ts` / `finalizeAiResponse` pipeline** (7 of the 15 `addMessage` call sites) — PHASE-08.
- **`actingCharacterId` schema + caller wiring** in `AiChatRequestSchema` — PHASE-11.
- **Content-stable chunk ids and hybrid BM25+vector retrieval** (consumers of the provenance wired here) — PHASE-24; entity/lore memory — PHASE-25.
- **`num_ctx`/token-budget reconciliation and prompt-order prefix caching** in `context-builder.ts` — PHASE-01.
- **Scene-prep `conv.clear()` history wipe and scene cancel** (`prepareScene`, `ai-service.ts:943-983`) — PHASE-06.
- **`getConfig()` disk-clobber of in-memory model auto-switch** (`ai-service.ts:376-402`) — PHASE-03.

## Completed

*(Filled during execution per INSTRUCTIONS.md rule 17 — one line per sub-phase with file:line citations.)*
