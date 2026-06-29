# dnd-app Suggestions Log

> **Future ideas, design gotchas (warnings for future contributors), and notable observations — dnd-app domain only.**
>
> Sibling logs:
> - BMO suggestions → [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
> - dnd-app active bugs / debt → [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md)
> - BMO active bugs / debt → [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md)
> - Security concerns (global, any domain) → [`SECURITY-LOG.md`](./SECURITY-LOG.md) *(gitignored)*
> - Resolved dnd-app entries → [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md)
>
> Logging templates + triage rules: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md).

**Triage rule:** `Domain: dnd-app` design-gotchas / future-ideas / info → here. `Domain: both` entries that meaningfully apply to dnd-app behavior → mirrored here AND in `BMO-SUGGESTIONS-LOG.md`. Cross-tooling rules that touch dnd-app contributors → here (and mirror in BMO file if it touches them too).

New entries go at the TOP of their section (newest first).

---

# Future ideas

> **2026-06-28 (dnd-phase-executer) — RESOLVED: PHASE-53B TURN credential model -> option (b) ephemeral REST creds, IMPLEMENTED.** (Supersedes the "DECISION NEEDED" note below.) coturn on bmo switched to `--use-auth-secret` (static secret stored off-repo at `/home/patrick/.secrets/turn_shared_secret`, launcher `/home/patrick/bmo-coturn-run.sh`); new Pi relay endpoint `GET /api/turn-credentials` (`bmo/pi/routes/turn_api.py`) mints time-limited HMAC creds; the app fetches them via the main-process `turn-bridge` + `window.api.turn` and layers a `turn:<host>:3478` candidate onto the self-host ICE set (`network/peer-manager.ts:ensureEphemeralTurn`; `forceRelay` stays false; a user TURN override still wins). Verified: STUN binding + a minted-cred TURN Allocate both succeed against live coturn; tsc/vitest/pytest green. NO repo-visible credential (the Phase-20c removal stands). Pending: integrator merge -> relay restart to activate the endpoint -> next dnd-app release (v2.6.4) ships the app wiring.


> **2026-06-28 (dnd-phase-executer) — DECISION NEEDED: default-ICE TURN credential model (PHASE-53B step 2).** PHASE-53A (auto-fallback to the cloud relay on a P2P data-channel timeout) shipped in v2.6.3 and resolves the user-facing NAT symptom. The remaining 53B item — advertising a TURN relay in the DEFAULT self-host ICE set — is BLOCKED on a security decision (rule 9(b)) and was deliberately NOT auto-implemented. coturn already runs on bmo (`bmo-coturn`, realm `dndvtt`, 3478 + relay 49152–49200; STUN binding probe to `10.10.20.242:3478` returns `0x0101`), but it authenticates with the **static long-term credential `dndvtt:dndvtt-relay`** — the exact repo-visible credential Phase 20c deliberately removed from the app (`network/peer-manager.ts:17-22`, “repo-visible … a relay anyone could abuse”). Two paths, both needing a human call: (a) accept re-bundling the static `dndvtt:dndvtt-relay` creds into the default ICE set (fast, but reverses the 20c security removal and re-exposes an abusable relay); or (b) reconfigure coturn to ephemeral REST credentials (`use-auth-secret` + a time-limited HMAC minting endpoint on the Pi relay) and wire the app to fetch short-lived creds (secure, but a cross-cutting infra+app change). Until decided, the default stays STUN-only (status quo) with 53A as the fallback. Flagged to the user via `notify.sh warn` 2026-06-28.


> **2026-06-24 (dnd-resolver) - approved-but-deferred this run.** The entries below
> were APPROVED (approve-all) but NOT implemented in this run: the two MapSelector /
> ChatPanel / NPCManager rename, the `.dndvtt` open-file handler, the Report-a-bug
> path, Settings search, the `src/main/ai` 57-module reorg, the `ai-service.ts`
> decompose, the helper-suffix rename, the e2e (Playwright) harness, the a11y (jest-axe)
> guard, and the settings.json main-process-prefs export. Each is a large refactor, a
> new test harness, or a UI feature needing interactive/visual verification; committing
> them unverified onto the shared `auto/dnd-resolver` branch would risk blocking the
> integrator from merging the verified fixes already pushed there (commit 21fc4bec).
> They are left diagnosed for a dedicated focused run, not abandoned.

> **2026-06-24 (dnd-resolver) - integration note (updated).** The prior salvage
> branch `auto/dnd-resolver-salvage` (tip `6f4d6a9b`) is now fully contained in
> `origin/master` (rev-list count origin/master..salvage = 0). Five of its six
> features are verified present on master and have been MOVED to
> `RESOLVED-ISSUES-DNDAPP.md`: command palette `CommandPalette.tsx`, first-run
> onboarding tour `use-onboarding-store.ts` + `OnboardingTour.tsx`, character and
> campaign export-import `services/io/character-io.ts` + `campaign-io.ts`, in-app log
> open/export `ipc/log-handlers.ts` `LOG_OPEN_FOLDER`, and the update release-notes
> panel `updater.ts` + `UpdateSection.tsx`. The SIXTH - settings.json main-process
> prefs export - is still genuinely open (no settings.json in the export path) and is
> kept as its own entry below. The other entries here - `src/main/ai` reorg,
> `ai-service.ts` decompose, helper-suffix, e2e + a11y harness - remain open.

---

### [2026-06-28] Stale one-off `scripts/submit/*-batch.ts` content-gen scripts no longer wired up, and they ignore the documented per-system submit layout

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** dnd-cleanup scheduled cleanup/reorg scan of `dnd-app/`

**Description:**
`scripts/submit/` holds six one-off Anthropic Batch API generation scripts — `submit-phase4-batch.ts`, `submit-phase5-batch.ts`, `submit-subclass-batch.ts`, `submit-integration-batch.ts`, `submit-mass-batch.ts`, `submit-missing-data-batch.ts`. They are leftovers from earlier content-build phases: none is referenced from `package.json` scripts, from any other script, or from docs (only PLUGIN-SYSTEM.md mentions the directory generically). Each hardcodes a payload/cache file in `process.cwd()` (`batch_payload_phase4.jsonl`, `.mass_batch_cache.json`, `batch-subclasses.jsonl`, etc.) — none of which exist in the repo anymore, so the scripts cannot run as-is. `submit-missing-data-batch.ts`'s header usage block still points at the pre-move path `scripts/submit-missing-data-batch.ts` (the files now live one level deeper in `scripts/submit/`). Separately, PLUGIN-SYSTEM.md documents the intended layout as `scripts/submit/<system-id>/submit-*.ts` (per-plugin-system subdirectories), but the actual files sit flat in `scripts/submit/` keyed by old phase numbers — so the directory neither matches the documented convention nor reflects any live system.

**Hypothesis / root cause:** Phase-era bulk-generation tooling that was never pruned after the 5e content set was finalized; the per-`<system-id>` convention in PLUGIN-SYSTEM.md was written aspirationally and the historical phase scripts predate it.

**Proposed fix / improvement:**
- [ ] Confirm none are needed for live workflows (grep already shows zero callers), then archive them out of the active tree — either delete, or move to `_archive/` / a `scripts/submit/_historical/` folder with a one-line README noting they were phase-era batch jobs.
- [ ] If the submit pattern is meant to stay as a template, keep ONE canonical example renamed to the documented `scripts/submit/<system-id>/submit-*.ts` shape and fix its usage-comment path, rather than six phase-numbered copies.
- [ ] Reconcile PLUGIN-SYSTEM.md so the documented layout matches whatever is actually kept.

**Related files:** `scripts/submit/submit-phase4-batch.ts`, `scripts/submit/submit-phase5-batch.ts`, `scripts/submit/submit-subclass-batch.ts`, `scripts/submit/submit-integration-batch.ts`, `scripts/submit/submit-mass-batch.ts`, `scripts/submit/submit-missing-data-batch.ts`, `docs/PLUGIN-SYSTEM.md`

### [2026-06-28] `CHANGELOG.md` is ~14 versions stale (top entry 2.2.2, app shipping 2.6.4) and nothing in the release flow updates it

- **Category:** docs
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** dnd-cleanup scheduled cleanup/reorg scan of `dnd-app/`

**Description:**
`package.json` is at `2.6.4`, but `CHANGELOG.md`'s newest entry is `## [2.2.2]` (entries stop at 2.2.2 / 2.2.1 / 2.2.0 / 2.1.39). That is roughly fourteen releases of drift. The release helper `scripts/release/cut.mjs` does not touch `CHANGELOG.md`, and `package.json` build config explicitly excludes `CHANGELOG.md` from the packaged app — so the file just rots silently and provides no usable release history to anyone reading the repo. A changelog that lies is arguably worse than none.

**Hypothesis / root cause:** Changelog upkeep was manual and quietly dropped around 2.2.x once the automated phase/release cadence took over; the release script was never extended to append an entry.

**Proposed fix / improvement:**
- [ ] Decide on a single source of truth: either (a) have `cut.mjs` auto-append a `## [x.y.z]` stub (date + version) on each release cut so the changelog stays current, or (b) formally retire `CHANGELOG.md` in favour of git tags / GitHub Releases and replace its body with a pointer to those.
- [ ] If keeping it, backfill (even tersely) the 2.3.0 -> 2.6.4 gap from release tags / commit history so the file is internally consistent.

**Related files:** `CHANGELOG.md`, `scripts/release/cut.mjs`, `package.json`

### [2026-06-28] `mobile/` version is pinned behind the desktop app (2.6.3 vs 2.6.4) with no shared version source

- **Category:** config
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** dnd-cleanup scheduled cleanup/reorg scan of `dnd-app/`

**Description:**
`dnd-app/package.json` is `2.6.4`; `dnd-app/mobile/package.json` is `2.6.3`. The mobile Expo client embeds and reuses the desktop/web renderer logic, so a lagging version number is a quiet correctness/traceability hazard — a bug reproduced against "2.6.3 mobile" could actually be running 2.6.4 renderer code (or vice versa). There is no single version source the two manifests derive from, so they drift whenever a desktop release is cut without a matching mobile bump.

**Hypothesis / root cause:** Desktop releases are cut by `scripts/release/cut.mjs` (which bumps the desktop manifest only); the mobile manifest is bumped by a separate manual/EAS step that lagged this cycle.

**Proposed fix / improvement:**
- [ ] Short term: bump `mobile/package.json` to match desktop (2.6.4) and note the coupling.
- [ ] Longer term: have `cut.mjs` also bump `mobile/package.json` (and `app.config.ts` version) in the same release commit, or read both from one shared `version` constant, so they cannot diverge.

**Related files:** `package.json`, `mobile/package.json`, `mobile/app.config.ts`, `scripts/release/cut.mjs`

### [2026-06-28] `scripts/` has ~40 scripts across 11 sub-areas but no `scripts/README.md` documenting the taxonomy

- **Category:** docs
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** dnd-cleanup scheduled cleanup/reorg scan of `dnd-app/`

**Description:**
`scripts/` is organised into `audit/`, `build/`, `dev/`, `i18n/`, `lib/`, `lint/`, `maintenance/`, `release/`, `schemas/`, `smoke/`, `submit/` plus loose top-level scripts (`check-circular.mjs`, `sign.mjs`), mixing `.mjs` and `.ts`. There is no `scripts/README.md` explaining what each sub-area is for, which scripts are wired into `package.json` vs run ad-hoc, or the `.mjs`-vs-`.ts` split. New contributors (and scanning agents) have to reverse-engineer the layout from `package.json` and grep — which is exactly how the stale `submit/` scripts above went unnoticed. A short index would make dead/one-off scripts obvious and give a home for documenting conventions (e.g. the per-`<system-id>` submit layout, where new audit vs maintenance scripts belong).

**Hypothesis / root cause:** The directory grew organically per phase without a documentation pass.

**Proposed fix / improvement:**
- [ ] Add `scripts/README.md`: one line per sub-directory (purpose), a table of the package.json-invoked entry points vs ad-hoc/one-off scripts, and the `.mjs` (build/tooling) vs `.ts` (tsx-run, type-checked) convention.
- [ ] While writing it, flag any script with no caller (see the `submit/*-batch.ts` entry) so the index doubles as a cleanup checklist.

**Related files:** `scripts/`, `package.json`, `docs/PLUGIN-SYSTEM.md`
### [2026-06-28] Mobile (Expo/React Native) target has no CI gate and no test suite — its lint/typecheck/build never run and Dependabot PRs land unverified

- **Category:** debt, test, portability
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** dnd-app tree review (CI-vs-target coverage sweep across `dnd-app/mobile`)

**Description:**
`dnd-app/mobile/` is a real, non-trivial target — six screens (`MainMenu`, `Characters`, `Library`, `JoinGame`, `GameSession`, `Settings`), a native bridge (`src/bridge/native-bridge.ts`, `EmbeddedWebView.tsx`), a storage adapter (`src/storage/storage-adapter.ts`), an embed loader, and a synced `_shared/` tree — totalling ~3,200 LOC. It defines `lint` and `typecheck` scripts in `mobile/package.json`, yet **no CI workflow runs any of them.** A repo-wide `grep` of `.github/workflows/` for `mobile` returns nothing but a `dependabot.yml` comment; the dnd-app gate (`dnd-app-ci.yml`) operates only on the parent package and never `cd`s into `mobile/`. Compounding this, the mobile project has its **own** Dependabot entry (`.github/dependabot.yml` -> `directory: /dnd-app/mobile`) that opens dependency-bump PRs — but with no CI those PRs have **zero** automated lint/typecheck/build verification, so the integrator's "patch/minor + green CI -> merge" rule (AUTOMATED-AGENT-GIT-WORKFLOW Rule 3B) has no green signal to gate on for mobile. The native surfaces (bridge, storage adapter) also have **zero tests** (`find mobile/src -name '*.test.*'` -> 0), unlike the heavily-tested desktop/web tree (856 test files). Net: mobile can break — type errors, lint regressions, a broken Expo build, or a bad dependency bump — and nothing catches it until a manual EAS build.

**Hypothesis / root cause:** The mobile app was added as a later, separate Expo project with its own lockfile and toolchain (Metro/EAS) and was wired into Dependabot but never into the GitHub Actions gate; the main CI was hand-assembled as explicit parent-package steps (same pattern noted in the 2026-06-25 `dnd-app-ci` drift entry) so a new sibling target was easy to overlook.

**Proposed fix / improvement:**
- [ ] Add a `mobile-ci.yml` (or a `mobile` job in `dnd-app-ci.yml`) that runs `npm ci` + `npm run lint` + `npm run typecheck` in `dnd-app/mobile` on PRs touching `dnd-app/mobile/**` (non-blocking at first, like `dnd-e2e.yml`, then promote to required once stable).
- [ ] Add at least a smoke test for the native bridge + storage adapter so the EAS-only surfaces have a regression guard.
- [ ] Once a mobile CI job exists, ensure mobile Dependabot PRs are gated by it before the integrator auto-merges them.

**Related files:** `dnd-app/mobile/package.json` (`lint`/`typecheck` scripts), `dnd-app/mobile/src/bridge/native-bridge.ts`, `dnd-app/mobile/src/bridge/EmbeddedWebView.tsx`, `dnd-app/mobile/src/storage/storage-adapter.ts`, `/.github/workflows/dnd-app-ci.yml`, `/.github/workflows/dnd-e2e.yml` (non-blocking pattern to mirror), `/.github/dependabot.yml` (mobile entry)

**Related entries:** [2026-06-25] "dnd-app CI omits the doc/i18n drift guards…" (same root shape: CI assembled as an explicit step list, so new guards/targets never propagate in).

---

### [2026-06-28] `mobile/src/_shared/` is a committed sync copy of `src/shared/` with no `--check` drift guard — it can silently diverge

- **Category:** debt, portability
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** dnd-app tree review (mobile shared-code sync mechanism)

**Description:**
`mobile/scripts/sync-shared.mjs` copies the canonical `dnd-app/src/shared` tree into `dnd-app/mobile/src/_shared` (so Metro/EAS, which only upload the mobile project dir, can bundle the bridge protocol/types in-tree). That copy is **committed to git** (not gitignored — `git check-ignore` confirms `mobile/src/_shared/constants.ts` is tracked) and is marked "Generated — do not edit." The problem: `sync-shared.mjs` has **only** a write mode — `grep` finds no `--check` / diff / drift / `exit(1)` path — and **no CI runs it** (see the sibling "mobile has no CI gate" entry). So if a contributor edits `src/shared/**` and forgets to re-run `npm run sync-shared`, the committed `_shared/` copy goes stale with nothing to catch it; the mobile build then bundles an out-of-date bridge protocol/types against the live desktop/web bridge. This is the exact failure mode the repo already guards elsewhere with `--check` modes (`sync:doc-counts -- --check`) and the open ask for one on `gen:ipc-surface` (2026-06-25 entry) — the same pattern is simply missing here.

**Hypothesis / root cause:** `sync-shared.mjs` was modeled on `sync-embed.mjs` as a pre-build copy step ("Run before bundling/builds"), so a verify/`--check` mode was never needed for the build path; committing the generated output (for EAS) then created a drift surface that a check-mode would normally cover.

**Proposed fix / improvement:**
- [ ] Add a `--check` flag to `mobile/scripts/sync-shared.mjs` that re-copies to a temp dir and diffs against the committed `_shared/`, exiting non-zero on drift.
- [ ] Run `sync-shared -- --check` in the mobile CI job (per the sibling entry) so a stale `_shared/` fails the gate.
- [ ] Alternatively, stop committing `_shared/` and generate it fresh in the EAS prebuild (`prebuild`/`build:embed` already run sync steps) so there is nothing to drift — weigh against EAS upload-scope constraints first.

**Related files:** `dnd-app/mobile/scripts/sync-shared.mjs`, `dnd-app/mobile/src/_shared/` (committed generated copy), `dnd-app/src/shared/` (canonical source), `dnd-app/scripts/build/sync-doc-counts.mjs` (existing `--check` pattern to mirror)

**Related entries:** [2026-06-28] "Mobile (Expo/React Native) target has no CI gate…"; [2026-06-25] "dnd-app CI omits the doc/i18n drift guards … and `gen:ipc-surface` has no `--check` mode".

---

### [2026-06-25] Renderer god-components `GameLayout.tsx` and `PdfViewer.tsx` stay monolithic despite established sibling extraction dirs

- **Category:** debt
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** scheduled cleanup/structure scan of dnd-app/ (largest-file sweep)

**Description:**
Two renderer components are by far the largest non-generated source files in the tree and remain single-file monoliths even though each already has a sibling directory proving the team's decomposition pattern:
- `src/renderer/src/components/game/GameLayout.tsx` — 1,331 LOC / ~57 KB, sitting next to `components/game/game-layout/` (which already holds `MapSelector`, `GamePromptsLayer`, `InspectModalRenderer`, `ViewAsSelector`, `WeatherBanner`, `DrawingToolPicker`, `use-view-mode`, `types`). The bulk of layout logic still lives in the monolith; it imports a handful of pieces from `./game-layout` but most was never extracted.
- `src/renderer/src/components/library/PdfViewer.tsx` — 1,378 LOC / ~52 KB, sitting next to `components/library/pdf-viewer/` (`pdf-helpers`, `toc-data`, `toc-utils`, `types`) — same shape: helpers carved out, the giant component body left behind.

This is distinct from the existing `ai-service.ts` decompose entry (that's a main-process service). Large components like these slow review, hurt testability, and make merge conflicts likelier on the busiest UI files.

**Hypothesis / root cause:** Incremental extraction stalled after the easy, leaf-level pieces (selectors, helpers, types) were pulled into the sibling dirs; the stateful core was never split because it carries most of the cross-cutting wiring.

**Proposed fix / improvement:**
- [ ] Continue extracting `GameLayout.tsx` into `game-layout/` — pull out cohesive sub-regions (e.g. overlay orchestration, sidebar/bottom wiring, modal-group mounting) as their own components/hooks behind the existing `index.ts` barrel.
- [ ] Continue extracting `PdfViewer.tsx` into `pdf-viewer/` — separate render/canvas, TOC/navigation, and search/state into focused units; keep `PdfViewer.tsx` as a thin shell.
- [ ] Add the per-file size to the bundle/size or a lint budget so the monoliths shrink rather than grow.

**Related files:** `dnd-app/src/renderer/src/components/game/GameLayout.tsx`, `dnd-app/src/renderer/src/components/game/game-layout/`, `dnd-app/src/renderer/src/components/library/PdfViewer.tsx`, `dnd-app/src/renderer/src/components/library/pdf-viewer/`

**Related entries:** [2026-06-23] `ai-service.ts` is a ~1,740-LOC god file; [2026-06-24] Two near-identical `MapSelector.tsx` components

> **2026-06-29 (dnd-resolver) — APPROVED; left for a focused refactor (not done this run).** Decomposing the 1,331-LOC `GameLayout.tsx` / 1,378-LOC `PdfViewer.tsx` stateful cores is a judgment-heavy refactor whose correctness the cheap local CI gate cannot confirm (tsc/biome/unit tests will not catch a broken render), and it would be a large diff on the busiest UI files that risks blocking the integrator's merge of this run's verified fixes. Left diagnosed under the workflow (b) exception (needs visual/runtime verification + seam judgment), not abandoned.

---

### [2026-06-25] DO NOT "dedupe" the `shared/types/*` <-> `renderer/src/types/*` re-export shims — the duplicate basenames are an intentional process-boundary split

- **Category:** design-gotcha
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** scheduled cleanup/structure scan of dnd-app/ (duplicate-basename sweep)

**Why it is tempting:** A duplicate-basename scan flags pairs like `src/shared/types/character-5e.ts` <-> `src/renderer/src/types/character-5e.ts` (also `character-common.ts`, `companion.ts`, `library.ts`) and reads them as copy-paste duplication a cleanup pass should collapse into one file.

**Why it is wrong:** This is a deliberate Phase-28d split, documented in the file headers. The canonical type tree lives in `src/shared/**` precisely because the Electron **main** process can only import from `src/shared/**` (not `renderer/`), so it must type its character pipeline off the real shape there. The `renderer/src/types/*` file is a thin **re-export shim** (`export type { ... } from '...shared/types/...'`) that also keeps renderer-only runtime helpers (e.g. `totalHitDiceRemaining` / `totalHitDiceMaximum`). Collapsing them would either break main-process imports (if you delete the shared copy) or break the hundreds of existing `from '.../types/character-5e'` renderer imports (if you delete the shim).

**What to do instead:** Leave both files. Treat `src/shared/types/*` as canonical (type-only, no runtime) and `src/renderer/src/types/*` as the renderer-facing re-export + runtime-helper layer. Add new shared types in `shared/`, re-export from the renderer shim, and keep renderer-only helpers in the shim. (Recording here so future cleanup/scanner runs — including this one — do not re-propose the merge.)

**Related files:** `dnd-app/src/shared/types/character-5e.ts`, `dnd-app/src/renderer/src/types/character-5e.ts`, `dnd-app/src/shared/types/character-common.ts`, `dnd-app/src/shared/types/companion.ts`, `dnd-app/src/shared/types/library.ts`
### [2026-06-24] Campaign on-disk `.versions/` backups are write-only — no list/restore IPC or UI (asymmetric with characters)

- **Category:** future-idea, UX
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** dnd-app tree review (storage layer + version-history survey)

**Description:**
`campaign-storage.ts` (saveCampaign, ~L55-75) writes a timestamped versioned backup to `<campaignsDir>/.versions/<id>/<id>_<ts>.json` before every overwrite and prunes to the latest 20 — a real, working safety net. But unlike characters, **none of it is reachable by the user.** Characters get the full path: on-disk `.versions/` PLUS `listCharacterVersions` / `restoreCharacterVersion` in `character-storage.ts`, the `CHARACTER_VERSIONS` + `CHARACTER_RESTORE_VERSION` IPC channels, and a restore UI in `CharacterSheet5ePage.tsx`. For campaigns there is **no `listCampaignVersions` / `restoreCampaignVersion`, no `CAMPAIGN_VERSIONS` / `CAMPAIGN_RESTORE_VERSION` IPC channel, and no UI** (grep confirms only the character variants exist). So the 20 campaign backups silently accumulate on disk and the user has no way to see or roll back to them when a campaign gets corrupted or a bad AI/DM action mangles state — the exact scenario the backups were written for. This also overlaps confusingly with the *separate* renderer-side autosave system (`services/io/auto-save.ts`) that keeps its own campaign "versions" in localStorage with its own UI — two parallel, non-interoperating version stores for the same object.

**Proposed fix / improvement:**
- [ ] Add `listCampaignVersions(id)` / `restoreCampaignVersion(id, fileName)` to `campaign-storage.ts` mirroring the character API (including the same path-traversal guard the character restore handler already applies to `fileName`).
- [ ] Expose them via new `CAMPAIGN_VERSIONS` / `CAMPAIGN_RESTORE_VERSION` IPC channels and a restore-from-history UI (campaign detail / load screen), reusing the character version-list component if practical.
- [ ] Decide how the on-disk `.versions/` store and the renderer localStorage autosave store should relate — ideally unify them so the user sees one coherent version history rather than two.

**Related files:** `dnd-app/src/main/storage/campaign-storage.ts` (`.versions/` write ~L55-75), `dnd-app/src/main/storage/character-storage.ts` (`listCharacterVersions`/`restoreCharacterVersion`), `dnd-app/src/main/ipc/storage-handlers.ts` (`CHARACTER_VERSIONS`/`CHARACTER_RESTORE_VERSION`), `dnd-app/src/shared/ipc-channels.ts`, `dnd-app/src/renderer/src/services/io/auto-save.ts`, `dnd-app/src/renderer/src/pages/CharacterSheet5ePage.tsx`

> **2026-06-29 (dnd-resolver) — BACKEND SHIPPED on `auto/dnd-resolver`; restore UI residual.** Implemented the reachable API: `listCampaignVersions` / `restoreCampaignVersion` in `campaign-storage.ts` (mirrors the character API incl. the path-traversal guard + the CHR-2 UTC-`Z` timestamp fix), new `CAMPAIGN_VERSIONS` / `CAMPAIGN_RESTORE_VERSION` IPC channels + handlers (handler-side traversal guard + `logSecurityEvent`), and `window.api.campaign.listCampaignVersions/restoreCampaignVersion` in preload + types. +8 storage unit tests; tsc/biome green; IPC-SURFACE regenerated (243 channels). RESIDUAL: the restore-from-history UI panel + placement in the campaign load/detail screen (needs visual verification), and the decision to unify the on-disk `.versions/` store with the renderer autosave store (see the autosave entry below).

---

### [2026-06-24] Renderer autosave stores full game-state snapshots in `localStorage` — quota-bound + synchronous, fragile on large campaigns and on the web target

- **Category:** future-idea, portability, performance
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** dnd-app tree review (autosave service + web-persistence survey)

**Description:**
`services/io/auto-save.ts` periodically (default every 5 min, `maxVersions` 10) serializes the **entire game state** to JSON and stores each version under its own `localStorage` key (`autosave:<campaignId>:<versionId>`), plus a per-campaign manifest. `localStorage` has a hard ~5-10 MB per-origin quota, is **synchronous** (each `setItem` blocks the main thread), and throws `QuotaExceededError` on overflow. A large campaign (many tokens, maps, fog/lighting, drawings, NPC memory) serialized × up to 10 versions can realistically approach or exceed that quota, at which point `setItem` throws and autosaves are silently lost — or, worse, the throw cascades into other `localStorage`-backed settings writes. This is most acute on the **web target** (`build:web`), where there is no Electron file-system fallback at all, so localStorage is the only persistence the autosave path has. IndexedDB (async, hundreds of MB+ quota, structured-clone instead of JSON-stringify) is the standard home for blobs this size; in the Electron build the main-process file store (which already has the campaign `.versions/` mechanism) is an even better home.

**Proposed fix / improvement:**
- [ ] Move autosave snapshot bodies off `localStorage` to IndexedDB (keep only the small manifest in localStorage if convenient), or in the Electron build route them through a main-process IPC into the existing on-disk version store.
- [ ] Wrap the current `setItem` writes in `QuotaExceededError` handling as an immediate safeguard (evict oldest version + retry, and surface a toast) so autosave fails loud, not silent.
- [ ] Make the write async / chunked so a large snapshot doesn't jank the frame during a session.

**Related files:** `dnd-app/src/renderer/src/services/io/auto-save.ts`, `dnd-app/src/renderer/src/constants/settings-keys.ts` (`autosaveVersions`/`autosaveVersion` key builders), `dnd-app/docs/WEB-VERSION-PLAN.md`

**Related entries:** [2026-06-24] "Campaign on-disk `.versions/` backups are write-only…" (the two version systems should be reconciled).

> **2026-06-29 (dnd-resolver) — FAIL-LOUD SAFEGUARD SHIPPED on `auto/dnd-resolver`; IndexedDB migration residual.** Replaced the silent single-shot quota retry in `auto-save.ts` with a robust eviction LOOP (`persistSnapshotWithEviction` drains oldest versions until the write fits) plus a loud `addToast(..., 'error')` when a snapshot still cannot be persisted — autosave now fails loud, not silent (the immediate safeguard the entry asked for). `QuotaExceededError` is detected cross-browser; serialization errors are not mistaken for quota. +2 tests; suite green. RESIDUAL: moving snapshot bodies off `localStorage` to IndexedDB / a main-process store + async/chunked writes — a larger architectural change entangled with the campaign-version store-unification decision above.

---

### [2026-06-24] i18n has no RTL / document-`dir` infrastructure — adding any right-to-left locale would need layout work first

- **Category:** future-idea, portability
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** dnd-app tree review (i18n config + locale survey)

**Description:**
The i18n stack (`src/renderer/src/i18n/`) ships two locales, `en` and `es`, both left-to-right, and the parity test (`locale-parity.test.ts`) is nicely set up to cover any future locale automatically. But there is **no right-to-left support anywhere**: `grep` finds no `documentElement.dir` / `dir=` management, `setLocale()` in `i18n/index.ts` only calls `changeLanguage` + persists the choice — it never sets the document direction — and the Tailwind/CSS is written with physical properties (`ml-*`, `pl-*`, `left-*`) rather than logical ones (`ms-*`, `ps-*`, `start-*`). So the moment someone adds an RTL locale (Arabic, Hebrew, Persian) — which the parity infrastructure otherwise invites — the entire UI would render mirrored-wrong (text right-aligned but layout still left-anchored). Logging now so the gap is known before a translator contributes an RTL `*.json` and is surprised the app doesn't flip.

**Proposed fix / improvement:**
- [ ] Add a per-locale `dir` ('ltr' | 'rtl') field and have `setLocale()` set `document.documentElement.dir` (and `lang`) on switch and on initial load.
- [ ] Audit high-traffic components for physical-direction Tailwind classes and migrate to logical properties (`ms/me`, `ps/pe`, `start/end`) where feasible; add a lint note for new code.
- [ ] Only then accept an RTL locale into `SUPPORTED_LOCALES` (the parity guard already handles the key-set side).

**Related files:** `dnd-app/src/renderer/src/i18n/index.ts` (`setLocale`), `dnd-app/src/renderer/src/i18n/config.ts` (`SUPPORTED_LOCALES`/`LOCALE_LABELS`), `dnd-app/src/renderer/src/i18n/locales/`, `dnd-app/src/renderer/src/main.tsx` (init path)

> **2026-06-29 (dnd-resolver) — document-`dir`/`lang` INFRA already present on master; CSS logical-property sweep residual.** Verified the first proposed-fix item is done on master: `i18n/index.ts` `applyDocumentLocale()` sets `document.documentElement.dir` (via `dirFor` + `RTL_LOCALES`) and `lang` on `languageChanged` and first paint, covered by `document-locale.test.ts` (WEB-I18N-1 / phase-56). RESIDUAL: the physical→logical Tailwind migration (`ml/pl/left` → `ms/ps/start`) across ~164 components — not done blind, because not every physical class should become logical and there is no RTL locale to verify against (the entry itself gates adding one). Best done as a focused pass with the actual RTL-locale decision.

---

### [2026-06-28] PHASE-56E Spanish menu / character-card i18n walk needs the deployed web build to verify

- **Category:** future-idea, i18n
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-phase-executer
- **During:** PHASE-56 (56E, verification-gated)

**Description:**
Sub-phase 56E is verification-gated: re-walk the menu + character cards in Espanol and fix carried i18n leaks IF they reproduce. It could not be exercised — the automated executor has no running/deployed web build, and the plan forbids guesswork. No code change for 56E. The next WEB-QA pass should drive the Espanol main-menu hero + character-card walk on `https://bmo.mybmoai.work/DungeonTableOnline/` and fix only if leaks reproduce.

**Related files:** `dnd-app/src/renderer/src/i18n/locales/{en,es}.json`, main-menu hero + character-card components (TBD)

> **2026-06-29 (dnd-resolver) — GENUINELY BLOCKED this run (no deployed web build).** 56E is verification-gated and the plan forbids guesswork; the automated resolver has no running/deployed web build to drive the Español main-menu + character-card walk. No code change. Remains for the next WEB-QA pass with a live build.

---
