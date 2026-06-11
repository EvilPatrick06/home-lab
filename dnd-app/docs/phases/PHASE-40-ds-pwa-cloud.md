# PHASE-40 — dungeon-scholar: offline-first PWA, encrypted per-tome notes, cloud-data hardening

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Make dungeon-scholar a real installable, offline-first PWA (today the README *calls* it a PWA but there is no manifest, no service worker, no icons, no install metadata), add an encrypted per-tome personal-notes feature (WebCrypto PBKDF2 → AES-256-GCM, passphrase-derived key, payload rides the existing Supabase save blob so RLS + Realtime sync come for free), and harden the cloud/data plumbing around it: close the untested cloudSync conflict/echo branches with real tests (and fix a Tailwind-migration-induced listener leak found in the same hook), cap tome-import JSON size before `JSON.parse`, defensively copy the study-deck prop arrays, and stop the procedural-audio `AudioContext` from keeping the audio thread alive while the page is hidden (iOS battery). Everything in this phase is dungeon-scholar-only; no dnd-app or bmo files are touched.

## Dependencies & cross-phase notes

- **Depends on PHASE-39** (`PHASE-39-ds-architecture.md`): PHASE-39 splits `dungeon-scholar/src/App.jsx` (10,875 lines as of 2026-06-10) into feature modules, code-splits the study modes, and adds a browser router (F4). Consequences for this phase:
  - Every `App.jsx` line citation below is a **2026-06-10 snapshot**. Before each sub-phase, re-locate the target with the given grep command — the code may have moved into a `features/` module. The logic verified below is what matters, not the line number.
  - The PHASE-39 router makes deep links real URLs; the service worker's `navigateFallback` (sub-phase 40G) must serve `index.html` for those routes. vite-plugin-pwa does this by default, but verify against the built `dist/sw.js` after 39's router exists.
- **Phases 17/18/19 ran earlier and touched the same files**: PHASE-17 edits `src/audio/sound.js` (M10 quota-failure surfacing) and `App.jsx` (bug round); PHASE-18 edits `src/services/cloudSync.js` (L9 channel-name hashing) and adds `src/services/logger.js`; PHASE-19 edits `sound.js` (L16 unmute banner), `App.jsx` (a11y), and extracts a shared `Modal` wrapper (H4). Re-verify those files' current shape before editing. If PHASE-19's `Modal` wrapper exists (`grep -rn "role=\"dialog\"" dungeon-scholar/src/components/`), the new notes modal in 40F must use it instead of hand-rolling dialog markup.
- **PHASE-41 builds on 40E**: PHASE-41's F3 ("sealed" proctored tomes) needs passphrase/key-based encryption of tome content. The `notesCrypto.js` service in 40E is deliberately written as a generic string-payload encrypt/decrypt module (not notes-specific) so PHASE-41 can reuse it. Do not bake notes-only assumptions into its API.
- **Coordinate on `dungeon-scholar/vite.config.js`**: PHASE-39 (chunk-size work) and this phase (VitePWA plugin) both edit it. This phase only *adds* the plugin + leaves the existing `base`/`manualChunks`/`test` blocks untouched.
- No other pending phase touches `dungeon-scholar/`.

## Verified findings

All verification was run 2026-06-10 against the live tree at the repo root. dungeon-scholar facts that hold for every finding:

- `dungeon-scholar/package.json`: React 19.2, Vite **^8.0.14 (Rolldown-based)**, Vitest ^4.1.5, happy-dom env, `@supabase/supabase-js` ^2.105.1, Tailwind 4. Scripts are only `dev/build/preview/test/test:watch` — there is **no lint script**; the quality gates for this domain are `npm test` (vitest) and `npm run build`.
- `dungeon-scholar/vite.config.js:11` — `const BASE = process.env.VITE_BASE || '/dungeon-scholar/'`; the owner deploy sets `VITE_BASE=/home-lab/` in `.github/workflows/deploy.yml`. Vite 8 note at `vite.config.js:23-24`: Rolldown requires the *function* form of `manualChunks`.
- Node on the build/dev machine is v22.22.2 (`node -v`); `node -e "console.log(typeof crypto.subtle)"` → `object`, so WebCrypto is available natively in vitest tests.

### F6 — Offline-first PWA: nothing PWA-shaped exists today

Verification commands and what they showed (2026-06-10):

```bash
cat dungeon-scholar/index.html
# 12 lines total: charset, viewport, <title>Dungeon Scholar</title>, #root, module script.
# NO manifest link, NO theme-color, NO description, NO apple-* metas, NO icons.
ls dungeon-scholar/public/        # → No such file or directory (no public dir at all)
grep -rn "serviceWorker\|workbox\|vite-plugin-pwa" dungeon-scholar/src/ dungeon-scholar/vite.config.js dungeon-scholar/package.json
# → no hits. No service worker, no plugin.
```

- The app is a pure client-side SPA. The only runtime network calls are Supabase (via supabase-js) and the Oracle worker (`grep -rn "fetch(" dungeon-scholar/src/ | grep -v test` → single hit, `src/App.jsx:6234`, the Cloudflare Worker URL). The three `tome-*.json` files at the dungeon-scholar root are **not fetched at runtime** — they are samples for manual import; tome content lives inside `playerState.library[].data` in localStorage, so study content is already offline-capable. The PWA work is therefore app-shell caching only (HTML/JS/CSS/icons), no tome-JSON runtime caching is needed despite the audit's phrasing.
- No external font/CDN requests: `grep -rn "fonts.googleapis\|@font-face" dungeon-scholar/index.html dungeon-scholar/src/index.css dungeon-scholar/src/main.jsx` → no hits ('Cinzel' in inline styles falls back to Georgia). KaTeX js+css are lazy-loaded *bundle chunks* (`src/components/RichContent.jsx:22-28` dynamic `import('katex')`), as is `DungeonExplore` — the SW precache must include lazy chunks (vite-plugin-pwa's default `globPatterns` does).
- `dungeon-scholar/README.md:73` already claims the app "runs as a pure local PWA" and `README.md:50` tells users to hard-refresh to "bust the service-worker cache" — both false today; F6 makes them true. `README.md:18-20` is stale doc drift: it says "Vite ^7" and explains a `^7` pin that no longer exists (package.json has `vite ^8.0.14`, `@vitejs/plugin-react ^6.0.2`; bump landed in commit `0ca00c94`). Same stale pin advice in the troubleshooting table row `README.md:117`. Fix while editing the README in 40G.
- Deploy: `.github/workflows/deploy.yml` runs `npm ci && npm run test && npm run build` then uploads `dungeon-scholar/dist` via `actions/upload-pages-artifact@v5`. `dist/` is gitignored. Generated `sw.js`/`manifest.webmanifest` ship automatically with the artifact — no workflow change needed.

### F5 — Per-tome encrypted personal notes: green-field feature

```bash
grep -rn "notesCrypto\|crypto.subtle\|deriveKey\|PBKDF2" dungeon-scholar/src/   # → no hits
grep -in "notes" dungeon-scholar/src/App.jsx | grep -iv "footnote\|denotes"    # → no hits
```

No notes feature and no WebCrypto usage exist anywhere. Current state the feature builds on:

- Library entry shape (created in `addTomeToLibrary`, `App.jsx:2748-2755`; locate with `grep -n "const addTomeToLibrary" dungeon-scholar/src/App.jsx`): `{ id, data, addedAt, lastOpened, progress }`. Sibling per-tome mutators to copy the pattern from: `switchActiveTome` (`:2786`), `deleteTome` (`:2797`), `renameTome` (`:2808`), `updateTomeMetadata` (`:2841`) — all `setPlayerState(prev => ...)` with a `library.map`.
- `LibraryScreen` (component at `App.jsx:3732`, mounted at `:3402`) receives per-tome action callbacks (`onDelete`, `onRename`, `onDuplicate`, `onShare`, `onEditMetadata`, `onTogglePin`) — the notes entry point follows the same prop pattern.
- The whole `playerState` blob is what `pushSave` upserts to the Supabase `saves` row (`src/services/cloudSync.js:27-37`) and what Realtime/BroadcastChannel propagate (`src/hooks/usePlayerState.js`). Storing the *encrypted* notes payload inside the library entry means: synced across devices via the existing pipeline, covered by the existing `saves` RLS, included in localStorage persistence and the merge chooser — with **zero cloudSync.js / schema / supabase-setup.md changes**. (The audit's file list named `cloudSync.js`; verification shows the in-blob design needs no change there — this plan corrects that.) Plaintext never leaves the unlocked editor's component state.
- Existing modal precedents: `src/components/PromptModal.jsx`, `AccountPanel.jsx`, `MergeChooser.jsx` (PHASE-19 H4 may have wrapped these in a shared `Modal` — check before building, see Dependencies).

### L18 — cloudSync conflict-branch tests: audit partially stale; one real bug found in the hook

The audit claimed the `wasDirty && cloudTime > lastSyncTime` forced-chooser path and Realtime echo dedup were both untested. Verification (2026-06-10) against `dungeon-scholar/src/hooks/usePlayerState.test.jsx` (335 lines, 17 tests):

- **CORRECTED:** the forced-chooser path **is already tested** — `'cloud changed + local dirty → fires merge chooser (real conflict)'` at `usePlayerState.test.jsx:239-254`, plus both `semanticHashState` identical-content suppression branches (`:294-334`).
- **Still genuinely untested** (confirmed by reading the whole test file — `subscribeSaves` is mocked to a no-op at `:12` and its callback is never captured or invoked):
  1. Realtime echo dedup, all three paths of the `subscribeSaves` callback in `usePlayerState.js:357-377`: (a) fast path — `cloud.updatedAt === lastKnownCloudUpdatedAtRef.current` → skip (`:361`); (b) robust path — incoming `cloud.data` JSON-matches an entry in `recentLocalHashesRef` ring buffer → skip AND advance `lastKnownCloudUpdatedAtRef` (`:366-372`); (c) genuine remote update → `migrateIfNeeded` + `applyBackfills` + `applyRemoteState` (`:373-374`).
  2. BroadcastChannel echo dedup (`usePlayerState.js:202-220`): incoming `{type:'state'}` whose JSON matches a recent local hash is skipped (`:210-213`); a genuinely different state is applied via `applyRemoteState`.
  3. All three `resolveMerge` branches (`usePlayerState.js:379-410`): `'local'` → `pushSave` + sync-meta write; `'cloud'` → `applyRemoteState(cloudPreview)` + follow-up `pullSave` to refresh `lastKnownCloudUpdatedAt`; `'cancel'` → clears chooser state with no push/apply.
- **NEW BUG (not in the audit), fix in 40D:** `usePlayerState.js:231` does `window.addEventListener('blur', onBlur)` but the cleanup at `:235` does `window.removeEventListener('blur-sm', onBlur)` — the blur flush listener is **never removed on unmount** (leak; post-unmount flushes against a stale `latestRef`). Cause confirmed: `git log -1 -S 'blur-sm' -- dungeon-scholar/src/hooks/usePlayerState.js` → `854a4954 2026-05-30 chore(dungeon-scholar): migrate Tailwind 3→4 (via @tailwindcss/upgrade)` — the Tailwind class-rename codemod (`blur` → `blur-sm`) corrupted a DOM event name. Repo-wide check `grep -rn "blur-sm'" dungeon-scholar/src/ | grep -i listener` shows this is the only corrupted listener name.

### L15 — Quiz/Flashcard prop arrays not defensively copied: largely mitigated upstream; residual fallback path remains

Audit cited `App.jsx:4139,4325` — both drifted. Current reality (2026-06-10):

```bash
grep -n "const baseDeck" dungeon-scholar/src/App.jsx
# 4843: const baseDeck = (cardsProp && cardsProp.length) ? cardsProp : (courseSet.flashcards || []);   (FlashcardsMode)
# 5136: const baseDeck = (questionsProp && questionsProp.length) ? questionsProp : (courseSet.quiz || []);  (QuizMode)
grep -n "<FlashcardsMode\|<QuizMode" dungeon-scholar/src/App.jsx   # mounted at 3557 / 3575
```

- **CORRECTED:** the primary deck path is already defensively copied — App-level `shuffledActivities` (`App.jsx:1648-1659`) feeds `cards={shuffledActivities.flashcards}` / `questions={shuffledActivities.quiz}` (`:3560`, `:3578`), and `shuffleArray` (`App.jsx:1117-1124`) is a Fisher-Yates over `[...arr]` — a fresh array, never the tome's own array. `sortByDueness` already `.slice()`s and `filterDue` returns a new filtered array (`src/services/srs.js:120-135`).
- **Residual exposure** (the actual remaining L15 work): the *fallback* branches at `App.jsx:4843` and `:5136` hand the component the raw `courseSet.flashcards` / `courseSet.quiz` arrays — references into `playerState.library[].data`, i.e. persisted state. No code mutates the deck in place today (verified: decks are only `filter`ed/`map`ped/`findIndex`ed), so this is the "cheap future-bug insurance" the audit described, not an active bug.
- Implementation hazard verified: `baseDeck` is recomputed on every render and is a dependency of the `cards`/`questions` `useMemo` (`:4862-4867`, `:5138-5143`) and of the session-restore/persist effects (`:4922`, `:4936`). A naked `.slice()` would mint a new identity every render and re-fire those effects each render. The fix must wrap the copy in `useMemo` keyed on `[cardsProp, courseSet]` so identity stays stable.

### L14 — No size cap on imported tome JSON before `JSON.parse`

Audit cited "import handler ~line 2564" — drifted. Current reality: **three** uncapped import entry points, not one:

```bash
grep -n "JSON.parse" dungeon-scholar/src/App.jsx
# 1017: decodeTomeShareCode — share-code path (base64 → JSON.parse), App.jsx:1009-1021
# 2858: handleImportFile — FileReader path, App.jsx:2852-2874 (no file.size check before readAsText)
# 2883: handlePasteImport — paste path, App.jsx:2876-2895 (no text.length check)
```

- `handleImportFile` (`:2852`) reads any file the user picks with `reader.readAsText(file)` and parses the whole result; `handlePasteImport` (`:2876`) parses arbitrary pasted text; `handleShareCodeImport` (`:2897`) base64-decodes then parses via `decodeTomeShareCode` (`:1009`). A 50 MB input freezes the main thread in `JSON.parse` (and in `atob` for the share-code path). The legit sample tomes are ~100-300 KB (`ls -la dungeon-scholar/tome-*.json`), so a 2,000,000-char cap (audit's number) has >6× headroom.
- There is no existing import-validation service module; the cap helper is new (40A creates `src/services/importLimits.js` so it is unit-testable — `App.jsx`'s component-private handlers cannot be imported by tests).

### L8 — AudioContext never suspended/closed while hidden

Verified against `dungeon-scholar/src/audio/sound.js` (312 lines, all read 2026-06-10):

- A single module-level `ctx` is created lazily in `ensureContext()` (`sound.js:52-73`) and **nothing in the module or the app ever calls `ctx.suspend()` or `ctx.close()`**: `grep -n "suspend\|close()" dungeon-scholar/src/audio/sound.js` → only the *resume*-from-suspended branches (`:68-72`, `:78-85`). There is no `visibilitychange`/`pagehide` handling (`grep -n "visibilitychange" dungeon-scholar/src/audio/sound.js` → none).
- The BGM loop self-reschedules via `setTimeout` (`startBgm`, `:197-216`; `bgmTimer` at `:213`) — while the tab is hidden the (throttled) timer keeps scheduling oscillators into the running context, so the audio thread can't sleep → iOS battery drain. Note `ctx.state` on iOS can also become `'interrupted'` (a WebKit extension state), so resume logic must check `state !== 'running'` rather than `=== 'suspended'` (the existing `ensureContextRunning` at `:78-85` already does this correctly).
- Wiring points: `App.jsx:1386` — `useEffect(() => { armOnFirstGesture(); }, []);` (locate: `grep -n "armOnFirstGesture" dungeon-scholar/src/App.jsx`); BGM is started only by `DungeonExplore` (`src/components/DungeonExplore.jsx:2837 startBgm(biomeId)`). `ensureContext()` rebuilds the whole gain graph when `ctx` is null (`:54-67`), so a `close()`-then-null is safe — the next `playSfx`/`startBgm` recreates everything.
- `sound.js` has **no test file** (`ls dungeon-scholar/src/audio/` → `sound.js` only); 40C adds one. happy-dom does not implement WebAudio, so tests must install a mock `AudioContext` constructor and use `vi.resetModules()` + dynamic import (the module caches `ctx` and loads settings at import time, `:50`).

## Sub-phases

Run in order. Per INSTRUCTIONS.md rule 5, only the listed cheap targeted checks run per sub-phase; the full gate runs once at phase end.

### 40A — Import size caps (L14)

**Objective:** reject oversized tome imports before `JSON.parse`/`atob` on all three entry points.

**Files:** new `dungeon-scholar/src/services/importLimits.js`, new `dungeon-scholar/src/services/importLimits.test.js`, `dungeon-scholar/src/App.jsx` (or the post-PHASE-39 module that now hosts `handleImportFile`/`handlePasteImport`/`handleShareCodeImport`/`decodeTomeShareCode` — locate with `grep -rn "handleImportFile\|decodeTomeShareCode" dungeon-scholar/src/`).

**Steps:**
1. Create `src/services/importLimits.js`:
   ```js
   // Cap on raw tome-import payload size (chars for paste/share-code, bytes for
   // files). Legit tomes are ~100-300 KB; 2,000,000 gives >6x headroom while
   // keeping worst-case JSON.parse work bounded (a 50 MB paste freezes the
   // main thread for seconds).
   export const MAX_TOME_IMPORT_BYTES = 2_000_000;

   /** @returns {{ ok: boolean, message?: string }} */
   export function checkImportSize(size) {
     if (typeof size === 'number' && size > MAX_TOME_IMPORT_BYTES) {
       const mb = (MAX_TOME_IMPORT_BYTES / 1_000_000).toFixed(0);
       return { ok: false, message: `Tome too large — the limit is ${mb} MB` };
     }
     return { ok: true };
   }
   ```
2. `handleImportFile`: before `reader.readAsText(file)`, guard `const sizeCheck = checkImportSize(file.size); if (!sizeCheck.ok) { showNotif(sizeCheck.message, 'error'); e.target.value = ''; return; }`.
3. `handlePasteImport`: first line, guard `checkImportSize(text.length)` → `showNotif(message, 'error'); return false;` on failure.
4. `handleShareCodeImport`: guard `checkImportSize(code.length)` the same way before calling `decodeTomeShareCode` (base64 expands plaintext ~4/3, so the same constant is conservative).
5. Tests in `importLimits.test.js`: exact-boundary (`MAX` ok, `MAX+1` rejected), small value ok, undefined/non-number ok (fail-open for exotic File objects), message mentions the MB limit.

**Cheap check:** `cd dungeon-scholar && npx vitest run src/services/importLimits.test.js`.

**Acceptance:** all three import paths reject >2,000,000 input with a user-visible notif and without invoking `JSON.parse`/`atob`; new test file green.

### 40B — Defensive deck copies (L15)

**Objective:** stable-identity defensive copies of the study-deck arrays at component entry.

**Files:** `dungeon-scholar/src/App.jsx` (post-39: wherever `FlashcardsMode`/`QuizMode` live; locate with `grep -rn "const baseDeck" dungeon-scholar/src/`).

**Steps:**
1. FlashcardsMode (today `App.jsx:4843`):
   ```js
   const baseDeck = useMemo(
     () => ((cardsProp && cardsProp.length) ? cardsProp : (courseSet.flashcards || [])).slice(),
     [cardsProp, courseSet]
   );
   ```
2. QuizMode (today `App.jsx:5136`): same transform over `questionsProp` / `courseSet.quiz`.
3. Do NOT use a bare `.slice()` without `useMemo` — `baseDeck` feeds the `cards`/`questions` memos and the session-restore/persist effects (deps lists at today's `:4867`, `:4922`, `:4936`, `:5143`); an unstable identity re-fires them every render (see Verified findings).

**Cheap check:** `cd dungeon-scholar && npx vitest run` (suite is small/fast; the modes are module-private so no direct component test is possible until PHASE-39's split exports them — if PHASE-39 *did* export them, add a mount test asserting the prop array is not mutated and `baseDeck` identity is stable across a re-render).

**Acceptance:** both fallback branches no longer hand raw `courseSet` arrays to component state; full ds suite stays green.

### 40C — AudioContext lifecycle: auto-suspend when hidden (L8)

**Objective:** suspend the audio context and halt the BGM scheduler while the page is hidden; restore on return; provide an explicit close for teardown.

**Files:** `dungeon-scholar/src/audio/sound.js`, new `dungeon-scholar/src/audio/sound.test.js`, `dungeon-scholar/src/App.jsx` (the `armOnFirstGesture` effect, today `:1386`).

**Steps:**
1. In `sound.js`, add module state `let resumeBiomeId = null; let visibilityHandler = null;` and export:
   ```js
   // iOS battery: while the page is hidden the BGM setTimeout loop keeps
   // scheduling oscillators into a running context, so the audio thread
   // never sleeps. Suspend on hidden, restore on visible.
   export const armAutoSuspend = () => {
     if (typeof document === 'undefined' || visibilityHandler) return;
     visibilityHandler = () => {
       if (document.visibilityState === 'hidden') {
         resumeBiomeId = currentBgmId;
         stopBgm();                       // clears bgmTimer + disconnects nodes
         if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
       } else if (resumeBiomeId && !settings.muted) {
         const biome = resumeBiomeId;
         resumeBiomeId = null;
         startBgm(biome);                 // ensureContextRunning() resumes ctx
       }
     };
     document.addEventListener('visibilitychange', visibilityHandler);
   };
   export const disarmAutoSuspend = () => {
     if (visibilityHandler) {
       document.removeEventListener('visibilitychange', visibilityHandler);
       visibilityHandler = null;
     }
   };
   export const closeAudio = async () => {
     stopBgm();
     if (ctx) {
       try { await ctx.close(); } catch { /* already closed */ }
       ctx = null; masterGain = null; bgmGain = null; sfxGain = null;
     }
   };
   ```
   Notes: `startBgm` already awaits `ensureContextRunning()` which resumes any non-`running` state (covers iOS `'interrupted'`); `ensureContext()` rebuilds the gain graph after `closeAudio()` nulls `ctx`, so close is non-destructive for later playback.
2. In `App.jsx`, extend the existing mount effect: `useEffect(() => { armOnFirstGesture(); armAutoSuspend(); return () => disarmAutoSuspend(); }, []);` and add the two names to the existing `./audio/sound.js` import (today `App.jsx:26`).
3. New `src/audio/sound.test.js` using `vi.resetModules()` + `await import('./sound.js')` per test, with a mock context installed first:
   ```js
   class MockAudioContext {
     constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
     createGain() { return { gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
     createOscillator() { return { type: '', frequency: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {}, start() {}, stop() {} }; }
     suspend = vi.fn(async () => { this.state = 'suspended'; });
     resume = vi.fn(async () => { this.state = 'running'; });
     close = vi.fn(async () => { this.state = 'closed'; });
   }
   // beforeEach: vi.resetModules(); vi.stubGlobal('AudioContext', MockAudioContext);
   ```
   Tests: (a) `armAutoSuspend` + simulated hidden (`vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')` then `document.dispatchEvent(new Event('visibilitychange'))`) → `suspend` called on the live context after BGM had started; (b) visible again while unmuted with a previously-playing biome → context `resume`d (BGM restart observable via a second `suspend`-able context state `running`); (c) `closeAudio()` → `close` called, and a follow-up `playSfx('click')` recreates a fresh context without throwing; (d) `disarmAutoSuspend` removes the listener (hidden dispatch after disarm → no additional `suspend` call); (e) muted-on-return → BGM not restarted.

**Cheap check:** `cd dungeon-scholar && npx vitest run src/audio/sound.test.js`.

**Acceptance:** hiding the page suspends the context and stops the BGM timer loop; returning restores BGM only when it was playing and unmuted; `closeAudio` is exported and idempotent; new test file green.

### 40D — cloudSync conflict/echo tests + listener-name fix (L18)

**Objective:** test the genuinely-untested sync branches; fix the `blur-sm` cleanup bug.

**Files:** `dungeon-scholar/src/hooks/usePlayerState.js` (one line), `dungeon-scholar/src/hooks/usePlayerState.test.jsx` (append new describes).

**Steps:**
1. Fix `usePlayerState.js:235`: `window.removeEventListener('blur-sm', onBlur)` → `window.removeEventListener('blur', onBlur)` (Tailwind 3→4 codemod corruption, commit `854a4954`; see Verified findings).
2. Append a `describe('usePlayerState — Realtime echo dedup')` block. Capture the subscription callback from the existing mock: `subscribeSaves.mockImplementation((uid, cb) => { realtimeCb = cb; return unsubSpy; })`. Cases:
   - *exact-updatedAt echo skipped*: sign in with empty cloud, make a local change, let the debounced `pushSave` resolve `{ updatedAt: T1 }`; invoke `realtimeCb({ data: <anything>, updatedAt: T1, schemaVer: 1 })`; assert state unchanged.
   - *content-hash echo skipped*: invoke `realtimeCb` with `data` deep-equal to the current local state but a NEW `updatedAt: T2`; assert state object NOT replaced (no `applyRemoteState`), then invoke again with the same `T2` → still skipped (proves `lastKnownCloudUpdatedAtRef` advanced on the hash path, `usePlayerState.js:369`).
   - *genuine remote update applied*: invoke with novel `data` + new `updatedAt`; `await waitFor` state to equal the (backfilled) incoming data; assert localStorage was updated (`loadFromLocalStorage().state`).
   - *unsubscribe on unmount/sign-out*: assert `unsubSpy` called after `unmount()`.
3. Append a `describe('usePlayerState — BroadcastChannel dedup')`: `vi.stubGlobal('BroadcastChannel', MockBC)` (a class recording instances + exposing `emit(msg)` to drive `onmessage`; do not rely on happy-dom's own implementation — stubbing keeps both echo and apply paths deterministic). Cases: echo (message whose `state` JSON-matches a recent local state → not applied); genuine cross-tab state → applied without any `pushSave` (the `applyingRemoteRef` guard, `usePlayerState.js:176`).
4. Append a `describe('usePlayerState — resolveMerge branches')`: build the real-conflict fixture exactly as the existing test at `:239-254` does, then:
   - `resolveMerge('local')` → `pushSave` called with the local blob; `mergeRequired` flips false; previews cleared.
   - `resolveMerge('cloud')` → state becomes the cloud preview; a second `pullSave` fires (the lastKnown refresh, `usePlayerState.js:399-405`); no `pushSave`.
   - `resolveMerge('cancel')` → `mergeRequired` false, no push, no state change.
5. Append a regression test for step 1: render signed-out, trigger a local change, `unmount()`, `localStorage.clear()`, dispatch `window.dispatchEvent(new Event('blur'))` → localStorage stays empty (pre-fix, the leaked handler re-flushed stale state).

**Cheap check:** `cd dungeon-scholar && npx vitest run src/hooks/usePlayerState.test.jsx`.

**Acceptance:** all new describes green; the only production-code diff in this sub-phase is the one-line event-name fix.

### 40E — `notesCrypto.js`: passphrase encryption service (F5, part 1)

**Objective:** a generic, dependency-free WebCrypto module for passphrase-encrypted string payloads (reused by PHASE-41's sealed tomes).

**Files:** new `dungeon-scholar/src/services/notesCrypto.js`, new `dungeon-scholar/src/services/notesCrypto.test.js`.

**Steps:**
1. Implement with `crypto.subtle` only (no deps). Parameters per the OWASP Password Storage Cheat Sheet: PBKDF2-HMAC-SHA-256 with **600,000 iterations** (https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), 16-byte random salt per payload-family, AES-256-GCM with a fresh random 12-byte IV per encryption (GCM's auth tag doubles as the wrong-passphrase/tamper detector — no separate MAC needed).
   ```js
   export const KDF_ITERATIONS = 600_000;          // OWASP 2026 floor for PBKDF2-SHA-256
   const PAYLOAD_VERSION = 1;

   // base64 helpers over Uint8Array (btoa/atob exist in browsers, happy-dom, and Node >= 16)
   const toB64 = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
   const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

   export async function deriveKey(passphrase, saltBytes, iterations = KDF_ITERATIONS) {
     const material = await crypto.subtle.importKey(
       'raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
     return crypto.subtle.deriveKey(
       { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
       material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
   }

   /** Encrypt plaintext; pass an existing payload's salt/iter to keep one passphrase per tome. */
   export async function encryptPayload(passphrase, plaintext, { salt, iterations } = {}) { ... }
   // returns { v: 1, kdf: 'PBKDF2-SHA-256', iter, salt, iv, ct, updatedAt: Date.now() }
   //   salt/iv/ct base64; fresh random IV ALWAYS; salt random when not supplied.

   /** @throws Error('decrypt-failed') on wrong passphrase or tampered ciphertext */
   export async function decryptPayload(passphrase, payload) { ... }
   // validates payload.v === 1 (throw 'unsupported-version' otherwise), re-derives, AES-GCM decrypt.
   ```
2. Add an in-memory (module-level `Map`) derived-key cache keyed by `salt` string, with `clearKeyCache()` export — so saving notes repeatedly in one session doesn't re-pay the ~100-300 ms derivation (OWASP sizes the count so a single derivation is imperceptible; only re-derive on unlock). Never persist keys or passphrases.
3. Tests (`notesCrypto.test.js`, all `async` — Node 22's `crypto.subtle` is real, verified `typeof crypto.subtle === 'object'`): round-trip; wrong passphrase rejects with `decrypt-failed`; flipping one ciphertext byte rejects; two encrypts of the same plaintext produce different `iv` and `ct`; supplying `{salt, iterations}` reuses them; unknown `v` rejects; a **committed fixture payload** (generate once during implementation, paste literal into the test) decrypts — this pins the wire format so future refactors can't silently break stored notes. Use `iterations: 1000` in most tests to keep the suite fast; one test asserts the default constant is 600,000.

**Cheap check:** `cd dungeon-scholar && npx vitest run src/services/notesCrypto.test.js`.

**Acceptance:** module has zero imports from app code (reusable by PHASE-41); all tests green; payload format versioned and fixture-pinned.

### 40F — Per-tome notes UI + state plumbing (F5, part 2)

**Objective:** user-facing encrypted notes per tome: create-with-passphrase, unlock, edit/save (re-encrypt), lock, delete.

**Files:** new `dungeon-scholar/src/components/TomeNotes.jsx`, new `dungeon-scholar/src/components/TomeNotes.test.jsx`, `dungeon-scholar/src/App.jsx` (state plumbing + LibraryScreen wiring; post-39 locations via `grep -rn "LibraryScreen\|updateTomeMetadata" dungeon-scholar/src/`).

**Steps:**
1. App-level mutator next to `updateTomeMetadata` (today `App.jsx:2841`):
   ```js
   const updateTomeNotes = (tomeId, payloadOrNull) => {
     setPlayerState(prev => ({
       ...prev,
       library: prev.library.map(t => t.id === tomeId
         ? (payloadOrNull ? { ...t, notes: payloadOrNull } : (({ notes, ...rest }) => rest)(t))
         : t),
     }));
   };
   ```
   The `notes` field on the library entry is exactly the `encryptPayload` result — encrypted at rest in localStorage AND in the cloud blob; it rides `pushSave`/Realtime/merge-chooser untouched. `hasMeaningfulData`/`semanticHashState` in `persistence.js` ignore unknown fields (verified they fingerprint counters only), so sync semantics are unaffected.
2. `TomeNotes.jsx` — modal component, props `{ tome, onSave: (payloadOrNull) => void, onClose }`. Three states:
   - **No `tome.notes`:** "Inscribe private notes" form — passphrase + confirm inputs (`type="password"`, `autoComplete="new-password"`), explicit warning text: *"The passphrase never leaves this device and cannot be recovered — lose it and these notes are gone."* On submit → `encryptPayload(pass, '')` → `onSave(payload)` → switch to unlocked editor.
   - **`tome.notes` present, locked:** single passphrase input + Unlock button; on `decrypt-failed` show "Wrong passphrase — the seal holds." and stay locked.
   - **Unlocked:** `<textarea>` with the plaintext, Save (re-encrypt via `encryptPayload(pass, text, { salt: notes.salt, iterations: notes.iter })` → `onSave`), Lock (clear plaintext + passphrase from state, call `clearKeyCache()`), and Delete notes (inline two-step confirm; `onSave(null)`).
   - Plaintext and passphrase live only in component state; clear both on unmount (`useEffect` cleanup) and on Lock/close. Never log either.
   - If PHASE-19's shared `Modal` wrapper exists, build on it (focus trap/Escape/aria come free); otherwise mirror `PromptModal.jsx`'s structure and include `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, and Escape-to-close to stay consistent with the post-19 baseline.
3. LibraryScreen wiring: add an `onNotes(tome)` callback prop (pattern of `onEditMetadata`), a per-tome "Notes" button (lucide `ScrollText` or `Lock` icon; `aria-label={tome.notes ? 'Open encrypted notes' : 'Create encrypted notes'}`), App-level `const [notesTome, setNotesTome] = useState(null)` and render `{notesTome && <TomeNotes tome={notesTome} onSave={(p) => updateTomeNotes(notesTome.id, p)} onClose={() => setNotesTome(null)} />}` beside the other modals (today `App.jsx:3647`).
4. `TomeNotes.test.jsx` (real WebCrypto, use a small-iteration pre-built fixture payload from `encryptPayload(pass, text, { iterations: 1000 })` inside the test to keep it fast): create-flow calls `onSave` with a v1 payload; mismatched confirm blocks; unlock with correct passphrase reveals text in the textarea; wrong passphrase shows the error and does not call `onSave`; Save re-encrypts (new `iv`, same `salt`) and the saved payload round-trips; Lock clears the textarea; Delete (after confirm) calls `onSave(null)`; Escape calls `onClose`.

**Cheap check:** `cd dungeon-scholar && npx vitest run src/components/TomeNotes.test.jsx`.

**Acceptance:** a tome can gain notes, sync them (payload visible in the `pushSave` blob), and unlock them on another "device" (same payload decrypts in a fresh component instance); plaintext never appears in localStorage (`grep` the stored blob in a test: `expect(JSON.stringify(loadFromLocalStorage())).not.toContain(plaintext)`); feature is fully additive — users who never click Notes see one new button and nothing else.

### 40G — Offline-first PWA (F6: manifest, service worker, icons, iOS metadata, docs)

**Objective:** installable offline-capable app shell on GitHub Pages under the configurable base path.

**Files:** `dungeon-scholar/package.json` (+ lockfile), `dungeon-scholar/vite.config.js`, `dungeon-scholar/index.html`, new `dungeon-scholar/scripts/generate-pwa-icons.mjs`, new `dungeon-scholar/public/` (4 committed PNGs), new `dungeon-scholar/scripts/generate-pwa-icons.test.mjs`, `dungeon-scholar/README.md`.

**Steps:**
1. `cd dungeon-scholar && npm i -D vite-plugin-pwa@^1.3.0`. v1.3.0 (2026-05-05) is the first release declaring Vite 8 peer support (https://github.com/vite-pwa/vite-plugin-pwa/releases); Vite 8/Rolldown compatibility confirmed working upstream (https://github.com/vite-pwa/vite-plugin-pwa/issues/918). If `npm i` reports an ERESOLVE peer conflict, STOP per INSTRUCTIONS.md rule 9 — do not `--force` (this is the exact failure mode the old README vite-pin note described).
2. Icon generation, zero-dep: `scripts/generate-pwa-icons.mjs` writes valid PNGs by hand — `node:zlib` `deflateSync` over raw scanlines (filter byte 0 per row, 8-bit RGBA), plus PNG signature and `IHDR`/`IDAT`/`IEND` chunks with a ~15-line CRC32 table. Artwork is programmatic pixel geometry (no canvas, no fonts): flat `#1a0e08` background, centered amber (`#f59e0b`) diamond/book glyph sized to ~55% of the canvas for the regular icons and ~45% for the maskable one (maskable safe zone = inner 80% circle; keep the glyph well inside it — https://web.dev/articles/maskable-icon). Outputs to `public/`: `pwa-192x192.png`, `pwa-512x512.png`, `pwa-maskable-512x512.png`, `apple-touch-icon.png` (180×180, opaque — iOS composites no alpha). Run once (`node scripts/generate-pwa-icons.mjs`) and **commit the PNGs**; the script stays in-repo for regeneration. `scripts/generate-pwa-icons.test.mjs` reads each committed PNG and asserts the 8-byte signature plus IHDR width/height/bit-depth/color-type — this keeps the assets verifiable without re-running generation in CI.
3. `vite.config.js` — add the plugin (leave `base`, `manualChunks` function form, and `test` untouched):
   ```js
   import { VitePWA } from 'vite-plugin-pwa'
   // plugins:
   VitePWA({
     registerType: 'autoUpdate',        // stale clients self-update on next load
     injectRegister: 'auto',            // plugin injects registration; no main.jsx edit
     includeAssets: ['apple-touch-icon.png'],
     manifest: {
       name: 'Dungeon Scholar',
       short_name: 'Dungeon Scholar',
       description: 'D&D-themed exam-prep: flashcards, riddles, timed practice exams — playable offline.',
       theme_color: '#1a0e08',
       background_color: '#0a0604',
       display: 'standalone',
       icons: [
         { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
         { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
         { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
       ],
     },
     workbox: {
       globPatterns: ['**/*.{js,css,html,svg,png,ico}'],   // includes lazy katex/DungeonExplore chunks
       cleanupOutdatedCaches: true,
       clientsClaim: true,
       skipWaiting: true,
     },
   })
   ```
   Deliberate choices: **no runtimeCaching** — Supabase and the Oracle worker are cross-origin and must stay network-only (workbox passes through unmatched requests by default; never cache auth/save traffic). `scope`/`start_url`/`navigateFallback` are derived from Vite's `base` by the plugin — correct for both `/dungeon-scholar/` and the `VITE_BASE=/home-lab/` owner deploy. Rollback hatch if the SW ever misbehaves in production: set `selfDestroying: true` and deploy — the plugin ships a self-unregistering worker (https://vite-pwa-org.netlify.app/guide/unregister-service-worker.html).
4. `index.html` head additions (Vite substitutes `%BASE_URL%` in HTML):
   ```html
   <meta name="description" content="D&D-themed exam-prep study app — flashcards, riddles, timed practice exams, offline." />
   <meta name="theme-color" content="#1a0e08" />
   <meta name="mobile-web-app-capable" content="yes" />
   <meta name="apple-mobile-web-app-capable" content="yes" />
   <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
   <meta name="apple-mobile-web-app-title" content="Dungeon Scholar" />
   <link rel="apple-touch-icon" href="%BASE_URL%apple-touch-icon.png" />
   ```
   (The manifest `<link>` is injected by the plugin — do not add it manually.)
5. Build-output verification (this sub-phase's core check):
   ```bash
   cd dungeon-scholar && npm run build
   ls dist/sw.js dist/manifest.webmanifest dist/workbox-*.js dist/apple-touch-icon.png dist/pwa-512x512.png
   node -e "const m=require('./dist/manifest.webmanifest'); console.log(m.start_url, m.scope, m.icons.length)"
   grep -o 'index.html' dist/sw.js | head -1          # precache + navigate fallback present
   VITE_BASE=/home-lab/ npm run build && node -e "const m=require('./dist/manifest.webmanifest'); if(!m.start_url.startsWith('/home-lab/')) process.exit(1)"
   ```
6. README updates (same file edit, one pass): replace the stale Stack note at `README.md:18-20` (now Vite ^8 + plugin-react ^6; delete the obsolete `^7`-pin paragraph and the matching troubleshooting row at `:117`); add an **"Install as an app (offline)"** section — Android/desktop: browser install prompt / omnibox icon; iOS: Safari → Share → Add to Home Screen; works offline after first load; updates apply automatically on the next launch after a deploy. Document the iOS caveat: an installed (standalone) PWA gets an isolated cookie jar, so GitHub sign-in inside the installed app prompts for GitHub credentials once even if Safari is already signed in — the session then persists inside the app via localStorage (known platform behavior: https://github.com/orgs/supabase/discussions/12227). Note local study works fully offline; cloud sync resumes automatically when back online (the existing `RETRY_DELAYS_MS` backoff → `'offline'` status in `usePlayerState.js:26,134-144`).

**Cheap check:** the step-5 commands plus `npx vitest run scripts/generate-pwa-icons.test.mjs`.

**Acceptance:** `npm run build` emits `sw.js` + `manifest.webmanifest` + precache including the lazy chunks; manifest `start_url`/`scope` track `VITE_BASE`; index.html carries theme-color + iOS metas + apple-touch-icon; four valid PNGs committed under `public/`; README install/offline docs added and the stale vite-pin notes removed; `npm test` still green (icons test included).

## Research notes

- **vite-plugin-pwa × Vite 8 (Rolldown):** Vite 8.0 shipped 2026-03-12 with Rolldown as the bundler and a Rollup-compatible plugin API (https://vite.dev/blog/announcing-vite8, https://www.infoq.com/news/2026/05/vite-v8-rust/). vite-plugin-pwa added the `^8.0.0` peer range in **v1.3.0 (2026-05-05)** (https://github.com/vite-pwa/vite-plugin-pwa/releases); the upstream migration issue reports it "seems to work fine" on Vite 8 (https://github.com/vite-pwa/vite-plugin-pwa/issues/918). Pinning `^1.3.0` avoids the ERESOLVE failure mode the repo previously hit with `@vitejs/plugin-react` peer ranges. Alternative considered: hand-rolled SW + manual precache manifest via a `generateBundle` hook — rejected (re-implements workbox revisioning/cleanup poorly; the plugin is maintained and base-path-aware).
- **`registerType: 'autoUpdate'` + `clientsClaim`/`skipWaiting`:** chosen over `'prompt'` because the app has no in-app update UI and stale-forever clients are worse than a mid-session refresh for a study app; `cleanupOutdatedCaches` bounds storage. The `selfDestroying: true` escape hatch is the documented rollback path (https://vite-pwa-org.netlify.app/guide/unregister-service-worker.html). Basic setup keys per the official guide (https://vite-pwa-org.netlify.app/guide/).
- **No runtime caching for Supabase/Oracle:** auth tokens and save rows must never be served from cache; workbox only intercepts what it's told to — precache covers same-origin build assets, everything else passes through. This also keeps the existing offline semantics in `usePlayerState` (push retry → `'offline'` status) as the single source of truth for sync state.
- **Icons:** maskable icons need the glyph inside the inner safe zone or launchers crop it (https://web.dev/articles/maskable-icon); iOS ignores manifest icons and uses `apple-touch-icon` (opaque PNG, 180×180). Dependency-free PNG writing (zlib + CRC32 + IHDR/IDAT/IEND) was chosen over `@vite-pwa/assets-generator` (pulls sharp — heavyweight native dep on a Pi) and over SVG-only icons (iOS won't take SVG). PNG spec chunks: https://www.w3.org/TR/png-3/.
- **PBKDF2 parameters:** OWASP Password Storage Cheat Sheet recommends **600,000 iterations for PBKDF2-HMAC-SHA-256** (FIPS-compatible family; https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Argon2id is OWASP's first choice but has no WebCrypto implementation (would need a WASM dep) — PBKDF2 via `crypto.subtle` keeps the bundle dep-free, and the threat model (casual DB-leak / operator-read protection for personal study notes) fits. AES-GCM's authentication tag provides integrity + wrong-passphrase detection without a separate HMAC. Fresh 12-byte IV per encryption is mandatory for GCM (IV reuse under one key is catastrophic); per-payload random salt prevents cross-user rainbow tables.
- **iOS PWA + OAuth:** installed PWAs on iOS have an isolated browsing context — Safari sessions don't carry over, and the OAuth round-trip happens in an in-app sheet; users sign in to GitHub once inside the installed app, after which the supabase-js localStorage session persists (https://github.com/orgs/supabase/discussions/12227, https://supabase.com/docs/guides/auth/redirect-urls). Documented rather than worked around (OTP-based alternatives are out of scope).
- **AudioContext lifecycle:** `suspend()` "temporarily halt[s] audio hardware access and reduce[s] CPU/battery usage" (https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/suspend); iOS adds an `'interrupted'` state outside the standard two, so resume paths check `state !== 'running'` (https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state). Suspend-on-hidden + stop-the-scheduler was chosen over close-on-hidden because `close()` is irreversible per-context and rebuilding the graph on every tab switch is wasteful; `closeAudio()` is still exported for true teardown. MDN best practices: reuse a single context, resume from a user gesture (https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices) — both already honored by `ensureContextRunning`.

## Test plan

Per sub-phase (cheap, targeted — INSTRUCTIONS.md rule 5):

| Sub-phase | New/updated tests | Command |
|---|---|---|
| 40A | `src/services/importLimits.test.js` (new) | `npx vitest run src/services/importLimits.test.js` |
| 40B | none possible until study modes are exported (PHASE-39); full ds suite as regression net | `npx vitest run` |
| 40C | `src/audio/sound.test.js` (new — mock AudioContext, visibility/suspend/close/disarm/muted cases) | `npx vitest run src/audio/sound.test.js` |
| 40D | `src/hooks/usePlayerState.test.jsx` (append: Realtime echo ×4, BroadcastChannel ×2, resolveMerge ×3, blur-cleanup regression) | `npx vitest run src/hooks/usePlayerState.test.jsx` |
| 40E | `src/services/notesCrypto.test.js` (new — round-trip, wrong-pass, tamper, IV/salt uniqueness, version gate, pinned fixture) | `npx vitest run src/services/notesCrypto.test.js` |
| 40F | `src/components/TomeNotes.test.jsx` (new — create/unlock/save/lock/delete/escape; plaintext-never-persisted assertion) | `npx vitest run src/components/TomeNotes.test.jsx` |
| 40G | `scripts/generate-pwa-icons.test.mjs` (new — PNG signature + IHDR of committed icons); build-output asserts (sw.js, manifest, base-path variants) | step-5 commands |

End of phase (single gate, then ONE commit + push): this is a dungeon-scholar-only phase, so the domain gate is **`cd dungeon-scholar && npm test` (full vitest) + `npm run build` (default base) + `VITE_BASE=/home-lab/ npm run build`** — there is no lint script in this package. The dnd-app 4-gate (lint + tsc web/node + vitest) is not exercised by these files but runs unchanged if the session's standing rules require it; no dnd-app or bmo code is touched, so pytest is not required.

## Acceptance criteria

- [ ] All three tome-import entry points (file, paste, share-code) reject payloads over 2,000,000 bytes/chars with a notif, before any `JSON.parse`/`atob`.
- [ ] FlashcardsMode/QuizMode never hold a direct reference to `courseSet.flashcards`/`courseSet.quiz`; deck identity is render-stable (useMemo).
- [ ] Hiding the page suspends the AudioContext and halts the BGM scheduler; returning resumes BGM only if it was playing and unmuted; `closeAudio()`/`disarmAutoSuspend()` exported and tested.
- [ ] `usePlayerState` blur listener is removed on unmount (event-name fix) and the Realtime-echo, BroadcastChannel-echo, and all three resolveMerge branches have passing tests.
- [ ] `notesCrypto.js` encrypts/decrypts versioned payloads (PBKDF2-SHA-256 600k → AES-256-GCM), detects wrong passphrase and tampering, and is app-agnostic for PHASE-41 reuse; wire format pinned by a committed fixture.
- [ ] Per-tome encrypted notes: create/unlock/edit/lock/delete from the Library; payload syncs inside the existing save blob; plaintext never persisted anywhere.
- [ ] `npm run build` emits `sw.js` + `manifest.webmanifest` + icons; manifest `start_url`/`scope`/fallback honor `VITE_BASE`; index.html has theme-color + iOS install metas; app installs and loads offline after first visit.
- [ ] README: install/offline section added (with the iOS standalone OAuth caveat) and the stale Vite-^7 pin notes removed.
- [ ] Full dungeon-scholar vitest suite and both build variants green at phase end; one commit, one push; plan moved to `completed/`.

## Out of scope

- **F3 sealed/proctored tomes and the full light theme (QA16)** — PHASE-41 (it reuses 40E's crypto module).
- **App.jsx feature-module split, study-mode code-splitting, browser router (F2/F4)** — PHASE-39 (this phase only follows wherever 39 moved the cited handlers).
- **ds bug round items in the same files** (H5/M5 setState side effects, M13 daily-reward clocks, M10 localStorage quota toasts incl. `sound.js:42`, M4/M3/M2) — PHASE-17.
- **Security round** (H6 prod logging, M11 RLS runtime check, M9 Oracle endpoint env, M8 CSP — note: when PHASE-18's CSP meta exists, the SW and manifest are same-origin and need no connect-src changes; L9 Realtime channel UUID hashing in `cloudSync.js`) — PHASE-18.
- **A11y/UX round** (H4 modal wrapper, L16 audio unmute banner, L17 empty-state CTAs, reduced-motion) — PHASE-19; 40F consumes the H4 wrapper if present, never builds a second one.
- **L10 README answer-key disclosure flag** — lands with PHASE-41's sealed-tomes work where the mitigation ships.
- **Oracle/Supabase runtime caching or background sync** — deliberately excluded from the SW config (auth/save traffic must stay network-only); revisit only if a future phase adds explicit offline queueing.

## Completed

- (filled during execution per INSTRUCTIONS.md rule 17 — one line per sub-phase with file:line citations.)
