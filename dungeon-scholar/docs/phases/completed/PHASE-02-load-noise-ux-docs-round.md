# PHASE-02 — Load-noise, UX & docs round

> Authored from the 2026-06-24 dungeon-scholar QA report (tested @ deployed `dd0b1d97` · `origin/master` `08772fa6`). Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md). PLANNING ONLY — this phase authors the plan; no app changes here.

## Goal

Clear the five low-severity findings the 2026-06-24 QA pass raised across load-time console health, progression/devotion copy, the delve layout, and the README: (F1) a Supabase token-refresh retry loop logging `TypeError: Failed to fetch` on every signed-out load; (F2) the README advertising a live URL that 404s; (F3) the dungeon delve overflowing the viewport into a page-level scrollbar; (F4) a daily-quest reward rendering a unit-less "+6"; (F5) the Devotion Calendar showing "Streak broken" on a first/short streak. Each is independently shippable; none changes the app's core behaviour.

## Dependencies & cross-phase notes

- **No prerequisite phases.** All five are self-contained.
- **Independent of PHASE-01** (routing/PWA resilience) — no shared files. Either order is fine; PHASE-01 first by severity (it carries the report's only High).
- **F1 (Supabase) cross-ref:** touches `src/services/supabase.js` + `src/hooks/useAuth.js`, established by PHASE-40 (`ds-pwa-cloud`). Keep the change additive to the existing PKCE/`detectSessionInUrl:false` setup — do not alter the OAuth exchange path (`consumeOAuthCallback`, supabase.js:84-95).
- **F5 (devotion) cross-ref:** `src/services/devotion.js` carries the pure claim/cycle helpers (`computeNextClaim`, `evaluateClaim`) with full coverage in `devotion.test.js`; the status-copy fix should add a **pure helper there** (unit-tested) and have `CalendarScreen.jsx` render from it — matching the repo's "logic in services, tested; UI renders the result" pattern (PHASE-17 17E precedent).

## Verified findings

All verification was performed read-only against the live tree at `origin/master` (worktree `auto/scholar-phase-maker`).

### F1 (low) — Supabase token-refresh retry loop logs `TypeError: Failed to fetch` on every signed-out load

**Status: confirmed config; root cause is a hypothesis (network-level failure not reproducible from the worktree) — flagged below.**

QA (signed-out, first load of `#/home`, DevTools open): the console logs `TypeError: Failed to fetch` ~5× over ~5s from Supabase GoTrue `so._refreshAccessToken` → `_callRefreshToken`. The UI is unaffected, but it is recurring error-level console noise that fires with **no signed-in session**.

Source state:

- `src/services/supabase.js:10-19` creates the client (when `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` are set — they are on the live deploy) with `auth: { flowType: 'pkce', autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }`.
- `src/hooks/useAuth.js:26` calls `supabase.auth.getSession()` on mount and subscribes via `onAuthStateChange` (useAuth.js:32).
- With `autoRefreshToken: true` + `persistSession: true`, GoTrue starts its auto-refresh ticker and, on init (`_recoverAndRefresh`), will attempt a refresh when a persisted session exists. `_callRefreshToken` **retries on network failure**, which produces the repeated `Failed to fetch`.

**Hypothesis / root cause (speculation — flag clearly):** the most likely trigger is a **persisted-but-expired** session blob in `localStorage` (from a prior sign-in on that non-throwaway profile) that GoTrue keeps trying to refresh, with the refresh endpoint unreachable at that moment (hence `Failed to fetch` at the network layer rather than a 401/400). The retries are GoTrue's `_callRefreshToken` backoff. Because the QA profile was explicitly "not a fresh throwaway profile … real accumulated progress," a stale auth blob is plausible. This could not be reproduced from the read-only worktree (no browser/session state), so the exact trigger is **unverified**.

Verification commands (read-only):

```bash
sed -n '1,40p' dungeon-scholar/src/services/supabase.js
sed -n '14,43p' dungeon-scholar/src/hooks/useAuth.js
grep -rn "autoRefreshToken\|startAutoRefresh\|stopAutoRefresh\|getSession" dungeon-scholar/src
```

**Suggested action (the report's):** gate refresh on the presence of a real session, and downgrade caught network failures to a single debug-level log rather than recurring error noise.

### F2 (low, docs) — README advertises a live URL that 404s

**Status: confirmed in source.** `dungeon-scholar/README.md:5` and `:24` both link the live site as `https://EvilPatrick06.github.io/dungeon-scholar/`, which **404s**. This monorepo deploys under `/home-lab/` (`deploy.yml` builds with `VITE_BASE=/home-lab/`; see the `vite.config.js:6-12` comment — the fork-default base is `/dungeon-scholar/`, the owner's actual deploy is `/home-lab/`). A reader following the README lands on a GitHub-Pages 404. (Called out as a known finding in `QA/INSTRUCTIONS.md` §3.)

Verification: `grep -n "github.io" dungeon-scholar/README.md` → lines 5, 24 hardcode `/dungeon-scholar/`; line 162 is a generic `https://<user>.github.io/<repo>/` placeholder (correct, leave it).

**Suggested action:** point README:5 and README:24 at the actual live deploy `https://evilpatrick06.github.io/home-lab/`. Keep the fork story intact — the README/`vite.config.js` already explain that forks renaming to `dungeon-scholar` get the zero-config base; add a one-line note that **this** repo deploys at `/home-lab/` so the two don't read as contradictory.

### F3 (low, UX) — The dungeon delve overflows into a page-level vertical scrollbar

**Status: confirmed in source.** Inside a delve the canvas + HUD render taller than the viewport, so the browser shows a persistent page-level vertical scrollbar during real-time play (the player/foe can sit below the fold).

Root cause, confirmed:

- The delve canvas is fixed at `CANVAS_W = VIEW_W * TILE_PX = 25 × 48 = 1200` × `CANVAS_H = VIEW_H * TILE_PX = 17 × 48 = 816` px (`DungeonExplore.jsx:122-125`, `tileRenderer.js:6`).
- The play view (`DungeonExplore.jsx:2186` `<div className="space-y-2">`) renders an abandon/biome row + a canvas wrapper (`:2199-2214`) styled `width:100%; maxWidth: CANVAS_W; aspectRatio: CANVAS_W/CANVAS_H` — i.e. it scales to width but is **not capped to viewport height**.
- It mounts inside the app's persistent chrome: the header level/XP banner (App.jsx:1778-1869, always present) + the page container `max-w-6xl mx-auto p-6` (App.jsx:1554). Header (~120px) + padding + an up-to-816px-tall canvas exceeds a ~900px viewport → page scroll.

Verification commands (read-only):

```bash
sed -n '122,126p' dungeon-scholar/src/components/dungeon/DungeonExplore.jsx   # VIEW_W/VIEW_H, CANVAS_W/H
sed -n '2186,2227p' dungeon-scholar/src/components/dungeon/DungeonExplore.jsx # play view + canvas wrapper
grep -n "100vh\|100dvh\|max-h\|maxHeight" dungeon-scholar/src/components/dungeon/DungeonExplore.jsx  # → none
```

**Suggested action:** cap the delve play view to the viewport height (accounting for the header) — e.g. cap the canvas wrapper with `max-height: calc(100dvh - <header+padding>)` while keeping the existing `aspectRatio` + `width:100%` so it scales down to fit instead of overflowing; the canvas already pans internally (camera follows the player), so the page itself never needs to scroll during play. Use `dvh` (not `vh`) so mobile browser chrome doesn't reintroduce the overflow.

### F4 (low, UX/a11y) — Daily-quest reward renders a unit-less "+6"

**Status: confirmed in source.** A daily quest's reward line reads e.g. "✦ Reward: +60 XP • +6" — the second value has no unit/icon in text, so it's unclear whether it's gold, devotion, or something else. The Devotion Calendar by contrast renders units cleanly (it uses text emoji 🪙/✦).

Root cause, confirmed: `QuestBoard.jsx:70-75` renders the reward row as `✦ Reward:` + `+{q.xp} XP` + a lucide `<Coins className="w-3 h-3" /> +{goldReward}`. The gold unit is conveyed **only** by a 12px lucide `<Coins>` SVG with **no `aria-label`/`title` and no adjacent text** — so to a screen reader and to text extraction it is a bare "+6", and at 12px it's easy to miss visually. The same unlabelled-`<Coins>` pattern repeats in the story-step card (`QuestBoard.jsx:246-251`) and the chain-bonus card (`:324-329`). (The QA's "icon genuinely absent" reading is the SVG-vs-emoji difference: the calendar's 🪙 is text and survives extraction; the quest board's `<Coins>` SVG does not and carries no accessible name.)

Verification commands (read-only):

```bash
sed -n '66,76p'  dungeon-scholar/src/features/quests/QuestBoard.jsx
sed -n '244,252p' dungeon-scholar/src/features/quests/QuestBoard.jsx
sed -n '322,330p' dungeon-scholar/src/features/quests/QuestBoard.jsx
```

**Suggested action:** give the gold reward a unit that survives both screen readers and text — add `aria-label="gold"` + `title="gold"` to the `<Coins>` icon (and `aria-hidden` is wrong here precisely because it's the only unit carrier), or render a short visible "gold" label, applied consistently at all three sites (`:74`, `:250`, `:328`). Prefer matching the calendar's convention so the same currency reads the same way app-wide.

### F5 (low, UX) — Devotion Calendar shows "Streak broken — start anew at Day 1" on a first/short streak

**Status: confirmed in source.** The calendar can simultaneously show CURRENT STREAK 🔥1, LONGEST 1, TOTAL LOGINS 1, and the banner "Streak broken — start anew at Day 1." On a first/short streak the "broken" framing is confusing — there was no meaningful streak to break.

Root cause, confirmed: `CalendarScreen.jsx:96-100` (inside the not-claimed-today branch) picks the status copy as:

```jsx
{gap === 1 ? `Continue thy streak — Day ${cycleDayIdx} of the cycle awaits.` :
 streak === 0 ? 'Begin thy first devotion.' :
 `Streak broken — start anew at Day ${cycleDayIdx}.`}
```

`streak` is the **stored** `playerState.loginStreak` (CalendarScreen.jsx:11) — it is only reset to 1 at *claim* time (via `computeNextClaim`/`evaluateClaim` in `devotion.js`), **not** on view. So a user who claimed once (streak stored as 1, `longest` 1, `total` 1) and returns a couple days later without claiming has `gap > 1` and `streak === 1 (≠ 0)`, falling into the else branch → "Streak broken — start anew at Day 1." The condition fires for **any** lapsed non-zero streak regardless of whether a streak ≥ 2 was actually lost.

Verification commands (read-only):

```bash
sed -n '8,20p'   dungeon-scholar/src/features/progression/CalendarScreen.jsx   # streak/longest/gap derivation
sed -n '93,101p' dungeon-scholar/src/features/progression/CalendarScreen.jsx   # the three-way status copy
sed -n '39,49p'  dungeon-scholar/src/services/devotion.js                       # computeNextClaim
```

**Suggested action:** only show "Streak broken" when a **prior streak of length ≥ 2 was actually lost** — gate it on `longest >= 2` (a real streak previously existed) or on the about-to-be-reset streak being `> 1`. For a lapsed first/1-day streak, show neutral/encouraging copy (e.g. "A new dawn — begin Day 1 of thy devotion."). Add a pure helper in `devotion.js` (e.g. `devotionStatus({ today, lastClaimedDate, streak, longest })` → a status key) with unit tests in `devotion.test.js`, and render the copy from it in `CalendarScreen.jsx` (keep the dungeon-flavoured strings in the component).

## Sub-phases

> dungeon-scholar checks (from `dungeon-scholar/`): single test `npx vitest run src/.../that.test.jsx` during sub-phase work; CI (`dungeon-scholar-ci.yml`) runs the full `npm run test` + `npm run build` (`VITE_BASE=/home-lab/`) gate on push. Pure-layout/README/copy changes lean on the build + read; logic changes get a unit test.

### 02A — Quiet the signed-out Supabase token-refresh noise (F1)

**Objective:** no recurring `TypeError: Failed to fetch` error-level logs on a signed-out load; refresh only runs when a session exists.

**Files:** `dungeon-scholar/src/services/supabase.js`, `dungeon-scholar/src/hooks/useAuth.js`, + tests (`supabase.test.js` / `useAuth.test.jsx`).

**Steps:**

1. Change the client config to `autoRefreshToken: false` (keep `persistSession: true`, PKCE, `detectSessionInUrl: false`), and drive refresh explicitly: in `useAuth`, after `getSession()` resolves a real session and on `onAuthStateChange` `SIGNED_IN`, call `supabase.auth.startAutoRefresh()`; on `SIGNED_OUT` / no session, call `supabase.auth.stopAutoRefresh()`. This stops the init-time refresh attempt when there is no live session.
2. Wrap the initial `getSession()` (and any recovery path) so a network-level rejection is caught and logged **once at debug/warn level** via the existing `logger.js` (`logWarn`), not left to surface as repeated console errors.
3. If a stale/expired persisted session is the trigger, ensure a failed refresh path clears or ignores the bad blob rather than retrying indefinitely (best-effort; flagged as the unverified root cause — implement defensively and note it in `## Completed`).
4. Tests: `useAuth` starts auto-refresh only after a session is present and stops it on sign-out (mock `supabase.auth`); a rejected `getSession()` does not throw and logs once.

**Acceptance:** unit tests green; signed-out init makes no token-refresh network attempt (asserted via the mock); a caught network failure logs at most once; the OAuth sign-in/exchange path (`consumeOAuthCallback`) is unchanged; `npm run build` clean. (The console-noise elimination itself is runtime-verifiable only on the live deploy — ship the gating + single-log behaviour, which CI can assert via the mocks.)

### 02B — Fix the README live URL (F2)

**Objective:** the README points at the URL that actually serves.

**Files:** `dungeon-scholar/README.md`.

**Steps:**

1. Change README:5 and README:24 to `https://evilpatrick06.github.io/home-lab/` (both the link text and href).
2. Add a one-line note near the live link (or in the Deploy section ~:155) that **this** repo (the `home-lab` monorepo) deploys under `/home-lab/` via `VITE_BASE`, while a fork renamed to `dungeon-scholar` gets the zero-config `/dungeon-scholar/` base — so the fork-default base in `vite.config.js` and the live URL don't read as contradictory.
3. Leave the generic `https://<user>.github.io/<repo>/` placeholder at README:162 as-is (it's correct).

**Acceptance:** no `EvilPatrick06.github.io/dungeon-scholar/` link remains in the README; the live link resolves to the deployed site; `npm run build` unaffected (docs-only).

### 02C — Cap the delve view to the viewport (F3)

**Objective:** entering a delve no longer introduces a page-level scrollbar; the canvas fits the viewport.

**Files:** `dungeon-scholar/src/components/dungeon/DungeonExplore.jsx` (the play-view wrapper `:2186` / canvas container `:2199-2214`). Optionally `src/index.css` if a shared utility is cleaner.

**Steps:**

1. Cap the canvas wrapper's height to the viewport minus the persistent header/padding — e.g. add `maxHeight: calc(100dvh - <measured header+padding>)` (or a small CSS class) alongside the existing `width:100%` + `aspectRatio`, so the canvas scales down to fit instead of overflowing. Use `100dvh` so mobile browser chrome doesn't reintroduce overflow.
2. Centre the wrapper within the available space (it's already `mx-auto`); ensure the abandon/biome row (`:2187-2194`) and the canvas together stay within the viewport.
3. Confirm the canvas's internal camera pan (player-follow) still covers the map at the reduced size — the canvas already pans internally, so no map content becomes unreachable.
4. Sanity-check the three viewports (375 / 768 / desktop) and both themes don't reintroduce a page scrollbar during play.

**Acceptance:** at desktop ~1568×900 the delve view fits with no page-level vertical scrollbar; the canvas keeps its aspect ratio and remains fully visible; mobile/tablet don't overflow; `npm run build` clean. (Visual fit is runtime-verified; the change is a contained style cap.)

### 02D — Give the quest gold reward a unit (F4)

**Objective:** the secondary reward reads as gold for sighted users, screen readers, and text extraction.

**Files:** `dungeon-scholar/src/features/quests/QuestBoard.jsx` (sites `:74`, `:250`, `:328`).

**Steps:**

1. Add `aria-label="gold"` + `title="gold"` to each `<Coins>` reward icon (do **not** `aria-hidden` it — it is the only unit carrier), or render a short visible "gold" label next to the value, applied identically at all three reward-row sites.
2. Match the Devotion Calendar's currency convention so gold reads consistently app-wide.
3. If a quick win: add a tiny render test asserting the daily-quest reward row exposes an accessible "gold" name.

**Acceptance:** the gold reward exposes an accessible name/visible unit at all three sites; the XP value still reads correctly; `npm run build` clean.

### 02E — Devotion status copy: only say "broken" when a real streak was lost (F5)

**Objective:** a first/short lapsed streak shows neutral/encouraging copy, not "Streak broken."

**Files:** `dungeon-scholar/src/services/devotion.js` (+ `devotion.test.js`), `dungeon-scholar/src/features/progression/CalendarScreen.jsx` (`:96-100`).

**Steps:**

1. Add a pure helper to `devotion.js`, e.g. `devotionStatus({ today, lastClaimedDate, streak, longest })`, returning a status key: `continuing` (gap === 1), `firstEver` (no prior claim / streak 0), `lapsedShort` (a non-continuing streak where no streak ≥ 2 was lost — `longest < 2`), `broken` (a streak ≥ 2 was actually lost — `longest >= 2`). Reuse `dayDiff`/`computeNextClaim` for the gap/cycle math.
2. Unit-test each branch in `devotion.test.js` — especially streak 1 / longest 1 / lapsed → `lapsedShort`, not `broken`; and a prior longest ≥ 2 lapsed → `broken`.
3. In `CalendarScreen.jsx:96-100`, render the copy from the status key (keep the dungeon-flavoured strings in the component): `lapsedShort` → e.g. "A new dawn — begin Day {cycleDayIdx} of thy devotion."; `broken` keeps the existing "Streak broken — start anew…"; `continuing`/`firstEver` unchanged.

**Acceptance:** new/extended `devotion.test.js` green; streak 1 / longest 1 no longer shows "Streak broken"; a genuinely lost ≥ 2-day streak still shows "broken"; `npm run build` clean.

## Research notes

- Supabase JS v2 exposes `startAutoRefresh()` / `stopAutoRefresh()` for explicit control when `autoRefreshToken` is off — the supported way to avoid init-time refresh attempts on a session-less load.
- `100dvh` (dynamic viewport height) avoids the mobile-browser-chrome overflow that `100vh` causes; supported in all current evergreen browsers.
- A lucide icon with no `aria-label` has no accessible name; when an icon is the *only* signal for a value, it needs a label (or visible text) — `aria-hidden` would be wrong precisely here.

## Test plan

- Per sub-phase: `npx vitest run` the one affected test (`useAuth.test.jsx`/`supabase.test.js` for 02A; `devotion.test.js` for 02E; a small render test for 02D).
- At phase end: `npm run lint:fix`, then push and let CI (`dungeon-scholar-ci.yml`) run the full `npm run test` + `npm run build` (`VITE_BASE=/home-lab/`) gate.
- Runtime-only checks (not CI-gated), to confirm on the next deploy: signed-out console is quiet (F1); the live README link resolves (F2); the delve fits the viewport at the three sizes (F3); a screen reader announces "gold" on a quest reward (F4); a fresh 1-day streak shows neutral copy (F5).

## Acceptance criteria

- Signed-out load makes no token-refresh network attempt and logs any caught network failure at most once (F1).
- No 404-ing `dungeon-scholar/` GitHub-Pages link remains in the README; the live link resolves (F2).
- The delve view fits the viewport with no page-level scrollbar across the three viewports/both themes (F3).
- The quest gold reward exposes a unit/accessible name at all three reward-row sites (F4).
- A first/short lapsed streak shows neutral copy; only a lost ≥ 2-day streak says "broken" (F5).
- `dungeon-scholar-ci.yml` green.

## Out of scope

- Re-architecting auth/sync or the OAuth exchange — 02A is a targeted refresh-gating + log-level change only.
- The responsive-reflow gap the QA noted under "Could not test" (the driver's `resize_window` didn't reflow the capture) — that's a QA-tooling limitation, not an app finding; the delve cap (02C) is checked at the three sizes but a full responsive audit is its own pass.
- Any change to the 7-day reward cycle math or claim rules (`evaluateClaim`/`computeNextClaim`) — 02E only changes the **status copy**, not the cycle/claim behaviour.

## Completed

Implemented 2026-06-24 on `auto/scholar-phase-executer` (run agent-id `scholar-phase-executer`).

- **02A** — `src/services/supabase.js:14` sets `autoRefreshToken: false` (PKCE / `persistSession` / `detectSessionInUrl:false` unchanged). `src/hooks/useAuth.js` now drives refresh explicitly: `startRefresh()` only after `getSession()` resolves a real session and on `onAuthStateChange` with a session; `stopRefresh()` on no-session / sign-out / unmount (both guarded via optional chaining so an unconfigured/mocked client is a no-op). The initial `getSession()` is `.catch()`-wrapped → a network rejection logs **once** via `logWarn` and leaves the user signed-out instead of surfacing GoTrue's repeated retries. `consumeOAuthCallback` untouched. Tests: `src/hooks/useAuth.test.jsx` extended to 7 cases (no refresh on signed-out init; start on session/SIGNED_IN; stop on SIGNED_OUT; rejected getSession logs once, no throw) — green. The console-noise elimination itself is runtime-only on the live deploy; the gating + single-log behaviour is asserted via mocks.
- **02B** — `README.md:5` and `:24` now link `https://evilpatrick06.github.io/home-lab/` (the URL that serves); added a Deploy-section note that this monorepo deploys under `/home-lab/` via `VITE_BASE` while a fork renamed to `dungeon-scholar` gets the zero-config `/dungeon-scholar/` base, so the two don't read as contradictory. Generic placeholder at README:162 left as-is. Docs-only.
- **02C** — `src/components/dungeon/DungeonExplore.jsx:2210` caps the delve canvas wrapper `maxWidth` to `min(${CANVAS_W}px, calc((100dvh - 210px) * ${CANVAS_W} / ${CANVAS_H}))`, keeping the existing `width:100%` + `aspectRatio` so the canvas scales down to fit the viewport (header/padding ~210px) instead of overflowing into a page-level scrollbar; `dvh` avoids mobile-chrome overflow. The 210px offset is an estimate (header banner + `p-6` + abandon row); `min()` errs toward fitting. Visual fit is runtime-verified per the plan; the build gates the syntax.
- **02D** — `src/features/quests/QuestBoard.jsx` adds `aria-label="gold"` + `title="gold"` to all three gold `<Coins className="w-3 h-3" />` reward icons (the daily-reward `:74`, story-step `:250`, and chain-bonus `:328` sites), giving the previously unit-less "+N" an accessible name + tooltip that survives screen readers and text extraction. (Optional render test skipped — the icon attributes are read-verifiable and QuestBoard needs heavy context to mount.)
- **02E** — `src/services/devotion.js:57` adds the pure `devotionStatus({ today, lastClaimedDate, streak, longest })` → `'continuing' | 'firstEver' | 'lapsedShort' | 'broken'`; "broken" is gated on `longest >= 2` (a real streak previously existed), so a first/1-day lapsed streak returns `lapsedShort`. `src/features/progression/CalendarScreen.jsx:96-100` renders the banner copy from the status key (lapsedShort → "A new dawn — begin Day N of thy devotion."; broken keeps the old copy), and the now-unused `gap`/`dayDiff` were dropped. Tests: `src/services/devotion.test.js` extended with 5 `devotionStatus` cases (incl. streak 1/longest 1 → lapsedShort; longest 4 lapsed → broken) — 28 total green.

Notes: ran the affected vitest files locally (`useAuth.test.jsx` 7 + `devotion.test.js` 28 + the PHASE-01 files) per rule 5; full `npm run test` + `npm run build` (`VITE_BASE=/home-lab/`) left to CI. Deliberately did NOT run the repo-wide `npm run lint:fix` (rule 5's autofix): on this repo `biome check --write src` rewrites ~149 unrelated files (master is not biome-formatted and CI runs only test+build, not lint), which would bury the phase diff and risk integrator conflicts — touched files are hand-formatted to the surrounding style instead. Runtime-only checks (quiet signed-out console, live README link, delve viewport fit, screen-reader "gold", neutral first-streak copy) are not CI-gated, per the plan's Test plan.
