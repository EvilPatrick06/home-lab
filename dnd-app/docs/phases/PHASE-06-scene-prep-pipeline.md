# PHASE-06 — Scene-prep pipeline correctness (cancel, retry, poll, restream)

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Make the solo/AI scene-preparation pipeline honest end-to-end: Cancel on the
scene-prep page actually aborts the main-process stream and cleans up its state
(today it is a renderer-only no-op while the model keeps generating); a retry
after a failed prep no longer wipes real conversation history; the in-game
scene-status poll no longer silently abandons at its cap leaving the typing
indicator wedged on; the campaign-not-found branch of the prep page stops being
a dead end with a wrong message; and continuation streams after
`[FILE_READ]`/`[WEB_SEARCH]` keep the original `[GAME STATE]`/character/rules
context block instead of rebuilding the system prompt empty (which also
silently downgraded combat continuations to 'general' mode).

## Dependencies & cross-phase notes

- **Depends on: nothing** (PHASE-INDEX row 06: no dependencies; phases 1–19 are
  independent and front-loaded).
- **Coordinate with PHASE-04** on `src/renderer/src/stores/use-ai-dm-store.ts` —
  PHASE-04 adds `webSearchStatus`/`fileReadStatus` clearing to `cancelStream`,
  the safety-timeout handler, and `reset()`. This phase adds a `sceneStreamId`
  field + `cancelScenePrep` action to the same store and extends `reset()`.
  Whichever lands second must merge `reset()` additions, not replace them.
- **Coordinate with PHASE-05** on `src/renderer/src/hooks/use-game-effects.ts` —
  PHASE-05 fixes the AI-init effect's listener-deregistration on campaign
  object identity change (`:211-216,395-405`). This phase edits the scene-status
  poll *inside the same effect* (`:315-380`). The edits are in disjoint blocks
  but the effect body is shared; re-verify line offsets if PHASE-05 landed first.
- **Coordinate with PHASE-07** on `src/main/ai/ai-service.ts` — PHASE-07 touches
  the conversation save/restore paths (`saveConversation` auto-save at
  `:883-885`, `AI_RESTORE_CONVERSATION` in `ai-handlers.ts`). This phase calls
  `saveConversation` from the new `cancelScenePrep` but does not change the
  save/restore handlers themselves.
- **Coordinate with PHASE-08** — PHASE-08 deletes the dead
  `src/main/ai/ai-stream-handler.ts` pipeline. `ai-service.ts:19` imports only
  the *types* `PendingWebSearchApproval` and `StreamHandlerDeps` from it; this
  phase changes the signature of ai-service's own private
  `handleStreamCompletion` (the live copy), NOT the dead exported one. No file
  conflict, but PHASE-08 must relocate those type definitions when it deletes
  the module.
- **PHASE-12** owns the i18n sweep of hardcoded store strings (including
  `'Scene preparation failed.'` at `use-ai-dm-store.ts:420`). This phase adds
  *new* translated keys for the campaign-not-found branch but does not convert
  existing hardcoded strings.

## Verified findings

All citations verified 2026-06-10 against the working tree (branch `master`,
worktree `ai-p6-roadmap`). All paths below are relative to `dnd-app/` unless
noted.

### F-1 — Cancelling solo scene prep cancels nothing; the main-process stream keeps generating (bug/medium)

`ScenePrepPage.handleCancel` (`src/renderer/src/pages/ScenePrepPage.tsx:82-86`):

```ts
const handleCancel = useCallback(() => {
  void useAiDmStore.getState().cancelStream()
  useAiDmStore.setState({ sceneStatus: 'idle', sceneError: null })
  navigate(`/campaign/${campaignId}`, { replace: true })
}, [campaignId, navigate])
```

- `cancelStream()` (`src/renderer/src/stores/use-ai-dm-store.ts:384-400`) only
  acts when `activeStreamId` is non-null — and during scene prep it is always
  null: the store's `prepareScene` (`use-ai-dm-store.ts:402-414`) discards the
  `AI_PREPARE_SCENE` IPC response entirely (`await window.api.ai.prepareScene(
  campaignId, characterIds)` at `:410` — the resolved `{ success, streamId }`
  is never read), and `checkSceneStatus` (`:416-422`) reads only
  `result.status`/`result.error`, dropping `result.streamId` which the main
  process returns on every poll (`getSceneStatus`,
  `src/main/ai/ai-service.ts:985-991`). So the prep stream's id is delivered to
  the renderer on the initial invoke AND on every poll, and discarded both
  times.
- Main keeps `scenePrepStatus.get(campaignId) === { status: 'preparing',
  streamId }` (set at `ai-service.ts:981`). The model keeps generating; on
  completion the orphan stream's `onDone` pins `{ status: 'ready' }`
  (`ai-service.ts:972-974`) and the completed narration is auto-saved into the
  conversation (`ai-service.ts:881-885`), so the next Play short-circuits to
  'ready' via the `conv.getMessageCount() > 0` check (`ai-service.ts:957-960`)
  and never regenerates — even when the user cancelled specifically to switch
  model/provider.
- If the stream were aborted via the existing `AI_CANCEL_STREAM` channel alone
  (`cancelChat`, `ai-service.ts:925-932`; handler
  `src/main/ipc/ai-handlers.ts:242-245`), `scenePrepStatus` would wedge at
  `'preparing'` forever (only `prepareScene`'s callbacks and the
  campaign-delete cascade write it), and the conversation would retain the
  dangling user prompt added by `startChat` at `ai-service.ts:633-634` — on
  abort, `streamWithRetry` returns silently (`signal.aborted` check at
  `ai-service.ts:187,197`) without invoking `onDone`/`onError`, so neither
  scene-status callback fires.
- The ONLY existing `scenePrepStatus.delete` is the campaign-delete cascade:
  `removeConversation` (`ai-service.ts:485-488`, delete at `:487`).
- The scene-prep prompt string is duplicated verbatim in two processes:
  `ai-service.ts:965` (main, `prepareScene` request) and
  `use-ai-dm-store.ts:430` (renderer, `setScene` fallback):
  `'The adventure begins. Set the scene for the party. Describe the opening location and atmosphere.'`
- The provider abort is real: `ollamaStreamChat` passes the caller's abort
  signal into `fetch` (`src/main/ai/ollama-client.ts:90-97`,
  `signal: combinedSignal`), so aborting closes the HTTP request.

Verification commands:

```bash
cd dnd-app
sed -n '82,86p' src/renderer/src/pages/ScenePrepPage.tsx
sed -n '384,422p' src/renderer/src/stores/use-ai-dm-store.ts        # cancelStream no-op + dropped streamId
sed -n '943,991p' src/main/ai/ai-service.ts                          # prepareScene + getSceneStatus
grep -n "scenePrepStatus.delete" src/main/ai/ai-service.ts           # only :487 (removeConversation)
grep -rn "The adventure begins" src/ | grep -v test                  # the duplicated prompt
grep -n "AI_CANCEL_SCENE" src/shared/ipc-channels.ts                 # (pre-fix: no match)
```

### F-2 — `prepareScene` error-retry calls `conv.clear()` BEFORE the message-count check — wipes real history, then auto-save persists the wipe (bug/medium)

`src/main/ai/ai-service.ts:943-960`:

```ts
export function prepareScene(campaignId: string, characterIds: string[]): string | null {
  const existing = scenePrepStatus.get(campaignId)
  if (existing && (existing.status === 'preparing' || existing.status === 'ready')) return existing.streamId

  const conv = getConversation(campaignId)
  // S-2 retry — a failed prep leaves a dangling user message ...
  if (existing?.status === 'error') {
    conv.clear()                       // ← wipes messages AND summaries (conversation-manager.ts:61-64)
  }

  if (conv.getMessageCount() > 0) {    // ← count check happens AFTER the wipe
    scenePrepStatus.set(campaignId, { status: 'ready', streamId: null })
    return null
  }
  ...
```

Deterministic loss scenario: prep fails (`scenePrepStatus` = `'error'`) → user
enters the game anyway (the fallback at `use-game-effects.ts:386-390` calls
`setScene`, which succeeds and populates the conversation) → user chats → user
returns to lobby/prepare, which auto-calls `prepareScene` on mount
(`ScenePrepPage.tsx:32-53`) → status is still the stale `'error'` →
`conv.clear()` deletes the whole populated conversation → the retry stream's
completion auto-saves the emptied conversation over the saved file
(`ai-service.ts:881-885`). `ConversationManager.clear()`
(`src/main/ai/conversation-manager.ts:61-64`) drops `messages` and `summaries`.

The original intent (the "S-2" comment) was only to drop the *dangling prep
user message* (a failed prep leaves `[user: SCENE_PREP_PROMPT]` with no
assistant reply, which would otherwise short-circuit the retry to 'ready').

Verification commands:

```bash
cd dnd-app
sed -n '943,960p' src/main/ai/ai-service.ts
sed -n '61,64p' src/main/ai/conversation-manager.ts
sed -n '881,885p' src/main/ai/ai-service.ts        # completion auto-save that persists the wipe
```

### F-3 — In-game scene-status poll abandons silently at its cap; `isTyping` wedged on, late-finishing scene never posts (bug/high)

`src/renderer/src/hooks/use-game-effects.ts:315-380` (inside the AI-init effect
that runs when the host enters the game while prep status is `'preparing'`):

- `:319` sets `isTyping: true` and posts a one-time "setting the scene…" chat
  note; `:335-371` polls `getSceneStatus` every `SCENE_POLL_INTERVAL_MS`
  (1000 ms, `src/renderer/src/constants/app-constants.ts:60`), loading the
  conversation + posting the narration on `'ready'` and surfacing `'error'`.
- `:372-378` — the cap:

  ```ts
  // Safety: stop polling after 60s
  pollTimeout = setTimeout(() => {
    if (pollInterval) {
      clearInterval(pollInterval)
      pollInterval = null
    }
  }, SCENE_POLL_TIMEOUT_MS)
  ```

  The comment says "60s" but `SCENE_POLL_TIMEOUT_MS = 330_000`
  (`app-constants.ts:61` — 5.5 min, deliberately above the main process's 300 s
  prefill window per the comment at `app-constants.ts:56-59`). When the cap
  fires it clears the interval WITHOUT resetting `isTyping`, without setting
  `sceneStatus`, and without posting anything. If prep finishes after the cap,
  the conversation is never loaded and the narration never posts; the typing
  indicator — and the broadcast `ai:typing` state that clients receive via the
  effect at `use-game-effects.ts:501-505` — stays on until the user happens to
  send a message.
- The poll callback is an `async` arrow inside `setInterval` with no try/catch;
  a rejected `getSceneStatus` IPC is an unhandled rejection each tick.
- A status of `'idle'` (possible after this phase's F-1 fix cancels prep from
  another surface) keeps polling forever with `isTyping` still true — only
  `'ready'` and `'error'` are handled.

Verification commands:

```bash
cd dnd-app
sed -n '315,380p' src/renderer/src/hooks/use-game-effects.ts
sed -n '55,61p' src/renderer/src/constants/app-constants.ts
sed -n '501,505p' src/renderer/src/hooks/use-game-effects.ts   # ai:typing broadcast to clients
grep -rn "SCENE_POLL_TIMEOUT_MS" src/renderer/src --include="*.ts*" | grep -v test  # used only in use-game-effects
```

### F-4 — ScenePrepPage campaign-not-found branch shows the wrong message and is a dead end (UX/low)

`src/renderer/src/pages/ScenePrepPage.tsx:95-101`:

```tsx
if (!campaign) {
  return (
    <div className="...">
      {t('pages.lobbyPage.scenePrepFailed')}
    </div>
  )
}
```

- The message is "Scene prep failed" (`src/renderer/src/i18n/locales/en.json:5619`)
  — nothing was prepped; the campaign simply isn't in the store (stale deep
  link, deleted campaign, or the store still loading).
- No Back/Cancel/menu navigation exists in this branch — the user is stuck on
  a full-screen message.
- `useCampaignStore` exposes a `loading: boolean` flag
  (`src/renderer/src/stores/use-campaign-store.ts:59,83,86-87`) that the page
  ignores; `App.tsx:90` triggers `loadCampaigns()` on app mount, and sibling
  pages re-trigger it on their own mount (`LobbyPage.tsx:150`,
  `InGamePage.tsx:37`) — ScenePrepPage does neither, so during the initial
  async load the not-found branch flashes.
- Route: `/prepare/:campaignId` (`src/renderer/src/App.tsx:296-303`); main menu
  is `/` (`App.tsx:232`). Existing page i18n keys live under
  `pages.lobbyPage.*` (`en.json:5619-5627`, `es.json:5619-5627`).

Verification commands:

```bash
cd dnd-app
sed -n '95,101p' src/renderer/src/pages/ScenePrepPage.tsx
grep -n '"scenePrepFailed"' src/renderer/src/i18n/locales/en.json
grep -n "loading" src/renderer/src/stores/use-campaign-store.ts | head -5
grep -n "loadCampaigns()" src/renderer/src/pages/LobbyPage.tsx src/renderer/src/pages/InGamePage.tsx src/renderer/src/App.tsx
```

### F-5 — Continuation streams after [FILE_READ]/[WEB_SEARCH] rebuild the system prompt with an EMPTY context block (bug/high)

- The original request builds the full context once in `startChat`
  (`src/main/ai/ai-service.ts:654-663`): `buildContext(...)` (game state,
  character data, retrieved rule chunks, creatures — signature at
  `src/main/ai/context-builder.ts:164-171`) plus a `[PROVIDER CONTEXT]` blurb,
  passed to `conv.getMessagesForApi(context + providerContext)` at `:663`.
- `handleStreamCompletion` (`ai-service.ts:735-923`) handles `[FILE_READ]`
  (`:806-832`) and `[WEB_SEARCH]` (`:835-861`) by appending the
  assistant text + tool result to the conversation and calling
  `restreamConversation` (`:753-803`) — which rebuilds the API messages with
  **`conv.getMessagesForApi('')`** at `:760`. The entire
  `[GAME STATE]`/`[CHARACTER DATA]`/retrieved-rules block is gone on every
  continuation: the model emits grid coordinates, HP numbers, and token actions
  blind.
- Compounding: `getMessagesForApi` derives the prompt *mode* from the context
  block — `contextBlock?.includes('Initiative:')` selects `'combat'` vs
  `'general'` and gates `COMBAT_TACTICS_PROMPT`
  (`src/main/ai/conversation-manager.ts:92-96`); with `''` every combat
  continuation silently downgrades to 'general'. The planar/toolbox context
  gates (`:76-91`) are likewise lost.
- `handleStreamCompletion` recurses through `restreamConversation`'s `onDone`
  (`:771-781`) with `fileReadDepth + 1`, so a multi-tool turn loses context on
  *every* level. The function is private to `ai-service.ts` (the exported
  near-duplicate in `ai-stream-handler.ts` is dead code — PHASE-08 owns its
  removal) and already threads a `request` param + a defaulted `deps` param
  (`:751`), so adding a `contextBlock` parameter is a contained change.

Verification commands:

```bash
cd dnd-app
sed -n '654,663p' src/main/ai/ai-service.ts
sed -n '753,760p' src/main/ai/ai-service.ts          # getMessagesForApi('')
sed -n '76,96p' src/main/ai/conversation-manager.ts  # mode + content gates driven by contextBlock
grep -n "getMessagesForApi" src/main/ai/ai-service.ts
```

## Sub-phases

Order keeps the tree green: 06A is main-process-only and additive; 06B consumes
it from the renderer; 06C/06D are main-process behavior fixes with their own
tests; 06E/06F are renderer-only.

### 06A — Main-process scene-prep cancellation (`cancelScenePrep` + `AI_CANCEL_SCENE`)

**Objective:** give the main process a real cancel operation for scene prep —
abort the stream, clear the status map, and remove the prep exchange from the
conversation — exposed over a new IPC channel.

**Files:**
- `src/shared/constants.ts`
- `src/shared/ipc-channels.ts`
- `src/main/ai/conversation-manager.ts` (+ colocated test)
- `src/main/ai/ai-service.ts` (+ colocated test)
- `src/main/ipc/ai-handlers.ts` (+ colocated test)
- `src/preload/index.ts`, `src/preload/index.d.ts`

**Steps:**
1. `src/shared/constants.ts` — add:
   ```ts
   // Canonical opening-scene prompt. Lives in shared/ because the main process
   // (ai-service prepareScene + cancelScenePrep) and the renderer fallback
   // (use-ai-dm-store setScene) must send the IDENTICAL string — cancel/retry
   // cleanup matches on it verbatim.
   export const SCENE_PREP_PROMPT =
     'The adventure begins. Set the scene for the party. Describe the opening location and atmosphere.'
   ```
2. `src/shared/ipc-channels.ts` — add `AI_CANCEL_SCENE: 'ai:cancel-scene',`
   directly after `AI_GET_SCENE_STATUS` (line 76).
3. `src/main/ai/conversation-manager.ts` — add two small methods to
   `ConversationManager`:
   ```ts
   /** Remove the last message iff it is a user message with exactly this content. */
   removeTrailingUserMessage(content: string): boolean {
     const last = this.messages[this.messages.length - 1]
     if (last && last.role === 'user' && last.content === content) {
       this.messages.pop()
       return true
     }
     return false
   }

   /**
    * Clear the conversation iff it consists solely of the scene-prep exchange:
    * [user: prompt] or [user: prompt, assistant: anything]. Never touches a
    * conversation with real history.
    */
   clearScenePrepExchange(prompt: string): boolean {
     const onlyPrep =
       this.messages.length >= 1 &&
       this.messages.length <= 2 &&
       this.messages[0].role === 'user' &&
       this.messages[0].content === prompt
     if (onlyPrep) {
       this.clear()
       return true
     }
     return false
   }
   ```
4. `src/main/ai/ai-service.ts`:
   - Import `SCENE_PREP_PROMPT` from `../../shared/constants` and replace the
     inline string in `prepareScene`'s request (`:965`) with it.
   - Add the export (place after `getSceneStatus`, `:985-991`):
     ```ts
     /**
      * Cancel an in-flight scene preparation (or discard a finished one that the
      * user cancelled before entering the game). Aborts the stream, drops the
      * status entry so the next Play regenerates, and removes the prep exchange
      * from the conversation — real history is never touched. Idempotent.
      */
     export function cancelScenePrep(campaignId: string): { success: true } {
       const entry = scenePrepStatus.get(campaignId)
       if (entry?.streamId) cancelChat(entry.streamId)
       scenePrepStatus.delete(campaignId)
       const conv = conversations.get(campaignId)
       if (conv) {
         // In-flight cancel: drop the dangling user prompt. Cancel-after-complete:
         // drop the whole [prompt, scene] exchange so the next Play regenerates
         // (the user typically cancelled to change model/provider).
         const trimmed = conv.removeTrailingUserMessage(SCENE_PREP_PROMPT)
         const cleared = conv.clearScenePrepExchange(SCENE_PREP_PROMPT)
         if (trimmed || cleared) {
           // Keep disk consistent — a completed prep already auto-saved.
           saveConversation(campaignId, conv.serialize()).catch((err) =>
             logToFile('WARN', '[AI] Failed to save conversation after scene cancel:', String(err))
           )
         }
       }
       return { success: true }
     }
     ```
     Use `conversations.get(...)` (NOT `getConversation`) so cancelling a
     campaign with no manager doesn't instantiate one.
5. `src/main/ipc/ai-handlers.ts` — register after the `AI_GET_SCENE_STATUS`
   handler (`:290-292`):
   ```ts
   handle(IPC_CHANNELS.AI_CANCEL_SCENE, async (_event, campaignId: string) => {
     try {
       // cancelScenePrep can write the conversation file — validate the id
       // like the conversation/memory handlers do (sanitizeCampaignId, :92-103).
       return aiService.cancelScenePrep(sanitizeCampaignId(campaignId))
     } catch (error) {
       return { success: false, error: (error as Error).message }
     }
   })
   ```
6. `src/preload/index.ts` — add after `getSceneStatus` (`:89`):
   `cancelScene: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_CANCEL_SCENE, campaignId),`
7. `src/preload/index.d.ts` — add to `AiAPI` after `getSceneStatus`
   (`:204-206`):
   `cancelScene: (campaignId: string) => Promise<{ success: boolean; error?: string }>`

**Tests (colocated):**
- `conversation-manager.test.ts`: `removeTrailingUserMessage` removes only an
  exact trailing user match (assistant-last → false; different content →
  false; empty → false). `clearScenePrepExchange` clears `[prompt]` and
  `[prompt, assistant]`, refuses `[prompt, assistant, user…]` (length 3) and
  `[other-user-msg]`.
- `ai-service.test.ts`: `cancelScenePrep` on an unknown campaign returns
  `{ success: true }` without throwing; after `prepareScene` started a stream,
  `cancelScenePrep` makes `getSceneStatus` return `'idle'`.
- `ai-handlers.test.ts`: add `cancelScenePrep: vi.fn(() => ({ success: true }))`
  to the `vi.mock('../ai/ai-service', …)` export map (the factory mock lists
  exports explicitly — a missing entry makes the handler call `undefined`);
  assert `AI_CANCEL_SCENE` registers, delegates with a valid UUID, and returns
  an error envelope for a non-UUID id.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json`, then
`npx vitest run src/main/ai/conversation-manager.test.ts src/main/ai/ai-service.test.ts src/main/ipc/ai-handlers.test.ts`.

**Acceptance:** new channel registered in `ipc-channels.ts`; `cancelScenePrep`
aborts + deletes the status entry + trims only prep-exchange messages; preload
+ d.ts expose `ai.cancelScene`; all three test files green.

### 06B — Renderer cancel wiring (`sceneStreamId` + `cancelScenePrep` action + ScenePrepPage)

**Objective:** Cancel on the prep page actually invokes the main-process
cancel; the store stops discarding the prep stream id.

**Files:**
- `src/renderer/src/stores/use-ai-dm-store.ts` (+ colocated test)
- `src/renderer/src/pages/ScenePrepPage.tsx`

**Steps:**
1. `use-ai-dm-store.ts`:
   - Add `sceneStreamId: string | null` to `AiDmState` (next to `sceneStatus`,
     `:79-82`) and initial state (`null`, near `:177-178`). Keep it SEPARATE
     from `activeStreamId` — the stream-event listeners (`setupListeners`,
     `:472-601`) gate on `activeStreamId`, and scene prep deliberately has no
     renderer listeners (`prepareScene` passes a no-op `onChunk`,
     `ai-service.ts:971`); reusing `activeStreamId` would let scene-prep events
     cross-talk with chat-stream state.
   - `prepareScene` (`:402-414`): capture the invoke result —
     ```ts
     const result = await window.api.ai.prepareScene(campaignId, characterIds)
     set({ sceneStreamId: result?.streamId ?? null })
     ```
   - `checkSceneStatus` (`:416-422`): also set
     `sceneStreamId: result.streamId ?? null` (keeps the id fresh if the page
     mounted after prep started).
   - New action `cancelScenePrep: (campaignId: string) => Promise<void>`
     (declare in `AiDmState` next to `prepareScene`, `:129`):
     ```ts
     cancelScenePrep: async (campaignId) => {
       set({ sceneStatus: 'idle', sceneError: null, sceneStreamId: null })
       try {
         await window.api.ai.cancelScene(campaignId)
       } catch (err) {
         logger.error('[ai-dm] cancelScene failed', err)
       }
     },
     ```
     (Renderer state resets first so the UI never blocks on the IPC.)
   - `reset()` (`:446-470`): add `sceneStreamId: null` to the reset object.
2. `ScenePrepPage.tsx` `handleCancel` (`:82-86`): replace the body with
   ```ts
   void useAiDmStore.getState().cancelScenePrep(campaignId as string)
   navigate(`/campaign/${campaignId}`, { replace: true })
   ```
   (The store action already resets `sceneStatus`/`sceneError`; the explicit
   `setState` and the no-op `cancelStream()` call go away.) `handleRetry`
   (`:88-93`) stays as-is — after 06C the main process trims only the dangling
   prompt on an error-status retry.

**Tests:** `use-ai-dm-store.test.ts` — extend the `window.api.ai` stub
(`:12-32`) with `cancelScene: vi.fn().mockResolvedValue({ success: true })`
and update `prepareScene`'s stub to resolve `{ success: true, streamId:
'scene-1' }`; assert (a) `prepareScene` stores `sceneStreamId === 'scene-1'`,
(b) `cancelScenePrep` invokes `window.api.ai.cancelScene` with the campaign id
and resets `sceneStatus`/`sceneError`/`sceneStreamId`, (c) `reset()` clears
`sceneStreamId`.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json`, then
`npx vitest run src/renderer/src/stores/use-ai-dm-store.test.ts`.

**Acceptance:** clicking Cancel during prep results in one `AI_CANCEL_SCENE`
invoke; no renderer path discards the prep stream id anymore; store test green.

### 06C — Error-retry trims the dangling prompt instead of wiping the conversation

**Objective:** a retry after a failed prep never destroys real history.

**Files:** `src/main/ai/ai-service.ts` (+ colocated test).

**Steps:**
1. In `prepareScene` (`:952-954`) replace
   ```ts
   if (existing?.status === 'error') {
     conv.clear()
   }
   ```
   with
   ```ts
   // S-2 retry — a failed prep leaves a dangling user prompt (the stream errored
   // before any assistant reply); remove ONLY that prompt so a retry re-narrates.
   // A populated conversation (user entered the game and chatted after the
   // failure) is left intact and short-circuits to 'ready' below.
   if (existing?.status === 'error') {
     conv.removeTrailingUserMessage(SCENE_PREP_PROMPT)
   }
   ```
   Resulting matrix (all flow into the existing `getMessageCount() > 0` check
   at `:957-960`):
   - fresh failed prep (`[prompt]`) → trimmed → count 0 → regenerates;
   - failure, then in-game history (`[prompt, …, assistant]`) → trailing
     message is not the prompt → no-op → count > 0 → status `'ready'`, history
     preserved;
   - failure, then a user chat that also failed (`[prompt, user-msg]`) →
     trailing content ≠ prompt → no-op → `'ready'` — safe (no loss; the user
     already has a conversation).

**Tests:** `ai-service.test.ts` — using the existing harness: seed a manager
via `getConversationManager(id)`; case 1: add only the prep prompt as a user
message, force `scenePrepStatus` to error by calling `prepareScene` with a
failing provider (or set up via the exported API: call `prepareScene`, drive
the mocked provider's `onError`, then call `prepareScene` again) and assert the
message count went to 0 before the new stream's user message; case 2: seed
`[prompt-user, assistant, user, assistant]`, set error status the same way,
retry, and assert all 4 messages survive and `getSceneStatus(id).status ===
'ready'`.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json`, then
`npx vitest run src/main/ai/ai-service.test.ts`.

**Acceptance:** `conv.clear()` no longer appears in `prepareScene`
(`grep -n "conv.clear()" src/main/ai/ai-service.ts` → no match); both retry
test cases green.

### 06D — Continuation streams keep the original context block

**Objective:** `[FILE_READ]`/`[WEB_SEARCH]` continuations re-send the same
context the original turn had, restoring game state and the combat-mode gate.

**Files:** `src/main/ai/ai-service.ts`; new test
`src/main/ai/ai-service-restream-context.test.ts`.

**Steps:**
1. In `startChat` (`:654-663`), bind the assembled block to a local:
   ```ts
   const contextBlock = context + providerContext
   const { systemPrompt, messages } = await conv.getMessagesForApi(contextBlock)
   ```
2. Add `contextBlock: string` as a parameter of the private
   `handleStreamCompletion` (insert before `fileReadDepth`, keeping the
   defaulted `deps` last, `:735-752`), and pass it at both call sites:
   `startChat`'s `onDone` (`:687-697`) and the recursive call inside
   `restreamConversation`'s `onDone` (`:771-781`).
3. In `restreamConversation` (`:760`) replace
   `await conv.getMessagesForApi('')` with
   `await conv.getMessagesForApi(contextBlock)`.
4. Do NOT re-run `buildContext` on continuation: it would re-trigger retrieval
   keyed on the original message, mutate the module-global token breakdown, and
   add latency; the captured block is the same data the turn started with,
   which is strictly better than empty. (Re-sending the full system context on
   every iteration of a tool loop is the standard agent pattern — see Research
   notes.)

**Tests:** `ai-service-restream-context.test.ts` — clone the harness pattern of
`src/main/ai/ai-service-web-search-approval.test.ts` (mocked `electron`,
mocked `./conversation-manager` class, mocked provider via
`./provider-registry`/`./ollama-client`), but:
- mock `./context-builder`'s `buildContext` to resolve a sentinel such as
  `'[GAME STATE]\nInitiative: 12\n[/GAME STATE]'`;
- record every `getMessagesForApi` argument in the mocked manager;
- mock `./file-reader` so the first stream completion carries a `[FILE_READ]`
  tag and resolves file content;
- drive `startChat` → first `onDone` with the tag → assert the SECOND
  `getMessagesForApi` call received a string containing the sentinel (not
  `''`).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json`, then
`npx vitest run src/main/ai/ai-service-restream-context.test.ts src/main/ai/ai-service-web-search-approval.test.ts`
(the second confirms the existing approval flow still passes with the new
parameter threaded through).

**Acceptance:** `grep -n "getMessagesForApi('')" src/main/ai/ai-service.ts` →
no match; new test green; existing web-search approval tests green.

### 06E — Scene-status poll: soft notice instead of silent abandonment

**Objective:** the in-game poll never strands `isTyping`; a scene that finishes
after the old cap still posts.

**Files:**
- `src/renderer/src/hooks/use-game-effects.ts` (+ colocated test)
- `src/renderer/src/constants/app-constants.ts`

**Steps:**
1. `app-constants.ts` (`:56-61`): rename `SCENE_POLL_TIMEOUT_MS` →
   `SCENE_POLL_SLOW_NOTICE_MS` (same value `330_000`) and rewrite the comment:
   it is now the threshold for a one-time "still working" notice, NOT a poll
   kill switch; it stays above the main process's 300 s prefill window so the
   notice doesn't fire during a normal cold prefill. Verify the only consumer:
   `grep -rn "SCENE_POLL_TIMEOUT_MS" src/ --include="*.ts*"` → only
   `use-game-effects.ts:7,378` (plus the constant itself) pre-rename.
2. `use-game-effects.ts` `'preparing'` branch (`:315-380`):
   - Wrap the interval callback body in `try { … } catch { /* keep polling; a
     transient IPC failure must not kill the poll */ }`.
   - Handle `'idle'`: clear the interval + timeout, `useAiDmStore.setState({
     isTyping: false, sceneStatus: 'idle' })` — prep was cancelled elsewhere
     (06A/06B); stop indicating work that isn't happening. Do not post a chat
     message.
   - Replace the abandon-cap (`:372-378`) with a soft notice that does NOT
     clear the interval:
     ```ts
     // Soft notice only — polling continues until ready/error/idle or unmount.
     // (Previously this cap silently killed the poll: isTyping stayed wedged on
     // and a scene finishing after the cap never posted.)
     pollTimeout = setTimeout(() => {
       addChatMessage({
         id: `ai-dm-scene-slow-${campaign.id}`,
         senderId: 'ai-dm',
         senderName: 'AI Dungeon Master',
         content:
           '⏳ *Still setting the scene — a large local model can take several minutes on the first response.*',
         timestamp: Date.now(),
         isSystem: true
       })
     }, SCENE_POLL_SLOW_NOTICE_MS)
     ```
     The interval itself is cleared by the `'ready'`/`'error'`/`'idle'`
     branches and by the effect cleanup (`cleanupTimers`, `:223-236`, returned
     at `:395-398`), so nothing leaks on unmount. (System chat strings in this
     hook are currently raw English — e.g. the existing prep note at `:328-329`;
     converting them to i18n is PHASE-12's sweep. Keep the new string
     consistent with its neighbors.)
3. Update the stale `// Safety: stop polling after 60s` comment (it describes
   the deleted behavior).

**Tests:** `use-game-effects.test.ts` — with fake timers and a mocked
`window.api.ai.getSceneStatus` sequence `preparing → preparing → ready`
spanning the notice threshold: assert (a) polling continued past
`SCENE_POLL_SLOW_NOTICE_MS`, (b) the conversation loaded and `isTyping` ended
false, (c) the slow-notice chat message was added exactly once; plus an
`'idle'` case asserting the poll stops and `isTyping` is false. Follow the
file's existing harness conventions for mounting the hook.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json`, then
`npx vitest run src/renderer/src/hooks/use-game-effects.test.ts`.

**Acceptance:** no code path clears the poll without also resolving
`isTyping`; `grep -rn "SCENE_POLL_TIMEOUT_MS" src/` → no matches (rename
complete); hook tests green.

### 06F — ScenePrepPage campaign-not-found: correct message, loading state, exit path

**Objective:** the `!campaign` branch distinguishes "still loading" from "not
found", says so accurately, and always offers a way out.

**Files:**
- `src/renderer/src/pages/ScenePrepPage.tsx`
- `src/renderer/src/i18n/locales/en.json`, `src/renderer/src/i18n/locales/es.json`
- `src/renderer/src/i18n/generated-keys.ts` (regenerated, not hand-edited)
- new `src/renderer/src/pages/ScenePrepPage.test.tsx`

**Steps:**
1. i18n — add under `pages.lobbyPage` (alongside the existing prep keys at
   `en.json:5619-5627` / `es.json:5619-5627`):
   - `"prepCampaignNotFound": "Campaign not found. It may have been deleted."`
     / es: `"No se encontró la campaña. Puede que haya sido eliminada."`
   - `"prepBackToMenu": "Back to main menu"` / es: `"Volver al menú principal"`
   Then run `npm run i18n:gen-keys` to regenerate
   `src/renderer/src/i18n/generated-keys.ts` — the drift gate
   (`generated-keys.test.ts`) and `locale-parity.test.ts` both fail otherwise.
2. `ScenePrepPage.tsx`:
   - Subscribe to `const campaignsLoading = useCampaignStore((s) => s.loading)`.
   - Mirror the sibling-page pattern (`LobbyPage.tsx:150`, `InGamePage.tsx:37`):
     add a mount effect `useEffect(() => { void useCampaignStore.getState()
     .loadCampaigns() }, [])` so a direct deep link self-heals.
   - Replace the `!campaign` branch (`:95-101`):
     ```tsx
     if (!campaign) {
       if (campaignsLoading) {
         return (
           <div className="flex h-full w-full items-center justify-center bg-surface p-8">
             <div
               className="h-10 w-10 animate-spin rounded-full border-4 border-accent/30 border-t-accent"
               aria-hidden="true"
             />
           </div>
         )
       }
       return (
         <div className="flex h-full w-full flex-col items-center justify-center gap-5 bg-surface p-8 text-center">
           <p className="text-muted">{t('pages.lobbyPage.prepCampaignNotFound')}</p>
           <Button variant="secondary" onClick={() => navigate('/', { replace: true })}>
             {t('pages.lobbyPage.prepBackToMenu')}
           </Button>
         </div>
       )
     }
     ```
3. New `ScenePrepPage.test.tsx` (follow the conventions of the existing page
   tests, e.g. `LobbyPage.test.tsx`: `MemoryRouter` at `/prepare/:campaignId`,
   stubbed `window.api`, real zustand stores seeded via `setState`):
   - unknown campaign + `loading:false` → not-found text renders and the
     back button navigates to `/`;
   - unknown campaign + `loading:true` → spinner, no not-found text;
   - known AI campaign + `sceneStatus:'preparing'` → clicking Cancel calls the
     store's `cancelScenePrep` (spy) — closes the loop on 06B from the UI side.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json`, then
`npx vitest run src/renderer/src/pages/ScenePrepPage.test.tsx src/renderer/src/i18n/locale-parity.test.ts src/renderer/src/i18n/generated-keys.test.ts`.

**Acceptance:** the not-found branch never shows "Scene prep failed"; both new
keys exist in both locales; key-union regenerated; page test green.

## Research notes

- **Cancel-by-id over a side IPC channel is the correct Electron pattern.**
  Electron has no native way to abort an in-flight `ipcRenderer.invoke` — the
  feature request is still open
  ([electron#41025](https://github.com/electron/electron/issues/41025)), as is
  the request to propagate `AbortSignal` across IPC
  ([electron#31737](https://github.com/electron/electron/issues/31737)); both
  threads converge on the userland workaround of keying the operation by an id
  and sending the cancel on a separate channel, which is exactly what the
  codebase already does for chat streams (`AI_CANCEL_STREAM` + main-side
  `AbortController` map). 06A extends the same pattern, keyed by `campaignId`
  (the natural key — `scenePrepStatus` is per-campaign and one prep runs per
  campaign), rather than introducing a second stream-id plumbing path. Two-way
  `invoke`/`handle` usage per the official IPC tutorial:
  [electronjs.org/docs/latest/tutorial/ipc](https://www.electronjs.org/docs/latest/tutorial/ipc).
- **Aborting actually stops provider work.** `AbortController.abort()` cancels
  both the fetch and consumption of its body stream
  ([MDN: AbortController.abort()](https://developer.mozilla.org/en-US/docs/Web/API/AbortController/abort)),
  and `ollama-client.ts:90-97` already passes the signal into `fetch`. Caveat:
  Ollama cancels generation when the client connection closes for most models,
  but there is an open upstream issue where some runners keep processing after
  disconnect ([ollama#11889](https://github.com/ollama/ollama/issues/11889);
  general cancellation discussion
  [ollama#2876](https://github.com/ollama/ollama/issues/2876)). The app-side
  cleanup (status map + conversation trim) is correct regardless — worst case
  the server burns a few tokens into a closed socket.
- **Alternative considered for F-1: capture the streamId into `activeStreamId`
  and reuse `cancelStream()`** (the audit's minimal suggestion). Rejected:
  `activeStreamId` gates all six stream listeners in `setupListeners`
  (`use-ai-dm-store.ts:472-601`); scene prep intentionally has no renderer
  listeners, and overloading the field risks scene events mutating chat-stream
  state (and vice versa) plus conflicts with PHASE-04's cancel/reset hygiene
  work in the same store. A separate `sceneStreamId` + campaign-keyed
  `AI_CANCEL_SCENE` keeps the two lifecycles disjoint, and main-side cleanup
  (status map + conversation) was needed in either design.
- **Re-sending the full system context on tool-loop continuations is standard
  agent practice.** The system prompt + environment context is re-assembled and
  re-sent on every iteration of a tool loop; tool results are appended as
  observations while the conditioning context stays constant (see the agent-loop
  write-up [dev.to/cloudx/forget-the-hype-agents-are-loops](https://dev.to/cloudx/forget-the-hype-agents-are-loops-1n3i)
  and opencode's prompt pipeline docs
  [deepwiki.com/sst/opencode/2.3-prompt-processing-pipeline](https://deepwiki.com/sst/opencode/2.3-prompt-processing-pipeline)).
  06D implements exactly this: capture once, replay on each continuation.
  Rebuilding via `buildContext` per continuation was rejected (extra retrieval
  latency keyed on a stale query + mutation of the module-global token
  breakdown mid-stream).
- **Polling with effect-scoped cleanup, not wall-clock kill switches.** React
  guidance for intervals is to tie their lifetime to the effect (clear on
  cleanup/unmount) and cancel outdated async work rather than abandoning it on
  a timer ([refine.dev useEffect cleanup guide](https://refine.dev/blog/useeffect-cleanup/);
  [MDN: AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)).
  The 1 Hz `getSceneStatus` invoke is trivially cheap, so 06E removes the
  kill-cap entirely (its job is taken by the explicit `'idle'`/`'error'`
  terminal states plus unmount cleanup) and demotes the threshold to a UX
  notice.

## Test plan

Per sub-phase (cheap, targeted — per INSTRUCTIONS.md rule 5):

| Sub-phase | Test files |
|---|---|
| 06A | `src/main/ai/conversation-manager.test.ts` (new cases), `src/main/ai/ai-service.test.ts` (new cases), `src/main/ipc/ai-handlers.test.ts` (new cases + mock entry) |
| 06B | `src/renderer/src/stores/use-ai-dm-store.test.ts` (new cases + stub entries) |
| 06C | `src/main/ai/ai-service.test.ts` (retry matrix cases) |
| 06D | `src/main/ai/ai-service-restream-context.test.ts` (NEW file), re-run `src/main/ai/ai-service-web-search-approval.test.ts` |
| 06E | `src/renderer/src/hooks/use-game-effects.test.ts` (new cases) |
| 06F | `src/renderer/src/pages/ScenePrepPage.test.tsx` (NEW file), `src/renderer/src/i18n/locale-parity.test.ts` + `generated-keys.test.ts` (existing gates, must stay green after the key additions + regen) |

End-of-phase 4-gate (ONCE, after 06F):

```bash
cd dnd-app
npm run lint
npx tsc --noEmit -p tsconfig.web.json
npx tsc --noEmit -p tsconfig.node.json
npx vitest run
```

No Pi code is touched — no pytest leg.

## Acceptance criteria

1. Cancelling scene prep (ScenePrepPage Cancel) aborts the main-process stream,
   deletes the campaign's `scenePrepStatus` entry, and removes the prep
   exchange from the conversation; the next Play regenerates the scene.
   `AI_CANCEL_SCENE` is registered in `ipc-channels.ts`, handled in
   `ai-handlers.ts` (id-sanitized), and exposed through preload + `index.d.ts`.
2. A scene-prep retry from `'error'` status never deletes non-prep
   conversation history; `conv.clear()` no longer appears in `prepareScene`.
3. Continuation streams after `[FILE_READ]`/`[WEB_SEARCH]` call
   `getMessagesForApi` with the original turn's context block;
   `getMessagesForApi('')` no longer appears in `ai-service.ts`; combat
   continuations retain `'combat'` mode.
4. The in-game scene poll has no silent-abandon path: it ends only on
   `'ready'`, `'error'`, `'idle'`, or unmount, always resolving `isTyping`;
   after the slow-notice threshold a single "still working" chat note posts and
   polling continues; `SCENE_POLL_TIMEOUT_MS` is renamed to
   `SCENE_POLL_SLOW_NOTICE_MS` everywhere.
5. ScenePrepPage with an unknown campaign shows a loading spinner while the
   campaign store is loading, otherwise an accurate "Campaign not found"
   message with a working back-to-menu button; both new i18n keys exist in
   `en.json` AND `es.json` and the key union is regenerated.
6. End-of-phase 4-gate green; one commit; plan moved to `completed/`.

## Out of scope

- Web-search approval modal deadlock + `webSearchStatus`/`fileReadStatus`
  clearing in `cancelStream`/timeout/`reset()` — **PHASE-04**.
- AI stream-listener lifecycle (campaign-identity effect cleanup, preload
  per-listener unsubscribe, FILE_READ-cancel re-registration leak + post-cancel
  conversation pollution in `handleStreamCompletion`'s cancel window) —
  **PHASE-05** (06D threads a parameter through that function but does not
  change its cancel semantics).
- `AI_RESTORE_CONVERSATION` in-memory refresh + `AI_LOAD_CONVERSATION`
  restore-on-read race — **PHASE-07**.
- Deleting the dead `ai-stream-handler.ts`/`finalizeAiResponse` pipeline (and
  relocating its `StreamHandlerDeps`/`PendingWebSearchApproval` types that
  `ai-service.ts:19` imports) — **PHASE-08**.
- Converting existing hardcoded English in `use-ai-dm-store.ts`
  (`'Scene preparation failed.'` at `:420`, etc.) and the raw system-chat
  strings in `use-game-effects.ts` to i18n — **PHASE-12**.
- `actingCharacterId` missing from `AiChatRequestSchema`
  (`src/shared/ipc-schemas.ts:24-31` — zod strips it from every validated chat
  request) — **PHASE-11** (`actingCharacterId` end-to-end wiring).
- UUID-sanitizing the remaining AI IPC handlers that pass `campaignId` into
  filesystem paths (`AI_PREPARE_SCENE`, `AI_SYNC_*`, etc.) — tracked in the
  security log; this phase sanitizes only its NEW channel.
- Ollama `num_ctx`/token-budget reconciliation — **PHASE-01**. Cloud stream
  inactivity timeouts — **PHASE-03**. Scene-boundary summarization —
  **PHASE-26**.

## Completed

(Filled during execution per INSTRUCTIONS.md rule 17 — one line per sub-phase with file:line citations.)
