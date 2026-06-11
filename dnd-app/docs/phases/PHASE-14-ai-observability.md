# PHASE-14 — AI observability: context inspector, truncation alert, connection badge, file-read indicator

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Surface the AI DM health/context signals the main process already computes but the user never sees. Four deliverables: (1) a **connection-status badge** — `consecutiveFailures` is tracked in `streamWithRetry` and exposed via `getConnectionStatus()`/`getConsecutiveFailures()` but no IPC handler, preload entry, or renderer caller exists, so degraded/disconnected health never reaches UI; (2) **context-truncation alerting** — `conversation-manager.ts` computes `_lastTokenEstimate`/`_contextTruncated` explicitly "for DM alerting" and `ai-service.ts` exports `wasContextTruncated()`/`getLastTokenEstimate()`, yet nothing calls them, so even the truncation the app KNOWS about is invisible to the DM; (3) a **file-read indicator** — `fileReadStatus` is wired main→preload→store but zero components render it, so while the AI reads a campaign file the user sees only a generic typing indicator; and (4) a **context-inspector panel** (the "what did the AI actually see?" debug surface, per the Phils AI Assistant / SillyTavern prompt-itemization pattern) that upgrades the existing DMTabPanel token-budget readout into a per-section breakdown with truncation state, token estimate, context window, and retrieval provenance. All four are DM-facing, display-only observability additions: no AI-pipeline behavior changes, no new write paths.

## Dependencies & cross-phase notes

- **PHASE-07 (`conversation-persistence`) is the hard prerequisite** (PHASE-INDEX row 14). It makes the data this phase surfaces *truthful*: 07A replaces the clobber-prone `lastTokenBreakdown` module global with per-campaign recording (`recordTokenBreakdown(campaignId, breakdown)` / `getLastTokenBreakdown(campaignId?)` in `src/main/ai/context-builder.ts`) and gives `AI_TOKEN_BUDGET` + preload `getTokenBudget` an optional `campaignId`; 07B fixes the truncation-flag false negative (`withinBudget.length < recentMessages.length || contextTruncated`); 07C populates `ConversationMessage.contextChunkIds` on the finalized assistant message. PHASE-07's plan states verbatim: "PHASE-14 depends on this phase. It surfaces `wasContextTruncated()` / `getLastTokenEstimate()` / the token breakdown in DM-facing UI… so PHASE-14 only adds UI." Verify all three landed before starting (commands in F2/F4 below).
- **PHASE-01 (`ollama-context-window`) is a soft prerequisite for 14E only** (numerically guaranteed to have run first; not listed in the index row). 01C exports `getEffectiveBudgets()` and `getActiveContextWindow()` from `src/main/ai/token-budget.ts` — the inspector's "context window" and "budget" columns read them. As of plan-authoring these exports do **not** exist yet (`grep -rn "getActiveContextWindow" dnd-app/src --include="*.ts"` → no hits, 2026-06-10). If drift left them absent when 14 executes, 14E falls back to raw `TOKEN_BUDGETS` values and a `contextWindow: null` row — do not re-implement 01C here.
- **PHASE-04 (`ai-store-approval-hygiene`) owns ALL `fileReadStatus` clearing.** Its plan states: "PHASE-14 owns rendering a `fileReadStatus` indicator. Phase 04 *clears* `fileReadStatus` on cancel/timeout/done/error/reset/init… PHASE-14 must not re-add clearing — only the indicator component." 14D verifies 04's clearing landed (grep below) and adds only the indicator plus a main-side `status:'done'` emission (an *emit*, not store clearing — without it the "reading file" label would persist through the entire post-read restream).
- **PHASE-05 (`stream-listener-lifecycle`)** rewrote the preload `ai.onX` wrappers to return per-listener unsubscribe functions (named-listener pattern, like `update.onStatus`) and made the store's `setupListeners` collect/call unsubscribes. The new `onConnectionStatus` listener (14A/14B) MUST follow that exact pattern and be added to the `removeAllAiListeners` defensive nuke.
- **PHASE-08 (`executor-batch-correctness`)** deletes the dead `src/main/ai/ai-stream-handler.ts` pipeline — the second (dead) `AI_STREAM_FILE_READ` emitter at `ai-stream-handler.ts:180`. Do not touch that file here; if it still exists when 14 runs, leave it (only the live `ai-service.ts` emitter gets the `'done'` event).
- **PHASE-10 (`ai-dm-ui-truth`)** — heaviest file overlap; it runs first:
  - 10B extracts the ChatPanel status bar into a new presentational `src/renderer/src/components/game/bottom/AiDmStatusBar.tsx` "precisely so PHASE-14 has a clean mount point — keep that component presentational (props in, JSX out)". 14B/14C mount the connection badge and truncation chip there. Contingency: if 10B drifted and `AiDmStatusBar.tsx` doesn't exist, mount into the ChatPanel status-bar JSX directly (pre-10 location `ChatPanel.tsx:417-438`).
  - 10C adds `AI_GET_TOKEN_METER` (`getEffectiveBudgets().conversationHistory` + `getActiveContextWindow()`); 14E's inspector endpoint is a *different, richer* channel — do not reuse/rename 10C's.
  - 10A rewrites `DMTabPanel.tsx:51` (`aiModel` literal) and extends `DMTabPanel.test.tsx` with happy-dom render tests that mock `window.api.ai.getTokenBudget` — 14E moves the token-budget block out of DMTabPanel, so update those mocks rather than deleting them.
  - PHASE-10's own out-of-scope list confirms the split: "Connection-status badge (`consecutiveFailures` surfacing), context-truncation alert wiring (`wasContextTruncated`), `fileReadStatus` indicator + clearing, context-inspector token-breakdown panel — PHASE-14 (mounts into 10B's `AiDmStatusBar`)."
- **PHASE-12 (`i18n-wording-sweep`)** owns rewording existing locale strings. This phase only ADDS new keys (both `en.json` and `es.json`) and reuses existing `game.dmTabPanel.budget*` row keys unchanged.
- **PHASE-13 (`dnd-platform-debt`)** owns extending `sanitizeCampaignId` to the unsanitized AI IPC handlers. The ONE new campaignId-taking handler added here (`AI_GET_CONTEXT_INSPECTOR`) calls `sanitizeCampaignId` from day one, so it never joins that backlog.
- **PHASE-24/25 (RAG / entity memory)** will consume the chunk-id provenance the inspector displays; chunk ids today are positional (`${idPrefix}-${counter}`, stable per index build only — PHASE-24 owns content-stable ids). The inspector labels them as debug identifiers, nothing more.

## Verified findings

All claims re-verified against the live tree on 2026-06-10 (commit `a685404a`). The audit file is deleted; this section is the authoritative record. Line numbers WILL have shifted once phases 01–13 land — re-run every verification command before editing (INSTRUCTIONS.md rule 3).

### F1 — AI connection-status API computed but never exposed (stub/medium)

`src/main/ai/ai-service.ts:154-169`:

```ts
// ── AI Retry & Connection Status ──

let consecutiveFailures = 0
const MAX_RETRY_DELAY_MS = 30_000

export type AiConnectionStatus = 'connected' | 'degraded' | 'disconnected'

export function getConnectionStatus(): AiConnectionStatus {
  if (consecutiveFailures === 0) return 'connected'
  if (consecutiveFailures < 3) return 'degraded'
  return 'disconnected'
}

export function getConsecutiveFailures(): number {
  return consecutiveFailures
}
```

`streamWithRetry` (`ai-service.ts:180+`) resets the counter on success (`consecutiveFailures = 0`, `:190`) and increments on every failed attempt (`consecutiveFailures++`, `:193`). **Zero external callers exist** for `getConnectionStatus`/`getConsecutiveFailures` (grep below).

**Correction vs the original audit text:** the audit said "no IPC handler, preload entry, or renderer caller" — true, but incomplete. The channel constant **already exists**: `AI_CONNECTION_STATUS: 'ai:connection-status'` at `src/shared/ipc-channels.ts:119`. A handler used to exist and was deliberately removed — `src/main/ipc/ai-handlers.ts:294-295`:

```ts
// Phase 17d (NET-17) — AI_CONNECTION_STATUS handler removed: no preload/renderer caller exists.
// Re-add with a preload entry if a consumer is ever introduced.
```

and the orphaned type import is kept alive by an alias hack at `ai-handlers.ts:62`: `type _AiConnectionStatus = AiConnectionStatus` (sibling `_StreamResult` at `:63` is unrelated — leave it). This phase is the "consumer is introduced" case the comment anticipates.

Verification commands:

```bash
sed -n '154,170p' dnd-app/src/main/ai/ai-service.ts
grep -n "consecutiveFailures" dnd-app/src/main/ai/ai-service.ts      # :156 decl, :162-163 reads, :190 reset, :193 increment
grep -rn "getConnectionStatus\|getConsecutiveFailures" dnd-app/src --include="*.ts*" | grep -v "ai-service.ts" | grep -v test
#   → EMPTY (no external caller)
grep -n "AI_CONNECTION_STATUS" dnd-app/src/shared/ipc-channels.ts     # :119 — channel constant exists
sed -n '294,295p' dnd-app/src/main/ipc/ai-handlers.ts                # handler-removed comment
sed -n '62,63p' dnd-app/src/main/ipc/ai-handlers.ts                  # _AiConnectionStatus keep-alive alias
```

### F2 — Context-truncation "DM alerting" never wired (stub/medium)

`src/main/ai/conversation-manager.ts:140-148` computes the signals "for DM alerting":

```ts
// Track token usage and truncation for DM alerting
const totalTokens = estimateTokens(systemPrompt) + cleaned.reduce((sum, m) => sum + estimateTokens(m.content), 0)
this._lastTokenEstimate = totalTokens
this._contextTruncated = …
```

backed by `private _contextTruncated = false` (`:17`), `private _lastTokenEstimate = 0` (`:19`), and getters `contextWasTruncated` (`:27-29`) / `lastTokenEstimate` (`:32-34`). `ai-service.ts` exports the consumers at `:1021-1032`:

```ts
export function wasContextTruncated(campaignId: string): boolean {
  const conv = conversations.get(campaignId)
  return conv?.contextWasTruncated ?? false
}
export function getLastTokenEstimate(campaignId: string): number {
  const conv = conversations.get(campaignId)
  return conv?.lastTokenEstimate ?? 0
}
```

**Nothing in the repo calls either export** (grep below). **Correction vs the original audit text:** the audit wrote them as no-arg `wasContextTruncated()`/`getLastTokenEstimate()`; both actually take `campaignId: string` and read the per-campaign manager via `conversations.get` (read-only — they do NOT instantiate a manager, which matters: keep it that way, per PHASE-07's CQS rule). Note these getters reflect the *latest* `getMessagesForApi` call for that campaign — a FILE_READ/WEB_SEARCH restream calls `getMessagesForApi('')` again (`ai-service.ts:761`), so reading them at stream-done reflects the final assembly of the same turn (correct for alerting).

Pre-07 the flag was a false negative in virtually all real truncation (the budget loop breaks BEFORE adding the over-budget message, so `tokenCount >= TOKEN_BUDGETS.conversationHistory` never fires when dropping); **PHASE-07 (07B) fixes the expression** — this phase must verify the fix landed before surfacing the flag, otherwise the UI would institutionalize the lie.

Verification commands:

```bash
sed -n '1021,1032p' dnd-app/src/main/ai/ai-service.ts
grep -rn "wasContextTruncated\|getLastTokenEstimate" dnd-app/src --include="*.ts*" | grep -v "ai-service.ts" | grep -v test
#   → EMPTY pre-phase (no caller anywhere)
grep -n "_contextTruncated\|_lastTokenEstimate" dnd-app/src/main/ai/conversation-manager.ts
# POST-07 GATE (must be true before implementing 14C):
grep -n "withinBudget.length < recentMessages.length" dnd-app/src/main/ai/conversation-manager.ts   # 07B landed
grep -n "tokenCount >= TOKEN_BUDGETS" dnd-app/src/main/ai/conversation-manager.ts                   # → must be EMPTY
```

### F3 — `fileReadStatus` is wired main→preload→store but NO component renders it (stub/medium)

The full pipeline exists with zero display consumers:

- **Main emits** — `src/main/ai/ai-service.ts:806-817` (inside `handleStreamCompletion`'s FILE_READ branch): when `hasFileReadTag(fullText) && fileReadDepth < FILE_READ_MAX_DEPTH`, it sends `IPC_CHANNELS.AI_STREAM_FILE_READ` with `{ streamId, path: fileReq.path, status: 'reading' }` to `BrowserWindow.getAllWindows()[0]`, then awaits `readRequestedFile(fileReq.path)` (`:819`) and restreams. **Only `'reading'` is ever emitted** — there is no `'done'`/terminal event, so even with an indicator the label would persist through the whole post-read restream until stream end. (A second emitter at `src/main/ai/ai-stream-handler.ts:180` is the dead pipeline PHASE-08 deletes — ignore it.)
- **Channel** — `AI_STREAM_FILE_READ: 'ai:stream-file-read'` at `src/shared/ipc-channels.ts:137`.
- **Preload** — `onStreamFileRead` at `src/preload/index.ts:207-209` (post-05: returns an unsubscribe); typed at `src/preload/index.d.ts:335`; included in `removeAllAiListeners` (`index.ts:224`).
- **Store records** — `src/renderer/src/stores/use-ai-dm-store.ts:85` declares `fileReadStatus: { path: string; status: string } | null`; `handleFileRead` (`:576-581`) sets it when `data.streamId === state.activeStreamId`; initial `null` at `:182`; pre-04 the only clearer was `sendMessage` (`:344`). **PHASE-04 adds clearing on cancel/timeout/done/error/reset/init.**
- **Zero `.tsx` readers** — unlike sibling `webSearchStatus` (consumed by `WebSearchApprovalPrompt.tsx`). During an AI file read the user sees only the generic "AI DM is typing..." dots (`ChatPanel.tsx:392-409`; label logic at `:401`: `aiStreamStatus === 'loading_model' ? t('game.chatPanel.aiLoadingModel') : t('game.chatPanel.aiTyping')`).

Verification commands:

```bash
grep -rn "AI_STREAM_FILE_READ" dnd-app/src --include="*.ts*"
#   ai-service.ts:812 (live emit), ai-stream-handler.ts:180 (dead), preload/index.ts:208,224, ipc-channels.ts:137
sed -n '804,824p' dnd-app/src/main/ai/ai-service.ts          # 'reading' emit + read + restream; NO 'done' emit
grep -rn "fileReadStatus" dnd-app/src/renderer --include="*.tsx"
#   → EMPTY pre-phase (zero component readers; store hits are .ts)
sed -n '392,410p' dnd-app/src/renderer/src/components/game/bottom/ChatPanel.tsx   # typing indicator (pre-10 lines)
# POST-04 GATE (clearing must already exist; do NOT re-add):
grep -c "fileReadStatus: null" dnd-app/src/renderer/src/stores/use-ai-dm-store.ts  # ≥5 post-04 (cancel/done/error/reset/init + sendMessage)
```

### F4 — Per-request token breakdown exists with only a shallow UI; no inspector (recommendation, with verified current state)

What exists today (the inspector builds on, not from scratch):

- `ContextTokenBreakdown` at `src/main/ai/token-budget.ts:8-19`: `{ rulebookChunks, srdData, characterData, campaignData, creatures, gameState, memory, total, truncated? }` — `truncated?: boolean` is "True if ANY section's content was actually trimmed to fit its budget". `estimateTokens` = `Math.ceil(text.length / 4)` (`:1-6`).
- `AI_TOKEN_BUDGET` handler (`src/main/ipc/ai-handlers.ts:297-299`) returns `getLastTokenBreakdown()`; `AI_TOKEN_BUDGET_PREVIEW` (`:301-309`) runs a throwaway `buildContext('preview query for token budget', characterIds, campaignId)` and returns the breakdown. **Post-07A:** `AI_TOKEN_BUDGET` accepts an optional `campaignId` and previews no longer clobber live state; preload `getTokenBudget(campaignId?)` at `src/preload/index.ts:119` / `index.d.ts:248`; `previewTokenBudget(campaignId, characterIds)` at `index.ts:120-121` / `index.d.ts:258`.
- The ONLY renderer consumer is `DMTabPanel.tsx`: state + `refreshTokenBudget` at `:60-91` (tries `getTokenBudget()`, falls back to `previewTokenBudget` when no live build), refresh-on-tab-open effect `:94-98`, refresh-on-stream-end effect (falling edge of `aiIsTyping` via `wasTypingRef`) `:100-108`, toggle button + per-section rows render at `:239-273` (i18n keys `game.dmTabPanel.tokenBudget/tokenCount/budgetRulebook/budgetSrdData/budgetCharacters/budgetCampaign/budgetCreatures/budgetGameState/budgetMemory/totalContext`, `en.json:978-987`). It displays section totals only — **no truncation state, no token estimate, no context window, no provenance**.
- `AiContextPanel.tsx` (same folder, lazy-mounted by DMTabPanel at `:276-281`) is a *memory-file* viewer (`listMemoryFiles`/`readMemoryFile`) — a different concern; don't touch it (PHASE-10 owns its error states).
- Provenance source (post-07C): the finalized assistant message carries `contextChunkIds` (`src/main/ai/types.ts:168`; attached at the finalize `conv.addMessage('assistant', displayText, contextChunkIds)` call). `conversation-manager.ts` exposes `getMessages()` (`:45`). The `conversations` map (`ai-service.ts:86`) is module-private — a read-only accessor must live in `ai-service.ts`.

Verification commands:

```bash
sed -n '1,20p' dnd-app/src/main/ai/token-budget.ts
sed -n '297,309p' dnd-app/src/main/ipc/ai-handlers.ts
sed -n '60,108p' dnd-app/src/renderer/src/components/game/bottom/DMTabPanel.tsx
sed -n '239,281p' dnd-app/src/renderer/src/components/game/bottom/DMTabPanel.tsx
grep -rn "getTokenBudget\|previewTokenBudget" dnd-app/src/renderer --include="*.tsx" | grep -v test   # DMTabPanel only
grep -n "getMessages()" dnd-app/src/main/ai/conversation-manager.ts                                   # :45
# POST-07 GATE for provenance + per-campaign breakdown:
grep -n "recordTokenBreakdown\|getLastTokenBreakdown(campaignId" dnd-app/src/main/ai/context-builder.ts
grep -n "contextChunkIds" dnd-app/src/main/ai/ai-service.ts   # finalize attachment (07C)
```

### Supporting surfaces verified (shared by multiple sub-phases)

- `AI_STREAM_DONE` payload today (`ai-handlers.ts:222-231`, inside the `AI_CHAT_STREAM` handler's `onDone` lambda): `{ streamId, fullText, displayText, statChanges, dmActions, ruleCitations }` — `parsed.data.campaignId` is in scope in that lambda (the zod-narrowed `AiChatRequest`), so truncation fields can be appended without touching `startChat`/`handleStreamCompletion` signatures.
- Store `handleDone` (`use-ai-dm-store.ts:511-555`) types the payload inline and gates on `data.streamId === state.activeStreamId`; `pushDmAlert(level, message, actions?)` is imported from `../components/game/overlays/DmAlertTray` (signature at `DmAlertTray.tsx:35`).
- `sendToWindow(win, channel, payload)` helper at `ai-handlers.ts:81`; `ai-service.ts` uses `BrowserWindow.getAllWindows()[0]` for its own emits (`:810`).
- `setupListeners` at `use-ai-dm-store.ts:472+`; post-05 it collects per-listener unsubscribes (pre-05 it returned `removeAllAiListeners`).
- Test conventions: `use-ai-dm-store.test.ts:1-35` stubs the whole `window.api.ai` surface (post-05: each `onX` mock returns an unsubscribe spy); `ChatPanel.test.tsx` is import-smoke only; `DMTabPanel.test.tsx` gains happy-dom render tests in 10A; main-side model for driving `startChat` end-to-end is `src/main/ai/ai-service-web-search-approval.test.ts` (vi.hoisted mocks for electron/conversation-manager/ollama-client/storage/memory-manager).

```bash
sed -n '206,240p' dnd-app/src/main/ipc/ai-handlers.ts        # AI_CHAT_STREAM handler + onDone payload
sed -n '511,560p' dnd-app/src/renderer/src/stores/use-ai-dm-store.ts   # handleDone
grep -n "pushDmAlert" dnd-app/src/renderer/src/components/game/overlays/DmAlertTray.tsx | head -3
```

## Sub-phases

Order keeps the tree green: 14A adds main-side plumbing with no consumer (dead-code-warning-free because the handler itself consumes the exports); 14B consumes it; 14C and 14D are independent renderer+main slices; 14E is the largest UI piece and lands last so its tests exercise the final store shape.

### 14A — Main: connection-status invoke handler + push-on-change event

**Objective:** the main process answers `AI_CONNECTION_STATUS` again and pushes `AI_CONNECTION_STATUS_CHANGED` whenever the derived status transitions, so the renderer needs no polling.

**Files:** `src/main/ai/ai-service.ts`, `src/shared/ipc-channels.ts`, `src/main/ipc/ai-handlers.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`, `src/main/ai/ai-service.test.ts`, `src/main/ipc/ai-handlers.test.ts`.

**Steps:**

1. `src/shared/ipc-channels.ts`: add the event channel next to `AI_STREAM_STATUS` (`:139`):
   ```ts
   AI_CONNECTION_STATUS_CHANGED: 'ai:connection-status-changed',
   ```
   (`AI_CONNECTION_STATUS` invoke channel already exists at `:119` — reuse, don't duplicate.)
2. `src/main/ai/ai-service.ts` — next to the connection-status block (`:154-169`), add a transition emitter:
   ```ts
   let lastEmittedConnectionStatus: AiConnectionStatus = 'connected'

   /** Broadcast AI_CONNECTION_STATUS_CHANGED when the derived status transitions. */
   function notifyConnectionStatusChanged(): void {
     const status = getConnectionStatus()
     if (status === lastEmittedConnectionStatus) return
     lastEmittedConnectionStatus = status
     try {
       for (const win of BrowserWindow.getAllWindows()) {
         win.webContents.send(IPC_CHANNELS.AI_CONNECTION_STATUS_CHANGED, {
           status,
           consecutiveFailures: getConsecutiveFailures()
         })
       }
     } catch {
       // Non-fatal: status push is best-effort observability (e.g. windows gone during shutdown).
     }
   }
   ```
   `BrowserWindow` and `IPC_CHANNELS` are already imported in this file (used by the FILE_READ emit at `:810`). Call `notifyConnectionStatusChanged()` in `streamWithRetry` immediately after BOTH counter writes: after `consecutiveFailures = 0` (`:190`) and after `consecutiveFailures++` (`:193`). Transitions with thresholds 0/1–2/≥3: connected→degraded on the 1st failure, degraded→disconnected on the 3rd, anything→connected on the next success.
3. `src/main/ipc/ai-handlers.ts`: replace the removal comment (`:294-295`) with the handler the comment anticipates:
   ```ts
   handle(
     IPC_CHANNELS.AI_CONNECTION_STATUS,
     async (): Promise<{ status: AiConnectionStatus; consecutiveFailures: number }> => ({
       status: aiService.getConnectionStatus(),
       consecutiveFailures: aiService.getConsecutiveFailures()
     })
   )
   ```
   The `AiConnectionStatus` type import (`:11`) becomes genuinely used — delete the keep-alive alias `type _AiConnectionStatus = AiConnectionStatus` at `:62` (leave `_StreamResult` at `:63`). No zod schema: no renderer→main payload (same rationale as `AI_GET_CONFIG`; PHASE-10 10C precedent).
4. `src/preload/index.ts` — in the `ai` namespace:
   - invoke (near `getTokenBudget`, `:119`): `getConnectionStatus: () => ipcRenderer.invoke(IPC_CHANNELS.AI_CONNECTION_STATUS),`
   - event (with the other `onX` wrappers, post-05 named-listener pattern):
     ```ts
     onConnectionStatus: (cb: (data: { status: string; consecutiveFailures: number }) => void) => {
       const listener = (_e: Electron.IpcRendererEvent, data: { status: string; consecutiveFailures: number }): void => cb(data)
       ipcRenderer.on(IPC_CHANNELS.AI_CONNECTION_STATUS_CHANGED, listener)
       return () => ipcRenderer.removeListener(IPC_CHANNELS.AI_CONNECTION_STATUS_CHANGED, listener)
     },
     ```
     Match the file's exact post-05 wrapper shape (open `onStreamStatus` and copy its structure).
   - add `ipcRenderer.removeAllListeners(IPC_CHANNELS.AI_CONNECTION_STATUS_CHANGED)` to `removeAllAiListeners` (`:218-227`).
5. `src/preload/index.d.ts` — next to the existing AI typings (`:248` invoke block, `:330-339` listener block):
   ```ts
   getConnectionStatus: () => Promise<{ status: 'connected' | 'degraded' | 'disconnected'; consecutiveFailures: number }>
   onConnectionStatus: (cb: (data: { status: 'connected' | 'degraded' | 'disconnected'; consecutiveFailures: number }) => void) => () => void
   ```
   (Post-05 the other `onX` declarations return `() => void` — match.)
6. Tests:
   - `ai-service.test.ts` — drive `streamWithRetry` directly (it is exported): a `streamFn` that rejects with a non-timeout error 3 times → the mocked `webContents.send` receives `AI_CONNECTION_STATUS_CHANGED` exactly twice (`degraded` then `disconnected`), each with the right `consecutiveFailures`; then a succeeding `streamFn` → one more event (`connected`); a second consecutive success → NO further event (transition-gated). Extend the file's existing hoisted electron mock so `BrowserWindow.getAllWindows()` returns one fake window with a `webContents.send` spy.
   - `ai-handlers.test.ts` — `AI_CONNECTION_STATUS` returns `{ status, consecutiveFailures }` shape (mock `aiService.getConnectionStatus`/`getConsecutiveFailures`, follow the file's existing handler-harness pattern).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/main/ai/ai-service.test.ts src/main/ipc/ai-handlers.test.ts`

**Acceptance:** `grep -n "AI_CONNECTION_STATUS handler removed" src/main/ipc/ai-handlers.ts` → no hits; `grep -n "_AiConnectionStatus" src/main/ipc/ai-handlers.ts` → no hits; `grep -n "notifyConnectionStatusChanged" src/main/ai/ai-service.ts` → helper + exactly 2 call sites inside `streamWithRetry`; new tests green.

### 14B — Renderer: connection state in the AI store + badge in AiDmStatusBar

**Objective:** the store tracks live connection state; the status bar shows a shape+color+label badge when (and only when) the connection is degraded or disconnected.

**Files:** `src/renderer/src/stores/use-ai-dm-store.ts`, `src/renderer/src/stores/use-ai-dm-store.test.ts`, `src/renderer/src/components/game/bottom/AiDmStatusBar.tsx` (created by 10B), `src/renderer/src/components/game/bottom/AiDmStatusBar.test.tsx`, `src/renderer/src/components/game/bottom/ChatPanel.tsx`, `src/renderer/src/i18n/locales/en.json`, `src/renderer/src/i18n/locales/es.json`.

**Steps:**

1. `use-ai-dm-store.ts`:
   - State (near `fileReadStatus`, `:85`): `connectionStatus: 'connected' | 'degraded' | 'disconnected' | null` (type the union inline or as a local `export type AiConnectionState`; do NOT import main-process types into the renderer). Initial value `null` (= unknown) in the initializer block (`:182` area).
   - In `setupListeners`: add `const handleConnectionStatus = (data: { status: ...; consecutiveFailures: number }): void => set({ connectionStatus: data.status })` — **no streamId gate** (connection health is global, not per-stream). Register `window.api.ai.onConnectionStatus(handleConnectionStatus)` and push its unsubscribe into the post-05 `unsubscribes` array. Also seed the initial value fire-and-forget: `void window.api.ai.getConnectionStatus().then((r) => set({ connectionStatus: r.status })).catch(() => {})` — without this the badge is blank until the first transition event.
   - Do NOT clear `connectionStatus` in `reset()`/`initFromCampaign()` — it describes the provider link, not the campaign.
2. `AiDmStatusBar.tsx` (presentational, per 10B's contract): add an optional prop `connection?: 'connected' | 'degraded' | 'disconnected' | null`. Render rules:
   - `connected`, `null`, or `undefined` → render nothing extra (the bar already has the 10B readiness dot; a permanent "connected" chip is noise).
   - `degraded` → amber chip: `▲`-shaped or bordered span + `t('game.aiStatusBar.connDegraded')` ("AI connection unstable — retrying").
   - `disconnected` → red chip + `t('game.aiStatusBar.connDisconnected')` ("AI unreachable").
   - Wrap the chip in `<span role="status">` (implicit `aria-live="polite"` + `aria-atomic="true"` — transitions get announced without interrupting). Use shape/border + color + a text label, never color alone (Carbon status-indicator guidance; see Research notes).
3. `ChatPanel.tsx`: read `const connectionStatus = useAiDmStore((s) => s.connectionStatus)` and pass `connection={connectionStatus}` to `<AiDmStatusBar … />`. (Contingency: if 10B drifted and the status bar is still inline JSX at `ChatPanel.tsx:417-438`, render the chip inline there with the same rules.)
4. i18n — add to BOTH locales under a new `game.aiStatusBar` block (10B may have created the block; merge):
   - en: `"connDegraded": "AI connection unstable — retrying"`, `"connDisconnected": "AI unreachable — check the provider"`
   - es: `"connDegraded": "Conexión de IA inestable — reintentando"`, `"connDisconnected": "IA inaccesible — revisa el proveedor"`
5. Tests:
   - `use-ai-dm-store.test.ts`: add `onConnectionStatus: vi.fn((cb) => { aiHandlers.connection = cb; return vi.fn() })` and `getConnectionStatus: vi.fn().mockResolvedValue({ status: 'connected', consecutiveFailures: 0 })` to the `window.api.ai` stub; test that firing the captured callback with `{ status: 'degraded', consecutiveFailures: 1 }` sets `connectionStatus: 'degraded'`; test that `setupListeners`' cleanup calls the returned unsubscribe.
   - `AiDmStatusBar.test.tsx` (happy-dom render): `connection="degraded"` renders the degraded label inside `role="status"`; `connection="connected"` renders neither label; `connection="disconnected"` renders the disconnected label.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/renderer/src/stores/use-ai-dm-store.test.ts src/renderer/src/components/game/bottom/AiDmStatusBar.test.tsx`

**Acceptance:** `grep -n "connectionStatus" src/renderer/src/stores/use-ai-dm-store.ts` shows state + handler + seed; badge renders only for degraded/disconnected; store cleanup unsubscribes; targeted tests green.

### 14C — Truncation alert wiring (`wasContextTruncated` finally gets a caller)

**Objective:** every completed AI turn reports whether its context was truncated; the DM gets a one-time alert on the rising edge plus a persistent status-bar chip while the latest turn was trimmed.

**Files:** `src/main/ipc/ai-handlers.ts`, `src/preload/index.d.ts`, `src/renderer/src/stores/use-ai-dm-store.ts`, `src/renderer/src/stores/use-ai-dm-store.test.ts`, `src/renderer/src/components/game/bottom/AiDmStatusBar.tsx`, `src/renderer/src/components/game/bottom/AiDmStatusBar.test.tsx`, `src/renderer/src/components/game/bottom/ChatPanel.tsx`, `src/renderer/src/i18n/locales/en.json`, `src/renderer/src/i18n/locales/es.json`, `src/main/ipc/ai-handlers.test.ts`.

**Steps:**

1. `ai-handlers.ts` — in the `AI_CHAT_STREAM` handler's `onDone` lambda (`:222-231`), append two fields to the `AI_STREAM_DONE` payload (additive; `parsed.data.campaignId` is in scope):
   ```ts
   sendToWindow(win, IPC_CHANNELS.AI_STREAM_DONE, {
     streamId, fullText, displayText, statChanges, dmActions, ruleCitations,
     contextTruncated: aiService.wasContextTruncated(parsed.data.campaignId),
     tokenEstimate: aiService.getLastTokenEstimate(parsed.data.campaignId)
   })
   ```
   This is the entire main-side change — `handleStreamCompletion`/`startChat` signatures are untouched; the getters read the per-campaign manager set during this turn's final `getMessagesForApi` call (restreams re-set it; see F2).
2. `preload/index.d.ts` — extend `onStreamDone`'s callback data type with `contextTruncated?: boolean; tokenEstimate?: number` (the preload impl passes `data` through untyped, so only the declaration changes).
3. `use-ai-dm-store.ts`:
   - State: `lastContextTruncated: boolean` (init `false`), `lastTokenEstimate: number | null` (init `null`).
   - `handleDone` (`:511-555`): extend the inline payload type with the two optional fields. Inside the `streamId === activeStreamId` branch, BEFORE the `set(...)`, fire the rising-edge alert:
     ```ts
     const truncated = data.contextTruncated ?? false
     if (truncated && !state.lastContextTruncated) {
       pushDmAlert('warning', i18n.t('notify.aiDmStore.contextTruncated'))
     }
     ```
     and add `lastContextTruncated: truncated, lastTokenEstimate: data.tokenEstimate ?? null` to the `set(...)` object. Rising-edge-only means a campaign that is permanently over budget alerts once, not every turn — the persistent chip (step 4) carries the ongoing signal.
   - Reset `lastContextTruncated: false, lastTokenEstimate: null` in `reset()` and both `initFromCampaign()` branches (additive keys in the existing `set(...)` calls PHASE-04 already restructured — coordinate, don't duplicate lines).
4. `AiDmStatusBar.tsx`: optional prop `contextTruncated?: boolean`. When true, render an amber chip `t('game.aiStatusBar.contextTrimmed')` ("Context trimmed last turn") with `title={t('game.aiStatusBar.contextTrimmedTitle')}` ("The last AI reply did not see the full context — older history or context sections were dropped to fit the model's window. Open the Context Inspector in the DM tab for the breakdown."), inside the same `role="status"` container as 14B's chip. `ChatPanel.tsx` passes `contextTruncated={useAiDmStore((s) => s.lastContextTruncated)}`.
5. i18n (both locales):
   - en `notify.aiDmStore.contextTruncated`: `"AI context was trimmed — the model did not see the full conversation/context this turn. See the DM tab's Context Inspector."`
   - es `notify.aiDmStore.contextTruncated`: `"El contexto de la IA fue recortado — el modelo no vio todo el contexto en este turno. Consulta el Inspector de Contexto en la pestaña del DM."`
   - en `game.aiStatusBar.contextTrimmed` / `contextTrimmedTitle` as in step 4; es: `"Contexto recortado en el último turno"` / `"La última respuesta de la IA no vio el contexto completo — se descartó historial o secciones de contexto para caber en la ventana del modelo. Abre el Inspector de Contexto en la pestaña del DM."`
6. Tests:
   - `use-ai-dm-store.test.ts`: drive the captured `handleDone` callback twice with `contextTruncated: true` → `pushDmAlert` (mock the `DmAlertTray` module the way the file already does for existing alert tests; if it doesn't, `vi.mock('../components/game/overlays/DmAlertTray', …)`) called exactly ONCE; state shows `lastContextTruncated: true`, `lastTokenEstimate` set; a following done with `contextTruncated: false` clears the flag; `reset()` clears both fields.
   - `ai-handlers.test.ts`: extend the `AI_CHAT_STREAM` coverage (or add it following the harness pattern) asserting the `AI_STREAM_DONE` payload includes `contextTruncated`/`tokenEstimate` sourced from the mocked `aiService.wasContextTruncated`/`getLastTokenEstimate` called with the request's `campaignId`.
   - `AiDmStatusBar.test.tsx`: `contextTruncated` chip renders/doesn't render.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/renderer/src/stores/use-ai-dm-store.test.ts src/main/ipc/ai-handlers.test.ts src/renderer/src/components/game/bottom/AiDmStatusBar.test.tsx`

**Acceptance:** `grep -rn "wasContextTruncated" dnd-app/src --include="*.ts*" | grep -v ai-service.ts | grep -v test` → exactly one production hit (the onDone lambda); truncated turn → one DM alert + persistent chip; non-truncated turn clears the chip; tests green.

### 14D — File-read lifecycle (`'done'` emission) + "Reading file…" indicator

**Objective:** the typing indicator names the file while the AI reads it and reverts the moment the read finishes — without re-adding any of PHASE-04's clearing.

**Files:** `src/main/ai/ai-service.ts`, `src/renderer/src/components/game/bottom/ChatPanel.tsx`, `src/renderer/src/components/game/bottom/ChatPanel.test.tsx`, `src/renderer/src/i18n/locales/en.json`, `src/renderer/src/i18n/locales/es.json`, `src/main/ai/ai-service.test.ts` (or the FILE_READ-covering sibling, see step 4).

**Steps:**

1. **Verify the post-04 gate first** (F3 command): `grep -c "fileReadStatus: null" src/renderer/src/stores/use-ai-dm-store.ts` ≥ 5. If PHASE-04 drifted and clearing is absent, STOP and implement 04A's clearing list exactly as written in `completed/PHASE-04-ai-store-approval-hygiene.md` before continuing — the indicator must never be able to outlive its stream.
2. `ai-service.ts` FILE_READ branch (`:806-832`): after `const result = await readRequestedFile(fileReq.path)` (`:819`) resolves and BEFORE `await restreamConversation()`, emit the terminal event mirroring the `'reading'` emit shape:
   ```ts
   if (win) {
     win.webContents.send(IPC_CHANNELS.AI_STREAM_FILE_READ, {
       streamId,
       path: fileReq.path,
       status: 'done'
     })
   }
   ```
   (`win` is the same `BrowserWindow.getAllWindows()[0]` captured at `:810`.) No store change needed: `handleFileRead` (`use-ai-dm-store.ts:576-581`) already records whatever `status` arrives; the indicator (step 3) only renders `'reading'`. Multi-read chains (up to `FILE_READ_MAX_DEPTH`) work naturally: each depth emits `reading` → `done`.
3. `ChatPanel.tsx` — in the typing-indicator label (pre-10 location `:401`; post-10 re-locate the `aiLoadingModel`/`aiTyping` ternary):
   - read `const aiFileReadStatus = useAiDmStore((s) => s.fileReadStatus)`;
   - label precedence: file-read first, then model-load, then generic:
     ```tsx
     {aiFileReadStatus?.status === 'reading'
       ? t('game.chatPanel.aiReadingFile', { file: aiFileReadStatus.path.split(/[\\/]/).pop() ?? aiFileReadStatus.path })
       : aiStreamStatus === 'loading_model'
         ? t('game.chatPanel.aiLoadingModel')
         : t('game.chatPanel.aiTyping')}
     ```
     Basename-only display (the main-side path may be long); the full path goes in a `title` attribute on the label span.
4. i18n (both locales): en `game.chatPanel.aiReadingFile`: `"AI DM is reading {{file}}…"`; es: `"El DM de IA está leyendo {{file}}…"` — place next to `aiTyping`/`aiLoadingModel` (`en.json:900-901`).
5. Tests:
   - Main: extend the test file that covers the FILE_READ flow (check `grep -rln "FILE_READ" dnd-app/src/main/ai/*.test.ts`; `ai-service-web-search-approval.test.ts` is the harness model if none does) — drive a stream whose `fullText` carries a FILE_READ tag and assert `webContents.send` received `AI_STREAM_FILE_READ` twice for that streamId: `status:'reading'` then `status:'done'`, same `path`.
   - Renderer: `ChatPanel.test.tsx` is import-smoke only — add a happy-dom render test (pattern: `CloudStatusPanel.test.tsx` / 10A's DMTabPanel tests): seed `useAiDmStore.setState({ enabled: true, isTyping: true, fileReadStatus: { path: '/x/notes/intro.md', status: 'reading' } })` (plus whatever minimal props/mocks ChatPanel needs post-10) and assert the rendered text contains `intro.md`; flip `fileReadStatus` to `{ …, status: 'done' }` and assert the generic typing label returns.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/renderer/src/components/game/bottom/ChatPanel.test.tsx` plus the touched main test file.

**Acceptance:** `grep -c "AI_STREAM_FILE_READ" src/main/ai/ai-service.ts` → 2 emit sites (`'reading'` + `'done'`); `grep -rn "fileReadStatus" dnd-app/src/renderer --include="*.tsx" | grep -v test` → ≥1 hit (ChatPanel); no new `fileReadStatus: null` writers added to the store by this phase; tests green.

### 14E — Context-inspector panel ("what did the AI actually see?")

**Objective:** one IPC snapshot endpoint + a DM-tab panel showing per-section tokens, total vs context window, the truthful truncation flag, the last token estimate, and the last turn's retrieval provenance — replacing (and strictly superseding) DMTabPanel's inline token-budget block.

**Files:** `src/shared/ipc-channels.ts`, `src/main/ai/ai-service.ts`, `src/main/ipc/ai-handlers.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`, `src/renderer/src/components/game/bottom/ContextInspectorPanel.tsx` (new), `src/renderer/src/components/game/bottom/ContextInspectorPanel.test.tsx` (new), `src/renderer/src/components/game/bottom/DMTabPanel.tsx`, `src/renderer/src/components/game/bottom/DMTabPanel.test.tsx`, `src/renderer/src/i18n/locales/en.json`, `src/renderer/src/i18n/locales/es.json`, `src/main/ipc/ai-handlers.test.ts`.

**Steps:**

1. `ipc-channels.ts`: add `AI_GET_CONTEXT_INSPECTOR: 'ai:get-context-inspector',` next to `AI_TOKEN_BUDGET` (`:120`).
2. `ai-service.ts`: add a read-only provenance accessor (the `conversations` map at `:86` is module-private; use `.get`, never `getConversationManager`, so a read can't instantiate a manager — PHASE-07's CQS rule):
   ```ts
   /** Chunk ids attached to the most recent assistant message (RAG provenance; read-only). */
   export function getLastAssistantContextChunkIds(campaignId: string): string[] {
     const conv = conversations.get(campaignId)
     if (!conv) return []
     const msgs = conv.getMessages()
     for (let i = msgs.length - 1; i >= 0; i--) {
       if (msgs[i].role === 'assistant') return msgs[i].contextChunkIds ?? []
     }
     return []
   }
   ```
3. `ai-handlers.ts` — register the snapshot handler near `AI_TOKEN_BUDGET` (`:297`):
   ```ts
   handle(IPC_CHANNELS.AI_GET_CONTEXT_INSPECTOR, async (_event, campaignId: string) => {
     sanitizeCampaignId(campaignId)
     return {
       breakdown: getLastTokenBreakdown(campaignId),            // per-section tokens of the last LIVE build (07A); null if none yet
       contextTruncated: aiService.wasContextTruncated(campaignId),
       lastTokenEstimate: aiService.getLastTokenEstimate(campaignId),
       contextWindow: getActiveContextWindow(),                 // 01C export; see fallback note
       conversationBudget: getEffectiveBudgets().conversationHistory,
       chunkIds: aiService.getLastAssistantContextChunkIds(campaignId)
     }
   })
   ```
   Imports: `getActiveContextWindow`/`getEffectiveBudgets` from `../ai/token-budget` (PHASE-01 exports — if drift left them absent, return `contextWindow: null` and `conversationBudget: TOKEN_BUDGETS.conversationHistory` and note it in Completed; do not re-implement 01C). `sanitizeCampaignId` already lives in this file (used by the conversation handlers). The string `campaignId` follows the `AI_TOKEN_BUDGET_PREVIEW` convention (no zod object schema for a single sanitized scalar).
4. Preload: `getContextInspector: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_GET_CONTEXT_INSPECTOR, campaignId)` in `index.ts` (next to `getTokenBudget`, `:119`); `index.d.ts` (next to `:248`):
   ```ts
   getContextInspector: (campaignId: string) => Promise<{
     breakdown: { rulebookChunks: number; srdData: number; characterData: number; campaignData: number; creatures: number; gameState: number; memory: number; total: number; truncated?: boolean } | null
     contextTruncated: boolean
     lastTokenEstimate: number
     contextWindow: number | null
     conversationBudget: number
     chunkIds: string[]
   }>
   ```
5. `ContextInspectorPanel.tsx` (new, in `components/game/bottom/`): absorb DMTabPanel's token-budget block wholesale —
   - Props: `{ campaignId: string; characterIds: string[] }` (DMTabPanel computes `characterIds` today at `:84` for the preview fallback — pass it down).
   - Own state: `snapshot`, `previewBreakdown`, `expanded` (replaces `showTokenDetail`), `loading`.
   - `refresh()`: call `window.api.ai.getContextInspector(campaignId)`; if `snapshot.breakdown === null` (no live build yet — e.g. game just opened), ALSO call `window.api.ai.previewTokenBudget(campaignId, characterIds)` and show its breakdown labeled as a preview (`game.contextInspector.previewNote`) — this preserves DMTabPanel's existing fallback behavior exactly.
   - Auto-refresh: on mount, and on the falling edge of `useAiDmStore((s) => s.isTyping)` (port the `wasTypingRef` effect from `DMTabPanel.tsx:100-108` — the effect now lives where the data renders).
   - Render: the existing toggle button (reuse keys `game.dmTabPanel.tokenBudget` / `tokenCount`) and, expanded, the existing seven section rows + `totalContext` row (reuse `game.dmTabPanel.budget*` keys verbatim — zero locale churn for the rows), PLUS new rows:
     - `game.contextInspector.window`: "Model context window" → `contextWindow?.toLocaleString() ?? t('game.contextInspector.windowUnknown')`; when `breakdown.total > contextWindow`, tint the row amber.
     - `game.contextInspector.estimate`: "Last request (system + history)" → `lastTokenEstimate.toLocaleString()` (0 → em-dash).
     - `game.contextInspector.truncated`: when `contextTruncated || breakdown?.truncated` show an amber warning line `t('game.contextInspector.truncatedWarning')` ("Parts of the context were dropped to fit — the model did not see everything below."); otherwise a muted `t('game.contextInspector.truncatedNo')` ("Nothing trimmed last turn").
     - `game.contextInspector.chunks`: "Rules chunks used last turn ({{count}})" with a collapsed `<details>` listing `chunkIds` in a monospace, scrollable block; empty → `t('game.contextInspector.chunksNone')`. Sub-caption `t('game.contextInspector.chunksNote')` ("Debug identifiers — stable only until the rules index is rebuilt.").
     - Estimates caption `t('game.contextInspector.estimateNote')` ("All counts are ~4-chars-per-token estimates."), since `estimateTokens` is heuristic (`token-budget.ts:1-6`).
   - Accessibility: the expanded panel is plain content (no live region — it's user-toggled); the truncated warning line gets `role="status"` so a refresh that flips it announces politely.
6. `DMTabPanel.tsx`: delete the `tokenBudget`/`showTokenDetail` state, `refreshTokenBudget`, both refresh effects + `wasTypingRef` (`:60-108`), and the button+detail JSX (`:239-273`); render in their place (lazy, like the file's other panels):
   ```tsx
   const ContextInspectorPanel = lazy(() => import('./ContextInspectorPanel'))
   …
   <Suspense fallback={<div className="text-xs text-gray-500 w-full">{t('game.dmTabPanel.loadingContextPanel')}</div>}>
     <ContextInspectorPanel campaignId={campaign.id} characterIds={campaign.players.map((p) => p.characterId).filter((id): id is string => id !== null)} />
   </Suspense>
   ```
   Verify nothing else in DMTabPanel still reads the deleted state (`grep -n "tokenBudget\|wasTypingRef\|showTokenDetail" DMTabPanel.tsx` → only the new component mount). Keep `AiContextPanel` (memory files) mounted as-is.
7. i18n (both locales) — new `game.contextInspector` block: `previewNote` (en "Preview — no AI request sent yet this session", es "Vista previa — aún no se ha enviado ninguna solicitud de IA en esta sesión"), `window` ("Model context window" / "Ventana de contexto del modelo"), `windowUnknown` ("unknown" / "desconocida"), `estimate` ("Last request (system + history)" / "Última solicitud (sistema + historial)"), `estimateNote` ("All counts are ~4-chars-per-token estimates." / "Todos los recuentos son estimaciones de ~4 caracteres por token."), `truncatedWarning` ("Parts of the context were dropped to fit — the model did not see everything below." / "Se descartaron partes del contexto — el modelo no vio todo lo siguiente."), `truncatedNo` ("Nothing trimmed last turn" / "Nada recortado en el último turno"), `chunks` ("Rules chunks used last turn ({{count}})" / "Fragmentos de reglas usados en el último turno ({{count}})"), `chunksNone` ("No rules chunks retrieved last turn" / "No se recuperaron fragmentos de reglas en el último turno"), `chunksNote` ("Debug identifiers — stable only until the rules index is rebuilt." / "Identificadores de depuración — estables solo hasta que se reconstruya el índice de reglas.").
8. Tests:
   - `ContextInspectorPanel.test.tsx` (happy-dom): mock `window.api.ai.getContextInspector` + `previewTokenBudget`; (a) snapshot with a breakdown renders all seven section rows + window/estimate rows and NO preview note; (b) `breakdown: null` triggers the preview fallback and shows the preview note; (c) `contextTruncated: true` renders the warning line with `role="status"`; (d) `chunkIds: ['phb-1','dmg-2']` renders count 2 and both ids; (e) empty `chunkIds` renders `chunksNone`.
   - `DMTabPanel.test.tsx`: update 10A's mocks — `getTokenBudget` may no longer be called by DMTabPanel itself (the lazy child won't resolve in the smoke render); keep the stub harmless, assert DMTabPanel still renders the AI-DM tab without the deleted state.
   - `ai-handlers.test.ts`: `AI_GET_CONTEXT_INSPECTOR` returns the composed shape from mocked sources; rejects a path-traversal campaignId (whatever `sanitizeCampaignId` does on bad input — throw or sanitize — assert the same behavior the conversation handlers' tests assert).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/renderer/src/components/game/bottom/ContextInspectorPanel.test.tsx src/renderer/src/components/game/bottom/DMTabPanel.test.tsx src/main/ipc/ai-handlers.test.ts`

**Acceptance:** `grep -rn "getLastTokenEstimate\|wasContextTruncated" dnd-app/src/main/ipc/ai-handlers.ts` shows both consumed (14C's onDone + 14E's inspector); `grep -n "refreshTokenBudget" src/renderer/src/components/game/bottom/DMTabPanel.tsx` → no hits; the DM tab shows section rows + window + estimate + truncation + provenance; preview fallback works with no live build; tests green.

## Research notes

- **Context-inspector prior art.** Foundry's *Phils AI Assistant* frames the value as a "Prompt Engineer bridge": the user always sees and controls the constructed prompt before anything reaches the model — visibility of the assembled context is the product, not a debug afterthought (https://foundryvtt.com/packages/phils-ai-assistant). SillyTavern ships the same idea as **Prompt Itemization**: a per-message breakdown of which sections (character info, system prompt, chat history) consumed the context, motivated by exactly this app's failure mode — "parts of the prompt may be trimmed or dropped, which may negatively affect coherence" (https://docs.sillytavern.app/usage/prompts/tokenizer/; original feature request "Context Viewer with breakdown of all token usage", https://github.com/SillyTavern/SillyTavern/issues/135). 14E's panel is the same shape: per-section tokens + trim warnings, scoped to what the app already computes.
- **Status-indicator design.** Carbon Design System's status-indicator pattern: communicate severity with **shape + color + label together**, never color alone (color-blind users); reserve red for failures, amber for degraded (https://carbondesignsystem.com/patterns/status-indicator-pattern/). General status-indicator UX guidance traces to Nielsen's "visibility of system status" heuristic — surface health where the user is already looking, with plain-language labels (https://www.koruux.com/blog/ux-best-practices-designing-status-indicators/). Hence: chips with text labels in the status bar the DM already watches, rendered only when something is wrong (a permanent green chip is noise — the 10B readiness dot already covers "fine").
- **Accessible announcements.** `role="status"` is a live region with implicit `aria-live="polite"` and `aria-atomic="true"` — advisory updates that don't interrupt (MDN: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/status_role; WCAG technique ARIA22: https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA22). Used for the connection chip, truncation chip, and the inspector's truncation line. The truncation DM alert additionally goes through the existing `DmAlertTray` (already the app's alerting surface).
- **Push vs poll for the connection badge.** PHASE-10's research notes explicitly deferred the push design here: "main-process push of provider status… belongs with PHASE-14's observability/connection-badge work, which owns the `consecutiveFailures` surface." Push-on-transition (14A) is strictly better than the renderer polling `getConnectionStatus()`: the signal originates main-side at the exact moment `streamWithRetry` learns it, there is no staleness window, and zero idle traffic. The invoke endpoint is kept for the initial seed (and as the comment at `ai-handlers.ts:294` requested). Per-listener unsubscribe follows Electron's `ipcRenderer.removeListener` pattern (https://www.electronjs.org/docs/latest/api/ipc-renderer) that PHASE-05 standardized across the `ai.onX` surface.
- **Why rising-edge alerting for truncation.** A campaign permanently over budget would otherwise fire a DM alert on every single turn (alert fatigue → the DM dismisses all alerts, including mutation approvals). One alert per transition into the truncated state + a persistent chip while it lasts is the standard noisy-condition pattern (same reasoning as the thresholded connected/degraded/disconnected derivation already in `getConnectionStatus` — a circuit-breaker-style consecutive-failure counter rather than per-event noise).
- **Honest numbers caveat.** Every figure shown is an estimate (`estimateTokens` = chars/4, `token-budget.ts:1-6`); the inspector says so in a caption. Real counts exist upstream: Ollama's native `/api/chat` final chunk reports `prompt_eval_count` (prompt tokens) and `eval_count` (generated tokens) (https://docs.ollama.com/api/chat) — PHASE-01 migrates to that endpoint, and threading the *actual* counts into the inspector is a natural follow-up, deliberately out of scope here (no audit finding, and cloud providers report differently).
- **Alternatives considered.** (a) Putting truncation/estimate into a separate `AI_STREAM_DONE`-adjacent event — rejected: an additive field on the existing done payload is zero new lifecycle. (b) A full raw-prompt viewer (dump the exact assembled system prompt/messages) — rejected for this phase: it requires retaining the full prompt text per campaign in main memory and a redaction story for API-key-bearing provider context; the section-level breakdown answers the actual debugging question ("what got dropped?") at a fraction of the surface. Logged as a future idea if wanted. (c) Renderer-side truncation detection (compare message count sent vs stored) — rejected: the renderer never sees what main assembled; main is the only truth source.

## Test plan

- **14A:** `src/main/ai/ai-service.test.ts` — `streamWithRetry` transition emissions (degraded → disconnected → connected; no duplicate events on steady state). `src/main/ipc/ai-handlers.test.ts` — `AI_CONNECTION_STATUS` response shape.
- **14B:** `src/renderer/src/stores/use-ai-dm-store.test.ts` — `onConnectionStatus` wiring, seed call, cleanup unsubscribe. `src/renderer/src/components/game/bottom/AiDmStatusBar.test.tsx` — three connection render states.
- **14C:** store test — rising-edge alert fires once, state fields set/cleared, `reset()` clears. `ai-handlers.test.ts` — done payload carries `contextTruncated`/`tokenEstimate` for the request's campaign. `AiDmStatusBar.test.tsx` — truncation chip.
- **14D:** main test — `reading` then `done` emissions for a FILE_READ stream. `ChatPanel.test.tsx` — happy-dom render shows the file basename while `status === 'reading'`, generic label otherwise.
- **14E:** `ContextInspectorPanel.test.tsx` (new) — five cases in step 8. `DMTabPanel.test.tsx` — mocks updated, AI-DM tab still renders. `ai-handlers.test.ts` — inspector snapshot composition + campaignId sanitization.
- **End-of-phase 4-gate** (INSTRUCTIONS.md rule 5, run once after 14E): `npm run lint`, `npx tsc --noEmit -p tsconfig.web.json`, `npx tsc --noEmit -p tsconfig.node.json`, `npx vitest run` — all from `dnd-app/`. No Pi code is touched (no pytest needed).

## Acceptance criteria

1. `getConnectionStatus`/`getConsecutiveFailures` have production consumers: an `AI_CONNECTION_STATUS` invoke handler and transition-pushed `AI_CONNECTION_STATUS_CHANGED` events; the status bar shows a labeled amber/red chip for degraded/disconnected and nothing extra when healthy.
2. `wasContextTruncated`/`getLastTokenEstimate` have production consumers: every `AI_STREAM_DONE` carries `contextTruncated`/`tokenEstimate`; a truncated turn produces exactly one DM alert (rising edge) plus a persistent status-bar chip until a clean turn.
3. `fileReadStatus` has a component reader: while the AI reads a file the typing indicator names it; the main process emits `status:'done'` when the read completes so the label never outlives the read; all clearing remains PHASE-04's (none added here).
4. The DM tab's token-budget block is a Context Inspector: per-section tokens (existing keys), model context window, last-request estimate, truthful truncation state, and last-turn chunk-id provenance, with the no-live-build preview fallback preserved.
5. All new user-facing strings exist in BOTH `en.json` and `es.json`; status chips and the inspector warning use `role="status"`; no color-only signaling.
6. No AI-pipeline behavior change: no new write paths, no manager instantiation on read paths, `startChat`/`handleStreamCompletion` signatures untouched.
7. End-of-phase 4-gate green; one commit; one push (rules 5/11).

## Out of scope

- **`fileReadStatus`/`webSearchStatus` clearing on cancel/timeout/done/error/reset/init** — PHASE-04 (landed before this phase; 14D only verifies).
- **Truncation-flag correctness, per-campaign token-breakdown recording, `contextChunkIds` population** — PHASE-07 (this phase only surfaces them).
- **`num_ctx`/context-window wiring, `getEffectiveBudgets`/`getActiveContextWindow`, budget reconciliation** — PHASE-01 (14E only reads the exports).
- **Status-bar readiness probe, `AiDmStatusBar` extraction, token-meter `{{max}}`, `AI_GET_TOKEN_METER`** — PHASE-10 (14B/14C mount into its component).
- **Deleting the dead `ai-stream-handler.ts` FILE_READ emitter** — PHASE-08.
- **`sanitizeCampaignId` sweep across the other AI IPC handlers** — PHASE-13 (the one new handler here sanitizes from day one).
- **Content-stable chunk ids / retrieval rebuild** — PHASE-24; **entity memory surfacing** — PHASE-25.
- **Actual (non-estimated) token counts from Ollama `prompt_eval_count`/`eval_count` in the inspector** — future follow-up noted in Research; no phase owns it yet (log to `docs/SUGGESTIONS-LOG-DNDAPP.md` if desired during execution).
- **Raw assembled-prompt viewer** — rejected alternative (Research notes); log as a future idea only if requested.

## Completed

<!-- Filled during execution per INSTRUCTIONS.md rule 17 — one line per sub-phase with file:line citations. -->
