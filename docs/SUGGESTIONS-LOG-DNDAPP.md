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

### CSP "blocks the use of eval" DevTools Issue on map load is a harmless Pixi probe — do NOT add `'unsafe-eval'`

**Type:** design-gotcha · **Domain:** dnd-app · **Added:** 2026-06-20

The prod CSP (`src/main/index.ts`) sets `script-src 'self' plugin:` with no `'unsafe-eval'` (dev adds it; prod doesn't). On first map render PixiJS v8 runs a feature-detection probe (`unsafeEvalSupported()` in `pixi.js/lib/utils/browser/unsafeEval`) that calls `eval`, which CSP blocks — surfacing one DevTools → Issues entry in prod builds. This is expected and harmless: Pixi detects the block and falls back to its eval-free path (`pixi.js/unsafe-eval`), and the map renders fine. **Do not "fix" it by adding `'unsafe-eval'` to the prod `script-src`** — that materially weakens CSP for zero functional gain. *(QA-2026-06-19 task 16: confirmed working, no code change.)*

### Manual fog has no "disable" affordance — once "Hide All" / fog-hide enables fog, only revealing every cell hides it again

**Type:** design-gotcha · **Domain:** dnd-app · **Added:** 2026-06-20

QA-2026-06-19 task 8 fixed manual fog by flipping `fogOfWar.enabled = true` inside the `hideFog` action (the chokepoint for "Hide All" + the fog-hide brush) — new maps default to `enabled: false` and `drawFogOfWar` bails when disabled. Follow-up: there is no symmetric "Disable Fog" control. `Reveal All` reveals every cell but does NOT set `enabled = false`, so once fog is on the only way to fully clear it is to reveal the whole grid. Consider a Fog-tab toggle that surfaces/clears `fogOfWar.enabled`.

*(none other active)*

---

# Info / Observations

### `/calendar` route (real-world session-scheduling calendar) is orphaned — no main-menu entry or in-app navigation

**Type:** observation · **Domain:** dnd-app · **Added:** 2026-06-20

`CalendarPage` (route `/calendar`) is a real-world session scheduler distinct from the in-game fantasy calendar (which lives in the campaign wizard + in-game DM modal). Nothing in the app navigates to `/calendar` and the main menu has no Calendar item, so it is reachable only by typing the URL. Wiring it into the menu is a product decision (the page has no obvious backend scheduling wiring), so it was left as-is and the QA spec (`dnd-app/docs/phases/QA/instructions.md` §4.1/§4.3b) was reconciled to note the orphaned state. *(QA-2026-06-19 task 18.)*

*(none active)*

---

> BMO suggestions: [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md). dnd-app bugs: [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md). Security: [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). Resolved dnd-app: [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md).
