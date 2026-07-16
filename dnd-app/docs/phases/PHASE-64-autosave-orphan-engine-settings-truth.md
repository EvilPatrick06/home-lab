# PHASE-64 — Orphaned autosave snapshot/version engine: dead code (incl. the v2.7.2 eviction fix) + a Settings Auto-Save section that controls nothing

> Authored from the 2026-07-02 WEB-build QA report (Dungeon Table Online, v2.7.2). Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md. PLANNING ONLY — this phase authors the plan; no app code changes here.

## Goal

Resolve the one **new Medium** finding of the 2026-07-02 v2.7.2 WEB pass: the snapshot/version autosave engine in `src/renderer/src/services/io/auto-save.ts` is **orphaned** — its entire save/restore surface (`startAutoSave`, `stopAutoSave`, `saveNow`, `getSaveVersions`, `restoreVersion`, `deleteVersion`, `isRunning`) has **no non-test callers anywhere in the repo** — with three user-facing consequences:

1. **v2.7.2's only renderer-side change is dead on arrival.** Commit `edb226ef` ("autosave quota eviction respects the IndexedDB body store") rewrote `persistSnapshotWithEviction()` in this module and added a dedicated test suite (`auto-save-eviction.test.ts`). The fix is correct — and unreachable: the eviction path's literals (`'QuotaExceededError'`, `'NS_ERROR_DOM_QUOTA_REACHED'`) appear in **zero** of the 376 deployed v2.7.2 chunks (Rolldown correctly tree-shakes the whole engine). The new tests pass against code users never execute. The same reachability analysis applies to desktop: the module's only runtime importer touches nothing beyond the config accessors, so the engine never runs on either build.
2. **Settings → Auto-Save is a dead control masquerading as a safety-relevant setting.** `AutoSaveSection` (rendered on both builds when not signed in, `SettingsPage.tsx:267`) presents an enable toggle + interval control backed by this module's `getConfig()`/`setConfig()` — a config **nothing reads**. The autosave that actually runs is a *different module*: `game-auto-save.ts`, started unconditionally for the DM (`use-game-effects.ts:241`) with fixed debounce constants and zero references to `AutoSaveConfig`. Toggling Auto-Save off visibly "works" and changes no runtime behavior.
3. **The orphan keeps accreting maintenance.** Three fix rounds have landed on it (`c396d299` fail-loud + key namespacing, `07fcfb6c` IndexedDB snapshot store — which made `autosave-snapshot-store.ts` part of the orphan graph, its only non-test importer is `auto-save.ts` — and now `edb226ef`), plus three test files. `npm run dead-code` (knip) structurally cannot flag it (see root cause).

Decide (a) wire the engine to a real caller, or (b) remove the orphan and make the Settings section control the autosave that actually runs. **Default: (b)** — see Fix direction.

## Dependencies & cross-phase notes

- **No prerequisites.** Renderer + web-shared source only; freely reorderable against PHASE-63 (bmo/pi serving headers, the other open item from this report lineage).
- **Not a web-portability gap** (contrast PHASE-45/46/47/60): the engine is equally dead on desktop. The web angle is only that v2.7.2's release delta *appeared* to ship a renderer fix and verifiably did not.
- **Desktop already has a real version-history system** — the main-process `.versions/` snapshots (`src/main/storage/campaign-storage.ts`, surfaced by the v2.7.0 Campaign Version History panel, PHASE-60). Wiring the orphan in (option (a)) would stand up a *second*, localStorage/IndexedDB-based version engine alongside it, with a restore UI that doesn't exist (`getSaveVersions`/`restoreVersion` have no UI anywhere). That's why (b) is the default.
- **The eviction fix's semantics are retired with the orphan under (b).** Record this explicitly: `edb226ef`'s quota-eviction hardening protects the orphan's localStorage-fallback path only. The live engine persists via `window.api.saveGameState` (desktop → file on disk; web shim `web-api.ts:296` → IndexedDB `game-state` store) and never writes snapshot bodies to localStorage, so there is no equivalent quota-eviction loop to port. If a future web autosave-versioning feature wants one, `edb226ef` + `auto-save-eviction.test.ts` are the reference (git history preserves them).
- **i18n:** the section's keys exist in both locales (`pages.settingsPage.autoSave*`, `en.json:6920-6924` / `es.json` same keys). If 64A keeps the section (re-pointed), keys stay; if the interval control is dropped, remove `intervalMinutes` (+ desc adjustments) from BOTH locales in the same commit (en/es parity is CI-checked at 6,541/6,541).
- **Autonomy policy note:** the dead-settings facet is `bug` (auto-approved class); the orphan-removal facet is cleanup/debt riding the same root cause — one phase, one decision.

## Verified findings

All verification was against the live tree (worktree `auto/dnd-phase-maker`, master `d6699d52`) and the deployed v2.7.2 artifacts on the Pi, 2026-07-15.

### AUTOSAVE-1 (medium) — `services/io/auto-save.ts` snapshot/version engine has no non-test callers; Settings → Auto-Save configures it anyway; the v2.7.2 eviction fix shipped into the void

**Status: confirmed in source and in the deployed bundle — every claim in the QA report re-verified this run.**

**The orphan and its only importers.** Repo-wide (excluding tests), `services/io/auto-save` is imported by exactly two files:

- `src/renderer/src/components/settings/AutoSaveSection.tsx:3` — `import * as AutoSave from '../../services/io/auto-save'`, using **only** `getConfig()`/`setConfig()` (`:8,9,19,39,59`).
- `src/renderer/src/pages/SettingsPage.tsx:39` — `import type { AutoSaveConfig, SaveVersion }` (type-only; retained via the `type _AutoSaveConfig = AutoSaveConfig` idiom at `:41-42`).

The module's save/restore surface (`auto-save.ts:286-383`: `startAutoSave`, `stopAutoSave`, `saveNow`, `getSaveVersions`, `restoreVersion`, `deleteVersion`, `isRunning`) has **zero** non-test call sites. `autosave-snapshot-store.ts` (the IndexedDB body store added by `07fcfb6c`) is imported **only** by `auto-save.ts` — the whole graph is orphaned together.

**The autosave that actually runs is a different module.** `use-game-effects.ts:14` imports `startAutoSave`/`stopAutoSave` from `services/io/game-auto-save`; the DM effect (`:237-243`) starts it **unconditionally** whenever `isDM`. `game-auto-save.ts` (`:89` `startAutoSave(campaignId)`) is store-subscription + debounce (`GAME_AUTO_SAVE_DEBOUNCE_MS = 5000`, `app-constants.ts:99`) — it contains **no** reference to `AutoSaveConfig`/`getConfig` (grep: zero matches). `builder-auto-save.ts` is likewise configless. So the Settings enable toggle and interval control change nothing.

**Deployed-artifact confirmation (re-run this pass).** On the Pi: `grep -l "QuotaExceededError" ~/web-apps/DungeonTableOnline/assets/*.js` → no matches (376 files; same for `NS_ERROR_DOM_QUOTA_REACHED`). The only literals from the module that survive tree-shaking are the config accessors' — the `autosave:config` key (`settings-keys.ts:14`) appears in `app-constants-CCwwQIPA.js` and the SettingsPage chunk.

**History supports "superseded generation".** Both `auto-save.ts` and `game-auto-save.ts` predate recorded history (both enter at the monorepo reorg `f96bad8f`) — the orphaning is old, not a recent regression. Since then the orphan has accreted `c396d299`, `07fcfb6c`, and `edb226ef` + three test files (`auto-save.test.ts`, `auto-save-idb.test.ts`, `auto-save-eviction.test.ts`).

**Root cause of the detection gap (why knip never flagged it):** the file is *reachable* (renderer entry → `SettingsPage` → `AutoSaveSection`), so knip's unused-*file* check passes; and `AutoSaveSection`'s **namespace import** (`import * as AutoSave`) marks the module's *entire export surface* as used, so the unused-*export* check passes too. Member-level deadness behind a namespace import is invisible to `npm run dead-code` as configured (`knip.json`, `ignoreExportsUsedInFile`).

**Reproduction:**

```bash
cd dnd-app
grep -rln "services/io/auto-save" src --include="*.ts*" | grep -v test
#   → only AutoSaveSection.tsx + SettingsPage.tsx (type-only)
grep -rn "startAutoSave" src --include="*.ts*" | grep -v test
#   → only call site imports from game-auto-save (use-game-effects.ts:14,241)
grep -n "getConfig\|AutoSaveConfig" src/renderer/src/services/io/game-auto-save.ts   # → nothing
grep -rln "autosave-snapshot-store" src --include="*.ts*" | grep -v test             # → auto-save.ts only
# On the Pi (deployed v2.7.2):
grep -l "QuotaExceededError" ~/web-apps/DungeonTableOnline/assets/*.js               # → no matches
```

**Expected:** a shipped fix is reachable by users, and a Settings toggle controls something. Either the snapshot/version engine gets a real caller and the Settings section governs the autosave that runs, or the orphan is removed and the section is re-pointed (or removed).

**Fix direction (pick ONE; (B) is the recommended default):**

- **(A) Wire the orphan in.** Give the snapshot/version engine a real caller (start it alongside `game-auto-save`, honor `AutoSaveConfig`, build a restore UI for `getSaveVersions`/`restoreVersion`). Rejected as default: duplicates the desktop `.versions/` system (PHASE-60 lineage), requires a new UI, and enshrines two parallel autosave engines.
- **(B) Remove the orphan; make Settings honest (recommended).** Delete the engine + its IDB store + its tests; re-point the Settings section at `game-auto-save.ts` with an honest control set (an enable gate is meaningful; the 1-60 min interval is not — the live engine is event-debounced, not interval-driven). Sub-phased below.
- **(C) Minimal truth fix (fallback if (B)'s settings re-point is deferred).** Remove `AutoSaveSection` + the orphan entirely, no replacement control (autosave stays always-on for the DM, as it effectively is today). Smallest diff; loses a (currently fake) user affordance — owner may prefer (B).

**Affected components:** `src/renderer/src/services/io/auto-save.ts`, `autosave-snapshot-store.ts`, `auto-save.test.ts`, `auto-save-idb.test.ts`, `auto-save-eviction.test.ts`, `src/renderer/src/components/settings/AutoSaveSection.tsx`, `src/renderer/src/pages/SettingsPage.tsx:39-42,267`, `src/renderer/src/services/io/game-auto-save.ts`, `src/renderer/src/hooks/use-game-effects.ts:237-243`, `src/renderer/src/constants/settings-keys.ts:14,28-29`, i18n `pages.settingsPage.*` (both locales).

## Sub-phases

> Per-sub-phase cheap check: `cd dnd-app && npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json`, plus the affected vitest files (`game-auto-save.test.ts`, any new settings test). CI runs the authoritative full gate on push. Bundle-level effect is implementer-verified on the next deployed web build: the Settings toggle observably gates autosave writes, and `grep -l "autosave:"` across deployed chunks reflects the new shape.

### 64A — Make Settings → Auto-Save control the live engine (the `bug` facet)

**Objective:** the Auto-Save enable toggle gates the autosave that actually runs; no control is presented that does nothing.

**Files:** `src/renderer/src/services/io/game-auto-save.ts`, `src/renderer/src/hooks/use-game-effects.ts`, `src/renderer/src/components/settings/AutoSaveSection.tsx`, `src/renderer/src/constants/settings-keys.ts`, i18n `en.json`/`es.json` (`pages.settingsPage.*`).

**Steps:**

1. Move the config surface to the live engine: add a minimal `{ enabled: boolean }` config to `game-auto-save.ts` (persisted under the existing `SETTINGS_KEYS.AUTOSAVE_CONFIG` key — migrate-on-read from the old shape, which is a superset), with `getConfig()`/`setConfig()`.
2. Honor it: early-return in `scheduleSave()` (or skip `startAutoSave` and re-check on config change) when `enabled === false`. Keep `flushAutoSave` unconditional (exit-flush should not be disabled by the toggle — data-loss guard).
3. Re-point `AutoSaveSection` at the new accessors. **Drop the interval control** (the live engine is change-debounced; a 1-60 min interval is not a truthful knob) — remove `intervalMinutes` from both locales; update `enableAutoSaveDesc` if wording no longer matches. If the owner instead wants a cadence knob, map it to a documented max-flush period rather than pretending to be the sole trigger.
4. Add/extend `game-auto-save.test.ts`: disabled config → store changes produce no `saveGameState` calls; re-enable → saves resume.

**Acceptance:** both tsc projects clean; vitest green; with Auto-Save off, driving a game-store change produces no `window.api.saveGameState` call (test-asserted); toggle state survives reload (localStorage-persisted). en/es parity unchanged or updated in lockstep.

### 64B — Delete the orphaned engine (+ record the retirement of `edb226ef`)

**Objective:** the dead snapshot/version graph is gone; nothing imports it; the v2.7.2 eviction fix's fate is recorded.

**Files:** delete `src/renderer/src/services/io/auto-save.ts`, `autosave-snapshot-store.ts`, `auto-save.test.ts`, `auto-save-idb.test.ts`, `auto-save-eviction.test.ts`; edit `src/renderer/src/pages/SettingsPage.tsx` (drop the type-only import + retention aliases `:39-42`), `src/renderer/src/constants/settings-keys.ts` (drop `dynamicKeys.autosaveVersions`/`autosaveVersion` `:28-29` if 64A's migration no longer reads them).

**Steps:**

1. After 64A lands (ordering matters — 64A takes over the `AUTOSAVE_CONFIG` key), delete the five files; remove the `SettingsPage` type-only import; sweep `dynamicKeys.autosaveVersion*` if now referenced nowhere (grep first — the old per-campaign `autosave:<id>:versions`/`:<versionId>` localStorage entries become unreferenced data; optional: one-time cleanup-on-boot removal, or leave to rot harmlessly).
2. In the commit message and this doc's Completed note, state explicitly that `edb226ef`'s eviction semantics are retired with the orphan (reference implementation preserved in git history) so a future audit doesn't hunt for a "lost" fix.
3. Run `npm run dead-code` (knip) and the full vitest suite locally-cheap (affected files) — CI authoritative on push.

**Acceptance:** repo-wide grep for `services/io/auto-save'` (exact module) and `autosave-snapshot-store` → zero matches; both tsc projects + knip clean; no vitest references to deleted files remain.

### 64C — Close the detection gap that let the orphan survive

**Objective:** member-level dead code behind namespace imports is either detectable or documented as a known blind spot.

**Files:** `src/renderer/src/components/settings/AutoSaveSection.tsx` (pattern fix, done implicitly by 64A), `knip.json` (comment), optionally `docs/` dead-code notes / lint config.

**Steps:**

1. Prefer **named imports** over `import * as X` for internal service modules (the namespace import is what blinded knip here). Apply to the re-pointed `AutoSaveSection`; sweep for other `import * as` uses of internal `services/**` modules and convert where trivial (report count if non-trivial — don't scope-creep).
2. Add a short comment in `knip.json` (next to `ignoreExportsUsedInFile`) documenting the namespace-import blind spot, mirroring the existing `scripts/**` audit note.

**Acceptance:** `AutoSaveSection` (or its successor) uses named imports; knip note present; knip run clean.
