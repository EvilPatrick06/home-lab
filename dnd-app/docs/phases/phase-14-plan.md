# Phase 14 — Packaging & Update Efficiency

## Context

Phase 14 makes packaging, uploading, and installing `dnd-app` updates dramatically faster, and decouples Ollama from the app distribution entirely. It is inserted as the **earliest** phase in the folder so Rule 1 (work the lowest-numbered plan that still exists) picks it up before Phase 15. Phases 15–36 are **not** renumbered — they cross-reference each other ~400 times by number, so a literal renumber would break every reference. `phase-14-*` simply sorts first.

The motivating problem, confirmed against the live release `v2.1.39`:

- The **Windows installer is 1.65 GiB** (`dnd-vtt-2.1.39-setup.exe` = 1,766,870,861 bytes) because the full Ollama distribution (binary + GPU runner libs, ~2 GB extracted) is bundled via `win.extraResources`. The **Linux AppImage is 234 MiB** (245,163,976 bytes) with no Ollama bundled.
- Every release uploads that 1.65 GiB to GitHub Releases (+ another copy to Actions debug artifacts on every run). Every user update re-downloads the whole thing because differential downloads are force-disabled (`disableDifferentialDownload = true`).
- The Windows CI build downloads + extracts the ~2 GB Ollama archive — 5–10 min when the upstream tag bumps.
- Updates *feel* silent even when the user hasn't enabled silent install, because the auto-flow flips `autoInstallOnAppQuit = true` (electron-updater then installs silently on the next quit) and `oneClick: true` makes the visible installer flash by.
- The release CI **serializes** the expensive electron-builder matrix behind a full ~6376-test vitest run, runs `npm ci` three times, and spins up a dedicated runner just to verify 6 asset names.

Phase 14 unbundles Ollama (1.65 GiB → ~230 MB), re-enables differential downloads **and lowers compression so the deltas are actually small**, trims duplicate-shipped dependencies, moves the "install Ollama" decision into the app on both platforms, fixes the silent/visible install behavior, and restructures the release pipeline.

### Decisions locked with the user (2026-05-28)

- **Numbering:** insert as `phase-14`; do **not** renumber 15–36.
- **Ollama "download" opt-in:** a **first-run in-app prompt** on both Windows and Linux (no OS-installer checkbox; the Windows installer stays one-click, Linux's `install-linux.sh` stays non-interactive).
- **App updates must not check or touch Ollama at all** — falls out of unbundling; verify no coupling remains.
- **Settings AI group** gets a real **Install Ollama** button (currently only a text hint) and keeps the existing **Check for Ollama Updates / Update Ollama** controls.
- **Silent install (request #5), final form:** **no separate helper window/process.** Silent ON → fully silent install (no UI). Silent OFF (default) → the normal visible installer. Fix the bug that makes installs feel always-silent.
- **Differential downloads:** re-enable.
- **Compression:** lower from `maximum` (see research §B/§C — coupled to differential effectiveness).
- **Code signing:** out of scope (no budget; self-signing doesn't help SmartScreen). Accept the click-through. Research §C5 lists no-cost mitigations to consider later.

## Research findings & evidence

All three areas the user asked to research — **(A) build/packaging speed, (B) the GitHub Release pipeline, (C) the user-side install + update experience** — investigated with sourced findings. The load-bearing cross-cutting insight: **NSIS compression and differential updates are coupled** — re-enabling differential without lowering compression saves almost nothing.

### A. Build / packaging speed + output size

| # | Finding | Evidence |
|---|---------|----------|
| A1 | `compression: maximum` gives **~no size benefit on Windows NSIS**, but increases build time and **slows AppImage cold-launch** (xz squashfs is decompressed every start). Official docs: maximum "doesn't lead to noticeable size difference, but increase build time." | [electron-builder #7483](https://github.com/electron-userland/electron-builder/issues/7483), [#6317](https://github.com/electron-userland/electron-builder/issues/6317), [config docs](https://www.electron.build/configuration.html) |
| A2 | **Dependency double-ship (biggest size lever):** electron-builder copies *all* prod `node_modules`, AND Vite bundles pure-JS libs into `out/`. Libs like `three`, `pixi.js`, `pdfjs-dist`, `jspdf`, `tiptap`, `cannon-es`, `fuse.js`, `immer` that are fully bundled are shipped **twice**. Moving fully-bundled pure-JS libs to `devDependencies` ships them only in the bundle. Can cut tens of MB. | [electron-builder #1824](https://github.com/electron-userland/electron-builder/issues/1824), [config docs](https://www.electron.build/configuration.html) |
| A3 | `chunk-index.json` is **5.0 MB** (`resources/chunk-index.json`). gzip-at-rest + inflate on read saves ~4 MB. | repo measurement |
| A4 | Vite speed: `build.minify: 'esbuild'` (20–40× faster than terser), `build.sourcemap: false` for prod (also keeps `.map` files out of the package), `build.reportCompressedSize: false` (gzip-size reporting is a measurable build cost). | [Vite build options](https://vite.dev/config/build-options) |
| A5 | Keep asar (default on). electron-builder auto-detects native modules to unpack; our deps are pure-JS/WASM so likely nothing needs manual `asarUnpack`. asar speeds install/launch FS enumeration; it does **not** compress. | [Electron asar docs](https://www.electronjs.org/docs/latest/tutorial/asar-archives), [config docs](https://www.electron.build/configuration.html) |
| A6 | **Leave `signAndEditExecutable: true`.** Setting it `false` skips the resedit pass but **strips the app icon + exe metadata** (name/version/publisher). Not worth the marginal build-time saving. | [#6934](https://github.com/electron-userland/electron-builder/issues/6934), [#4343](https://github.com/electron-userland/electron-builder/issues/4343) |

### B. GitHub Release pipeline

| # | Finding | Evidence |
|---|---------|----------|
| B1 | **Critical-path serialization:** `build` (electron-builder matrix) idles until the full ~6376-test vitest run in `preflight` finishes. Either start `build` (without `--publish`) in parallel and gate only the publish step on `preflight`, or shard vitest (`--shard=1/3` across parallel jobs) to cut preflight wall-clock ~3×. Largest single saving (minutes). | [GitHub dependency-caching ref](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching) |
| B2 | **Cache Electron + electron-builder downloads.** Pin `ELECTRON_CACHE`/`ELECTRON_BUILDER_CACHE` into `${{ github.workspace }}/.cache/...`, `actions/cache` keyed `${{ runner.os }}-electron-${{ hashFiles('package-lock.json') }}`. Saves the electron zip + winCodeSign/nsis/AppImage-tool downloads each run. Per-OS keys required. | [#3190](https://github.com/electron-userland/electron-builder/issues/3190), [#4267](https://github.com/electron-userland/electron-builder/issues/4267), [actions/cache](https://github.com/actions/cache) |
| B3 | **`verify-assets` wastes a whole runner** (queue + checkout) to grep 6 names. Fold the check into the Linux build job as a final step (`gh release view`, needs only `GH_TOKEN`). Keep the *check* (justified by the v2.0.1/2.0.2 partial-upload incidents), drop the dedicated runner. | release.yml:192–229 |
| B4 | **`if: always()` debug-artifact upload** pushes the .exe/.AppImage to Actions storage (14-day retention) on **every** run — billed GB-hours, pure waste on success since the binaries already live on the Release. Change to `if: failure()` or remove. | [upload-artifact](https://github.com/actions/upload-artifact), [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions) |
| B5 | Add `concurrency: { group: release-${{ github.ref_name }}, cancel-in-progress: false }` — **false** for releases (queue, never cancel a mid-publish run). `checkout` is already shallow (`fetch-depth: 1` default). `npm ci --prefer-offline --no-audit --no-fund` trims install when the npm cache is warm. | [concurrency docs](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency) |
| B6 | Redundant `npm ci` ×3: GitHub guidance is to cache the **package-manager cache** (`~/.npm`, already via `setup-node cache: npm`), not `node_modules` (breaks across OS/Node). Optional OS-keyed `node_modules` cache restores ~2× faster but invalidates on any lockfile change and must never be shared Win↔Linux. Lower priority than B1/B2. | [GitHub dependency-caching ref](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching), [setup-node#409](https://github.com/actions/setup-node/issues/409) |
| B7 | electron-builder's GitHub publisher has a **2-min request timeout** that's too short for big assets → "socket hang up"/timeout on upload. Set `publish.timeout: 300000`. Reliability (avoid re-runs), not raw speed. After unbundling, assets are small so this is mostly insurance. | [#7026](https://github.com/electron-userland/electron-builder/issues/7026), [#3140](https://github.com/electron-userland/electron-builder/issues/3140), [publish docs](https://www.electron.build/publish.html) |

### C. User-side install + update

| # | Finding | Evidence |
|---|---------|----------|
| C1 | **Compression ↔ differential coupling (load-bearing).** NSIS compression scrambles binary blocks, so even a tiny content change yields near-zero block reuse — one report: 99.21% of *app files* reusable but the *compressed installer* needed **97% re-download**. Re-enabling differential only pays off if compression is low. **Recommend benchmarking `normal` vs `store` for the NSIS payload in 14i** and choosing the lowest that keeps the installer acceptably small. | [#6265](https://github.com/electron-userland/electron-builder/issues/6265) |
| C2 | Differential is **self-healing** — on any mismatch it logs `fallback to full download` and pulls the whole installer. Known degradations (Content-Type mismatch, 50 MB delta cap) all fall back gracefully, never corrupt. Safe to re-enable; past corruption was the 1.7 GB bundle + a `signAndEditExecutable` flip. | [#3490](https://github.com/electron-userland/electron-builder/issues/3490), [#5755](https://github.com/electron-userland/electron-builder/issues/5755) |
| C3 | Keep `oneClick: true` + **visible** progress (your `isSilent=false` fix is correct; v2.1.29's "nothing happening" was `isSilent=true` suppressing the only UI). Keep **`perMachine: false`** — `true` forces UAC every install and breaks all-user installs. The running-exe file-lock loop (#2317/#2493/#6418) is already mitigated by the controlled `performInstall` + handle-release wait. | [#4057](https://github.com/electron-userland/electron-builder/issues/4057), [#6312](https://github.com/electron-userland/electron-builder/issues/6312), [nsis docs](https://www.electron.build/nsis.html) |
| C4 | **Linux update-channel conflict:** electron-updater's `AppImageUpdater` replaces the AppImage in place via the `$APPIMAGE` path; `install-linux.sh` pre-extracts to a separate dir for fast launch. In-app auto-update and the extracted-runtime launcher can desync. Pick ONE Linux update channel (in-app updater **or** re-running `install-linux.sh`) and document it. The launcher already re-extracts on mtime drift, so in-app update can work — verify in 14i. | [AppImageUpdater](https://www.electron.build/electron-updater.Class.AppImageUpdater.html), [AppImage update docs](https://docs.appimage.org/packaging-guide/optional/updates.html), [#6678](https://github.com/electron-userland/electron-builder/issues/6678), [#8351](https://github.com/electron-userland/electron-builder/issues/8351) |
| C5 | **SmartScreen without a paid cert:** reputation accrues **per-file-hash** and **resets every release** (unsigned = perpetually "unknown"). No-cost levers: submit each installer to Microsoft's malware-analysis portal (can clear the warning fast); slow release cadence so a hash accrues reputation; ship a "click More info → Run anyway" screenshot so it feels expected. Cheapest *real* fix is **Microsoft Trusted Signing ~$10/mo** (individual tier) — out of scope now but noted. **Self-signed certs do NOT help** (untrusted CA). | [MS Learn SmartScreen](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation), [Advanced Installer](https://www.advancedinstaller.com/prevent-smartscreen-from-appearing.html) |
| C6 | Update UX best practice: `autoDownload=false` (opt-in), background download with a `download-progress` %, default to **install-on-quit** with an explicit "Restart & install now" button, and surface "Downloaded — will install on restart" so it never feels silent. Our auto-flow already wires progress + a 1.5 s pre-install banner. | [electronjs updates](https://www.electronjs.org/docs/latest/tutorial/updates) |

### Headline numbers
- Windows installer: **1.65 GiB → ~230 MB** (unbundle Ollama) → minus the dependency double-ship cut (§A2) → potentially well under 230 MB.
- Per-release GitHub upload: **~1.65 GiB → ~hundreds of MB**, plus **no duplicate debug-artifact upload** (§B4).
- Repeat user update: **~230 MB → single-digit MB** *if* compression is lowered enough for block reuse (§C1).
- CI wall-clock: build no longer waits on the full test suite (§B1) + cached Electron/builder downloads (§B2) + no 2 GB Ollama fetch (§14a) + one fewer runner (§B3).

## Depends on / blocks
- Depends on: none (earliest phase).
- Blocks: none numerically. Informational: touches `updater.ts` / `ollama-manager.ts` / `OllamaManagement.tsx` / `package.json` build config / `release.yml` that later AI/release work assumes — land first.

## Files touched
| Path | Role |
|------|------|
| `dnd-app/package.json` | Remove `build.win.extraResources` Ollama entry; lower `compression`; audit `dependencies`→`devDependencies` for double-shipped pure-JS libs (§A2); `publish.timeout`; `removePackageScripts`/`removePackageKeywords` if not default |
| `dnd-app/electron.vite.config.*` | `build.sourcemap: false`, `minify: 'esbuild'`, `reportCompressedSize: false` (§A4) |
| `.github/workflows/release.yml` | Remove 3 Windows Ollama steps; parallelize build vs preflight / gate publish (§B1); cache Electron + builder dirs (§B2); fold `verify-assets` into build (§B3); debug artifact `if: failure()` (§B4); `concurrency` group (§B5); `npm ci` flags |
| `dnd-app/src/main/ai/ollama-manager.ts` | Drop bundled-binary detection branch; add cross-platform install path (Linux `install.sh`, macOS best-effort) so `downloadOllama`/`installOllama`/`updateOllama` no longer hard-fail off-Windows |
| `dnd-app/src/main/ipc/ai-handlers.ts` | Wire cross-platform install; ensure progress events flow for Linux (indeterminate) |
| `dnd-app/src/main/updater.ts` | Re-enable differential (drop `disableDifferentialDownload = true` ×2); remove `autoInstallOnAppQuit = true`; rewrite silent/Ollama-bundle comments |
| `dnd-app/src/renderer/src/components/ui/OllamaManagement.tsx` | Add **Install Ollama** button to not-installed branch; verify update-check controls |
| `dnd-app/src/renderer/src/components/<new>/OllamaFirstRunPrompt.tsx` | New first-run "Install Ollama for local AI?" modal (Win + Linux) |
| `dnd-app/src/renderer/src/pages/SettingsPage.tsx` | "Ollama AI" + "Updates" sections; silent-checkbox copy tweak |
| `dnd-app/src/shared/ipc-channels.ts` / `ipc-schemas.ts` | New IPC channel(s) for first-run prompt / Linux install if needed; schema |
| `dnd-app/resources/chunk-index.json` + loader | gzip-at-rest + inflate on read (§A3) — optional size win |
| `dnd-app/scripts/build/fetch-ollama.mjs` | No longer wired into CI; keep for optional local bundling or delete |
| `dnd-app/scripts/build/install-linux.sh` | Reference — Ollama note stays accurate |
| `CLAUDE.md` / `dnd-app/docs` release notes | Update installer-size + asset expectations + Linux update-channel decision |

## Sub-phase summary
| # | Sub-phase | Theme |
|---|-----------|-------|
| 14a | Unbundle Ollama (Windows) | Remove `extraResources` Ollama + 3 CI Ollama steps + bundled-path detection. 1.65 GiB → ~230 MB |
| 14b | Cross-platform Ollama install | `ollama-manager` install/update for Linux (+ macOS) instead of Windows-only hard-fail |
| 14c | First-run "Install Ollama?" prompt | One-time in-app modal on first launch (Win + Linux), gated by a settings flag |
| 14d | Settings AI group controls | Add **Install Ollama** button; verify **Check/Update Ollama** (requests #3 + #4) |
| 14e | App-update decouple + differential + compression | Re-enable differential, lower compression (§C1 coupling), confirm zero Ollama coupling (requests #2 + #6) |
| 14f | Silent/visible install fix | Silent ON = fully silent, OFF = visible; remove the always-silent quit-install bug (request #5) |
| 14g | App build size + Vite speed | Dependency double-ship audit (§A2), Vite minify/sourcemap/report (§A4), gzip chunk-index (§A3), asar (§A5) |
| 14h | CI / release-pipeline restructure | Parallelize build vs preflight (§B1), cache Electron/builder (§B2), fold verify-assets (§B3), artifact `if: failure()` (§B4), concurrency (§B5), publish.timeout (§B7) |
| 14i | Verification, benchmark & docs | Cut test release; **benchmark differential delta at `normal` vs `store`** (§C1); verify install/update/prompt; decide+document Linux update channel (§C4); update docs |

## Sub-phase details

### 14a — Unbundle Ollama (Windows)
**Files:** `package.json`, `.github/workflows/release.yml`, `ollama-manager.ts`
**Steps:**
1. Delete the `build.win.extraResources` array entry copying `resources/ollama/windows/` → `ollama/` (keep the top-level icon/chunk-index `extraResources`).
2. In `release.yml`, remove the three Windows Ollama steps: **Resolve latest Ollama tag** (118–137), **Cache bundled Ollama** (139–145), **Bundle Ollama (Windows)** (147–149). Update the header comment (21–24).
3. In `ollama-manager.ts`, remove the bundled-binary branch of `getBundledOllamaPath` (94–119) and its call in `detectOllama` (168–173). Detection falls back to system paths + PATH + running server (keep those).
4. `fetch-ollama.mjs`: now unused by CI — keep for opt-in local bundling (document `BUNDLE_OLLAMA`) or delete. Recommend keep + "not used in CI" note.
**Acceptance:** Windows release `setup.exe` is low-hundreds-of-MB with no `resources/ollama/` inside; `detectOllama` still finds a system Ollama; CI Windows job no longer downloads the 2 GB archive.

### 14b — Cross-platform Ollama install
**Files:** `ollama-manager.ts`, `ai-handlers.ts`
**Steps:**
1. Replace the off-Windows throws in `downloadOllama` (247–255) / `installOllama` (298–303) with real paths: Linux → spawn `curl -fsSL https://ollama.com/install.sh | sh` (capture stdout/stderr for errors); macOS → `brew install ollama` if `brew` present, else surface the `ollama.com/download` instruction (best-effort, not a shipped target). Keep the Windows `OllamaSetup.exe /SILENT /NORESTART` path.
2. Linux install has no parseable progress → emit an **indeterminate** signal (e.g. `phase: 'installing'`) so the UI shows a spinner, not a fake bar. Keep the Windows download percentage.
3. `updateOllama` (533–536) inherits the cross-platform path; verify it upgrades in place on Linux.
4. **Preserve** the temp-dir + `.exe` path guard (304–311) — security-relevant.
**Acceptance:** Linux install runs `install.sh` and `detectOllama` then reports `installed: true`; failures return the captured error. Windows unchanged. No unhandled rejection on macOS.

### 14c — First-run "Install Ollama?" prompt
**Files:** new `OllamaFirstRunPrompt.tsx`, app shell wiring, `ipc-channels.ts`/`ipc-schemas.ts` (if needed), settings
**Steps:**
1. Add settings flag `ollamaFirstRunPrompted` (default `false`). On first launch where it's `false` **and** Ollama isn't already detected, show a one-time modal: "Install Ollama for local AI? … You can also do this later in Settings → Ollama AI." with **Install** / **Not now**.
2. **Install** → reuse 14b path + the existing `AI_OLLAMA_PROGRESS` stream (percent on Win, spinner on Linux); on completion set the flag + refresh detection.
3. **Not now** → set the flag, close; never auto-show again.
4. One code path for both platforms (platform difference lives in `ollama-manager`).
**Acceptance:** Fresh profile → modal once; either choice sets the flag (never reappears); Install ends with Ollama detected; a profile that already has Ollama never sees it.

### 14d — Settings AI group controls (requests #3 + #4)
**Files:** `OllamaManagement.tsx`
**Steps:**
1. Not-installed branch (208–229) currently shows text + link + Re-check only. Add an **Install Ollama** button → 14b path, progress, then `refreshAll()`. Keep Re-check.
2. Verify installed-state controls (234–262): **Check for Updates** (`checkOllamaUpdate`) + **Update Ollama** (`updateOllama`) render regardless of running state (they sit above the running-gate at 294 — keep). Route `updateOllama` through the cross-platform path so the Update button works on Linux.
3. Confirm `AiProviderSetup.tsx handleAutoSetup` (148) still works (same IPC); now also works on Linux via 14b.
**Acceptance:** Ollama absent → working **Install Ollama** button (Win + Linux). Ollama present → **Check/Update** work on both platforms.

### 14e — App-update decouple + differential + compression (requests #2 + #6)
**Files:** `updater.ts`, `package.json`
**Steps:**
1. Remove `autoUpdater.disableDifferentialDownload = true` in both the manual download handler (236) and the auto-flow (322). Blockmap/`latest*.yml` already ship — this flag is the only gate.
2. Lower `package.json build.compression` from `maximum` — **14i benchmarks `normal` vs `store`** and picks the lowest that keeps the installer acceptably small (§C1: high compression makes NSIS deltas ~97% full, defeating differential).
3. Rewrite the comment (231–236) justifying disabling differential "with the 1.7 GB installer (Ollama bundle)" — gone post-14a.
4. Confirm the update flow has **zero** Ollama references (grep); add a header note that Ollama is fully decoupled from app updates.
**Acceptance:** N→N+1 downloads only changed bytes (small `download-progress` total); completes + relaunches; no Ollama download/version-check during an app update.

### 14f — Silent/visible install fix (request #5)
**Files:** `updater.ts`
**Steps:**
1. Remove `autoUpdater.autoInstallOnAppQuit = true` from the auto-flow (329) — leaving it `false` means electron-updater never silently installs on the next quit. Install paths become: manual **Install & Restart** → `performInstall(false)` (visible); auto-flow with auto-restart on → `performInstall(prefs.autoInstallSilent)` (honors the checkbox).
2. Confirm the mapping: **Silent OFF (default)** → visible installer; **Silent ON** → fully silent `/S`. **No separate helper window** (out of scope per user).
3. Keep `oneClick: true` + `perMachine: false` (§C3). Rewrite the `UPDATE_INSTALL` comment (265–282); delete the obsolete v2.1.29 narrative.
4. Tweak `SettingsPage.tsx` silent-checkbox copy (638–642): "On = no installer window; Off = normal installer shown."
**Acceptance:** Checkbox OFF → every install shows the visible installer; ON → fully silent. No path goes silent while OFF.

### 14g — App build size + Vite speed (§A)
**Files:** `package.json`, `electron.vite.config.*`, `resources/chunk-index.json` + loader
**Steps:**
1. **Dependency double-ship audit (§A2):** for each of the 26 prod deps, confirm whether Vite fully bundles it into `out/`. Move fully-bundled pure-JS libs (candidates: `three`, `pixi.js`, `pdfjs-dist`, `jspdf`, `tiptap/*`, `cannon-es`, `fuse.js`, `immer`, `@msgpack/msgpack`, `@tanstack/react-virtual`) to `devDependencies`. **Keep in `dependencies`** anything `require`d at runtime by path or with native binaries. Test the **packaged** app, not just dev — this is the riskiest step.
2. Vite (§A4): `build.minify: 'esbuild'`, `build.sourcemap: false` (prod), `build.reportCompressedSize: false`. Ensure `**/*.map` excluded from the package `files`.
3. gzip `chunk-index.json` at rest + inflate on read (§A3) — optional ~4 MB win.
4. Leave asar default-on; do not set `signAndEditExecutable: false` (§A5/A6). Set `removePackageScripts`/`removePackageKeywords` if not already default.
**Acceptance:** Packaged app launches + all features work (AI providers, PDF export, 3D dice/physics, tiptap editor, virtualized lists, msgpack transport). Installed size measurably smaller than the post-14a baseline.

### 14h — CI / release-pipeline restructure (§B)
**Files:** `.github/workflows/release.yml`, `package.json` (`publish.timeout`)
**Steps:**
1. **Parallelize (§B1):** split `build` into `electron-vite build && electron-builder --<os>` *without* `--publish` running in parallel with `preflight`, then a `publish` step/job that `needs: [preflight, build]`. (Or shard vitest 3-way to shrink preflight.) Keep publish strictly downstream of `preflight` so a test-failing build never ships.
2. **Cache Electron/builder (§B2):** export `ELECTRON_CACHE`/`ELECTRON_BUILDER_CACHE` to `${{ github.workspace }}/.cache/...`; `actions/cache` keyed `${{ runner.os }}-electron-${{ hashFiles('dnd-app/package-lock.json') }}`.
3. **Fold `verify-assets` (§B3)** into the Linux build job as a final `gh release view` step; delete the standalone job.
4. **Debug artifact (§B4):** change `if: always()` → `if: failure()`.
5. **Concurrency (§B5):** `concurrency: { group: release-${{ github.ref_name }}, cancel-in-progress: false }`. Add `--prefer-offline --no-audit --no-fund` to `npm ci`.
6. **`publish.timeout: 300000`** in `package.json build.publish` (§B7).
**Acceptance:** Build starts without waiting on the full test suite; publish still gated on preflight; one fewer runner; no debug upload on success; cached Electron between runs; `verify-assets` check still green.

### 14i — Verification, benchmark & docs
**Files:** repo-wide; `CLAUDE.md`, `dnd-app/docs/*`
**Steps:**
1. Cut a test release (`scripts/release/cut.mjs` patch bump). Confirm size, all 6 assets present + blockmap/`latest*.yml`, folded verify step green.
2. **Benchmark the differential delta (§C1):** build N then N+1 with a small content-only change at `compression: normal` and at `store`; measure the actual delta the updater downloads; pick the compression that gives small deltas without an unreasonable installer. Record the numbers in the plan + release docs.
3. Install N → update to N+1 in-app: confirm differential (small) + visible installer (silent OFF) + fully silent (silent ON).
4. **Decide + document the Linux update channel (§C4):** in-app `AppImageUpdater` vs re-running `install-linux.sh`. Verify the chosen one works with the pre-extracted launcher.
5. Fresh profile on Win + Linux → first-run prompt once; Install runs the platform path; Ollama detected after.
6. Settings → Ollama AI: Install (absent) + Check/Update (present) on both platforms.
7. Update `CLAUDE.md` release section + `docs/RELEASE.md` (asset list / sizes / Ollama-bundling removal / Linux update channel).
**Acceptance:** All flows pass; measured differential delta recorded; docs reflect the new reality.

## Constraints & edge cases
- **Do NOT renumber 15–36.** `phase-14-plan.md` sorting first is the whole mechanism; touching 15–36 numbering breaks ~400 cross-references.
- **No code signing.** Accept SmartScreen. §C5 no-cost mitigations are optional future work, not this phase.
- **No separate updater window/process.** The visible NSIS installer (silent OFF) is the indicator; silent ON shows nothing by design.
- **`oneClick: true` + `perMachine: false` stay** (§C3). `perMachine: true` forces UAC + breaks all-user installs.
- **Compression is coupled to differential** (§C1) — do not re-enable differential (14e) and leave compression high; benchmark in 14i.
- **Dependency move (14g §A2) is the highest-risk step** — a runtime-`require`d lib moved to devDeps will crash only in the *packaged* app, not dev. Verify packaged, feature-by-feature.
- **Security guard** in `installOllama` (304–311) must stay. The Linux path runs the official `install.sh` over HTTPS — no unvalidated arbitrary-URL exec.
- **Linux install progress is indeterminate** — spinner, not a fake bar.
- **macOS is not a shipped target** (only `win`/`linux` in `build`). 14b's macOS branch is best-effort.
- **`install-linux.sh` stays non-interactive**; Ollama opt-in lives in-app (14c).
- **Settings flag migration:** `ollamaFirstRunPrompted` defaults `false`; gate the modal on `!detected` so existing Ollama users aren't nagged.
- **Don't gate publish on a non-preflight job** (14h §B1) — publishing a test-failing build is the one regression to avoid.

## Verification
- `grep -n "extraResources" dnd-app/package.json` — no Ollama entry (icons/chunk-index only).
- `grep -ni "ollama" .github/workflows/release.yml` — no fetch/cache/tag steps.
- `grep -n "disableDifferentialDownload\|autoInstallOnAppQuit = true" dnd-app/src/main/updater.ts` — both gone.
- Release `dnd-vtt-${ver}-setup.exe` size is low-hundreds-of-MB (vs 1.65 GiB v2.1.39); smaller still after 14g.
- Recorded N→N+1 differential delta (single-digit MB target) at the chosen compression.
- Settings → Ollama AI shows **Install Ollama** when absent (Win + Linux); fresh profile shows the prompt once.
- CI: build runs concurrently with preflight; publish gated on preflight; no debug upload on success.

## Completed
- Request #4 (check for Ollama updates in the AI group) — **PARTIALLY DONE** (`OllamaManagement.tsx:234-262`): **Check for Updates** (`checkOllamaUpdate`) + **Update Ollama** (`updateOllama`) already render when Ollama is installed. 14d only verifies them + makes `updateOllama` cross-platform.
- Linux already ships **without** bundled Ollama and `install-linux.sh` already declines to auto-install it — so 14a is Windows-only.
- Blockmap + `latest*.yml` differential metadata is **already generated/uploaded** on every release (verified on `v2.1.39`) — 14e only flips the runtime flag.
- Update auto-flow already wires `download-progress` + a 1.5 s pre-install banner (§C6) — UX scaffolding exists; 14f only fixes the silent-mode bug.
