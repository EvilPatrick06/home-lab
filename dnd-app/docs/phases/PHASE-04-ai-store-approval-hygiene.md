# PHASE-04 — AI store + approval hygiene

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Make the AI DM's approval surfaces (web-search approval, DM-actions ruling approval, stat-mutation approval, DM alert tray) honest, leak-free, and recoverable. Today a dead stream can wedge the entire game UI behind a full-screen web-search modal until app restart; leaving a campaign leaves live auto-reject timers and stale approval UI that fire/surface in the NEXT campaign; a second AI response silently destroys an undecided ruling; an approved ruling that fails executes into the void with zero feedback; "Dismiss" secretly logs a DM override; two of the four approval overlays unmount in DM player-view so requests silently auto-reject; and the mutation-approval card the DM reads to make decisions shows raw type strings for 12 of the AI's stat-change types, colors healing red, truncates the reason to 120px, has no Reject All, and is silent to screen readers. This phase fixes all of it in the renderer store and the four components, with no main-process behavior changes (the 30s web-search auto-reject policy is surfaced, not altered).

## Dependencies & cross-phase notes

**Prerequisites: none.** Phase 04 is in the independent 01–19 block (PHASE-INDEX.md ordering rule). Nothing here requires another phase.

**Other phases touching the same files — keep this phase's edits scoped to the regions named in the sub-phases:**

- `src/renderer/src/stores/use-ai-dm-store.ts` is the hottest shared file in the set:
  - **PHASE-05** owns `sendMessage`'s cancel-any-active-stream-on-new-message behavior (queueing) and the `setupListeners`/`removeAllAiListeners` lifecycle. Phase 04 does NOT change when streams are cancelled — only what gets *cleared* when a cancel/timeout/done/error happens.
  - **PHASE-06** owns `prepareScene`/`checkSceneStatus` (scene-prep streamId capture + AI_CANCEL_SCENE). Do not touch those actions.
  - **PHASE-08** owns the dead `ai-renderer-actions` pipeline; `handleDone`'s `parseRendererActions`/`stripActionTags` call stays as-is here.
  - **PHASE-10** owns `handleDone` stream-preview tag-stripping changes. Phase 04 only *adds* status-clearing keys to `handleDone`'s `set(...)`.
  - **PHASE-12** owns i18n-ing the PRE-EXISTING hardcoded strings in this store (`'AI response timed out'` at :153, `'DM'`/`'[DM Override] AI ruling rejected'` at :217-218, `'Scene preparation failed.'` at :420). Phase 04 must NOT convert those (rule 12 — log/leave for the owning phase) but every NEW user-facing string Phase 04 adds is i18n'd from day one (en + es).
- `src/renderer/src/components/game/GameLayout.tsx`: PHASE-05 (listener effect deps) and PHASE-10/13 also edit it. Phase 04 touches only lines 877–879 and 1230–1236 (overlay mount gates).
- `src/main/ai/ai-service.ts`: PHASE-03/05/06 rework streaming/timeout internals. Phase 04's only main-process edit is replacing the local `WEB_SEARCH_APPROVAL_TIMEOUT_MS` literal with an import from `src/shared/constants.ts` (value unchanged).
- **PHASE-14** owns rendering a `fileReadStatus` indicator. Phase 04 *clears* `fileReadStatus` on cancel/timeout/done/error/reset/init (it is in the same stale-state class as `webSearchStatus`); PHASE-14 must not re-add clearing — only the indicator component.
- **PHASE-13** owns the `<ModalScaffold>` extraction (former 33c). Phase 04 implements dialog semantics locally per component (mirroring the existing `src/renderer/src/components/ui/Modal.tsx` pattern) and does NOT create a shared scaffold.
- `en.json`/`es.json`: PHASE-12 does a wording sweep. Phase 04 adds new keys only; it does not rewrite existing ones.

## Verified findings

All claims below were re-verified against the live tree on 2026-06-10. Each subsection lists the verification commands; re-run them before implementing (INSTRUCTIONS.md rule 3).

### F1 — Web-search approval modal can deadlock the entire game UI until app restart (bug/high)

`WebSearchApprovalPrompt` renders a full-screen `inset-0` backdrop at `Z.MODAL` (= 60, `src/renderer/src/constants/z-index.ts:30`) whenever `webSearchStatus.status === 'pending_approval'`:

- Gate: `src/renderer/src/components/game/overlays/WebSearchApprovalPrompt.tsx:17` — `if (webSearchStatus?.status !== 'pending_approval') return null`
- Backdrop: `WebSearchApprovalPrompt.tsx:27-32` (`fixed inset-0 ... style={{ zIndex: Z.MODAL }} role="presentation"`)

Nothing clears `webSearchStatus` when the stream dies. In `src/renderer/src/stores/use-ai-dm-store.ts`:

- `cancelStream` (`:384-400`) sets only `activeStreamId/isTyping/streamingText/safetyTimeoutId` (`:391-396`) — and only when `activeStreamId` is truthy; `webSearchStatus`, `fileReadStatus`, `streamStatus` are untouched.
- The inactivity safety-timeout handler (`rearmSafetyTimeout`'s `setTimeout` body, `:148-160`) sets `isTyping/lastError/activeStreamId/streamingText/safetyTimeoutId` only.
- `reset()` (`:446-470`) omits `webSearchStatus` and `fileReadStatus` from its `set(...)` (`:454-469`).
- `handleDone` (`:511-554`, set at `:542-552`) and `handleError` (`:556-574`, set at `:564-571`) also omit both — so even a *normally* ending stream leaves the last web-search/file-read status stale.
- The ONLY writer of `webSearchStatus: null` is `sendMessage` (`:344-346`).
- After a cancel/timeout sets `activeStreamId: null`, incoming `AI_STREAM_WEB_SEARCH` events are dropped by the `data.streamId === state.activeStreamId` gate in `handleWebSearch` (`:583-588`) — the flag can never flip via events.

`webSearchStatus` lives in the global zustand store, so a GameLayout remount re-renders the wedged modal; the modal covers the chat input, so the one recovery path (`sendMessage`) is pointer-unreachable. Only a full app restart recovers. The modal also has no Escape handler, no `role="dialog"`, no focus management (see F7).

Verification:

```bash
cd dnd-app
# cancelStream / timeout / reset / handleDone / handleError never write webSearchStatus:
grep -n "webSearchStatus" src/renderer/src/stores/use-ai-dm-store.ts
#   → writers: :183 (init), :345 (sendMessage), :586 (handleWebSearch). No others.
sed -n '384,400p;446,470p;148,160p' src/renderer/src/stores/use-ai-dm-store.ts
# Modal gate + z-index:
sed -n '12,32p' src/renderer/src/components/game/overlays/WebSearchApprovalPrompt.tsx
grep -n "MODAL" src/renderer/src/constants/z-index.ts
```

### F2 — `reset()`/`initFromCampaign()` don't clear the approval queues — live auto-reject timers and stale approval UI cross campaigns (bug/high)

- `reset()` (`use-ai-dm-store.ts:446-470`) leaves `pendingActions` and `pendingMutations` intact and never calls `clearTimeout` on the per-set auto-reject timers.
- Each queued mutation set arms a 60s auto-reject `setTimeout` in `queueMutations` (`:230-237`, `AI_MUTATIONS_AUTO_REJECT_MS = 60_000` at `src/renderer/src/constants/app-constants.ts:40`). The timer body re-reads the store and fires `pushDmAlert('warning', t('notify.aiDmStore.mutationsAutoRejected'))` if the set is still present — after `reset()` (which does NOT remove the set) the timer finds it and fires the alert in whatever campaign the user is in next.
- `initFromCampaign` (`:278-321`) likewise skips both queues, `webSearchStatus`, and `fileReadStatus`: its `set(...)` at `:287-300` writes `enabled/paused/messages/stream fields/last*` only. Its early-return branch for AI-disabled campaigns (`:280-283`) sets ONLY `{ enabled: false }` — stale approval UI from campaign A survives entering AI-disabled campaign B too (RulingApprovalModal/MutationApprovalPanel mount on queue contents, not on `enabled`).
- `reset()` is called on leave-game (`src/renderer/src/hooks/use-game-handlers.ts:124`); `initFromCampaign` from `ScenePrepPage.tsx:35`, `LobbyPage.tsx:64`, `use-game-effects.ts:239`.

Verification:

```bash
cd dnd-app
sed -n '278,321p;446,470p;225,241p' src/renderer/src/stores/use-ai-dm-store.ts
grep -rn "useAiDmStore.getState().reset()\|aiDmStore.initFromCampaign\|store.initFromCampaign" src/renderer/src --include="*.ts*" | grep -v test
grep -n "AI_MUTATIONS_AUTO_REJECT_MS" src/renderer/src/constants/app-constants.ts
```

### F3 — A second AI response silently overwrites an undecided `pendingActions` set (bug/high)

With `dmApprovalRequired` on (toggle: `DMTabPanel.tsx:224-229`; default `false`), `executeDmActions`'s non-bypass branch replaces the single `pendingActions` slot wholesale:

- `src/renderer/src/services/game-action-executor.ts:194-206` — `aiStore.setPendingActions({ id: crypto.randomUUID(), text: ..., actions, statChanges: [] })`. A prior undecided set is dropped with no chat note, no alert, no record; the open `RulingApprovalModal` just changes contents under the DM mid-deliberation.
- Store slot: `use-ai-dm-store.ts:58` (`pendingActions: PendingActionSet | null`), setter at `:191`.
- `PendingActionSet` shape: `:35-40` (`id`, `text`, `actions`, `statChanges`). Note `statChanges` is ALWAYS `[]` at the only production enqueue site — stat changes are queued separately through `queueMutations`.

Verification:

```bash
cd dnd-app
sed -n '186,210p' src/renderer/src/services/game-action-executor.ts
grep -rn "setPendingActions" src/renderer/src --include="*.ts*" | grep -v test
#   → definition + interface in use-ai-dm-store.ts, single production caller in game-action-executor.ts
```

### F4 — `approvePendingActions` discards the ExecutionResult — post-approval failures produce ZERO feedback (bug/high)

- `use-ai-dm-store.ts:193-208` — `approvePendingActions` dynamically imports the executor and calls `executeDmActions(pendingActions.actions, true)` at `:201`, ignoring the returned `{ executed, failed }` (`executeDmActions` returns `ExecutionResult` — `game-action-executor.ts:194`).
- The auto-execute path DOES surface failures: `src/renderer/src/hooks/use-game-effects.ts:470-486` posts a system chat line per `result.failed` entry (`"AI DM action failed: <action> — <reason>"`). The DM-approval path posts nothing: the DM clicks Approve, invalid actions (`filterValidActions` rejections, executor throws) vanish, and the chat-history feedback the AI sees on the auto path never exists.

Verification:

```bash
cd dnd-app
sed -n '193,208p' src/renderer/src/stores/use-ai-dm-store.ts
sed -n '469,487p' src/renderer/src/hooks/use-game-effects.ts
grep -n "export function executeDmActions" src/renderer/src/services/game-action-executor.ts
```

### F5 — RulingApprovalModal "Dismiss" (and Escape/backdrop) logs a DM override to chat despite its tooltip promising not to (bug/medium)

- `src/renderer/src/components/game/modals/utility/RulingApprovalModal.tsx:19` — `const dismiss = (): void => rejectPendingActions('')`. Escape (`:21-31`), backdrop click (`:90-92`), and the Dismiss button (`:132-141`) all route here.
- `rejectPendingActions` (`use-ai-dm-store.ts:210-223`) unconditionally posts the system chat line `[DM Override] AI ruling rejected` (`:218`).
- The Dismiss button's `title` is `t('game.rulingApprovalModal.dismissTitle')` = `"Dismiss without applying or logging an override"` (`src/renderer/src/i18n/locales/en.json:2936`; es.json has the matching `"Descartar sin aplicar ni registrar una anulación"`). Dismiss is functionally identical to Override minus the note text.
- (Adversarially refuted during the audit and NOT a finding: "Escape/backdrop leaves a stale dmNote that surfaces later" — the asymmetry exists but the stale note cannot reach a subsequent approval.)

Verification:

```bash
cd dnd-app
sed -n '17,33p;130,160p' src/renderer/src/components/game/modals/utility/RulingApprovalModal.tsx
sed -n '210,223p' src/renderer/src/stores/use-ai-dm-store.ts
grep -n "dismissTitle" src/renderer/src/i18n/locales/en.json src/renderer/src/i18n/locales/es.json
```

### F6 — DM approval overlays inconsistently gated `isDM` vs `effectiveIsDM` — web-search/ruling approvals vanish in player-view and silently auto-reject (bug/high)

In `src/renderer/src/components/game/GameLayout.tsx` (`effectiveIsDM = isDM && viewMode === 'dm'` at `:278`):

- `:877` — `{isDM && <DmAlertTray />}` (visible while the DM previews as a player)
- `:878` — `{isDM && <MutationApprovalPanel />}` (ditto)
- `:879` — `{effectiveIsDM && <WebSearchApprovalPrompt />}` (UNMOUNTS in player view)
- `:1230-1236` — `{effectiveIsDM && aiDmStore.pendingActions && (<RulingApprovalModal/>)}` (UNMOUNTS in player view)

Consequence: a web-search request arriving while the DM is in player view shows NO UI anywhere and is hard auto-rejected after 30s in the main process — `WEB_SEARCH_APPROVAL_TIMEOUT_MS = 30_000` at `src/main/ai/ai-service.ts:143`, timeout armed in `waitForWebSearchApproval` (`ai-service.ts:522-543`, `setTimeout` resolving `false` at `:530-532`). A pending ruling set similarly sits invisible (until F3's overwrite or forever).

Verification:

```bash
cd dnd-app
grep -n "DmAlertTray />\|MutationApprovalPanel />\|WebSearchApprovalPrompt />\|RulingApprovalModal" src/renderer/src/components/game/GameLayout.tsx
grep -n "effectiveIsDM = " src/renderer/src/components/game/GameLayout.tsx
sed -n '142,145p;522,545p' src/main/ai/ai-service.ts
```

### F7 — WebSearchApprovalPrompt: no Escape/keyboard close, no countdown despite the 30s hard auto-reject, `success:false` IPC result never surfaced, no dialog semantics (UX/medium)

- `WebSearchApprovalPrompt.tsx:19-25` — `decide()` calls `window.api.ai.approveWebSearch(streamId, approved)` with only a `.finally()`; the result is discarded. Main returns `{ success: false, error: 'No pending web search request for this stream.' }` when the request already timed out/aborted (`ai-service.ts:544-550`) — in that case no `'rejected'` status event is coming (the timeout already sent it, or the stream died), and if the modal is still mounted it wedges (F1 overlap) with zero explanation.
- No countdown: main auto-rejects at 30s (`ai-service.ts:143`; on timeout the stream resumes with the denial block and `sendWebSearchStatus(..., 'rejected')` fires at `:846`) — the modal "disappears mid-deliberation with no explanation". The store's `webSearchStatus` (`use-ai-dm-store.ts:87`) carries `{ query, status, streamId }` — no timestamp, so the component cannot render a countdown today.
- No Escape handler, no `role="dialog"`/`aria-modal`/labelling, no focus trap, no initial focus (`WebSearchApprovalPrompt.tsx:27-32` is `role="presentation"`). Repo precedent for all of these exists in `src/renderer/src/components/ui/Modal.tsx:26-86` (Escape, Tab trap, initial focus, focus restore, `role="dialog"` + `aria-modal`).
- i18n: `game.webSearchApproval` has only `approve/description/reject/title` keys (en + es verified).
- Note for implementers: the existing store test pins the exact `webSearchStatus` shape — `use-ai-dm-store.test.ts` ("web-search status persists the streamId") asserts `toEqual({ streamId, query, status })` and must be updated when a timestamp field is added.

Verification:

```bash
cd dnd-app
sed -n '1,64p' src/renderer/src/components/game/overlays/WebSearchApprovalPrompt.tsx
sed -n '544,565p;838,853p' src/main/ai/ai-service.ts
python3 -c "import json; d=json.load(open('src/renderer/src/i18n/locales/en.json')); print(sorted(d['game']['webSearchApproval'].keys()))"
grep -n "toEqual({ streamId" src/renderer/src/stores/use-ai-dm-store.test.ts
```

### F8 — MutationApprovalPanel can't label 12 of the AI's stat-change types (UX/medium)

`changeLabel()`'s switch (`src/renderer/src/components/game/overlays/MutationApprovalPanel.tsx:11-95`) covers the original set but falls through to the bare `type` string (`default: return type` at `:92-93`) for everything added since. All 12 missing types are live in the zod schema (`src/main/ai/ai-schemas.ts`):

| type | schema line | payload fields (for label content) |
|---|---|---|
| `npc_attitude` | :182 | `name`, `attitude`, `reason` |
| `creature_set_resistance` | :244 | `targetLabel`, `damageTypes[]`, `replace?`, `reason` |
| `creature_set_vulnerability` | :252 | `targetLabel`, `damageTypes[]`, `replace?`, `reason` |
| `creature_set_immunity` | :260 | `targetLabel`, `damageTypes[]`, `replace?`, `reason` |
| `creature_expend_spell_slot` | :268 | `targetLabel`, `level`, `count?`, `reason` |
| `creature_restore_spell_slot` | :276 | `targetLabel`, `level`, `count?`, `reason` |
| `reduce_exhaustion` | :284 | `characterName?`, `reason` (reduces by exactly 1 — `stat-mutations.ts:402-410`) |
| `add_exhaustion` | :290 | `characterName?`, `levels`, `reason` |
| `set_equipped` | :297 | `name`, `equipped` |
| `set_proficiency` | :304 | `category` (weapon/armor/tool/language), `name`, `proficient` |
| `set_skill_proficiency` | :312 | `skill`, `proficient`, `expertise?` |
| `set_save_proficiency` | :320 | `ability`, `proficient` |

The approval card — the thing the DM reads to decide — shows e.g. `set_skill_proficiency` un-i18n'd with no value details. No `game.mutationApprovalPanel.*` keys exist for any of the 12 (en + es key sets verified identical, 32 keys each).

Verification:

```bash
cd dnd-app
sed -n '11,95p' src/renderer/src/components/game/overlays/MutationApprovalPanel.tsx
grep -n "literal('npc_attitude'\|literal('reduce_exhaustion'\|literal('add_exhaustion'\|literal('set_equipped'\|literal('set_proficiency'\|literal('set_skill_proficiency'\|literal('set_save_proficiency'\|literal('creature_set_" src/main/ai/ai-schemas.ts
python3 -c "import json; d=json.load(open('src/renderer/src/i18n/locales/en.json')); print(sorted(d['game']['mutationApprovalPanel'].keys()))"
```

### F9 — MutationApprovalPanel colors creature HEALING red (UX/low)

`changeColor()` (`MutationApprovalPanel.tsx:98-112`) returns red for anything starting `creature_` (`type.startsWith('creature_')` is the FIRST clause at `:99`) before any beneficial check runs — `creature_heal`, `creature_restore_spell_slot`, and `creature_remove_condition` render as harmful red.

Verification: `sed -n '97,112p' src/renderer/src/components/game/overlays/MutationApprovalPanel.tsx`

### F10 — MutationApprovalPanel: mutation reason truncated at `max-w-[120px]` with no tooltip (UX/low)

`MutationApprovalPanel.tsx:161-163` — `<span className="text-gray-500 ml-auto truncate max-w-[120px]">({String(m.reason)})</span>`. The `reason` field is mandatory on most AI stat-change schemas and is the DM's main basis for approve/reject; anything beyond a few words is unreadable and there is no `title` attribute.

Verification: `sed -n '156,166p' src/renderer/src/components/game/overlays/MutationApprovalPanel.tsx`

### F11 — MutationApprovalPanel offers "Approve All" but no "Reject All" (UX/low)

`MutationApprovalPanel.tsx:196-207` renders only the Approve All button (shown when `pendingMutations.length > 1`). Mass rejection means clicking Reject per card while each card's 60s auto-reject countdown runs. The store has `approveAllMutations` (`use-ai-dm-store.ts:269-274`) but no `rejectAllMutations`.

Verification: `sed -n '195,220p' src/renderer/src/components/game/overlays/MutationApprovalPanel.tsx; grep -n "rejectAllMutations" src/renderer/src/stores/use-ai-dm-store.ts` (no hits)

### F12 — MutationApprovalPanel appears without screen-reader announcement (a11y/low)

The fixed-position panel root (`MutationApprovalPanel.tsx:196`, `fixed bottom-4 right-4 z-50 w-72`) has no `role="status"`/`aria-live`, and cards auto-reject on the 60s timer a non-sighted DM never hears about. Important implementation constraint (research-verified, see Research notes): a live region generally must exist in the DOM BEFORE its content changes to be announced — this component returns `null` when empty (`:193`), so slapping `aria-live` on its root is unreliable on mount-with-content. The app already has a persistent global live region: `src/renderer/src/components/ui/ScreenReaderAnnouncer.tsx` exports `announce(text)` (mounted at app root via `App.tsx`; renders the region only when `useAccessibilityStore.screenReaderMode` is on — that is the app's intended SR switch). The store already imports component-module helpers (`pushDmAlert` from `DmAlertTray`, `use-ai-dm-store.ts:2`), so calling `announce` from store code follows precedent.

Verification:

```bash
cd dnd-app
sed -n '186,197p' src/renderer/src/components/game/overlays/MutationApprovalPanel.tsx
grep -rn "ScreenReaderAnnouncer" src/renderer/src/App.tsx
sed -n '1,25p' src/renderer/src/components/ui/ScreenReaderAnnouncer.tsx
```

### F13 — DmAlertTray expanded panel lacks Escape/outside-click close + `aria-expanded` (UX/low)

`src/renderer/src/components/game/overlays/DmAlertTray.tsx`: badge button at `:89-103` toggles `expanded` with no `aria-expanded`/`aria-controls`/`aria-haspopup`; the expanded panel (`:106-160`) closes only by clicking the badge again — no Escape, no outside-click dismissal. (WAI-ARIA disclosure pattern requires `aria-expanded` on the trigger; `aria-controls` optional.)

Verification: `sed -n '86,110p' src/renderer/src/components/game/overlays/DmAlertTray.tsx`

### Supporting facts (current state an executor needs)

- `webSearchStatus` consumers: ONLY `WebSearchApprovalPrompt.tsx` — safe to extend the shape. `fileReadStatus` has ZERO component consumers (PHASE-14 adds one).
- IPC plumbing for approval: renderer `window.api.ai.approveWebSearch(streamId, approved)` → preload `src/preload/index.ts:216-217` (`AI_WEB_SEARCH_APPROVE`) → handler `src/main/ipc/ai-handlers.ts:248-255` → `aiService.approveWebSearch` (`ai-service.ts:544-550`). The channel already exists in `src/shared/ipc-channels.ts`; NO new IPC channels are needed in this phase.
- Shared-constants convention: main imports `'../../shared/constants'` (`src/main/ipc/index.ts:5`); renderer re-exports shared constants through `src/renderer/src/constants/app-constants.ts:26`.
- Test conventions: `vitest.config.ts` uses `environment: 'node'` with `setupFiles: ['./src/test-setup.ts']` (initializes i18n → `useT()` resolves English); DOM component tests opt in with a leading `// @vitest-environment happy-dom` pragma and `@testing-library/react` (pattern: `src/renderer/src/components/game/cloud/CloudStatusPanel.test.tsx:1-2`).
- Existing tests to extend: `src/renderer/src/stores/use-ai-dm-store.test.ts` (14 tests; stubs `window.api.ai` globally and captures listener callbacks), `RulingApprovalModal.test.tsx` / `WebSearchApprovalPrompt.test.tsx` / `DmAlertTray.test.tsx` (import-only smoke tests today), `game-action-executor.test.ts` (source-grep style). No `MutationApprovalPanel.test.tsx` exists — create it.
- `STREAM_SAFETY_TIMEOUT_MS = 330_000` (`app-constants.ts:50`); `Z.MODAL = 60`; `notify.aiDmStore.*` is the established namespace for store-emitted alert strings.

## Sub-phases

### 04A — Stream-status lifecycle clearing (deadlock fix, F1)

**Objective:** `webSearchStatus`/`fileReadStatus`/`streamStatus` can never outlive their stream. Share the 30s web-search timeout constant.

**Files:** `src/shared/constants.ts`, `src/main/ai/ai-service.ts`, `src/renderer/src/constants/app-constants.ts`, `src/renderer/src/stores/use-ai-dm-store.ts`, `src/renderer/src/stores/use-ai-dm-store.test.ts`.

**Steps:**

1. `src/shared/constants.ts` — add:
   ```ts
   // How long the main process waits for the DM to approve an AI web-search request
   // before hard auto-rejecting it (ai-service.ts waitForWebSearchApproval). Shared so
   // the renderer approval prompt can render an accurate countdown.
   export const WEB_SEARCH_APPROVAL_TIMEOUT_MS = 30_000
   ```
2. `src/main/ai/ai-service.ts:143` — delete the local `const WEB_SEARCH_APPROVAL_TIMEOUT_MS = 30_000` and import the constant from `'../../shared/constants'` (value unchanged → zero behavior change).
3. `src/renderer/src/constants/app-constants.ts` — extend the existing shared re-export (line 26 pattern) with `WEB_SEARCH_APPROVAL_TIMEOUT_MS`.
4. `use-ai-dm-store.ts` — extend the `webSearchStatus` state type (`:87`) to `{ query: string; status: string; streamId: string; receivedAt: number } | null`, and stamp `receivedAt: Date.now()` in `handleWebSearch` (`:583-588`). (Consumed by 04D's countdown; only consumer is WebSearchApprovalPrompt.)
5. `use-ai-dm-store.ts` — add a store action `clearWebSearchStatus: () => void` (sets `webSearchStatus: null`; add to the `AiDmState` interface). Used by 04D when `approveWebSearch` returns `success: false`.
6. `use-ai-dm-store.ts` — clear stale statuses everywhere a stream ends:
   - `cancelStream` (`:384-400`): restructure so the clearing `set` runs UNCONDITIONALLY (today it is skipped when `activeStreamId` is already null), and add `webSearchStatus: null, fileReadStatus: null, streamStatus: null`:
     ```ts
     cancelStream: async () => {
       const { activeStreamId, safetyTimeoutId } = get()
       if (safetyTimeoutId) clearTimeout(safetyTimeoutId)
       set({
         activeStreamId: null, isTyping: false, streamingText: '', safetyTimeoutId: null,
         webSearchStatus: null, fileReadStatus: null, streamStatus: null
       })
       if (activeStreamId) await window.api.ai.cancelStream(activeStreamId)
     }
     ```
   - safety-timeout body (`:148-160`): add the same three `null`s to its `set`.
   - `handleDone` (`set` at `:542-552`) and `handleError` (`set` at `:564-571`): add `webSearchStatus: null, fileReadStatus: null` (they already clear `streamStatus`).
   - `reset()` (`set` at `:454-469`): add `webSearchStatus: null, fileReadStatus: null`. (Queue clearing is 04C.)
7. Tests (`use-ai-dm-store.test.ts`):
   - Update the existing `web-search status persists the streamId` test: assert via `expect.objectContaining({ streamId, query, status })` plus `typeof ws.receivedAt === 'number'`.
   - New: seed `webSearchStatus`/`fileReadStatus`/`streamStatus` + `activeStreamId`, call `cancelStream()` → all three null. Repeat with `activeStreamId: null` (the previously-skipped branch) → still cleared.
   - New (fake timers): arm the backstop via a `loading_model` status event, seed `webSearchStatus`, advance past `STREAM_SAFETY_TIMEOUT_MS` → `webSearchStatus`/`fileReadStatus` null.
   - New: drive `handleDone` and `handleError` (via captured `aiHandlers`) with seeded statuses → cleared.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json` (shared + main touched), `npx vitest run src/renderer/src/stores/use-ai-dm-store.test.ts`.

**Acceptance:** every code path that ends a stream (cancel, inactivity timeout, done, error, reset) nulls `webSearchStatus`/`fileReadStatus`; grep shows ≥6 writers of `webSearchStatus: null` in the store; main compiles with the shared constant; store tests green.

### 04B — Pending-actions queue + approval result surfacing + honest Dismiss (F3, F4, F5, half of F6)

**Objective:** undecided rulings queue instead of being overwritten; approving surfaces execution failures; Dismiss stops logging an override; RulingApprovalModal mounts on `isDM`.

**Files:** `src/renderer/src/stores/use-ai-dm-store.ts`, `src/renderer/src/services/game-action-executor.ts`, `src/renderer/src/components/game/modals/utility/RulingApprovalModal.tsx`, `src/renderer/src/components/game/GameLayout.tsx`, `src/renderer/src/i18n/locales/en.json`, `src/renderer/src/i18n/locales/es.json`, `src/renderer/src/stores/use-ai-dm-store.test.ts`, `src/renderer/src/components/game/modals/utility/RulingApprovalModal.test.tsx`, `src/renderer/src/services/game-action-executor.test.ts`.

**Steps:**

1. Store — replace the single slot with a FIFO queue:
   - `pendingActions: PendingActionSet | null` (`:58`) → `pendingActionSets: PendingActionSet[]` (init `[]`).
   - `setPendingActions(pending)` (`:102,191`) → `enqueuePendingActions(setToAdd: PendingActionSet)`: appends; when the queue already held ≥1 set, `pushDmAlert('info', i18n.t('notify.aiDmStore.rulingQueued', { count: <new queue length> }))` so the DM knows another ruling is waiting (fixes the "no record" half of F3).
   - `approvePendingActions()`: operate on the HEAD (`pendingActionSets[0]`); inside the dynamic-import `.then`, capture `const result = executeDmActions(head.actions, true)` and for each `result.failed` entry post a system chat line via `useLobbyStore.getState().addChatMessage({ id: 'ai-approve-fail-…', senderId: 'system', senderName: 'System', content: i18n.t('notify.aiDmStore.approvedActionFailed', { action: f.action.action, reason: f.reason }), timestamp: Date.now(), isSystem: true })` (mirrors the auto path at `use-game-effects.ts:474-483` and gives the AI the same chat-history feedback); also `pushDmAlert('warning', …approvedActionFailed…)` per failure batch when `result.failed.length > 0`. Then drop the head: `set({ pendingActionSets: get().pendingActionSets.slice(1) })`.
   - `rejectPendingActions(dmNote)`: operate on the head; KEEP the existing override chat line verbatim (its hardcoded-English conversion is PHASE-12's); drop the head.
   - New `dismissPendingActions()`: drop the head with NO chat line (fixes F5).
2. `game-action-executor.ts:194-206` — non-bypass branch calls `aiStore.enqueuePendingActions({...})` (same payload as today). Behavior with approval mode OFF (the default) is untouched.
3. `RulingApprovalModal.tsx` — read `const pendingActionSets = useAiDmStore((s) => s.pendingActionSets)`; `const pendingActions = pendingActionSets[0]`; null-return when empty (`:33` equivalent). `dismiss()` → `dismissPendingActions()` (Escape `:21-31`, backdrop `:90-92`, and the Dismiss button `:132-141` thereby become honest per the `dismissTitle` tooltip); Override keeps `rejectPendingActions(dmNote)`. When `pendingActionSets.length > 1`, render a queue note in the header area: `t('game.rulingApprovalModal.queueCount', { count: pendingActionSets.length })`.
4. `GameLayout.tsx:1230` — `{effectiveIsDM && aiDmStore.pendingActions && (` → `{isDM && aiDmStore.pendingActionSets.length > 0 && (` (queue rename + the RulingApprovalModal half of F6: the modal now stays mounted while the DM previews as a player, matching DmAlertTray/MutationApprovalPanel at `:877-878`).
5. i18n (en + es), new keys only:
   - `notify.aiDmStore.approvedActionFailed`: `"Approved AI action failed: {{action}} — {{reason}}"` / es `"La acción de IA aprobada falló: {{action}} — {{reason}}"`
   - `notify.aiDmStore.rulingQueued`: `"New AI ruling queued — {{count}} awaiting review"` / es `"Nueva decisión de la IA en cola — {{count}} pendientes de revisión"`
   - `game.rulingApprovalModal.queueCount`: `"{{count}} rulings pending — showing oldest first"` / es `"{{count}} decisiones pendientes — se muestra la más antigua primero"`
6. Tests:
   - `use-ai-dm-store.test.ts`: enqueue two sets → both retained in FIFO order + (spy-free) queue length 2; `approvePendingActions` removes only the head; `dismissPendingActions` adds NO lobby chat message; `rejectPendingActions` adds the `[DM Override]` message; failure surfacing — `vi.mock('../services/game-action-executor', () => ({ executeDmActions: vi.fn(() => ({ executed: [], failed: [{ action: { action: 'move_token' }, reason: 'not found' }] })) }))` (vi.mock intercepts the dynamic import), call `approvePendingActions`, flush microtasks (`await vi.waitFor(...)`), assert a system chat message containing `move_token` and `not found` landed in `useLobbyStore`.
   - `RulingApprovalModal.test.tsx`: convert to `// @vitest-environment happy-dom` + RTL; seed the store; assert Dismiss click leaves lobby chat untouched and pops the head; Override click posts the override line; with 2 queued sets the queue note renders.
   - `game-action-executor.test.ts` (source-grep style): assert source contains `enqueuePendingActions` and no longer contains `setPendingActions(`.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json`, `npx vitest run src/renderer/src/stores/use-ai-dm-store.test.ts src/renderer/src/components/game/modals/utility/RulingApprovalModal.test.tsx src/renderer/src/services/game-action-executor.test.ts`.

**Acceptance:** no `pendingActions: PendingActionSet | null` remains; a second AI batch with approval mode on lands BEHIND the first with an alert; approve failures produce system chat lines; Dismiss/Escape/backdrop produce zero chat output; the modal mounts on `isDM`.

### 04C — `reset()` / `initFromCampaign()` approval-queue + timer hygiene (F2)

**Objective:** no approval state or live timer survives a campaign switch or game leave.

**Files:** `src/renderer/src/stores/use-ai-dm-store.ts`, `src/renderer/src/stores/use-ai-dm-store.test.ts`.

**Steps:**

1. Add a module-level helper inside the store factory:
   ```ts
   const clearApprovalState = (): { pendingActionSets: never[]; pendingMutations: never[] } => {
     for (const m of get().pendingMutations) if (m.timeoutId) clearTimeout(m.timeoutId)
     return { pendingActionSets: [], pendingMutations: [] }
   }
   ```
2. `reset()` (`:446-470`): spread `...clearApprovalState()` into its `set` (statuses already added in 04A).
3. `initFromCampaign()` (`:278-321`): spread `...clearApprovalState()` plus `webSearchStatus: null, fileReadStatus: null` into BOTH branches — the main `set(...)` at `:287-300` AND the AI-disabled early-return (`:280-283`, currently `set({ enabled: false })`) — stale campaign-A approval UI must not survive into an AI-disabled campaign B. Do NOT touch the scene-prep stream-preservation logic (`:292-294`, PHASE-06 territory): approval queues clear unconditionally; preserved prep streams generate no approvals.
4. Tests (fake timers): `queueMutations` a set → `vi.getTimerCount()` increases; `reset()` → `pendingMutations` empty AND `vi.getTimerCount()` back down (timer actually cleared, so no cross-campaign `mutationsAutoRejected` alert can fire); same assertions for `initFromCampaign` with an AI-enabled campaign fixture and with an AI-disabled one; `pendingActionSets` cleared in all three cases.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json`, `npx vitest run src/renderer/src/stores/use-ai-dm-store.test.ts`.

**Acceptance:** after `reset()` or either `initFromCampaign` branch, `pendingActionSets`/`pendingMutations` are empty, every auto-reject timer is cleared (timer-count assertion), and `webSearchStatus`/`fileReadStatus` are null.

### 04D — WebSearchApprovalPrompt: dialog semantics, Escape-to-reject, countdown, result surfacing (+ F6 gate) (F7, F1 UI half, half of F6)

**Objective:** the web-search prompt is a real dialog the DM can keyboard-drive, shows the auto-reject deadline, never wedges on a stale request, and stays mounted in DM player-view.

**Files:** `src/renderer/src/components/game/overlays/WebSearchApprovalPrompt.tsx`, `src/renderer/src/stores/use-ai-dm-store.ts`, `src/renderer/src/components/game/GameLayout.tsx`, `src/renderer/src/i18n/locales/en.json`, `src/renderer/src/i18n/locales/es.json`, `src/renderer/src/components/game/overlays/WebSearchApprovalPrompt.test.tsx`, `src/renderer/src/stores/use-ai-dm-store.test.ts`.

**Steps:**

1. Store — auto-reject transparency flag:
   - Add transient state `webSearchDecided: boolean` (init `false`) + action `markWebSearchDecided()`.
   - `handleWebSearch` (`:583-588`): when the incoming status is `'pending_approval'`, reset `webSearchDecided: false`; when the incoming status is `'rejected'` AND the previous `webSearchStatus?.status === 'pending_approval'` AND `!get().webSearchDecided`, fire `pushDmAlert('info', i18n.t('notify.aiDmStore.webSearchAutoRejected', { query: data.query }))` — the DM who never clicked learns WHY the modal vanished (main's 30s timeout sends exactly this transition, `ai-service.ts:846`).
2. Component (`WebSearchApprovalPrompt.tsx`) — keep the existing markup/z-index (do NOT swap to `ui/Modal.tsx`; its root is `z-50` vs this overlay's `Z.MODAL = 60`, and PHASE-13 owns scaffold consolidation). Add, mirroring `ui/Modal.tsx:26-70` logic inline:
   - `role="dialog" aria-modal="true" aria-labelledby={titleId}` on the panel div (`useId()` for the title span).
   - Window `keydown` effect while mounted: Escape → `decide(false)` (Escape-to-REJECT per the F1 fix directive — rejecting resumes the stream with the denial block, the safe default); Tab/Shift+Tab trap cycling within the panel (querySelector for focusable elements, same selector string as `Modal.tsx:33-35`).
   - Initial focus on the Reject button (least-destructive option per the APG dialog pattern), via `requestAnimationFrame` like `Modal.tsx:57-63`; restore focus on unmount.
   - Countdown: `const deadline = webSearchStatus.receivedAt + WEB_SEARCH_APPROVAL_TIMEOUT_MS` (both from 04A); a 1s interval state mirrors `MutationApprovalPanel`'s `CountdownTimer` (`:114-131`); render `t('game.webSearchApproval.countdown', { remaining })` near the buttons, red when ≤ 10s.
   - Result surfacing in `decide()`: `const res = await window.api.ai.approveWebSearch(...)`; on `res.success === false` → `pushDmAlert('warning', t('game.webSearchApproval.staleRequest'))` + `clearWebSearchStatus()` (from 04A) so the modal unmounts instead of wedging; call `markWebSearchDecided()` before the IPC so the store's auto-reject alert never double-fires for a DM-clicked reject.
3. `GameLayout.tsx:879` — `{effectiveIsDM && <WebSearchApprovalPrompt />}` → `{isDM && <WebSearchApprovalPrompt />}` (second half of F6; matches `:877-878`).
4. i18n (en + es), new keys:
   - `game.webSearchApproval.countdown`: `"Auto-rejects in {{remaining}}s"` / es `"Se rechazará automáticamente en {{remaining}} s"`
   - `game.webSearchApproval.staleRequest`: `"This web-search request already expired or was cancelled."` / es `"Esta solicitud de búsqueda web ya expiró o fue cancelada."`
   - `notify.aiDmStore.webSearchAutoRejected`: `"Web search \"{{query}}\" was auto-rejected (no decision within 30s)."` / es `"La búsqueda web \"{{query}}\" se rechazó automáticamente (sin decisión en 30 s)."`
5. Tests:
   - `WebSearchApprovalPrompt.test.tsx` → `// @vitest-environment happy-dom` + RTL: seed store `webSearchStatus` (pending, `receivedAt: Date.now()`); assert `role="dialog"` present + countdown text rendered; `fireEvent.keyDown(window, { key: 'Escape' })` → `approveWebSearch` called with `(streamId, false)`; mock `approveWebSearch` → `{ success: false, error: '…' }` → store `webSearchStatus` becomes null after the click.
   - `use-ai-dm-store.test.ts`: drive `handleWebSearch` pending→rejected without `markWebSearchDecided` → (observable) `webSearchDecided` stays false and status transitions; with `markWebSearchDecided()` called → no double handling (assert flag true). (The `pushDmAlert` side effect lands in module state; assert the flag/status mechanics, not the alert array.)

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json`, `npx vitest run src/renderer/src/components/game/overlays/WebSearchApprovalPrompt.test.tsx src/renderer/src/stores/use-ai-dm-store.test.ts`.

**Acceptance:** Escape rejects; dialog role + labelling + focus trap present; countdown counts down from 30; a stale-request `success:false` clears the modal with an alert; the prompt mounts on `isDM`.

### 04E — MutationApprovalPanel: labels for all types, honest colors, readable reasons, Reject All, SR announcements (F8–F12)

**Objective:** the approval card shows a human-readable, correctly-colored, fully-readable description of every AI stat-change type, supports mass rejection, and announces itself to screen readers.

**Files:** `src/renderer/src/components/game/overlays/MutationApprovalPanel.tsx`, `src/renderer/src/stores/use-ai-dm-store.ts`, `src/renderer/src/i18n/locales/en.json`, `src/renderer/src/i18n/locales/es.json`, new `src/renderer/src/components/game/overlays/MutationApprovalPanel.test.tsx`, `src/renderer/src/stores/use-ai-dm-store.test.ts`.

**Steps:**

1. `changeLabel()` (`:11-95`) — add the 12 missing cases using the F8 payload table. Key names + en strings (es translations alongside; all under `game.mutationApprovalPanel.`):
   - `npcAttitude`: `"NPC {{name}}: attitude → {{attitude}}"`
   - `reduceExhaustion`: `"Exhaustion −1"` (reduces by exactly 1, `stat-mutations.ts:402-410`)
   - `addExhaustion`: `"Exhaustion +{{levels}}"`
   - `equipItem`: `"Equip {{name}}"` / `unequipItem`: `"Unequip {{name}}"` (branch on `change.equipped`)
   - `proficiencyOn`: `"Add {{category}} proficiency: {{name}}"` / `proficiencyOff`: `"Remove {{category}} proficiency: {{name}}"` (branch on `change.proficient`)
   - `skillExpertise`: `"Expertise: {{skill}}"` / `skillProficiencyOn`: `"Proficiency: {{skill}}"` / `skillProficiencyOff`: `"Remove proficiency: {{skill}}"` (branch `expertise` → `proficient`)
   - `saveProficiencyOn`: `"Add {{ability}} save proficiency"` / `saveProficiencyOff`: `"Remove {{ability}} save proficiency"` (uppercase the ability like `setAbilityScore` does at `:85`)
   - `creatureSetResistance`: `"{{target}}: resistance to {{types}}"` (`types = (change.damageTypes as string[]).join(', ')`)
   - `creatureSetVulnerability`: `"{{target}}: vulnerability to {{types}}"`
   - `creatureSetImmunity`: `"{{target}}: immunity to {{types}}"`
   - `creatureExpendSpellSlot`: `"{{target}}: expend level {{level}} slot{{count}}"` (count part `" ×N"` when `count > 1`, mirroring the `addItem` qty pattern at `:33-36`)
   - `creatureRestoreSpellSlot`: `"{{target}}: restore level {{level}} slot{{count}}"`
   The `default:` arm stays as the raw-type fallback for genuinely unknown future types.
2. `changeColor()` (`:98-112`) — replace the prefix-first logic with explicit sets evaluated before any prefix check (fixes F9):
   ```ts
   const HARMFUL = new Set(['damage', 'add_condition', 'remove_item', 'add_exhaustion', 'expend_spell_slot',
     'use_class_resource', 'revoke_feature', 'creature_damage', 'creature_add_condition', 'creature_kill',
     'creature_expend_spell_slot', 'creature_set_vulnerability'])
   const BENEFICIAL = new Set(['heal', 'temp_hp', 'remove_condition', 'restore_spell_slot', 'add_item', 'xp',
     'grant_feature', 'restore_class_resource', 'reduce_exhaustion', 'creature_heal', 'creature_remove_condition',
     'creature_restore_spell_slot', 'creature_set_resistance', 'creature_set_immunity'])
   ```
   red for HARMFUL, emerald for BENEFICIAL, amber otherwise (gold/death_save/npc_attitude/proficiency/equip types are neutral amber).
3. Reason rendering (`:157-165`, fixes F10) — drop the `ml-auto truncate max-w-[120px]` span; render the reason as its own full-width wrapped line under the label row: `<div className="text-[10px] text-gray-500 break-words pl-3" title={String(m.reason)}>({String(m.reason)})</div>`.
4. Reject All (fixes F11):
   - Store: add `rejectAllMutations: () => void` — `clearTimeout` every `timeoutId`, then `set({ pendingMutations: [] })` (one-shot, unlike `approveAllMutations`'s per-id loop, so timers can't race).
   - Panel header (`:197-207`): when `length > 1`, render Reject All beside Approve All with the red button styling used by per-card Reject (`:175-180`); key `game.mutationApprovalPanel.rejectAll`: `"Reject All ({{count}})"` / es `"Rechazar todo ({{count}})"`.
5. SR announcements (fixes F12; see Research notes for why aria-live-on-mount is insufficient):
   - Panel root (`:196`): add `role="status"` + `aria-label={t('game.mutationApprovalPanel.panelLabel')}` (`"AI stat changes awaiting approval"` / es `"Cambios de estadísticas de la IA pendientes de aprobación"`).
   - In the panel component, `useEffect` on `pendingMutations.length` with a `useRef` of the previous count: when it increases, call `announce(t('game.mutationApprovalPanel.announceQueued', { count }))` (`"{{count}} AI stat change set(s) awaiting DM approval"` / es `"{{count}} conjunto(s) de cambios de la IA esperando aprobación del DM"`) using the existing global announcer (`import { announce } from '../../ui/ScreenReaderAnnouncer'`).
   - Store `queueMutations` timer body (`:230-237`): alongside the existing `pushDmAlert`, call `announce(i18n.t('notify.aiDmStore.mutationsAutoRejected'))` so the auto-reject is audible (import precedent: the store already imports `pushDmAlert` from a component module at `:2`).
6. Tests — new `MutationApprovalPanel.test.tsx` (`// @vitest-environment happy-dom` + RTL): seed `pendingMutations` with one set containing all 12 previously-unlabeled types → `screen.queryByText('set_skill_proficiency')` (and each raw type string) is null while translated fragments render; a `creature_heal` row carries `text-emerald-400` and a `creature_damage` row `text-red-400`; a 200-char reason renders in full with a `title` attribute; with 2 sets both Approve All and Reject All render and Reject All empties the store (fake timers: `vi.getTimerCount()` drops); panel root has `role="status"`. Store test: `rejectAllMutations` clears all sets + timers.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json`, `npx vitest run src/renderer/src/components/game/overlays/MutationApprovalPanel.test.tsx src/renderer/src/stores/use-ai-dm-store.test.ts`.

**Acceptance:** no raw type string renders for any schema-valid stat-change type; creature healing/restoration renders green; reasons wrap fully with tooltips; Reject All exists and clears timers; queue/auto-reject events are announced.

### 04F — DmAlertTray disclosure behavior (F13)

**Objective:** the alert tray behaves like a proper disclosure: keyboard- and outside-click-dismissable, with correct ARIA state.

**Files:** `src/renderer/src/components/game/overlays/DmAlertTray.tsx`, `src/renderer/src/components/game/overlays/DmAlertTray.test.tsx`.

**Steps:**

1. Add `const rootRef = useRef<HTMLDivElement>(null)` on the root div (`:87`) and `const panelId = useId()`.
2. Badge button (`:89-103`): add `aria-expanded={expanded}`, `aria-haspopup="true"`, `aria-controls={panelId}`; expanded panel div (`:107`): add `id={panelId}`.
3. `useEffect` active only while `expanded`: window `keydown` → Escape closes (`setExpanded(false)`); document `pointerdown` → if `rootRef.current && !rootRef.current.contains(e.target as Node)` close. Clean both listeners up on collapse/unmount.
4. Tests (`DmAlertTray.test.tsx` → `// @vitest-environment happy-dom` + RTL): click badge → panel visible + `aria-expanded="true"`; Escape → panel gone + `aria-expanded="false"`; `fireEvent.pointerDown(document.body)` with the panel open → closed; clicking INSIDE the panel does not close it.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json`, `npx vitest run src/renderer/src/components/game/overlays/DmAlertTray.test.tsx`.

**Acceptance:** Escape and outside-click close the tray; `aria-expanded`/`aria-controls` reflect state; in-panel interaction is unaffected.

## Research notes

- **Modal dialog semantics (04B/04D):** the WAI-ARIA APG modal-dialog pattern requires Escape-to-close, Tab/Shift+Tab focus containment, `role="dialog"` + `aria-modal="true"`, `aria-labelledby` (or `aria-label`), focus moved into the dialog on open — with the note that for high-risk actions initial focus should go to the *least destructive* option (hence focusing Reject in 04D), and focus returns to the invoker on close. Source: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ . The repo's `ui/Modal.tsx` already implements this pattern; 04D copies its mechanics inline rather than adopting the component (z-index mismatch: Modal root is `z-50`, the AI overlays sit at `Z.MODAL = 60`; consolidation belongs to PHASE-13's ModalScaffold item).
- **Live regions (04E):** assistive tech only announces *dynamic changes* inside a live region that already existed — "start with an empty live region, then in a separate step change the content"; `role="status"` implies `aria-live="polite"`. Because `MutationApprovalPanel` returns `null` when empty (the region mounts WITH its content), `aria-live` on its root is unreliable for the first set — hence routing announcements through the persistently-mounted `ScreenReaderAnnouncer` (`announce()`), which exists exactly for this. Source: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions .
- **Disclosure pattern (04F):** the APG disclosure pattern requires `aria-expanded` on the trigger reflecting visibility, with `aria-controls` optional; Enter/Space toggle comes free with `<button>`. Escape/outside-click are not APG requirements but are the established convention for floating non-modal panels (and what the audit demands). Source: https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/ .
- **Store reset hygiene (04A/04C):** zustand's documented reset pattern is replacing state with a captured initial-state object; timers and other side-effecting handles held IN state must be disposed explicitly before the replace (zustand does nothing with them). The store here resets selectively (it must preserve `setupListeners` wiring and config like `autoApproveAiMutations`), so 04C clears timers explicitly rather than doing a whole-store replace. Source: https://zustand.docs.pmnd.rs/learn/guides/how-to-reset-state (current canonical URL; the older `/guides/how-to-reset-state` path 404s).
- **Queue vs. overwrite-with-alert for F3 (alternative considered):** keeping the single slot and posting a "previous ruling replaced" note would be a smaller diff but still destroys an undecided ruling the DM may have wanted; a FIFO queue preserves DM agency, matches the sibling `pendingMutations` design (already an array), and keeps the modal contract trivial (render head). Chosen: queue. Risk is contained because `dmApprovalRequired` defaults to `false` (off-by-default feature; `use-ai-dm-store.ts:167`).
- **Escape-to-reject vs Escape-to-defer for the web-search prompt (alternative considered):** a "dismiss without deciding" Escape would leave the 30s main-process timer running and the modal gone — recreating the silent-auto-reject problem. The audit's directive ("add Escape-to-reject") plus the APG least-destructive-default guidance favor explicit reject. Chosen: Escape = reject.
- **Main-process timeout left untouched (caveat):** lengthening or pausing the 30s `WEB_SEARCH_APPROVAL_TIMEOUT_MS` while a DM deliberates would hold the LLM stream open longer (Ollama keep-alive/window interactions are PHASE-01/03 territory). This phase only *surfaces* the deadline; revisit the value after PHASE-03's inactivity-timeout work if 30s proves short in play.

## Test plan

Per sub-phase (cheap, targeted — INSTRUCTIONS.md rule 5):

| Sub-phase | Test files (new ✚ / extended ✎) |
|---|---|
| 04A | ✎ `src/renderer/src/stores/use-ai-dm-store.test.ts` (status-clearing on cancel/timeout/done/error/reset; `receivedAt` shape) |
| 04B | ✎ `use-ai-dm-store.test.ts` (queue FIFO, approve-head, dismiss-silent, reject-logs, failure surfacing via mocked executor); ✎ `RulingApprovalModal.test.tsx` (RTL: dismiss vs override behavior, queue note); ✎ `game-action-executor.test.ts` (source asserts `enqueuePendingActions`) |
| 04C | ✎ `use-ai-dm-store.test.ts` (fake-timer `vi.getTimerCount()` hygiene for reset/initFromCampaign both branches) |
| 04D | ✎ `WebSearchApprovalPrompt.test.tsx` (RTL: dialog role, countdown, Escape→reject, stale-result clearing); ✎ `use-ai-dm-store.test.ts` (decided-flag transitions) |
| 04E | ✚ `src/renderer/src/components/game/overlays/MutationApprovalPanel.test.tsx` (labels, colors, reason, Reject All, role=status); ✎ `use-ai-dm-store.test.ts` (`rejectAllMutations`) |
| 04F | ✎ `DmAlertTray.test.tsx` (RTL: aria-expanded, Escape, outside-click) |

End-of-phase 4-gate (ONCE, after 04F):

```bash
cd dnd-app
npm run lint
npx tsc --noEmit -p tsconfig.web.json
npx tsc --noEmit -p tsconfig.node.json
npx vitest run
```

No Pi/bmo code is touched → no pytest. DOM tests use the `// @vitest-environment happy-dom` pragma (repo convention; suite default is `node`). i18n resolves to English in tests via `src/test-setup.ts`, so assertions can match English strings.

## Acceptance criteria

1. A stream that is cancelled, times out, completes, or errors leaves `webSearchStatus`, `fileReadStatus`, and `streamStatus` null — the web-search modal can no longer outlive its stream (F1). Verify: 04A tests + `grep -c "webSearchStatus: null" src/renderer/src/stores/use-ai-dm-store.ts` ≥ 6.
2. `reset()` and both `initFromCampaign()` branches clear `pendingActionSets`, `pendingMutations` (with every auto-reject timer `clearTimeout`-ed), and both status fields (F2). Verify: 04C fake-timer tests.
3. Concurrent AI rulings queue FIFO with a DM alert; nothing is silently dropped (F3). Verify: 04B store tests.
4. Approving a ruling surfaces every failed action as a system chat line + DM alert (F4). Verify: 04B mocked-executor test.
5. Dismiss/Escape/backdrop on RulingApprovalModal produce no chat output; Override still logs (F5). Verify: 04B RTL tests.
6. All four approval surfaces mount on `isDM` (visible during DM player-view preview): GameLayout lines for DmAlertTray, MutationApprovalPanel, WebSearchApprovalPrompt, RulingApprovalModal all gate on `isDM` (F6). Verify: `grep -n "isDM && <\|isDM && aiDmStore" src/renderer/src/components/game/GameLayout.tsx` shows no `effectiveIsDM` gate on these four.
7. WebSearchApprovalPrompt: `role="dialog"`/`aria-modal`/labelling/focus trap/initial focus, Escape rejects, a live 30s countdown renders, `success:false` clears + alerts, silent auto-reject fires an explanatory alert (F7). Verify: 04D RTL tests.
8. MutationApprovalPanel labels every schema-valid stat-change type, colors creature healing/restoration green, renders full reasons with tooltips, offers Reject All, and announces queue/auto-reject events through the global announcer (F8–F12). Verify: 04E tests.
9. DmAlertTray closes on Escape/outside-click and exposes `aria-expanded`/`aria-controls` (F13). Verify: 04F tests.
10. End-of-phase 4-gate green; one phase commit; plan moved to `completed/`.
11. No main-process behavior change beyond the constant import (the 30s timeout value and approval IPC contract are unchanged); no new IPC channels; `dmApprovalRequired` and `autoApproveAiMutations` defaults unchanged (approval flows remain opt-in).

## Out of scope

- **`fileReadStatus` indicator component** (rendering it while the AI reads files) — PHASE-14. This phase only clears the field.
- **Pre-existing hardcoded English in the store** (`'AI response timed out'` :153, `senderName: 'DM'` / `'[DM Override] AI ruling rejected'` :217-218, `'Scene preparation failed.'` :420) and the auto-path failure string in `use-game-effects.ts:478` — PHASE-12 i18n/wording sweep.
- **`sendMessage` cancelling an in-flight stream on a new player message** (queueing semantics) and all stream-listener lifecycle work (`setupListeners`, `removeAllAiListeners`, preload per-listener unsubscribe, AiProviderSetup/OllamaManagement leaks) — PHASE-05.
- **Scene-prep cancel** (`prepareScene`/`checkSceneStatus` streamId capture, AI_CANCEL_SCENE) — PHASE-06.
- **Dead `ai-renderer-actions` strip call in `handleDone`** — PHASE-08 (executor/dead-pipeline phase).
- **ChatPanel status bar, stream-preview raw-tag display, inline AI error affordances, NarrationOverlay max-height/dialog** — PHASE-10.
- **`<ModalScaffold>` shared extraction** — PHASE-13 (33c). 04D/04B implement dialog mechanics locally.
- **Web-search approval policy changes** (timeout length, pausing the timer during deliberation, per-query allowlists) — not owned by any current phase; revisit after PHASE-03.
- **Path-traversal sanitization of AI IPC handlers** (`campaignId` filesystem paths) — security finding owned outside this phase (see SECURITY-LOG routing).

## Completed

*(Filled during execution per INSTRUCTIONS.md rule 17 — one line per sub-phase with file:line citations.)*
