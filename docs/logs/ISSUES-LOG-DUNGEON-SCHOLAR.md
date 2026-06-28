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

*(none currently logged)*

## Medium

### [2026-06-28] Branch `auto/scholar-phase-executer` is stale/superseded — won't merge (integrator)
**Owner:** dungeon-scholar domain / `scholar-phase-executer` (+ `scholar-resolver` to rebase or retire).
**Status:** left intact by the integrator on 2026-06-28; NOT merged.
**Branch:** `origin/auto/scholar-phase-executer` @ `14f8c541` ("chore(ds): repo-wide biome format + CI lint gate; align executer agent-id"), 151 files / +8049 / -3723. Its own CI was green, but it does **not** merge into current `master`.
**Root cause:** the branch's entire purpose — a repo-wide biome format + a CI lint gate — was **independently landed on `master`** as `9e454930` ("chore(dungeon-scholar): clean biome lint tree-wide + gate lint in CI"). Master then advanced 52 commits past the branch's merge-base (`92e08ae0`, 2026-06-24), including feature commits that re-touch the same reformatted files: `0070472f` (image-occlusion flashcard type), `59b0bd73` (library multi-select bulk actions), `eb846863` (approved-log resolutions). The result is 6+ content conflicts that are **format-vs-feature** collisions in: `src/components/RichContent.jsx`, `src/components/dungeon/DungeonExplore.jsx` (+`.test.js`), `src/features/library/LibraryScreen.jsx`, `src/features/player/usePlayerActions.js`, `src/features/study/FlashcardsMode.jsx`.
**Why not fix-forward:** hand-resolving a pure-reformat branch against newer feature edits risks silently reverting the feature work in `0070472f`/`59b0bd73`. The correct resolution is not a manual merge.
**Needed (route to scholar domain):** confirm whether the branch carries anything NOT already on `master` after `9e454930`. If nothing material → **retire the branch** (`git push origin :auto/scholar-phase-executer`). If something remains → reset the worktree onto current `origin/master`, re-run `biome format`/lint there (likely a near no-op now), and re-push a clean branch for the next integrator run.


*(none currently logged)*

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

*(none currently logged)*

---

> dungeon-scholar future ideas / design gotchas / observations: [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). dnd-app issues: [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md). BMO issues: [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md).
