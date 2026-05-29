# dnd-app phases — review report

**Generated:** 2026-05-29
**Scope:** every plan file in `dnd-app/docs/phases/phase-*.md` (14–36)
**Method:** read each plan, locate referenced files, verify behaviour matches the plan, run targeted tests where possible. No source edits.

---

## Executive summary

**Repo state:** healthy at the 4-gate (lint / tsc-web / tsc-node / vitest pass). 23 phase plans (14–36) audited; the last 113 commits on master pulled and reviewed.

**Headline findings (full list at the bottom — "Cross-Phase Findings"):**
- 🚨 **Phase 17c LOG-2 ships a live combat bug.** `attack-helpers.ts:224` has the old (non-`g` flag) `doubleDiceInFormula`; `attack-resolver.ts` imports it; the spec at `attack-helpers.test.ts:92–96` pins the broken behaviour. Crit damage with multi-die formulas (Sneak Attack, Smite, magic weapon dice) under-rolls. `combat-resolver.ts:909` has the correct copy but it isn't exported.
- 🚨 **Phase 26f's `executeLoadEncounter` overrides pre-positioned monsters.** Presets with `startX/startY` get repositioned by `smartPlaceTokens`.
- 🚨 **Phase 27e: `/sound ambient` chat command drops `volume`.** DM panel sends it; chat path doesn't. Clients hear default loudness.
- 🚨 **Phase 28a.2/.3/.4: BMO sync receiver is unauthenticated + CORS `*` + no Zod.** Only material if the port is reachable externally, but it's the cleanest piece to land first.
- 🟠 **Phase 19d vs Phase 14 §A6 contradict each other** on `signAndEditExecutable`. Phase 14 research said the `false` setting strips icon + exe metadata; Phase 19 lands it as `false` anyway. Verify a packaged installer before the next release.
- 🟠 **Phase 22l log infrastructure missing on disk** (`ISSUES-LOG-DNDAPP.md`, `SUGGESTIONS-LOG-DNDAPP.md`, `SECURITY-LOG.md`). Several later phases say "logged to X" — the file doesn't exist.
- 🟠 **Phase 18j: `screenReaderModeSet` not persisted.** The first-run prompt re-appears every cold start for users with `prefers-reduced-motion`.
- 🟡 **Phase 28: 36 of 45 sub-phases unstarted** despite being stamped PARTIAL.
- 🟡 **Multiple "FOUNDATION LANDED" stamps** (30b/31a-b/34a/35a) land an interface but defer the consumers. Risk of bit-rot before the sweep.
- 🟡 **Phase 29e literals (`role === 'host'` / `isCoDM`)** are still the source of truth in core gameplay; the new permission system is parallel infrastructure.

**Branches besides `master`:**
- Local: `claude/test-rule11-foreign-2026-05-19` (1 stale fixture commit, no upstream).
- Remote: `origin/claude/packaging-update-efficiency-NFm7q` (Phase 14 research branch — already merged), `origin/dependabot/npm_and_yarn/dnd-app/npm_and_yarn-6ec3e26c6e`. Worktrees: none.

**Asking your decision on:**
1. Approval to fix the Phase 17 `doubleDiceInFormula` bug + flip the broken test.
2. Approval to add any of the seven targeted tests listed at the bottom.
3. Disposition of the three stray branches above (none deleted yet).
4. Whether to stub the missing log files (`ISSUES-LOG-DNDAPP.md` etc.) once `docs/LOG-INSTRUCTIONS.md` schema is confirmed.

---

## Pre-flight: repo state

| Item | Finding |
|---|---|
| Pulled latest | Yes. Fast-forwarded `master` 113 commits to `68743fd6`. |
| Local branches besides `master` | **`claude/test-rule11-foreign-2026-05-19`** (a single test fixture commit `4972a52`, exists only locally — no upstream). Flagged for cleanup. |
| Remote branches besides `master` | **`origin/claude/packaging-update-efficiency-NFm7q`** (3-commit feature branch carrying the new `phase-14-plan.md` deep-research integration — already merged: `0a69604` is on master). Safe to delete on remote. **`origin/dependabot/npm_and_yarn/dnd-app/npm_and_yarn-6ec3e26c6e`** (dependabot lockfile bump — needs human triage). |
| Worktrees | None besides primary checkout. |
| Uncommitted edits | 9 file-mode flips (+x on existing executables; harmless, fileMode=true config flagging them) plus a small `docs/DATA-FLOW.md` improvement (path-separator + `app.getPath('userData')` clarification). Neither blocks review. |

> **Action items for you (not done):**
> 1. `git branch -D claude/test-rule11-foreign-2026-05-19`
> 2. `git push origin --delete claude/packaging-update-efficiency-NFm7q`
> 3. Review the dependabot PR and either merge or close it.

---

## Phase 14 — Packaging & Update Efficiency

**Plan status line:** "Phase 14 — code-complete 2026-05-29. 14a/14b/14c/14d/14e/14f/14h DONE; 14g safe parts done. 14g deps→devDeps move and 14i deferred to a build-capable session."

### Verification

| Sub | Claim | Verified? | Notes |
|---|---|---|---|
| 14a | Ollama unbundled (package.json + ollama-manager) | YES | `extraResources` array exists but no Ollama entry; `getBundledOllamaPath` symbol absent. |
| 14b | Cross-platform install via Linux marker + macOS brew marker | YES | `LINUX_INSTALL_MARKER`, `MACOS_BREW_MARKER` defined `ollama-manager.ts:208–209`; install guards at 309, 313. |
| 14c | First-run prompt component + App.tsx mount | YES | `dnd-app/src/renderer/src/components/ui/OllamaFirstRunPrompt.tsx` present. |
| 14d | Install/Check/Update buttons in OllamaManagement | YES (file inspection deferred — see below) | `OllamaManagement.tsx` exists; plan describes wiring; suggest spot-check during release. |
| 14e | Differential re-enabled + compression normal | YES | `package.json:57` `compression: normal`; no `disableDifferentialDownload` matches in `updater.ts`. |
| 14f | `autoInstallOnAppQuit = false` everywhere | YES | All four sites in `updater.ts` (195, 254, 305, 330) set false; comment 246 records the flip. |
| 14g | Vite flags + drop dead vendor-anthropic chunk | YES | `electron.vite.config.ts:55–76` carries the trio + the vendor-anthropic removal comment. |
| 14g §A2 | `dependencies` → `devDependencies` move | **NO — deferred (plan acknowledges)** | All thirteen libs (pixi.js, three, pdfjs-dist, tiptap suite, peerjs, jspdf, cannon-es, fuse.js, @msgpack/msgpack, @tanstack/react-virtual, dotenv) still in `dependencies`. Plan correctly flags this can only be validated in a build-capable session. |
| 14h | 4-job graph (checks-fast / test / build / publish) | YES | `.github/workflows/release.yml` lines 33/72/99/171; only header comment mentions Ollama. |
| 14h §B7 | `publish.timeout: 300000` | YES | `package.json:91` `"publish":` block present (full value verification skipped). |
| 14i | Cut test release + benchmark differential delta + Linux update-channel decision + docs | **NO — release-gated** | Plan acknowledges this is deferred to a release-capable session. |

### Issues / things that feel wrong

1. **Stranded research evidence.** The plan keeps a 600-line research block (§A/§B/§C with web links). Useful when authoring, less useful once landed — consider archiving research to a `phase-14-research.md` companion before deletion, OR (per the INSTRUCTIONS rule 8 archival pattern) ensure the file is deleted at full completion (it currently is not deleted because 14g/14i remain open). **Action:** none right now; revisit when 14g + 14i land.
2. **14g §A2 (the biggest size lever — "potentially well under 230 MB" claim) is still open.** All 13 listed libs are unchanged in `dependencies`. The plan says the next session must verify the *packaged* app feature-by-feature. **Risk:** the headline "1.65 GiB → ~230 MB" win has shipped, but the secondary win has not — and is the riskiest step.
3. **14i (differential delta benchmark) directly drives the §C1 compression decision.** Plan picked `normal` based on §C1 reasoning, not on measurement. If a real benchmark shows `store` gives much smaller deltas, `compression: normal` may be wrong. **Action:** required as part of the next tagged release.
4. **No regression test added for the "silent on quit" bug (14f).** The bug was that `autoInstallOnAppQuit = true` from line ~322 of the auto-flow caused every install to feel silent. There is no integration test that asserts the post-fix install path always routes through `performInstall`. With only a 4-gate (lint/tsc/vitest unit), nothing prevents a future refactor from re-introducing the flip. **Suggested test:** a vitest spec on `updater.ts` that checks `autoInstallOnAppQuit` stays `false` after every `autoUpdater.on(...)` callback fires. Will write this if you approve.
5. **Plan retention vs `rule 8`.** `INSTRUCTIONS.md` line ~? says "delete plan when fully complete." Phase 14 is partially complete and the file is correctly retained. Mentioning so you're aware of the rule context.

### Tests to run / write

Existing vitest covers `ollama-manager` (37 specs). Reasonable. Asking approval before adding the `updater.ts` regression test (#4).

---


## Phase 15 — Library as Single Source of Truth

**Plan status line:** "15a–15h — code-complete 2026-05-28/29. Library = single source of truth; boundary test green; v4 migration framework built dormant."

### Verification

| Sub | Claim | Verified? | Notes |
|---|---|---|---|
| 15a Step 1 | `BaseLibraryEntry`, `EntryRef<C>`, `DeepPartial<T>`, `MergedEntry<C>`, `isEntryRef` exported | ✓ | `renderer/src/types/library.ts:1–28`. |
| 15a Step 2–4 | Zod schemas + `SCHEMA_REGISTRY` + `validateEntry`/`safeValidateEntry` | ✓ | 63 schema files; `registry.ts` exports `SCHEMA_REGISTRY`. |
| 15a Step 5 | Snapshot test for `public/data/5e/**` schemas | ✓ | `registry.test.ts` 96 lines. |
| 15a Step 6 | UI state spun to `useLibraryUiStore` | ✓ | File present. Consumers repointed. |
| 15a Step 7 | Truth-store rewrite (`entries`, `sourceOf`, `cacheMeta`, …) | ✓ | `use-library-store.ts:18+`. |
| 15a Step 8 | `library-service.ts` routes via `loadCategory` | ✓ | Lines 482, 500. |
| 15a Step 9 | Cache sync on plugin/data-cache ops | ✓ | `data-provider.ts:112`, `use-plugin-store.ts:67/74/85/100`. |
| 15a Step 10 | `useLibraryEntry`/`useLibraryEntries`/`useHydratedRef` | ✓ | `services/library/use-library-entry.ts` (React-level integration tests deferred — see Tests below). |
| 15a Step 11 | `deepMergeObjects` + tests | ✓ | `services/library/merge.ts` + 12 specs. |
| 15a Step 19 | Boundary test green | ✓ | `library-boundary.test.ts`; allowlist `services/library/**`, `use-library-store.ts`, `library-service.ts`. |
| 15a Step 20 | `README.md` contract doc | ✓ | `services/library/README.md`. |
| 15b | Builder sweep clean | ✓ | 0 raw `public/data` imports in `builder/5e/`. |
| 15c.1–.5 | `Character5e` v4 rewrite + v3 removed at .5 | ✓ | `types/character-5e.ts:110+`; `Character5eV3` retained for migration. |
| 15d | Level Up: features from library, multiclass via `classRefs` | ✓ | Loads via `load5eClassFeatures()`. |
| 15e | In-Game: tokens/inits/sidebar via library; encounter `instanceId` shape | ✓ | `token-stats.ts`; `EncounterMonster` has the fields. |
| 15f | Bastion clean + `bastion-data-rule.md` | ✓ | `bastion-data-rule.md` present. |
| 15g | Macro/chat/audio/weather/calendar/shop clean; adventure-loader migrated | ✓ | Boundary clean. |
| 15h | Migration framework built dormant; `use-data-store` → `use-config-store` | ✓ | `CURRENT_SCHEMA_VERSION = 3` (dormant). |

### Issues / things that feel wrong

1. **15h legacy interface cleanup admitted incomplete.** `character-common.ts` `SpellEntry`/`WeaponEntry`/`ArmorEntry`/`MagicItemEntry5e` and `personality-tables.ts` are still in the tree, with 30 references. Plan log records this as deliberate future cleanup. Not a blocker; flag for follow-up.
2. **`AGENTS.md` data-layer cross-link missing.** Plan Step 11 says it landed in 15f. The file `AGENTS.md` is not in repo root. (Maybe it moved or was never written — check with user.)
3. **CLAUDE.md "When adding new dnd-app files" data-layer sub-bullet** — this one IS present (verified above in the SessionStart-context snapshot). Plan claim holds.
4. **Migration UX not built (orphan-detection + `MigrationReportModal`).** Plan correctly notes this as release-time work. No `getMigrationReport` IPC channel or `MigrationReportModal.tsx`. Expected; just confirming.
5. **Homebrew/plugin merge still lives in config store.** Plan log calls out: truth-store `upsertHomebrew`/`loadPluginContent` aren't wired into the data-provider load path. Acceptable interim state; logged as tech debt.

### Tests

12 + 12 + 12 + 12 + 8 + 5 + 2 specs across the library subsystem (per audit). React-component-level hydration specs deferred awaiting `@testing-library/react`. Suggested: v3→v4 round-trip end-to-end smoke; live-library-update propagates to open token detail panel. Will not add without approval.

---

## Phase 16 — VTT Platform Comparison: Net-New Polish

**Plan status line:** Phase 16 collects net-new gaps vs D&D Beyond/Foundry/Roll20 — auto-pan, rich pins, dual-mode floating modals, macro {if}/$self, scene preload, grid HUD.

### Verification

| Sub | Claim | Verified? | Notes |
|---|---|---|---|
| 16a Step 1 | Auto-pan toggle gated by per-viewer pref | ✓ | `auto-pan-pref.ts:7–15`; `InitiativeOverlay.tsx:72–76`. |
| 16a Step 2 | "Center on Me" button | ✓ | `PlayerBottomBar.tsx:239–246`. |
| 16a Step 3 | Manual-pan 5s debounce | ✓ | `MapCanvas.tsx:177, 721, 821`. |
| 16b 1–4 | Pin layer in correct z + filtered render + click → linked content + rich create modal | ✓ | `map-pixi-setup.ts:18, 138–141, 195`; `pin-layer.ts:27–81`; `PinCreateModal.tsx`. |
| 16c | InitiativeModal + DMNotesModal dual-mode via `FloatingWindow`; CreatureModal deferred; blocking modals (Attack/Spell) carved out | ✓ | All three states match. |
| 16d 1–4 | `{if}`/`$self`/order repeat→cond→vars/syntax-error chat | ✓ | `macro-engine.ts:128–218` evaluator without `eval()`. |
| 16f 1, 3 | Adjacent-scene preload; reduced-motion respected | ✓ | `preload-adjacent.ts`; `MapCanvas.tsx:393–399`. |
| 16g 1–3 | Grid-HUD coordinate readout + toggle + listener gated | ✓ | `MapCanvas.tsx:79–82, 704, 1033–1052`. |

### Issues / things that feel wrong

No bugs found. Everything traces cleanly. Could add unit tests for pin visibility/floor filtering and floating-window persistence round-trip — both currently uncovered.

### Tests

`macro-engine.test.ts` 37 specs; `map-pixi-setup.test.ts` asserts pin-layer position; `map-token-slice.test.ts` 55 specs. Floating-window persistence and pin filter logic remain untested. Will not add unsolicited.

---

## Phase 17 — Full Codebase Error Audit Fixes

**Plan status line:** PHASE 17 COMPLETE — 2026-05-29. All critical/high live work across 17a–17f done; 17g remains a catalogue for opportunistic cleanup.

### Verification

| Sub | Claim | Verified? | Notes |
|---|---|---|---|
| 17a | Path-traversal sweep (campaign UUID, char restore filename, book paths, FS_WRITE size, AUDIO_PICK stat) | ✓ | All eight items in place. |
| 17b | Destroyed-window guards; `JSON.parse` try-catch in `GAME_LOAD_JSON`; hooks above early return in PlayerHUDOverlay | ✓ | `ai-handlers.ts:11–16`; `game-data-handlers.ts:29`; `PlayerHUDOverlay.tsx:86–240`. |
| 17c LOG-1 | Champion crit threshold via `getCritThreshold` | ✓ | `attack-resolver.ts:30, 262, 495`. |
| **17c LOG-2** | **`doubleDiceInFormula` global `g` flag so all dice groups double** | **✗ — BROKEN** | `combat-resolver.ts:909–916` has the correct (`g`-flag) implementation but does NOT export it. `attack-helpers.ts:224–230` still has the OLD non-`g` version and IS what `attack-resolver.ts:25` imports. `attack-helpers.test.ts:92–96` even pins the broken behavior (`1d8+1d6` → `2d8+1d6` instead of `2d8+2d6`). **Live bug for crit damage with multi-die formulas (Sneak Attack, Smite, magic weapons that add an extra die type).** |
| 17c LOG-3 | `isInMeleeRange` iterates occupied cells of both tokens | ✓ | `combat-rules.ts:291–310`. |
| 17c LOG-4 | AoE saves include target mod via `getCreatureSaveMod` | ✓ | `creature-conditions.ts:1, 118`. |
| 17c LOG-5 | Cone uses `getConeCells` | ✓ | `dice-helpers.ts:43–56`. |
| 17c LOG-8 | Exhaustion-6 death rule removed (2024 PHB) | ✓ | `conditions-slice.ts:21, 36`. |
| 17c LOG-10 | `removeFromInitiative` tracks active by id | ✓ | `initiative-slice.ts:285–303`. |
| 17c LOG-12 | `action-validator` reads `entityName` not bogus cast | ✓ | `action-validator.ts:106`. |
| 17c LOG-13 | `executeNextTurn` calls `nextTurn` first then reads updated index | ✓ | `creature-initiative.ts:87–88`. |
| 17d NET-5 | `JSON.stringify` in broadcast wrapped in try-catch | ✓ | `host-manager.ts:170–174, 304–308, 113–125`. |
| **17d NET-6/29/30** | **`safeHandler` wrapper across ai/storage/plugin** | **⚠ — PARTIAL** | `_safe.ts` exists; ai/storage/plugin migrated. ~32 raw `ipcMain.handle` sites remain across other handler files (`game-data-handlers.ts:12`, `audio-handlers.ts`, `index.ts`, others). Plan claims "across IPC handlers" — only a subset migrated. |
| 17e GUI-2 | `DmAlertTray` subscribe in `useEffect` | ✓ | `DmAlertTray.tsx:54–62`. |
| 17e GUI-3 | `DiceOverlay` tracks/cleans timeouts | ✓ | Lines 98–99, 144–149. |
| 17e GUI-4 | `disposeDie` helper | ⚠ — partial | `DiceRenderer.tsx:22–58, 167, 198` good; plan admits `dice-textures.ts`/`dice-physics.ts` audit still partial. |
| 17e GUI-7 | `RulingApprovalModal` Escape + backdrop + Dismiss | ⚠ — NOT VERIFIED | File not located by audit. Worth a manual check. |
| 17e GUI-8 | 11 modals carry Escape | ⚠ — partial | 9 of 11 confirmed via `useEscapeKey`. `NarrowModalShell` and `ConfirmDialog` not confirmed. |
| 17e GUI-9 | `Modal.tsx` splits header from scrolling body | ✓ (structural — not re-validated) | |
| 17e GUI-11 | `ShopView` clears haggle timeouts | ✓ | |
| 17f TYP-3/TYP-4 | Zod-narrowed config; cast removed | ✓ | Folded into LOG-12 / NET-19/20. |

### Issues / things that feel wrong

1. **🚨 `doubleDiceInFormula` is duplicated and the attack pipeline uses the broken copy.** This is the most material finding in the entire report — Sneak Attack crit damage and similar mixed-die formulas under-roll on crits. The pinned test (`attack-helpers.test.ts:92–96`) currently *protects* the bug. Recommend: delete the `attack-helpers.ts` copy, re-export the `combat-resolver.ts` version, and flip the test to assert `1d8+1d6 → 2d8+2d6`. **Asking approval to write the corrected test as a regression fixture.**
2. **IPC `safeHandler` migration is incomplete** — ~32 raw `ipcMain.handle` sites across `game-data-handlers.ts`, `audio-handlers.ts`, `index.ts`, and other handler files. Plan reads as if it's done.
3. **`NarrowModalShell` and `ConfirmDialog` Escape handling** — plan claims "11 modals", but the two listed have hand-rolled UI and didn't pick up `useEscapeKey`. Verify in-app.
4. **`RulingApprovalModal` location** — was not found by the audit pass. Either renamed or never landed; needs spot-check.
5. **GUI-4 Three.js disposal in `dice-textures.ts` / `dice-physics.ts`** — plan admits partial. `CanvasTexture.dispose()` and `BufferGeometry` cleanup unchecked.

### Tests

`attack-helpers.test.ts:92–96` actively encodes the bug. No regression tests for LOG-1/3/4/5/10/13 themselves (assertions are spread across combat-resolver suites but don't grep-match those LOG numbers — acceptable, fine if they cover behavior). **Requesting approval to add a corrected `doubleDiceInFormula` test once the helper duplication is resolved.**

---

## Phase 18 — GUI and UX Audit

**Plan status line:** PHASE 18 COMPLETE — 2026-05-29. Full 4-gate green (lint 0, tsc web+node 0, vitest 6477/6477).

### Verification

| Sub | Claim | Verified? | Notes |
|---|---|---|---|
| 18a | `lucide-react` installed; Unicode UI icons migrated | ✓ | AboutPage deliberately keeps thematic `⚔` symbols. |
| 18b | All `text-[10px]` → `text-xs`; drawing buttons 44px; modal footer `text-sm` | ✓ | 0 hits for `text-[10px]`. |
| 18c | Tooltip + `aria-label` on drawing buttons; aria-label count up | ✓ | |
| 18d | `EmptyState` / `Skeleton` in listed surfaces | ✓ (InitiativeTracker, EncounterBuilderModal verified; ShopView/ShopPanel not spot-checked) | |
| 18e | `constants/z-index.ts` + Z scale used | ✓ | No `z-[9999]`/`z-[60]` outside the constants file. |
| 18f | `/characters/create` → `/characters/5e/create` redirect | ✓ | `App.tsx:195`. |
| 18g | `aria-expanded` count grew 4 → 10 | ✓ | |
| 18h | Firefox scrollbar CSS added | ✓ | `globals.css:59–60`. |
| 18i | Cinzel local; `fontStyle` store; `.fantasy-font` toggle | ✓ | woff2 files in `public/fonts/`. |
| 18j | Screen-reader prompt with `prefers-reduced-motion` first-run gate | ✓ (but see issues) | |
| 18k | Auto-rejoin spinner + `role="status"` | ✓ | `JoinGamePage.tsx:49, 314–323`. |

### Issues / things that feel wrong

1. **18j `screenReaderModeSet` is not persisted.** `use-accessibility-store.ts:50–66` (the `persist()` partial) excludes the flag from localStorage. The prompt's "never re-show" depends on it. Symptom: refuse the prompt → close app → reopen → prompt re-appears whenever `prefers-reduced-motion` is set. **Asking approval to add a small unit test (`screenReaderModeSet` survives a persisted round-trip) and the partialize fix.**
2. **18g** — DMBottomBar tabs use `tab`/`aria-selected` (correct, not `aria-expanded`) — acceptable. Just flagging that the "10" count includes only `aria-expanded` sites.
3. Plan implies "all icon-only buttons get Tooltips" but it's actually scoped to the drawing toolbar — text matches in `LeftSidebar` and others remain ad-hoc. Plan note matches; nothing to fix, but the apparent scope ≠ delivered scope.

### Tests

No dedicated test files for `ScreenReaderPrompt`, `z-index.ts`, `fontStyle` integration, or auto-rejoin feedback. Suggested test: persist round-trip for `screenReaderModeSet` (pairs with issue #1).

---

## Phase 19 — Packaging, Build Configuration, and Distribution

**Plan status line:** PHASE 19 COMPLETE (19a–19f) — 2026-05-29. Full 4-gate green.

### Verification

| Sub | Claim | Verified? | Notes |
|---|---|---|---|
| 19a | Packaged SRD path fix via new `paths.ts` | ✓ | `srd-provider.ts:3`, `context-builder.ts:4, 33`, `paths.ts:26–27`. |
| 19b | Shared `paths.ts` (getRendererPublicDir/getDataDir/getResourcePath) | ✓ | All callers (`srd-provider`, `context-builder`, `chunk-builder`, `game-data-handlers`) routed through it. |
| 19c | release scripts run prerelease + verify:build gate | ✓ | `package.json:23–26`; `verify-build.mjs:22–30`. |
| 19d | `signAndEditExecutable: false`; sign wrapper; `.env.signing.template` | ✓ | `package.json:111–112`, `sign.mjs:19–22`, `.gitignore:16`. ⚠ Note: this contradicts Phase 14 §A6 finding — see below. |
| 19e | macOS dmg+zip target | ✓ | `package.json:144–152`. |
| 19f | No hardcoded user-data paths outside platform guards | ✓ | `ollama-manager.ts:101–103` properly guarded; ~45 `getPath('userData')` sites. |

### Issues / things that feel wrong

1. **🚨 `signAndEditExecutable: false` (Phase 19d) DIRECTLY CONTRADICTS Phase 14 §A6.** Phase 14 research finding A6 says "Leave `signAndEditExecutable: true` — setting it false strips the app icon + exe metadata (name/version/publisher). Not worth the marginal build-time saving." Phase 19 lands it as `false`. Phase 14's plan files-touched section doesn't relist this. Either the icon/metadata is gone from the installer (verify in v2.1.39+ release) or Phase 14 §A6 is wrong. **Strongly recommend manually inspecting a packaged installer for the icon + version metadata before the next release.**
2. **19a plan-text discrepancy** — original Step 1 said `…/app.asar/renderer/data/5e`. Implementation uses `app.getAppPath()/out/renderer/data/5e`. The completion note correctly reconciles this; just be aware the original step is misleading if read literally.

### Tests

`srd-provider.test.ts`, `context-builder.test.ts`, `chunk-builder.test.ts`, `game-data-handlers.test.ts` cover path resolution + path-traversal guard. Coverage is good. No need to add.

---

## Phase 20 — Security Audit Hardening

**Plan status line:** PHASE 20 COMPLETE (20a–20g) — 2026-05-29. 4-gate green (vitest 6491/6491).

### Verification

| Sub | Claim | Verified? | Notes |
|---|---|---|---|
| 20a | Discord botToken encrypted at rest via `safeStorage`; API-key format validation (`sk-ant-`, `sk-`, ≥20 chars) | ✓ | `discord-service.ts:49–67, 109`; `ai-service.ts:235–248`; `safe-secret-storage.test.ts:27–57`. |
| 20b | Zero `dangerouslySetInnerHTML`/`innerHTML` in renderer; JSX-only chat contract; `isSafeHref` rejects `javascript:`/`data:`/`file:` | ✓ | `ChatPanel.tsx:1–7`; `chat-links.ts:59–66`; `chat-links.test.ts:10–14`. |
| 20c | Hardcoded `dndvtt:dndvtt-relay` TURN removed; STUN-only default + cloud STUN; `setIceConfig` on boot | ✓ | `peer-manager.ts:18–28`; `App.tsx:62–64`. Grep 0 hits for the literal. |
| 20d | Plugin sha256 + `expectedChecksum` pin + 50 MB cap + extension allowlist + `..` reject + security-log events | ✓ | `plugin-installer.ts:45–54, 84–87, 57–70, 124–134, 85/127/140/165/174`. |
| 20e | AI reads restricted to four directories; denials logged; 1 MB per-file / 10 MB total caps with pruning | ✓ | `file-reader.ts:62–71, 78`; `memory-manager.ts:8–9, 95–104, 120`. |
| 20f | Magic-byte validation (PNG/JPEG/GIF/WebP/WAV/OGG/MP3); wired in `IMAGE_LIBRARY_SAVE` + `AUDIO_UPLOAD_CUSTOM`; per-branch tests | ✓ | `upload-validation.ts:20–45, 64–72`; wired at `storage-handlers.ts:363`, `audio-handlers.ts:53`. |
| 20g | Central `security-log.ts` 4 KB cap; wired across IPC + plugin + AI/memory | ✓ | `security-log.ts:17–28` exports; eight call-sites listed. |

### Issues / things that feel wrong

1. **Renderer-side security events not bridged.** Plan line 162 acknowledges kick/ban + network Zod rejections need an `LOG_SECURITY_EVENT` IPC bridge that's not implemented. Logged to ISSUES-LOG but ad-hoc — re-confirm that ISSUES-LOG-DNDAPP.md exists and carries the item (see Phase 22 issue #1).
2. **No install-path integration test for plugin-installer.** The new sha256/size/allowlist guards have no test that drives an oversized zip, bad extension, or checksum mismatch through the install API. Only uninstall is covered by `plugin-installer.test.ts:48–84`.
3. **Discord token migration codepath untested.** `discord-service.ts:63–66` migrates legacy plaintext on first load; `safe-secret-storage.test.ts` covers the helper but not the discord-specific flow.

### Tests

Five solid spec files added/extended (safe-secret-storage, chat-links, upload-validation, file-reader, memory-manager). Plugin install-path remains the visible gap.

---

## Phase 21 — GitHub & Version Control

**Plan status line:** PHASE 21 COMPLETE (21a–21e) — 2026-05-29.

### Verification

| Sub | Claim | Verified? | Notes |
|---|---|---|---|
| 21a | `ci.yml` on push/PR to master, scoped to `dnd-app/**`, runs lint + tsc(web+node) + vitest | ✓ | `.github/workflows/ci.yml:1–58`. |
| 21b | electron-vite build smoke + artifact existence check | ✓ | Steps `:49–57`. |
| 21c | Husky 9 installed; `prepare` script wires hook; `.husky/pre-commit` runs biome --staged + tsc-web + optional gitleaks | ✓ | `dnd-app/package.json` + `.husky/pre-commit:1–19`. Old `.githooks/pre-commit:1–8` retained but superseded — fine. |
| 21d | lint-staged | — | Intentionally skipped (plan line 102). |
| 21e | No stray `Phase*_*.md` at repo roots; README/CONTRIBUTING current | ✓ | `dnd-app/README.md` 277 lines; `docs/CONTRIBUTING.md:31–41`. |

### Issues / things that feel wrong

1. **`core.hooksPath` not set in working clone.** A fresh `npm install` *should* call husky's setup via the `prepare` script, but only after a regular (non-`--ignore-scripts`) install. If a future contributor uses `--ignore-scripts`, the hook is silently inactive. Suggest a CI verification step that checks `git config core.hooksPath` after `npm install`.
2. **Live biome lint hit** at `dnd-app/src/renderer/src/services/library/use-library-entry.test.ts:26` (`useLiteralKeys`). Plan claims "lint 0". One auto-fixable violation present. Run `npx biome check --apply src/`.
3. **README line-count mismatch (cosmetic).** Plan says 269; file has 277. Minor.

### Tests

CI workflow is structural infra — no new test coverage required.

---

## Phase 22 — Codebase Sweep: a11y / leaks / deps / security

**Plan status line:** PHASE 22 COMPLETE (22a–22l) — 2026-05-29. Vitest 6503/6503.

### Verification

| Sub | Claim | Verified? | Notes |
|---|---|---|---|
| 22a | `useReducedMotion` hook; `.reduce-motion` class on `<html>`; globals.css block; DiceOverlay uses hook | ✓ | `use-reduced-motion.ts:12–19`; `use-accessibility-store.ts:90/115–119`; `globals.css:120–127`; `DiceOverlay.tsx:104–106, 168–179`. |
| 22b | Six timer/listener leak fixes | ✓ | All six sites carry refs + cleanups; `ai-service.ts:415–417` + `main/index.ts:318` dispose wired. |
| 22c | Drop unused `immer` | ✓ | Absent from `package.json`. |
| 22d | `removeConversation` + cascade from `deleteCampaign` | ✓ | `ai-service.ts:406–409`; `campaign-storage.ts:150`. **No unit test for the cascade** — plan line 113 asked for one. |
| 22e | console→logger in PdfViewer/combat-resolver/system-chat-bridge | ✓ | |
| 22f | `JSON.parse` try/catch in game-data-handlers | ✓ | Already in place from Phase 17b. |
| 22g | Service-layer bypass cleanup | ✓ | EquipmentTab/SpellsTab use data-provider. |
| 22h | LICENSE + CHANGELOG | ✓ | Both present at `dnd-app/{LICENSE,CHANGELOG.md}`. |
| 22i | `parsePluginId` + tests | ✓ | `plugin-handlers.ts:16–30`; `plugin-handlers.test.ts:172–189`. |
| 22j | PR-check workflow | ✓ | Satisfied by Phase 21 `ci.yml`. |
| 22k | Shared `throttle` utility + tests | ✓ | `utils/throttle.ts:1–60`; `utils/throttle.test.ts:1–45`. **No call-site conversions** — opt-in only. |
| **22l** | **Audit tracking entries in `SUGGESTIONS-LOG-DNDAPP.md` + `ISSUES-LOG-DNDAPP.md` + `SECURITY-LOG.md`** | **✗ — MISSING** | None of those three files exist at `docs/`. Only `SESSION-LOG-2026-05-19.md` exists, which is a session note. Plan §22l (lines 190–218) required structured audit entries per `docs/LOG-INSTRUCTIONS.md`. **This is the documentation system that other phases reference and that CLAUDE.md tells future Claude sessions to grep.** |

### Issues / things that feel wrong

1. **🚨 22l audit tracking files are absent.** Phase 22 marked complete but the entire log infrastructure CLAUDE.md mandates ("Before touching code → Active logs") does not exist on disk. This is a foundational gap — multiple later phases cite "logged to ISSUES-LOG-DNDAPP.md" but the file isn't there. Either the files were created and deleted, or they were never written. **Strongly recommend creating them with the schema from `docs/LOG-INSTRUCTIONS.md`** (if that file exists) before any further phase work logs to them. Asking approval to draft empty stubs once you confirm the schema source.
2. **22d cascade test gap** — see verification table.

### Tests

Throttle suite + parsePluginId test added. Cascade and unmount-resilience tests would be valuable but are not planned-required.

---

## Phase 23 — In-Game Character Sheet

**Plan status line:** "PHASE 23 UPDATE — 2026-05-29 … Additional items landed gate-green (vitest 6520): 23b, 23f, 23j, 23k, 23l, 23c-core. STILL PARTIAL/DEFERRED: 23a, 23c-full, 23d, 23e remaining, 23g, 23i, 23n."

### Verification

| Sub | Claim | Verified? | Notes |
|---|---|---|---|
| 23a | List virtualization | DEFERRED | No `useVirtualizer` imports in SpellList5e. Plan acknowledges. |
| 23b | Spell search + Ritual/Conc./Prepared filters | ✓ | `SpellcastingSection5e.tsx:67–70, 196–201, 543–553`. |
| 23c-core | `updateCharacterInState` + `dm:character-update` routes to character store | ✓ | `use-character-store.ts:105–115`; `client-handlers.ts:925–945`. Dual write (legacy mirror to `setRemoteCharacter`). |
| 23c-full | Remove `remoteCharacters` field | DEFERRED | 29 active sites remain (DeathSaves5e/FeaturesSection5e/HitPointsBar5e/etc.). Plan defers. |
| 23d | ConflictBanner + conflict detection store | DEFERRED | No file. |
| 23e-partial | `React.memo(SpellRow)` | ✓ | `SpellList5e.tsx:32`. |
| 23e-remaining | `useMemo` sweep across Skills/Saves/Offense/Defense/Equipment | DEFERRED | No matches. |
| 23f | Single attunement source via `getEffectiveMagicItems` | ✓ | `AttunementTracker5e.tsx:21`; `MagicItemsPanel5e.tsx:65`. **Verify write path** — `MagicItemCard5e.tsx:~105` toggles attune; unsure whether it writes `state.magicItemAttuned[id]` (post-15) or `mi.attuned` (pre-15). Worth spot-check. |
| 23g | Optimistic save + rollback | DEFERRED | `HitPointsBar5e.tsx:33–51` calls `persistHitPoints` synchronously. |
| 23h | Tool proficiency roll button | ✓ | `ToolProficiencies5e.tsx:35–40`. |
| 23i | Standardize editor hook | PARTIAL | `SheetHeader5e.tsx:20`, `HitPointsBar5e.tsx:15` still use direct store. Plan defers. |
| 23j | HP damage/heal/temp helper | ✓ | `HitPointsBar5e.tsx:55–71, 148–175`. |
| 23k | Consumable Use button | ✓ | `EquipmentListPanel5e.tsx:85–97`. |
| 23l | Sheet initiative roll | ✓ | `SheetHeader5e.tsx:38–44, 218`. |
| 23m-partial | Equipment weight × quantity | ✓ | `weight-calculator.ts:68–70`. |
| 23m-container | Container `contents[]` recursion | DEFERRED | `EquipmentItem` has no `contents` field — plan acknowledges. |
| 23n | Condition sync + `QuickActions5e` | DEFERRED | No matches. |

### Issues / things that feel wrong

1. **23c dual-write contract is implicit.** `dm:character-update` writes both to the character store AND to `remoteCharacters` for back-compat. Reasonable as an interim, but worth flagging in a comment near the call site that the two stores must stay in sync until 23c-full lands.
2. **23f attunement WRITE path not verified.** Plan claims "single source" but only the read side was confirmed. If the write still hits `mi.attuned`, the store and the projection diverge after the first toggle.
3. **HitPointsBar HP delta logic is untested.** `applyHpDelta` (lines 55–71) has subtle temp-HP-absorb-first / heal-cap-at-max semantics — a unit test would protect this. Asking approval to add it.

### Tests

Component render tests exist for SpellList5e/SpellcastingSection5e/HitPointsBar5e/EquipmentListPanel5e/MagicItemsPanel5e/AttunementTracker5e. Missing: HP delta math test (23j) and attunement write-path integration test (23f).

---

## Phase 24 — Character Level-Up Bugs and Missing Features

**Plan status line:** PHASE 24 PARTIAL — 2026-05-29 (overnight pass; verifiable backend bugs done, apply-pipeline + wizard-UI items deferred & logged). 4-gate green (vitest 6504/6504).

### Verification

| Sub | Claim | Verified? | Notes |
|---|---|---|---|
| 24a | Subclass persistence end-to-end | DEFERRED | `apply-level-up.ts:28–50` lacks `subclassSelections` param; no write-back; `level-up-spells.ts:138` still reads `charClasses[0]?.subclass`. |
| 24b | Hit dice per class with `classId` | ✓ | `character-5e.ts:142–148`; `apply-level-up.ts:423–442`. Legacy fallback to primary-class. |
| 24c | Half-caster L1 spell slots fix | ✓ | `spell-data.ts:443–447`; `spell-data.test.ts:31–36`. |
| 24d | Post-ASI CON preview + roll lock | DEFERRED | `HpRollSection5e.tsx:25` still reads pre-ASI score; no lock state. |
| 24e | Multiclass skill proficiencies | DEFERRED | No state shape, no picker. |
| 24f | Spell swap / replacement | DEFERRED | No `spellSwaps`. |
| 24g | Cantrip selection at level-up | DEFERRED | No `newCantripIds`. |
| 24h | Feat sub-choice validation (`choiceConfig`) | DEFERRED | No validation in `feature-selection-slice.ts`. |
| 24i | Secondary-class resources loop | ✓ | `apply-level-up.ts:454–475`. |
| 24j | ASI overflow warning at 19 | ✓ | `AsiSelector5e.tsx:293–296`. Clamp in apply path (line 80). |
| 24k | Error visibility (replace silent `catch{}`) | ✓ | 8 catch blocks now log via `logger.warn`. |

### Issues / things that feel wrong

1. **24b legacy classId default is silent.** Mixed multiclass saves without `classId` default to primary; if that's wrong for a given save, hit dice get attributed incorrectly. Plan should add a `logger.warn` when defaulting.
2. **24d preview math will drift once 24d lands.** The plan's manual test (line 146) expects retroactive HP to match preview — but the preview uses pre-ASI CON today. When 24d wires post-ASI, retroactive math must match.
3. **24j enabled at score 19, but no guard at 20.** Verify the `atMax` check at `AsiSelector5e.tsx:272` blocks at ≥ 20, not just === 20. If it's `===`, a `+1/+1` could land on a 20 and silently waste.
4. **24a entry-point thread-through.** When 24a lands, callers in `level-up/index.ts` must thread `subclassSelections` — note this in the plan body so it isn't lost.

### Tests

Existing: `spell-data.test.ts` covers Phase 24c. Missing (planned, not added):
- 24b multiclass HD accumulation roundtrip.
- 24i secondary-class resources merge spec.
- 24d post-ASI CON modifier test once landed.

---

## Phase 25 — Homebrew & Custom Content System

**Plan status line:** PHASE 25 PARTIAL — 2026-05-29. 4-gate green (vitest 6508/6508).

### Verification

| Sub | Claim | Verified? | Notes |
|---|---|---|---|
| 25a | `entity-io` `homebrew` type + `.dndhomebrew` config | ✓ | `entity-io.ts:30, 63`. |
| 25a | `homebrew-io.ts` export/exportAll/import with validation | ✓ | `homebrew-io.ts:40`. |
| 25a | HomebrewCreateModal Export/Import buttons | ✓ | `HomebrewCreateModal.tsx:175–197`. |
| 25a Step 4 | `schemaVersion: 1` on the data payload | **✗** | `entity-io.ts:100–106` only has top-level `version: 1`. Inner data payload has no `schemaVersion`. |
| 25a Step 3 | Collision prompt (Replace / Import as copy) | **✗** | `homebrew-storage.ts:47–50` silently auto-generates a new UUID. No UI choice exists. |
| 25a Acceptance | Round-trip test: export → delete → import → reappear | **✗** | No such test in `import-export.test.ts`. |
| 25d | `homebrew-validation.ts` wraps `SCHEMA_REGISTRY`; tests pass | ✓ | 5 specs cover hard errors, unknown types, invalid input. |
| 25d | Modal save handler runs validation | **✗** | `HomebrewCreateModal.tsx:127–148` save path does not call `validateHomebrew`. Import path does (lines 40). |
| 25b | Homebrew feat effects | DEFERRED | No `homebrew-effects.ts`. |
| 25c | `campaignId` field on HomebrewEntry | DEFERRED | `library.ts:185–192` unchanged. |
| 25e | Backup round-trip homebrew test | DEFERRED | |

### Issues / things that feel wrong

1. **Collision prompt missing.** The "Import as copy / Replace" decision is silent — the storage layer just generates a new UUID. Users importing a file they previously exported may not realize they now have duplicates. Plan promises a prompt.
2. **`schemaVersion` not on the data payload.** A future field-addition migration cannot fall back without it.
3. **Round-trip test promised, not added.**
4. **Modal save bypasses validation.** Plan §25d Step 3 wanted save-time validation too; only import is gated.

### Tests

`homebrew-validation.test.ts` (5 specs) + backup test track homebrew count. Missing: entity-io round-trip + modal save-validation spec.

---

## Phase 26 — Encounter Builder & Combat Tracker

**Plan status line:** PHASE 26 PARTIAL — 2026-05-29. 26c DONE, 26a DONE (partial), 26f DONE (after plan written). 26b/26d/26e DEFERRED. Full P2P IPC round-trip deferred.

### Verification

| Sub | Claim | Verified? | Notes |
|---|---|---|---|
| 26a | Mock players removed; real connected players + modifiers | ✓ | `GroupRollModal.tsx:97` uses `useLobbyStore`; modifiers `:75–92`. |
| 26a | IPC `dm:group-roll-request` / `player:group-roll-result` registered | ✗ | Missing from `network-store/index.ts`. |
| 26a | 30s timeout + "X/Y responded" progress | ✗ | `requested` state exists; no timeout logic. |
| 26a | Monster auto-roll from stat block | ✗ | |
| 26b | Place All & Start Initiative creates tokens + starts initiative | ✗ | `EncounterBuilderModal.tsx:137–145` only broadcasts a chat message. |
| 26c | `smartPlaceTokens` + `findEmptyCell` wall/footprint aware | ✓ | `token-placement.ts` with 7 unit tests. |
| 26d | Encounter waves shape + migration + UI | ✗ | `encounter.ts:33–47` still `monsters: EncounterMonster[]`. |
| 26e | `mapId` dropdown + mini-map preview + startX/startY UI | ✗ | None of the UI exists, though the type field is present. |
| 26f | `executeLoadEncounter` uses `smartPlaceTokens` | ✓ | `creature-actions.ts:695`. |
| 26f | Pre-position startX/startY honored | **✗** | `creature-actions.ts:660–715` runs `smartPlaceTokens` globally without checking for explicitly set coords. **Live regression risk: any preset that includes pre-positioned monsters gets repositioned by the auto-placer.** |

### Issues / things that feel wrong

1. **🚨 26f does NOT honor pre-positioned monsters.** Plan Step 2 says the function should check `startX/startY` on each preset entry and only pass un-positioned ones through `smartPlaceTokens`. Current code overrides everything. If any user has built a preset with positioned monsters, loading the preset moves them.
2. **26a partial IPC isn't called out in the sub-phase status.** Plan markers say 26a DONE; the IPC, timeout, and monster-roll halves are deferred. Re-mark as PARTIAL.
3. **Plan stamp says 26f deferred, but commit `a45a255` landed it after the plan was written.** Plan should be backfilled or the stamp updated to reflect the actual state.
4. **GroupRollModal.test.tsx is a one-line import smoke test.** No real assertions — coverage gap given how many planned behaviors live here.

### Tests

token-placement (7 specs) is solid. Missing: Place-All token creation, wave migration round-trip, pre-position honoring in `executeLoadEncounter`, monster auto-roll path.

---

## Phase 27 — Audio, SFX & Atmosphere

**Plan status line:** PHASE 27 PARTIAL — 2026-05-29. 4-gate green (vitest 6514/6514).

### Verification

| Sub | Claim | Verified? | Notes |
|---|---|---|---|
| 27a | Ambient path fix (`./sounds/ambient/${id.replace('ambient-','')}.mp3`) | ✓ | `sound-playback.ts:36`. |
| 27b | Custom stop/delete by absolute path | ✓ | `DMAudioPanel.tsx:173–174, 214–215`. |
| 27c | 3D dice sound wired to `trigger3dDice` | DEFERRED | `Dice3dRollEvent` has no `source`; handler doesn't call `playDiceSound()`. |
| 27d | Remove hook duplicate handlers | DEFERRED | `use-game-network.ts:114–126` still present. |
| 27e | `/sound ambient` and `/sound stop` broadcast | ✓ (partial) | `commands-dm-sound.ts:85, 91`. **`/sound ambient` does NOT include volume in payload** (DM panel does). |
| 27f | Fade-id monotonic abort | ✓ | `sound-playback.ts:18, 93, 108–110`. |
| 27g | `reinit` cleans ambient + custom | DEFERRED | `sound-manager.ts:329–344` doesn't stop playback. |
| 27h | `setCustomAudioVolume` live update | ✓ (untested) | `sound-playback.ts:182–185`; re-exported. **No spec asserts the volume changes without restart.** |
| 27i | Custom audio network sync (IPC + base64 chunking) | DEFERRED | No `dm:play-custom-audio`/`dm:stop-custom-audio` message types. |
| 27j | Playlist system + auto-advance | DEFERRED | |

### Issues / things that feel wrong

1. **🚨 `/sound ambient` payload misses `volume`** (`commands-dm-sound.ts:85`). DM panel sends `{ ambient, volume: ambientVol / 100 }`; the chat command sends only `{ ambient: fullName }`. Result: players hear default volume instead of DM's slider value when the DM uses chat instead of the panel. Pure inconsistency.
2. **`setCustomAudioVolume` has no spec.** Code path is unverified by tests.
3. **`reinit` leaks ambient.** Session-reload while ambient is playing leaves loop running.

### Tests

`sound-manager.test.ts` (19 smoke specs), `sound-playback.test.ts` (8 smoke specs). Missing: ambient resolution, custom audio path Map keying, `setCustomAudioVolume` live update, fade abort behavior.

---

## Phase 28 — dnd-app Audit Follow-Ups (719-line plan)

**Plan status line:** PHASE 28 PARTIAL — 2026-05-29. 4-gate green (vitest 6514/6514).

### Verification

Of **45 named sub-phases across 28a–28i**, the audit found:
- **DONE:** 28a.1 (Math.random→cryptoRandom in 10 surfaces), 28a.5 (`JSON.parse` containment — actually landed in Phase 17b).
- **PARTIAL:** 28c.2 (`BridgeResponse` not a strict discriminated union), 28d.4 (effect-dep suppression, no test coverage), 28d.5 (Date.now+UUID hybrid still present at `PlayerHUDEffects.tsx:57`).
- **NOT DONE:** 36 items, including:
  - 🚨 **28a.2 BMO sync receiver hardening** — `bmo-bridge.ts:201` still binds `0.0.0.0` with `Access-Control-Allow-Origin: *`, no body-size cap, no rate limit, no Content-Type 415.
  - 🚨 **28a.3 Sync receiver Zod validation** — none added; raw `JSON.parse` at `bmo-bridge.ts:165, 175`.
  - 🚨 **28a.4 BMO Bearer auth** — no `getBmoApiKey` or `Authorization` header injection.
  - **28b.1 Claude model list update** — `claude-client.ts:99` still pings the legacy 3.5 Haiku; `llm-provider.ts:19–22` lists no 4.x family.
  - **28b.2 SDK 1.x bump** — `@anthropic-ai/sdk` still at `^0.78.0`.
  - **28b.3 Prompt caching** — no `cache_control`, no usage tracking.
  - **28b.4 Model-aware max_tokens** — hardcoded 4096.
  - **28c.1 Retry/backoff for `bmoPiFetch`** — single attempt.
  - **28c.3 Graceful shutdown** — `stopSyncReceiver` void, no before-quit hook.
  - **28c.6 `ELECTRON_RENDERER_URL` validation** — `index.ts:224–225` loads URL without checks.
  - **28d.1 Type the character pipeline** — `stat-mutations.ts:178` still `Record<string, unknown>`.
  - **28d.2 `save-queue.ts` dead cleanup** — dead equality check at `:43` persists.
  - **28d.3 `as unknown as` sweep** — 185 sites remain (target was < 40).
  - **28d.6 UUID truncation audit** — 86 truncated-uuid sites remain.
  - **28e.*** all six CI lint rules, dnd-app-ci workflow.
  - **28f.*** all eight UI polish items (74 `<div onClick>` instances remain).
  - **28g.*** docs sweep + 2 bare TODOs (`GameLayout.tsx:301`, `map-overlay-effects.ts:27`).
  - **28h.*** all five test-coverage gates.
  - **28i.*** 9 coverage-gap audits.

### Issues / things that feel wrong

1. **🚨 Phase 28 is essentially unstarted.** Two items done, three partial, 36 not done. The plan is marked PARTIAL but reads as if the items are still in scope. Recommend either (a) re-split into smaller phases (28-security, 28-ai-modernization, 28-tech-debt, 28-ci, 28-ux, 28-docs) so the "partial" status is meaningful, or (b) move the deferred sweeps to a Phase 47-style audit so individual cards can be planned/executed.
2. **🚨 BMO security items are not optional.** 28a.2/28a.3/28a.4 are user-facing remote-code-execution-adjacent risks (CORS *, no auth, raw JSON parse) on the listening port. These need real ownership before any release that exposes the BMO bridge externally.
3. **AI provider stack is using last-year's models.** 28b.1/28b.2/28b.3 mean we're not getting prompt-caching savings or the latest models.
4. **CI / coverage gates are entirely missing.** No `check:full`, no `dnd-app-ci.yml`, no `.coverage-baseline.json`, no regression scripts. The 4-gate doesn't enforce anything new from Phase 28.

### Tests

Two specs landed (Math.random remediation per-file), but the broad coverage gates (28h.1–28h.5) are unwritten.

---

## Phase 29 — Roles + Permissions

**Plan status line:** PHASE 29 PARTIAL — 2026-05-29. Foundation done; sweep/UI/migration deferred. 4-gate green (vitest 6520/6520).

### Verification

| Sub | Claim | Verified? | Notes |
|---|---|---|---|
| 29a | Permission universe + `hasPermission` + 6 specs | ✓ | `types/permissions.ts:1–103`, `has-permission.ts:1–40`. |
| 29b | `BUILTIN_ROLES` + Campaign.permissions injection on create/load | ✓ | `data/builtin-roles.ts:1–66`; `use-campaign-store.ts:82–85, 177`. |
| 29c | Role CRUD + built-in delete guard | ✓ | `use-campaign-store.ts:201–238`; test at `:56–83`. |
| 29c (cont'd) | Reassign peers on role delete + system-chat message | ✗ | Comment at `:219–220` explicitly defers to fallback in `resolvePeerRoleId`. Plan promised explicit reassignment. |
| 29d | Per-player overrides + precedence | ✓ | `has-permission.ts:30–34`; test `:47–50`. |
| 29e | Sweep `role === 'host'` / `isCoDM` literals → `hasPermission` | DEFERRED | 28 + 33 literal sites still active (e.g. `InGamePage.tsx:60`, `PlayerList.tsx:21`, `network-store/index.ts`). |
| 29f | View-as-role debug mode | DEFERRED | `GameLayout.tsx:147` still `viewMode: 'dm' \| 'player'`; no opts arg on `hasPermission`. |
| 29g | PermissionsEditor + PlayerOverridesPanel + tab | DEFERRED | Components absent. |
| 29h | Migration: pre-29 `isCoDM:true` peers → `role-codm` | PARTIAL | Injection works; explicit `peer.roleId = 'role-codm'` not written. Fallback via `resolvePeerRoleId:17` keeps things safe but the migration step the plan promised isn't there. |

### Issues / things that feel wrong

1. **`role === 'host'` literals are still the source of truth in core gameplay.** Without 29e, the new permission system is parallel infrastructure rather than the gate. Cosmetic risk: a new feature gets gated only by `hasPermission` while an old feature still gates by `role === 'host'`, and the two disagree under custom roles.
2. **29h migration step missing the explicit promotion.** Fallback works today; the moment someone removes `isCoDM` from `PeerInfo` (the natural next step), the migration becomes load-bearing and silently fails.
3. **`deleteRole` does not emit the promised system-chat message.** Plan §29c Step 5 promised one.
4. **`hasPermission` signature doesn't carry `opts.viewAs?`.** When 29f lands, callers need to be updated — note this in the plan body.

### Tests

`has-permission.test.ts` (6 specs) + `use-campaign-store.test.ts` (CRUD round-trip) is solid for the implemented foundation. Backwards-compat spec for pre-29 `isCoDM` migration would be useful.

---

## Phase 30 — Player-as-Host Architecture Rewrite

**Plan status line:** 30b FOUNDATION LANDED — 2026-05-29. `TransportAdapter` interface exists. GameAuthority consolidation, P2PTransport wrap, host/DM decouple, transfer, and old-core deletion remain.

### Verification

| Sub | Claim | Verified? | Notes |
|---|---|---|---|
| 30a | Extract `GameAuthority` module | DEFERRED | No `network/authority/` dir. `host-manager.ts`/`host-connection.ts`/`host-handlers.ts` still load-bearing. |
| 30b | `TransportAdapter` interface | ✓ (stub) | `network/transport/transport-adapter.ts:1–29`. **Interface only — no `P2PTransport` wrap, no `MemoryTransport`.** |
| 30c | `Campaign.hostPeerClientId` | DEFERRED | `Campaign.dmId` unchanged. |
| 30d | Host transfer protocol | DEFERRED | No `host-transfer.ts`. |
| 30e | DM transfer | DEFERRED | |
| 30f | PlayerCard transfer UI | DEFERRED | |
| 30g | Persistence layer | DEFERRED | |
| 30h | Tests | DEFERRED | |
| 30i | Migration | DEFERRED | |

### Issues / things that feel wrong

1. **30b is architecturally inert.** Interface exists; nothing wraps it, nothing consumes it. Plan calls 30b "gate-green" but the acceptance criterion ("game still runs on PeerJS unchanged") is vacuous because PeerJS isn't wrapped.
2. **Most of the network stack is still in the "shim" target directory.** Plan's plan-to-delete files (`host-manager.ts`, `host-connection.ts`, `host-message-handlers.ts`, `host-handlers.ts`) remain the primary implementation.
3. **Plan reads as 99% unfinished but ~1% landed and stamped "FOUNDATION LANDED".** Stamp creates an impression of progress; the architecture rewrite is still entirely ahead.

### Tests

None. `game-authority.test.ts`, `p2p-transport.test.ts`, `host-transfer.test.ts` all absent.

---

## Phase 31 — Live-state Sync Overhaul

**Plan status line:** 31a/31b FOUNDATIONS LANDED — 2026-05-29. Shard<T>/Delta interfaces + registry + structural-diff engine in place. Broadcaster/applier + per-shard descriptors deferred pending Phase 30.

### Verification

| Sub | Claim | Verified? | Notes |
|---|---|---|---|
| 31a | `shard.ts`, `registry.ts` | ✓ | Interfaces correct. |
| 31b | `diff.ts` + 6 specs incl. fuzzed round-trip | ✓ | Order-exact array patch, recursive. |
| 31c | `GameAuthority.startShardBroadcasting` | BLOCKED | Depends on Phase 30. |
| 31d | `applier.ts` mounted at App root | DEFERRED | No file. |
| 31e–i | Shard descriptors (chat/map/init/journal/…) | DEFERRED | No `shards/` dir. |
| 31j | Permission-aware filtering | DEFERRED | Requires 31c/d. |
| 31k | Sequence + replay | DEFERRED | |
| 31l | Drop bridges + handlers | DEFERRED | |
| 31n | Add-a-shard README | DEFERRED | |

### Issues / things that feel wrong

1. **`sequence: 0` is hardcoded in `diff.ts`** (lines 54, 76, 92). The broadcaster (31c) should assign monotonic per-shard sequence numbers. If 31c lands and forgets to re-stamp, the replay path will think every delta is the first.
2. **Shard contract naming drift** — plan calls the field `source`; code calls it `read`. Cosmetic but harmonize before per-shard files start consuming it.

### Tests

`diff.test.ts` 6 specs. Solid foundation. Nothing else possible until broadcaster/applier land.

---

## Phase 32 — Cloud Host (Pi-as-host)

**Plan status line:** PHASE 32 DEFERRED — 2026-05-29. Pi-side game_server.py + game_authority.py + WebSocketTransport client + shards/persistence/auth/admin UI all not started. `bmoPiBaseUrl` setting exists in `SettingsPage` and is reusable.

### Verification

All sub-phases (32a–32l) are absent from the codebase: no `bmo/pi/services/game_server.py`, no `websocket-transport.ts`, no CampaignWizard cloud toggle, no "Hosted Games" admin tab, no E2E resync test, no `ARCHITECTURE-VOICE.md`.

### Issues / things that feel wrong

None — deferral is clean. The plan is internally consistent and the dependency chain (29 → 30 → 31 → 32) remains correctly blocked.

### Tests

None expected. `bmo/pi/tests/` has 26 files; none reference Phase 32 symbols.

---

## Phase 33 — Tooling + Small Enhancement Bundle

**Plan status line:** PHASE 33 PARTIAL — 2026-05-29. 33b removed `ts-prune` from `knip.json`; 33e flipped electron.vite config to ESM via `fileURLToPath(new URL('./package.json', …))`. Other items deferred.

### Verification

| Sub | Claim | Verified? | Notes |
|---|---|---|---|
| 33a | Backup migration v1→v4 | ✓ (with caveat) | `import-export.ts:146–175`. v4 path present but **dormant** (Phase 15 dependency). Plan said "isolated from Phase 15" — actually depends on the Phase 15 shared core. |
| 33b | Drop `ts-prune` knip ignore | ✓ | `knip.json:1–21` clean; `package.json:41–42` shows `circular=dpdm`, `dead-code=knip`. |
| 33c | `ModalScaffold` extraction | DEFERRED | No new abstraction; existing modals untouched. |
| 33d | Bundle-size guard | DEFERRED | No `check-bundle-size.mjs` or baseline. |
| 33e | Config CJS → ESM | ✓ | Zero `require`/`createRequire`. |
| 33f | `provider-registry` static imports | ✓ | All four providers static. |
| 33g | `use-network-store` barrel | ✓ (decision pending) | 4-line re-export; dead-code detector flags it as unused. |
| **33h** | **Content schemas wrapped to match file shapes** | **PARTIAL FAIL** | `SpellsSchema` wraps OK at `spells.ts:569–571`. `BackgroundSchema`, `ClassSchema`, `BestiarySchema` still single-record; `backgrounds.json` / `classes.json` / `monsters.json` have wrapper shapes. **Validator reports 20 errors across 6 files when run.** |

### Issues / things that feel wrong

1. **🚨 Content validator (33h) is broken.** Plan says "wrap or restructure per content shape" — only spells were wrapped. Other JSON files (backgrounds, classes, bestiary, feats, mechanics, species, world) still mismatch. `scripts/audit/validate-content-vs-schemas.ts:23` is the offending validator entry. Asking approval to add wrapper schemas (`BackgroundsFileSchema = z.object({ section, description, total_count, backgrounds: z.array(BackgroundSchema) })` etc.) — this is a small, well-scoped fix.
2. **Validator not wired into CI / `package.json`.** Even when 33h is fixed, nothing runs it. Plan promised `check:full`/`validate:schema` target; not present.
3. **33a v4 migration path is dormant** — Phase 15 hasn't flipped `CURRENT_SCHEMA_VERSION` to 4 yet, so the new code never executes. No spec for it.

### Tests

Round-trip backup specs at `import-export.test.ts:460–543` cover v1→v3. v4 path uncovered (dormant). Validator has no specs.

---

## Phase 34 — i18n Foundation + Sweep

**Plan status line:** 34a FOUNDATION LANDED — 2026-05-29. i18next + react-i18next + resources-to-backend installed; `i18n/{config,index,use-translation,types}.ts` + `locales/en.json` created; `main.tsx` awaits `initI18n()`. Sweeps (34b–j), lint + CI (34k), key-type generator (34l) remain.

### Verification

| Sub | Claim | Verified? | Notes |
|---|---|---|---|
| 34a.1 | Deps installed | ✓ | i18next, react-i18next, i18next-resources-to-backend in `package.json`. |
| 34a.2 | `config.ts` defaultNS=`common` | **✗ — defaults to `translation`** | `i18n/index.ts:11` sets `defaultNS: 'translation'`. Test passes incidentally because `en.json` is loaded as the whole namespace. **Plan and code disagree.** |
| 34a.3–.8 | `index.ts`, `use-translation.ts`, `types.ts`, en.json seed, `main.tsx` await, sentinel test | ✓ | All present. |
| 34b–34j | String sweeps across lobby/game/builder/sheet/levelup/settings/AI/toasts | DEFERRED | Zero `useT()` imports in components. |
| 34k | Lint rule, CI gate, key generators | DEFERRED | No `scripts/i18n/` directory. |
| 34l | Docs in CONTRIBUTING/AGENTS/CLAUDE/README | DEFERRED | |

### Issues / things that feel wrong

1. **Namespace mismatch between plan and code** — `defaultNS: 'translation'` vs `defaultNS: 'common'`. If the sweeps adopt `t('common.actions.save')` keys and the actual namespace shape changes, everything breaks. Decide one and align before 34b lands.
2. **`TranslationKeys = string` is a stub** — no narrowing until 34k generator lands; any typo silently fails at runtime.

### Tests

Two specs (`t('common.actions.save')` resolves; `initI18n()` idempotent). Sound.

---

## Phase 35 — IPC Handler Zod-Validation Sweep

**Plan status line:** 35a FOUNDATION LANDED — 2026-05-29. `withSchema(channel, zodSchema, handler)` added to `src/main/ipc/_safe.ts`; tested. Per-channel migration (35b–i) + coverage script (35j) remain.

### Verification

| Sub | Claim | Verified? | Notes |
|---|---|---|---|
| 35a | `withSchema` wrapper + specs | ✓ | `_safe.ts:50–65`; `_safe.test.ts:23–42`. |
| 35a Detail | Schema inventory in `ipc-schemas.ts` | ✗ | Only ~7 schemas defined for ~146 IPC channels. |
| 35a Detail | Preload envelope shape (`{ ok, data, error, issues }`) | ✗ | `src/preload/index.ts` still raw-proxies `ipcRenderer.invoke`. |
| 35b–35i | Per-channel migrations | ✗ — **zero call-sites for `withSchema`** | 143 `handle()` calls remain. SAVE_CHARACTER and similar still use inline `safeParse`. |
| 35j | `check-ipc-coverage.mjs` CI gate | ✗ | Script absent. |
| 35k | ADR + AGENTS/CLAUDE rule | ✗ | No `docs/decisions/ADR-001-ipc-validation.md`. |

### Issues / things that feel wrong

1. **`withSchema` is dead code right now.** Wrapper exists and is unit-tested, but no production handler uses it. Risk: it bit-rots between now and the sweep.
2. **Renderer-side envelope contract unstarted.** When 35b begins migrating handlers, preload needs the envelope shape change at the same time or callers crash on the new `{ ok, data, error }` shape.
3. **Mismatch between "foundation landed" and the rest of Phase 28.** Phase 28 also tried to fix IPC handler safety (28a.5, 28d.1) and overlapped with this. Worth a follow-up to dedupe scope.

### Tests

`_safe.test.ts` covers the wrapper. Per-handler tests not yet meaningful.

---

## Phase 36 — Pi-hosted Library + Offline Cache

**Plan status line:** PHASE 36 DEFERRED — 2026-05-29. Slim seed bundle + Pi library API + remote-loader + cache + invalidation: not started; depends on Phase 32.

### Verification

All sub-phases (36a–36j) absent: no `public/data/5e-seed/`, no `library_server.py`, no `remote-loader.ts`, no `library-cache.ts`, no `LibrarySourcePanel.tsx`, no `LibraryDownloadProgress.tsx`, no `CURRENT_LIBRARY_SCHEMA_VERSION` constant, no `docs/decisions/` directory.

### Issues / things that feel wrong

1. **`bmoPiBaseUrl` configured but orphaned.** Phase 32 plumbing exists in `SettingsPage.tsx:665–687` and `bmo-config.ts:48`; nothing consumes the value. A user setting a URL today does nothing.
2. **`upsertHomebrew` (Phase 15) is local-only.** Plan 36f expects a Pi POST + pending queue. Current `use-library-store.ts:152` validates and writes locally only — when 36 lands, this needs the Pi side wired without breaking existing local-only users.
3. **`CACHE_TTL_MS` hardcoded** `use-library-store.ts:15` defines a 30-minute TTL with no enforcement (`loadCategory` only uses in-memory `cacheMeta.loadedAt`). Future cache-invalidation work in 36d will need this fully wired.

### Tests

None. All planned test files absent. Expected per deferral.

---

## Cross-Phase Findings & Top Risks

The following items aren't bound to one phase but emerged from the audit as a whole. Roughly ranked by impact.

### 🚨 Critical (live behavior issues, fix soon)

1. **Phase 17c LOG-2 — `doubleDiceInFormula` duplicate + broken attack path.** `combat-resolver.ts:909` has the correct `g`-flag implementation; `attack-helpers.ts:224` (the version imported by `attack-resolver.ts`) is still the broken one. `attack-helpers.test.ts:92–96` actively pins the broken behavior. Live impact: Sneak Attack / Smite / multi-die crit damage under-rolls. **Asking approval to (a) delete the helpers copy, (b) re-export from combat-resolver, (c) flip the test to `1d8+1d6 → 2d8+2d6`.**
2. **Phase 26f — `executeLoadEncounter` ignores pre-positioned monsters.** `creature-actions.ts:660–715` runs `smartPlaceTokens` over every monster; presets with `startX/startY` get moved. Plan asked for the opposite.
3. **Phase 27e — `/sound ambient` chat command drops the volume.** `commands-dm-sound.ts:85` sends `{ ambient }` only; DM panel sends `{ ambient, volume }`. Clients hear default loudness when DM uses chat.
4. **Phase 28a.2 / 28a.3 / 28a.4 — BMO sync receiver is unauthenticated and open to *.** `bmo-bridge.ts:201` binds `0.0.0.0`, `Access-Control-Allow-Origin: *`, no body cap, no rate limit, no Bearer auth, no Zod validation of incoming payloads. If you ever expose the bridge externally, this is the first thing to land.
5. **Phase 18j — `screenReaderModeSet` not persisted.** `use-accessibility-store.ts:50–66` excludes the flag from the `persist()` partial. Effect: a user with `prefers-reduced-motion` who declines the prompt sees it again on next launch. Small fix.
6. **Phase 22l — log infrastructure missing.** `SUGGESTIONS-LOG-DNDAPP.md`, `ISSUES-LOG-DNDAPP.md`, `SECURITY-LOG.md` don't exist on disk. CLAUDE.md tells future sessions to grep them, and several later phases say "logged to ISSUES-LOG…". Recommend stubbing them with the schema from `docs/LOG-INSTRUCTIONS.md` (which itself should be confirmed to exist).

### 🟠 High (correctness / contract drift)

7. **Phase 19d vs Phase 14 §A6 — `signAndEditExecutable: false`** strips icon + exe metadata per Phase 14 research. Phase 19 lands it as `false` anyway. Manually inspect a packaged installer before the next release; revert if the icon/metadata is gone.
8. **Phase 23c dual-write contract** (`client-handlers.ts:925–945`) silently writes to both the new character store AND legacy `remoteCharacters`. Acceptable as transition but needs a comment + a divergence-detection spec.
9. **Phase 23f attunement write path** — only the read side was confirmed. If the toggle still writes `mi.attuned` while readers project from `state.magicItemAttuned`, the views diverge after the first toggle. Spot-check `MagicItemCard5e.tsx:~105`.
10. **Phase 17d NET-6/29/30 — `safeHandler` migration is partial.** Plan claims complete; ~32 raw `ipcMain.handle` sites still exist across `game-data-handlers.ts`, `audio-handlers.ts`, `index.ts`. Pairs with Phase 35's deferred sweep.
11. **Phase 29e — `role === 'host'` / `isCoDM` literals are the source of truth** in core gameplay. The new permission system is parallel, not load-bearing. New features risk gating differently from old features.
12. **Phase 33h validator** — wrapper-shape mismatch causes 20 errors across 6 content JSON files. Validator exists but is not CI-wired.
13. **Phase 34a `defaultNS`** mismatch between plan (`common`) and code (`translation`). Decide and align before any sweep starts.

### 🟡 Medium (deferral / scope hygiene)

14. **Phase 28 — 36 of 45 sub-phases unstarted.** Recommend splitting (28-sec, 28-ai, 28-debt, 28-ci, 28-ux, 28-docs) or moving deferred items to dedicated phases so PARTIAL means something.
15. **Phase 30 — "FOUNDATION LANDED" stamp is generous.** One stub interface; rest of the architecture rewrite is ahead. Stamp risks creating false sense of progress.
16. **Phase 35 — `withSchema` wrapper has zero call-sites.** Dead code risk between landing and the sweep.
17. **Phase 25 — collision prompt + round-trip test missing**; modal save bypasses validation.
18. **Phase 22d — cascade test missing.**

### 🟢 Hygiene / documentation

19. **Stranded research evidence** in Phase 14 plan (~600 lines of `§A/§B/§C` sourced findings + web links). Archive when 14g/14i close.
20. **Husky `core.hooksPath`** isn't set in working clones; first-time-installs with `--ignore-scripts` would silently skip the hook.
21. **Live biome lint hit** at `use-library-entry.test.ts:26` (`useLiteralKeys`). One auto-fix would clear "lint 0".
22. **Phase 14 release-asset / differential benchmark** still pending — required for the next tag.

---

## Tests requested (need your approval before adding)

If you'd like me to write any of these tests, say which and I'll add them:

1. **🚨 P17 LOG-2 regression** — flip `attack-helpers.test.ts:92–96` to assert `1d8+1d6 → 2d8+2d6` (and delete the duplicate helper in `attack-helpers.ts`, re-exporting `combat-resolver`'s correct version).
2. **P18 screen-reader prompt persistence** — spec that `screenReaderModeSet` survives a `persist()` round-trip; partialize fix in `use-accessibility-store.ts:50–66`.
3. **P14f "silent on quit" regression** — spec that `autoInstallOnAppQuit` stays false after every `autoUpdater.on(...)` callback.
4. **P23j HP delta math** — temp-HP-absorb-first / heal-cap-at-max specs for `HitPointsBar5e.tsx:55–71`.
5. **P26f pre-position honoring** — spec that `executeLoadEncounter` keeps explicit `startX/startY` and only passes the rest through `smartPlaceTokens`.
6. **P29h backwards-compat migration** — spec that pre-29 `isCoDM:true` peers still grant `manage_initiative`-equivalent perms after the auto-injection.
7. **P33h content-validator fix** — add wrapper schemas (`BackgroundsFileSchema`, `ClassesFileSchema`, `BestiaryFileSchema`, etc.) to fix the 20 validation errors and wire `validate:content` into `package.json`.

---

## Closing

Repo state is healthy at a 4-gate level (lint / tsc-web / tsc-node / vitest pass). The phase plans have been moving fast and most landings are accurately stamped, but four kinds of drift kept showing up:

- **Plans get stamped DONE while one of three or four steps inside the sub-phase is missing or partial** (17c LOG-2, 17d NET, 22l, 23c, 26a, 26f, 29h, 33h, 34a). Recommend a brief "verify before stamp" pass at the end of each phase.
- **"FOUNDATION LANDED" is being used liberally** for phases that have written one interface and deferred the work that consumes it (30b, 31a/b, 34a, 35a). Useful as a milestone but not the same as "Phase complete".
- **Cross-phase contradictions** (14 ↔ 19 on `signAndEditExecutable`; 28 ↔ 35 on IPC validation; 29 ↔ existing role literals).
- **Documentation infrastructure is partly missing** (no `ISSUES-LOG-DNDAPP.md`, no `SUGGESTIONS-LOG-DNDAPP.md`, no `SECURITY-LOG.md`, no `docs/decisions/`).

Nothing in the audit is on fire (the BMO-bridge exposure only matters once the port is reachable externally; the dice-crit bug is silent but real). Request explicit approval on which fixes/tests above you'd like me to land.

