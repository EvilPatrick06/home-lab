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

### [2026-07-02] Dead Windows code-signing leftovers — `scripts/sign.mjs` + `.env.signing.template` survive the v2.2.2 removal of the `win.sign` hook

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** scheduled cleanup/reorganization scan of `dnd-app/`

**Description:**
`README.md` ("Code signing (Windows)", ~line 141) documents that the custom `win.sign` hook was **removed as of v2.2.2** (incompatible with electron-builder 26 — `build.win.sign` moved under `signtoolOptions` in v25) and that builds intentionally ship unsigned. But the hook implementation `scripts/sign.mjs` (added in phase 19d, commit `5ce0b34c`) and its companion `.env.signing.template` are still in the tree. Nothing wires them up: `package.json#build` has no `sign`/`signtoolOptions` key, and `.github/workflows/release.yml` sets no `CSC_LINK` (only the mac-side `CSC_IDENTITY_AUTO_DISCOVERY: false`). So `sign.mjs` is dead code — and `.env.signing.template` is actively misleading: it still instructs configuring `CSC_LINK`/`CSC_KEY_PASSWORD` "via .env.signing", implying a working signing path; a contributor following it gets an unchanged, unsigned build with no error or warning.

**Hypothesis / root cause:** the v2.2.2 fix removed the *wiring* (the `win.sign` property) to unbreak the build, but the hook script and env template were never swept up.

**Proposed fix / improvement:**
- [ ] Delete `scripts/sign.mjs` and `.env.signing.template` — git history preserves them, and README already points future signing work at electron-builder's native `win.signtoolOptions` instead of a custom hook. OR:
- [ ] If keeping them as a future starting point, add a prominent top-of-file note in BOTH files that they are currently UNWIRED (hook removed v2.2.2 — see README "Code signing (Windows)") so they stop advertising a flow that doesn't run.
- [ ] Cross-check `docs/RELEASE.md` (§ notes around line 60 already explain why no `build.win.sign` exists) and link it from whichever file survives.

**Related files:** `scripts/sign.mjs`, `.env.signing.template`, `package.json`, `README.md`, `docs/RELEASE.md`

**Related entries:** [2026-06-28] "`scripts/` has ~40 scripts … no `scripts/README.md`" (a script index would have made this orphan obvious).

### [2026-07-02] electron-builder `files` excludes reference six paths that no longer exist under `dnd-app/`

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** scheduled cleanup/reorganization scan of `dnd-app/`

**Description:**
`package.json#build.files` carries negation globs for `!5.5e References/**/*`, `!Tests/**/*`, `!bmo/**/*`, `!.claude/**/*`, `!audit-prompt.md`, and `!**/.vscode/*` — none of these paths exist under `dnd-app/` today (verified with a per-path existence check). They are leftovers from the pre-monorepo layout when the app directory sat beside the 5.5e reference dump, `bmo/`, and an ad-hoc `Tests/` folder. `!**/*.ps1` likewise guards against PowerShell scripts no longer present. Harmless at package time (a non-matching negation is a no-op), but the list misdescribes the tree, and every stale glob invites cargo-cult copying into future configs.

**Proposed fix / improvement:**
- [ ] Prune the six stale negations from `build.files`, keeping only excludes that match real paths (`!src/**/*`, `!scripts/**/*`, the config-file globs, etc.).
- [ ] Verify with a packaged-artifact listing (`npx asar list` on the built app.asar, or `verify-build.mjs` if it inspects contents) that the pruned config produces an identical file set.

**Related files:** `package.json`

### [2026-07-02] Stale `.gitkeep` in `docs/phases/completed/` — the directory now holds 57 phase files

- **Category:** debt
- **Severity:** info
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** scheduled cleanup/reorganization scan of `dnd-app/`

**Description:**
`docs/phases/completed/.gitkeep` was added to keep the then-empty directory tracked; the directory now contains 57 completed phase plans, so the placeholder is dead weight and mildly confusing (implies emptiness must be preserved). The sibling `docs/phases/QA/screenshots/.gitkeep` is still legitimate — that directory is otherwise empty.

**Proposed fix / improvement:**
- [ ] Delete `docs/phases/completed/.gitkeep`.

**Related files:** `docs/phases/completed/.gitkeep`
### [2026-07-02] Universal VTT (.uvtt/.dd2vtt) battlemap import/export — walls/doors/lights metadata interop with Dungeondraft, Dungeon Alchemist, Foundry

- **Category:** future-idea
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** scheduled improvement-suggestion scan of `dnd-app/`

**Description:**
The app has native walls, doors, dynamic lighting, and fog-of-war, and PHASE-34 built an AI battlemap generator whose `BattlemapSpec` was deliberately designed "UVTT-adjacent (walls/portals/lights + grid resolution)" — with UVTT import/export explicitly called out as the cheap future path and "log to SUGGESTIONS-LOG-DNDAPP if desired" (see `docs/phases/completed/PHASE-34-battlemap-generation.md` §367/§401). It was never logged, and `grep -ri "uvtt\|dd2vtt\|dungeondraft" src/` finds no implementation. Today a DM who builds a map in Dungeondraft / Dungeon Alchemist must re-trace every wall, door, and light by hand in the in-app editor; the Universal VTT JSON format (an image plus grid size, colliders, portals, and lights) is the ecosystem-standard interchange that Foundry and Roll20 already consume.

**Proposed fix / improvement:**
- [ ] Import: parse `.uvtt`/`.dd2vtt`/`.df2vtt` (base64 image + `resolution`, `line_of_sight`, `portals`, `lights`) into the existing map + wall-layer + door + lighting-overlay model, mapping through/near `BattlemapSpec`.
- [ ] Export: serialize the current map (background, walls, portals, lights, grid) back out to `.uvtt`, closing the round-trip PHASE-34 anticipated.
- [ ] Wire into the DM map editor (`components/game/modals/dm-tools/DMMapEditor.tsx`) as an "Import map file…" action next to plain-image import, and reuse `upload-validation.ts` size/type guards for the embedded image.

**Blocked by:** none

**Related files:** `dnd-app/src/renderer/src/components/game/map/wall-layer.ts`, `dnd-app/src/renderer/src/components/game/map/lighting-overlay.ts`, `dnd-app/src/renderer/src/components/game/modals/dm-tools/DMMapEditor.tsx`, `dnd-app/docs/phases/completed/PHASE-34-battlemap-generation.md`

**Related entries:** none (PHASE-34 completion note asked for this entry; first time logged)

### [2026-07-02] Game chat has no transcript export — combat log exports CSV/JSON but the RP/narration chat (the actual story) cannot be saved

- **Category:** future-idea, UX
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** scheduled improvement-suggestion scan of `dnd-app/`

**Description:**
`CombatLogPanel.tsx` ships CSV + JSON export (`services/io/combat-log-export.ts`), but the game chat — player roleplay, DM/AI-DM narration, whispers, system messages rendered by `GameChatPanel.tsx` from `use-lobby-store` `ChatMessage[]` — has no export at all (`grep -i "export\|download" GameChatPanel.tsx` finds only the module `export default`). The AI DM produces end-of-session *recaps*, but the raw session transcript (the campaigns actual prose) is unrecoverable once the session ends. Groups that journal their campaigns, or want to feed a past session back to the AI DM or share it on Discord, have nothing to copy but scrollback.

**Proposed fix / improvement:**
- [ ] Add "Export transcript" (Markdown, plus optional JSON) to the chat panel header, mirroring the combat-log export UX: `# Session — <date>` then `**Speaker** (HH:MM): message`, with whispers marked and system messages toggleable.
- [ ] Reuse the same blob-download path as `combat-log-export.ts`; factor a tiny shared `download-file` helper if desired.
- [ ] Optional follow-up: a combined "session record" export that interleaves chat + combat-log by timestamp.

**Blocked by:** none

**Related files:** `dnd-app/src/renderer/src/components/game/bottom/GameChatPanel.tsx`, `dnd-app/src/renderer/src/stores/use-lobby-store.ts`, `dnd-app/src/renderer/src/services/io/combat-log-export.ts`, `dnd-app/src/renderer/src/components/game/sidebar/CombatLogPanel.tsx`

**Related entries:** none found (grepped `transcript`, `chat export`, `session log` across active + resolved dnd-app logs)

### [2026-07-02] Dice roll statistics panel — per-player d20 distributions, crit/fumble counts, session luck summary from events the app already records

- **Category:** future-idea
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** scheduled improvement-suggestion scan of `dnd-app/`

**Description:**
Every roll already flows through structured paths — the 3D dice roller, chat roll commands, group rolls, and the combat log slice — and `DMRollerModal.tsx` keeps a `rollHistory`, but nothing aggregates rolls into statistics. `grep -ri "statistics\|roll.stat" src/renderer` finds only `ShortRestPanel`. A small stats view (per-player d20 histogram, average vs expected, nat-1/nat-20 counts, rolls-per-session) is a beloved QoL feature in other VTTs (Foundrys Dice Stats modules, Roll20 API scripts), fits the existing combat-log data model, and gives the end-of-session recap fun material ("Gavin rolled four nat-20s").

**Proposed fix / improvement:**
- [ ] Accumulate roll events (die size, raw result, roller, purpose) into a lightweight session-scoped stats slice or derive on demand from the combat log entries that already carry roll payloads.
- [ ] Render a "Dice stats" tab/modal (per-player histogram + crit/fumble tallies + session totals); DM sees all, players see their own.
- [ ] Optional: include a one-line luck summary in the AI DM end-of-session recap context.

**Blocked by:** none

**Related files:** `dnd-app/src/renderer/src/stores/game/combat-log-slice.ts`, `dnd-app/src/renderer/src/components/game/dice3d/DiceRoller.tsx`, `dnd-app/src/renderer/src/components/game/modals/dm-tools/DMRollerModal.tsx`

**Related entries:** none found (no prior dice/roll-statistics entry in active or resolved dnd-app logs)

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

### [2026-06-29] `knip.json` carries ~30 hand-maintained individual `entry` exceptions with no inline rationale — each silently masks a module knip would otherwise flag as unreachable

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** dnd-cleanup scheduled cleanup/reorg scan of `dnd-app/` (dead-code tooling review)

**Description:**
Beyond the legitimate true entry points (the electron-vite config, the four `index.ts`/`main.tsx` process entries, and the broad `scripts/**` glob), `knip.json`'s `entry` array lists ~30 **individual source files** — e.g. `services/combat/{damage,attack,combat}-resolver.ts`, `services/game-actions/types.ts`, `components/game/map/map-canvas/types.ts`, `network/{schemas,message-types}.ts`, `services/io/combat-log-export.ts`, `components/game/map/map-overlay-effects.ts`, `main/ai/context/context-builder.ts`, several `types/**` and per-feature `index.ts` barrels. Each entry is there because knip could not reach that file from the real entry graph — i.e. it would otherwise be reported as unused. None carries a comment explaining **why** it is exempt (dynamically imported? a build-target entry? a barrel re-exported only via path alias? or genuinely dead and being masked?). So the file is now load-bearing dead-code-suppression config that nobody can audit: a future contributor cannot tell which entries are legitimately unreachable-but-needed vs which are hiding code that actually became dead after a refactor. This compounds the already-noted `scripts/**` glob blind spot (the stale `submit/*-batch.ts` scripts went unnoticed precisely because that glob exempts them from `npm run dead-code`).

**Hypothesis / root cause:** The `entry` list grew one line at a time across many refactors (the git history of `knip.json` shows repeated "make knip see X" / "knip clean" commits) — each refactor that orphaned a module from the static graph added an `entry` exception to silence knip rather than re-wiring or removing the module, and no pass has since revisited whether each exception is still warranted.

**Proposed fix / improvement:**
- [ ] Annotate each individual `entry` line with a one-word reason via a sibling comment block (dynamic-import / build-target / alias-only-barrel / type-only), so the file is self-auditing.
- [ ] Periodic audit: remove each individual `entry` exception one at a time and re-run `npm run dead-code`; if knip now reports the file as unused, it was masking dead code (delete it); if knip reports a *new* unreachable elsewhere, the entry was load-bearing (restore + document why).
- [ ] Prefer fixing the reachability at the source (export the module from a real entry barrel, or delete it) over adding a fresh `entry` exception in future refactors.

**Related files:** `dnd-app/knip.json`, `dnd-app/package.json` (`dead-code` script)

**Related entries:** [2026-06-28] "Stale one-off `scripts/submit/*-batch.ts` content-gen scripts no longer wired up" (the `scripts/**` glob blind spot — same masking pattern); RESOLVED-ISSUES-DNDAPP entries noting knip's `scripts/**` glob hides retired tooling.

### [2026-06-29] Renderer test organization is inconsistent — a couple of "meta" tests live in dedicated single-file dirs (`test/`, `a11y/`) while ~850 unit tests are colocated, and `test/`/`a11y/` aren't in the README layout

- **Category:** debt, docs
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** dnd-cleanup scheduled cleanup/reorg scan of `dnd-app/` (renderer directory-structure review)

**Description:**
The renderer's convention is to colocate tests next to source (`foo.ts` + `foo.test.ts`), which the ~850 `*.test.*` files follow. Two "meta/cross-cutting" tests break that pattern by living in their own single-purpose directories: `src/renderer/src/test/codebase-integrity.test.ts` (a lone file in a `test/` dir) and `src/renderer/src/a11y/a11y-smoke.test.tsx` (plus its `jest-axe.d.ts`). There is also a one-file `events/` dir (`system-chat-bridge.ts`). The inconsistency is minor on its own, but two of these dirs (`test/`, `a11y/`) are **not** listed in the README "Directory layout" section (which does name `events/`, `styles/`, `constants/`, etc.), so a contributor scanning the documented layout will not know they exist or what belongs in them — and the next "where do I put a whole-app integrity/a11y test" decision has no documented home, risking a third ad-hoc location.

**Hypothesis / root cause:** `a11y/` and `test/` were each created for a single seed test (the jest-axe harness; the codebase-integrity guard) without a convention decision or a README update, so they read as one-off folders rather than an intentional "meta tests live here" home.

**Proposed fix / improvement:**
- [ ] Decide and document one home for whole-app/meta tests (e.g. keep `src/renderer/src/test/` and move the a11y smoke test under it, or keep both and add both to the README layout) so the pattern is intentional, not incidental.
- [ ] Add the chosen dir(s) to the README "Directory layout" block alongside the already-listed `events/`, `styles/`, `constants/`.
- [ ] Low priority — purely organizational; no behavior change. Logged per the "log even minor structural items" guidance so the pattern is visible if more single-file dirs accrete.

**Related files:** `src/renderer/src/test/codebase-integrity.test.ts`, `src/renderer/src/a11y/a11y-smoke.test.tsx`, `src/renderer/src/a11y/jest-axe.d.ts`, `src/renderer/src/events/system-chat-bridge.ts`, `dnd-app/README.md` (Directory layout section)

**Related entries:** [2026-06-29] "a11y (jest-axe) harness only asserts on a synthetic fragment" (same `a11y/` dir, coverage angle).
### [2026-06-29] Keyboard-shortcut descriptions + ShortcutReferenceModal category labels are English-only — the one localized surface that still isn't

- **Category:** UX, portability, future-idea
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** dnd-app tree review (keyboard-shortcuts service vs the i18n surface)

**Description:**
The renderer chrome is fully bilingual (en/es, parity-gated in CI), but two keyboard-shortcut surfaces hardcode English. (1) `renderer/public/data/ui/keyboard-shortcuts.json` stores each binding's human label inline in an English `description` field ("End Turn", "Toggle Journal", "Open Dice Roller (Throw)", "Toggle Map Editor (DM)", …). (2) `ShortcutReferenceModal.tsx` renders `shortcut.description` raw — `<span>{shortcut.description}</span>` is the only string in that modal NOT passed through `t()`, while the title, category headers, and footer all are. The same English `description` also surfaces in `KeybindingEditor.tsx`. So a Spanish-locale user opens a fully-translated app, presses `/`, and reads a shortcut sheet whose every row label is English. Distinct from the 5e-*content* i18n gap (that entry is content data: monsters/spells); this is UI affordance metadata — but it is the same "chrome localized, data not" class and is not tracked in the active backlog.

**Hypothesis / root cause:** the shortcut set was modeled as data (JSON) with an inline English label rather than an i18n key, and the modal trusts that label is display-ready so it skips `t()`.

**Proposed fix / improvement:**
- [ ] Replace (or shadow) the JSON `description` with an i18n key (e.g. `keyboardShortcuts.<action>`) resolved via `t()` in `ShortcutReferenceModal` + `KeybindingEditor`.
- [ ] Add the keys to en/es locales so the existing locale-parity gate keeps them in sync.

**Related files:** `src/renderer/public/data/ui/keyboard-shortcuts.json`, `src/renderer/src/components/game/modals/utility/ShortcutReferenceModal.tsx`, `src/renderer/src/components/settings/KeybindingEditor.tsx`, `src/renderer/src/services/keyboard-shortcuts.ts`

**Related entries:** [2026-06-29] 5e content values English-only (same chrome-vs-data localization class).


### [2026-06-29] Global command palette (Ctrl/Cmd+K) is navigation-only — no fuzzy search over compendium content, characters, or campaigns

- **Category:** future-idea, UX
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** dnd-app tree review (CommandPalette vs library-service/fuse.js)

**Description:**
`components/ui/CommandPalette.tsx` ships a global Ctrl/Cmd+K palette, but its command set is a fixed list of ~10 route jumps (`home`, `characters`, `createCharacter`, `makeCampaign`, `joinGame`, `library`, `bastions`, `calendar`, `settings`, `about`). It cannot search *entities*: you can jump to the Library page but not to a specific spell, monster, item, character, or saved campaign. The app already has the machinery — `fuse.js` is a dependency and `library-service.ts` already fuzzy-searches the 5e content set (used by `CompendiumModal`). A content-aware palette ("type fireball -> open the spell"; "type a character name -> open the sheet") would turn the palette from a menu shortcut into the app's primary fast-navigation surface. The in-game `GameCommandPalette.tsx` is similarly action-only (opens board modals), so neither palette reaches content.

**Hypothesis / root cause:** the palette shipped (resolved 2026-06-24) as a minimal route launcher; entity indexing was never layered on.

**Proposed fix / improvement:**
- [ ] Feed `CommandPalette` a fuse index over compendium content + the user's characters/campaigns, alongside the existing route commands.
- [ ] Group results (Pages / Spells / Monsters / Items / Characters) and route the selection to the right detail view.
- [ ] Consider sharing the index with `GameCommandPalette` so in-session lookups hit the same search.

**Related files:** `src/renderer/src/components/ui/CommandPalette.tsx`, `src/renderer/src/components/game/GameCommandPalette.tsx`, `src/renderer/src/services/library-service.ts`

**Related entries:** resolved [2026-06-24] command palette `CommandPalette.tsx` (this builds on the already-shipped palette).


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

### [2026-06-29] No single cross-target feature-parity matrix for the four renderer build targets (Electron desktop / web SPA / embed / Expo mobile)

- **Category:** future-idea, docs, portability
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** dnd-app tree review (build targets vs docs)

**Description:**
The same `src/renderer` is shipped to four targets — Electron desktop, the web SPA (`src/web/main.web.tsx`), the embeddable build (`main.embed.tsx`), and the Expo `mobile/` app — each reaching native/main-process capability through a different `window.api` shim (real preload, web shim, embed shim, mobile bridge). There is no one document mapping *which features actually work on which target*. `docs/WEB-VERSION-PLAN.md` covers only the web build's feasibility ("parity to desktop"); the existing `mobile/_shared` drift entry is about code-sync, not feature coverage. A contributor (or QA agent) has to read four shim files to learn that, e.g., the auto-updater, native crash capture, Bonjour LAN discovery, or local-Ollama paths are desktop-only.

**Hypothesis / root cause:** the targets were added incrementally (desktop first, then web/embed/mobile), each with its own shim, and no consolidating parity doc was written as they accreted.

**Proposed fix / improvement:**
- [ ] Add `dnd-app/docs/TARGET-PARITY.md`: rows = features/capabilities (updater, crash capture, LAN/Bonjour, file IO, TURN, AI providers, TTS, etc.), columns = desktop / web / embed / mobile, cells = full / shimmed-noop / partial / N-A.
- [ ] Seed it from the four `window.api` surfaces (`src/preload/index.ts` + the web/embed/mobile install-*-api shims) so each "noop shim" is one visible cell.
- [ ] Link it from each target's section in `README.md` and from `WEB-VERSION-PLAN.md`.
- [ ] Optional follow-up: a tiny script that diffs the shim method sets and flags a capability present on one target but silently missing on another.

**Related files:** `src/preload/index.ts`, `src/web/install-web-api.ts`, `src/web/install-embed-api.ts`, `mobile/`, `docs/WEB-VERSION-PLAN.md`, `README.md`

**Related entries:** [2026-06-28] mobile `_shared` sync-copy drift; [2026-06-28] mobile version pinned behind desktop.

### [2026-06-29] a11y (jest-axe) harness only asserts on a synthetic fragment — real high-traffic components are still unguarded

- **Category:** future-idea, UX
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** dnd-app tree review (a11y coverage)

**Description:**
`src/renderer/src/a11y/a11y-smoke.test.tsx` wires up jest-axe + vitest + happy-dom and proves the harness runs, but it only renders a hand-written accessible `<main>` fragment (heading + labeled input + button) and asserts zero violations. No *real* component is exercised, so the guard cannot catch an actual regression. The test's own comment flags this ("Expand coverage to high-traffic components … incrementally"); the harness seed itself is resolved, but the expansion is unlogged follow-up work and easy to forget.

**Hypothesis / root cause:** the seed was deliberately non-blocking (prove the harness, defer triaging the real-component baseline) and the follow-up was left only as an in-code comment, not a tracked backlog item.

**Proposed fix / improvement:**
- [ ] Pick the highest-traffic surfaces first: the game table / `GameLayout`, the character sheet, the settings panels, and the most-used modals.
- [ ] Render each in the happy-dom harness, snapshot the *current* axe violation set as a triaged baseline, and gate only on **new** violations (so pre-existing issues do not block CI but no new ones land).
- [ ] File the triaged pre-existing violations as their own follow-ups in `ISSUES-LOG-DNDAPP.md`.

**Related files:** `src/renderer/src/a11y/a11y-smoke.test.tsx`, `src/renderer/src/components/game/GameLayout.tsx`, `src/renderer/src/components/sheet/`, `src/renderer/src/components/settings/`

**Related entries:** resolved [2026-06-23] a11y jest-axe harness seed.

### [2026-06-29] Two different `usePanelResize` hooks coexist — `hooks/use-panel-resize.ts` is a stale, non-persisting duplicate left behind by the GameLayout decomposition

- **Category:** debt
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** dnd-cleanup scheduled cleanup/reorg scan of `dnd-app/` (duplicate-basename sweep)

**Description:**
There are two hooks both named `usePanelResize`, with the same exported interface and the same default sizing constants, living in two places:
- `src/renderer/src/components/game/game-layout/use-panel-resize.ts` (91 LOC) — the **canonical** one, created 2026-06-29 by the GameLayout god-file decomposition (commit "extract GameLayout panel-resize state+handlers into usePanelResize hook"). It **persists** bottom-bar height / sidebar width to `localStorage` via `SETTINGS_KEYS` (5 `localStorage` refs) and is consumed by `GameLayout.tsx` (re-exported from `game-layout/index.ts`).
- `src/renderer/src/hooks/use-panel-resize.ts` (74 LOC) — the **older** pre-extraction copy, last touched 2026-04-23 in the monorepo reorg. It has **no persistence** (0 `localStorage` refs) and is imported by exactly one consumer, `components/game/bottom/DMBottomBar.tsx`.

The decomposition added a second same-named hook instead of consolidating onto it, so the old copy is now dead-weight duplication. The sibling extraction `useFullscreen` exists in only one place (`game-layout/use-fullscreen.ts`), confirming the panel-resize duplicate is an oversight, not a deliberate split. There is also a real behavioral inconsistency: because `DMBottomBar` uses the non-persisting copy, the DM bottom bar's panel sizes do **not** survive a reload, while `GameLayout`'s identical-looking panels **do** — same UI affordance, two different persistence behaviors depending on which subtree renders it. Note the old copy carries its own test (`hooks/use-panel-resize.test.ts`) while the canonical persisted one has none, so the test suite is guarding the version that should be retired.

**Hypothesis / root cause:** The GameLayout decomposition (rule-27 god-file extraction) created `game-layout/use-panel-resize.ts` as a fresh module and rewired `GameLayout`, but `DMBottomBar`'s pre-existing import of the old `hooks/use-panel-resize.ts` was never migrated, so the original file was left in place instead of deleted.

**Proposed fix / improvement:**
- [ ] Point `DMBottomBar.tsx` at the canonical `game-layout` hook (via `game-layout/index.ts`), confirming its prop/return usage matches (interfaces are equivalent).
- [ ] Delete `src/renderer/src/hooks/use-panel-resize.ts` and move/retarget its test onto the canonical hook (the canonical persisted version currently has no test — net win for coverage).
- [ ] Decide whether `DMBottomBar` *should* persist its panel sizes; if the old non-persisting behavior was intentional for that surface, keep one hook and parameterize persistence rather than forking the module.

**Related files:** `src/renderer/src/hooks/use-panel-resize.ts`, `src/renderer/src/hooks/use-panel-resize.test.ts`, `src/renderer/src/components/game/game-layout/use-panel-resize.ts`, `src/renderer/src/components/game/bottom/DMBottomBar.tsx`, `src/renderer/src/components/game/GameLayout.tsx`, `src/renderer/src/components/game/game-layout/index.ts`

**Related entries:** see RESOLVED-ISSUES-DNDAPP.md "GameLayout / PdfViewer god-file decomposition" (the extraction that created the canonical hook); [2026-06-25] "DO NOT dedupe the `shared/types/*` re-export shims" (the *opposite* case — that duplication is intentional; this one is not).

### [2026-06-29] `dnd-app/docs/` has 10 reference docs but no `docs/README.md` index mapping each file to its topic

- **Category:** docs
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** dnd-cleanup scheduled cleanup/reorg scan of `dnd-app/` (docs-tree structure review)

**Description:**
`dnd-app/docs/` holds ten top-level reference docs — `ASSET-OFFLOAD.md`, `DEPENDENCIES.md`, `DESIGN-CONSTRAINTS.md`, `IPC-SURFACE.md`, `LLAMA-SERVER.md`, `PLUGIN-SYSTEM.md`, `RELEASE.md`, `SEED-PACKS.md`, `UI-LAYERS.md`, `WEB-VERSION-PLAN.md` — plus the `phases/` subtree (which *does* have its own `PHASE-INDEX.md`). The flat reference docs have **no `docs/README.md` index**: nothing tells a new contributor or scanning agent which doc covers what, which are living specs vs one-off plans (e.g. `WEB-VERSION-PLAN.md` reads as a plan that may be partly delivered), or how they relate. The top-level `README.md` only gestures at the directory with a single tree comment ("docs/ IPC-SURFACE, PLUGIN-SYSTEM, RELEASE, DESIGN-CONSTRAINTS, ASSET-OFFLOAD, …") and doesn't list all ten. This is the same gap already logged for `scripts/` ([2026-06-28] "`scripts/` has ~40 scripts … but no `scripts/README.md`") — a directory that grew per-phase without an index pass.

**Hypothesis / root cause:** The docs accreted one reference file per phase/topic; the `phases/` subtree got an index (`PHASE-INDEX.md`) but the flat reference docs never did.

**Proposed fix / improvement:**
- [ ] Add `dnd-app/docs/README.md`: one line per doc (purpose + living-spec vs historical-plan status), so the directory is self-describing and stale/one-off plans (e.g. `WEB-VERSION-PLAN.md`) are visibly flagged.
- [ ] While writing it, reconcile the top-level `README.md` tree comment so it doesn't enumerate a partial subset of the docs.
- [ ] Consider doing the same one-line-index treatment uniformly across `scripts/`, `docs/`, and any other accreted directory (pairs with the `scripts/README.md` entry).

**Related files:** `dnd-app/docs/` (the ten reference docs), `dnd-app/docs/phases/PHASE-INDEX.md` (existing index pattern to mirror), `dnd-app/README.md`

**Related entries:** [2026-06-28] "`scripts/` has ~40 scripts across 11 sub-areas but no `scripts/README.md`" (same missing-index pattern, sibling directory).

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
