# Phase 14 — Packaging & Update Efficiency

## Context

Phase 14 makes packaging, uploading, and installing `dnd-app` updates dramatically faster, and decouples Ollama from the app distribution entirely. It is inserted as the **earliest** phase in the folder so Rule 1 (work the lowest-numbered plan that still exists) picks it up before Phase 15. Phases 15–36 are **not** renumbered — they cross-reference each other ~400 times by number, so a literal renumber would break every reference. `phase-14-*` simply sorts first.

The motivating problem, confirmed against the live release `v2.1.39`:

- The **Windows installer is 1.65 GiB** (`dnd-vtt-2.1.39-setup.exe` = 1,766,870,861 bytes) because the full Ollama distribution (binary + GPU runner libs, ~2 GB extracted) is bundled via `win.extraResources`. The **Linux AppImage is 234 MiB** with no Ollama bundled.
- Every release uploads that 1.65 GiB to GitHub Releases (+ another copy to Actions debug artifacts). Every user update re-downloads the whole thing because differential downloads are force-disabled (`disableDifferentialDownload = true`) — a workaround for the bundle's size and past blockmap corruption.
- The Windows CI build downloads + extracts the ~2 GB Ollama archive (cached by upstream tag) — 5–10 min when the tag bumps.
- Updates *feel* silent even when the user hasn't enabled silent install, because the auto-flow flips `autoInstallOnAppQuit = true` (which electron-updater installs silently on the next quit) and `oneClick: true` makes the visible installer flash by.

Phase 14 unbundles Ollama (turning a 1.65 GiB installer into ~230 MB), re-enables differential downloads (repeat updates drop to single-digit MB), moves the "install Ollama" decision into the app (a first-run prompt + a Settings button) on both Windows and Linux, fixes the silent/visible install behavior, and trims the CI/upload pipeline.

### Decisions locked with the user (2026-05-28)

- **Numbering:** insert as `phase-14`; do **not** renumber 15–36.
- **Ollama "download" opt-in:** a **first-run in-app prompt** on both Windows and Linux (no OS-installer checkbox; the Windows installer stays one-click, Linux's `install-linux.sh` stays non-interactive).
- **App updates must not check or touch Ollama at all** — falls out of unbundling; verify no coupling remains.
- **Settings AI group** gets a real **Install Ollama** button (currently only a text hint) and keeps the existing **Check for Ollama Updates / Update Ollama** controls.
- **Silent install (request #5), final form:** **no separate helper window/process.** Silent ON → fully silent install (no UI). Silent OFF (default) → the normal visible installer. Fix the bug that makes installs feel always-silent.
- **Differential downloads:** re-enable (installer is small after unbundling).
- **Compression:** switch `maximum` → `normal` (faster CI builds; differential keeps user downloads tiny).
- **Code signing:** out of scope. Self-signing still triggers SmartScreen and there is no budget; the app is for the user + friends. SmartScreen click-through is accepted.

## Depends on / blocks
- Depends on: none (earliest phase).
- Blocks: none numerically. Informational: touches the same `updater.ts` / `ollama-manager.ts` / `OllamaManagement.tsx` surfaces that later AI/release work assumes, so land this first.

## Files touched
| Path | Role |
|------|------|
| `dnd-app/package.json` | Remove `build.win.extraResources` Ollama entry; `compression: maximum` → `normal` |
| `.github/workflows/release.yml` | Remove the three Windows Ollama steps (resolve tag, cache, fetch); make debug-artifact upload conditional; add electron/electron-builder cache; update header comment |
| `dnd-app/src/main/ai/ollama-manager.ts` | Drop the bundled-binary detection branch; add a cross-platform install path (Linux `install.sh`, macOS) so `downloadOllama`/`installOllama`/`updateOllama` no longer hard-fail off-Windows |
| `dnd-app/src/main/ipc/ai-handlers.ts` | Wire the cross-platform install path; ensure progress events flow for Linux install |
| `dnd-app/src/main/updater.ts` | Re-enable differential (drop `disableDifferentialDownload = true` ×2); remove `autoInstallOnAppQuit = true`; rewrite the silent/Ollama-bundle comments |
| `dnd-app/src/renderer/src/components/ui/OllamaManagement.tsx` | Add **Install Ollama** button to the not-installed branch; verify update-check controls |
| `dnd-app/src/renderer/src/components/<new>/OllamaFirstRunPrompt.tsx` | New first-run "Install Ollama for local AI?" modal (Win + Linux) |
| `dnd-app/src/renderer/src/pages/SettingsPage.tsx` | Reference — "Ollama AI" + "Updates" sections; possible silent-checkbox copy tweak |
| `dnd-app/src/shared/ipc-channels.ts` / `ipc-schemas.ts` | New IPC channel(s) if the first-run prompt or Linux install needs one; schema |
| `dnd-app/scripts/build/fetch-ollama.mjs` | Reference — no longer wired into CI; keep for optional local bundling or delete |
| `dnd-app/scripts/build/install-linux.sh` | Reference — Ollama note stays accurate (script still won't auto-install Ollama) |
| `CLAUDE.md` / `dnd-app/docs` release notes | Update installer-size + asset expectations after unbundling |

## Sub-phase summary
| # | Sub-phase | Theme |
|---|-----------|-------|
| 14a | Unbundle Ollama (Windows) | Remove `extraResources` Ollama + the 3 CI Ollama steps + bundled-path detection. 1.65 GiB → ~230 MB |
| 14b | Cross-platform Ollama install | `ollama-manager` install/update paths for Linux (+ macOS) instead of Windows-only hard-fail |
| 14c | First-run "Install Ollama?" prompt | One-time in-app modal on first launch (Win + Linux), gated by a settings flag |
| 14d | Settings AI group controls | Add **Install Ollama** button; verify **Check for Updates / Update Ollama** (requests #3 + #4) |
| 14e | Decouple app-update + differential | Re-enable differential downloads; confirm update flow never checks/touches Ollama (requests #2 + #6) |
| 14f | Silent/visible install fix | Silent ON = fully silent, OFF = visible; remove the always-silent quit-install bug (request #5) |
| 14g | CI / upload efficiency | `normal` compression, conditional debug-artifact upload, electron build cache (request #6) |
| 14h | Verification & docs | Cut a test release; verify size, differential, install/update, prompt; update release docs |

## Sub-phase details

### 14a — Unbundle Ollama (Windows)
**Files:** `dnd-app/package.json`, `.github/workflows/release.yml`, `dnd-app/src/main/ai/ollama-manager.ts`
**Steps:**
1. In `package.json`, delete the `build.win.extraResources` array entry that copies `resources/ollama/windows/` → `ollama/`. (Leave the top-level `extraResources` icons/chunk-index entries intact.)
2. In `release.yml`, remove the three Windows-only Ollama steps: **Resolve latest Ollama tag** (118–137), **Cache bundled Ollama** (139–145), **Bundle Ollama (Windows)** (147–149). Update the header comment block (21–24) that documents Ollama bundling.
3. In `ollama-manager.ts`, remove the bundled-binary branch of `getBundledOllamaPath` (94–119) and its call site in `detectOllama` (168–173) — nothing is bundled anymore, so detection relies on `getPlatformInstallCandidates` + PATH + running-server. Keep those three checks.
4. Decide `fetch-ollama.mjs`: it's now unused by CI. Either keep it for opt-in local bundling (document `BUNDLE_OLLAMA`) or delete it. Recommend keep + note "not used in CI" — low cost, useful escape hatch.
**Acceptance:** A Windows release build produces a `dnd-vtt-${ver}-setup.exe` in the low-hundreds-of-MB range (no `resources/ollama/` inside the asar/resources). `detectOllama` still finds a system-installed Ollama on Windows. CI Windows job no longer downloads the ~2 GB archive.

### 14b — Cross-platform Ollama install
**Files:** `dnd-app/src/main/ai/ollama-manager.ts`, `dnd-app/src/main/ipc/ai-handlers.ts`
**Steps:**
1. `downloadOllama`/`installOllama` currently throw off-Windows (247–255, 298–303). Replace the throw with a real Linux path: run the official `curl -fsSL https://ollama.com/install.sh | sh` in a spawned shell (capture stdout/stderr for the error message). macOS: shell out to `brew install ollama` if `brew` exists, else surface the `ollama.com/download` instruction (best-effort; macOS isn't a shipped target). Keep the Windows `OllamaSetup.exe` `/SILENT /NORESTART` path unchanged.
2. The Linux installer emits no parse-friendly progress; emit an **indeterminate** progress signal (e.g. `percent: -1` or a `phase: 'installing'` flag) so the UI shows a spinner rather than a fake bar. Keep the Windows download `onProgress` percentage.
3. `updateOllama` (533–536) already chains download+install — it inherits the cross-platform path automatically. Verify it works on Linux (re-runs `install.sh`, which upgrades in place).
4. Preserve the existing temp-dir path guard for the Windows installer (304–311) — security-relevant, do not weaken.
**Acceptance:** On Linux, calling the install path runs `install.sh` and `detectOllama` reports `installed: true` afterward; failures return the captured shell error. Windows path unchanged. No unhandled rejection on macOS.

### 14c — First-run "Install Ollama?" prompt
**Files:** new `OllamaFirstRunPrompt.tsx`, `SettingsPage.tsx`/app shell wiring, `ipc-channels.ts`/`ipc-schemas.ts` (if a new channel is needed), settings persistence
**Steps:**
1. Add a settings flag (e.g. `ollamaFirstRunPrompted: boolean`, default `false`) read at app launch. On first launch where it's `false` **and** Ollama isn't already detected, show a one-time modal: "Install Ollama for local AI? It powers the optional offline AI Dungeon Master. You can also do this later in Settings → Ollama AI." with **Install** / **Not now** + a "don't ask again" implied by setting the flag either way.
2. On **Install** → reuse the 14b install path + the existing `AI_OLLAMA_PROGRESS` event stream; show progress (percent on Windows, spinner on Linux). On completion, set the flag and refresh detection.
3. On **Not now** → set the flag, close. Never auto-show again (Settings button remains the path).
4. Same component/flow on Windows and Linux — one code path (the platform difference lives entirely in `ollama-manager`).
**Acceptance:** Fresh profile → modal appears once. Choosing either option sets the flag so it never reappears. Choosing Install runs the platform install and ends with Ollama detected. A profile that already has Ollama never sees the modal.

### 14d — Settings AI group controls (requests #3 + #4)
**Files:** `dnd-app/src/renderer/src/components/ui/OllamaManagement.tsx`
**Steps:**
1. The not-installed branch (208–229) currently only shows text + an `ollama.com` link + Re-check. Add an **Install Ollama** button that calls the 14b install path, shows progress, then `refreshAll()`. Keep the Re-check button.
2. Verify the installed-state controls (234–262): **Check for Updates** → `checkOllamaUpdate`, and **Update Ollama** → `updateOllama`. Confirm they render whether or not the server is running (they're above the running-gate, 294 — keep it that way). Wire `updateOllama` through the now-cross-platform path so the Update button works on Linux too.
3. Confirm `AiProviderSetup.tsx` `handleAutoSetup` (148) still works (it calls the same IPC) — no change expected, but it now also works on Linux via 14b.
**Acceptance:** With Ollama absent, Settings → Ollama AI shows a working **Install Ollama** button (Win + Linux). With Ollama present, **Check for Updates** reports current/latest and **Update Ollama** upgrades it on both platforms.

### 14e — Decouple app-update + re-enable differential (requests #2 + #6)
**Files:** `dnd-app/src/main/updater.ts`
**Steps:**
1. Remove `autoUpdater.disableDifferentialDownload = true` in both the manual download handler (236) and the auto-flow (322). Differential/blockmap is already generated and uploaded (`*.blockmap`, `latest.yml`, `latest-linux.yml` all present on releases), so this is the only gate.
2. Rewrite the comment (231–236) that justified disabling differential "with the 1.7 GB installer (Ollama bundle)" — that rationale is gone post-14a.
3. Confirm the update flow has **zero** Ollama references (it currently has none — verify by grep) so app updates never check or touch Ollama. Add a one-line note in the module header that Ollama is fully decoupled from app updates.
**Acceptance:** A user on version N updating to N+1 downloads only the changed bytes (observe a small `download-progress` total, not ~230 MB). Update completes and relaunches. No Ollama download/version-check occurs during an app update.

### 14f — Silent/visible install fix (request #5)
**Files:** `dnd-app/src/main/updater.ts`
**Steps:**
1. Remove `autoUpdater.autoInstallOnAppQuit = true` from the auto-flow (329). Leaving it `false` (as set elsewhere) means electron-updater never silently installs on the next quit behind the user's back. The only install paths become: manual **Install & Restart** → `performInstall(false)` (visible); auto-flow with auto-restart on → `performInstall(prefs.autoInstallSilent)` (honors the checkbox).
2. Confirm the mapping end-to-end: **Silent install OFF (default)** → `performInstall(false)` → visible installer; **Silent install ON** → `performInstall(true)` → fully silent (`/S`, no UI). **No separate helper window/process** — explicitly out of scope per the user.
3. Keep `oneClick: true` (fast install). Update the long comment in the `UPDATE_INSTALL` handler (265–282) to reflect the final behavior and delete the now-obsolete v2.1.29 "no progress" narrative.
4. Optional copy tweak in `SettingsPage.tsx` silent-install checkbox description (638–642) to match: "On = no installer window at all; Off = the normal installer is shown."
**Acceptance:** With the checkbox OFF, every update install shows the visible installer. With it ON, the install is fully silent. There is no path where an unattended/quit-time install goes silent while the checkbox is OFF.

### 14g — CI / upload efficiency (request #6)
**Files:** `dnd-app/package.json`, `.github/workflows/release.yml`
**Steps:**
1. `package.json`: `build.compression` `"maximum"` → `"normal"`. Faster compression of the ~230 MB payload; differential keeps repeat downloads small regardless.
2. `release.yml`: make the **Upload artifacts (debug)** step (179–190) conditional on failure (`if: failure()`) instead of `if: always()` — stops re-uploading the full installer to Actions storage on every successful release (it's already on the Release).
3. `release.yml`: add a cache step for `~/.cache/electron` + `~/.cache/electron-builder` (Linux) and the Windows equivalents (`%LOCALAPPDATA%\electron\Cache`, `%LOCALAPPDATA%\electron-builder\Cache`) keyed on the electron version, so the matrix jobs don't re-download the Electron binary each run.
4. Leave `verify-assets` (192–229) as-is — the 6 expected assets are unchanged; only their sizes shrink.
**Acceptance:** A release build's Windows job finishes meaningfully faster (no 2 GB Ollama fetch, cached Electron). Successful releases no longer upload a debug artifact copy. The 6 assets still verify green.

### 14h — Verification & docs
**Files:** repo-wide; `CLAUDE.md`, `dnd-app/docs/*` release notes
**Steps:**
1. Cut a test release (patch bump via `scripts/release/cut.mjs`) and confirm: Windows `setup.exe` is low-hundreds-of-MB; both `*.blockmap` + `latest*.yml` present; `verify-assets` green.
2. Install N, then update to N+1 from inside the app — confirm differential download (small) + visible installer (silent OFF) + silent install (silent ON).
3. Fresh profile on Win + Linux → first-run prompt appears once; Install runs the platform path; Ollama detected after.
4. Settings → Ollama AI: Install button (when absent) + Check/Update (when present) work on both platforms.
5. Update `CLAUDE.md`'s release section + any `docs/RELEASE.md` notes that mention the 6 assets / Ollama bundling / 1.7 GB installer so they reflect the new reality.
**Acceptance:** All flows above pass; docs no longer reference Ollama bundling or the giant installer.

## Constraints & edge cases
- **Do NOT renumber 15–36.** `phase-14-plan.md` sorts first; that is the whole mechanism. Touching 15–36 numbering breaks ~400 cross-references.
- **No code signing.** Accept SmartScreen warnings. Do not add `signtoolOptions`/cert config.
- **No separate updater window/process.** Request #5's earlier "helper exe" idea is dropped — the visible NSIS installer (silent OFF) is the indicator; silent ON shows nothing by design.
- **`oneClick: true` stays.** The visible installer is brief but present; the "always silent" symptom was the `autoInstallOnAppQuit` bug, not oneClick.
- **Security guard:** keep the temp-dir + `.exe` path validation in `installOllama` (304–311). The Linux path runs the official `install.sh` over HTTPS — do not add an unvalidated arbitrary-URL/exec path.
- **Linux install progress is indeterminate** — `install.sh` gives no percentage. Show a spinner, not a fake bar.
- **Differential reliability:** past corruption was tied to the 1.7 GB installer + a `signAndEditExecutable` flip across v2.0→v2.1. At ~230 MB this risk is low, but 14h must actually exercise an N→N+1 differential update before trusting it broadly.
- **macOS is not a shipped target** (`build` has only `win`/`linux` targets). 14b's macOS branch is best-effort; don't invest in a mac build pipeline here.
- **`install-linux.sh` stays non-interactive** and keeps its "won't auto-install Ollama" note — Ollama opt-in lives in the app (14c), not the shell installer.
- **Settings flag migration:** `ollamaFirstRunPrompted` defaults `false`; existing users who already have Ollama must not be nagged — gate the modal on `!detected`.

## Verification
- `grep -n "extraResources" dnd-app/package.json` — no Ollama entry remains (icons/chunk-index only).
- `grep -ni "ollama" .github/workflows/release.yml` — no fetch/cache/tag steps remain.
- `grep -n "disableDifferentialDownload\|autoInstallOnAppQuit = true" dnd-app/src/main/updater.ts` — both gone.
- Release asset `dnd-vtt-${ver}-setup.exe` size is low-hundreds-of-MB (compare against the 1.65 GiB v2.1.39 baseline).
- Settings → Ollama AI shows an **Install Ollama** button when Ollama is absent (Win + Linux).
- Fresh profile shows the first-run prompt exactly once.
- N→N+1 update: differential download (small) + correct silent/visible behavior per the checkbox.

## Completed
- Request #4 (check for Ollama updates in the AI group) — **PARTIALLY DONE** (`OllamaManagement.tsx:234-262`): **Check for Updates** (`checkOllamaUpdate`) + **Update Ollama** (`updateOllama`) already render when Ollama is installed. 14d only needs to verify them and make `updateOllama` work cross-platform; the UI exists.
- Linux already ships **without** bundled Ollama (`release.yml` header; `getBundledOllamaPath` is Windows-only) and `install-linux.sh` already declines to auto-install Ollama — so 14a's unbundling work is Windows-only.
- The blockmap + `latest*.yml` differential metadata is **already generated and uploaded** on every release (verified on `v2.1.39`) — 14e only flips the runtime flag; no build-side work needed.
