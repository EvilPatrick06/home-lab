# Phase 19: Packaging Research — Composer 1.5

**Date:** March 9, 2025  
**Scope:** Full packaging analysis — build config, installer, assets, auto-update, signing, platform support

---

## 1. Electron Build Configuration

### 1.1 Build Toolchain
- **Build system:** electron-vite 5.x + electron-builder 26.x
- **Electron version:** 40.6.x
- **Main entry:** `./out/main/index.js` (package.json)
- **Output directory:** `out/` (electron-vite default) → packaged into `dist/` by electron-builder

### 1.2 Platform Targets

| Platform | Configured | Target Format | Script |
|----------|------------|---------------|--------|
| **Windows** | ✅ Yes | NSIS installer only | `build:win`, `release` |
| **macOS** | ❌ No | — | — |
| **Linux** | ❌ No | — | — |

**Critical gap:** Only Windows is configured. There is no `mac`, `dmg`, `linux`, `AppImage`, or `snap` configuration in `package.json` build section. The app cannot be built for Mac or Linux without adding platform-specific config.

### 1.3 Build Scripts (`package.json` lines 6–22)

| Script | Command | Notes |
|--------|---------|-------|
| `build` | `electron-vite build` | Produces `out/` only; no packaging |
| `build:win` | `build:index` + `electron-vite build` + `electron-builder --win` | Local Windows build |
| `release` | Same as build:win + `--publish always` | Publishes to GitHub releases |
| `prerelease` | `node scripts/prerelease-clean.mjs` | Cleans `dist/` before build |
| `build:index` | `node scripts/build-chunk-index.mjs` | Pre-build step for AI chunk index |
| `postinstall` | `electron-builder install-app-deps` + pdf.worker copy | Copies PDF.js worker into public |

**Issue:** `release` does **not** invoke `prerelease`. A clean build requires manually running `npm run prerelease` before `npm run release`. Otherwise stale artifacts (e.g. old `.blockmap`, `.yml`) may remain and affect delta updates.

---

## 2. Installer Configuration

### 2.1 NSIS Configuration (`package.json` lines 94–105)

- **Target:** NSIS only (`"target": ["nsis"]`)
- **Artifact name:** `${name}-${version}-setup.${ext}` → `dnd-vtt-1.9.9-setup.exe`
- **One-click:** `false` — user chooses install directory
- **Per-user install:** `perMachine: false`
- **Shortcuts:** Desktop always, Start Menu yes
- **Uninstall:** Does not delete app data (`deleteAppDataOnUninstall: false`)

### 2.2 Custom Installer Script (`resources/installer.nsh`)

Custom NSIS macros address known NSIS/electron-builder issues:

- **`customInit`:** Clears stale uninstall registry keys to avoid "app cannot be closed" retry loops during upgrades
- **`customCheckAppRunning`:** Uses `taskkill` and PowerShell to forcefully close app processes before install (no blocking dialog)
- **`customUnInstallCheck`:** Allows install to continue if previous uninstall had warnings
- **`customRemoveFiles`:** Uses `RMDir /r` instead of atomic RMDir to avoid failures on locked files during future upgrades

The installer experience is intentionally hardened for upgrade scenarios.

---

## 3. Assets, Fonts, and Resources

### 3.1 Required Assets

| Asset | Referenced In | Status |
|-------|---------------|--------|
| `resources/icon.ico` | `build.win.icon`, `build.extraResources`, `src/main/index.ts` line 52 | ✅ Present (~360 KB) |
| `resources/icon.png` | `build.extraResources` | ✅ Present (~46 KB) |
| `resources/chunk-index.json` | `build.extraResources`, `scripts/build-chunk-index.mjs` | ✅ Built at build time; gitignored |
| `resources/installer.nsh` | `build.nsis.include` | ✅ Present |

Icons and installer customizations are correctly present. `chunk-index.json` is produced by `build:index` before packaging.

### 3.2 Data / Game Assets

- **Location:** `src/renderer/public/data/`
- **Loading:** Via IPC `GAME_LOAD_JSON` → `src/main/ipc/game-data-handlers.ts`
- **Production path:** `join(__dirname, '..', 'renderer')` resolves to `out/renderer/` (Vite copies `public/` contents to renderer output root)
- **Bundling:** Vite copies `public/` into `out/renderer/`; JSON files are served via main process, not bundled into JS

### 3.3 Incorrect Packaged Path in SRD Provider (BUG)

**File:** `src/main/ai/srd-provider.ts` lines 6–8

```typescript
if (app.isPackaged) {
  return join(process.resourcesPath, 'app.asar', 'renderer', 'public', 'data', '5e')
}
```

Vite copies `public/` contents to the **root** of the renderer output. The built layout is `app.asar/renderer/data/5e/`, **not** `app.asar/renderer/public/data/5e/`.

**Fix:** Use `'renderer', 'data', '5e'` (remove `'public'`) when packaged.

### 3.4 Chunk Index for AI

- **Source:** `scripts/build-chunk-index.mjs` reads from `5.5e References/` (PHB2024, DMG2024, MM2025 markdown)
- **Output:** `resources/chunk-index.json` (gitignored, built by `build:index`)
- **Bundling:** `extraResources` copies it to `process.resourcesPath` root
- **Usage:** `src/main/ai/chunk-builder.ts` line 287 — `join(process.resourcesPath, 'chunk-index.json')` when packaged
- **Caveat:** `5.5e References/` is gitignored. If that directory is absent, `build:index` will skip those sources and produce an incomplete or empty index.

### 3.5 PDF.js Worker

- **postinstall** copies `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` → `src/renderer/public/pdf.worker.min.mjs`
- Bundled with renderer output and served from the renderer root.

### 3.6 Fonts

- No custom web fonts; uses system stack: `"Segoe UI", system-ui, -apple-system, sans-serif` (`src/renderer/src/styles/globals.css` line 11).
- No font files in `public/` or bundled assets.

---

## 4. Auto-Update

### 4.1 Implementation

- **Library:** `electron-updater` ^6.8.3
- **Module:** `src/main/updater.ts`
- **Registration:** `registerUpdateHandlers()` called from `src/main/index.ts` line 130

### 4.2 Behavior

- **On-demand only:** User-initiated "Check for Updates" (no automatic background checks)
- **Flow:** Check → Download on user action → Prompt to restart; never forces mid-session install
- **Status events:** `UPDATE_STATUS` IPC to renderer for UI feedback

### 4.3 Publish Configuration

```yaml
# dev-app-update.yml (excluded from package; publish in package.json used instead)
provider: github
owner: EvilPatrick06
repo: DnD
releaseType: release
```

`package.json` `build.publish` matches; electron-updater will use GitHub releases for updates.

### 4.4 Potential Issues

1. **GitHub release requirements:** A release must exist with the expected artifact (e.g. `dnd-vtt-1.9.9-setup.exe`) and `latest-release.yml` (or equivalent) for the updater to work.
2. **Error handling:** Update errors (404, no release, network) are classified as "not-available" in `updater.ts` (lines 84–95), so the UI shows "no update" instead of a raw error.
3. **Delta updates:** NSIS supports blockmap for delta updates. `prerelease` cleans `dist/` to avoid stale blockmaps; not running it before release can cause delta-update problems.

---

## 5. Build Scripts, Paths, and Packaging Errors

### 5.1 electron-vite Config (`electron.vite.config.ts`)

- Main, preload, renderer all use `externalizeDepsPlugin()`
- Renderer: React, Tailwind, code-splitting via `manualChunks`
- No custom `outDir`; default `out/` used
- `__APP_VERSION__` injected from `package.json`

### 5.2 electron-builder Config

- **appId:** `com.dnd-vtt.app`
- **productName:** `D&D Virtual Tabletop`
- **Compression:** `maximum`
- **buildResources:** `resources`
- **output:** `dist`
- **Exclusions:** Extensive via `files` (src, scripts, tests, config files, etc.)

### 5.3 Known Path / Packaging Concerns

| Item | Location | Risk |
|------|----------|------|
| `context-builder.ts` | Line 27: `path.join(__dirname, '..', '..', 'renderer', 'public', 'data', '5e')` | Uses `__dirname` from `out/main/`; in dev this resolves to project root `renderer/public/data/5e` which does not exist (actual path is `src/renderer/public/`). Code catches and continues; non-fatal. |
| `srd-provider.ts` | Packaged path includes `'public'` | **Broken** when packaged — files live at `renderer/data/5e/`, not `renderer/public/data/5e/` |

---

## 6. Code Signing

### 6.1 Windows

- **`signAndEditExecutable: true`** (package.json line 89)
- **No certificate config** in `package.json`; electron-builder expects:
  - `CSC_LINK` — PFX file or certificate
  - `CSC_KEY_PASSWORD` — certificate password
  - Or `CSC_IDENTITY_AUTO_DISCOVERY: true` for Azure Key Vault, etc.

**Without CSC_* env vars:** `signAndEditExecutable` will effectively be a no-op or may fail depending on electron-builder version. The app is built but **not signed** for production distribution.

### 6.2 macOS / Linux

Not applicable — no Mac or Linux targets configured.

---

## 7. Summary: Missing, Broken, or Incomplete

### Critical (Build / Runtime Fails)

1. **`srd-provider.ts` packaged path** — Uses `renderer/public/data/5e`; should use `renderer/data/5e` when packaged. AI SRD lookups will fail in production.

### Important (Quality / Reliability)

2. **Mac and Linux not supported** — No build targets; would require new platform config.
3. **`release` does not run `prerelease`** — Stale `dist/` artifacts can affect delta updates.
4. **No code signing config** — Windows builds are unsigned; SmartScreen and trust warnings likely.

### Minor / Informational

5. **`context-builder.ts` dev path** — Points to non-existent `renderer/public/` at project root; covered by try/catch.
6. **`5.5e References/` optional** — Chunk index build skips if missing; AI features may be degraded.
7. **`dev-app-update.yml` excluded** — Intentional; `package.json` publish config is used.

---

## 8. Recommendations

1. **Fix srd-provider:** Change packaged path to `join(process.resourcesPath, 'app.asar', 'renderer', 'data', '5e')`.
2. **Integrate prerelease:** Add `prerelease` to the `release` script, e.g. `"release": "npm run prerelease && npm run build:index && ..."`.
3. **Windows signing:** Configure `CSC_LINK` and `CSC_KEY_PASSWORD` (or appropriate signing method) for production builds.
4. **Mac/Linux support:** Add `mac` and `linux` sections to `package.json` build config when targeting those platforms.
