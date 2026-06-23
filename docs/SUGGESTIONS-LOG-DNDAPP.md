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

### [2026-06-23] `src/main/ai/` is a flat directory of 57 source modules — group into subfolders

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** automated cleanup/reorg scan of `dnd-app/`

**Description:**
`src/main/ai/` holds ~57 non-test `.ts` modules (114 files counting co-located tests) flat in a single directory, with only `image/` and `prompt-sections/` broken out into subfolders. Several clear logical clusters are obvious from the filenames and would read far better grouped:

- **Provider clients** — `claude-client.ts`, `gemini-client.ts`, `openai-client.ts`, `ollama-client.ts`, `embedding-client.ts` (+ `provider-registry.ts`, `llm-provider.ts`, `model-routing.ts`) → a `clients/` subfolder.
- **Memory / retrieval** — `memory-manager.ts`, `vector-store.ts`, `embedding-index.ts`, `hybrid-search.ts`, `search-engine.ts`, `keyword-extractor.ts`, `entity-store.ts`, `entity-extraction.ts` → a `memory/` subfolder.
- **Context assembly** — `context-builder.ts`, `campaign-context.ts`, `character-context.ts`, `recap-context.ts`, `ollama-context.ts`, `chunk-builder.ts`, `token-budget.ts` → a `context/` subfolder.

Flat dirs this large make it hard to see module boundaries and inflate the cost of every `ls`/grep. Grouping is purely organizational (no behavior change).

**Proposed fix / improvement:**
- [ ] Agree on a small set of subfolders (`clients/`, `memory/`, `context/`, plus the existing `image/`, `prompt-sections/`).
- [ ] `git mv` modules + their co-located `*.test.ts` together so history is preserved.
- [ ] Update imports (TS path updates) and re-run `npm run circular` + `npm run dead-code` to confirm nothing broke.

**Related files:** `dnd-app/src/main/ai/` (whole tree)

**Related entries:** [2026-06-23] `ai-service.ts` god file; circular-dependency entry in `ISSUES-LOG-DNDAPP.md` (ai-service.ts ↔ campaign-context.ts ↔ campaign-storage.ts)

---

### [2026-06-23] `ai-service.ts` is a ~1,740-LOC (71 KB) god file — decompose into focused modules

- **Category:** debt
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** automated cleanup/reorg scan of `dnd-app/`

**Description:**
`src/main/ai/ai-service.ts` is the single largest hand-written module in the codebase at ~1,739 LOC / 71 KB (its co-located `ai-service.test.ts` is ~46 KB, and there are three additional split-out test files: `ai-service-file-read-cancel`, `ai-service-restream-context`, `ai-service-web-search-approval`). It is the main-process counterpart to the already-logged `SettingsPage.tsx` god component, but on the backend side. A file this size is hard to navigate, concentrates merge conflicts, and is implicated in the existing circular-dependency entry (`ai-service.ts → campaign-context.ts → campaign-storage.ts → ai-service.ts`) — decomposition is the natural way to break that cycle.

**Proposed fix / improvement:**
- [ ] Identify cohesive responsibilities inside `ai-service.ts` (e.g. request orchestration, streaming/restream handling, file-read/cancel, web-search approval — the test split already hints at the seams) and extract each into its own module under `src/main/ai/`.
- [ ] Keep `ai-service.ts` as a thin orchestrator that wires the extracted pieces together.
- [ ] Re-run `npm run circular` to confirm the extraction also resolves the ai-service ↔ campaign-context cycle.

**Related files:** `dnd-app/src/main/ai/ai-service.ts`, `dnd-app/src/main/ai/ai-service.test.ts`

**Related entries:** [2026-06-22] `SettingsPage.tsx` is a ~1,950-LOC god component; circular-dependency entry in `ISSUES-LOG-DNDAPP.md`

---

### [2026-06-23] `data-provider.ts` (840 LOC) sits beside a same-named `data-provider/` folder — fold the monolith into the folder

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** automated cleanup/reorg scan of `dnd-app/`

**Description:**
`src/renderer/src/services/` contains both a 30 KB / ~840-LOC monolith `data-provider.ts` AND a `data-provider/` directory (`build-slot-options.ts`, `companion-files.ts`, `extracted-data-types.ts`, `transformers.ts`). Having a big single file living next to a folder of the same name — where helpers have already started being peeled off into the folder — is a half-finished refactor and a navigation smell (which one is the "real" data provider?). The cleaner end-state is to move `data-provider.ts` into the folder as `data-provider/index.ts` (so existing `services/data-provider` imports keep resolving) and continue splitting it into the sibling modules.

**Proposed fix / improvement:**
- [ ] `git mv src/renderer/src/services/data-provider.ts src/renderer/src/services/data-provider/index.ts` (imports of `services/data-provider` resolve to the folder index unchanged).
- [ ] Continue extracting cohesive chunks from `index.ts` into sibling files in the folder.
- [ ] Re-run `npm run dead-code` / `npm run circular` after the move.

**Related files:** `dnd-app/src/renderer/src/services/data-provider.ts`, `dnd-app/src/renderer/src/services/data-provider/`

---

### [2026-06-23] Inconsistent helper-module filename suffix: `-utils` vs `-helpers` vs `-utility/-utilities`

- **Category:** docs
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** automated cleanup/reorg scan of `dnd-app/`

**Description:**
Modules holding the same kind of "miscellaneous helper functions" are named with three different conventions across `src/`: `*-utils.ts` (9 files, e.g. `map-utils.ts`, `attack-utils.ts`, `dice-utils.ts`), `*-helpers.ts` (5 files, e.g. `attack-helpers.ts`, `dice-helpers.ts`, `broadcast-helpers.ts`), a bare `helpers.ts` (1), and `*-utility/-utilities.ts` (3, e.g. `equipment-utilities.ts`, `commands-utility.ts`, `commands-player-utility.ts`). The inconsistency is most visible in the combat code, which has BOTH `services/combat/attack-helpers.ts` and `components/game/modals/combat/attack-utils.ts`, and in chat-commands (`commands-utility.ts` + `commands-player-utility.ts` + `helpers.ts`). Picking one suffix (e.g. `-utils`) and renaming the others would make the codebase easier to grep and reason about.

**Proposed fix / improvement:**
- [ ] Decide on a single convention (suggest `-utils.ts`) and document it in `CONTRIBUTING.md` / `dnd-app/docs/DESIGN-CONSTRAINTS.md`.
- [ ] `git mv` the `-helpers.ts` / `-utility.ts` / `-utilities.ts` files to the chosen suffix (and their co-located tests) and update imports.
- [ ] Optionally add a `forbidden-patterns` lint check for new files using a non-canonical suffix.

**Related files:** `dnd-app/src/renderer/src/services/combat/attack-helpers.ts`, `dnd-app/src/renderer/src/components/game/modals/combat/attack-utils.ts`, `dnd-app/src/renderer/src/services/character/equipment-utilities.ts`, `dnd-app/src/renderer/src/services/chat-commands/{commands-utility,commands-player-utility,helpers}.ts`

---
### [2026-06-22] Inconsistent casing in the `dnd-app/docs/phases/` tree (`completed` vs `QA/Completed`, `INSTRUCTIONS.md` vs `QA/instructions.md`)

- **Category:** docs
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** automated cleanup/reorg scan of `dnd-app/`

**Description:**
Parallel concepts in the same phases doc tree are named with different casing, which is a small but real organization smell (and a portability hazard on case-insensitive filesystems if a sibling dir is ever added):

- `dnd-app/docs/phases/completed/` (lowercase `c`) vs `dnd-app/docs/phases/QA/Completed/` (capital `C`) — the two "completed archive" folders disagree.
- `dnd-app/docs/phases/INSTRUCTIONS.md` (uppercase) vs `dnd-app/docs/phases/QA/instructions.md` (lowercase) — the two instruction files disagree.

Pick one convention and apply it to both. Lowercase-kebab (`completed/`, `instructions.md`) is the more common choice in this repo; whichever is picked, the `INSTRUCTIONS.md` references and `PHASE-INDEX.md` "move to `completed/`" wording should match.

**Proposed fix / improvement:**
- [ ] Rename `docs/phases/QA/Completed/` -> `docs/phases/QA/completed/` (or rename the top-level one to match — pick one).
- [ ] Rename `docs/phases/QA/instructions.md` -> `INSTRUCTIONS.md` (or the top-level one to lowercase — pick one) and update any references.
- [ ] Use `git mv` so history is preserved; grep the phases docs for the old paths afterward.

**Related files:** `dnd-app/docs/phases/completed/`, `dnd-app/docs/phases/QA/Completed/`, `dnd-app/docs/phases/INSTRUCTIONS.md`, `dnd-app/docs/phases/QA/instructions.md`, `dnd-app/docs/phases/PHASE-INDEX.md`

---

### [2026-06-22] Duplicate, already-diverging `PLUGIN-SYSTEM.md` — one at repo-root `docs/`, one in `dnd-app/docs/`

- **Category:** docs
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** automated cleanup/reorg scan of `dnd-app/`

**Description:**
There are two `PLUGIN-SYSTEM.md` files, both titled `# Plugin System - dnd-app`, describing the same dnd-app plugin API:

- `docs/PLUGIN-SYSTEM.md` (repo root, ~6.6 KB)
- `dnd-app/docs/PLUGIN-SYSTEM.md` (~11.2 KB)

They already disagree: the root copy is shorter/older and even points readers at the dnd-app copy for the trust model ("see the trust model in `dnd-app/docs/PLUGIN-SYSTEM.md`"), so the root file is effectively a stale partial mirror of the canonical one. Two copies of a domain-specific doc is exactly the drift pattern the per-domain doc split was meant to avoid. (Note: the dnd-app `README.md` "Plugin system" section links to `./docs/PLUGIN-SYSTEM.md`, i.e. the dnd-app copy — so the root copy has no obvious inbound link from dnd-app.)

**Proposed fix / improvement:**
- [ ] Treat `dnd-app/docs/PLUGIN-SYSTEM.md` as canonical (it is the fuller, linked one). Replace `docs/PLUGIN-SYSTEM.md` with a one-line pointer to it, or delete the root copy if nothing references it (grep first: `git grep -n "docs/PLUGIN-SYSTEM.md"`).
- [ ] If the root copy must stay (e.g. monorepo-level index), reduce it to a stub link so the content lives in exactly one place.

**Related files:** `docs/PLUGIN-SYSTEM.md`, `dnd-app/docs/PLUGIN-SYSTEM.md`, `dnd-app/README.md`

### [2026-06-22] No user-facing export/import of a character or campaign to a portable file

- **Category:** future-idea, portability
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** dnd-app tree review (storage + renderer survey for data-portability features)

**Description:**
The app can persist characters/campaigns locally (`src/main/storage/*`), sync via cloud (`cloud:sync-backup`), and import books (`book:import`), and `SettingsPage.tsx` already has an Export/Import Settings flow — but there is no equivalent "export this character (or campaign) to a `.json` file" / "import character from file" action. A user who wants to share a built character with a friend, move one character between machines without enabling cloud sync, or keep a manual off-app backup of a single character has no supported path. Grep for `exportCharacter` / `downloadJson` / `exportToJson` / a save-file dialog around character data returns nothing in the renderer or `src/main` (only the JS `export` keyword and the settings exporter).

**Proposed fix / improvement:**
- [ ] Add a main-process IPC (`character:export-file` / `character:import-file`) that serializes the stored character (already a JSON-shaped, schema-versioned object — reuse `migrations.ts` on import) through a `showSaveDialog` / `showOpenDialog`.
- [ ] Add an "Export…" / "Import…" affordance in the character list / sheet toolbar (and optionally the campaign list).
- [ ] On import, run the existing migration pipeline so older-schema files upgrade cleanly, and validate against the 5e schema before committing.

**Related files:** `src/main/storage/character-storage.ts`, `src/main/storage/migrations.ts`, `src/main/ipc/index.ts`, `src/renderer/src/pages/SettingsPage.tsx` (existing settings-export pattern to mirror)

**Related entries:** see "Settings export/import covers localStorage only…" (same file) — a character/campaign exporter is a different, additive feature.

### [2026-06-22] No global command palette / quick-action launcher (Ctrl+K) for the ~92 modals and actions
### [2026-06-22] No in-app way to locate, open, or export the app log for bug reports

- **Category:** future-idea, UX
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** dnd-app tree review (renderer UX/navigation survey)

**Description:**
There are ~92 modal components under `components/game/modals/` plus many overlays, DM tools, and a `ShortcutReferenceModal`, but no fuzzy command-palette / quick-action launcher (no `cmdk`, no `palette`/`action launcher`/`quick-switch` handler anywhere in the renderer). Reaching a given tool means knowing its menu/toolbar location or its specific hotkey. A single Ctrl/Cmd-K palette that fuzzy-searches "open X modal / run Y action / jump to Z" would cut navigation depth dramatically for both DMs and players and would pair naturally with the existing keybinding system (`use-accessibility-store` already models `customKeybindings`).

**Proposed fix / improvement:**
- [ ] Add a palette component (own modal) registered on a global Ctrl/Cmd-K, listing actions sourced from the same registry that drives the existing shortcut/keybinding map so the two stay in sync.
- [ ] Seed it with "open modal" entries (derive from the modal-group registries) plus high-frequency actions (roll, end turn, open compendium, search library).
- [ ] Respect `customKeybindings` and screen-reader mode; ensure full keyboard operability and focus return on close.

**Related files:** `src/renderer/src/components/game/modals/utility/ShortcutReferenceModal.tsx`, `src/renderer/src/components/game/modal-groups/*`, `src/renderer/src/stores/use-accessibility-store.ts`

### [2026-06-22] No first-run guided onboarding / tour for new users (only targeted Ollama + screen-reader prompts)

- **Category:** future-idea, UX
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** dnd-app tree review (first-run / onboarding survey)

**Description:**
First-run UX is limited to two narrow, single-purpose prompts wired into `App.tsx`: `OllamaFirstRunPrompt` (local-LLM setup) and `ScreenReaderPrompt` (a11y mode). There is no general guided tour or "getting started" flow introducing the core loop (create/import a character → create or join a campaign → the game-table layout, dice, map, hotbar). A new user lands in a feature-dense Electron VTT with no orientation. Grep finds no `onboarding` / `tutorial` / `walkthrough` / `hasSeenWelcome` flag.

**Proposed fix / improvement:**
- [ ] Add a dismissible, resumable first-run tour (persist a `hasCompletedOnboarding` flag alongside the other a11y/settings keys) that highlights the 4-5 primary entry points.
- [ ] Make it re-launchable from Settings/Help so it is not a one-shot, and skippable in one click for returning users.
- [ ] Honor `reducedMotion` (no auto-advancing animated spotlights when set) and keep every step keyboard-navigable.

**Related files:** `src/renderer/src/App.tsx`, `src/renderer/src/components/ui/OllamaFirstRunPrompt.tsx`, `src/renderer/src/components/ui/ScreenReaderPrompt.tsx`, `src/renderer/src/stores/use-accessibility-store.ts`
- **During:** dnd-app tree review (main-process logging + crash handling)

**Description:**
`src/main/log.ts` writes a rotating log to `userData/logs/app.log` (5 MB × 3), and the fatal-error handler in `src/main/index.ts` (`handleFatal`) shows a `dialog.showErrorBox` that says only "A crash log was written" — with no path and no button (`showErrorBox` supports title + message only). A by-name grep across `src/` finds **zero** uses of `shell.openPath` / `shell.showItemInFolder`, and `SettingsPage.tsx` has no logs section, so there is no affordance anywhere — neither in the crash dialog nor in Settings — for a user to find, open, or export the log file. When a non-technical user hits a crash or a weird bug, they cannot produce the one artifact that would let a maintainer diagnose it without knowing the per-OS `userData` path by heart.

**Proposed fix / improvement:**
- [ ] Add an IPC (e.g. `LOG_OPEN_FOLDER`) that calls `shell.showItemInFolder(logPath)` / `shell.openPath(getLogDir())`, surfaced as an "Open log folder" button in a Settings > Diagnostics/About section.
- [ ] Optionally add "Export logs" (zip `app.log*` to a user-chosen path) for easy bug-report attachment.
- [ ] Include the resolved log path text in the fatal `showErrorBox` message so a crashed user at least knows where to look.

**Related files:** `src/main/log.ts`, `src/main/index.ts`, `src/renderer/src/pages/SettingsPage.tsx`, `src/shared/ipc-channels.ts`

### [2026-06-22] macOS target is configured but never built or shipped (no `macos-latest` in the release matrix)

- **Category:** portability, future-idea
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** dnd-app tree review (release workflow vs package.json build config)

**Description:**
`package.json` defines a full mac build path (`build:mac`, `release:mac`, and a `build.mac` electron-builder block producing DMG + ZIP) and the README documents macOS as a supported-in-principle target, but `.github/workflows/release.yml`'s build matrix is only `windows-latest` + `ubuntu-latest` — zero `macos`/`dmg` references in the workflow. So the mac config is dormant: it is never exercised in CI and no macOS artifact is ever published. The result is config that can silently rot (electron-builder mac options drift untested) and a documented platform users cannot actually download. electron-builder cannot produce signed/notarized mac artifacts off a non-mac runner, so closing this needs a `macos-latest` matrix leg, not just a flag.

**Proposed fix / improvement:**
- [ ] Add a `macos-latest` leg to the `build` matrix in `release.yml` (even unsigned, to start) so the mac config is at least built and smoke-tested each release.
- [ ] Decide on signing/notarization (Developer ID + notarytool) before publishing mac artifacts, or clearly mark mac builds as unsigned in the release notes.
- [ ] If macOS support is deferred indefinitely, note that explicitly next to the `build.mac` config so contributors know it is intentionally dormant.

**Related files:** `.github/workflows/release.yml`, `dnd-app/package.json`, `dnd-app/README.md`

### [2026-06-22] `SettingsPage.tsx` is a ~1,950-LOC god component — split into per-section panels

- **Category:** debt, future-idea
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** dnd-app tree review (largest hand-written source files)

**Description:**
`src/renderer/src/pages/SettingsPage.tsx` is 1,946 LOC — the single largest hand-authored source file in the app (excluding the generated `i18n/generated-keys.ts`). It bundles every settings domain into one component: accessibility, theme, keybindings, grid, dice, audio, auto-update prefs, and the export/import logic (see the separate export-prefs entry below). A file this size is hard to review, easy to merge-conflict on (every settings tweak touches the same file), and obscures which state each section owns. The app already presents a per-section UI; extracting each section into its own `settings/<Section>Panel.tsx` (driven by a small tab registry) would shrink the parent to a router shell and make each panel independently testable.

**Proposed fix / improvement:**
- [ ] Extract each settings section into `pages/settings/<Section>Panel.tsx`, leaving `SettingsPage.tsx` as a tab host.
- [ ] Co-locate each panel's local state/handlers with its panel; share only cross-cutting state via the existing stores.
- [ ] Add focused unit tests per panel (a 1,946-LOC component is effectively untestable in isolation today).

**Related files:** `src/renderer/src/pages/SettingsPage.tsx`

### [2026-06-22] Pin one Node version for the whole monorepo (.nvmrc / engines) instead of repeating `node-version: 22`

- **Category:** portability
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting repo-wide scan

**Description:**
`node-version: 22` is hardcoded in 7 places across 5 workflows (`dnd-app-ci`, `security-audit`, `dnd-app-validate-5e`, `release` ×3, `deploy`). There is no root `.nvmrc`, no `engines.node` field in any package.json (`dnd-app` / `dungeon-scholar` / `oracle-worker`), and no Volta pin. Local contributors can build on any Node, and bumping the toolchain means hand-editing every workflow.

**Proposed fix / improvement:**
- [ ] Add a root `.nvmrc` (e.g. `22`).
- [ ] Add a matching `engines.node` to each project package.json.
- [ ] Switch workflows to `node-version-file: .nvmrc` so the version lives in one place.

**Related files:** `.github/workflows/*.yml`, `dnd-app/package.json`, `dungeon-scholar/package.json`, `oracle-worker/package.json`

### [2026-06-22] No PR-time CI gate for dungeon-scholar or oracle-worker

- **Category:** future-idea
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting repo-wide scan

**Description:**
`dnd-app` has a dedicated CI gate (lint + forbidden-patterns + tsc + tests + build smoke + circular + audit). `dungeon-scholar` runs `npm run test` ONLY as a precondition of the Pages deploy (`deploy.yml`, push to main) — there is no `pull_request`-triggered test/build gate, so a PR merges green and only fails later at deploy time. `oracle-worker` has a `test` script but zero workflows reference it, so its tests never run in CI.

**Proposed fix / improvement:**
- [ ] Add `dungeon-scholar-ci.yml` (path-filtered test + build on push + PR).
- [ ] Add `oracle-worker-ci.yml` (npm ci + test).
- [ ] Optionally factor the shared setup-node / npm-ci steps into a composite action reused by all JS-project workflows.

**Related files:** `.github/workflows/deploy.yml`, `dungeon-scholar/package.json`, `oracle-worker/package.json`

### [2026-06-22] Local pre-commit hook gates only dnd-app; `.githooks/` dir is now orphaned

- **Category:** future-idea
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting repo-wide scan

**Description:**
`.husky/pre-commit` does `cd dnd-app` then runs biome + tsc on that project only. Commits touching `dungeon-scholar`, `oracle-worker`, or repo-root tooling get no local lint/typecheck/test pre-flight (dungeon-scholar`s first gate is the deploy workflow; oracle-worker has none). Separately, `.githooks/pre-commit` is now redundant — its gitleaks shim was folded into `.husky/` per that hook`s own comment, yet the old dir remains and can confuse anyone setting `core.hooksPath`.

**Proposed fix / improvement:**
- [ ] Make the hook detect which project(s) have staged changes and run each one`s lint/typecheck (at minimum add dungeon-scholar test/build).
- [ ] Delete the orphaned `.githooks/` directory once `.husky` is confirmed authoritative.

**Related entries:** `ISSUES-LOG-DNDAPP.md` [2026-06-16] pre-commit `--staged` no-op (distinct dnd-app-only bug).
**Related files:** `.husky/pre-commit`, `.githooks/pre-commit`

### [2026-06-22] Four hand-maintained agent-instruction files will drift (AGENTS / CLAUDE / GEMINI / copilot)

- **Category:** future-idea
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting repo-wide scan

**Description:**
The repo carries four overlapping AI-assistant guides — `AGENTS.md` (12.8K), `CLAUDE.md` (11.3K), `GEMINI.md` (5.2K), `.github/copilot-instructions.md` (4.6K) — each maintained by hand. They cover much of the same ground (repo layout, conventions, logging rules) and will drift out of sync as the repo evolves.

**Proposed fix / improvement:**
- [ ] Designate one canonical source (e.g. `AGENTS.md`); generate or symlink the others from it, or add a sync check that flags when shared sections diverge.
- [ ] At minimum, have each file link to the canonical one for shared sections instead of duplicating them.

**Related files:** `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`

> **2026-06-10 — Backlog consolidated.** All previously-open entries (incl. the
> still-open residuals of the 2026-05-18 phase-plan absorption: Phase 33a backup
> migration framework, 33c ModalScaffold, 33d bundle-size CI guard — and the
> Phase 15 library-invariant observation) became the numbered phase plans under [`../dnd-app/docs/phases/`](../dnd-app/docs/phases/) (start at [`PHASE-INDEX.md`](../dnd-app/docs/phases/PHASE-INDEX.md)); the consolidating audit was deleted once the phase set was authored (2026-06-11). Add new
> dnd-app ideas below as they appear.

### Add a CI gate enforcing en/es locale key parity (check-keys.mjs validates en.json only)

**Category:** future-idea · **Severity:** low · **Domain:** dnd-app · **Discovered by:** dnd-suggestor · **Added:** 2026-06-22

`scripts/i18n/check-keys.mjs` flattens `en.json` and fails when a renderer `t('literal')` call references a key missing from **en.json** — but nothing validates that `es.json` carries the same key set. Today parity is perfect (both locales flatten to 6411 leaf keys, zero diff either direction), so the gap is latent: a contributor who adds an `en` key and forgets the matching `es` key gets no CI failure — `es` users silently fall back to the en string (or the raw key if i18next fallback is disabled). Proposal: extend `check-keys.mjs` (or add `scripts/i18n/check-locale-parity.mjs` wired into `check:full` / `check:release`) to diff every non-source locale's flattened key set against `en.json` and exit non-zero on any missing/extra key. Cheap insurance that scales as more locales are added. Related: `scripts/i18n/gen-key-union.mjs`, `src/renderer/src/i18n/locales/{en,es}.json`.

### Surface release notes / "What's New" on update (auto-updater discards `releaseNotes`)

**Category:** future-idea, UX · **Severity:** low · **Domain:** dnd-app · **Discovered by:** dnd-suggestor · **Added:** 2026-06-22

`src/main/updater.ts`'s `UpdateStatus` union carries only `version` for the `available` / `downloaded` states; electron-updater's `UpdateInfo.releaseNotes` is never read or forwarded to the renderer, and nothing under `src/renderer` renders `CHANGELOG.md`. So when the dismissible update prompt appears (auto-check defaults ON), the user sees a bare version number with no indication of what changed. Proposal: thread `releaseNotes` through `UpdateStatus` / the `UPDATE_STATUS` IPC and show a short "What's New" panel in the update prompt (and/or a one-time post-install changelog view sourced from `CHANGELOG.md` or the GitHub release body). Improves the upgrade decision and cuts "what did this update actually do?" friction. Related: `src/main/updater.ts`, `src/shared/ipc-channels.ts`, `CHANGELOG.md`.

### Settings export/import covers localStorage only — main-process `settings.json` (auto-update prefs) does not travel

**Category:** future-idea, portability · **Severity:** low · **Domain:** dnd-app · **Discovered by:** dnd-suggestor · **Added:** 2026-06-22

`SettingsPage.tsx`'s Export Settings (~L1753) iterates `localStorage` and dumps every key into the export JSON; Import writes them back. That captures a11y, theme, keybindings, grid, dice, audio, etc. — but the auto-update preferences (`autoCheckUpdates`, `autoDownloadUpdates`, `autoRestartAfterUpdate`, `autoInstallSilent`) live in the **main process** at `userData/settings.json` (see `updater.ts > loadAutoUpdatePrefs`), so they are silently excluded. A user exporting settings to migrate to a new machine loses those four prefs with no warning. Proposal: add an IPC round-trip so export pulls `settings.json` (merged under a namespaced key) and import writes it back through the main process — or, at minimum, note in the export UI that update prefs are machine-local. Low severity (only 4 prefs, easily re-set), but it makes "Export Settings" quietly incomplete. Related: `src/renderer/src/pages/SettingsPage.tsx`, `src/main/updater.ts`.


### Slim the narration prompt's tag instructions once structured extraction is the default (PHASE-23 follow-up)

**Type:** future-idea · **Domain:** dnd-app · **Added:** 2026-06-16

PHASE-23 added opt-in two-call structured extraction (`aiDm.structuredExtraction`), but
the narration prompt keeps its `[STAT_CHANGES]`/`[DM_ACTIONS]` instructions in ALL modes
(forking the system prompt by config + regressing DM board actions, which extraction
doesn't cover, was not worth it now). Once `structuredExtraction: 'always'` is the
default AND `getRepairJsonStats().modified` stays at zero across releases, removing the
tag-emission instructions from `prompt-sections/*` + retiring `repairJson` becomes
worthwhile (retirement criteria live in `src/main/ai/AI_ACTION_CONTRACT.md`). Depends on
PHASE-27 extending the extraction verb set to cover board actions first.

*(none active)*

---

# Design gotchas (warnings for future agents)

*(Design gotchas + standing observations are now documented in [`dnd-app/docs/DESIGN-CONSTRAINTS.md`](../dnd-app/docs/DESIGN-CONSTRAINTS.md) — per the routing rule in [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md). This section is kept only as a pointer.)*

---

# Info / Observations

### [2026-06-22] Stale one-off data-pipeline scripts (~6,000 LOC) linger in `scripts/{extract,generate,fix,batch-utils,codemods}` with no callers

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** automated cleanup/reorg scan of `dnd-app/`

**Description:**
The 5e content set is fully built and shipped (3,033 JSON files under `src/renderer/public/data/5e/`), but the one-time pipeline that produced it still sits in the tree as live source:

- `scripts/extract/` — 17 files, ~3,195 LOC (`extract-5e-data`, `extract-monsters`, `extract-weapons`, `extract-subclasses-to-batch`, …)
- `scripts/generate/` — 9 files, ~1,425 LOC (incl. clearly historical `generate-phase4-batch`, `generate-phase5-batch`, `generate-mass-batch`, `generate-mega-batch`)
- `scripts/fix/` — 4 files, ~813 LOC (`fix-data-placements`, `fix-monster-enums`, `phase4-discovery`, `reorganize-data`)
- `scripts/batch-utils/` — 8 files, ~616 LOC (`monitor-phase4-batch`, `resume-batch`, `retry-failed`, `check-batch`, …)
- `scripts/codemods/` — `form-aria-label.mjs`, `semantic-tokens.mjs`

A by-name grep across the whole repo shows ZERO references to any of these from app code, `package.json` scripts, or `.github/workflows/` — the only inbound mentions are the few cross-references *between* the batch scripts themselves and one historical doc line (`docs/DATA-FLOW.md:27` cites `scripts/extract/`). They were last meaningfully touched 2026-04-23/24 (only moved since, in the monorepo reorg). `knip` cannot flag them because `knip.json` globs `scripts/**/*.ts` + `scripts/**/*.mjs` as entry points, so the whole pile is invisible to `npm run dead-code` and accumulates silently.

**Hypothesis / root cause:** one-time extraction/migration/QA-batch tooling that was never archived after the data set stabilized; the broad knip `entry` glob hides it from dead-code detection.

**Proposed fix / improvement:**
- [ ] Confirm with the maintainer that the 5e data set is frozen (no planned re-extraction), then move these dirs under a clearly-labeled `scripts/_oneoff/` (or `_archive/`) — or delete them, since git history preserves them.
- [ ] If kept for reproducibility, add a `scripts/README.md` separating "active" (wired to npm/CI) from "historical pipeline" scripts so contributors don't mistake them for live tooling.
- [ ] Narrow the `knip.json` `scripts/**` entry glob to the scripts actually invoked, so future one-off scripts surface as unused.

**Related files:** `scripts/extract/`, `scripts/generate/`, `scripts/fix/`, `scripts/batch-utils/`, `scripts/codemods/`, `knip.json`, `docs/DATA-FLOW.md`

---

### [2026-06-22] Five overlapping `scripts/audit/*` data-audit scripts (~3,100 LOC) — accreted duplication, none wired into npm/CI

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** automated cleanup/reorg scan of `dnd-app/`

**Description:**
`scripts/audit/` contains five scripts that all do essentially the same job — walk the 5e source markdown (PHB/DMG/MM), cross-reference the extracted JSON, validate schemas, and flag missing/duplicate/truncated entries — distinguished mostly by escalating names rather than scope:

- `comprehensive-audit.ts` (923 LOC) — "COMPREHENSIVE D&D 5.5e DATA AUDIT"
- `ultimate-audit.ts` (732 LOC) — "ULTIMATE D&D 5.5e DATA AUDIT"
- `data-audit.ts` (608 LOC) — "Phase 6 — Comprehensive Data Audit v2"
- `deep-verify.ts` (525 LOC) — "DEEP DATA VERIFICATION"
- `data-audit-full.ts` (336 LOC) — "Comprehensive D&D 5.5e Data Audit"

Only `ultimate-audit.ts` is referenced anywhere (one line in `docs/DATA-FLOW.md`); the npm `validate:5e` / `validate:content` scripts use the *separate* `check-5e-cross-refs.mjs` and `validate-content-vs-schemas.ts`, so none of these five run in CI or via any npm script. The naming pattern ("v2", "full", "comprehensive", "deep", "ultimate") is a classic sign of an audit that kept getting rewritten from scratch instead of refactored, leaving every prior version behind.

**Hypothesis / root cause:** iterative re-authoring of the data-QA audit during the extraction phase; old versions never removed once the next "definitive" one landed.

**Proposed fix / improvement:**
- [ ] Pick one canonical audit (likely `ultimate-audit.ts`, the doc-referenced one), verify it subsumes the others, and delete the remaining four.
- [ ] If the canonical audit is worth keeping, wire it into an npm script (e.g. `audit:data`) so it doesn't rot.
- [ ] Update `docs/DATA-FLOW.md` if the kept script's name changes.

**Related files:** `scripts/audit/comprehensive-audit.ts`, `scripts/audit/ultimate-audit.ts`, `scripts/audit/data-audit.ts`, `scripts/audit/deep-verify.ts`, `scripts/audit/data-audit-full.ts`, `docs/DATA-FLOW.md`

---

### [2026-06-22] `tools/` holds 7 unreferenced one-off maintenance/codemod scripts (~1,830 LOC, incl. a 1,096-LOC `run-audit.js`)

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** automated cleanup/reorg scan of `dnd-app/`

**Description:**
The top-level `dnd-app/tools/` directory contains seven JS scripts, none of which are referenced by `package.json`, CI workflows, or app code (by-name grep returns zero inbound references; the sole mention is one historical phase doc citing `replace-console-logs.js`):

- `run-audit.js` (1,096 LOC), `replace-console-logs.js` (225), `rename-to-kebab.js` (194), `electron-security.js` (248), `find-data.js` (28), `find-unused-imports.js` (17), `knip-summary.js` (23)

These read as one-off codemods / migration helpers (kebab-case rename, console.log replacement) and ad-hoc audit tooling that overlap with the now-standard tooling actually wired into npm (`biome`, `knip`, the `scripts/audit/` + `scripts/lint/` scripts). `tools/` also duplicates the role of `scripts/` with no documented distinction between the two directories, which is itself a structural smell. `electron-security.js` is worth a closer look before deletion — confirm it isn't a stale copy of security settings now enforced in `src/main/`.

**Hypothesis / root cause:** ad-hoc tooling dropped into a second top-level scripts directory during earlier refactors; never cleaned up or folded into `scripts/`.

**Proposed fix / improvement:**
- [ ] Confirm each `tools/*` script is superseded (knip/biome cover the lint/dead-code ones; the codemods already ran), then delete or move the survivors under `scripts/maintenance/`.
- [ ] Collapse `tools/` into `scripts/` (or document why both exist) so contributors have one place to look for repo tooling.

**Related files:** `tools/run-audit.js`, `tools/replace-console-logs.js`, `tools/rename-to-kebab.js`, `tools/electron-security.js`, `tools/find-data.js`, `tools/find-unused-imports.js`, `tools/knip-summary.js`


### [2026-06-22] Tests writing through a Windows-style mocked `app.getPath` create a stray `C:/` directory in the repo working tree

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** automated cleanup/reorg scan of `dnd-app/`

**Description:**
A literal directory named `C:` exists at `dnd-app/C:/tmp/logs/app.log` (~3.2 KB, last written 2026-06-09) — a leftover test artifact, not real source. `src/main/log.ts` builds its log path via `join(app.getPath('userData'), 'logs', 'app.log')`. Two main-process tests mock `app.getPath` to the Windows-style string `'C:/tmp'` (`src/main/ai/ai-service-web-search-approval.test.ts`, `src/main/ai/ai-service-file-read-cancel.test.ts`). On Linux, `join('C:/tmp', 'logs', 'app.log')` is treated as RELATIVE, so any log write during those tests materializes `./C:/tmp/logs/app.log` under the `dnd-app/` cwd. `C:` is NOT gitignored, so it appears as an untracked path and risks accidental commit. (`ai-handlers.test.ts:57` already notes that `'C:/tmp'` is relative on Linux.)

**Hypothesis / root cause:** test mock returns a path that is absolute on Windows but relative on POSIX; the file-logging side effect isn't redirected to a temp dir.

**Proposed fix / improvement:**
- [ ] Delete the stray `dnd-app/C:/` directory.
- [ ] Add `C:/` to `dnd-app/.gitignore` as a guard against re-committing the artifact.
- [ ] Mock `app.getPath` to an `os.tmpdir()`-based path (or stub the file logger) so test FS writes never leak into the repo.

**Related files:** `src/main/log.ts`, `src/main/ai/ai-service-web-search-approval.test.ts`, `src/main/ai/ai-service-file-read-cancel.test.ts`, `dnd-app/.gitignore`

---

### [2026-06-22] Dead code: 9 unused exports/types flagged by knip (0 external references confirmed)

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** automated cleanup/reorg scan of `dnd-app/` (`npx knip`)

**Description:**
`npm run dead-code` (knip) reports the following exports as unused; each was re-verified with a repo-wide grep (including `*.test.ts(x)`) and has ZERO external references:

Functions:
- `getLocalEndpointFlavor` — `src/main/ai/ollama-client.ts:26`
- `getConfiguredContextLength` — `src/main/ai/ollama-context.ts:106`
- `estimateRecapPromptTokens` — `src/main/ai/recap-context.ts:68`
- `stopAllRegistryPollers` — `src/main/registry-bridge.ts:290`
- `routeSoloMessageToAiDm` — `src/renderer/src/services/ai-dm-routing.ts:192`
- `hasWizardDraft` — `src/renderer/src/services/campaign-wizard-draft.ts:43`

Exported types:
- `WorldExit`, `NpcOpinion`, `WorldFact` — `src/main/ai/world-state-store.ts:60/62/64`
- `AiProviderId` — `src/shared/ai-defaults.ts:16`

Each should be removed (if truly dead) or down-scoped to a non-exported local / wired into its intended caller. A couple (`routeSoloMessageToAiDm`, `stopAllRegistryPollers`) read like partially-wired features worth a check before deletion. `check:full` runs `dead-code` but does not fail on findings, so these accumulate silently.

**Proposed fix / improvement:**
- [ ] For each symbol, confirm it isn't reserved for an in-flight feature, then delete or un-export.
- [ ] Consider making `npm run dead-code` fail CI on new findings once the backlog is clear.

**Related files:** `src/main/ai/ollama-client.ts`, `src/main/ai/ollama-context.ts`, `src/main/ai/recap-context.ts`, `src/main/registry-bridge.ts`, `src/renderer/src/services/ai-dm-routing.ts`, `src/renderer/src/services/campaign-wizard-draft.ts`, `src/main/ai/world-state-store.ts`, `src/shared/ai-defaults.ts`

---

---

> BMO suggestions: [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md). dnd-app bugs: [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md). Security: [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). Resolved dnd-app: [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md).
