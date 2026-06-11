# PHASE-05 — AI stream listener lifecycle

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Make the renderer↔main AI streaming channel survive the realities of a live game session: campaign-object identity changes must not permanently deafen the renderer to AI stream events; Settings/wizard visits must not stack dead IPC listeners until Node warns; cancelling a stream during a `[FILE_READ]` must not re-register the dead stream into `activeStreams` for the TTL sweep to find ~10 minutes later, and must not write post-cancel messages into the conversation history; and a second player's chat message must queue behind — not silently kill — the AI's in-flight reply. The root-cause fix is structural: the preload `ai.onX` wrappers gain per-listener unsubscribe functions (matching the existing `update.onStatus` pattern), which unlocks safe, re-runnable React effects everywhere downstream.

## Dependencies & cross-phase notes

- **No prerequisite phases** (PHASE-INDEX row 05: no deps; phases 1–19 are independent).
- **PHASE-04 (`ai-store-approval-hygiene`)** also edits `src/renderer/src/stores/use-ai-dm-store.ts` (`reset()`/`initFromCampaign()` queue clearing, `webSearchStatus` deadlock, `approvePendingActions`). PHASE-04 runs before this phase numerically; when implementing 05F, re-read the then-current `reset()`/`initFromCampaign()` bodies — they may have grown approval-queue clearing. The `queuedMessages` field added in 05F is cleared by THIS phase in both functions regardless of what PHASE-04 did.
- **PHASE-06 (`scene-prep-pipeline`)** owns the scene-prep poll-cap/`isTyping`-wedge and error-retry fixes inside the same `use-game-effects.ts` AI-init effect that 05C restructures. 05C must NOT change poll semantics (intervals, cap, status handling) — only move/split the effect and fix its dependency array. Keep the poll code byte-identical where possible so PHASE-06's plan citations stay valid.
- **PHASE-08 (`executor-batch-correctness`)** removes the dead `src/main/ai/ai-stream-handler.ts` pipeline. `ai-service.ts:19` imports `type { PendingWebSearchApproval, StreamHandlerDeps }` from that file, and the LIVE `handleStreamCompletion` (edited in 05E) takes a `deps: StreamHandlerDeps` parameter. PHASE-08 must preserve or relocate those type exports; 05E does not move them.
- **PHASE-10 (`ai-dm-ui-truth`)** also edits `AiProviderSetup.tsx` (silent detect failure, dropdown states, wizard gating). 05D touches only the `onOllamaProgress` listener-registration effect in that file.
- **PHASE-14 (`ai-observability`)** owns rendering `fileReadStatus` in a component and clearing it on stream end/cancel (renderer side). 05E is main-process only; do not add `fileReadStatus` UI here.
- **PHASE-03 (`provider-stream-reliability`)** edits other regions of `ai-service.ts` (timeouts, `getConfig`, provider clients). It runs first; rebase 05E line numbers against the then-current file (verification commands below re-locate everything).

## Verified findings

All findings re-verified against the live tree on 2026-06-10. Every command below is runnable from the repo root.

### F1 — AI stream listeners permanently deregistered when the campaign object identity changes mid-game (bug/high)

The AI-init effect in `useGameEffects` registers the store's stream listeners once per game session, guarded by a ref:

- `dnd-app/src/renderer/src/hooks/use-game-effects.ts:211-216` — effect body: `if (!isDM || !campaign.aiDm?.enabled || aiInitRef.current) return; aiInitRef.current = true; const cleanupListeners = aiDmStore.setupListeners()`.
- `use-game-effects.ts:395-398` — effect cleanup: `cleanupTimers(); cleanupListeners()`.
- `use-game-effects.ts:399-405` — dependency array includes the whole **`campaign` object** (line 404), alongside `isDM`, `campaign.id`, `aiDmStore.initFromCampaign`, `aiDmStore.setupListeners`.
- `dnd-app/src/renderer/src/stores/use-ai-dm-store.ts:597-600` — `setupListeners` returns `() => window.api.ai.removeAllAiListeners()` — an all-or-nothing nuke of every AI channel listener in the window.
- `aiInitRef` is `useRef(false)` owned by GameLayout (`dnd-app/src/renderer/src/components/game/GameLayout.tsx:231`), passed in at `GameLayout.tsx:503`; the `campaign` prop comes from `InGamePage.tsx:23,63` — `campaigns.find((c) => c.id === campaignId)` against the campaign-store array.
- `dnd-app/src/renderer/src/stores/use-campaign-store.ts:135-150` — `saveCampaign` replaces the matched array entry with the NEW object (`updated[index] = campaign; set({ campaigns: updated })`), so every save changes the identity of the `campaign` object `InGamePage` selects.
- Mid-game saves are triggered by the AI's own actions: `executeAddJournalEntry` calls `campaignStore.saveCampaign(updatedCampaign)` (`dnd-app/src/renderer/src/services/game-actions/effect-actions.ts:468`), and downtime actions do the same (`dnd-app/src/renderer/src/services/game-actions/downtime-actions.ts:54,88`); a DM settings edit also lands here.

**Failure sequence:** AI emits `add_journal_entry` → `saveCampaign` → new campaign object → `InGamePage` re-renders GameLayout with a new `campaign` prop → the effect's deps changed → React runs the cleanup (`removeAllAiListeners()`) → effect body re-runs → `aiInitRef.current` is `true` → early return → **listeners are never re-registered**. The renderer goes deaf: the typing indicator spins until the 330s inactivity backstop (`STREAM_SAFETY_TIMEOUT_MS = 330_000`, `dnd-app/src/renderer/src/constants/app-constants.ts:50`), and every later AI turn is dead until the user leaves and re-enters the game.

Verification commands:

```bash
sed -n '209,217p;395,406p' dnd-app/src/renderer/src/hooks/use-game-effects.ts
sed -n '135,150p' dnd-app/src/renderer/src/stores/use-campaign-store.ts
sed -n '596,601p' dnd-app/src/renderer/src/stores/use-ai-dm-store.ts
grep -n 'aiInitRef' dnd-app/src/renderer/src/components/game/GameLayout.tsx
grep -n 'campaigns.find' dnd-app/src/renderer/src/pages/InGamePage.tsx
grep -n 'saveCampaign' dnd-app/src/renderer/src/services/game-actions/effect-actions.ts dnd-app/src/renderer/src/services/game-actions/downtime-actions.ts
```

Confirmed output (2026-06-10): deps array lines 399–405 list `campaign` at 404; `saveCampaign` at `use-campaign-store.ts:135`; `effect-actions.ts:468` and `downtime-actions.ts:54,88` call it; `InGamePage.tsx:63` selects by `.find`.

### F2 — Preload `ai.onX` wrappers return no per-listener unsubscribe (root cause of F1/F3/F4)

`dnd-app/src/preload/index.ts:183-215` — all eight `ai` event wrappers (`onStreamChunk` :183, `onStreamDone` :186, `onStreamError` :198, `onIndexProgress` :201, `onOllamaProgress` :204, `onStreamFileRead` :207, `onStreamWebSearch` :210, `onStreamStatus` :213) call `ipcRenderer.on(channel, (_e, data) => cb(data))` and return **nothing**. The only removal API is the all-or-nothing `removeAllAiListeners` (`index.ts:218-227`), which calls `ipcRenderer.removeAllListeners` on each of the eight channels. By contrast, `update.onStatus` (`index.ts:235-242`) keeps the wrapped listener in a local and returns `() => ipcRenderer.removeListener(IPC_CHANNELS.UPDATE_STATUS, listener)` — the correct pattern, already proven in this codebase (also used by `lan.onGameFound`, `index.ts:256-259`). Type declarations: `dnd-app/src/preload/index.d.ts:330-337` declare all eight as returning `void`; `removeAllAiListeners` at `:339`.

Because consumers cannot remove just their own listener, every consumer is forced into one of two broken patterns: never clean up (F3/F4 leaks) or nuke everything (F1's cross-consumer kill).

Verification commands:

```bash
sed -n '183,228p' dnd-app/src/preload/index.ts
sed -n '235,246p' dnd-app/src/preload/index.ts   # update.onStatus returns an unsubscribe
sed -n '328,340p' dnd-app/src/preload/index.d.ts
```

### F3 — OllamaManagement stacks a never-removed `AI_OLLAMA_PROGRESS` listener per Settings visit (bug/medium)

`dnd-app/src/renderer/src/components/ui/OllamaManagement.tsx:42` — `const progressListenerSet = useRef(false)`. `OllamaManagement.tsx:79-99` — an effect registers `window.api.ai.onOllamaProgress(...)` once per component INSTANCE (ref guard), and its cleanup is an empty function whose comment claims "Listener cleanup handled by removeAllAiListeners when page unmounts" (line 97). That claim is false: the only caller of `removeAllAiListeners` is the AI-DM store's `setupListeners` cleanup (`use-ai-dm-store.ts:599`), which runs on game-session teardown — nothing on the Settings unmount path calls it. Each Settings visit mounts a fresh instance (fresh ref), registering another `ipcRenderer` listener that holds a dead instance's `setActiveOp` setState. After ~10 visits Node emits `MaxListenersExceededWarning` (default 10 listeners per event; https://nodejs.org/api/events.html).

Verification commands:

```bash
sed -n '42p;79,99p' dnd-app/src/renderer/src/components/ui/OllamaManagement.tsx
grep -rn 'removeAllAiListeners' dnd-app/src/renderer/src --include='*.ts*' | grep -v '.test.'
# → only use-ai-dm-store.ts:599 calls it (plus the OllamaManagement comment)
```

### F4 — AiProviderSetup leaks an `onOllamaProgress` listener per wizard mount (debt/low)

`dnd-app/src/renderer/src/components/campaign/AiProviderSetup.tsx:143-149` — inside the `[enabled, provider, apiKey, detectOllamaStatus, onProviderReady]` effect, a `progressListenerRegistered` ref gates a `window.api.ai.onOllamaProgress(...)` registration. Same defect class as F3: the ref is per-instance, so each wizard visit re-registers; there is no cleanup on unmount; old listeners setState on unmounted instances.

Verification command:

```bash
sed -n '138,160p' dnd-app/src/renderer/src/components/campaign/AiProviderSetup.tsx
```

### F5 — Stream cancelled during a FILE_READ is re-registered into `activeStreams` (leaks ~10–11 min) and pollutes the conversation after the cancel (bug/high)

Main-process stream lifecycle, `dnd-app/src/main/ai/ai-service.ts` (all line numbers verified 2026-06-10):

- `:89-94` — `activeStreams`/`activeStreamTimestamps`/`activeStreamLastHeartbeat` maps; `STREAM_TTL_MS = 10 min`, `STREAM_MAX_TTL_MS = 30 min`, `HEARTBEAT_WINDOW_MS = 5 min`.
- `:130-140` — `staleStreamSweep` interval (60 s) aborts + removes entries older than `getEffectiveTTL`.
- `:925-932` — `cancelChat(streamId)`: clears pending web-search approval, `controller.abort()`, `removeStream(streamId)`.
- `:683-686, 806-832` — by design the stream stays REGISTERED through `[FILE_READ]`/`[WEB_SEARCH]` recursion so Cancel keeps working mid-read. The FILE_READ branch: emit `AI_STREAM_FILE_READ` (:810-817) → `await readRequestedFile(fileReq.path)` (:819) → **no abort check** → `conv.addMessage('assistant', strippedText)` + `conv.addMessage('user', fileContent)` (:826-827) → `await restreamConversation()` (:829).
- `:753-758` — `restreamConversation()` FIRST re-registers: `deps.activeStreams.set(streamId, abortController)`, resets `activeStreamTimestamps` and `activeStreamLastHeartbeat` — with **no check that the controller was already aborted**.
- `:180-215` — `streamWithRetry` early-returns at `:187` (`if (abortController.signal.aborted) return`) **without removing the stream** from `activeStreams`.

**Failure sequence:** user cancels while the file read is in flight → `cancelChat` aborts + removes the stream → `readRequestedFile` resolves anyway → lines 826-827 append the assistant text AND the file content to the conversation (polluting history for the next turn — the next message's API payload includes a half-turn the user explicitly cancelled) → `restreamConversation` re-registers the aborted controller into `activeStreams` with fresh timestamps → `streamWithRetry` returns instantly on the aborted signal → the orphaned entry sits in `activeStreams` until the TTL sweep removes it. TTL math: heartbeat is set once at re-registration and never updated; while age < 5 min the heartbeat window extends TTL past current age; from 5 min on, TTL is the flat 10 min → swept between 10 and 11 minutes (60 s sweep granularity). Matches the audited "~10–11 min".

**Adjacent pollution in the WEB_SEARCH branch (verified, same class):** `:842-843` adds `conv.addMessage('assistant', strippedText)` BEFORE the search executes; if the stream is cancelled during `performWebSearch` (:853), the abort guard at `:854` returns — leaving a dangling assistant message in the conversation with no paired user/search message and no restream.

Verification commands:

```bash
sed -n '88,100p;130,141p' dnd-app/src/main/ai/ai-service.ts      # maps, TTLs, sweep
sed -n '753,760p' dnd-app/src/main/ai/ai-service.ts              # re-registration, no abort check
sed -n '806,832p' dnd-app/src/main/ai/ai-service.ts              # FILE_READ branch, addMessage at 826-827
sed -n '834,861p' dnd-app/src/main/ai/ai-service.ts              # WEB_SEARCH branch, addMessage at 843
sed -n '925,932p' dnd-app/src/main/ai/ai-service.ts              # cancelChat
sed -n '186,188p' dnd-app/src/main/ai/ai-service.ts              # streamWithRetry aborted early-return
```

### F6 — A new player message cancels the in-flight AI stream and discards the partial answer with no feedback (bug/high)

- `dnd-app/src/renderer/src/stores/use-ai-dm-store.ts:335-338` — `sendMessage` unconditionally cancels: `if (state.activeStreamId) { await get().cancelStream() }`, then immediately re-sets `isTyping: true` (:340-347), so the first player's typing indicator runs seamlessly into a reply addressed to someone else. The partial `streamingText` is dropped by `cancelStream` (:384-400) with no system note.
- `dnd-app/src/renderer/src/hooks/use-game-network.ts:98-108` — host-side routing of a PEER's chat message into `routePlayerMessageToAiDm` with **no active-stream or queue check** (guards are only: host role, AI enabled, not paused, not system/AI, not a slash command).
- `dnd-app/src/renderer/src/services/ai-dm-routing.ts:119-151` — `routePlayerMessageToAiDm` builds roster + game-state snapshot + active creatures and calls `useAiDmStore.getState().sendMessage(...)`. The same single path serves solo and the host's own message via `ChatPanel.tsx:263` (`dnd-app/src/renderer/src/components/game/bottom/ChatPanel.tsx:258-270`).

So in multiplayer, player B chatting while the AI answers player A aborts A's reply mid-stream. (In solo, a rapid second message likewise kills the first answer.)

Verification commands:

```bash
sed -n '332,350p;384,400p' dnd-app/src/renderer/src/stores/use-ai-dm-store.ts
sed -n '95,108p' dnd-app/src/renderer/src/hooks/use-game-network.ts
sed -n '119,151p' dnd-app/src/renderer/src/services/ai-dm-routing.ts
grep -n 'routePlayerMessageToAiDm' dnd-app/src/renderer/src/components/game/bottom/ChatPanel.tsx
```

### Supporting facts (verified, used by the sub-phases)

- IPC channel constants: `AI_STREAM_CHUNK/DONE/ERROR`, `AI_INDEX_PROGRESS`, `AI_OLLAMA_PROGRESS`, `AI_STREAM_FILE_READ`, `AI_STREAM_WEB_SEARCH`, `AI_STREAM_STATUS` at `dnd-app/src/shared/ipc-channels.ts:132-139`; `AI_CANCEL_STREAM` at `:69`. No new channels are needed in this phase, so `ipc-channels.ts`/`ipc-schemas.ts` are untouched.
- `AI_CHAT_STREAM` handler (`dnd-app/src/main/ipc/ai-handlers.ts:206-239`) zod-parses the request (`AiChatRequestSchema`) and forwards stream events to the requesting window; `AI_CANCEL_STREAM` (`:242-244`) calls `aiService.cancelChat`.
- `setupListeners` (`use-ai-dm-store.ts:472-601`) registers exactly six listeners: chunk, done, error, fileRead, webSearch, status. It does NOT register `onOllamaProgress`/`onIndexProgress` (those belong to F3/F4's components; `onIndexProgress` currently has no renderer consumer at all).
- i18n: `notify.aiDmStore.*` keys exist in both `dnd-app/src/renderer/src/i18n/locales/en.json` (block at ~:5075) and `es.json` (block at ~:5075) — keys: `runApprovedFailed`, `mutationsAutoRejected`, `mutationUnknownCharacter`, `modelSwitched`, `modelAutoSelected`, `aiDmError`.
- Existing tests: `use-ai-dm-store.test.ts` stubs `window.api.ai.onX` as `vi.fn()` returning `undefined` (`src/renderer/src/stores/use-ai-dm-store.test.ts:1-33`) — these mocks MUST be updated to return unsubscribe spies when 05B lands, or cleanup will call `undefined()`. `use-game-effects.test.ts` is import-smoke only. `src/main/ai/ai-service-web-search-approval.test.ts` is the model for driving `startChat` end-to-end with mocked provider/conversation (vi.hoisted mocks for electron, conversation-manager, ollama-client, web-search, storage, memory-manager).
- `@testing-library/react` ^16.3.2 is available (`dnd-app/package.json:182`); `renderHook` is used elsewhere (e.g. `src/renderer/src/hooks/use-async-data.test.ts`).
- FILE_READ tag format: `[FILE_READ]{"path": "test.txt"}[/FILE_READ]` (`dnd-app/src/main/ai/file-reader.ts:12,29-35`); `FILE_READ_MAX_DEPTH` re-exported at `:138`.

## Sub-phases

Ordered so the tree stays green throughout: the preload API change (05A) is backward-compatible (callers currently ignore the return value), then consumers adopt it (05B–05D), then the main-process fix (05E), then the behavioral queueing fix (05F).

### 05A — Preload: per-listener unsubscribe for all eight `ai.onX` wrappers

**Objective:** every `ai.onX` registration returns a function that removes exactly that listener, mirroring `update.onStatus` (`src/preload/index.ts:235-242`).

**Files:** `dnd-app/src/preload/index.ts`, `dnd-app/src/preload/index.d.ts`.

**Steps:**
1. In `src/preload/index.ts:183-215`, rewrite each of the eight wrappers (`onStreamChunk`, `onStreamDone`, `onStreamError`, `onIndexProgress`, `onOllamaProgress`, `onStreamFileRead`, `onStreamWebSearch`, `onStreamStatus`) to the named-listener pattern:
   ```ts
   onStreamChunk: (cb: (data: { streamId: string; text: string }) => void) => {
     const listener = (_e: IpcRendererEvent, data: { streamId: string; text: string }) => cb(data)
     ipcRenderer.on(IPC_CHANNELS.AI_STREAM_CHUNK, listener)
     return () => ipcRenderer.removeListener(IPC_CHANNELS.AI_STREAM_CHUNK, listener)
   }
   ```
   Keep each wrapper's existing payload type annotation verbatim. `IpcRendererEvent` is already imported in this file (used by `update.onStatus`).
2. KEEP `removeAllAiListeners` (`index.ts:218-227`) unchanged — it remains a defensive nuke and existing tests reference it.
3. In `src/preload/index.d.ts:330-337`, change the eight signatures' return types from `void` to `() => void` (e.g. `onStreamChunk: (cb: (data: AiStreamChunkData) => void) => () => void`).

**Why this is safe pre-adoption:** contextBridge proxies returned functions to the renderer (https://www.electronjs.org/docs/latest/api/context-bridge — "Function values are proxied to the other context"), and TypeScript allows callers to ignore a now-non-void return. The codebase already ships this exact pattern (`update.onStatus`, `lan.onGameFound`).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json` (preload is in the node config; index.d.ts is consumed by web).

**Acceptance:** all eight wrappers return an unsubscribe; both tsc configs green; `removeAllAiListeners` still exported.

### 05B — AI store: `setupListeners` cleans up per-listener, not via the global nuke

**Objective:** `setupListeners`'s returned cleanup removes only the six listeners it registered, making registration safely re-runnable (prerequisite for 05C).

**Files:** `dnd-app/src/renderer/src/stores/use-ai-dm-store.ts`, `dnd-app/src/renderer/src/stores/use-ai-dm-store.test.ts`.

**Steps:**
1. In `setupListeners` (`use-ai-dm-store.ts:590-600`), collect the unsubscribes:
   ```ts
   const unsubscribes = [
     window.api.ai.onStreamChunk(handleChunk),
     window.api.ai.onStreamDone(handleDone),
     window.api.ai.onStreamError(handleError),
     window.api.ai.onStreamFileRead(handleFileRead),
     window.api.ai.onStreamWebSearch(handleWebSearch),
     window.api.ai.onStreamStatus(handleStreamStatus)
   ]
   return () => {
     for (const unsubscribe of unsubscribes) unsubscribe()
   }
   ```
2. Update the `window.api.ai` stub in `use-ai-dm-store.test.ts:12-31`: every `onX` mock must return a `vi.fn()` unsubscribe (e.g. `onStreamChunk: vi.fn((cb) => { aiHandlers.chunk = cb; return vi.fn() })`). Keep `removeAllAiListeners: vi.fn()` in the stub.
3. Add a test: `setupListeners` cleanup calls each returned unsubscribe exactly once and does NOT call `removeAllAiListeners`.
4. Add a test: registering twice (two `setupListeners()` calls) then cleaning up the FIRST does not detach the second's handlers (drive `aiHandlers.chunk` after the first cleanup; assert `streamingText` still updates for the active stream).

**Cheap checks:** `npx vitest run src/renderer/src/stores/use-ai-dm-store.test.ts` + `npx tsc --noEmit -p tsconfig.web.json`.

**Acceptance:** cleanup is per-listener; `removeAllAiListeners` no longer called from `setupListeners`; targeted tests green.

### 05C — `useGameEffects`: split listener registration from one-shot init; drop the `campaign` object dependency

**Objective:** a campaign-object identity change (any `saveCampaign`) no longer tears down stream listeners; listener registration becomes its own re-runnable effect; the one-shot scene-init effect keys on stable scalars only.

**Files:** `dnd-app/src/renderer/src/hooks/use-game-effects.ts`, `dnd-app/src/renderer/src/hooks/use-game-effects.test.ts`.

**Steps:**
1. Above the AI-init effect, derive `const aiDmEnabled = campaign.aiDm?.enabled ?? false` and add a latest-campaign ref kept current via an effect (`const campaignRef = useRef(campaign)` + `useEffect(() => { campaignRef.current = campaign })` with no dep array) — the standard latest-ref pattern so effect bodies can read fresh data without re-running (https://react.dev/learn/synchronizing-with-effects).
2. New dedicated listener effect (place immediately before the init effect):
   ```ts
   // AI DM stream listeners (host only). Separate from the one-shot init below so a
   // campaign-object identity change (any saveCampaign) re-registers instead of
   // killing them — cleanup is per-listener (05B), so re-running is safe.
   useEffect(() => {
     if (!isDM || !aiDmEnabled) return undefined
     return aiDmStore.setupListeners()
   }, [isDM, aiDmEnabled, aiDmStore.setupListeners])
   ```
3. In the existing init effect (`use-game-effects.ts:211-405`):
   - Remove `const cleanupListeners = aiDmStore.setupListeners()` (:216) and the `cleanupListeners()` call from the cleanup (:397) — cleanup keeps only `cleanupTimers()`.
   - Replace direct `campaign` reads in the body with `campaignRef.current` where the value is read at call time inside nested closures (`initFromCampaign`, `configureAiFromCampaign`, `getCharacterIds`'s `campaign.players` fallback); reads that happen synchronously on the effect's first run may keep using a local `const currentCampaign = campaignRef.current` taken at the top of the body.
   - Change the dependency array (:399-405) to `[isDM, campaign.id, aiDmEnabled, aiDmStore.initFromCampaign, aiDmStore.setupListeners]` — i.e. delete the bare `campaign` object dep. Keep (and update if needed) the existing `biome-ignore lint/correctness/useExhaustiveDependencies` comment at :210 explaining the one-shot contract.
   - Do NOT touch the scene-poll logic (`:315-391`) beyond the mechanical `campaignRef` substitutions — PHASE-06 owns its behavior.
4. Replace the import-smoke `use-game-effects.test.ts` body with real coverage via `renderHook` from `@testing-library/react` (mock `window.api` per the `use-ai-dm-store.test.ts` stub pattern, plus the stores/services the hook imports — follow existing heavy-hook test setups in the repo for the mock list):
   - Test A: rerender with a NEW campaign object (same `id`, same `aiDm.enabled`) → the listener effect's unsubscribes are NOT called (identity change no longer tears down).
   - Test B: rerender with `aiDm.enabled` flipped false → unsubscribes ARE called; flipped back true → `setupListeners` called again (re-registration works).
   - Test C: unmount → unsubscribes called (no leak on leaving the game).

**Cheap checks:** `npx vitest run src/renderer/src/hooks/use-game-effects.test.ts` + `npx tsc --noEmit -p tsconfig.web.json`.

**Acceptance:** with 05B+05C applied, the F1 failure sequence is impossible: a `saveCampaign`-driven identity change re-runs neither effect (listener effect deps are scalars/stable actions), and even a deliberate re-run re-registers cleanly. Targeted tests green.

### 05D — Fix the OllamaManagement and AiProviderSetup listener leaks

**Objective:** both components register `onOllamaProgress` in a proper effect-with-cleanup using the 05A unsubscribe; the false "cleanup handled by removeAllAiListeners" comment and both ref guards are deleted.

**Files:** `dnd-app/src/renderer/src/components/ui/OllamaManagement.tsx`, `dnd-app/src/renderer/src/components/ui/OllamaManagement.test.tsx` (new), `dnd-app/src/renderer/src/components/campaign/AiProviderSetup.tsx`, `dnd-app/src/renderer/src/components/campaign/AiProviderSetup.test.tsx` (new).

**Steps:**
1. `OllamaManagement.tsx`: delete `progressListenerSet` (`:42`). Rewrite the effect at `:79-99`:
   ```ts
   useEffect(() => {
     return window.api.ai.onOllamaProgress((data) => {
       setActiveOp((prev) => { /* existing body unchanged */ })
     })
   }, [])
   ```
   Delete the stale comment at `:96-98`.
2. `AiProviderSetup.tsx`: delete the `progressListenerRegistered` ref and its registration block inside the `:138-160` effect (`:143-149`). Add a dedicated effect:
   ```ts
   useEffect(() => {
     if (!enabled || provider !== 'ollama') return undefined
     return window.api.ai.onOllamaProgress((data) => {
       if (data.type === 'download') setDownloadProgress(data.percent)
       if (data.type === 'pull') setPullProgress(data.percent)
     })
   }, [enabled, provider])
   ```
   The remaining `:138-160` effect keeps `detectOllamaStatus()` and the cloud-provider branch unchanged.
3. New colocated tests (jsdom + `@testing-library/react`): mount each component with `window.api.ai.onOllamaProgress` stubbed to capture the callback and return a `vi.fn()` unsubscribe; assert (a) registration happens once per mount, (b) the unsubscribe is called on unmount, (c) mounting twice (mount→unmount→mount) results in exactly one live registration. Stub the other `window.api.ai.*` methods the components call on mount (`detectOllama`, `getCuratedModels`, `getVram`, `listInstalledModelsDetailed` for OllamaManagement; `detectOllama` + `listInstalledModels`-family for AiProviderSetup — read each component's mount path and stub what it calls).

**Cheap checks:** `npx vitest run src/renderer/src/components/ui/OllamaManagement.test.tsx src/renderer/src/components/campaign/AiProviderSetup.test.tsx` + `npx tsc --noEmit -p tsconfig.web.json`.

**Acceptance:** repeated Settings/wizard visits add zero net listeners (no `MaxListenersExceededWarning` path); both new test files green.

### 05E — Main process: abort guards in `handleStreamCompletion`; no re-registration and no conversation writes after cancel

**Objective:** cancelling during a FILE_READ (or WEB_SEARCH) terminates cleanly: nothing is re-registered into `activeStreams`, and nothing is appended to the conversation after the abort.

**Files:** `dnd-app/src/main/ai/ai-service.ts`, `dnd-app/src/main/ai/ai-service-file-read-cancel.test.ts` (new).

**Steps:**
1. `restreamConversation` (`ai-service.ts:753`): insert as the FIRST statement:
   ```ts
   if (abortController.signal.aborted) return
   ```
   (Before `deps.activeStreams.set(...)` — the aborted controller must never be re-registered; `cancelChat` already removed the stream.)
2. FILE_READ branch: after `const result = await readRequestedFile(fileReq.path)` (`:819`) and before `formatFileContent`, insert:
   ```ts
   if (abortController.signal.aborted) return
   ```
   This single guard prevents both the `:826-827` conversation pollution and the `restreamConversation` call for a cancelled stream. (Belt-and-braces with step 1; both stay — a cancel can also land between `:827` and `:829`.) Checking `signal.aborted` after every `await` in an abortable flow is the standard pattern (https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal).
3. WEB_SEARCH branch: move `conv.addMessage('assistant', strippedText)` (`:843`) out of the pre-branch position so it executes only on the two commit paths:
   - rejected path: `conv.addMessage('assistant', strippedText)` immediately before `conv.addMessage('user', WEB_SEARCH_DENIED_MESSAGE)` (`:847`);
   - approved path: after the post-search abort guard (`:854`), immediately before `conv.addMessage('user', searchContent)` (`:856`).
   `const strippedText = stripWebSearch(fullText)` itself can stay where it is (`:842`).
4. Export a counter for tests + future observability (PHASE-14 may reuse it), next to `removeStream` (`:96-100`):
   ```ts
   /** Number of currently registered streams (test/observability hook). */
   export function getActiveStreamCount(): number {
     return activeStreams.size
   }
   ```
5. New test file `src/main/ai/ai-service-file-read-cancel.test.ts`, modeled line-for-line on the mock scaffolding of `ai-service-web-search-approval.test.ts` (vi.hoisted mocks for `electron`, `./context-builder`, `./conversation-manager` — extend the mock class to push constructed instances into a hoisted array so the test can read `getMessageCount()` —, `./ollama-client`, `../storage/ai-conversation-storage`, `./memory-manager`), plus a mock of `./file-reader` that wraps `vi.importActual` (keep real `hasFileReadTag`/`parseFileRead`/`stripFileRead`/`formatFileContent`/`FILE_READ_MAX_DEPTH`) and replaces `readRequestedFile` with a controllable deferred promise. Tests:
   - **Cancel during file read:** first stream response = `'Reading the notes. [FILE_READ]{"path": "notes.md"}[/FILE_READ]'`. Wait for the `AI_STREAM_FILE_READ` send (poll `sendMock` like `waitForWebSearchStatus` does). Call `cancelChat(streamId)`. Resolve the deferred read. Flush microtasks. Assert: `ollamaStreamChatMock` was called exactly ONCE (no restream), the conversation's message count equals what it was before the cancel (1 user message — no post-cancel assistant/user appends), and `getActiveStreamCount() === 0` (no re-registration leak).
   - **Uncancelled control:** same setup without the cancel; resolve the read; assert the restream runs (`ollamaStreamChatMock` called twice), conversation gains the assistant + file-content messages, terminal `onDone` fires, and `getActiveStreamCount() === 0` afterward.
   - **Cancel during web search:** response = `[WEB_SEARCH]{"query":"q"}[/WEB_SEARCH]`; make `performWebSearchMock` a deferred; approve via `approveWebSearch(streamId, true)`; `cancelChat` while the search is pending; resolve. Assert no assistant message was appended post-cancel and no restream occurred.

**Cheap checks:** `npx vitest run src/main/ai/ai-service-file-read-cancel.test.ts src/main/ai/ai-service-web-search-approval.test.ts` (the second guards against regressions from the step-3 reorder) + `npx tsc --noEmit -p tsconfig.node.json`.

**Acceptance:** all three new tests green; existing web-search approval tests still green; cancelled streams leave `activeStreams` empty immediately and conversations unpolluted.

### 05F — Queue player messages that arrive while a stream is in flight

**Objective:** `sendMessage` during an active stream enqueues instead of cancelling; the queue drains in FIFO order when the stream finishes (done or error); explicit cancellation paths clear the queue with feedback. This replaces silent answer-destruction (bug/high) — it is the fix itself, not an optional behavior, so it ships as the new default.

**Files:** `dnd-app/src/renderer/src/stores/use-ai-dm-store.ts`, `dnd-app/src/renderer/src/stores/use-ai-dm-store.test.ts`, `dnd-app/src/renderer/src/constants/app-constants.ts`, `dnd-app/src/renderer/src/i18n/locales/en.json`, `dnd-app/src/renderer/src/i18n/locales/es.json`.

**Steps:**
1. `app-constants.ts`: add `export const AI_MESSAGE_QUEUE_MAX = 5` (with a comment: cap on player messages queued behind an in-flight AI reply; overflow is dropped with a DM alert).
2. `use-ai-dm-store.ts` — state additions:
   ```ts
   interface QueuedAiMessage {
     campaignId: string
     content: string
     characterIds: string[]
     senderName?: string
     activeCreatures?: Array<{ label: string; currentHP: number; maxHP: number; ac: number; conditions: string[]; monsterStatBlockId?: string }>
     gameState?: string
     actingCharacterId?: string
   }
   ```
   Add `queuedMessages: QueuedAiMessage[]` to `AiDmState` (initial `[]`). The context (`gameState`, `activeCreatures`) is snapshotted at ENQUEUE time — it represents the world when the player spoke, which is the narratively correct context; document this in a comment.
3. `sendMessage` (`:323-382`): replace the cancel block (`:335-338`) with:
   ```ts
   if (state.activeStreamId || state.isTyping) {
     if (state.queuedMessages.length >= AI_MESSAGE_QUEUE_MAX) {
       pushDmAlert('warning', i18n.t('notify.aiDmStore.messageQueueFull'))
       return
     }
     set({ queuedMessages: [...state.queuedMessages, { campaignId, content, characterIds, senderName, activeCreatures, gameState, actingCharacterId }] })
     pushDmAlert('info', i18n.t('notify.aiDmStore.messageQueued', { sender: senderName ?? '' }))
     return
   }
   ```
   (`isTyping` is included so the pre-streamId window between `chatStream` invoke and `activeStreamId` set also queues instead of double-sending.)
4. Add a private drain helper inside the `create` callback:
   ```ts
   const drainQueue = (): void => {
     const next = get().queuedMessages[0]
     if (!next) return
     set({ queuedMessages: get().queuedMessages.slice(1) })
     void get().sendMessage(next.campaignId, next.content, next.characterIds, next.senderName, next.activeCreatures, next.gameState, next.actingCharacterId)
   }
   ```
   Call `drainQueue()` at the end of `handleDone` (after the `set` at `:542-552`) and `handleError` (after the `set` at `:564-571`) — inside the `streamId === activeStreamId` guard in both. Also call it from `sendMessage`'s synchronous failure paths (the `else` at `:365-374` and the `catch` at `:375-381`) so a failed send doesn't strand the queue.
5. Clear the queue on every deliberate-stop path, with feedback when non-empty: in `cancelStream` (`:384-400`), `reset()` (`:446-470`), and `initFromCampaign` (`:278-321`) add `queuedMessages: []` to the `set` calls; in `cancelStream` and the safety-timeout body (`:148-160`), if `get().queuedMessages.length > 0` first `pushDmAlert('warning', i18n.t('notify.aiDmStore.queuedMessagesDiscarded', { count }))`. Rationale: an explicit cancel/timeout means "stop the AI"; auto-firing queued sends right after would be surprising.
6. i18n — add to `notify.aiDmStore` in BOTH locale files (en at ~`en.json:5075`, es at ~`es.json:5075`):
   - `messageQueued`: en "Message queued — the DM is still answering the previous message." / es "Mensaje en cola — el DM aún está respondiendo al mensaje anterior."
   - `messageQueueFull`: en "AI message queue is full ({{count}} waiting) — message dropped." → use a static cap mention or `{{count}}`; keep en/es consistent.
   - `queuedMessagesDiscarded`: en "{{count}} queued message(s) discarded by cancel." / es equivalent.
7. Tests (`use-ai-dm-store.test.ts`):
   - sendMessage while `activeStreamId` set → `chatStream` NOT called again, `cancelStream` NOT called, message in `queuedMessages`.
   - `handleDone` for the active stream → queue drains FIFO: `chatStream` called with the queued args (senderName, gameState preserved).
   - `handleError` also drains.
   - Queue cap: 6th enqueue dropped, warning alert pushed (spy on the DmAlertTray module or assert queue length stays 5; `pushDmAlert` is imported from `../components/game/overlays/DmAlertTray` — mock that module).
   - `cancelStream`/`reset` clear the queue.
   - Regression: solo single-message flow unchanged (no active stream → sends immediately).

**Cheap checks:** `npx vitest run src/renderer/src/stores/use-ai-dm-store.test.ts` + `npx tsc --noEmit -p tsconfig.web.json`.

**Acceptance:** with a stream in flight, a second `sendMessage` never calls `cancelStream`; the first answer completes and the second is answered next; all cancel paths leave an empty queue; targeted tests green.

## Research notes

- **Per-listener unsubscribe from preload is the established Electron pattern.** Callback identity is transformed across the contextBridge, so a renderer-held callback can never be passed to a later `removeListener` call — the preload must retain the wrapped listener and hand back an unsubscribe closure. Demonstrated bug repro: https://github.com/ccorcos/electron-context-bridge-remove-listener-bug. Long-lived `ipcRenderer.on` registrations through the bridge also exhibit real memory growth in production apps: https://github.com/electron/electron/issues/27039. The contextBridge explicitly supports returning functions ("Function values are proxied to the other context"): https://www.electronjs.org/docs/latest/api/context-bridge. `ipcRenderer.removeListener` API: https://www.electronjs.org/docs/latest/api/ipc-renderer. This repo already uses the pattern (`update.onStatus`, `lan.onGameFound`), so 05A is a consistency fix, not an invention.
- **Listener accumulation symptom threshold.** Node's `EventEmitter` warns at 10 listeners per event (`MaxListenersExceededWarning`); it is a leak detector, not a hard limit — raising it (`setMaxListeners`) would mask F3/F4 rather than fix them: https://nodejs.org/api/events.html#emittersetmaxlistenersn.
- **Effect design.** React's contract is that cleanup runs before every dependency-change re-run, not just unmount — so any effect whose cleanup is destructive-but-not-reconstructible (the `aiInitRef`-guarded body) must never key on an unstable object identity. The fix is the documented one: remove object/function deps, key on scalars, and read fresh values through a ref: https://react.dev/learn/synchronizing-with-effects and https://react.dev/reference/react/useEffect ("remove unnecessary object and function dependencies"). The split listener effect (register ↔ unregister symmetric) is also StrictMode-proof — dev double-invocation of setup+cleanup is harmless when cleanup is exact: https://react.dev/reference/react/StrictMode. Alternative considered: keeping one effect and guarding cleanup with a "same campaign id?" comparison — rejected as fragile (React gives cleanup no access to next deps; it inverts the data flow and still nukes listeners on genuine re-runs).
- **Abort handling after awaits.** The cooperative-cancellation rule for promise chains that cannot be hard-cancelled: check `signal.aborted` after every await and return without side effects (https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal). 05E applies this at the two await boundaries the audit identified (file read, web search) plus the restream entry point. Alternative considered: passing the signal into `readRequestedFile` to truly cancel disk I/O — rejected as unnecessary (file reads are fast; the harm was the post-await side effects, not the read itself).
- **Queue vs cancel for concurrent chat sends.** Concurrent LLM requests behind one logical agent are standardly serialized through a queue rather than cancel-and-replace; cancel-on-new-input is a voice/barge-in pattern, wrong for multi-user text chat where each message deserves an answer (background on streaming/queueing architectures: https://thefrontkit.com/blogs/ai-chat-ui-best-practices, https://dev.to/pockit_tools/the-complete-guide-to-streaming-llm-responses-in-web-applications-from-sse-to-real-time-ui-3534). A bounded FIFO with overflow-drop+alert avoids unbounded latency pileup on slow local models. Batch-merging queued messages into one prompt was considered (fewer model calls) and rejected for this phase: it changes the conversation-history shape (`[Name]: message` prefixing happens main-side per send, `ai-service.ts:633`) and complicates per-message `actingCharacterId`; the simple serial drain preserves existing semantics exactly. A merge option can be revisited if queue latency proves painful in play.
- **Why queueing ships as default, not opt-in.** The current behavior destroys a player's in-progress answer with zero feedback — classified bug/high in the 2026-06-10 audit. A toggle restoring "silently discard partial answers" has no legitimate use; the conservative cancel-path semantics (explicit cancel clears the queue) keep the DM in control.

## Test plan

- **05B/05F:** `src/renderer/src/stores/use-ai-dm-store.test.ts` — updated `window.api.ai` stubs (unsubscribe-returning mocks); new cases: per-listener cleanup, double-registration independence, queue enqueue/drain-on-done/drain-on-error/cap/clear-on-cancel/clear-on-reset, solo regression.
- **05C:** `src/renderer/src/hooks/use-game-effects.test.ts` — rewritten from import-smoke to `renderHook` coverage: identity-change survival, enable-toggle re-registration, unmount cleanup.
- **05D:** new `src/renderer/src/components/ui/OllamaManagement.test.tsx` and `src/renderer/src/components/campaign/AiProviderSetup.test.tsx` — register-once-per-mount, unsubscribe-on-unmount, no accumulation across remounts.
- **05E:** new `src/main/ai/ai-service-file-read-cancel.test.ts` — cancel-during-file-read (no restream, no conversation pollution, `getActiveStreamCount() === 0`), uncancelled control, cancel-during-web-search; plus the existing `src/main/ai/ai-service-web-search-approval.test.ts` re-run to guard the step-3 reorder.
- **End-of-phase 4-gate** (INSTRUCTIONS.md rule 5): `npm run lint`, `npx tsc --noEmit -p tsconfig.web.json`, `npx tsc --noEmit -p tsconfig.node.json`, full `npx vitest run` — all from `dnd-app/`. No Pi code is touched, so no pytest leg.

## Acceptance criteria

1. A `saveCampaign`-induced campaign-object identity change during an active AI session leaves all six stream listeners attached (F1 closed); proven by the 05C tests.
2. Every `ai.onX` preload wrapper returns a working unsubscribe; `removeAllAiListeners` still exists but is no longer the only removal path (F2 closed).
3. Mount→unmount cycles of OllamaManagement and AiProviderSetup leave zero residual `AI_OLLAMA_PROGRESS` listeners (F3/F4 closed); proven by the 05D tests.
4. `cancelChat` during a FILE_READ leaves `activeStreams` empty (no TTL-sweep orphan) and appends nothing to the conversation; the WEB_SEARCH path appends no dangling assistant message on mid-search cancel (F5 closed); proven by the 05E tests.
5. A player message arriving during an in-flight stream is queued (bounded FIFO, cap 5) and answered after the current reply completes; no path calls `cancelStream` because a new message arrived (F6 closed); proven by the 05F tests.
6. End-of-phase 4-gate fully green; one phase commit + push per INSTRUCTIONS.md rule 5; plan moved to `completed/` per rule 8.

## Out of scope

- Scene-prep poll-cap `isTyping` wedge, error-retry `conv.clear()` wipe, scene-prep Cancel IPC — **PHASE-06** (same `use-game-effects.ts` effect; 05C only restructures registration).
- `reset()`/`initFromCampaign()` approval-queue/timer clearing, `webSearchStatus` deadlock, approval-overlay fixes — **PHASE-04** (same store file).
- Rendering `fileReadStatus` in a component + clearing it on stream end/cancel (renderer) — **PHASE-14**.
- Dead `ai-stream-handler.ts`/`finalizeAiResponse` pipeline removal — **PHASE-08** (must keep `StreamHandlerDeps`/`PendingWebSearchApproval` type exports available to `ai-service.ts`).
- `useGameEffects` whole-store subscription perf (`useAiDmStore()` with no selector re-rendering GameLayout per token) — perf/medium audit finding, owned by no listener-lifecycle concern here; logged scope belongs with **PHASE-10**/UI-perf work; do not refactor store selectors in this phase.
- Restream context loss after FILE_READ/WEB_SEARCH (`conv.getMessagesForApi('')` empty context block) — **PHASE-06** owns the post-FILE_READ/WEB_SEARCH restream context fix; 05E touches the same function but only adds abort guards.
- Cloud whole-stream timeout, `listOllamaModels` timeout, provider client fixes — **PHASE-03**.
- `onIndexProgress` having no renderer consumer — observability surface, **PHASE-14**.

## Completed

- **05A (2026-06-11):** `src/preload/index.ts` — all 8 `ai.onX` wrappers (onStreamChunk/Done/Error/IndexProgress/OllamaProgress/StreamFileRead/StreamWebSearch/StreamStatus) rewritten to the named-listener pattern returning `() => ipcRenderer.removeListener(channel, listener)` (mirrors `update.onStatus`); `removeAllAiListeners` kept unchanged. `src/preload/index.d.ts` — the 8 signatures' return types `void` → `() => void`. tsc node+web clean.
- **05B (2026-06-11):** `use-ai-dm-store.ts setupListeners` collects the 6 per-listener unsubscribes and returns a loop-cleanup (was `removeAllAiListeners()` global nuke) — re-registration is now safe (prereq for 05C). `use-ai-dm-store.test.ts`: `onX` stubs now return `vi.fn()` unsubscribes; new "setupListeners per-listener cleanup (05B)" describe (cleanup fires each unsubscribe once + never calls removeAllAiListeners; cleaning up the first registration leaves the second's handlers live). tsc web clean; 35 store tests green.
- **05C (2026-06-11):** `use-game-effects.ts` — added `campaignRef` latest-ref (assign-on-render, mirrors `activeMapRef`) + `aiDmEnabled` scalar; NEW dedicated listener effect `useEffect(() => isDM && aiDmEnabled ? aiDmStore.setupListeners() : undefined, [isDM, aiDmEnabled, aiDmStore.setupListeners])`. The one-shot init effect dropped its `setupListeners()` call + `cleanupListeners()` from cleanup (now only `cleanupTimers()`), reads `currentCampaign = campaignRef.current` (initFromCampaign/configureAiFromCampaign) and `campaignRef.current.players` (getCharacterIds), and its dep array dropped the bare `campaign` object → `[isDM, campaign.id, aiDmEnabled, initFromCampaign, setupListeners]` — so a `saveCampaign`-driven identity change no longer tears listeners down (F1). `use-game-effects.test.ts` rewritten from import-smoke to `renderHook` (happy-dom, all hook deps mocked): A identity-change survival, B enable-toggle re-registration, C unmount cleanup. tsc web clean; 4 tests green.
- **05D (2026-06-11):** `OllamaManagement.tsx` — deleted `progressListenerSet` ref + false "cleanup handled by removeAllAiListeners" comment; the `onOllamaProgress` effect now `return`s the 05A unsubscribe (deps `[]`). `AiProviderSetup.tsx` — deleted `progressListenerRegistered` ref + its registration block from the detect effect; new dedicated `onOllamaProgress` effect returning the unsubscribe (deps `[enabled, provider]`). Removed now-unused `useRef` imports from both. New colocated tests `OllamaManagement.test.tsx` + `AiProviderSetup.test.tsx` (register-once-per-mount, unsubscribe-on-unmount, one-live-listener across mount→unmount→mount). tsc web clean; 6 tests green.
- **05E (2026-06-11):** `ai-service.ts` — `restreamConversation` now early-returns if `abortController.signal.aborted` BEFORE `activeStreams.set` (no re-registration of a cancelled stream → no TTL-sweep orphan); FILE_READ branch adds `if (signal.aborted) return` right after `readRequestedFile` (no post-cancel `addMessage` pollution, no restream); WEB_SEARCH branch moved `conv.addMessage('assistant', strippedText)` off the pre-branch position onto the two commit paths (rejected: before the denied message; approved: after the post-search abort guard) so a mid-search cancel leaves no dangling assistant turn. Exported `getActiveStreamCount()`. New `ai-service-file-read-cancel.test.ts` (cancel-during-file-read → 1 stream call, count unchanged, count 0 active; uncancelled control → restream + appends; cancel-during-web-search → no dangling assistant, no restream). Existing web-search-approval tests re-run green (guards the reorder). tsc node clean; 6 tests green across 2 files.
- **05F (2026-06-11):** `app-constants.ts` — `AI_MESSAGE_QUEUE_MAX = 5`. Store: new `QueuedAiMessage` type + `queuedMessages: QueuedAiMessage[]` state (snapshot at enqueue time); `sendMessage` now ENQUEUES (bounded, overflow→`messageQueueFull` alert) instead of cancelling the in-flight reply when `activeStreamId || isTyping` (F6 — no path calls `cancelStream` because a new message arrived); private `drainQueue()` pops FIFO and re-sends, called from `handleDone`, `handleError`, and both synchronous send-failure paths; `cancelStream`, the safety-timeout body, `reset()`, and both `initFromCampaign` branches clear the queue (cancel/timeout emit `queuedMessagesDiscarded` when non-empty). New i18n keys `notify.aiDmStore.messageQueued`/`messageQueueFull`/`queuedMessagesDiscarded` (en+es). `use-ai-dm-store.test.ts` "message queue during in-flight stream (05F)" describe (enqueue-no-cancel, drain-on-done FIFO w/ args preserved, drain-on-error, cap-at-5, clear-on-cancel, clear-on-reset, solo-regression). tsc web clean; 42 store tests green.
