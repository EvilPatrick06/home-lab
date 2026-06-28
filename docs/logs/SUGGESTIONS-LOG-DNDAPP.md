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

### [2026-06-25] dnd-app CI omits the doc/i18n drift guards that `check:full` defines, and `gen:ipc-surface` has no `--check` mode

- **Category:** debt, docs
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** scheduled cleanup/structure scan of dnd-app/ (CI vs npm-script coverage cross-check)

**Description:**
`package.json` defines a `check:full` aggregate that includes three generated-artifact / i18n drift guards — `sync:doc-counts -- --check`, `i18n:check-parity`, and (implicitly) keeping `docs/IPC-SURFACE.md` in sync — but `dnd-app-ci.yml` runs its gate as individual steps and does **not** invoke any of them. The CI steps are: lint, lint:forbidden, tsc (web+node), validate:content, test, electron-vite build, web build, check:bundle-size, test:coverage, audit:ci, circular, no-skipped-tests, dead-code, check:electron-eol. Missing: locale-parity (`i18n:check-parity`), doc-count drift (`sync:doc-counts --check`), and IPC-surface drift. Separately, `gen:ipc-surface` has **no `--check` mode at all** (the generator only writes the file; grep finds no check/diff/argv handling), so even a contributor who wanted to gate it cannot. `agent-docs-check.yml` only covers the five AI-assistant guide files, not these. Net effect: `docs/IPC-SURFACE.md`, the synced doc counts, and `src/renderer/src/i18n` locale parity can silently drift on `master` between the rare manual `check:full` runs.

**Hypothesis / root cause:** CI was assembled as a hand-maintained list of explicit steps rather than calling `npm run check:full`, so guards added to `check:full` later (doc-counts/i18n) never propagated into the workflow; `gen:ipc-surface` predates the `--check` convention used by `sync-doc-counts.mjs`.

**Proposed fix / improvement:**
- [ ] Add `i18n:check-parity` and `sync:doc-counts -- --check` steps to `dnd-app-ci.yml`.
- [ ] Add a `--check` flag to `scripts/build/gen-ipc-surface.mjs` (write to a temp/string, diff against committed `docs/IPC-SURFACE.md`, exit 1 on drift) and add `gen:ipc-surface -- --check` as a CI step.
- [ ] Optionally fold all guards into `check:full` and have CI call that single script so the list cannot drift again.

**Related files:** `/.github/workflows/dnd-app-ci.yml`, `dnd-app/package.json` (`check:full`, `gen:ipc-surface`, `sync:doc-counts`, `i18n:check-parity`), `dnd-app/scripts/build/gen-ipc-surface.mjs`, `dnd-app/scripts/build/sync-doc-counts.mjs`, `dnd-app/scripts/i18n/check-locale-parity.mjs`, `dnd-app/docs/IPC-SURFACE.md`

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

---
