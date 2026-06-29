# PHASE-05 — Interaction recovery, native dialogs, Oracle payload & copy round

> Authored from the 2026-06-24 dungeon-scholar QA reports — [`QA-report-2026-06-24-2.md`](./QA/completed/QA-report-2026-06-24-2.md) (run 2) + [`QA-report-2026-06-24-3.md`](./QA/completed/QA-report-2026-06-24-3.md) (run 3) — tested @ deployed `index-B4qcBDzT.js` / src `9e454930` · `origin/master` `3c89d787`. Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md). PLANNING ONLY — this phase authors the plan; no app changes here.

## Goal

Clear four independent interaction/quality findings the QA pass raised: (F1) the global error boundary does not reset on navigation, so once it trips, the **only** in-page recovery ("Return to Hearth") can leave the user stuck on the crash screen across hash navigations; (F2) the Library **bulk** Tag/Banish actions use raw native `window.prompt`/`window.confirm` dialogs (unthemed, not focus-trapped, and `prompt()` returns `null` in some PWA/embedded contexts — silently no-opping the tag) while the rest of the app uses themed modals; (F3) the Oracle chat sends the **entire knowledge base** in the system prompt, so a large tome 413s the Worker and the user falls back to local search (with only a generic notice); and (F4) two Shop item strings leak internal "Phase 14"/"Phase 18" development phase numbers to players. Each is independently shippable.

## Dependencies & cross-phase notes

- **No prerequisite phases**, but **F1 touches `ErrorBoundary.jsx`, which PHASE-01 (01B) also modified** (the chunk-load "new edition — Reload" panel). Re-read PHASE-01's `ErrorBoundary` notes; F1 adds a **location-change reset** orthogonal to 01B's chunk-aware rendering — keep both. Do not regress the chunk-error panel.
- **F2 reuses existing themed primitives:** `src/components/ui/ConfirmModal.jsx` (already used app-wide, e.g. `LabMode.jsx:5,303` and `App.jsx:1487`) covers the bulk-Banish confirm. The single-tome banish already uses an inline themed confirm (`LibraryScreen.jsx:617` "Confirm Banishment"). There is **no** generic themed text-input modal — `PromptModal.jsx` is a feature-specific org/prompt viewer (`App.jsx:1963`, `PromptModal.test.jsx`), **not** a reusable input — so bulk **Tag** needs a small new themed input modal (or an extension of the inline confirm pattern).
- **F3 is isolated** to `src/features/study/ChatMode.jsx` (the Oracle request build + fallback messaging) and the retrieval helper already in that file.
- **F4 is two catalog strings** in `src/game/items.js`.
- **Cross-ref the systemic light-theme contrast (PHASE-03):** PHASE-03's 03E audit explicitly checks Chat bubbles, modals over dark surfaces, and the `ErrorBoundary` panel. The new Tag modal (F2) and any notice copy (F3) must use theme-aware surfaces so they don't reintroduce dark-on-dark — build them to the PHASE-03 pattern.

## Verified findings

All verification was performed read-only against the live tree at `origin/master` (worktree `auto/scholar-phase-maker`).

### F1 (medium) — The error boundary does not reset on route change; "Return to Hearth" can leave the user stuck

**Status: confirmed in source (root cause confirmed; the exact re-trip path in the QA repro is reasoned below and flagged).**

QA: once the boundary trips on a lazy route, navigating back to `#/home` leaves the **home** route also rendering the boundary. The caught-error state is not cleared on navigation, so the only in-page recovery offered does not actually recover — the user must hard-reload.

Root cause, confirmed in source:

- `src/components/ErrorBoundary.jsx` holds `hasError` in state (`:20`), sets it in `getDerivedStateFromError` (`:22-24`), and **only ever clears it** in `resetError` (`:36-45`), which is wired solely to the "← Return to Hearth" button's `onClick` (`:118-123`). There is **no** `resetKeys`, no `componentDidUpdate` location check, and no `hashchange` listener — so the boundary stays **latched** across any navigation that doesn't go through that one button.
- Because the boundary wraps the entire screen area (`App.jsx:1816` `<ErrorBoundary onReset={() => setScreen('home')}>` … `:2095`), a latched `hasError` makes **every** route render the crash panel until a full reload.
- Navigation in this app is hash-driven (`useHashRoute`, `App.jsx:242`): `setScreen(name)` writes `window.location.hash` and a `hashchange` listener syncs the `screen` state. So Back/Forward, a direct hash change, or any nav that changes the hash **without** calling `resetError` (the QA repro's "set hash to `#/home`") leaves `hasError` true → Home renders the boundary.
- *Reasoned (flag):* even the "Return to Hearth" button can appear stuck in the stale-SW scenario — `resetError` flips `hasError` and `onReset` → `setScreen('home')` (which updates the hash), but if the underlying error re-throws on the next render before navigation settles, the boundary re-trips. The robust fix is a location-change reset that doesn't depend on the button; the precise button-path re-trip is best confirmed at runtime on a stale-SW build.

Verification commands (read-only):

```bash
sed -n '17,45p' dungeon-scholar/src/components/ErrorBoundary.jsx        # state + resetError only via button; no resetKeys/hashchange
grep -n 'ErrorBoundary\|onReset' dungeon-scholar/src/App.jsx | head      # wraps whole screen (:1816 / :2095)
sed -n '37,90p' dungeon-scholar/src/router/useHashRoute.js               # setScreen writes hash; hashchange syncs screen
```

**Suggested action (the report's):** give the boundary a location-change reset — subscribe to `hashchange` (or accept a `routeKey` prop = current screen/hash and reset in `componentDidUpdate` when it changes) so `hasError` clears on navigation; and ensure "Return to Hearth" reliably lands on a working Home. Keep PHASE-01's chunk-error panel intact (a chunk error should still offer Reload, not silently reset-loop).

### F2 (medium) — Library bulk Tag/Banish use blocking native browser dialogs

**Status: confirmed in source.**

QA: in multi-select mode, bulk **Tag** calls `window.prompt(...)` and bulk **Banish** calls `window.confirm(...)` — raw native dialogs, inconsistent with the app's themed modals (e.g. the single-tome banish uses an in-app "Confirm Banishment" modal). Native dialogs break the medieval theme, are not focus-trapped/announced by the app, and `window.prompt` returns `null` in some embedded/PWA contexts (silently no-opping the tag). In automation the calls also blocked the event loop until dismissed.

Root cause, confirmed in source:

- `src/features/library/LibraryScreen.jsx:121-123` `doBulkTag` = `const tag = … window.prompt('Add a tag to the selected tomes:') …` then `onBulkTag(...)` only if a non-empty tag came back.
- `src/features/library/LibraryScreen.jsx:125-134` `doBulkDelete` = `if (… !window.confirm('Banish N selected tome(s)? This cannot be undone.')) return;` then loops `onDelete`.
- Both are wired to the bulk-action toolbar buttons (`:362` Tag → `doBulkTag`, `:369` Banish → `doBulkDelete`). The single-tome path already uses the inline themed "Confirm Banishment" modal (`:617`), and `ConfirmModal` (`src/components/ui/ConfirmModal.jsx`) is the app-wide themed confirm — so the bulk paths are the lone native-dialog holdouts.

Verification commands (read-only):

```bash
sed -n '121,135p' dungeon-scholar/src/features/library/LibraryScreen.jsx   # doBulkTag (window.prompt) + doBulkDelete (window.confirm)
sed -n '355,375p' dungeon-scholar/src/features/library/LibraryScreen.jsx    # bulk Tag/Banish buttons
grep -rn 'ConfirmModal' dungeon-scholar/src/components/ui/ dungeon-scholar/src/App.jsx | head
```

**Suggested action (the report's):** replace `window.confirm` in `doBulkDelete` with the existing themed `ConfirmModal`, and replace `window.prompt` in `doBulkTag` with a themed text-input modal (build a small reusable one — `PromptModal` is taken by another feature — or extend the inline confirm pattern to accept an input). Match the rest of the app's modal a11y (focus trap, `role="dialog"`, Escape to cancel).

### F3 (medium) — Oracle chat sends the full knowledge base → 413 on large tomes → silent-ish local fallback

**Status: confirmed in source (the 413 root cause is confirmed; the "no notice at all" part of the QA report is partially inaccurate — a generic fallback notice *is* emitted — see below).**

QA: asking the Oracle on a large tome (AWS, 124 scrolls / 95 riddles / 13 trials) fires `POST …dungeon-scholar-oracle.gknotts.workers.dev/` → **413 (Payload Too Large)**; the UI shows local Knowledge-Base snippets instead, which the QA read as a silent AI failure.

Root cause, confirmed in source:

- `ChatMode.jsx:269-289` `buildSystemPrompt(relevantSources)` retrieves the top-5 relevant excerpts (`searchTome(query, 5)`, `:329`) **and then also inlines the entire knowledge base**: `const fullKb = courseSet.knowledgeBase || courseSet.knowledge_base || ''` is appended verbatim under `=== FULL KNOWLEDGE BASE (background context) === … === END KNOWLEDGE BASE ===` (`:280-289`). So a large tome ships its whole KB in every Oracle request body → the Worker's body limit is exceeded → 413. The retrieval (top-5) is already in place; the full-KB block is the bloat.
- **The fallback is not actually silent.** For a non-ok response (incl. 413) the code sets `fallbackReason = 'The Oracle stumbles. Falling back to Tome Search.'` (`ChatMode.jsx:345`) and pushes a `{ role: 'system_notice', content: fallbackReason }` plus the local results (`:388-391`). So a notice **is** rendered — but it is generic (doesn't indicate the tome was too large) and is easy to miss among the KB snippets (and, per PHASE-03's 03E candidate list, the `system_notice` bubble must be checked for light-theme contrast). The QA's "no indication the Oracle failed" is therefore an over-statement of an otherwise real defect: large tomes can **never** get an AI answer because every request 413s.

Verification commands (read-only):

```bash
sed -n '269,290p' dungeon-scholar/src/features/study/ChatMode.jsx   # buildSystemPrompt inlines full KB (:280-289)
sed -n '327,392p' dungeon-scholar/src/features/study/ChatMode.jsx   # fetch, non-ok -> generic notice (:345), system_notice push (:390)
grep -n 'knowledgeBase\|searchTome\|system_notice\|413\|response.status' dungeon-scholar/src/features/study/ChatMode.jsx
```

**Suggested action (the report's, refined):** stop inlining the full KB — send only the top-K retrieved excerpts (and a truncated history), so the request fits the Worker limit and large tomes actually get an AI answer. Independently, make the fallback notice specific when the failure is a size error (413) — e.g. "Oracle unavailable (request too large) — showing local matches" — and ensure the `system_notice` bubble is readable in both themes (PHASE-03).

### F4 (low, docs) — Shop item copy leaks internal "Phase 14"/"Phase 18" references to players

**Status: confirmed in source.** Two player-facing catalog strings expose internal development phase numbers: `src/game/items.js:96` `description: 'Replenish a single dungeon shield (used in Phase 14 combat).'` and `src/game/items.js:20` `blurb: 'Familiars to walk the dungeon at thy side. (Awaiting Phase 18.)'`. "Phase 14"/"Phase 18" are meaningless to players and break the in-world tone.

Verification: `grep -n "Phase 14\|Phase 18\|Awaiting" dungeon-scholar/src/game/items.js` → `:20` (blurb), `:96` (description); note `:5` and `:639` are internal **code comments** (fine to leave, though a one-line tidy is harmless).

**Suggested action (the report's):** rewrite both strings as in-world copy (e.g. "Restores one shield for your next dungeon delve"; a familiars blurb without a roadmap phase), and grep the catalog for any other "Phase N" leaks in player-facing fields.

## Sub-phases

> dungeon-scholar checks (run from `dungeon-scholar/`): single test `npx vitest run src/.../that.test.jsx` during sub-phase work; CI (`dungeon-scholar-ci.yml`) runs the full `npm run test` + `npm run build` (`VITE_BASE=/home-lab/`) gate on push. Logic/component changes get unit/render tests; copy changes lean on the build + read.

### 05A — Reset the error boundary on navigation (F1)

**Objective:** the boundary clears its caught-error state on any route change, so navigation (button or hash) always recovers.

**Files:** `dungeon-scholar/src/components/ErrorBoundary.jsx` (+ extend `ErrorBoundary.test.jsx`), possibly `dungeon-scholar/src/App.jsx` (pass a `routeKey` if using the prop approach).

**Steps:**

1. Add a location-change reset. Preferred: in `componentDidMount`, subscribe to `window.addEventListener('hashchange', this.handleRouteChange)` (removed in `componentWillUnmount`) that calls `resetError()` **only** when `hasError` is set — guarded so it never fights PHASE-01's chunk-error one-shot reload (don't reset-loop a genuinely-broken chunk; the chunk panel's Reload stays the recovery there). Alternatively accept a `routeKey={screen}` prop from `App.jsx` and reset in `componentDidUpdate` when it changes.
2. Keep 01B's chunk-aware panel and `componentDidCatch` chunk auto-reload intact; ensure a chunk error doesn't get silently reset by the new hashchange path (e.g. skip the auto-reset when `isChunkLoadError(this.state.error)`).
3. Ensure "Return to Hearth" (`resetError` → `onReset` → `setScreen('home')`) lands on a working Home — with the hashchange reset in place, a subsequent navigation also clears the boundary.
4. Tests: a thrown generic error then a simulated `hashchange` clears `hasError` and renders children; a chunk-load error still renders the "new edition — Reload" panel and is **not** auto-reset by hashchange; "Return to Hearth" resets as before.

**Acceptance:** extended `ErrorBoundary.test.jsx` green; a route change after a non-chunk crash recovers without a hard reload; PHASE-01's chunk behaviour is preserved; `npm run build` clean.

### 05B — Replace bulk Tag/Banish native dialogs with themed modals (F2)

**Objective:** bulk Tag/Banish use themed, focus-trapped, accessible in-app modals like the rest of the app.

**Files:** `dungeon-scholar/src/features/library/LibraryScreen.jsx` (`doBulkTag` `:121`, `doBulkDelete` `:125`, the bulk buttons `:362,369`); `dungeon-scholar/src/components/ui/ConfirmModal.jsx` (reuse); a small new themed input modal (e.g. `src/components/ui/TextInputModal.jsx` + test) for Tag.

**Steps:**

1. Bulk Banish: replace the `window.confirm` gate in `doBulkDelete` with `ConfirmModal` (open state + confirm/cancel handlers), mirroring the single-tome "Confirm Banishment" UX and copy.
2. Bulk Tag: replace `window.prompt` with a themed text-input modal (build a small reusable `TextInputModal` — title, label, input, Confirm/Cancel — since `PromptModal` is a different feature; or extend the inline confirm pattern to take an input). Wire its submit to `onBulkTag(Array.from(selectedIds), tag.trim())`, no-op on empty/cancel. This also fixes the PWA `prompt() === null` silent-no-op.
3. Build both to the PHASE-03 theme pattern (theme-aware surface, readable in both themes) and the repo's modal a11y conventions (`role="dialog"`, focus trap, Escape to cancel) — match `PromptModal`'s a11y test expectations (PHASE-19 19A) for the new modal.
4. Tests: a render/interaction test that bulk Tag opens the input modal and calls `onBulkTag` with the entered tag; bulk Banish opens `ConfirmModal` and calls `onDelete` per selected id on confirm; cancel/empty is a no-op.

**Acceptance:** no `window.prompt`/`window.confirm` remains in `LibraryScreen.jsx`; bulk Tag/Banish use themed modals; the new modal is accessible + readable in both themes; tests green; `npm run build` clean.

### 05C — Trim the Oracle request payload + specific size-failure notice (F3)

**Objective:** large tomes get an AI answer (request fits the Worker limit); when the Oracle does fail, the notice is specific and readable.

**Files:** `dungeon-scholar/src/features/study/ChatMode.jsx` (`buildSystemPrompt` `:269-289`, the fetch/fallback block `:327-392`).

**Steps:**

1. Stop inlining the full KB in `buildSystemPrompt`: remove (or cap) the `=== FULL KNOWLEDGE BASE ===` block and rely on the top-K retrieved excerpts (`searchTome`), optionally raising K modestly (e.g. 5→8) now that the whole KB isn't shipped. Also bound the `messages` history sent (`:340` filter) to the last N turns so long chats don't re-bloat the body.
2. Make the fallback specific: when `response.status === 413` (or a body indicating size/too-large), set a reason like "The Oracle cannot hold so great a tome at once — showing local matches." instead of the generic "stumbles," so the user knows it was a size issue, not a transient hiccup.
3. Ensure the `system_notice` bubble is readable in both themes (coordinate with PHASE-03 03E; if PHASE-03 already fixes it, just verify).
4. Tests: a unit/component test that `buildSystemPrompt` no longer contains the full-KB block for a large `courseSet`; a 413 response yields the size-specific notice + local fallback; a normal 200 still returns the AI answer.

**Acceptance:** the Oracle request omits the full KB (asserted in test); a large-tome question no longer 413s in principle (request body bounded) and, if it does fail, shows a size-specific readable notice; AI answers still render on success; `npm run build` clean.

### 05D — De-leak the Shop item copy (F4)

**Objective:** no player-facing string exposes an internal phase number.

**Files:** `dungeon-scholar/src/game/items.js` (`:20`, `:96`).

**Steps:**

1. Rewrite `:96` (Shield Draught) to in-world copy, e.g. "Restores one shield for your next dungeon delve."
2. Rewrite `:20` (familiars) to drop "(Awaiting Phase 18.)" — e.g. "Familiars to walk the dungeon at thy side." (or an in-world "not yet available" phrasing if the item is still gated).
3. Grep the catalog for any other "Phase N" in player-facing fields (`name`/`blurb`/`description`/`effect` strings) and fix; internal code comments (`:5`, `:639`) may stay.

**Acceptance:** no "Phase N" appears in any player-facing item string; the items still render with sensible descriptions; `npm run build` clean.

## Research notes

- A React error boundary has no built-in location awareness; the standard fixes are a `resetKeys`-style prop that changes per route (reset in `componentDidUpdate`) or an explicit `hashchange`/`popstate` subscription. This app is hash-routed (`useHashRoute`), so a `hashchange` listener is the natural trigger; guard it against PHASE-01's chunk-reload one-shot so a genuinely-missing chunk doesn't reset-loop.
- `window.prompt()` returns `null` when suppressed (some PWA/embedded/automation contexts), which is exactly why the bulk Tag silently no-ops; a themed in-app modal removes that failure mode entirely and is also focus-trappable/announceable.
- Inlining a whole knowledge base in a system prompt scales the request body with tome size; retrieval (top-K) already exists in `ChatMode` for precisely this reason — the full-KB block defeats it. Trimming history as well keeps long conversations from re-growing the body.

## Test plan

- Per sub-phase: `npx vitest run` the affected test — `ErrorBoundary.test.jsx` (05A), a `LibraryScreen`/`TextInputModal` render test (05B), a `ChatMode`/`buildSystemPrompt` test (05C); 05D leans on the build + read.
- At phase end: `npm run lint:fix` (per PHASE-02's biome caveat — hand-format touched files rather than a repo-wide autofix), then push and let CI (`dungeon-scholar-ci.yml`) run the full `npm run test` + `npm run build` (`VITE_BASE=/home-lab/`) gate.
- Runtime / next-deploy verification (not CI-gated): trip the boundary then navigate → recovers without reload (F1); bulk Tag/Banish show themed modals, Tag works in a PWA context (F2); ask the Oracle on the large AWS tome → it answers (or shows a size-specific notice) instead of 413-ing silently (F3); the Shop shows no "Phase N" copy (F4).

## Acceptance criteria

- The error boundary resets on navigation; a non-chunk crash recovers without a hard reload, and PHASE-01's chunk panel is preserved (F1).
- Bulk Tag/Banish use themed, accessible modals; no native `prompt`/`confirm` remains in `LibraryScreen` (F2).
- The Oracle request no longer ships the full KB; large tomes get an AI answer, and a real failure shows a specific, readable notice (F3).
- No player-facing item string leaks an internal phase number (F4).
- `dungeon-scholar-ci.yml` green (full `npm run test` + `npm run build`).

## Out of scope

- A general "unload/deselect active tome" affordance and a unified add-tome menu — tracked under PHASE-04 (F3); not part of this round.
- Re-architecting the Oracle Worker or adding server-side payload limits/streaming — 05C is a client-side payload-trim + notice change; the Worker contract is unchanged.
- Broadening native-dialog replacement beyond the Library bulk actions — if other `window.prompt`/`confirm` callers surface, file them separately (a grep `grep -rn "window.prompt\|window.confirm" dungeon-scholar/src` is a cheap follow-up check, but only the bulk Library actions were reported).
- The light-theme contrast of the new modal / notice surfaces is built to the PHASE-03 pattern here but the systemic audit itself lives in PHASE-03 (03E).

## Completed (2026-06-29)

- **05A (F1)** `src/components/ErrorBoundary.jsx`: added `componentDidMount`/`componentWillUnmount` `hashchange` subscription + `handleRouteChange` that clears a latched error on route change — but ONLY for non-chunk errors (`!isChunkLoadError`), so PHASE-01's chunk "new edition — Reload" panel + one-shot auto-reload are preserved (a missing chunk is not reset-looped). The route-change reset clears state without forcing `onReset`/Home, so navigation lands where the user went. Tests: `ErrorBoundary.test.jsx` +2 (hashchange recovers a generic crash; hashchange does NOT reset the chunk panel) — native-event setState wrapped in `act()`.
- **05B (F2)** `src/features/library/LibraryScreen.jsx`: removed both native dialogs — `doBulkTag` (was `window.prompt`) now opens a new themed `TextInputModal`; `doBulkDelete` (was `window.confirm`) opens the app-wide themed `ConfirmModal` (danger variant). New `src/components/ui/TextInputModal.jsx` (+test): reusable themed input dialog using `useDialogA11y` (focus trap, Escape→cancel, focus restore), built to the PHASE-03 surface convention, Confirm disabled on empty (fixes the PWA `prompt()===null` silent no-op). Tests: `TextInputModal.test.jsx` (4 — trimmed confirm, Enter submit, empty no-op, cancel). No `window.prompt`/`window.confirm` remains in `LibraryScreen`.
- **05C (F3)** `src/features/study/ChatMode.jsx`: `buildSystemPrompt` no longer inlines the full knowledge base (removed the `=== FULL KNOWLEDGE BASE ===` block + the `fullKb` var) — Oracle requests now ship only the top-K retrieved excerpts; raised K 5→8 and bounded sent history to the last 12 turns (`.slice(-12)`) so large tomes/long chats stop 413-ing. Added a size-specific fallback for `response.status === 413`: "The Oracle cannot hold so great a tome at once — showing local matches." The `system_notice` bubble readability was already handled in PHASE-03 03G. No unit test added: `buildSystemPrompt` is a private component closure and ChatMode has no existing test harness (heavy context/fetch deps) — the change is a verified deletion + an added `else if` branch + two constant tweaks, confirmed by grep and gated by the CI build (rule 9 reasonable-reading).
- **05D (F4)** `src/game/items.js`: rewrote the two player-facing strings — Stable `blurb` drops "(Awaiting Phase 18.)"; Shield Draught `description` → "Restores one shield for your next dungeon delve." Remaining "Phase N" occurrences are internal code comments (lines 5/329/387/567/639), left per plan.
- **Verification:** `npx vitest run` green — ErrorBoundary.test.jsx (5) + TextInputModal.test.jsx (4). Biome check clean on touched files (1 pre-existing warning, 0 errors). Full `npm run test` + build gated by CI on push.
