Tested: dnd-vtt WEB build (Dungeon Table Online) v2.8.3 — 2026-07-15 · URL: https://bmo.mybmoai.work/DungeonTableOnline/ · automated unattended run

> **This is a WEB-build QA report** for the browser SPA served by the Pi behind the Cloudflare tunnel, distinct from the desktop-build reports in `completed/`. The prior WEB report covered **v2.7.2** (2026-07-02). The build now deployed is **v2.8.3** (entry `assets/index.web-DMidv6tc.js`, rsynced to the Pi **2026-07-15 14:49** — five minutes after the release commit `228bd8a8` at 14:44; version confirmed two ways: `sw.js` `VERSION = '2.8.3-mrmjzul…'`, and repo `dnd-app/package.json` at master `228bd8a8`).
>
> **The v2.7.2 → v2.8.3 dnd-app delta (`v2.7.2..v2.8.3`, 29 commits, 33 renderer/web files) is substantially web-relevant this time.** Web-facing landings verified against the deployed bundle: **chat transcript export** (`73877d58`, present — `transcript` literals in the current `InGamePage-*` generation), **dice stats** (`73877d58`, present — `DiceHistory-DXlKYuem.js` in the 14:49 generation carries the `totalRolls`/`luckiest`/`unluckiest` stats engine), the **PHASE-60 campaign-version-history parity fix** (`fc0482f3`, present — see closed-by-verification below), CodeQL fixes in handout-img/wizard-draft (`ca406031`), shortcut i18n + panel-resize dedup (`73877d58`), and two npm-deps waves (`45da09ee`). One advertised v2.8.2 feature verifiably did **not** ship: the **UVTT converter** (top finding below).
>
> **Run-mode limitation (read first):** this scheduled run executed **unattended**. Two Chrome extensions were connected, but the browser MCP requires the **user to interactively select which browser to drive** before any action (multi-browser safety gate) — impossible with nobody present, so the deployed app could **not** be driven interactively this run either. Coverage is a **static + deployed-artifact + live-HTTP-header pass** (headers verified via `curl` against `localhost:5000` on the Pi, read-only). All hands-on surfaces are listed under **Could not test**.
>
> **Infra checks that pass this run (no action needed):**
> - **Retention sweep (PHASE-61):** deployed `assets/` is **661 files / 22 MB / 4 entry generations** — all four from today's four deploys (11:38, 11:43, 12:09, 14:49); everything is inside the 24 h grace window, so the higher count vs. last run (376/12 MB/2) reflects deploy frequency, not sweep failure. Behaving as designed.
> - **Service worker:** `sw.js` correctly namespaced per version (`2.8.3-mrmjzul…`), shell-only precache design unchanged.
> - **Deploy pipeline:** release-commit→live latency was ~5 minutes; the deploy remains gated on lint + typecheck (web & node) + vitest before rsync (`dnd-web-deploy.yml`).
> - **Closed by verification — PHASE-60 web-api parity gap (carried Medium since v2.7.0) is FIXED in the deployed build.** `src/web/web-api.ts:248-249` now provides proper `{success, data}` envelope stubs for `listCampaignVersions`/`restoreCampaignVersion`, **and** `CampaignDetailPage.tsx:337` gates the panel with `!isWebBuild()`. The deployed `CampaignDetailPage-*` chunks carry the change. Drop this from the carried list.

## Top findings (Critical & High)
- **None Critical/High.** Most severe: **Medium ×3** — (new) the v2.8.2 UVTT converter is orphaned dead code that never reaches the deployed bundle, repeating the `auto-save.ts` pattern; (carried) hashed assets still served `Cache-Control: no-cache` (PHASE-63A authored, not yet implemented); (carried) the orphaned `auto-save.ts` engine + dead Settings Auto-Save section, unchanged in v2.8.3.

## 1. Release integrity / dead code

### The v2.8.2 "uvtt converter" feature is orphaned dead code — zero non-test importers repo-wide, tree-shaken out of the deployed bundle; second occurrence of the auto-save.ts pattern

- **Category:** bug (dead code / unshipped feature)
- **Severity:** medium
- **Domain:** both (verified absent from the deployed web artifacts; the reachability analysis is source-level and applies to desktop too)
- **Discovered by:** QA Agent (web-qa-tester)
- **During:** verifying that the v2.7.2→v2.8.3 delta's renderer features actually shipped in the deployed web build

**Description:** Commit `73877d58` (v2.8.2) advertises a "uvtt converter" and lands a complete Universal VTT import/export module — `src/renderer/src/services/io/uvtt.ts` (`parseUvtt`, `parseUvttString`, `toUvtt`, `toUvttString`, `normalizeUvttColor`, full `UvttMap`/`UvttPortal`/`UvttLight` typings) plus a test suite (`uvtt.test.ts`). But the module has **no non-test importers anywhere in `dnd-app/src`** (renderer, web, or main — `grep -rn "io/uvtt" dnd-app/src` excluding tests → empty; likewise for its exported symbol names). Nothing in the map editor, campaign wizard, or any import/export UI calls it. Rolldown therefore (correctly) tree-shakes it: the deployed bundle contains **zero** `uvtt`/`dd2vtt` literals across all 661 chunks. The feature's tests pass against code users cannot reach.

This is the **second occurrence of the exact pattern** the v2.7.2 WEB report filed against `auto-save.ts` (a landed module + tests with no runtime caller, silently dropped by tree-shaking). Two occurrences in three releases suggests a systemic gap: nothing in CI verifies that a landed renderer feature is actually reachable from the UI / present in the built bundle.

**Reproduction (artifact-level):**
1. Repo at `228bd8a8`: `grep -rn "io/uvtt" dnd-app/src --include="*.ts*" | grep -v test | grep -v "uvtt.ts:"` → no matches (same for `parseUvtt|toUvtt|parseUvttString|toUvttString` call sites).
2. On the Pi: `grep -rli "dd2vtt\|uvtt" ~/web-apps/DungeonTableOnline/assets/` → no matches.

**Expected behavior:** A feature named in a release commit is wired to a user-reachable surface (e.g. map editor import/export accepting `.dd2vtt`/`.uvtt` files) and ships in the bundle — or isn't advertised as landed.

**Hypothesis / root cause:** The UI wiring (likely a map-editor import/export entry point — `MapEditorRightPanel.tsx` was touched in the same commit but does not import the module) was planned but never landed; the service + tests merged alone. Speculation: the same "engine first, wiring later" split that orphaned `auto-save.ts`.

**Suggested action:** Wire `uvtt.ts` into the map import/export UI (or revert/annotate it until the wiring lands). Consider a cheap CI guard for the pattern: a knip/`ts-prune`-style check that fails when a non-test `services/**` module has zero non-test importers, or a bundle-grep smoke asserting a distinctive literal per advertised feature.

**Environment:** deployed web artifacts + repo master `228bd8a8`, read-only static pass
**Related files:** `dnd-app/src/renderer/src/services/io/uvtt.ts`, `dnd-app/src/renderer/src/services/io/uvtt.test.ts`, `dnd-app/src/renderer/src/components/game/modals/dm-tools/MapEditorRightPanel.tsx`

### Carried: the orphaned `auto-save.ts` snapshot/eviction engine and the dead Settings → Auto-Save section are unchanged in v2.8.3

- **Category:** bug (dead code / misleading settings UI) — `already in WEB-QA-report-2026-07-02-v2.7.2.md` (top finding)
- **Severity:** medium
- **Domain:** both
- **Discovered by:** QA Agent (carried; re-verified this run)
- **During:** re-checking the v2.7.2 report's top finding against v2.8.3 source

**Description:** Unchanged: `services/io/auto-save` is still imported only by `AutoSaveSection.tsx` (config accessors) and `SettingsPage.tsx` (type-only); the actual in-game autosave is still `game-auto-save.ts`, which does not consult `AutoSaveConfig`. The Settings → Auto-Save toggle/interval still configure an engine that never runs, and the v2.7.2 quota-eviction fix remains dead code. Verified at `228bd8a8`: `grep -rln "services/io/auto-save" dnd-app/src/renderer/src --include="*.ts*" | grep -v test` → the same two files.

**Suggested action:** As filed in the v2.7.2 report — either wire the engine or remove/consolidate it and its Settings section into `game-auto-save.ts`. Note it now has a sibling (the UVTT finding above); a shared CI guard would close the class.

## 2. Serving infra (carried — PHASE-63 authored, not yet implemented)

### Carried: content-hashed `/DungeonTableOnline/assets/**` chunks still served `Cache-Control: no-cache`

- **Category:** performance — `already in` v2.7.1/v2.7.2 WEB reports; authored as **PHASE-63A** (file exists at `dnd-app/docs/phases/PHASE-63-web-serving-cache-immutable-csp-scope.md`, not yet implemented)
- **Severity:** medium
- **Domain:** bmo (Pi `webapp_api.py`)
- **Discovered by:** QA Agent (carried; re-verified this run)
- **During:** live-HTTP-header pass, `curl -sI http://localhost:5000/DungeonTableOnline/assets/index.web-*.js` (Pi, read-only)

**Description:** Still live on 2026-07-15: hashed, immutable-by-construction chunks return `Cache-Control: no-cache` (verified on the current entry generation). Every cold boot re-issues the full conditional-GET storm through the tunnel and the Cloudflare edge cannot cache. PHASE-63A (set `public, max-age=31536000, immutable` on the hashed subtree only) is authored but unimplemented.

**Suggested action:** Prioritize PHASE-63A — it's Pi-side only, no app rebuild needed, and the deploy cadence (4 deploys today) multiplies the cost of the miss.

### Carried: VTT HTML still inherits the site-wide kiosk/IDE CSP (`unsafe-eval`, `unsafe-inline`, IDE-CDN/YouTube allowances the bundle doesn't need)

- **Category:** security (hardening) — `already in` v2.7.1/v2.7.2 WEB reports; authored as **PHASE-63B**, not yet implemented
- **Severity:** low
- **Domain:** bmo (Pi `webapp_api.py`)
- **Discovered by:** QA Agent (carried; re-verified this run)
- **During:** live-HTTP-header pass on `/DungeonTableOnline/`

**Description:** Still live: the VTT route's CSP includes `script-src … 'unsafe-inline' 'unsafe-eval' … https://cdn.jsdelivr.net https://cdn.socket.io`, `img-src … https://yt3.googleusercontent.com https://lh3.googleusercontent.com https://i.ytimg.com`, etc. — the kiosk/IDE policy. The deployed shell references zero external script/style origins beyond the CF-insights beacon. PHASE-63B (route-scoped CSP at `_serve_index()`) is authored but unimplemented.

## 3. i18n (observation)

### es.json same-value key count rose again: 168 → 185 (+17 since v2.7.1); 0 missing keys

- **Category:** docs/i18n observation
- **Severity:** info
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** re-running the PHASE-62 carry-forward spot-check against v2.8.3 locales

**Description:** Keys whose `es` value is byte-identical to `en` (length > 2) went 163 (v2.7.0) → 168 (v2.7.1) → **185** (v2.8.3). No keys are missing from `es.json` (0). Some identical values are legitimate (proper nouns, "OK", dice formulas); +17 in one delta — which included `73877d58`'s "shortcut i18n" and `fc0482f3`'s "web i18n leaks" work — is worth a deliberate pass to confirm none are untranslated English leaking through as "translated." An attended run should eyeball the new shortcut-category and transcript-export strings in the Spanish UI.

**Suggested action:** One-off review of the 17 new same-value keys (diff the flattened same-value sets between `v2.7.2` and `v2.8.3` locales); tag deliberate identicals so the check stays signal.

## Could not test (env: unattended run — browser selection gate)

All interactive surfaces. Two Chrome extension instances were connected, but the browser MCP's multi-browser safety gate requires the user to pick which browser to drive before any action, and no user was present. Carried to the next attended pass (or a run where exactly one browser is connected):
- App boot / console sweep, route walk (menu, Characters, Library, Bastions, About, Settings, Join Game)
- Character builder, campaign wizard, in-game map/combat/DM tools on web
- Multiplayer via extra tabs (host/join, rejoin matrix, Cloud Host host-independence)
- Settings matrix (themes, i18n walk, accessibility, reduced motion), PWA/service-worker update flow
- The new v2.8.x web features hands-on: chat transcript export UX (native download on web), dice-stats panel, palette content search
- CSP-violation sweep needed to land PHASE-63B's allowance drops (explicitly gated on a browser-connected run)
