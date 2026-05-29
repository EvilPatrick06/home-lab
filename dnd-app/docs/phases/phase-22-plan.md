# Phase 22 — Codebase Sweep: Accessibility, Leaks, Dependencies, Security

## Context

Phase 22 collects net-new findings from a comprehensive codebase audit (performance, architecture, documentation, dependencies, accessibility, i18n, security). Items owned by other phases (modal a11y, ARIA labels, error-handling convention, big-component timer leaks, god-object split) are NOT duplicated here.

This phase focuses on the unique remaining issues: the accessibility reduced-motion path that has no effect on the UI, a small set of timer/listener leaks in lesser components, dependency hygiene, in-memory map cleanup, the BMO IP / CSP path, production console statements, and missing project files. A second wave folds in audit findings that do not have an owning phase yet: plugin-ID input validation, a CI PR-check workflow, throttle utility, and tracking entries for the larger architectural items (god-object splits, IPC schemas, dead code, magic numbers, CRUD modal pattern, i18n framework).

## Depends on / blocks
- Depends on: none
- Blocks: none
- Coordinates with:
  - Phase 15 Sub-Phase E — explicitly absorbs the `EquipmentTab.tsx` / `SpellsTab.tsx` service-layer bypass (22g). If Phase 15 ships first the issue is structurally fixed and 22g closes as a no-op.
  - Phase 17 (GUI-3, GUI-11) — owns DiceOverlay / ShopView timer cleanup; not duplicated here.
  - Phase 17 / Phase 18 — own modal-shell, ARIA-label, and input-label sweeps; not duplicated here.
  - Phase 30 — extracts `host-handlers.ts` into `GameAuthority`; the console-to-logger swap in that file should land during Phase 30's extraction so the edits do not conflict.

## Files touched

| Path | Role |
|------|------|
| `src/renderer/src/hooks/use-reduced-motion.ts` | Hook to (re-)create — wraps store flag + OS media query |
| `src/renderer/src/stores/use-accessibility-store.ts` | Apply `.reduce-motion` class on root when store flag flips |
| `src/renderer/src/styles/globals.css` | Add `.reduce-motion *` rules mirroring the existing `@media` rule |
| `src/renderer/src/components/sheet/5e/ArmorManager5e.tsx` | Wrap auto-dismiss `setTimeout` calls in `useRef` + cleanup |
| `src/renderer/src/components/sheet/5e/EquipmentListPanel5e.tsx` | Same pattern |
| `src/renderer/src/components/library/AudioPlayerItem.tsx` | Move audio-element listeners into `useEffect` with cleanup |
| `src/renderer/src/components/game/overlays/PlayerHUDOverlay.tsx` | Add `useEffect` unmount cleanup for drag listeners |
| `src/renderer/src/hooks/use-toast.ts` | Track per-toast timeout id; clear on manual dismiss |
| `src/main/ai/ai-service.ts` | Track stream-TTL `setInterval`, clear on `will-quit`; export `removeConversation` |
| `src/main/storage/campaign-storage.ts` | On `deleteCampaign` cascade, call `removeConversation` |
| `src/main/ipc/game-data-handlers.ts` | Wrap `JSON.parse` in try/catch |
| `src/renderer/src/components/library/PdfViewer.tsx` | `console.warn` -> `logger.warn` |
| `src/renderer/src/services/combat/combat-resolver.ts` | `console.warn` -> `logger.warn` |
| `src/renderer/src/events/system-chat-bridge.ts` | `console.error` -> `logger.error` |
| `src/main/ipc/plugin-handlers.ts` | Validate plugin ID format before file-path use |
| `src/renderer/src/utils/throttle.ts` | New — shared throttle utility |
| `.github/workflows/pr-checks.yml` | New — lint + type-check + test on every PR |
| `package.json` | Drop unused `immer` |
| `LICENSE` (dnd-app project root) | Create ISC license text |
| `CHANGELOG.md` (dnd-app project root) | Create initial release log |

## Sub-phase summary

| # | Sub-phase | Theme |
|---|-----------|-------|
| 22a | Reduced-motion wiring | Make the accessibility store flag actually affect the UI |
| 22b | Remaining timer / listener leaks | ArmorManager, EquipmentListPanel, AudioPlayerItem, PlayerHUDOverlay, use-toast, ai-service interval |
| 22c | Dependency hygiene | Drop unused `immer` |
| 22d | ConversationManager map cleanup | Delete in-memory conversation when campaign is deleted |
| 22e | Production console statements | Route through `logger` |
| 22f | Main-process robustness | JSON.parse try/catch in game-data-handlers |
| 22g | Service-layer bypass | Coordinate with Phase 15 Sub-Phase E — see Constraints |
| 22h | Missing project files | LICENSE, CHANGELOG |
| 22i | Plugin ID validation | Validate `pluginId` format in main-process handlers |
| 22j | PR-check CI workflow | Lint + type-check + test on every push / pull request |
| 22k | Shared throttle utility | Standardize rate-limiting across rapid-fire handlers |
| 22l | Audit tracking entries | File log entries for the large architectural items (no inline fix) |

## Sub-phase details

### 22a — Reduced-motion wiring

**Files:** `src/renderer/src/hooks/use-reduced-motion.ts` (new), `src/renderer/src/stores/use-accessibility-store.ts`, `src/renderer/src/styles/globals.css`

**Steps:**
1. (Re-)create `src/renderer/src/hooks/use-reduced-motion.ts` exporting `useReducedMotion(): boolean` that returns `useAccessibilityStore((s) => s.reducedMotion) || window.matchMedia('(prefers-reduced-motion: reduce)').matches`. The store-flag path at `src/renderer/src/stores/use-accessibility-store.ts:82` already initializes from the OS media query.
2. In `src/renderer/src/stores/use-accessibility-store.ts:99`, after `set({ reducedMotion: v })`, also toggle `document.documentElement.classList.toggle('reduce-motion', v)`. Apply once at module init (after `saved.reducedMotion` resolution near line 82) so the class reflects persisted state on app start.
3. In `src/renderer/src/styles/globals.css:65-75`, add a sibling block mirroring the `@media (prefers-reduced-motion: reduce)` rule:
   ```css
   .reduce-motion *, .reduce-motion *::before, .reduce-motion *::after {
     animation-duration: 0.01ms !important;
     animation-iteration-count: 1 !important;
     transition-duration: 0.01ms !important;
     scroll-behavior: auto !important;
   }
   ```
4. Add `useReducedMotion()` calls to JS-animation orchestrators that CSS cannot reach: `DiceOverlay.tsx` (already reads `useAccessibilityStore.getState().reducedMotion` at line 155 — refactor to use the hook), the fog-overlay / weather-overlay / token-animation / combat-animations modules. Where the JS already runs a CSS transition, the new `.reduce-motion` class will handle it; where the JS drives PixiJS tickers or RAF loops, branch to the instant-result path.

**Acceptance:** Flip the in-app `reducedMotion` setting in `SettingsPage` — `<html>` element gets / loses the `reduce-motion` class. CSS transitions on toasts, dice popovers, and modals run at 0.01ms. 3D dice still display rolled values without playing the physics animation. OS-level `prefers-reduced-motion` continues to default the store as it does today.

### 22b — Remaining timer / listener leaks

**Files:** `src/renderer/src/components/sheet/5e/ArmorManager5e.tsx`, `EquipmentListPanel5e.tsx`, `AudioPlayerItem.tsx`, `PlayerHUDOverlay.tsx`, `use-toast.ts`, `src/main/ai/ai-service.ts`

**Steps:**
1. `src/renderer/src/components/sheet/5e/ArmorManager5e.tsx:62,158` — wrap each `setTimeout(() => setBuyWarning(null), 4000)` and `setTimeout(() => setCustomCostError(null), 3000)` with a shared `useRef<ReturnType<typeof setTimeout>>()`. Clear the ref before each new schedule and in a `useEffect(() => () => clearTimeout(ref.current), [])` cleanup.
2. `src/renderer/src/components/sheet/5e/EquipmentListPanel5e.tsx:203` — same pattern.
3. `src/renderer/src/components/library/AudioPlayerItem.tsx:59-69` — move the three `audio.addEventListener('loadedmetadata' | 'error' | 'ended', ...)` calls out of the `handleToggle` click handler and into a `useEffect` keyed on `path`; capture the listener functions in named consts and return a cleanup that calls `removeEventListener`. The audio element should be constructed eagerly (or via ref) so the effect can attach listeners deterministically.
4. `src/renderer/src/components/game/overlays/PlayerHUDOverlay.tsx:62-75` — the inline `onMove` / `onUp` remove themselves on mouseup but stay on `window` if the component unmounts mid-drag. Hoist `onMove` / `onUp` into refs or component scope, and add `useEffect(() => () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }, [])` so unmount during drag cleans both listeners.
5. `src/renderer/src/hooks/use-toast.ts:39` — `setTimeout(() => dismissToast(id), duration)` is not cleared if the user dismisses the toast manually. Maintain a module-level `Map<string, ReturnType<typeof setTimeout>>`. In `addToast` store the timeout id keyed by toast id. In `dismissToast` call `clearTimeout` and delete the entry before splicing the toast.
6. `src/main/ai/ai-service.ts:117` — assign the `setInterval(...)` to a top-level handle and clear it inside an `app.on('will-quit', () => clearInterval(handle))` listener (register the handler from `ai-service` module init, or expose a `disposeAiService()` called by `src/main/index.ts` quit path).

**Acceptance:** Unit / smoke check: mount + immediately unmount each component during the warning / drag / audio-load lifecycle, assert no listeners remain (`document` / `window` listener count unchanged). Toast manually dismissed before duration expires — no stale `setState` warning. App quit logs no orphan-interval warnings.

### 22c — Dependency hygiene

**Files:** `package.json`

**Steps:**
1. `package.json:195` — `immer` is still listed (`^11.1.4`) but no source file imports it. Run `npm uninstall immer` and verify `npm ls immer` shows nothing (or only intentional transitive consumers).

**Acceptance:** `package.json` no longer lists `immer` in `dependencies`. `package-lock.json` regenerated. `npm run lint` + `tsc --noEmit -p tsconfig.web.json` + `tsc --noEmit -p tsconfig.node.json` pass.

### 22d — ConversationManager map cleanup

**Files:** `src/main/ai/ai-service.ts`, `src/main/storage/campaign-storage.ts`

**Steps:**
1. `src/main/ai/ai-service.ts:76` — the module-level `const conversations = new Map<string, ConversationManager>()` grows monotonically. Export `removeConversation(campaignId: string): void` that calls `conversations.delete(campaignId)` and aborts any active streams for that campaign.
2. `src/main/storage/campaign-storage.ts:140` — in the cascade block (after the on-disk `ai-conversations/<id>.json` is removed), import and call `removeConversation(id)` from `ai-service`. If the import creates a circular cycle, dispatch via an EventEmitter or a small registration table at module init.

**Acceptance:** Delete a campaign — its key is removed from the in-memory `conversations` Map. Re-creating a campaign with the same ID yields a fresh `ConversationManager`. Existing `conversation-manager.test.ts` continues to pass; add one test that exercises the delete path.

### 22e — Production console statements

**Files:** `src/renderer/src/components/library/PdfViewer.tsx`, `src/renderer/src/services/combat/combat-resolver.ts`, `src/renderer/src/events/system-chat-bridge.ts`

**Steps:**
1. `src/renderer/src/components/library/PdfViewer.tsx:15` — replace `console.warn('[PdfViewer] Failed to load worker, ...', err)` with `logger.warn(...)` imported from `src/renderer/src/utils/logger.ts`.
2. `src/renderer/src/services/combat/combat-resolver.ts:914` — replace `console.warn('[CombatResolver] applyDamageToToken: ...')` with `logger.warn(...)`.
3. `src/renderer/src/events/system-chat-bridge.ts:32` — replace `console.error('[SystemChatBridge] Handler error:', e)` with `logger.error(...)`.

(The original H4 list also called out `host-handlers.ts:132, 161` for buy / sell payload validation logs; those specific call sites have already been re-shaped — payload validation now lives upstream and the two warnings no longer exist. The remaining `host-handlers.ts` warnings — `senderId mismatch`, `Invalid payload for`, `spectator drop`, trade / inspect mismatches — should be swept during Phase 30's `GameAuthority` extraction so the file is not edited twice.)

**Acceptance:** `grep -n "console.warn\|console.error" src/renderer/src/{components/library/PdfViewer.tsx,services/combat/combat-resolver.ts,events/system-chat-bridge.ts}` yields zero hits. Dev mode still surfaces these messages (logger gates on `import.meta.env.DEV`).

### 22f — Main-process robustness

**Files:** `src/main/ipc/game-data-handlers.ts`

**Steps:**
1. `src/main/ipc/game-data-handlers.ts:29` — `JSON.parse(content)` runs outside any try / catch. A malformed JSON file in the data directory crashes the IPC handler. Wrap in try / catch and return a structured failure (or `{ success: false, error: ... }` matching neighbouring handlers); log via `logToFile` so callers and the journal both see the bad file path.

**Acceptance:** Drop a syntactically invalid JSON into a data path under user-data and trigger the loader — the handler returns an error result instead of crashing the main process. Unit test added with a stubbed `readFile` returning `'{not-json'`.

### 22g — Service-layer bypass — coordinate with Phase 15

**Files:** `src/renderer/src/components/game/sidebar/EquipmentTab.tsx`, `src/renderer/src/components/game/sidebar/SpellsTab.tsx`

**Steps:**
1. Phase 15 Sub-Phase E (`docs/phases/phase-15-plan.md:1042-1055`) explicitly enumerates both files in its sweep list and absorbs this fix. **Verification step:** before starting work here, re-grep Phase 15's file list to confirm both files are still listed; if so, this sub-phase is a no-op and is closed when Phase 15 E lands.
2. If Phase 15 slips: interim fix is to route `EquipmentTab.tsx:18` and `SpellsTab.tsx:93` through `useLibraryEntries('equipment'|'spells')` (NOT through `data-provider.load5e*`; per Phase 15 Option 3, `data-provider` remains a non-React access layer and components consume the library store directly).

**Acceptance:** `grep "window.api.game.load(Equipment|Spells)" src/renderer/src/components/game/sidebar/` returns no hits. Either Phase 15 E moved the file, or this phase replaced the call site with `useLibraryEntries`.

### 22h — Missing project files

**Files:** `dnd-app/LICENSE`, `dnd-app/CHANGELOG.md`

**Steps:**
1. Create `dnd-app/LICENSE` containing the standard ISC license text (matching `package.json:license = "ISC"`), copyright owner and year per repo convention. The repo-root `LICENSE` already exists at `/home/user/home-lab/LICENSE`; this is a project-local copy so it ships with electron-builder packages and is visible to users.
2. Create `dnd-app/CHANGELOG.md` with the standard "Keep a Changelog" header and a single initial entry covering the current version (per `package.json:3`). Going forward `scripts/release/cut.mjs` should append per-tag sections (separate ask — not in scope here).

**Acceptance:** `ls dnd-app/LICENSE dnd-app/CHANGELOG.md` both exist. License-checker (`npm run check:release`-adjacent) does not flag the package as unlicensed.

### 22i — Plugin ID validation

**Files:** `src/main/ipc/plugin-handlers.ts`

**Steps:**
1. Add a `validatePluginId(id: unknown): string` helper at the top of `src/main/ipc/plugin-handlers.ts` (or import from a `src/main/security/` module) that asserts `typeof id === 'string'`, length 1-64, matches `/^[a-z0-9][a-z0-9-_.]{0,63}$/i`. Reject anything else with a `StorageResult` error result.
2. Call `validatePluginId(id)` at the top of every handler that receives a `pluginId` argument and uses it to construct a file path (install / uninstall / load / read-storage / write-storage). Returning early on rejection prevents path-traversal or namespace-bloat via `../`, `../../`, or unicode tricks.
3. Add a unit test in `src/main/__tests__/plugin-handlers.test.ts` (create if missing) that feeds `'../etc/passwd'`, `''`, `'a/b'`, `'a'.repeat(200)`, `null`, `undefined`, and a valid id — assert the four malformed inputs return error results.

**Acceptance:** Sending `pluginId = '../../foo'` via the renderer bridge results in a structured error rather than a file under `userData/../../foo`. Unit test passes. No regressions on valid IDs.

### 22j — PR-check CI workflow

**Files:** `.github/workflows/pr-checks.yml` (new)

**Steps:**
1. Create `.github/workflows/pr-checks.yml` triggered on `pull_request` and `push` to non-tag refs. Steps: checkout, `actions/setup-node@v4` with the project's pinned Node major, `npm ci`, `npm run lint`, `tsc --noEmit -p tsconfig.web.json`, `tsc --noEmit -p tsconfig.node.json`, `npm test`.
2. Use the same gates `cut.mjs` runs locally to avoid drift between local pre-tag checks and CI PR checks. Surface failures as required status checks on `main`.

**Acceptance:** Open a PR with a deliberate lint error — the new workflow fails the PR. Fix the error — workflow goes green. Tag-push release workflow is untouched.

### 22k — Shared throttle utility

**Files:** `src/renderer/src/utils/throttle.ts` (new), `src/renderer/src/utils/__tests__/throttle.test.ts` (new)

**Steps:**
1. Create `src/renderer/src/utils/throttle.ts` exporting `throttle<T extends (...args: any[]) => void>(fn: T, ms: number): T` with leading-edge + trailing-call semantics matching common lodash usage. Type the return precisely so call sites stay strict.
2. Add a `cancel()` method (or `flush()`) on the returned function so callers can clear pending invocations during teardown / unmount.
3. Write a `throttle.test.ts` covering: rapid burst -> single leading call within window, trailing call after window elapses, cancel before trailing fires, ms = 0 short-circuit.
4. Sweep candidate call sites (do NOT batch them all in this sub-phase — just enable the utility): window-resize listeners in `GameLayout.tsx`, scroll handlers in `PdfViewer.tsx`, rapid token-drag in `MapCanvas.tsx`. Each conversion can be a follow-up commit; the utility landing is the deliverable here.

**Acceptance:** New file passes type-check and tests. Lint clean. No existing call sites need to import it yet — it is opt-in.

### 22l — Audit tracking entries

**Files:** `docs/SUGGESTIONS-LOG-DNDAPP.md`, `docs/ISSUES-LOG-DNDAPP.md`

**Steps:**
1. Append one entry per item below to the appropriate dnd-app log. Each entry follows `docs/LOG-INSTRUCTIONS.md`: severity, category, file paths, summary, recommendation. Do not fix inline.
   - **God-object files**: `PdfViewer.tsx` (~1,833 lines), `data-provider.ts` (~1,162), `DowntimeModal.tsx` (~1,131), `library-service.ts` (~1,095), `GameLayout.tsx` (~1,030), `combat-resolver.ts` (~955), `client-handlers.ts` (~879), `MapCanvas.tsx` (~838), `import-dnd-beyond.ts` (~727), `build-character-5e.ts` (~664). Suggest follow-up phases per file. Note: `host-handlers.ts` and `combat-resolver.ts` split are already tracked in Phase 30.
   - **Inline style objects**: `ChatPanel.tsx:276-290,311-318`, `PdfViewer.tsx:1606,1713,1735,1756`, `GameLayout.tsx:565,590,604`, `LibraryItemList.tsx:82,92`, `EquipmentShop5e.tsx:121,129`. Move static values to CSS classes.
   - **Static JSON eager imports**: 14 files (see audit) — convert to lazy load via `data-provider.ts` for modals that may never open.
   - **Limited `React.memo`**: only 5 components memoized; identify hot list rows (initiative tracker, equipment lists, spell lists, token overlays) for memoization sweep.
   - **`~138 unused exports + 10 unused files`** (knip output): `constants/index.ts`, `network/index.ts`, `types/index.ts`, `types/user.ts`, 5+ files under `components/library/` (`HomebrewCreateModal`, `LibraryCategoryGrid`, etc.). Curate API surface vs prune.
   - **Scattered magic numbers**: enumerate the audit's file list (`GameLayout.tsx`, `ai-memory-sync.ts`, `use-ai-dm-store.ts`, `use-game-effects.ts`, `UpdatePrompt.tsx`, `client-manager.ts`, `PdfViewer.tsx`, `PlayerList.tsx`). Migrate to `app-constants.ts` or domain modules.
   - **Repeated CRUD modal pattern**: `SharedJournalModal`, `HandoutModal`, `RuleManager`, `LoreManager`, `NPCManager`. Propose generic `CRUDModal<T>` / `useCrudModal`.
   - **Repeated async-data-loading hook**: propose `useAsyncData<T>(loader, deps)` to standardize cancellation + error states.
   - **IPC channel-to-schema gap**: ~100 channels in `ipc-channels.ts` vs 3 Zod schemas in `ipc-schemas.ts`. Plan to backfill schemas per domain.
   - **Inconsistent error handling**: 4 patterns (throw / null / `StorageResult` / silent-catch). Pick a convention and migrate.
   - **Package overrides** (7 entries in `package.json:overrides`): document why each is pinned; re-check on every dep bump.
   - **Color-only state indicators**: `MainMenuPage`, `HigherLevelEquipment5e`, `RuleManager`, `TurnEventsTab`, `MacroBar`. Pair color with text / icon / aria-label.
   - **Mouse-only interactions**: `PdfDrawingOverlay`, `HandoutViewerModal`, `ResizeHandle`, `DiceTray`, `PlayerHUDOverlay`, `LanguagesTab5e`. Add keyboard equivalents.
   - **Form validation announcements**: `StatBlockEditor`, `DiseaseCurseTracker`, `AiProviderSetup` and most inline modal forms use custom error markup without `aria-invalid` / `aria-describedby`.
   - **i18n**: no framework installed; all UI strings hardcoded English; date / number formatting relies on browser locale (`toLocaleDateString()` etc.); D&D currency labels (`"25 gp"`) hardcoded; no RTL support.
   - **Documentation gaps**: README is boilerplate; no CONTRIBUTING.md; no TypeDoc / Storybook; no IPC surface doc; no `GameSystemPlugin` developer guide.
   - **Test coverage gaps**: `systems/dnd5e/` only `registry.test.ts`; no modal / form / keyboard-navigation integration tests; limited `src/main/` coverage; no WebRTC reconnection tests; no accessibility tests. `vitest.config.ts` only measures `services/` and `data/`.
   - **Multi-floor unimplemented**: `FloorSelector.tsx` + `currentFloor` state exist but never affect token visibility / layer filtering / rendering.
   - **Positional audio emitters never updated**: `audio-emitter-overlay.ts:updateEmitters` is never called.
   - **Large public-dir assets**: `monsters.json` (~32k lines), 130+ MP3s under `public/sounds/`. Consider CDN / lazy-download.
   - **Security: `.env` API key rotation**: an Anthropic key has been observed in a local `.env`. Even though gitignored, recommend rotation if it has ever entered logs / screenshots / error reports. Log to `SECURITY-LOG.md` (NOT to a public log).

**Acceptance:** Each item above appears once in the appropriate log with file paths and a one-line recommendation. The security item lands in `docs/SECURITY-LOG.md` (gitignored). No code changes in this sub-phase — pure documentation.

## Constraints & edge cases

- **Reduced motion vs PixiJS / Three.js**: CSS rules do not reach the WebGL canvas. The `useReducedMotion()` hook must be checked in the React component that drives each ticker — skip the animation call, but always render the final state.
- **Dice 3D**: when reduced-motion is on, the result must still be shown (which dice, which faces). Only the throw animation is suppressed.
- **AudioPlayerItem listener move**: the existing code creates the `<audio>` element lazily inside the click handler. The fix changes ownership to a ref initialized in a `useEffect` keyed on `path`; do not eagerly construct `new Audio(path)` when `path` is empty (see the `hasPath` guard at line 51).
- **PlayerHUDOverlay**: drag start currently re-binds new closures on every mousedown. The unmount-cleanup useEffect must reference the same `onMove` / `onUp` instances that were attached — store them in refs.
- **ai-service interval**: the interval is declared at module scope, so it survives renderer reloads. Cleanup must happen on Electron `will-quit`, not on renderer navigation.
- **Conversation map cleanup circular import**: if importing `removeConversation` from `ai-service` into `campaign-storage` creates a cycle, prefer a tiny event-bus / registration table in a third module, or hoist the Map ownership out of `ai-service`.
- **License-file collision**: the repo root already has `LICENSE` — the new `dnd-app/LICENSE` is intentional duplication scoped to the dnd-app package. Do not delete the repo-root file.
- **Plugin ID regex**: keep the allowed character set conservative (lowercase + digits + `-_.`). Tighter than necessary on day 1 is fixable; permissive is hard to walk back without breaking installed plugins.
- **PR-check workflow caching**: cache `~/.npm` keyed on `package-lock.json` hash so CI installs do not dominate the wall-clock time.
- **Throttle vs debounce**: this phase ships throttle only; existing debounce implementations (auto-save 2-5s, vision recompute) stay. They are not interchangeable.

## Verification

- `npm run lint`
- `npm run test`
- `tsc --noEmit -p tsconfig.web.json && tsc --noEmit -p tsconfig.node.json`
- `npm run check:release` before tagging
- Manual smoke: toggle reduced-motion in settings, dismiss a toast early, mount / unmount AudioPlayerItem mid-load, mount / unmount PlayerHUDOverlay mid-drag, delete a campaign, drop a malformed JSON into a data path, send a malformed `pluginId` via the renderer bridge, open a PR with a lint error to verify the new workflow.

## Completed

> **PHASE 22 COMPLETE (22a–22l) — 2026-05-29.** Full 4-gate green (lint 0, tsc web+node 0, vitest 6503/6503).
> - **22a** — `useReducedMotion()` hook; store toggles `.reduce-motion` on <html> (setter + init + OS-change); globals.css `.reduce-motion *` block; DiceOverlay reads via ref.
> - **22b** — leaks fixed: use-toast per-toast timer map; ai-service stale-stream interval cleared via `disposeAiService()` on will-quit; ArmorManager5e / EquipmentListPanel5e setTimeout refs + unmount clear; AudioPlayerItem `<audio>`+listeners in path-keyed effect; PlayerHUDOverlay drag listeners in a ref with unmount cleanup.
> - **22c** — dropped unused `immer`.
> - **22d** — `removeConversation()` evicts the in-memory map; deleteCampaign cascade calls it (dynamic import avoids cycle).
> - **22e** — PdfViewer / combat-resolver / system-chat-bridge `console.*` → `logger`.
> - **22f** — verified GAME_LOAD_JSON already wraps JSON.parse (17b); no change.
> - **22g** — no-op: EquipmentTab/SpellsTab use the data-provider access layer (boundary-test compliant); no `window.api.game.load*` bypass exists.
> - **22h** — `dnd-app/LICENSE` (ISC, ships) + `CHANGELOG.md`.
> - **22i** — `PluginIdSchema` tightened to `/^[a-z0-9][a-z0-9-_.]{0,63}$/i` (≤64); `parsePluginId` exported + tested (traversal/empty/separator/overlong/leading-dash/null/undefined rejected).
> - **22j** — satisfied by Phase 21 `ci.yml` (lint+typecheck+test on push/PR); no duplicate `pr-checks.yml` (would just double CI runtime).
> - **22k** — `utils/throttle.ts` (leading+trailing, `cancel()`, `ms<=0` passthrough) + tests; opt-in, no call sites converted.
> - **22l** — audit tracking entries logged to SUGGESTIONS-LOG-DNDAPP.md; `.env` key-rotation item to gitignored SECURITY-LOG.md.

### Pre-existing (earlier-session) stamps

- 22 H2 Step 3 — DONE (`package.json`) — `@pixi/react` and `@tiptap/extension-image` removed from `dependencies`.
- 22 H3 Step 4 — DONE (`package.json`) — `@langchain/langgraph` moved to `devDependencies`; `@langchain/anthropic` and `@langchain/core` removed entirely.
- 22 H5 (DiceRenderer subset) — DONE — owned by Phase 17 (GUI-3); not in scope here.
- 22 H5 (ShopView subset) — DONE — owned by Phase 17 (GUI-11); not in scope here.
- 22 M2 Step 12 — DONE (`src/main/plugins/plugin-installer.ts:8`) — PowerShell `Expand-Archive` replaced with `extract-zip` (yauzl, zip-slip protected, no shell exec).
- 22 M3 Step 13 — DONE (`src/main/index.ts:134`, `src/main/bmo-csp.ts:43`, `src/main/bmo-config.ts`) — hardcoded `10.10.20.242` replaced with `bmoCspConnectFragment()` reading `BMO_PI_URL` env / settings, plus discovered Bonjour URL.
- 22 M4 (host-handlers buy / sell subset) — DONE — payload-validation logs removed when validation moved upstream; `host-handlers.ts:132, 161` no longer exist. Remaining `host-handlers.ts` console calls (sender mismatch, spectator drop, etc.) deferred to Phase 30 extraction.
- 22 M5 (repo-root LICENSE) — DONE (`/home/user/home-lab/LICENSE`) — repo-level license file exists; project-local `dnd-app/LICENSE` still NEEDED (22h).
- 22 Step 18 (Electron 40 EOL planning) — DROPPED from this plan — tracking-only item, no implementation steps; record in `docs/SUGGESTIONS-LOG-DNDAPP.md` rather than a phase live step.
- 22a Step 1 (useReducedMotion hook) — PARTIAL — `globals.css:66` already has the `@media (prefers-reduced-motion: reduce)` rule; store at `use-accessibility-store.ts:82` reads OS preference and tracks live changes at lines 138-145; `DiceOverlay.tsx:155` consults `reducedMotion`. Still NEEDED: hook file (`use-reduced-motion.ts` is absent), `.reduce-motion` class toggle in store setter, application to other JS animations.
