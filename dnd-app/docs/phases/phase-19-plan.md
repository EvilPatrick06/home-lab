# SYSTEM OVERRIDE: IMPLEMENTATION MODE
You are Claude Opus 4.6 Max. Your job is to execute the following architectural plan for Phase 19 of the D&D VTT project.

Phase 19 covers **Packaging, Build Configuration, and Distribution** — Electron build toolchain, NSIS installer, auto-updater, code signing, platform targets, and asset paths. The audit found the Windows build pipeline functional but identified a **critical packaged path bug** in `srd-provider.ts`, missing Mac/Linux targets, no code signing, and a `release` script that doesn't clean stale artifacts.

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`) — ALL WORK IS HERE

Phase 19 is entirely build/config work on the Windows machine.

**Build System Files:**

| File | Role | Issues |
|------|------|--------|
| `package.json` | Build scripts (lines 6-22), electron-builder config (lines 62-105) | Windows only; `release` doesn't run `prerelease`; `signAndEditExecutable: true` but no cert config |
| `electron.vite.config.ts` | Vite config for main/preload/renderer | `__APP_VERSION__` injection, `manualChunks` |
| `resources/installer.nsh` | Custom NSIS macros for upgrade hardening | Functional |
| `resources/icon.ico` | App icon (~360KB) | Present |
| `resources/icon.png` | App icon PNG (~46KB) | Present |
| `scripts/prerelease-clean.mjs` | Cleans `dist/` before build | Not called by `release` script |
| `scripts/build-chunk-index.mjs` | Builds AI chunk index from reference files | Depends on gitignored `5.5e References/` |

**Path Bug Files:**

| File | Lines | Issue |
|------|-------|-------|
| `src/main/ai/srd-provider.ts` | 6-8 | **CRITICAL**: Packaged path uses `renderer/public/data/5e` — should be `renderer/data/5e` (Vite strips `public/` prefix) |
| `src/main/ai/context-builder.ts` | 27 | Uses `__dirname` (covered by Phase 6 Step 7 — overlap) |

**Updater:**

| File | Role |
|------|------|
| `src/main/updater.ts` | electron-updater wrapper, on-demand check/download/install |
| `src/renderer/src/components/ui/UpdatePrompt.tsx` | Floating update banner |
| `src/renderer/src/pages/AboutPage.tsx` | Full update flow UI (lines 139-220) |

### Raspberry Pi (`patrick@bmo`) — NO WORK THIS PHASE

---

## 📋 Core Objectives

### CRITICAL

| # | Issue | Impact |
|---|-------|--------|
| P1 | `srd-provider.ts` packaged path includes `public/` — AI SRD lookups fail in production | AI DM has no spell/monster/rule data in packaged build |

### IMPORTANT

| # | Issue | Impact |
|---|-------|--------|
| P2 | `release` script doesn't run `prerelease` — stale dist artifacts affect delta updates | Update delivery unreliable |
| P3 | No code signing — Windows SmartScreen blocks unsigned installers | Users see "Windows protected your PC" warning |
| P4 | Mac/Linux not supported — Windows-only build targets | Cannot distribute to non-Windows users |

### MINOR

| # | Issue | Impact |
|---|-------|--------|
| P5 | `5.5e References/` gitignored — chunk index may be empty | AI features degraded on clean clones |
| P6 | `context-builder.ts` dev path (Phase 6 overlap) | Non-fatal, covered by try-catch |

---

## 🛠️ Step-by-Step Execution Plan

### Sub-Phase A: Fix Critical Packaged Path (P1)

**Step 1 — Fix srd-provider.ts Packaged Path**
- Open `src/main/ai/srd-provider.ts`
- Find lines 6-8:
  ```typescript
  if (app.isPackaged) {
    return join(process.resourcesPath, 'app.asar', 'renderer', 'public', 'data', '5e')
  }
  ```
- Remove `'public'` from the path:
  ```typescript
  if (app.isPackaged) {
    return join(process.resourcesPath, 'app.asar', 'renderer', 'data', '5e')
  }
  ```
- **Rationale**: electron-vite copies `src/renderer/public/` contents to `out/renderer/` root. The `public/` directory name is stripped. When electron-builder packages `out/` into `app.asar`, the structure is `app.asar/renderer/data/5e/`, not `app.asar/renderer/public/data/5e/`.

**Step 2 — Verify All Packaged Paths**
- Search the entire `src/main/` directory for any path that includes `'public'` when packaged:
  ```
  grep -r "public.*data" src/main/
  ```
- Verify `context-builder.ts` line 27 (Phase 6 overlap — may already be fixed)
- Verify `chunk-builder.ts` line 287 uses `process.resourcesPath` correctly for `chunk-index.json`
- Verify `game-data-handlers.ts` resolves data paths correctly in packaged mode

**Step 3 — Create Path Utility**
- Create a shared utility for resolving data paths in both dev and packaged:
  ```typescript
  // src/main/paths.ts
  import { app } from 'electron'
  import { join } from 'node:path'
  import { is } from '@electron-toolkit/utils'

  export function getDataDir(): string {
    if (is.dev) {
      return join(__dirname, '..', '..', 'renderer', 'public', 'data', '5e')
    }
    return join(process.resourcesPath, 'app.asar', 'renderer', 'data', '5e')
  }

  export function getResourcePath(relativePath: string): string {
    if (is.dev) {
      return join(__dirname, '..', '..', relativePath)
    }
    return join(process.resourcesPath, relativePath)
  }
  ```
- Replace all direct path constructions in `srd-provider.ts`, `context-builder.ts`, `chunk-builder.ts`, and `game-data-handlers.ts` with calls to this utility

### Sub-Phase B: Fix Release Script (P2)

**Step 4 — Integrate Prerelease into Release**
- Open `package.json`
- Find the `release` script
- Modify to include `prerelease` and `build:index`:
  ```json
  "release": "npm run prerelease && npm run build:index && electron-vite build && electron-builder --win --publish always"
  ```
- This ensures:
  1. `dist/` is cleaned (no stale blockmaps)
  2. AI chunk index is rebuilt
  3. App is compiled
  4. Package is built and published

**Step 5 — Add Build Verification Script**
- Create `scripts/verify-build.mjs`:
  ```javascript
  // Verify required files exist after build
  const required = [
    'out/main/index.js',
    'out/preload/index.mjs',
    'out/renderer/index.html',
    'out/renderer/data/5e/spells/spells.json',
    'resources/chunk-index.json'
  ]
  for (const file of required) {
    if (!existsSync(file)) {
      console.error(`Missing required file: ${file}`)
      process.exit(1)
    }
  }
  console.log('Build verification passed')
  ```
- Add to release script: `npm run verify-build` after `electron-vite build` but before `electron-builder`

### Sub-Phase C: Code Signing Setup (P3)

**Step 6 — Document Code Signing Configuration**
- The `signAndEditExecutable: true` setting in `package.json` line 89 is already enabled
- electron-builder expects environment variables:
  - `CSC_LINK` — path to PFX/P12 certificate file
  - `CSC_KEY_PASSWORD` — certificate password
- Create a `.env.signing.template` file (NOT committed, added to .gitignore):
  ```
  # Windows Code Signing (required for production builds)
  # Obtain a code signing certificate from DigiCert, Sectigo, or similar CA
  CSC_LINK=path/to/certificate.pfx
  CSC_KEY_PASSWORD=your-certificate-password
  ```
- Add to `package.json` build section as comment or README instruction
- For immediate use without a purchased certificate: set `signAndEditExecutable: false` to avoid build errors when no cert is present

**Step 7 — Conditional Signing**
- Modify the build config to gracefully handle missing certificates:
  ```json
  "win": {
    "signAndEditExecutable": false,
    "sign": "./scripts/sign.mjs"
  }
  ```
- Create `scripts/sign.mjs`:
  ```javascript
  // Only sign if CSC_LINK is set; skip silently otherwise
  export default async function sign(configuration) {
    if (!process.env.CSC_LINK) {
      console.log('Skipping code signing (CSC_LINK not set)')
      return
    }
    // Default signing behavior
    const { signWindows } = await import('electron-builder')
    return signWindows(configuration)
  }
  ```

### Sub-Phase D: Mac/Linux Platform Targets (P4)

**Step 8 — Add macOS Build Configuration**
- Open `package.json`
- Add `mac` section to the build config:
  ```json
  "mac": {
    "category": "public.app-category.games",
    "target": ["dmg", "zip"],
    "icon": "resources/icon.png",
    "hardenedRuntime": true,
    "gatekeeperAssess": false
  },
  "dmg": {
    "contents": [
      { "x": 130, "y": 220 },
      { "x": 410, "y": 220, "type": "link", "path": "/Applications" }
    ]
  }
  ```
- Add build script: `"build:mac": "npm run build:index && electron-vite build && electron-builder --mac"`
- Note: macOS builds require running on a Mac (cross-compilation not supported for DMG/notarization)

**Step 9 — Add Linux Build Configuration**
- Add `linux` section:
  ```json
  "linux": {
    "target": ["AppImage", "deb"],
    "category": "Game",
    "icon": "resources/icon.png"
  }
  ```
- Add build script: `"build:linux": "npm run build:index && electron-vite build && electron-builder --linux"`
- Linux builds can be cross-compiled from Windows using Docker (electron-builder supports this)

**Step 10 — Platform-Specific Path Fixes**
- The `getDataDir()` utility from Step 3 handles path differences
- Verify `app.getPath('userData')` works correctly on all platforms:
  - Windows: `%APPDATA%/dnd-vtt/`
  - macOS: `~/Library/Application Support/dnd-vtt/`
  - Linux: `~/.config/dnd-vtt/`
- Verify all `path.join()` calls use forward slashes or `path.sep` for cross-platform compatibility
- Check for any Windows-specific paths (e.g., backslashes, drive letters) hardcoded in the codebase

### Sub-Phase E: Chunk Index Resilience (P5)

**Step 11 — Handle Missing 5.5e References Gracefully**
- Open `scripts/build-chunk-index.mjs`
- If `5.5e References/` directory doesn't exist, output a valid but empty chunk index:
  ```javascript
  if (!existsSync(REFERENCES_DIR)) {
    console.warn('5.5e References directory not found — generating empty chunk index')
    writeFileSync(OUTPUT, JSON.stringify({ chunks: [], version: 1 }))
    process.exit(0)
  }
  ```
- This ensures `npm run build:index` never fails, even on clean clones without reference files
- The AI will operate with reduced context (no SRD chunks) but won't crash

**Step 12 — Add Chunk Index to .gitattributes**
- `resources/chunk-index.json` is gitignored (correct — it's a build artifact)
- Add a note in the README or CONTRIBUTING.md explaining that `build:index` must be run before the first build
- Consider checking in a minimal default `chunk-index.json` with basic rules/glossary

### Sub-Phase F: Updater Robustness

**Step 13 — Add Automatic Update Check on Startup**
- Open `src/main/updater.ts`
- Currently update checks are on-demand only
- Add an optional background check after app startup (with 30-second delay to avoid blocking startup):
  ```typescript
  export function scheduleUpdateCheck() {
    setTimeout(async () => {
      try {
        const result = await autoUpdater.checkForUpdates()
        if (result?.updateInfo) {
          // Notify renderer about available update
          BrowserWindow.getAllWindows()[0]?.webContents.send(
            IPC_CHANNELS.UPDATE_STATUS,
            { status: 'update-available', version: result.updateInfo.version }
          )
        }
      } catch {
        // Silently fail — user can check manually
      }
    }, 30_000)
  }
  ```
- Call from `src/main/index.ts` after app initialization
- Respect a user setting: `checkForUpdatesOnStartup: boolean` (default: true)

---

## ⚠️ Constraints & Edge Cases

### Packaged Paths
- **ASAR archive**: When packaged, most app files are inside `app.asar`. Use `process.resourcesPath` + `app.asar` for ASAR contents, or `app.getAppPath()` which returns the ASAR root directly.
- **Unpacked files**: `extraResources` files (icon, chunk-index) are OUTSIDE the ASAR at `process.resourcesPath/`. Don't prepend `app.asar` for these.
- **Dev vs Production**: Always branch on `app.isPackaged` or `is.dev`. Never assume one path works for both.

### Code Signing
- **Cost**: Windows code signing certificates cost $200-400/year from standard CAs. Free alternatives (self-signed) don't bypass SmartScreen.
- **Azure Trusted Signing**: Microsoft offers a cheaper alternative for small developers. Consider for future.
- **CI/CD**: If using GitHub Actions, CSC_LINK should be a base64-encoded secret, not a file path.

### Cross-Platform
- **macOS builds require macOS**: electron-builder cannot produce signed/notarized DMGs on Windows. A macOS CI runner (GitHub Actions `macos-latest`) is needed.
- **Linux builds are cross-compilable**: electron-builder can produce AppImage/deb on Windows via Docker.
- **Native dependencies**: If any npm packages have native addons (e.g., better-sqlite3), they need to be rebuilt per platform. `electron-builder install-app-deps` handles this.

### Auto-Update
- **Background checks should be non-blocking**: The 30-second delay and try-catch ensure the app isn't slowed or crashed by update checks.
- **`win.isDestroyed()` check**: Same as Phase 17 NET-2 — verify the window exists before sending update status events.
- **GitHub rate limits**: If many users check for updates simultaneously, GitHub API rate limits (60/hour unauthenticated) may cause failures. The "silently fail" approach handles this.

Begin implementation now. Start with Sub-Phase A (Steps 1-3) — the packaged path bug is CRITICAL and directly causes AI features to fail in production. Then Sub-Phase B (Steps 4-5) for release script reliability. Sub-Phases C-F are important for production quality but can be done incrementally.
