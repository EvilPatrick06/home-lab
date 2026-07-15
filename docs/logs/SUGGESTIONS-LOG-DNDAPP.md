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


> **2026-07-02 (dnd-resolver) — status check on the 2026-06-24 approved backlog.**
> Two of the ten approved items are now DONE: the **settings.json main-process-prefs
> export** is implemented on master (`services/io/import-export.ts` exports
> `appSettings` via `window.api.loadSettings()` at gather time and restores it via
> `saveSettings` on import — verified this run), and the **a11y (jest-axe) guard**
> seed shipped separately (see RESOLVED-ISSUES-DNDAPP; its real-component coverage
> expansion is a separate gated board item). The remaining eight (MapSelector /
> ChatPanel / NPCManager renames, `.dndvtt` open-file handler, Report-a-bug path,
> Settings search, `src/main/ai` reorg, `ai-service.ts` decompose, helper-suffix
> rename, e2e Playwright harness) are still approved-and-open; they need a dedicated
> focused run (large refactors / interactive UI verification) rather than sharing a
> resolver pass's branch with small verified fixes.

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

### [2026-07-15] `docs/README.md` reference-doc index omits `TARGET-PARITY.md` (added 2026-07-03) — the index has no drift guard

- **Category:** docs
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** scheduled cleanup/structure scan of `dnd-app/`

**Description:**
`dnd-app/docs/README.md` ("reference-doc index") maps every top-level doc under `dnd-app/docs/` to topic + living-spec/historical status — but it lists only 10 of the 11 docs. `TARGET-PARITY.md` (the desktop/web/embed/mobile per-feature capability matrix, added 2026-07-03 per RESOLVED-ISSUES-DNDAPP) is missing: it is linked from `README.md:234` and `docs/WEB-VERSION-PLAN.md:7`, but a reader starting from the docs index never discovers it. This is exactly the drift the index was created to prevent (2026-06-29 entry), and it happened within a day of the index being written because nothing enforces index completeness.

**Hypothesis / root cause:** `TARGET-PARITY.md` landed in the dnd-features-batch run of 2026-07-03; that run updated `README.md` and `WEB-VERSION-PLAN.md` cross-links but not the doc index, and no check compares `ls dnd-app/docs/*.md` against the index rows.

**Proposed fix / improvement:**
- [ ] Add a `TARGET-PARITY.md` row to the index table (Topic: per-feature desktop/web/embed/mobile capability matrix; Status: Living spec — update when a shim gains/loses a method).
- [ ] Optional drift guard: extend `src/renderer/src/test/codebase-integrity.test.ts` (or `scripts/build/sync-doc-counts.mjs --check`) to assert every `dnd-app/docs/*.md` (excluding README itself) has a row in the index.

**Related files:** `dnd-app/docs/README.md`, `dnd-app/docs/TARGET-PARITY.md`

**Related entries:** [2026-06-29] `dnd-app/docs/` has 10 reference docs but no `docs/README.md` index (resolved — the index this entry patches)

### [2026-07-15] `stores/` mixes three slice-dir naming layouts (`bastion-store/`+shim vs `network-store/` no-shim vs plain `game/`/`builder/`/`level-up/`) and `components/levelup` drops the hyphen `stores/level-up` uses

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** scheduled cleanup/structure scan of `dnd-app/`

**Description:**
`src/renderer/src/stores/` has grown three coexisting conventions for slice-based stores: (1) `bastion-store/` — dir carries a `-store` suffix AND keeps a thin root shim `use-bastion-store.ts` re-exporting it to preserve import paths; (2) `network-store/` — dir carries the suffix but has NO shim, and its extra test `use-network-store.test.ts` sits at `stores/` root named after a source file that does not exist (it imports `./network-store`, whose own `index.test.ts` + `index.cloud.test.ts` already live inside the dir — so this one test breaks the otherwise-universal "test beside the file it tests" rule); (3) `game/`, `builder/`, `level-up/` — no suffix, no shim, consumers import the dir directly. Separately, the level-up feature is spelled two ways across sibling trees: `components/levelup/` (no hyphen) vs `stores/level-up/` (hyphen) — the only compound-word component dir, so grep for one spelling misses the other. None of this is broken; it is naming drift from three refactor generations that makes the store layout harder to learn than it needs to be.

**Hypothesis / root cause:** each slice-extraction refactor picked its own convention: bastion kept a compatibility shim, network dropped the shim but kept the suffix (and left its pre-split root test file behind), and the later game/builder/level-up splits dropped both.

**Proposed fix / improvement:**
- [ ] Pick one convention (suggest: plain dir name, no `-store` suffix, no shim — the majority pattern) and rename `bastion-store/` → `bastion/`, `network-store/` → `network/` with import updates; delete `use-bastion-store.ts` once imports are migrated (it is a pure re-export).
- [ ] Fold `use-network-store.test.ts` into `network-store/` (e.g. as `index.session.test.ts` or merged into `index.test.ts`) so the test sits beside its subject.
- [ ] Rename `components/levelup/` → `components/level-up/` to match `stores/level-up/` and `use-level-up-store.ts`.
- [ ] NOTE: do NOT extend this to the `shared/types` ↔ `renderer/types` re-export shims — those duplicates are an intentional process-boundary split (see 2026-06-25 design-gotcha).

**Related files:** `src/renderer/src/stores/bastion-store/`, `src/renderer/src/stores/use-bastion-store.ts`, `src/renderer/src/stores/network-store/`, `src/renderer/src/stores/use-network-store.test.ts`, `src/renderer/src/stores/game/`, `src/renderer/src/stores/builder/`, `src/renderer/src/stores/level-up/`, `src/renderer/src/components/levelup/`

**Related entries:** [2026-06-25] DO NOT "dedupe" the `shared/types/*` <-> `renderer/src/types/*` re-export shims; the approved-but-open "helper-suffix rename" backlog item (different files, same naming-consistency family)

### [2026-07-15] No state-management reference doc — 20+ flat Zustand stores + 5 slice dirs + a store registry (`register-stores.ts` / `store-accessors.ts`) are undocumented as an architecture

- **Category:** docs
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** scheduled cleanup/structure scan of `dnd-app/`

**Description:**
`src/renderer/src/stores/` is the app's single biggest architectural surface — ~20 flat `use-*-store.ts` Zustand stores, five slice-composed store dirs (`game/` alone has 24 slices), a registration layer (`register-stores.ts`) and a cross-store access indirection (`store-accessors.ts`), plus persistence via `utils/storage-migrations.ts` — yet no doc under `dnd-app/docs/` describes any of it. The docs index covers IPC, UI z-layers, plugins, seed packs, etc., but a contributor (or agent) touching state has to reverse-engineer: when to make a new store vs a slice, how slices compose into a store dir, why `store-accessors.ts` exists (presumably to avoid circular imports between stores), which stores persist and how their schemas migrate, and what the re-export-shim convention is (`use-bastion-store.ts`, `chat-commands.ts`). The naming-drift entry logged today is a direct symptom of this being tribal knowledge.

**Hypothesis / root cause:** the store layer grew store-by-store across phases (PHASE-27 world-state store, etc.) and each phase doc described only its own store; no consolidated living spec was ever extracted.

**Proposed fix / improvement:**
- [ ] Add `dnd-app/docs/STATE-MANAGEMENT.md` (living spec, ~1 page + tables): store inventory (name → domain → persisted?), the slice-dir pattern and when to use it, `register-stores.ts` / `store-accessors.ts` contract (incl. the circular-import rule it enforces), persistence + migration flow, and the thin re-export-shim convention.
- [ ] Add its row to `docs/README.md` index.

**Related files:** `src/renderer/src/stores/register-stores.ts`, `src/renderer/src/stores/store-accessors.ts`, `src/renderer/src/utils/storage-migrations.ts`, `dnd-app/docs/README.md`

**Related entries:** [2026-07-15] `stores/` mixes three slice-dir naming layouts (today, same scan)


### [2026-07-02] `PLUGIN-SYSTEM.md` release checklist points to nonexistent `dnd-app/docs/DATA-FLOW.md` — the real file lives at repo-root `docs/DATA-FLOW.md`

- **Category:** docs
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** scheduled cleanup/structure scan of `dnd-app/`

**Description:**
`dnd-app/docs/PLUGIN-SYSTEM.md` step 11 of its "adding a capability" checklist says: *"Update docs: this file + `dnd-app/docs/DATA-FLOW.md`"* — but no `DATA-FLOW.md` exists anywhere under `dnd-app/` (`find dnd-app -name "DATA-FLOW*"` returns nothing). The actual file is the repo-root [`docs/DATA-FLOW.md`](../DATA-FLOW.md). `dnd-app/docs/phases/QA/INSTRUCTIONS.md:38` has the same reference written as `docs/ARCHITECTURE.md`, `docs/DATA-FLOW.md` — which resolves correctly only if the reader assumes repo-root, not the QA file's own directory. An agent following the PLUGIN-SYSTEM checklist literally would conclude the doc was deleted (or create a duplicate at the wrong path).

**Hypothesis / root cause:** `DATA-FLOW.md` either always lived at repo-root `docs/` or was moved there, and the two dnd-app references were never updated to the cross-project relative path.

**Proposed fix / improvement:**
- [ ] `PLUGIN-SYSTEM.md:133` — change to a real relative link: `../../docs/DATA-FLOW.md` (repo-root docs).
- [ ] `docs/phases/QA/INSTRUCTIONS.md:38` — disambiguate the same two paths (`/docs/ARCHITECTURE.md`, `/docs/DATA-FLOW.md` repo-root, or proper relative links).
- [ ] Optional: when the planned `dnd-app/docs/README.md` index (2026-06-29 entry) is written, list which referenced docs live at repo root vs `dnd-app/docs/` so future refs use the right base.

**Related files:** `dnd-app/docs/PLUGIN-SYSTEM.md`, `dnd-app/docs/phases/QA/INSTRUCTIONS.md`, `docs/DATA-FLOW.md`

**Related entries:** [2026-06-29] `dnd-app/docs/` has 10 reference docs but no `docs/README.md` index

### [2026-07-02] `scripts/audit/validate-homebrew.ts` is wired to nothing and its own usage text cites a nonexistent npm script + wrong path

- **Category:** debt, docs
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** scheduled cleanup/structure scan of `dnd-app/`

**Description:**
`scripts/audit/validate-homebrew.ts` (homebrew-content schema validator) is referenced by no `package.json` script, no CI workflow, no Makefile target, and no doc — a repo-wide grep for `validate-homebrew` finds only the file itself. Worse, its usage help is doubly wrong: it prints `Usage: npm run validate-homebrew <file-path>` (no such npm script exists) and `Or: node scripts/validate-homebrew.ts <file-path>` (wrong directory — the file is under `scripts/audit/` — and plain `node` cannot execute `.ts`; the repo pattern for TS scripts is `tsx`, cf. `validate:content`). So the only discoverable instructions for running it both fail. This is the same "audit script drift" family as the five redundant audit scripts consolidated earlier (see RESOLVED 2026-06-2x ultimate-audit consolidation), which kept `validate-homebrew.ts` without wiring it up.

**Hypothesis / root cause:** the script predates the `scripts/audit/` reorg and the npm-script naming convention (`validate:5e`, `validate:content`); its usage strings were never updated after the move, and no script entry was ever added.

**Proposed fix / improvement:**
- [ ] Decide: is homebrew validation still wanted as a standalone tool? If yes, add `"validate:homebrew": "tsx scripts/audit/validate-homebrew.ts"` to `package.json` and fix both usage strings to match. If no (the in-app zod import path already validates homebrew), delete the script.
- [ ] Either way, cover it in the planned `scripts/README.md` index (2026-06-28 entry) under "wired vs ad-hoc".

**Related files:** `dnd-app/scripts/audit/validate-homebrew.ts`, `dnd-app/package.json`

**Related entries:** [2026-06-28] `scripts/` has ~40 scripts across 11 sub-areas but no `scripts/README.md`

### [2026-07-02] README "Directory layout" for `src/main/` omits the `account/` subdir and ~9 later-added root modules (turn/library/registry bridges, security-log, path-guard, upload-validation, …)

- **Category:** docs
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** scheduled cleanup/structure scan of `dnd-app/`

**Description:**
`README.md` "Directory layout" documents `src/main/` as `index.ts`, `bmo-bridge.ts`, `bmo-config.ts`, `bmo-csp.ts`, `cloud-sync.ts`, `lan-discovery.ts`, `updater.ts` plus six subdirs (`ai/`, `ipc/`, `storage/`, `plugins/`, `discord-integration/`, `data/`). The tree has since grown past the doc: the **`account/` subdir** (account-client / account-oauth / account-session / sync-client — a whole capability area) is missing entirely, as are nine root modules: `library-bridge.ts`, `registry-bridge.ts`, `turn-bridge.ts`, `sound-cache.ts`, `security-log.ts`, `log.ts`, `paths.ts`, `path-guard.ts`, `upload-validation.ts`. A contributor scanning the documented layout gets a materially incomplete picture of the main process (notably every non-BMO bridge and the whole security/validation layer). This is the same README-drift pattern already logged for the renderer (`test/`, `a11y/` dirs missing — 2026-06-29 entry).

Secondary observation (structure, optional): `src/main/` root now holds 4 sibling `*-bridge.ts` modules (bmo/library/registry/turn) alongside 6 subdirs; if root sprawl continues, grouping bridges under `src/main/bridges/` would keep the root scannable — but the README fix alone resolves the discoverability problem and avoids churning imports.

**Hypothesis / root cause:** modules were added across phases (TURN bridge is from PHASE-53B, account/ from the account-sync work) without a README layout pass; nothing checks the README tree against the real tree.

**Proposed fix / improvement:**
- [ ] Update the `src/main/` block of README "Directory layout": add `account/` and one-liners for the nine missing root modules (or a summarizing line per group: bridges, security/log, path/upload guards).
- [ ] Fold the renderer omissions from the 2026-06-29 entry into the same README pass (one edit, two entries resolved).
- [ ] Optional future-idea: extend `sync:doc-counts --check` (which already guards doc counts in CI) to also diff the README layout tree against `ls src/main` so the next added module fails the check instead of silently drifting.

**Related files:** `dnd-app/README.md` (Directory layout), `dnd-app/src/main/`, `dnd-app/scripts/build/sync-doc-counts.mjs`

**Related entries:** [2026-06-29] Renderer test organization is inconsistent … `test/`/`a11y/` aren't in the README layout
### [2026-07-02] Second-window player/projector display for in-person tables — put the player view of the map on a TV while the DM keeps the control window

- **Category:** future-idea, UX
- **Severity:** info
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** scheduled improvement scan of dnd-app/

**Description:**
The app has a strong player-facing presentation layer (`SceneModeOverlay.tsx` full-bleed cinematic scenes, fog-of-war player filtering in `stores/game/fog-slice.ts`, `network-state-filter.ts` stripping DM-only data), but it all renders in the ONE window. There is no way to run an in-person table where the DM's laptop drives a TV/projector showing the players' view of the battlemap while the DM keeps the full control UI on their own screen. Every comparable VTT (Foundry via popout modules, Owlbear Rodeo second screen, Fantasy Grounds) supports this, and Electron makes it unusually cheap: a second chromeless `BrowserWindow` on the extended display loading the same renderer in a "player-view" mode (a spectator-permission rendering path already exists) with camera/zoom optionally slaved to the DM window.

**Proposed fix / improvement:**
- [ ] Add a "Player display" toggle (DM only) that opens a second frameless BrowserWindow on a chosen display (Electron `screen` API) rendering the existing player/spectator view of the current map + scene overlay.
- [ ] Reuse the spectator network path locally (loopback state feed or shared store) so DM-only layers (hidden tokens, DM notes, full fog) never paint there.
- [ ] Camera options: follow-DM, follow-active-token, or free.
- [ ] Web/embed targets can degrade to a popout browser window of the existing web SPA in spectator mode.

**Blocked by:** none

**Related files:** `src/main/index.ts` (window creation), `src/renderer/src/components/game/overlays/scene/SceneModeOverlay.tsx`, `src/renderer/src/stores/network-store/network-state-filter.ts`, `src/renderer/src/stores/game/fog-slice.ts`

**Related entries:** none

### [2026-07-02] Map ping + center-camera gestures — no way to say "look HERE" on the battlemap

- **Category:** future-idea, UX
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** scheduled improvement scan of dnd-app/

**Description:**
Grep across the renderer finds "ping" only as the network keepalive message (`network/message-types`, `client-handlers.ts` case 'ping') — there is no map ping gesture, and no camera-focus verb at all (no `centerOnToken` / `panTo` / follow-token anywhere). During play the DM cannot flash a marker at a map location that all connected players see ("the trap is here"), and players cannot ping to answer "where is your character?". Likewise nothing recenters a player's viewport on their token or on the active-initiative token when their turn starts — on a large map a distracted player is simply lost. This is a small, high-frequency quality-of-life gap: the multiplayer plumbing (broadcast message types, per-player permissions) and the Pixi overlay layer needed to draw an animated ripple already exist.

**Proposed fix / improvement:**
- [ ] Alt/long-press-click on the map broadcasts a `map-ping` message (position + sender color); all clients render a ~2s animated ripple + optional sound, DM setting to disable player pings.
- [ ] Double-click a ping (or a "focus" variant, e.g. Alt+Shift-click) additionally pans remote viewports to the pinged location (respecting a per-player "allow camera pull" setting).
- [ ] "Center on my token" hotkey + auto-center-on-active-token option when initiative advances.

**Blocked by:** none

**Related files:** `src/renderer/src/network/message-types.ts`, `src/renderer/src/stores/network-store/client-handlers.ts`, `src/renderer/src/components/game/map/map-canvas/`, `src/renderer/src/stores/game/initiative-slice.ts`

**Related entries:** none

### [2026-07-02] Screen-reader battlefield access — the Pixi map canvas is invisible to assistive tech; add a textual battlefield summary / aria-live turn narrator

- **Category:** future-idea, UX
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** scheduled improvement scan of dnd-app/

**Description:**
The app has real accessibility investment — a screen-reader mode in `use-accessibility-store.ts`, aria-live regions in chat/dice components, a jest-axe harness — but the battlemap itself is a PixiJS canvas, which exposes NOTHING to a screen reader: token positions, movement, fog reveals, AoE placement and door states are all purely visual. A blind or low-vision player can chat and roll dice but cannot answer "who is adjacent to me?" or "how far is the ogre?". The game store already holds everything needed to answer those questions textually (token coords, grid size, initiative order, conditions), so this is a presentation gap, not a data gap.

**Proposed fix / improvement:**
- [ ] "Describe battlefield" panel/hotkey (visible when screen-reader mode is on): a generated text summary — per-token grid position, distance + direction from the player's token, conditions, door/wall highlights of the immediate area.
- [ ] aria-live turn narrator: on initiative advance / token move / AoE placement, announce a one-line description ("Ogre moves 15 ft closer, now 10 ft north of you").
- [ ] Keyboard token cursor: arrow-key iterate over tokens with each announced, reusing the existing keybinding system.

**Blocked by:** none

**Related files:** `src/renderer/src/stores/use-accessibility-store.ts`, `src/renderer/src/components/game/map/map-canvas/`, `src/renderer/src/stores/game/initiative-slice.ts`, `src/renderer/src/a11y/a11y-smoke.test.tsx`

**Related entries:** SUGGESTIONS-LOG-DNDAPP [2026-06-29] a11y (jest-axe) harness only asserts on a synthetic fragment (complementary — that covers DOM components; this covers the canvas)

### [2026-07-02] Automatic scheduled local backups with rotation — the app nudges about stale backups but never just makes one itself

- **Category:** future-idea, UX
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** scheduled improvement scan of dnd-app/

**Description:**
Backup support today is: manual export (`services/io/import-export.ts`), an optional cloud path (`CloudBackupSection`), and a 14-day staleness NAG (`services/backup/backup-staleness.ts` -> on-launch nudge). The app knows the user hasn't backed up, has atomic-write + snapshot machinery in the main process (`storage/atomic-write.ts`, `storage/snapshot.ts`), and full filesystem access — yet it still asks the human to do the export by hand. For a desktop app holding campaigns that represent months of play, silent automatic local backups are strictly better than reminders: an on-quit (or every-N-hours) auto-export of campaigns/characters/settings to a configurable folder with N-copy rotation (e.g. keep 10, prune oldest), surfaced in Settings next to the existing cloud backup section. The staleness nudge then only fires if auto-backup is disabled AND stale.

**Proposed fix / improvement:**
- [ ] Main-process auto-backup job: on app quit + every N hours while running, write the same archive the manual export produces to `<userData>/backups/` (or user-chosen dir), rotate to a configurable count.
- [ ] Settings toggle + folder picker + "restore from backup" list in the existing backup/cloud section; record last-auto-backup time so `backupStaleness` counts it.
- [ ] Skip when nothing changed since the last backup (cheap dirty flag from the save queue).

**Blocked by:** none

**Related files:** `src/renderer/src/services/backup/backup-staleness.ts`, `src/renderer/src/services/io/import-export.ts`, `src/main/storage/snapshot.ts`, `src/main/storage/save-queue.ts`, `src/renderer/src/components/settings/CloudBackupSection.tsx`

**Related entries:** none

### [2026-07-02] Printable spell/item cards — PrintSheet covers the character sheet but prepared spells and magic items have no card/handout output

- **Category:** future-idea
- **Severity:** info
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** scheduled improvement scan of dnd-app/

**Description:**
`sheet/shared/PrintSheet.tsx` gives the character sheet a print path, but there is no way to print or export the things players actually reference mid-turn at a physical table: spell cards for a character's prepared/known spells, or cards for magic items/attuned gear. All the data is local and structured (spellbooks, items, homebrew included), so a print-stylesheet grid of poker-size cards (name, casting time, range, components, duration, rules text, upcast note) is a data-to-CSS exercise — no new data, no network. Useful for in-person play (pairs with the second-window/projector idea) and as a PDF export for remote players.

**Proposed fix / improvement:**
- [ ] "Print spell cards" action on the sheet's spellcasting section: renders selected/prepared spells as a CSS-grid card layout in a print window (reuse the PrintSheet pattern), 9 cards per page, browser print-to-PDF for free.
- [ ] Same for inventory: selected items/attunements as cards.
- [ ] Card-back option with class/school color for easy sorting.

**Blocked by:** none

**Related files:** `src/renderer/src/components/sheet/shared/PrintSheet.tsx`, `src/renderer/src/components/sheet/5e/SpellcastingSection5e.tsx`, `src/renderer/src/services/character/`

**Related entries:** SUGGESTIONS-LOG-DNDAPP [2026-07-02] Second-window player/projector display (both serve in-person tables)

### [2026-06-29] file-size-budget ratchet guards only 2 of ~7 hand-written 1000+ LOC modules — the main-process / web / store monoliths can still grow unbounded

- **Category:** debt
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** dnd-cleanup scheduled cleanup/reorg scan of `dnd-app/` (largest-file sweep vs the size ratchet)

**Description:**
`scripts/lint/file-size-budget.mjs` (wired into `dnd-app-ci.yml` as `lint:file-size`) is a good pattern — it gives a god-file a hard LOC ceiling so CI fails if it grows, forcing extraction rather than budget-raising. But its `BUDGETS` map currently contains **only two** files: `GameLayout.tsx` (1290) and `PdfViewer.tsx` (1236). Meanwhile a largest-file sweep shows several other hand-written modules already over 1000 LOC that are **not** budgeted, so they can grow without limit:
- `src/main/ai/ai-service.ts` — 1681 LOC (already logged as a god file mid-decomposition; entangled in a known circular dep)
- `src/main/ai/ai-schemas.ts` — 1622 LOC
- `src/main/ipc/ai-handlers.ts` — 1209 LOC
- `src/web/web-api.ts` — 1177 LOC
- `src/renderer/src/stores/network-store/index.ts` — 1007 LOC

(The two larger files above these — `i18n/generated-keys.ts` 6601 and `preload/index.d.ts` 1383 — are generated and correctly out of scope.) So the ratchet protects the two renderer UI monoliths but leaves the main-process AI layer, the web API shim, and the largest Zustand store free to accrete. The script's own header even says "To add a file to the ratchet: set its budget to the file's CURRENT line count," so extending it is the intended, cheap follow-up — it just was never done for these.

**Hypothesis / root cause:** The budget file was introduced specifically by the GameLayout/PdfViewer decomposition (see RESOLVED-ISSUES-DNDAPP "GameLayout / PdfViewer god-file decomposition") and seeded with exactly those two files; no pass has since enrolled the other large modules, so the ratchet's coverage is incidental to that one effort rather than systematic.

**Proposed fix / improvement:**
- [ ] Add the five modules above to `BUDGETS` at their current LOC (a freeze-in-place ceiling), so none can grow further; lower each as decomposition proceeds (same discipline already used for the two UI files).
- [ ] Consider deriving the ratchet from a glob + threshold (e.g. flag any non-generated hand-written `.ts`/`.tsx` over N LOC that lacks an explicit budget) so newly-grown monoliths get caught automatically instead of needing manual enrollment.
- [ ] Pair the `ai-service.ts` / `ai-schemas.ts` / `ai-handlers.ts` budgets with the already-open `ai-service.ts` decompose work so the ceilings ratchet down as that lands.

**Related files:** `scripts/lint/file-size-budget.mjs`, `src/main/ai/ai-service.ts`, `src/main/ai/ai-schemas.ts`, `src/main/ipc/ai-handlers.ts`, `src/web/web-api.ts`, `src/renderer/src/stores/network-store/index.ts`, `.github/workflows/dnd-app-ci.yml`

**Related entries:** RESOLVED-ISSUES-DNDAPP "GameLayout / PdfViewer god-file decomposition" + "the size ratchet" (introduced the budget); RESOLVED-ISSUES-DNDAPP [2026-06-23] "`ai-service.ts` is a ~1,740-LOC god file" (the still-open decompose this should ratchet).

### [2026-06-29] ShortcutReferenceModal hardcodes CATEGORY_ORDER + English CATEGORY_LABELS, duplicating the category list that already lives in the shortcut type

- **Category:** debt, UX
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** dnd-app tree review (ShortcutReferenceModal)

**Description:**
`ShortcutReferenceModal.tsx` keeps a hardcoded `CATEGORY_ORDER = ['combat','navigation','tools','general']` plus a hardcoded English `CATEGORY_LABELS` map, separate from the canonical category union on `ShortcutDefinition.category` in `keyboard-shortcuts.ts`. The `CATEGORY_LABELS` map is used only as a truthiness guard before falling back to the raw category key, so if a new shortcut category is ever added to the union + JSON, the modal will (a) not render it in the ordered list at all unless `CATEGORY_ORDER` is also edited, and (b) display the untranslated raw key if it slips through. Three spots (union, ORDER, LABELS) must stay in lockstep by hand. Minor today (the union is small and TS-typed), but a quiet maintenance trap.

**Hypothesis / root cause:** category presentation metadata (order + label) was inlined in the view instead of co-located with the category definition.

**Proposed fix / improvement:**
- [ ] Derive ordered categories from a single source (e.g. an exported `SHORTCUT_CATEGORIES` ordered array in `keyboard-shortcuts.ts`) and map labels via i18n keys.
- [ ] Or drive the modal off `getShortcutsByCategory()` keys with one explicit order array kept next to the union.

**Related files:** `src/renderer/src/components/game/modals/utility/ShortcutReferenceModal.tsx`, `src/renderer/src/services/keyboard-shortcuts.ts`

### [2026-06-29] 5e *content* values (monster/spell/species/class/alignment names + descriptions) are English-only — only the UI chrome is bilingual

- **Category:** future-idea, portability, UX
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** dnd-app tree review (i18n surface vs the 5e content set)

**Description:**
The renderer UI chrome is fully bilingual (`locales/en.json` + `es.json`, ~6.5k leaf keys each, parity-gated in CI). But the ~3,041-file 5e content library (monsters, spells, species, items, traps, etc.) carries no localized fields: `es.json` has **zero** keys under any content namespace (`content.*`, `monsters.*`, `spells.*`). So a Spanish-locale user navigates a fully-translated app yet reads every stat block, spell description, and species/class/alignment label ("Dwarf fighter", "Lawful Good", monster traits) in English. This is the "remaining content-localization gap" noted only inside a *resolved* i18n entry — it is not tracked anywhere in the active logs, so a scanner grepping the active backlog will not find it.

**Hypothesis / root cause:** intentional original scope boundary — i18n was built for UI strings; the JSON content set was authored once in English and has no translation layer (no per-locale content files, no `name_es`/`desc_es` fields, no content-translation fallback in the data-provider).

**Proposed fix / improvement:**
- [ ] Decide the model: parallel `locales`-style content overlays vs. per-record localized fields vs. a translation lookup keyed by content id.
- [ ] Localize a high-value slice first (alignment, species/class labels, condition names) — short, bounded, and the most visible in the builder/sheet — before attempting full monster/spell text.
- [ ] Add a content-locale fallback in the data-provider so untranslated records cleanly render English (no raw-key leak), mirroring the chrome i18next fallback.
- [ ] Consider a CI parity guard for any content namespace that *does* get translated, like the existing `i18n:check-parity` for chrome.

**Related files:** `src/renderer/src/i18n/locales/{en,es}.json`, `src/renderer/src/services/data-provider/`, `src/renderer/public/data/`, `scripts/i18n/check-locale-parity.mjs`

**Related entries:** resolved i18n entry [2026-06-24] PHASE-56E Español walk ("remaining content-localization gap"); resolved [2026-06-23] data-driven locale-parity.

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

---
