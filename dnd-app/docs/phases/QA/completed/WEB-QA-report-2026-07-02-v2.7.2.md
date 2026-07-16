Tested: dnd-vtt WEB build (Dungeon Table Online) v2.7.2 — 2026-07-02 · URL: https://bmo.mybmoai.work/DungeonTableOnline/ · automated unattended run

> **This is a WEB-build QA report** for the browser SPA served by the Pi behind the Cloudflare tunnel, distinct from the desktop-build reports in `completed/`. The prior WEB report covered **v2.7.1** (same day, 13:14). The build now deployed is **v2.7.2** (entry `assets/index.web-mUp4-kBG.js`, rsynced to the Pi **2026-07-02 20:20**; version confirmed three ways: `AboutPage-DJGbnNvo.js` / `SettingsPage-B4buhKEu.js` carry `2.7.2` and are the chunks the current entry generation references, `sw.js` `VERSION = '2.7.2-mr4b38lr'`, and repo `dnd-app/package.json` at master `e1972fe0`).
>
> **The v2.7.1 → v2.7.2 dnd-app delta (`248d37b1..e1972fe0`) is *almost* web-inert — with one deceptive exception.** Every dnd-app change except one is outside the web bundle: `src/main/**` only (Ollama-installer SHA-256 verification `ce04c093`, CF-Access token target-gating `e67f3e8e`, owner-only ai-config perms `a925f53e`, registry/turn-bridge + bmo-config work), the mobile zip-slip guard `8b1eeaf8` (mobile embed only), and build tooling (`8321b15d` deterministic chunk-index). The **one renderer-side change** — `edb226ef`, the autosave quota-eviction fix in `src/renderer/src/services/io/auto-save.ts` — *looks* like it ships on web, but **verifiably does not reach the deployed bundle** (top finding below). Net: the deployed v2.7.2 web app is functionally identical to the QA-covered v2.7.1 aside from the version string.
>
> **Run-mode limitation (read first):** this scheduled run executed **unattended, with no Claude-for-Chrome browser connected** (`list_connected_browsers` → `[]`), so the deployed app could **not** be driven interactively. Coverage is a **static + deployed-artifact + live-HTTP-header pass** (headers verified via `curl` against `localhost:5000` on the Pi, read-only). All hands-on surfaces are listed under **Could not test**.
>
> **Infra checks that pass this run (no action needed):**
> - **Retention sweep (PHASE-61):** deployed `assets/` is **376 files / 12 MB / 2 entry generations** (20:15 + 20:20 of today) — the bounded sweep continues to behave as designed (was 756/26 MB/5 generations last run).
> - **Service worker:** `sw.js` correctly namespaced per version (`dto-shell-2.7.2-mr4b38lr`, `dto-assets-…`), old-cache eviction on activate unchanged.
> - **Deploy gate:** the live deploy remains gated on lint + typecheck (web & node) + vitest before rsync (`dnd-web-deploy.yml`), and the no-`--delete` overlay + 24 h retention design is unchanged.

## Top findings (Critical & High)
- **None Critical/High.** Most severe: **Medium ×3** — (new) the v2.7.2 autosave-eviction fix is dead code in the shipped web build and the Settings Auto-Save controls configure an engine that never runs; (carried) hashed assets still served `Cache-Control: no-cache`; (carried) the PHASE-60 web-api parity gap is still live.

## 1. Release integrity / dead code

### v2.7.2's only web-relevant change — the autosave quota-eviction fix — is tree-shaken out of the deployed bundle; the `auto-save.ts` snapshot/version subsystem has no non-test callers, and Settings → Auto-Save configures an engine that never runs
- **Category:** bug (dead code / misleading settings UI)
- **Severity:** medium
- **Domain:** both (verified on the deployed web artifacts; the reachability analysis is source-level and applies to desktop too — desktop QA should confirm)
- **Discovered by:** QA Agent
- **During:** verifying that the v2.7.2 delta's renderer change actually shipped in the deployed web build

**Description:** Commit `edb226ef` ("autosave quota eviction respects the IndexedDB body store") rewrites `persistSnapshotWithEviction()` in `src/renderer/src/services/io/auto-save.ts` so localStorage eviction only targets versions whose body actually lives in localStorage (previously a mid-session IndexedDB outage could drain the entire version manifest without freeing quota). The fix is correct — but it cannot execute in the shipped app:

1. **Not in the deployed bundle.** The eviction path's unmistakable literals (`'QuotaExceededError'`, `'NS_ERROR_DOM_QUOTA_REACHED'`) appear in **zero** deployed chunks (`grep -l` across all 376 files in `assets/`). The module's only surviving code is the config accessor pair — `SettingsPage-B4buhKEu.js` contains the `autosave:config` key usage and nothing else from the module.
2. **Why: the subsystem is orphaned at source level.** Repo-wide (excluding tests), `services/io/auto-save` is imported by exactly two files: `AutoSaveSection.tsx` (runtime — uses only `getConfig`/`setConfig`) and `SettingsPage.tsx` (type-only). Its public save/restore surface — `startAutoSave`, `stopAutoSave`, `saveNow`, `getSaveVersions`, `restoreVersion`, `deleteVersion` — has **no non-test callers anywhere**. The in-game autosave actually wired up is a *different module*: `use-game-effects.ts` imports `startAutoSave` from `services/io/game-auto-save.ts`; the builder uses `builder-auto-save.ts`. Rolldown therefore (correctly) tree-shakes the entire snapshot/eviction/version engine, including the new fix, out of the web build.
3. **User-facing consequence:** the **Settings → Auto-Save section** (rendered when not signed in, web included) presents an enable toggle and interval control backed by `AutoSave.getConfig()/setConfig()` — a config **nothing reads**. `game-auto-save.ts` does not consult `AutoSaveConfig` (it imports only app-constants, the game store, and the logger). So flipping Auto-Save off (or changing the interval) visibly "works" but changes no runtime behavior — a dead control masquerading as a safety-relevant setting.

**Reproduction (artifact-level):**
1. On the Pi: `grep -l "QuotaExceededError" ~/web-apps/DungeonTableOnline/assets/*.js` → no matches (likewise `NS_ERROR_DOM_QUOTA_REACHED`).
2. In the repo at `e1972fe0`: `grep -rln "services/io/auto-save" dnd-app/src/renderer/src --include="*.ts*" | grep -v test` → only `AutoSaveSection.tsx` and `SettingsPage.tsx`.
3. `grep -rn "startAutoSave" dnd-app/src/renderer/src --include="*.ts*" | grep -v test` → the only call site imports from `game-auto-save`, not `auto-save`.

**Expected behavior:** Either (a) the snapshot/version engine in `auto-save.ts` is wired to a real caller (and the Settings section governs the autosave that actually runs), or (b) the orphaned engine + its Settings section are removed/consolidated into `game-auto-save.ts`. Either way, a shipped "fix" should be reachable by users, and a Settings toggle must control something.

**Hypothesis / root cause:** `auto-save.ts` looks like an earlier generation of the autosave system that was superseded by `game-auto-save.ts` (game state) and `builder-auto-save.ts` (builder drafts) but never deleted; its Settings UI and now a bug-fix + dedicated test suite (`auto-save-eviction.test.ts`) continue to accrete on the orphan. The new tests pass against code users never execute.

**Suggested action:** Decide (a) vs (b) above. If (b): fold the eviction fix's semantics into whatever quota handling `game-auto-save.ts`/`autosave-snapshot-store.ts` needs, delete the orphan + `AutoSaveSection`, or re-point `AutoSaveSection` at the live engine's config. Also worth a lint/knip pass — the repo already runs `knip.json`; check why an export-only-consumed-by-tests module survives it.

**Environment:** web build v2.7.2 · deployed `assets/` inspection + repo `e1972fe0` source analysis

**Related files:** `dnd-app/src/renderer/src/services/io/auto-save.ts`, `game-auto-save.ts`, `autosave-snapshot-store.ts`, `components/settings/AutoSaveSection.tsx`, `hooks/use-game-effects.ts`, `services/io/auto-save-eviction.test.ts`

## 0. Deploy / infra — carried, re-verified live this run

### Content-hashed build assets still served `Cache-Control: no-cache` (carried from v2.7.1, unchanged)
- **Category:** performance · **Severity:** medium · **Domain:** both
- **Re-verified:** `curl -sI http://localhost:5000/DungeonTableOnline/assets/app-constants-CCwwQIPA.js` → `Cache-Control: no-cache` (2026-07-02, v2.7.2 assets). Full analysis, root cause (`_cache_policy` only long-caches `/static/`; `webapp_asset` passes no `max_age`), and suggested fix are in the v2.7.1 report — all still apply verbatim. Every cold boot still revalidates the full ~60-chunk module graph through the tunnel, and the Cloudflare edge still can't cache the immutable assets.

### VTT still inherits the site-wide kiosk/IDE CSP (carried from v2.7.1, unchanged)
- **Category:** security · **Severity:** low · **Domain:** both
- **Re-verified:** `GET /DungeonTableOnline/` still returns the BMO-wide policy (`script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdn.jsdelivr.net https://cdn.socket.io …`, YouTube img hosts, Google Fonts). The VTT needs none of these relaxations. Suggested route-scoped CSP override in `webapp_api.py` `_serve_index()` stands as written in the v2.7.1 report.

## 5. Campaign management — carried

### PHASE-60 web-api parity gap still live in deployed v2.7.2 — campaign Version History panel remains dead on web
- **Category:** bug · **Severity:** medium · **Domain:** dnd-app · already tracked in **PHASE-60**
- **Re-verified against v2.7.2:** `src/web/web-api.ts` at `e1972fe0` still defines neither `listCampaignVersions` nor `restoreCampaignVersion`; the current entry (`index.web-mUp4-kBG.js`) references `CampaignDetailPage-Ba-CKYhq.js`, which still contains both call sites, and no deployed chunk defines them (`grep -l "listCampaignVersions:" assets/*.js` → none). Third consecutive release with the dead panel deployed. Prioritize PHASE-60 (implement in `createWebApi()` or gate the panel behind `!isWebBuild()`).

## 13. i18n

### No locale drift this release; prior report's "same-value" counter is method-sensitive — standardize it
- **Category:** process · **Severity:** info · **Domain:** dnd-app
- **Description:** `en.json`/`es.json` are byte-identical between v2.7.1 and v2.7.2 (`git diff 248d37b1..e1972fe0 -- …/i18n/` is empty); keyed parity remains 6,541/6,541 with 0 missing / 0 extra. However, this run's flatten-and-compare counts **228** es values identical to English on the *same files* where the v2.7.1 report reported **168** (and a 163→168 "creep") — so the previous creep metric was an artifact of counting method (likely string-type-only vs all leaves, or normalization), not necessarily real drift. The carried PHASE-62 terminology items are unchanged in source.
- **Suggested action:** Pin the metric: count string-type leaves only, after `.strip()`, excluding keys matching an allowlist of intentional same-value classes (proper nouns, dice notation), and record the exact script in the QA instructions so successive unattended runs are comparable.

## Could not test (genuine blockers this run)

- **All interactive / in-browser surfaces — env: Claude-for-Chrome browser not connected during this unattended scheduled run** (`list_connected_browsers` → `[]`). Not exercised: Phase 1 navigation + i18n/theme/colorblind smoke; Phase 2 character builder + level-up; Phase 3 Library; Phase 4 Bastion + Calendar; Phase 5 campaign wizard; Phase 6 map & canvas; Phase 7 combat (3D dice / reduced-motion); Phase 8 DM tools; Phase 9 player views; Phase 10 AI DM (web AI remains stubbed — `web-api.ts` `ai: createAiStub()` — so web AI-DM coverage is bounded regardless); Phase 11 multiplayer via extra tabs (lobby, hosting modes, rejoin/resume matrix, End Session); Phase 13 settings/themes/accessibility and in-app console/network. Since the deployed v2.7.2 web bundle is functionally identical to v2.7.1 (see delta note), the interactive backlog is unchanged — **one attended/browser-connected run would clear it for v2.7.0 through v2.7.2 simultaneously.** Note for that run: include the new finding's UI check (Settings → Auto-Save toggle → confirm whether any autosave behavior changes).
- **Phase 12 Discord (DM bot)** — unattended; no Discord client available. Deferred to an attended run.
