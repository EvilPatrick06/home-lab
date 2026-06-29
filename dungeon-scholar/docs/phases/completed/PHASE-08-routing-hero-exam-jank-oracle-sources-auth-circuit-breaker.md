# PHASE-08 — Deep-link fall-through, per-screen hero chrome, exam-answer jank, Oracle out-of-tome sources, Supabase refresh circuit-breaker

> Authored from the two 2026-06-29 dungeon-scholar QA reports — [`QA-report-2026-06-29.md`](./QA/completed/QA-report-2026-06-29.md) (full pass, build `index-C2MmghGQ.js` / src `d5377b3e`, `origin/master` `605e712f`) and [`QA-report-2026-06-29-2.md`](./QA/completed/QA-report-2026-06-29-2.md) (post-#39 regression pass, same build, src `dc85f35f`). Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md). PLANNING ONLY — this phase authors the plan; no app changes here.

## Goal

Five low-severity behavioural findings from the two 2026-06-29 passes, bundled into one round because none depends on another and each is a small, well-localized fix. **F1 (routing):** a `#/tome/<bad-id>/<screen>` deep link whose tome id does not resolve silently honours the `<screen>` segment and renders that gated screen against the *previously active* tome, instead of bouncing to `#/home` the way the screen-less `#/tome/<bad-id>` form already does. **F2 (layout/UX):** the full player-stats "hero" (level badge, XP bar, VICTORIES/DELVES/DRAGONS tiles, ⚜ corners) renders at the top of **every** screen, not just home, pushing screen-specific content far down on all 21 screens. **F3 (performance):** during a practice exam each answer click stalls the main thread — not from the (already-debounced) localStorage write, but from a synchronous full-state `JSON.stringify` + a full-state `BroadcastChannel.postMessage` that both run on **every** `setState`, several times per answer, over a ~90 KB blob, compounded by a full re-render of the persistent hero + question-navigator grid. **F4 (UX):** the Oracle attaches a "⚜ SOURCES FROM THE TOME ⚜" block to its answer whenever the keyword search returns *any* weakly-scoring card, even when the Oracle's own answer says "This goes beyond the current tome" — presenting unrelated cards as sources. **F5 (auth-resilience):** the Supabase token-refresh "Failed to fetch" console storm — already gated once by PHASE-02 — **still recurs** on the live build for a signed-in user whose stored session is stale and whose Supabase host is unreachable, because `getSession()` + `startAutoRefresh()` re-arm the GoTrue refresh ticker with no failure ceiling and no stale-token quarantine. This is the "future load-noise round" hardening that [`PHASE-INDEX.md`](./PHASE-INDEX.md) anticipated on top of PHASE-02.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Each sub-phase is self-contained; run by severity (all are Low except F5's user-facing impact, which is also Low — pick any order).
- **F1 touches the router.** `src/router/useHashRoute.js` (`parseHash`) + `src/App.jsx` (the pending-tome consumption effect). PHASE-01 (routing/PWA, **done**) also lives in the router area but is in `completed/` and does not share the specific not-found branch this phase edits; re-confirm the line anchors at execution time (rule 3).
- **F2 touches `src/App.jsx`'s `<main>` hero block** (`:1701-1820`). It does not touch `HomeScreen.jsx`. The hero reads `playerState` fields already in scope; gating it to `screen === 'home'` plus a compact strip is presentation-only — no state change.
- **F3 touches `src/hooks/usePlayerState.js`** (the shared persistence hook) and optionally `src/features/study/ExamMode.jsx` (memoize the navigator grid). The persistence hook is load-bearing for **all** save/sync paths — keep the change to the *cost* of `setState` (when/how often the stringify + broadcast run), never the *semantics* (what gets saved, the debounce windows, the cross-tab/Realtime contract). Re-read the hook's header comment (`:30-55`) before editing.
- **F4 touches `src/features/study/ChatMode.jsx`** only — the same file PHASE-03 03G edits (the Light-theme Oracle/user bubble text). 03G changes inline text *colours* on the bubble; F4 changes whether the *sources block* renders. Different lines, no semantic overlap, but if 03G ships first re-confirm the `m.sources && m.sources.length > 0` render guard (`:575`) still reads as documented.
- **F5 builds directly on PHASE-02 F1 (done).** PHASE-02 set `autoRefreshToken: false` (`src/services/supabase.js:15`) and moved the refresh ticker into `useAuth` (`src/hooks/useAuth.js`), so a *signed-out* load no longer loops. F5 closes the remaining hole: a *stale-but-present* persisted session still re-arms the ticker against an unreachable host. Do **not** revert PHASE-02's gating — extend it with a failure ceiling + token quarantine. Files: `src/hooks/useAuth.js`, `src/services/supabase.js`.
- **Independent of PHASE-03/04/05/06/07** except the ChatMode file-adjacency noted above.

## Verified findings

All verification was performed read-only against the live tree at `origin/master` (worktree `auto/scholar-phase-maker`). Re-run each block before implementing (rule 3).

### F1 (low, routing) — `#/tome/<unresolved-id>/<screen>` honours the screen segment and studies the stale active tome instead of bouncing home

**Status: confirmed in source.**

QA repro (report 2, §1):

1. With a tome active, set the hash to `#/tome/nonexistent-id-xyz/quiz`.
2. The URL canonicalizes to `#/quiz` and the quiz screen renders — against the *previously active* tome — rather than bouncing to `#/home` the way `#/tome/nonexistent-id-xyz` (no screen) does.

Root cause, confirmed in source — the two not-found shapes diverge:

- `parseHash` (`src/router/useHashRoute.js:23-27`): for `#/tome/<id>/<screen>` it returns `{ screen: <screen-if-known-else 'home'>, tomeId: <id> }`. So `#/tome/<bad-id>/quiz` → `{ screen: 'quiz', tomeId: '<bad-id>' }`, whereas the screen-less `#/tome/<bad-id>` → `{ screen: 'home', tomeId: '<bad-id>' }` (the `parts[2]` default at `:26` is `'home'`). The screen-less form is *already* home; the screen form is not.
- The pending-tome consumer (`src/App.jsx:723-737`): when the id is **not** in the library it shows `showNotif('That tome is not in thy library.', 'error')` and calls `clearPendingTome()` (which only rewrites the URL to `#/<screen>` and clears the pending id) — **it never resets `screen` back to home** (`:728-735`).
- The gated-screen bounce (`src/App.jsx:739-749`) does **not** save it either: `quiz` is in `COURSE_SET_GATED`, but because the bogus tome failed to load, the *previous* tome's `courseSet` is still non-null, so the gate passes and `quiz` renders against the stale tome.

Net: a stale/typo'd share link to a specific screen silently drops the user into their *old* tome on that screen, with only a transient error toast.

Verification commands (read-only):

```bash
sed -n '19,31p'   dungeon-scholar/src/router/useHashRoute.js   # parseHash: screen-less -> 'home' (:26 default) vs screen form keeps the segment
sed -n '723,749p' dungeon-scholar/src/App.jsx                  # not-found branch (:728) lacks setScreen('home'); gated bounce (:741) sees stale courseSet
```

**Suggested action (report's):** gate the screen segment on a *successful* tome resolution — in the not-found branch (`App.jsx:728`) also `setScreen('home')` so `#/tome/<bad-id>/<screen>` falls through to the same home-redirect as `#/tome/<bad-id>`. (Optionally keep the existing "not in thy library" toast.)

### F2 (low, layout/UX) — the full player-stats hero renders on every screen, not just home

**Status: confirmed in source.**

QA repro (report 1, §1): on the Shop screen the body begins "…89 VICTORIES 0 DELVES 0 DRAGONS ⚜ ⚜ ⚜ ⚜ The Marketplace…" — i.e. the entire home hero precedes the screen's own content. Confirmed across sub-screens.

Root cause, confirmed in source — `src/App.jsx:1699-1820`: the hero block (the `<div className="mb-6 p-4 rounded-sm relative">` with the ⚜ corners `:1711-1714`, the clip-path level badge `:1718-1731`, the `currentTitle` button + "Level N • X Total XP" line `:1733-1744`, the EXPERIENCE bar `:1745-1771`, and the VICTORIES/DELVES/DRAGONS tiles `:1783-1819`) renders **unconditionally** inside `<main>`, *before* the `React.Suspense` screen content (`:1821+`). There is no `screen === 'home'` guard — every one of the 21 screens pays the full hero's vertical chrome.

Verification commands (read-only):

```bash
sed -n '1699,1821p' dungeon-scholar/src/App.jsx   # the always-rendered hero block (no screen gate) before the Suspense screen render
grep -n 'VICTORIES\|EXPERIENCE\|id="main-content"\|React.Suspense' dungeon-scholar/src/App.jsx
```

**Suggested action (report's):** gate the full hero to `screen === 'home'`; render a slim persistent stat strip (e.g. level + XP-to-next + gold) on the other screens so the per-screen content is visible without scrolling — especially on mobile.

### F3 (low, performance) — practice-exam answer clicks stall the main thread via per-`setState` full-blob stringify + broadcast (the localStorage write is NOT the cause)

**Status: confirmed in source — with a corrected root cause.**

QA observed (report 1, §3): flashcards/quiz/lab/chat responded to scripted interaction instantly, but during the **practice exam** repeated `Runtime.evaluate` calls timed out right after answer clicks while the answer still registered. The report's hypothesis was "the full ~90 KB save is rewritten to localStorage per interaction (synchronous)." **The localStorage write is already debounced and is not the per-click cost** — the corrected root cause is two *other* synchronous, full-blob operations that run on **every** `setState`:

- The local save IS debounced: `src/hooks/usePlayerState.js:186-191` wraps `saveToLocalStorage` (+ `writeSnapshot`) in a `setTimeout(…, LOCAL_DEBOUNCE_MS)` where `LOCAL_DEBOUNCE_MS = 500` (`:17`). So a burst of answer-clicks collapses to one deferred write — not a 90 KB serialize per click.
- **But every `setState` synchronously stringifies the whole blob twice over.** `setState` (`:178-220`) calls `trackLocalHash(resolved)` (`:183`) → `JSON.stringify(s)` over the entire state (`:96`) on the main thread, *and* (when not applying a remote update) `broadcastChannelRef.current.postMessage({ type: 'state', state: resolved })` (`:199`), which structured-clones the entire ~90 KB state synchronously.
- **Answering fires several `setState`s in quick succession.** The hook's own header comment documents this exact burst: an answer event "triggers `recordAnswer` + `updateTomeProgress` + `awardXP` + `checkAchievement` in quick succession" — "observed as up to 4 POSTs to /rest/v1/saves per answer" (`:18-24`). So one answer click ⇒ ~4 `setState`s ⇒ ~4 full-blob `JSON.stringify` + ~4 full-blob structured-clones, on the main thread, per click.
- **Compounded by a broad re-render.** The persistent hero (F2) re-renders on every state change, and the exam's question-navigator grid re-maps every cell on each answer: `src/features/study/ExamMode.jsx:775-795` (`{sample.map((_, i) => …)}`) recomputes all cells from `answers`/`flagged`/`currentIdx` with no memoization.

**Partially unverified (as the report noted):** no frame-timing profile was captured (screenshots/Performance panel were unavailable), so the stall is inferred from scripted-eval timeouts + the code paths above, not directly measured. The executer should confirm with the Performance panel before/after.

Verification commands (read-only):

```bash
sed -n '94,102p'   dungeon-scholar/src/hooks/usePlayerState.js   # trackLocalHash: JSON.stringify(whole state) (:96)
sed -n '178,221p'  dungeon-scholar/src/hooks/usePlayerState.js   # setState: trackLocalHash (:183), debounced save (:186-191), full-blob postMessage (:199)
sed -n '17,25p'    dungeon-scholar/src/hooks/usePlayerState.js   # LOCAL_DEBOUNCE_MS=500 (:17) + the "4 POSTs per answer" burst note (:18-24)
sed -n '774,797p'  dungeon-scholar/src/features/study/ExamMode.jsx  # navigator grid re-maps every cell per render
```

**Suggested action:** reduce per-answer synchronous work rather than the (already-deferred) save. Options, in increasing effort: (a) coalesce the answer-event `setState`s into one update so the per-click stringify/broadcast run once, not ~4×; (b) throttle/skip `trackLocalHash` and the `postMessage` to the trailing edge (e.g. piggyback on the same debounce as the local save) instead of running them on every `setState`; (c) move the fingerprint off a full `JSON.stringify` (cheaper hash, or hash only mutated slices); (d) memoize the navigator grid + hero so an answer re-renders only the changed cell. Keep the save semantics, debounce windows, and cross-tab/Realtime contract unchanged.

### F4 (low, UX) — the Oracle attaches "SOURCES FROM THE TOME" even when its answer is explicitly out-of-tome

**Status: confirmed in source.**

QA repro (report 1, §3): asked the Oracle a question whose answer is not in the tome; it correctly prefaced "This goes beyond the current tome, but…" yet still rendered "⚜ SOURCES FROM THE TOME ⚜" citing unrelated cards.

Root cause, confirmed in source — sources are attached from the keyword search regardless of whether the generated answer used them:

- `src/features/study/ChatMode.jsx:329`: `const relevantSources = searchTome(query, 5)` — a keyword/stem scorer (`searchTome`, `:217-251`) that keeps any card with `score > 0` (`:249`), i.e. a single surviving query token matching one card is enough to produce "sources."
- `:376`: the Oracle answer is stored as `{ role: 'assistant', content: text, sources: relevantSources }` — the same `relevantSources`, unconditionally, even though the system prompt (`:279`) explicitly invites the model to answer out-of-tome and say so ("This goes beyond the current tome, but…").
- `:575`: the render guard is purely `m.sources && m.sources.length > 0` — no relevance threshold and no awareness of an out-of-tome disclaimer in `content`.

So a weak lexical hit on an out-of-tome question yields unrelated cards presented as authoritative "sources." (Observed with a small throwaway tome, so partly a sparse-content artifact — hence low.)

Verification commands (read-only):

```bash
sed -n '217,251p' dungeon-scholar/src/features/study/ChatMode.jsx   # searchTome scorer: keeps score>0 (:249)
sed -n '326,378p' dungeon-scholar/src/features/study/ChatMode.jsx   # relevantSources = searchTome(query,5) (:329) attached to the answer (:376)
sed -n '575,584p' dungeon-scholar/src/features/study/ChatMode.jsx   # render guard is length-only (:575)
```

**Suggested action (report's):** gate the sources block on a retrieval-relevance threshold (e.g. a minimum top score, not merely `> 0`), or suppress it when the answer text carries the out-of-tome disclaimer the prompt asks for. Keep the **Tome Search** fallback path's sources (those *are* the answer) unchanged.

### F5 (low, auth-resilience) — Supabase refresh "Failed to fetch" storm still recurs for a stale-but-present session despite PHASE-02

**Status: confirmed in source — a genuine gap beyond PHASE-02, not merely a re-confirmation.**

QA observed (report 1 §6 + report 2 §0): the console fills with recurring `TypeError: Failed to fetch` from `wo._refreshAccessToken` → `_callRefreshToken` and `AuthRetryableFetchError: Failed to fetch` — 90+ in ~90 s, in retry bursts. **New, confirmed root cause:** the Supabase host `wivnzcbufpqdjwycampb.supabase.co` is *unreachable* (bare `fetch('https://…supabase.co/')` and `/auth/v1/health` both reject with a network-level `TypeError`). The UI degrades correctly (shows "Sign in with GitHub to sync", runs on localStorage), but the gotrue client keeps a stale token and retries refresh indefinitely.

Why PHASE-02 doesn't fully cover it, confirmed in source:

- PHASE-02 F1 set `autoRefreshToken: false` (`src/services/supabase.js:15`) so a *signed-out* load never starts GoTrue's init-time refresh loop — and `useAuth` drives the ticker explicitly.
- But `useAuth` (`src/hooks/useAuth.js:48-57`) calls `supabase.auth.getSession()` on mount; with `persistSession: true` (`supabase.js:16`) and a stale persisted `sb-…-auth-token`, `getSession()` itself triggers a refresh attempt of the expired access token (the first burst of `_callRefreshToken` errors), and **if it resolves with a (stale) session, `startRefresh()` → `startAutoRefresh()` is called (`:56`)**, re-arming the very refresh ticker against the unreachable host. `onAuthStateChange` (`:72-76`) can re-arm it again. There is **no failure ceiling** (after N consecutive network failures, stop) and **no stale-token quarantine** (drop the unusable token so the client stops hammering). The single `logWarn` in the `.catch` (`:64`) only covers the case where `getSession()` *rejects*, not the case where it resolves a stale session that then fails to refresh on the ticker.

Verification commands (read-only):

```bash
sed -n '10,20p'  dungeon-scholar/src/services/supabase.js   # autoRefreshToken:false (:15) + persistSession:true (:16) from PHASE-02
sed -n '40,83p'  dungeon-scholar/src/hooks/useAuth.js        # getSession -> startRefresh on a (stale) session (:56); onAuthStateChange re-arm (:74); no ceiling/quarantine
grep -n 'startAutoRefresh\|stopAutoRefresh\|getSession\|onAuthStateChange' dungeon-scholar/src/hooks/useAuth.js
```

**Suggested action (report's, made concrete):** (1) add a refresh-failure **circuit breaker** — count consecutive refresh/network failures and, past a small ceiling, call `stopAutoRefresh()` and surface the sync state as `offline` once (not a per-attempt `console.error`); (2) **quarantine the stale token** when the host is unreachable — e.g. `supabase.auth.signOut({ scope: 'local' })` (or remove the persisted `sb-…-auth-token`) so the client stops retrying and the already-correct signed-out/local UI is shown; (3) **ops, out of code scope:** verify whether the deployment's Supabase project should be live at all (it currently appears paused/unresolvable) and note the finding in the executer/integrator log.

## Sub-phases

> dungeon-scholar checks (run from `dungeon-scholar/`): a single targeted test during sub-phase work (`npx vitest run src/.../that.test.jsx`); CI (`dungeon-scholar-ci.yml`) runs the full `npm run test` + `npm run build` (`VITE_BASE=/home-lab/`) gate on push. F2 is presentation-only (build + read + next deploy are the gates); F1/F3/F4/F5 each admit a small unit/assertion test — add one where tractable.

### 08A — Deep-link fall-through to home on unresolved tome id (F1)

**Objective:** `#/tome/<id>/<screen>` whose `<id>` does not resolve behaves exactly like `#/tome/<id>` with no screen — land on `#/home`, never on a gated screen against the stale active tome.

**Files:** `dungeon-scholar/src/App.jsx` (the pending-tome consumption effect, `:723-737`); optionally `dungeon-scholar/src/router/useHashRoute.js` (`parseHash`, `:23-27`) + `dungeon-scholar/src/router/useHashRoute.test.jsx`.

**Steps:**

1. In the not-found branch (`App.jsx:728`) add `setScreen('home')` alongside the existing toast, so a failed tome resolution resets the screen to home before `clearPendingTome()` canonicalizes the URL. Confirm this composes with the gated-screen bounce (`:741`) and does not double-toast.
2. (Optional, defensive) Keep `parseHash` as-is (it is pure and correct); the bug is the consumer not the parser. If a unit test is cheaper at the parser layer, instead document that `parseHash` intentionally preserves the screen segment and the *consumer* owns the not-found redirect.
3. Add/extend a `useHashRoute`/App test (or a small router test) asserting that an unresolved `#/tome/<bad>/quiz` ends on `home`, while a resolvable `#/tome/<good>/quiz` still lands on `quiz`.

**Acceptance:** unresolved `#/tome/<bad-id>/<screen>` lands on `#/home` (matching `#/tome/<bad-id>`); a valid deep link still lands on its screen with its tome; `npm run build` clean; new test green.

### 08B — Gate the full hero to home; slim stat strip elsewhere (F2)

**Objective:** the full player-stats hero shows only on `#/home`; sub-screens get a compact strip so screen content is visible without scrolling.

**Files:** `dungeon-scholar/src/App.jsx` (`:1699-1820`).

**Steps:**

1. Wrap the full hero block in a `screen === 'home'` guard.
2. For non-home screens, render a slim persistent strip (e.g. level + XP-to-next + gold, and the `ProfileChip` when signed in) so essential status stays without the full chrome. Keep it inside `<main>` above the Suspense content.
3. Preserve the existing aria-labels/titles on any counters carried into the strip (Phase 40a QA P1 work).

**Acceptance:** home is visually unchanged; every other screen shows the compact strip and its own content above the fold at desktop and mobile widths; `npm run build` clean.

### 08C — Cut per-answer main-thread cost in the persistence hook (F3)

**Objective:** answering a practice-exam riddle does not block the main thread; per-click full-blob serialization/broadcast is eliminated or coalesced, without changing save semantics.

**Files:** `dungeon-scholar/src/hooks/usePlayerState.js` (`trackLocalHash` `:94-102`, `setState` `:178-221`); optionally `dungeon-scholar/src/features/study/ExamMode.jsx` (navigator grid `:775-795`).

**Steps:**

1. Stop running a full-blob `JSON.stringify` (`:96`) and the full-state `postMessage` (`:199`) on **every** `setState`. Prefer coalescing the answer-event burst into one update and/or moving the fingerprint + broadcast to the trailing edge (piggyback the existing `LOCAL_DEBOUNCE_MS` timer) so they run once per settle, not ~4× per answer. Keep the cross-tab/Realtime self-echo de-dupe correct (the `recentLocalHashesRef` ring buffer must still see each settled state).
2. Do **not** change the debounce windows, the saved payload, the sync-meta/dirty logic, or the `beforeunload` synchronous flush (crash-safety).
3. (Optional) Memoize the exam navigator grid (`ExamMode.jsx:775-795`) and/or the hero so an answer re-renders only the changed cell.
4. Confirm with the Performance panel on a large (~90 KB) save that answer-to-answer main-thread time drops; capture the before/after in `## Completed`.

**Acceptance:** the full-blob stringify + broadcast no longer run once-per-`setState` during an answer burst; save/sync behaviour and tests are unchanged; `npm run build` + `npm run test` clean; a Performance-panel note records the improvement.

### 08D — Suppress irrelevant Oracle sources on out-of-tome answers (F4)

**Objective:** the "SOURCES FROM THE TOME" block appears only when the cited cards actually support the Oracle's answer.

**Files:** `dungeon-scholar/src/features/study/ChatMode.jsx` (`relevantSources` `:329`, answer assembly `:376`, render guard `:575`).

**Steps:**

1. Gate the sources attached to the Oracle answer (`:376`) on a relevance threshold — e.g. require the top `searchTome` score to exceed a small minimum rather than merely `> 0` (`:249`) — and/or suppress the sources when `text` contains the out-of-tome disclaimer the system prompt requests (`:279`).
2. Leave the **Tome Search** fallback (`renderSearchResults`, `:255-267`) untouched — there the sources *are* the response.
3. Add a small test: an out-of-tome answer (disclaimer present, only weak lexical hits) renders no sources block; an in-tome answer still renders its sources.

**Acceptance:** out-of-tome Oracle answers no longer show unrelated "sources"; in-tome answers and the Tome Search fallback are unchanged; `npm run build` + new test green.

### 08E — Supabase refresh circuit-breaker + stale-token quarantine (F5)

**Objective:** when the Supabase host is unreachable and the stored session is stale, the client stops retrying after a small ceiling, drops the unusable token, and surfaces `offline` once — no unbounded `console.error` stream.

**Files:** `dungeon-scholar/src/hooks/useAuth.js` (`:21-83`), `dungeon-scholar/src/services/supabase.js` (`:10-39`); optionally `dungeon-scholar/src/services/cloudSync.js` for the sync-status surface.

**Steps:**

1. Add a consecutive-failure counter around the refresh path. After a small ceiling of network failures, call `stopRefresh()` (`stopAutoRefresh`) and set the sync status to `offline` once (route through the existing `logWarn`, not `console.error`).
2. Quarantine the stale token when the host is unreachable: on repeated refresh failure, `supabase.auth.signOut({ scope: 'local' })` (or remove the persisted `sb-…-auth-token`) so the ticker stops and the already-correct signed-out/local UI shows. Ensure `startRefresh()` is **not** re-armed from `getSession()`/`onAuthStateChange` (`:56`/`:74`) once quarantined.
3. Preserve PHASE-02's gating (`autoRefreshToken: false`, ticker only on a live session) — this extends it, never reverts it.
4. Add a test with a mock auth client whose refresh rejects with a network error: assert the ticker is stopped after the ceiling, the token is cleared, and the status is `offline` with a single warn (no error spam).
5. **Ops note (no code):** record in the executer/integrator log that the deployment's Supabase project appears paused/unreachable and should be verified.

**Acceptance:** with an unreachable host + stale token, refresh attempts stop after the ceiling, the token is quarantined, the UI shows signed-out/local, and the console shows a single handled warning instead of a growing error stream; PHASE-02 behaviour for the signed-out and healthy-session cases is unchanged; `npm run build` + new test green.

## Research notes

- **F1:** the screen-less `#/tome/<bad-id>` already redirects home purely because `parseHash` defaults `parts[2]` to `'home'` (`useHashRoute.js:26`); the fix makes the *consumer* (App's pending-tome effect) enforce the same outcome for the screen form, which is where the divergence actually lives.
- **F3:** the report's "synchronous 90 KB save per answer" framing is corrected — the localStorage write is debounced (`LOCAL_DEBOUNCE_MS = 500`); the real per-click cost is the un-debounced `trackLocalHash` stringify + the structured-cloning `postMessage`, multiplied by the documented ~4-`setState` answer burst. Fixing the *frequency* of those two beats only chasing the (already-handled) save.
- **F5:** this is the hardening `PHASE-INDEX.md` explicitly deferred ("fold it into a future load-noise round if it persists after PHASE-02 ships"). It has now persisted across the 2026-06-28 and both 2026-06-29 passes, with a confirmed network-level root cause, so it is authored here rather than deferred again.
- The two 2026-06-29 reports also re-confirmed items already planned/tracked (see PHASE-INDEX) and are not re-authored: the paste-import toast inconsistency (PHASE-07 F1), the Light-theme flashcard dark-on-dark (PHASE-03 F1/03B), the Light-theme Chat light-on-light (PHASE-03 F5/03G), and the "regenerate with the updated prompt" exam copy (PHASE-07 F2, extended to the Domain Codex + Flashcards domain-filter states as PHASE-07 07C). The Light-theme Library chip/subject-label low-contrast is added to PHASE-03 as F6/03H.

## Test plan

- Per sub-phase: the targeted test noted above (`npx vitest run` the affected file). F2 has no unit gate beyond the build — verify on the next deploy.
- At phase end: `npm run lint:fix` (per PHASE-02's biome caveat — hand-format the touched files rather than a repo-wide autofix that rewrites unrelated files), then push and let CI (`dungeon-scholar-ci.yml`) run the full `npm run test` + `npm run build` (`VITE_BASE=/home-lab/`) gate.
- Runtime / next-deploy verification (not CI-gated): F1 — paste `#/tome/<bad>/quiz`, confirm it lands on home; F2 — open a sub-screen, confirm the slim strip + visible content; F3 — Performance panel before/after on a large save during an exam; F4 — ask an out-of-tome question, confirm no sources; F5 — load signed-in with a stale token against the unreachable host, confirm the console settles to one warning and the UI shows signed-out/local.

## Acceptance criteria

- An unresolved `#/tome/<id>/<screen>` deep link redirects to `#/home` like `#/tome/<id>` does; valid deep links still land on their screen + tome (F1).
- The full hero shows only on home; other screens show a compact stat strip with their content above the fold (F2).
- Per-answer main-thread work no longer includes a once-per-`setState` full-blob stringify + broadcast; save/sync semantics, debounce windows, and the cross-tab/Realtime contract are unchanged (F3).
- Out-of-tome Oracle answers carry no "SOURCES FROM THE TOME" block; in-tome answers and Tome Search are unchanged (F4).
- With an unreachable Supabase host + stale token, the refresh loop stops after a small ceiling, the token is quarantined, the UI is signed-out/local, and the console shows one handled warning rather than an error storm; PHASE-02's signed-out and healthy-session behaviour is unchanged (F5).
- `dungeon-scholar-ci.yml` green (full `npm run test` + `npm run build`).

## Out of scope

- Redesigning the hero/stat surface beyond the home-gate + compact strip (F2) — no new visual system.
- A general persistence/broadcast rewrite or moving saves to a Worker/IndexedDB (F3) — only the per-`setState` cost is in scope here; a larger off-main-thread persistence effort, if wanted, is a separate phase.
- The Oracle retrieval ranking algorithm itself (F4) — only the gating of the sources block; tuning `searchTome`'s scorer is a separate concern.
- Bringing the Supabase backend back online or any account/cloud-sync feature work (F5) — F5 is purely client-side resilience to an unreachable host; the project's live/paused status is an ops note, not a code change.
- The Light-theme contrast items (PHASE-03) and the import/exam copy items (PHASE-07) — authored/amended in those phases, not here.

## Completed

Implemented 2026-06-29 by `scholar-phase-executer` on `auto/scholar-phase-executer` (CI-gated; integrator merges). Auto-approved this run as a predominantly behavioural bug round (F1 routing fall-through, F4 wrong-source correctness, F5 refresh-storm resilience). Line anchors had drifted from the plan (rule 3) and were re-located by content.

- **08A (F1) — deep-link fall-through.** `src/App.jsx` pending-tome consumer: the not-found `else` branch (was cited `:728`, found at the `showNotif('That tome is not in thy library.', 'error')` site) now calls `setScreen('home')` before `clearPendingTome()`, so `#/tome/<bad-id>/<screen>` falls through to home like `#/tome/<bad-id>` instead of rendering the gated screen against the stale active tome. `parseHash` left unchanged (it correctly preserves the screen segment; the consumer owns the not-found redirect — documented in-code). Parser contract already covered by `useHashRoute.test.jsx` (`#/tome/abc/bogus → home`); the consumer reset is runtime-verifiable on next deploy.
- **08B (F2) — hero gated to home.** `src/App.jsx` `<main>`: the full player hero (level badge / XP bar / VICTORIES·DELVES·DRAGONS / ⚜ corners) is now wrapped in `{screen === 'home' ? (…) : (…)}`; non-home screens render a slim strip (clip-path level badge + a compact EXPERIENCE bar + ProfileChip when signed in) so screen content sits near the top. Gold/quests already live in the persistent header. Presentation-only; `npm run build` (VITE_BASE=/home-lab/) clean. Visual check is a next-deploy item.
- **08C (F3) — per-answer main-thread cost.** `src/hooks/usePlayerState.js`: the full-blob `trackLocalHash` (JSON.stringify) and the structured-cloning `postMessage` no longer run on every `setState`; both moved onto the trailing edge of the existing `LOCAL_DEBOUNCE_MS` (500 ms) local-save timer, so an answer burst (~4 setStates) does the stringify+broadcast once per settle instead of ~4×. `flushLocal` also records the settled hash + broadcasts so an early flush keeps the self-echo dedup and cross-tab contract intact. Save semantics, debounce windows, dirty/cloud-push logic, and the `beforeunload` flush are unchanged. The cross-tab dedup test was updated to settle the debounce before the echo (the fingerprint+broadcast are now trailing-edge). `usePlayerState.test.jsx` (30) + `ExamMode.test.jsx` green. The exam-navigator memoization (optional step 3) was left out (the dominant per-click cost is the hook stringify+broadcast, now fixed); a Performance-panel before/after capture needs a browser and is a next-deploy verification (the plan flagged this sub-finding partially unverified).
- **08D (F4) — out-of-tome Oracle sources.** New pure module `src/features/study/oracleSources.js` (`oracleSourcesForAnswer` / `isOutOfTomeAnswer` / `ORACLE_SOURCE_MIN_SCORE = 10`); `src/features/study/ChatMode.jsx` now stores the assistant answer with `sources: oracleSourcesForAnswer(text, relevantSources)`, which drops the sources block when the answer carries the out-of-tome disclaimer or the top `searchTome` score is a weak (< 10) lexical hit. The render guard and the Tome-Search fallback are untouched. New `oracleSources.test.js` (6) green.
- **08E (F5) — Supabase refresh circuit-breaker + stale-token quarantine.** `src/hooks/useAuth.js`: a present session is now validated with an explicit `refreshSession()` probe (failure ceiling `MAX_REFRESH_FAILURES = 3`, `REFRESH_RETRY_MS = 300`) before the auto-refresh ticker is re-armed. On persistent network failure it quarantines — `stopAutoRefresh()`, `signOut({ scope: 'local' })` to drop the unusable token, `setUser(null)` (UI falls to signed-out/local), and ONE `logWarn` instead of the per-attempt `console.error` storm — and a `quarantined` flag prevents `onAuthStateChange` from re-arming. PHASE-02's gating is preserved: a client/mock without `refreshSession` keeps the exact just arm the ticker path, so the existing `useAuth.test.jsx` (7) is untouched and green. New `useAuth.circuitBreaker.test.jsx` (3) green. `supabase.js` needed no change (quarantine drives `signOut({scope:'local'})` directly). Ops note logged per step 5.

Validation: targeted Vitest (`oracleSources`, `useAuth`, `useAuth.circuitBreaker`, `useHashRoute`, `usePlayerState`, `ExamMode` — all green) + `npm run build` (VITE_BASE=/home-lab/) clean; full `npm run test`+`npm run build` is the CI gate on push (`dungeon-scholar-ci.yml`). Biome autofix run on the touched files only (the repo's pre-existing useExhaustiveDependencies warnings are unchanged and not CI-gated).
