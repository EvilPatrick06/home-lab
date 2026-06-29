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

*(none currently logged)*

## Low

### [2026-06-28] PromptModal copy tests fire async copy outside `act()` (React warnings)

- **Category:** test
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (full vitest run, 65 files / 694 tests all green)

**Description:**
The two tests under `PromptModal — copy behavior` ("clicking copy with a filled exam-target…" and "clicking copy with empty exam-target…") emit `An update to PromptModal inside a test was not wrapped in act(...)` on stderr. The handler `onCopy` (PromptModal.jsx:271) is `async` — it `await`s `copyToClipboard()` then runs `setCopied(ok)` and `setTimeout(() => setCopied(false), 2000)`. The tests call `fireEvent.click(... copy ...)` synchronously with no `await` and no `act()` wrapper, so the post-await `setCopied` state update lands after the test body returns, outside React's act scope.

**Reproduction (if bug):**
1. `cd dungeon-scholar && node_modules/.bin/vitest run src/components/ui/PromptModal.test.jsx`
2. Observe two `not wrapped in act(...)` warnings on stderr.
3. Tests still PASS (they assert on the clipboard mock, not on the `copied` state).

**Expected behavior (if bug):** No act() warnings; the async state update is awaited/flushed inside the test.

**Hypothesis / root cause:** `onCopy` is async + schedules a 2s `setTimeout`; the tests do not `await`/`act()` the click, so `setCopied(ok)` fires outside act. The dangling 2s timer is also never cleared (no fake timers / cleanup), a minor leak. Two real act violations are masked by the noise.

**Proposed fix / improvement:**
- [ ] Make the copy click `await act(async () => { fireEvent.click(...) })` (or use `userEvent` + `findBy*`).
- [ ] Optionally use fake timers and clear the 2s `setCopied(false)` timeout.

**Related files:** `src/components/ui/PromptModal.test.jsx`, `src/components/ui/PromptModal.jsx`

---

### [2026-06-28] 244 non-gating biome lint warnings (72 dead-code, 91 exhaustive-deps) — CI lint never fails on them

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (`biome check src`)

**Description:**
`biome check src` reports 244 warnings + 9 infos but exits 0, so the CI lint gate (`npm run lint`) passes regardless. `biome.json` deliberately downgrades several rules to `"warn"` (`useExhaustiveDependencies`, `noUnusedImports`, `noUnusedFunctionParameters`, `noAssignInExpressions`). Breakdown: 91 `useExhaustiveDependencies`, 65 `useOptionalChain`, 45 `noUnusedImports`, 20 `noUnusedVariables`, 11 `noImportantStyles`, 9 `useTemplate`, 7 `noUnusedFunctionParameters`, 3 `noAssignInExpressions`, plus singletons. The 72 unused-import/var/param warnings are dead code that accumulates silently; the 91 `useExhaustiveDependencies` warnings are latent stale-closure / missed-rerender risks, concentrated in `App.jsx` (34), `components/dungeon/DungeonExplore.jsx` (25), `hooks/usePlayerState.js` (12), `features/player/usePlayerActions.js` (6).

**Hypothesis / root cause:** Rules intentionally set to `warn` in `biome.json` so the lint gate stays green during active development; the cost is that genuine dead code and hook-dependency bugs never trip CI and pile up.

**Proposed fix / improvement:**
- [ ] Sweep and remove the 72 unused imports/vars/params (`biome check --write` handles most safely).
- [ ] Triage the 91 `useExhaustiveDependencies` warnings — fix real missing deps, annotate intentional ones with `// biome-ignore` + reason.
- [ ] Consider promoting `noUnusedImports` to `error` once the backlog is cleared so dead code can not silently return.

**Related files:** `dungeon-scholar/biome.json`, `src/App.jsx`, `src/components/dungeon/DungeonExplore.jsx`, `src/hooks/usePlayerState.js`, `src/features/player/usePlayerActions.js`

---

### [2026-06-28] `vite build` emits `inlineDynamicImports` deprecation from vite-plugin-pwa SW build

- **Category:** config
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (`vite build`)

**Description:**
A production `vite build` prints `WARN inlineDynamicImports option is deprecated, please use codeSplitting: false instead.` during the service-worker (injectManifest) build step. It is not from `vite.config.js` (the app does not set `inlineDynamicImports`) — it originates inside the pinned dependency: `node_modules/vite-plugin-pwa/dist/vite-build-BGK4YAIU.js:109` hardcodes `inlineDynamicImports: true` when it builds `src/sw.js`. The build still succeeds today, but the option is slated for removal in Rolldown/Vite, at which point the SW build would break.

**Hypothesis / root cause:** `vite-plugin-pwa@1.3.0` uses the deprecated Rollup/Rolldown `inlineDynamicImports` flag for the SW bundle; Vite 8 (Rolldown) now warns on it. App code can not fix it directly — it needs a plugin upgrade.

**Proposed fix / improvement:**
- [ ] Track `vite-plugin-pwa` releases for a version that switches to `codeSplitting: false`; bump when available.
- [ ] Until then, treat the warning as known build noise (do not let it mask new warnings in CI logs).

**Related files:** `dungeon-scholar/vite.config.js` (VitePWA `injectManifest`), `dungeon-scholar/package.json` (`vite-plugin-pwa` pin)


---

> dungeon-scholar future ideas / design gotchas / observations: [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). dnd-app issues: [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md). BMO issues: [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md).
