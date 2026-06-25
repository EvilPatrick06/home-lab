# Issues Log — dungeon-scholar

> **Active dungeon-scholar bugs / tech debt / broken config — Vite/React D&D-themed study app issues only.**
> Sibling logs:
> - dnd-app active bugs / debt → [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md)
> - BMO active bugs / debt → [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md)
> - dungeon-scholar future ideas / design gotchas / observations → [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md)
> - dnd-app future ideas / design gotchas / observations → [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
> - BMO future ideas / design gotchas / observations → [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
> - Resolved dungeon-scholar entries → [`RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](./RESOLVED-ISSUES-DUNGEON-SCHOLAR.md)
> - Security concerns (global, any domain) → [`SECURITY-LOG.md`](./SECURITY-LOG.md) *(gitignored)*
>
> Logging templates + triage rules: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md).

**Routing:** Bug / debt / config / perf / test failure scoped to `dungeon-scholar/` (Vite/React/Vitest study app, the per-tome run/quiz/lab content set, the Supabase auth wiring) → here. `Domain: both` cross-cutting entries → mirror in any other relevant issue log; small duplication is intentional.

New entries go at the TOP of their severity section (newest first within each section).

---

# Active Issues

> **2026-06-10 — Backlog consolidated.** All previously-open entries (the Phase 27
> remainder: H1–H5/H7, M2–M7/M10/M12/M13, plus the L/F entries from the suggestions
> log) became the numbered phase plans under `dnd-app/docs/phases/` (start at `PHASE-INDEX.md`); the consolidating audit was deleted once the phase set was authored (2026-06-11). Add new dungeon-scholar issues below as they
> appear.

## Critical

*(none currently logged)*

## High

### [2026-06-24] `auto/scholar-resolver` won't merge — divergent devotion/auth refactor vs `auto/scholar-phase-executer`

- **Category:** integration / merge-conflict (branch left unmerged by integrator)
- **Discovered by:** integrator (daily branch integration run)
- **During:** merging `origin/auto/scholar-resolver` (head `fccc9d17`, 7 ahead / 2 behind) into `master` after `origin/auto/scholar-phase-executer` had already been merged this run.

**Description:**
`auto/scholar-resolver` does NOT merge cleanly into current `master`. 6 content conflicts, all in dungeon-scholar source that `auto/scholar-phase-executer` (already merged into master this run) also refactored:
`src/services/supabase.js`, `src/hooks/useAuth.js`, `src/main.jsx`,
`src/features/progression/CalendarScreen.jsx`, `src/features/quests/QuestBoard.jsx`,
`src/services/devotion.test.js`.

**Root cause (diagnosed):** the two branches refactored the same devotion/auth subsystem in divergent directions, so this is not a mechanical conflict:
- `supabase.js` — **contradictory behavioral change**: master sets `autoRefreshToken: false` with a deliberate PHASE-02 rationale ("refresh driven explicitly in useAuth so a signed-out load never starts GoTrue's refresh retry loop"); `scholar-resolver` sets `autoRefreshToken: true`. Picking either side silently changes auth-refresh behavior.
- `devotion.js` API diverged — master/`CalendarScreen.jsx` + `devotion.test.js` use the new `devotionStatus()` 4-state API; `scholar-resolver` uses the older `gap===1` logic and imports `evaluateClaim / dayDiff / computeNextClaim`. The two test/usage surfaces are incompatible.
- `main.jsx` — master adds PWA `registerControlledReload` + `guardedReloadOnce`; the branch's `main.jsx` predates that machinery.
- `useAuth.js` / `QuestBoard.jsx` — smaller (import-order; master also keeps `aria-label`/`title` on the Coins icon the branch dropped).

The integrator did **not** auto-resolve: the `autoRefreshToken` choice and the devotion.js API direction are product/behavioral decisions this branch's owner must make — resolving blind risks shipping broken auth/streak logic even with green tests. Left intact per Rule 3A (genuine blocker / new decision).

**Proposed fix / what's needed (owner: `scholar-resolver` / dungeon-scholar domain):**
- [ ] Rebase `auto/scholar-resolver` onto current `origin/master` (now contains `scholar-phase-executer`'s devotion `devotionStatus()` API, PWA reload machinery, and the PHASE-02 `autoRefreshToken: false` fix).
- [ ] Decide the intended `autoRefreshToken` behavior — keep master's `false` (PHASE-02) unless intentionally superseding it, and update the rationale comment if changed.
- [ ] Reconcile `devotion.js` to a single API (`devotionStatus()` vs `evaluateClaim/dayDiff`) and align `devotion.test.js` + `CalendarScreen.jsx` to it.
- [ ] Preserve master's `main.jsx` PWA reload wiring and `QuestBoard.jsx` icon a11y attrs.
- [ ] Push; the next integrator run will merge it once it applies cleanly with green CI.

**Related files:** `dungeon-scholar/src/services/supabase.js`, `dungeon-scholar/src/hooks/useAuth.js`, `dungeon-scholar/src/main.jsx`, `dungeon-scholar/src/features/progression/CalendarScreen.jsx`, `dungeon-scholar/src/features/quests/QuestBoard.jsx`, `dungeon-scholar/src/services/devotion.test.js`, `dungeon-scholar/src/services/devotion.js`

---

## Medium

### [2026-06-24] Rules-of-hooks violation in BattleModal (hooks after early returns)

- **Category:** bug
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (biome lint correctness + manual confirmation)

**Description:**
`BattleModal` in `src/components/dungeon/DungeonExplore.jsx` calls hooks *after* two
conditional early returns:

```js
function BattleModal({ ... }) {
  if (!battle) return null;   // early return
  if (!q) return null;        // early return
  const [revealResult, setRevealResult] = useState(null);          // hook AFTER returns
  ...
  useEffect(() => { setRevealResult(null); }, [q?.id, battle.type]); // hook AFTER returns
}
```

This violates the Rules of Hooks (hooks must run unconditionally, in the same order,
every render). When `battle`/`q` toggle between null and non-null across renders the
hook count changes, which React surfaces as "Rendered fewer hooks than expected" and
can crash the component. It works today only because the modal is currently never
mounted while `battle`/`q` are null, but the guard makes that fragility implicit.

**Reproduction (if bug):**
1. Render `BattleModal` once with a non-null `battle` and `q` (hooks run).
2. Re-render with `battle` (or `q`) null so an early return fires before the hooks.
3. React throws a hook-order error / the component crashes.

**Expected behavior:** Hooks declared unconditionally at the top of the component;
the null checks moved below the hook declarations (or the modal not rendered at all by
the parent when `battle`/`q` are null).

**Hypothesis / root cause:** `useState`/`useEffect` placed below `if (!battle) return null; if (!q) return null;` in `BattleModal`. Confirmed by biome `lint/correctness/useHookAtTopLevel` firing at DungeonExplore.jsx:263 and :290. (A third hit at :2262 is a FALSE POSITIVE — `usePotion(i)` is a regular handler named like a hook, not an actual hook.)

**Proposed fix / improvement:**
- [ ] Move the `if (!battle) return null; if (!q) return null;` guards below the `useState`/`useEffect` calls, OR have the parent skip rendering `BattleModal` entirely when `battle`/`q` are null.
- [ ] Keep the effect deps stable.

**Related files:** `dungeon-scholar/src/components/dungeon/DungeonExplore.jsx`

### [2026-06-24] dungeon-scholar lint never runs in CI; 222 biome errors accumulated

- **Category:** config, debt
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (ran `npm run lint`)

**Description:**
`dungeon-scholar/package.json` defines a `lint` script (`biome check src`) but no CI
workflow ever invokes it. `.github/workflows/dungeon-scholar-ci.yml` runs only
`npm ci` -> `npm run test` -> `npm run build`; `deploy.yml` runs test+build; the
security-audit workflow runs only `npm audit`. With no gate, lint errors have piled up:
`npm run lint` currently exits 1 with **222 errors, 236 warnings, 14 infos** across 181
files. Breakdown of the errors includes correctness-class issues, not just style:
useExhaustiveDependencies x91, organizeImports x101 (assist), useOptionalChain x59,
noUnusedImports x44, noUnusedVariables x18, useHookAtTopLevel x3 (see the BattleModal
entry above), useIterableCallbackReturn x7 (mostly false-positive `set.add` arrows),
noAssignInExpressions x3, noGlobalIsFinite x1, etc.

**Expected behavior:** Either lint is enforced in CI (gate stays green by keeping the
tree clean), or the script is acknowledged as advisory. Right now it is silently broken.

**Hypothesis / root cause:** `dungeon-scholar-ci.yml` job has no `npm run lint` step; the
script was added to package.json but never wired into the pipeline, so the error count
drifted upward unnoticed (CI stays green on test+build alone).

**Proposed fix / improvement:**
- [ ] Triage: auto-fix the safe classes first (`npm run lint:fix` handles organizeImports / unused imports / useTemplate / useOptionalChain), then hand-fix the correctness items (useExhaustiveDependencies, useHookAtTopLevel).
- [ ] Add a `npm run lint` step to `dungeon-scholar-ci.yml` once the tree is clean so it cannot regress.
- [ ] Decide policy on `useExhaustiveDependencies` (fix vs. rule-config) before gating, since it is the bulk of the count.

**Related files:** `dungeon-scholar/package.json`, `.github/workflows/dungeon-scholar-ci.yml`


## Low

### [2026-06-24] Vite 8 build warns: `inlineDynamicImports` deprecated (PWA service-worker build)

- **Category:** config, debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (ran `npx vite build`)

**Description:**
Every `vite build` of dungeon-scholar prints, during the PWA service-worker
sub-build, a Rolldown/Vite 8 deprecation warning:

```
PWA v1.3.0
Building src/sw.js service worker ("es" format)...
 WARN  inlineDynamicImports option is deprecated, please use codeSplitting: false instead.
```

The client build itself is clean (1926 modules, vendor-react / vendor-icons
chunks emitted, built in ~1.8s); the warning is emitted only by the second,
`injectManifest` SW build that bundles `src/sw.js` into a single file. It is
non-fatal today (build exits 0, tests 61 files / 647 pass, `npm audit` clean)
but it is noise on every CI/deploy build log and will become a hard error once
Rolldown removes the deprecated alias.

**Hypothesis / root cause (diagnosed):** not app config — `grep -rn inlineDynamicImports src vite.config.js` finds nothing. The option is set inside the pinned dependency: `node_modules/vite-plugin-pwa/dist/vite-build-BGK4YAIU.js:109` does `inlineDynamicImports: true` to force the SW into one file. Under Vite 8 (Rolldown) that rollup output option is deprecated in favour of `output.codeSplitting: false`. `vite-plugin-pwa@1.3.0` (current pin) predates the rename, so the warning fires on the SW build of every Vite-8 project using it.

**Proposed fix / improvement:**
- [ ] Bump `vite-plugin-pwa` once a release that uses `codeSplitting: false` (Vite-8/Rolldown-aware) is published; re-run `vite build` and confirm the warning is gone.
- [ ] Until then, accept it as a known upstream deprecation (nothing to change in app code — do NOT add `inlineDynamicImports`/`codeSplitting` to `vite.config.js`, as the SW is a separate plugin-owned build, not the app rollupOptions).
- [ ] Optional: if the warning ever masks a real one in CI, filter the single known line rather than silencing all build warnings.

**Related files:** `dungeon-scholar/vite.config.js` (VitePWA injectManifest block), `dungeon-scholar/package.json` (`vite-plugin-pwa` pin), `dungeon-scholar/src/sw.js`

### [2026-06-24] Duplicate `engines` key in dungeon-scholar package.json

- **Category:** config
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (manifest inspection)

**Description:**
`dungeon-scholar/package.json` declares the `engines` field twice:

```json
  "engines": {
    "node": ">=22"
  },
  "type": "module",
  "engines": { "node": ">=22" },
```

Both blocks are identical so behavior is unaffected (JSON last-key-wins), but it is
config drift / a copy-paste artifact. It also sits outside `src/`, so `biome check src`
will never catch it. Some strict JSON tooling warns on duplicate keys.

**Hypothesis / root cause:** A second `engines` block was appended (next to `type`) without removing the original.

**Proposed fix / improvement:**
- [ ] Delete one of the two `engines` blocks (keep a single `"engines": { "node": ">=22" }`).

**Related files:** `dungeon-scholar/package.json`

### [2026-06-24] usePlayerState cloud-sync tests wait on real-timer backoff (~52s for one file)

- **Category:** test, performance
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (ran `npm test`; 59 files / 627 tests all PASS)

**Description:**
The full suite passes but takes ~54s, and `src/hooks/usePlayerState.test.jsx` alone
accounts for ~52s. Two cases dominate: "retries on push failure with backoff and ends
in offline" (~22.5s) and "(a) recovers from offline ... after backoff exhausts" (~24s).
These describe-blocks do NOT call `vi.useFakeTimers()` (unlike the `local-only behavior`
block which does), so they wait through the *real* retry schedule
`RETRY_DELAYS_MS = [1000, 4000, 16000]` (~21s wall-clock) with `waitFor` timeouts of
30000/35000ms. This wall-clock wait is paid on every CI run of the dungeon-scholar test
gate (deploy.yml + dungeon-scholar-ci.yml).

**Hypothesis / root cause:** Real timers + a real backoff schedule in `usePlayerState` retry logic; the retry/offline tests assert end-state after the full backoff window instead of advancing fake timers.

**Proposed fix / improvement:**
- [ ] Use `vi.useFakeTimers()` in the retry/offline describe-blocks and `vi.advanceTimersByTimeAsync(...)` to step through 1s/4s/16s instantly.
- [ ] Or make `RETRY_DELAYS_MS` injectable so tests pass tiny delays.

**Related files:** `dungeon-scholar/src/hooks/usePlayerState.test.jsx`, `dungeon-scholar/src/hooks/usePlayerState.js`


---

> dungeon-scholar future ideas / design gotchas / observations: [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). dnd-app issues: [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md). BMO issues: [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md).
