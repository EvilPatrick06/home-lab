# Phase 17 — Full Codebase Error Audit Fixes

## Context

A full codebase audit (TypeScript compiler, Biome linter, manual review across 4,417 source files) surfaced 171 issues spanning 6 categories: 1 syntax, 25 logical, 68 network, 44 GUI, 26 runtime, 7 type. Of these, 49 are critical or high severity and represent net-new work after previous phases.

This phase fixes the critical/high issues that change correctness, prevent crashes, or close security holes. Catch-all hardening (try-catch on every IPC handler, modal escape-key coverage) is bundled here because the audit found these as systematic gaps rather than isolated bugs. Lower-severity items are catalogued for future cleanup sprints in sub-phase 17g; only the critical/high issues are live work.

Verification re-run on 2026-05-19 against current code. Several items have landed since the audit: LOG-6 (long rest exhaustion), GUI-4 (Three.js disposal helper), GUI-5 (MapCanvas selectedTokenId), TYP-1/TYP-2 (preload type declarations), SYN-1 (chat-links now uses `React.createElement` instead of JSX so the `.ts` extension is correct), and partial NET-19 / partial NET-5. Everything else remains as scoped.

## Depends on / blocks

- Depends on: Phase 4 (exhaustion rules baseline), Phase 7 (atomic writes baseline), Phase 12 (`selectedTokenId` consistency baseline)
- Blocks: Phase 30 (NET-5 broadcast hardening lives in `host-manager.ts` paths that Phase 30 consolidates into `GameAuthority`); Phase 31 may absorb several NET-21 through NET-50 items as the single sync protocol replaces ad-hoc broadcasts

## Files touched

| Path | Role |
|------|------|
| `src/main/ipc/ai-handlers.ts` | Path-traversal sanitization, destroyed-window guards, configure parsed.data, bulk try-catch |
| `src/main/ipc/storage-handlers.ts` | CHARACTER_RESTORE_VERSION / BOOK_IMPORT / BOOK_READ_FILE sanitization, bulk try-catch (34 handlers) |
| `src/main/ipc/game-data-handlers.ts` | `GAME_LOAD_JSON` try-catch around `JSON.parse` |
| `src/main/ipc/plugin-handlers.ts` | Bulk try-catch (10 handlers) |
| `src/main/ipc/audio-handlers.ts` | `AUDIO_PICK_FILE` size check and read guard |
| `src/main/ipc/index.ts` | `FS_WRITE_BINARY` size limit; `DIALOG_SAVE`/`DIALOG_OPEN` null-window guard |
| `src/main/ai/ai-service.ts` | Replace `atomicWriteFileSync` with async write; clear module-level setInterval on shutdown |
| `src/main/ai/claude-client.ts`, `openai-client.ts`, `gemini-client.ts` | Add 120s timeout to `streamChat` and `chatOnce` |
| `src/main/ai/memory-manager.ts` | Serialize read-modify-write paths to fix races |
| `src/main/index.ts` | Decide policy for `uncaughtException` (currently logs only) |
| `src/renderer/src/components/game/overlays/PlayerHUDOverlay.tsx` | Move hooks above the early return |
| `src/renderer/src/components/game/overlays/DmAlertTray.tsx` | Subscribe in `useEffect`, not `useState` initial |
| `src/renderer/src/components/game/dice3d/DiceOverlay.tsx` | Track and clear nested `setTimeout` |
| `src/renderer/src/components/game/player/ShopView.tsx` | Track and clear `setTimeout` |
| `src/renderer/src/components/game/modals/utility/RulingApprovalModal.tsx` | Escape, backdrop, cancel button |
| `src/renderer/src/components/game/modals/**/*.tsx` (11 modals) | Add Escape key handler or migrate to shared `Modal` |
| `src/renderer/src/components/ui/Modal.tsx` | Decouple header from scrolling body |
| `src/renderer/src/services/combat/attack-resolver.ts` | Champion crit threshold; thrown-weapon classification |
| `src/renderer/src/services/combat/combat-resolver.ts` | `doubleDiceInFormula` global flag; champion crit |
| `src/renderer/src/services/combat/combat-rules.ts` | `isInMeleeRange` iterates all occupied cells |
| `src/renderer/src/services/combat/cover-calculator.ts` | Skip dead, allied, and Tiny tokens for cover |
| `src/renderer/src/services/game-actions/creature-conditions.ts` | Area-effect saves use target modifier |
| `src/renderer/src/services/game-actions/creature-actions.ts` | Area-effect saves use target modifier |
| `src/renderer/src/services/game-actions/creature-initiative.ts` | `executeNextTurn` reads index after `nextTurn` |
| `src/renderer/src/services/game-actions/dice-helpers.ts` | Cone uses `getConeCells`, not square |
| `src/renderer/src/services/game-actions/action-validator.ts` | Use `entityName`, drop `{ label?: string }` cast |
| `src/renderer/src/stores/game/conditions-slice.ts` | Remove 2014 exhaustion-6 death trigger |
| `src/renderer/src/stores/game/initiative-slice.ts` | `removeFromInitiative` tracks active entry by id |
| `src/renderer/src/stores/use-ai-dm-store.ts` | `.catch()` on dynamic import; `.catch()` on `loadConversation` |
| `src/renderer/src/hooks/use-game-effects.ts` | `.catch()` on two dynamic imports |
| `src/renderer/src/stores/builder/slices/selection-slice.ts` | `.catch()` on `load5eSpecies/Backgrounds/Classes` |
| `src/renderer/src/stores/builder/slices/character-details-slice.ts` | `.catch()` on `setClassEquipmentChoice` chain |
| `src/renderer/src/data/conditions.ts` | Replace `_conditions!` / `_buffs!` non-null assertions |
| `src/renderer/src/services/data-provider.ts` | Replace `Promise.all` in `loadAllStatBlocks` with per-file tolerance |
| `src/renderer/src/services/downtime-service.ts` | Replace `Promise.all` in `loadExtendedDowntimeActivities` |
| `src/renderer/src/services/sound-manager.ts` | Dispose HTMLAudioElement pools in `reinit` |
| `src/renderer/src/network/host-manager.ts` | Try-catch around `JSON.stringify` in send paths |
| `src/renderer/src/network/client-manager.ts` | Propagate post-connection peer errors |

## Sub-phase summary

| # | Sub-phase | Theme |
|---|-----------|-------|
| 17a | Security fixes | Path traversal, size limits, validator bypass |
| 17b | Crash prevention | Destroyed-window guards, JSON.parse guards, hook ordering |
| 17c | Game logic fixes | Crit range, AoE saves, cone geometry, initiative tracking |
| 17d | Error handling hardening | Bulk IPC try-catch, cloud API timeouts, async writes, dynamic-import catches |
| 17e | GUI fixes | Modal escape coverage, subscription/timeout leaks, Three.js disposal completion |
| 17f | Type safety | Zod-parsed data plumbed through, validator cast removed |
| 17g | Medium / low catalogue | Tracked for later sprints; not blocking |

## Sub-phase details

### 17a — Security fixes

**Files:** `src/main/ipc/ai-handlers.ts`, `src/main/ipc/storage-handlers.ts`, `src/main/ipc/index.ts`, `src/main/ipc/audio-handlers.ts`

**Steps:**

1. NET-1 [CRITICAL]: Path traversal via `campaignId`. `ai-handlers.ts:319, 357, 362` plus 7 more handlers concatenate `campaignId` straight into `path.join(userData, 'campaigns', campaignId, ...)`. `AI_CLEAR_MEMORY` calls `fs.rm({ recursive: true, force: true })`, so `campaignId = '../../../'` is a directory-deletion vector. Add a `sanitizeCampaignId(id)` helper that rejects anything not matching `/^[a-f0-9-]{36}$/i`, AND defense-in-depth: assert `path.resolve(base, id).startsWith(base)`. Apply to every handler taking `campaignId`.
2. NET-12 [HIGH]: `CHARACTER_RESTORE_VERSION` at `storage-handlers.ts:103` passes `fileName` through to `restoreCharacterVersion` with no sanitization. Strip path separators, reject `..`, require an allowlisted extension before delegating.
3. NET-13 [HIGH]: `BOOK_IMPORT` (`storage-handlers.ts:376`) and `BOOK_READ_FILE` (`:380`) accept arbitrary paths from the renderer. Wrap both with `isPathAllowed()` (already used by `FS_READ`/`FS_WRITE` at `index.ts:142, 160`), or require the path live under the book-storage directory.
4. NET-14 [HIGH]: `AI_INSTALL_OLLAMA` at `ai-handlers.ts:462` passes `installerPath` straight to `installOllama`. Validate that the resolved path lives under the OS temp dir or downloads folder before execution.
5. NET-15 [HIGH]: `FS_WRITE_BINARY` at `index.ts:159-172` skips the `MAX_WRITE_CONTENT_SIZE` check that `FS_WRITE` enforces at `:145`. Add `buffer.byteLength > MAX_WRITE_CONTENT_SIZE` guard with the same error format.
6. NET-16 [HIGH]: `AUDIO_PICK_FILE` at `audio-handlers.ts:118-130` reads files chosen by dialog without a size guard and without protecting against TOCTOU between dialog return and `fs.readFile`. Stat first, enforce a max size (reuse `MAX_READ_FILE_SIZE`), wrap the read in try-catch returning a `StorageResult`.

**Acceptance:** All eight handlers reject hostile `campaignId`/`fileName`/`filePath` inputs (test in `ai-handlers.test.ts`, `storage-handlers.test.ts`, `audio-handlers.test.ts` with `../../etc/passwd` style payloads). `FS_WRITE_BINARY` rejects oversized buffers. No real campaign UUID is rejected by the new validator.

### 17b — Crash prevention

**Files:** `src/main/ipc/ai-handlers.ts`, `src/main/ipc/game-data-handlers.ts`, `src/renderer/src/components/game/overlays/PlayerHUDOverlay.tsx`

**Steps:**

1. NET-2 / NET-3 [CRITICAL]: Destroyed-window crashes during AI streaming. `ai-handlers.ts:169, 173, 184` (`AI_CHAT_STREAM`), `:454` (`AI_DOWNLOAD_OLLAMA`), `:484` (`AI_PULL_MODEL`), `:516` (`AI_OLLAMA_UPDATE`), `:139` (`AI_LOAD_INDEX` progress) all call `win.webContents.send(...)` (or `win?.webContents.send(...)` — optional chaining doesn't catch `isDestroyed`). Replace each call site with `if (win && !win.isDestroyed()) win.webContents.send(...)`. Order matters: check `isDestroyed` before touching `webContents`.
2. RUN-1 / NET-7 [CRITICAL]: `GAME_LOAD_JSON` at `game-data-handlers.ts:28-29` runs `JSON.parse(content)` with no try-catch. A single corrupt JSON file in 85+ data files crashes the data pipeline (blank screen). Wrap in try-catch, log the file path via `logToFile`, return `null` (or a `{ success: false, error }` envelope), and audit every `loadJson()` callsite in `data-provider.ts` to handle the `null`.
3. GUI-1 [CRITICAL]: Conditional hooks in `PlayerHUDOverlay.tsx`. The early return at `:82` (`if (!character) return <></>`) sits above `useMemo` at `:86` and at least 10 more `useCallback` declarations through `:240`. Hook call order changes when `character` flips. Move every hook above the early return; guard the body of each hook on `character` truthiness. Confirm Biome's `useHookAtTopLevel` warnings clear for this file.

**Acceptance:** Closing the window during `AI_CHAT_STREAM` no longer throws "Object has been destroyed" in main-process logs. Loading a deliberately-corrupted JSON file logs the path and returns a structured failure instead of crashing. `PlayerHUDOverlay.tsx` produces zero `useHookAtTopLevel` warnings.

### 17c — Game logic fixes

**Files:** `src/renderer/src/services/combat/attack-resolver.ts`, `combat-resolver.ts`, `combat-rules.ts`, `cover-calculator.ts`, `game-actions/creature-conditions.ts`, `creature-actions.ts`, `creature-initiative.ts`, `dice-helpers.ts`, `action-validator.ts`, `stores/game/conditions-slice.ts`, `stores/game/initiative-slice.ts`

**Steps:**

1. LOG-1 [HIGH]: Champion Fighter expanded crit range never applied. `attack-resolver.ts:250, 481` and `combat-resolver.ts` (search for `attackRoll === 20`) both hardcode the crit check. Import `getCritThreshold` from `crit-range.ts:8` and use `attackRoll >= getCritThreshold(attacker)` at both sites. Verify `attacker` carries class + level (it currently does via `Character5e` and resolved effects).
2. LOG-2 [HIGH]: `doubleDiceInFormula` at `combat-resolver.ts:901-906` uses `formula.replace(/(\d*)d(\d+)/, ...)` without the `g` flag, so only the first dice group doubles on a crit. `2d6+1d8+4` becomes `4d6+1d8+4` instead of `4d6+2d8+4`. Add the `g` flag.
3. LOG-3 [HIGH]: `isInMeleeRange` at `combat-rules.ts:291-301` measures from `attacker.gridX/gridY` only. A 2x2 Large creature at (0,0) attacking (2,0) reports 10 ft (false for 5 ft reach) when cell (1,0) is actually 5 ft away. Iterate every occupied cell of attacker and target (mirror the pattern in `isAdjacent` at `:198`); return on first hit within `reach`.
4. LOG-4 [HIGH]: Area-effect saves ignore target modifiers. `creature-conditions.ts:113-115` and `creature-actions.ts:331-333` both compute `const saveRoll = rollDiceFormula('1d20'); saved = saveRoll.total >= saveDC` with no ability mod. Build a `getCreatureSaveMod(token, ability)` that pulls from the linked stat block (`monsterStatBlockId`) or character abilities; fall back to +0 with a `logToFile` warning when no stat block is linked. Use it in both branches: `(saveRoll.total + saveMod) >= saveDC`.
5. LOG-5 [HIGH]: Cone AoE uses square geometry. `dice-helpers.ts:46-49` shares the `'cube'` case with `'cone'`. Add a dedicated `case 'cone':` that delegates to `getConeCells` (already exists at `services/combat/aoe-targeting.ts:119`) with origin, direction, and radius.
6. LOG-7 [MEDIUM]: `isMeleeWeapon` at `attack-resolver.ts:70-72` returns true whenever `weapon.properties` includes `'thrown'`, even at range. Add an optional `attackDistance` parameter; treat thrown weapons as ranged when distance > 5 ft. Audit `:118, :344` callsites to pass the actual attack distance.
7. LOG-8 [MEDIUM]: `conditions-slice.ts:33, 59` still fire the 2014 "exhaustion 6 = death" rule (`condition.value >= 6` triggers an instant kill). 2024 PHB removed this and the cumulative -2-per-level penalty already lives in `attack-condition-effects.ts:90`. Remove both death branches; leave a stub comment pointing at the 2024 rule.
8. LOG-10 [MEDIUM]: `removeFromInitiative` at `initiative-slice.ts:281-304` still uses `Math.min(initiative.currentIndex, newEntries.length - 1)` after removing an entry. Removing an entry before the active one shifts the active marker to the wrong entity. `reorderInitiative` at `:316-318` already tracks by id; mirror that: capture `activeId = entries[currentIndex]?.id` before the filter, then `newIndex = newEntries.findIndex(e => e.id === activeId)`. If the removed entry WAS active, advance to the next entry that still exists.
9. LOG-11 [MEDIUM]: `cover-calculator.ts:104-116` treats every other token identically. Dead/unconscious tokens, allies, and Tiny creatures all contribute to cover. PHB caps creature cover at half and excludes dead and Tiny. Filter the token list before the cover line trace: skip tokens whose `currentHP <= 0`, whose size is Tiny, and (per PHB option) allies; clamp the resulting cover to `'half'` regardless of how many creature segments block.
10. LOG-12 [MEDIUM]: `action-validator.ts:104-106` reads `(e as unknown as { label?: string }).label?.toLowerCase()`. `InitiativeEntry` exposes `entityName`, not `label`, so every `remove_from_initiative` action is rejected as "not found." Drop the cast, switch to `e.entityName?.toLowerCase()`. This also closes TYP-4.
11. LOG-13 [MEDIUM]: `executeNextTurn` at `creature-initiative.ts:85-87` pre-computes the next index as `(currentIdx + 1) % length`, then calls `gameStore.nextTurn()` which may skip delaying entries. Legendary action resets and recharge rolls target the wrong creature. Fix: call `gameStore.nextTurn()` first, then read the post-advance `currentIndex` from the store.
12. LOG-14 [MEDIUM]: Async data loaders in `data/effect-definitions.ts`, `conditions.ts`, `xp-thresholds.ts`, `weapon-mastery.ts` expose synchronous accessors backed by `.then()` callbacks. First combat in a session can see empty defaults. Either (a) make accessors `async`, or (b) gate combat resolution on a single `await loadAllGameData()` at app boot. Choose (b) — it minimizes call-site churn — and add the gate to `main.tsx`.
13. LOG-15 [MEDIUM]: `systems/dnd5e/index.ts:22-23, 37-44, 96-97` initializes `HALF_CASTER_SLOTS` and `THIRD_CASTER_SLOTS` as `{}` and populates them asynchronously. Rangers, Paladins, Eldritch Knights, Arcane Tricksters get 0 spell slots before the promise resolves. Same fix as LOG-14: bake the load into the app-boot gate, or surface a loading state via the plugin manifest.

**Acceptance:** Targeted vitest suites for crit range, dice doubling, melee range, AoE saves, cone targeting, exhaustion 2024, and initiative removal all pass. `remove_from_initiative` validates positively in `action-validator.test.ts`. A scripted long rest after combat reduces exhaustion by 1 (LOG-6 baseline preserved). No regressions in `combat-resolver.test.ts`.

### 17d — Error handling hardening

**Files:** `src/renderer/src/network/host-manager.ts`, `src/renderer/src/network/client-manager.ts`, `src/main/ai/claude-client.ts`, `openai-client.ts`, `gemini-client.ts`, `src/main/ai/ai-service.ts`, `src/main/ai/memory-manager.ts`, `src/main/ipc/ai-handlers.ts`, `storage-handlers.ts`, `plugin-handlers.ts`, `src/renderer/src/stores/builder/slices/selection-slice.ts`, `character-details-slice.ts`, `src/renderer/src/stores/use-ai-dm-store.ts`, `src/renderer/src/hooks/use-game-effects.ts`, `src/main/ipc/index.ts`

**Steps:**

1. NET-5 [HIGH] PARTIAL: Unguarded `JSON.stringify` in broadcast paths. `host-manager.ts:171` (disconnectPeer) and `:305` (ping interval) have try-catch. `queueForPeer` at `:134-157` ultimately hands messages to `rawSend` which stringifies them — confirm `rawSend` and `flushPeerQueue` (`:125-131`) both wrap the stringify. STILL NEEDED: trace each `JSON.stringify` call across `host-manager.ts` and `client-manager.ts`, wrap any uncovered site, and add a test that simulates a circular-ref payload. Coordinate with Phase 30: these paths consolidate into `GameAuthority` so the try-catch must travel with the consolidation.
2. NET-4 [HIGH]: `client-manager.ts:368-375` (`attemptConnection` → `peer.on('error')`) silently swallows peer errors once `connected = true`. Promote post-connection errors to a user-visible reconnect attempt or a state-change callback; log via `logger.warn`. Required for any reliable client UX.
3. NET-6 / NET-29 / NET-30 [HIGH]: Bulk try-catch across IPC handlers. Audit count: 27+ in `ai-handlers.ts`, 34 in `storage-handlers.ts`, 10 in `plugin-handlers.ts`. Introduce a `safeHandler<T>(fn)` wrapper in `src/main/ipc/_safe.ts` that catches and returns `{ success: false, error: String(err) }`. Migrate every handler in those three files to use it. Distinct error envelopes that already use `{ success, error }` stay unchanged; raw throwers are normalized.
4. NET-8 [HIGH]: Cloud API timeouts. `claude-client.ts:23, 67`, `openai-client.ts:23, 68`, `gemini-client.ts:27, 73` accept an `abortSignal?` but never enforce their own. Add `AbortSignal.timeout(120_000)` (matching the Ollama default at `ollama-client.ts:62, 195`) and combine with any caller-supplied signal via `AbortSignal.any`. Apply to both `streamChat` and `chatOnce` in all three clients.
5. NET-10 [HIGH] PARTIAL: `ai-service.ts:247` now uses `atomicWriteFileSync` (good — atomic), but it's still synchronous and blocks the main process during configure. Convert `configure` to async and switch to an `atomicWriteFile` variant; update the caller at `ai-handlers.ts:82` to `await aiService.configure(parsed.data)`.
6. NET-11 [HIGH]: `memory-manager.ts:119-128, 135-144, 182-189, 212-221, 235-287` (`upsertNPC`, `upsertPlace`, `addRuling`, `setNpcPersonality`, `logNpcInteraction`, `addNpcRelationship`) all read-modify-write JSON files. Concurrent AI DM actions lose data. Serialize via a per-file mutex (a `Map<filePath, Promise<void>>` chain) or a small write queue.
7. NET-17 [HIGH]: `ai-handlers.ts:243-249` (`AI_CONNECTION_STATUS`) is registered but no preload entry calls it. Either expose it in `preload/index.ts` so renderer can use it, or delete the handler. Deleting is preferred unless a caller is identified.
8. NET-19 / NET-20 [HIGH] PARTIAL: `ai-handlers.ts:82` still passes the raw `config` to `aiService.configure(config)` after Zod validation succeeded; should be `parsed.data`. Same pattern at `:165-186` (`AI_CHAT_STREAM`) where the raw `request` is forwarded instead of `parsed.data`.
9. RUN-2 [HIGH]: `selection-slice.ts:171, 228, 248, 280` chain `.then()` without `.catch()`. Add `.catch((err) => logger.warn('[builder] selection load failed', err))` on each.
10. RUN-3 / RUN-4 [HIGH]: `use-ai-dm-store.ts:157` dynamic-imports `game-action-executor` without `.catch()`. State is cleared but actions never run; DM has no feedback. Add `.catch()` and surface a `pushDmAlert('error', ...)` toast. Also audit `initFromCampaign` (the `loadConversation` call) for a missing `.catch()`.
11. RUN-5 [HIGH]: `use-game-effects.ts:68` and `:370` both call `import('...').then(...)` without `.catch()`. AI creature mutations and DM actions silently drop. Wrap both with `.catch()` that pushes a system chat message and logs the failure.
12. RUN-6 [HIGH]: `character-details-slice.ts:117-132` (`setClassEquipmentChoice`) has a similar uncaught `.then()`. Add `.catch()` consistent with step 9.
13. RUN-7 [HIGH]: `DIALOG_SAVE` and `DIALOG_OPEN` in `index.ts:127-128, 143-144` use `BrowserWindow.getAllWindows()[0]` which is `undefined` when no window exists. Guard with `?? null` and short-circuit with a `{ success: false, error: 'no-window' }` envelope.
14. RUN-15 [MEDIUM]: `index.ts:18-20` `uncaughtException` handler only logs; the process continues in undefined state, risking corrupt writes. Decision needed: either (a) exit after logging via `app.exit(1)`, or (b) surface a fatal dialog and quit gracefully. Pick (b) for desktop UX. Same `unhandledRejection` policy.

**Acceptance:** `safeHandler` wrapper covers every registered handler in the three files (grep for raw `ipcMain.handle` outside `safeHandler` should return zero hits except for the schema-validated streaming setups). Cloud API integration tests pass with a 120s upper bound. Builder load failures show a toast and don't lock the builder slot. A scripted dialog with no windows returns a structured error.

### 17e — GUI fixes

**Files:** `src/renderer/src/components/game/overlays/DmAlertTray.tsx`, `dice3d/DiceOverlay.tsx`, `dice3d/DiceRenderer.tsx`, `dice3d/dice-textures.ts`, `dice3d/dice-physics.ts`, `player/ShopView.tsx`, `modals/utility/RulingApprovalModal.tsx`, and the 11 modal files listed in step 5, `components/ui/Modal.tsx`

**Steps:**

1. GUI-2 [HIGH]: `DmAlertTray.tsx:50-60` subscribes inside `useState(() => { listeners.push(rerender); return () => {...} })`. The returned cleanup is never invoked because React treats it as initial state. Move the subscribe + cleanup into a `useEffect(() => { listeners.push(rerender); return () => { listeners = listeners.filter(...) } }, [rerender])`.
2. GUI-3 [HIGH]: `DiceOverlay.tsx:133-135` nests two `setTimeout` calls without storing the IDs. If the component unmounts mid-roll, `setRollRequest(null)` fires on an unmounted component. Track both IDs in a ref and clear them in a `useEffect` cleanup.
3. GUI-4 [HIGH] PARTIAL: `DiceRenderer.tsx:184-189` now calls `disposeObject3D` before `scene.remove`. STILL NEEDED: (a) audit `dice-textures.ts:6-73` for `CanvasTexture` instances that never get `.dispose()`; (b) audit `dice-physics.ts:91-148` for cannon-es `BufferGeometry` allocations that aren't disposed. Add a `disposeDie(mesh)` helper that fully tears down geometry, material, material.map, and any wireframe — replace bare `scene.remove(...)` callsites with the helper. Per the suggestions-log gotcha, consider a grep-based pre-commit hook that forbids `scene.remove(` outside the helper.
4. GUI-7 [HIGH]: `RulingApprovalModal.tsx:50-109` has no Escape handler, no backdrop click, no Cancel button — only Approve and Override. Add `useEffect` keydown listener for Escape (calls a new `dismiss()` that clears pending actions without applying), wire backdrop `onClick` on the outer `fixed inset-0` div, and add a third "Dismiss" button alongside Override/Approve.
5. GUI-8 [HIGH]: 11 modals missing Escape handling. Verified missing today in: `game/modals/shared/NarrowModalShell.tsx`, `mechanics/LightSourceModal.tsx`, `utility/TimeEditModal.tsx`, `dm-tools/SentientItemModal.tsx`, `utility/NetworkSettingsModal.tsx`, `utility/WhisperModal.tsx`, `dm-tools/HandoutModal.tsx`, `dm-tools/DMNotesModal.tsx`, `utility/SharedJournalModal.tsx`, `ui/ConfirmDialog.tsx`. The shared `ui/Modal.tsx:26, 62` already has Escape + cleanup. Two options: (a) add the `useEffect` keydown handler to each, or (b) migrate each modal to render through the shared `Modal` component. Prefer (b) where feasible; fall back to (a) for modals with custom shell layouts.
6. GUI-9 [HIGH]: `components/ui/Modal.tsx:73` puts `overflow-y-auto flex flex-col` on the same element so the header scrolls away with long content. Split into `flex flex-col` wrapper + inner `overflow-y-auto` body, keeping header (and footer if present) as siblings outside the scroll container.
7. GUI-11 [HIGH]: `ShopView.tsx:214-219` (`handleHaggle`) calls `setTimeout(..., 10000)` without storing the ID. Track in a ref, clear in cleanup, and also clear when the user navigates away.

**Acceptance:** Manual smoke test: opening every listed modal and pressing Escape dismisses it. Long modal content keeps the header pinned. Rolling 100 dice in a row reports stable Three.js memory (use `renderer.info.memory` in dev). Mounting/unmounting `DmAlertTray` 10 times leaves `listeners.length === 0`.

### 17f — Type safety

**Files:** `src/main/ipc/ai-handlers.ts`, `src/renderer/src/services/game-actions/action-validator.ts`

**Steps:**

1. TYP-3 [MEDIUM]: `ai-handlers.ts:82` — `aiService.configure(config)` ignores the Zod-narrowed `parsed.data`. Change to `parsed.data`. Same audit at `:165` for `AI_CHAT_STREAM`. This overlaps with 17d step 8 — land both in the same commit.
2. TYP-4 [MEDIUM]: `action-validator.ts:104-106` cast `{ label?: string }` masks the actual `InitiativeEntry` shape. Remove the cast, switch to `e.entityName?.toLowerCase()`. Covered by 17c step 10; left here as a paper-trail entry.

**Acceptance:** `tsc --noEmit` stays at zero errors. The change in step 1 produces no behavioural difference (the schema is a structural superset of the runtime type), confirming the Zod narrowing was already aligned with the IPC contract.

### 17g — Medium / low catalogue

This sub-phase tracks lower-severity items for future cleanup. Not blocking; not part of the live work above. Spot-fix opportunistically when touching neighbouring code.

- 22 Biome `useHookAtTopLevel` warnings spread across 13 files (`PlayerHUDOverlay.tsx`, `ActionEconomyBar.tsx`, `GamePrompts.tsx`, `ReactionPrompts.tsx`, `MountModal.tsx`, `AttackModal.tsx`, `MechanicsModals.tsx`, `UtilityModals.tsx`, `CharacterSheet5ePage.tsx`, `use-game-handlers.ts`, `combat-resolver.ts`, `initiative-slice.ts`, `commands-player-movement.ts`). Fixing GUI-1 clears the ones in `PlayerHUDOverlay.tsx`; the rest need similar early-return-vs-hooks reorders.
- 6 `useExhaustiveDependencies` warnings in `MapCanvas.tsx` (x4), `AoETemplateModal.tsx`, `CraftingBrowser.tsx`, `TablesPanel.tsx`. Triage each — some are intentional stale closures, some are real bugs.
- NET-21 through NET-50 (30 medium network issues) — error handling and validation gaps. May partially close after Phase 30 / 31 routing consolidation.
- GUI-12 through GUI-36 (25 medium GUI issues): loading spinners on async data screens, index keys on reorderable lists (`StatBlockEditor.tsx:93,175,666`, `CompanionsSection5e:188,197,223`, `MagicItemTracker:157,161`), z-index conflicts, focus traps, body scroll lock, modal max-height on small screens, fixed widths (`w-[900px]`, `w-[700px]`, `w-[600px]`), `truncate` without `min-w-0`, draft persistence on close, `isSubmitting` guard, hardcoded `bg-white`/`text-black` in dark mode.
- RUN-10 through RUN-21 (12 medium runtime issues): `Promise.all` failure cascades in `data-provider.ts:678` and `downtime-service.ts:113`; non-null assertions in `data/conditions.ts:40-45`; corrupt-metadata handling in `image-library-storage.ts:124`, `map-library-storage.ts:101`, `shop-storage.ts:104`; HTMLAudioElement pool disposal in `sound-manager.ts:294-298`; module-level `setInterval` cleanup in `ai-service.ts:117`; keyboard shortcut scope; BMO dynamic import error handling.
- LOG-16 through LOG-25 (10 low logical issues): off-by-one on round duration; "(halved)" branch unreachable; `Math.random` vs `cryptoRandom` inconsistencies (`inline-roller.ts:19,22`, `builder/types.ts:44`, `rest-service-5e.ts:446`); standard array default; movement BFS edge cases; standing from prone gating.
- GUI-37 through GUI-44 (8 low GUI issues): minor styling, redundant overflow classes, short-lived setTimeout leaks, dark-mode polish.
- NET-51 through NET-68 (18 low network issues): signaling disconnection handlers, redundant deletes, hardcoded TURN credentials review (NET-28), `lastInviteCode!` non-null assertion, unbounded `imageCache` at `game-sync.ts:13` (consider LRU cap with periodic eviction), preload listener accumulation (`preload/index.ts:136`), `OPEN_DEVTOOLS` exposed in production builds (`preload/index.ts:65`).
- TYP-5 through TYP-7 (3 low type issues): `noImplicitAnyLet` in `chat-links.ts:30,44,57`; non-null assertions; `noRedeclare` shadows.

**Acceptance:** Each item lives here as a reference until pulled into its own focused sub-phase or addressed inline by a touching commit.

## Constraints & edge cases

- Path sanitization is defense-in-depth: validate the format (UUID regex for `campaignId`, allowlist for filenames) AND assert that `path.resolve(base, id).startsWith(base)`. Reject anything that fails either check.
- The UUID regex must accept the format already issued by existing campaigns; verify against a real campaign directory before shipping.
- `win.isDestroyed()` must be checked before any access to `win.webContents`. Reading `webContents` on a destroyed window throws.
- `JSON.parse` fallback: corrupt data should log the file path and return `null`. Audit every `loadJson()` callsite — they currently assume a defined return.
- `getCritThreshold()` needs the attacker's class and level; confirm the attack resolution context carries the resolved character (not the bare token).
- `getCreatureSaveMod()` needs the linked stat block when targeting monsters. Fall back to +0 with a logged warning when the stat block link is missing — better than silently boosting AoE damage.
- Removing the 2014 exhaustion-6 death rule is correct for 2024; if a future "Legacy 2014 mode" campaign setting lands, the rule comes back as a feature flag.
- The `safeHandler` wrapper changes failure semantics from `throw` to `{ success: false, error }`. Audit renderer callsites — some may still expect a rejected promise. Either keep `throw` behaviour for handlers whose callers already do `.catch`, or normalize everywhere and update callers.
- Modal Escape migration: prefer routing through the shared `Modal` component for consistency. Hand-rolled handlers must remember `event.stopPropagation()` to avoid nested-modal accidents.
- NET-5 sites in `host-manager.ts` will move into `GameAuthority` during Phase 30a — the try-catch travels with the move. Land the hardening here; Phase 30 inherits.

## Verification

1. `cd dnd-app && npm run lint` — Biome warnings drop by at least the `useHookAtTopLevel` count in `PlayerHUDOverlay.tsx` (≥10 fewer warnings).
2. `cd dnd-app && npm test` — every targeted suite (combat, initiative, action-validator, AoE, IPC sanitization) passes.
3. `cd dnd-app && npm run typecheck` — zero errors.
4. Manual: close the window mid-stream during an AI chat; main-process log shows no destroyed-window throw.
5. Manual: open every listed modal; Escape dismisses each.
6. Manual: deliberately corrupt one data file in `src/renderer/public/`; app logs the path and degrades gracefully instead of showing a blank screen.
7. Manual: rolling 100 dice in a row keeps `renderer.info.memory.geometries` stable.

## Completed

- **17a (security) — DONE 2026-05-29.** NET-1: `sanitizeCampaignId` (UUID regex + resolved-path-under-base assertion) applied to every campaignId handler that builds a `campaigns/<id>` path (`AI_LIST/READ/CLEAR_MEMORY` incl. the `fs.rm` deletion vector, + SAVE/RESTORE/LOAD/DELETE_CONVERSATION). NET-12: `CHARACTER_RESTORE_VERSION` rejects separators/`..`/null-byte + requires `.json`. NET-13: `BOOK_IMPORT`/`BOOK_READ_FILE` reject `..`/null-byte. NET-15: `FS_WRITE_BINARY` enforces `MAX_WRITE_CONTENT_SIZE`. NET-16: `AUDIO_PICK_FILE` stats-then-reads under `MAX_READ_FILE_SIZE` in try-catch. NET-14: already covered by the Phase 14b `installOllama` temp-dir/`.exe` guard.
- **17b (crash prevention) — DONE 2026-05-29.** NET-2/3: `sendToWindow` helper (`win && !win.isDestroyed()`) replaces all 7 `win?.webContents.send` sites in `ai-handlers.ts`. RUN-1/NET-7: `GAME_LOAD_JSON` wraps `JSON.parse` in try-catch → logs path + returns `null`. GUI-1: `PlayerHUDOverlay` hooks all moved above the `if (!character)` early return (`char5e` null-safe; early return + non-hook derived values below the last hook) — zero `useHookAtTopLevel` warnings. RUN-7 (17d, done here): `DIALOG_SAVE`/`DIALOG_OPEN` use the parent-less dialog overload when no window exists. 4-gate green (vitest 6471).
- 17b Step 3 — PARTIAL — `PlayerHUDOverlay.tsx:82` still returns above hooks at `:86, :96, :118, :153+`. NOT done. ← SUPERSEDED (done above).
- **17c (game logic) — PARTIAL 2026-05-29 (quick wins done; deeper combat items remain).** DONE: LOG-2 (`doubleDiceInFormula` `g` flag — every dice group doubles on crit), LOG-8 (removed the 2014 "exhaustion 6 = death" trigger from `conditions-slice` add/update + dead helper; 2024 uses the cumulative −2 in `attack-condition-effects`), LOG-10 (`removeFromInitiative` tracks the active entry by id, not index — removing a pre-active entry no longer mis-advances the turn), LOG-12/TYP-4 (`action-validator` `remove_from_initiative` reads `entityName`, not the bogus `{label}` cast). 4-gate green (vitest 6471). **REMAINING (deeper, need attacker-type/context verification):** LOG-1 (Champion crit threshold — the resolver paths pass a sidebar stat block, not `Character5e`; needs verifying a `Character5e` is in scope at each crit site before wiring `getCritThreshold`), LOG-3 (melee range over all occupied cells), LOG-4 (AoE saves + target modifier), LOG-5 (cone geometry via `getConeCells`), LOG-7 (thrown-at-range), LOG-13 (executeNextTurn post-advance index), LOG-14/15 (async data-loader boot gate).
- 17e Step 5 — PARTIAL — Shared `Modal.tsx:26, 62` has Escape; the 11 listed modals still lack it. NOT done.
- 17c Step 7 — DONE (`creature-actions.ts:580-599`) — `executeLongRest` reduces exhaustion by 1 (or removes if at 1), matching `rest-service-5e.ts`. Closes LOG-6.
- 17e Step 3 setup — DONE (`DiceRenderer.tsx:22, 184-189`) — `disposeObject3D` helper exists and is called before `scene.remove`. Remaining GUI-4 work in `dice-textures.ts` and `dice-physics.ts` is still PARTIAL — see live step.
- 17b Step 2 — partially mitigated (`game-data-handlers.ts:24` adds path-traversal check) — the `JSON.parse` at `:29` is still unguarded. Live work remains.
- 17a Step 1 — PARTIAL — `AI_READ_MEMORY_FILE` at `ai-handlers.ts:353-356` normalizes and rejects `..` / absolute paths for the `fileName` argument, but `campaignId` itself is still unvalidated across all 10+ handlers. NOT done at the campaignId layer.
- GUI-5 — DONE (`MapCanvas.tsx:383`) — `selectedTokenId: selectedTokenIds[0] ?? null` correctly passes a defined value. Closes GUI-5 (also tracked in Phase 12 Step 17).
- TYP-1 / TYP-2 — DONE (`preload/index.d.ts:237-240, 737-738`) — `discord`, `cloudSync`, `listCloudModels`, `validateApiKey`, `syncWorldState`, `syncCombatState` all declared. Closes TYP-1 and TYP-2.
- SYN-1 — DONE (`chat-links.ts:151-203`) — file uses `React.createElement` instead of JSX; the `.ts` extension is correct and Biome can parse it. Original audit recommendation (rename to `.tsx`) is no longer applicable.
- NET-9 (non-atomic writes) — covered by Phase 7 (atomic write helpers); `ai-service.ts:8, 247` now uses `atomicWriteFileSync`. Remaining issue is the synchronous variant — captured as live step 17d-5.
- 17c reorder fix baseline — DONE (`initiative-slice.ts:316-318`) — `reorderInitiative` tracks the active entry by id. `removeFromInitiative` at `:281-304` still uses index-min and is the active step 17c-8.
