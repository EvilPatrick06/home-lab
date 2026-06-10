# dnd-app release reference

## Cutting a release

Use the helper — never tag manually (version drift between `package.json` and the
tag causes electron-builder to publish to the wrong release):

```bash
git stash push -u -m wip            # cut.mjs requires a clean tree
node dnd-app/scripts/release/cut.mjs X.Y.Z --notes-file /tmp/vX.Y.Z-notes.md
git stash pop
```

`cut.mjs` bumps `package.json`, refreshes the generated docs
(`scripts/build/sync-doc-counts.mjs` rewrites the version/date/count claims across
the READMEs + structure docs; `gen:ipc-surface` regenerates `docs/IPC-SURFACE.md`),
commits, tags, pushes, and pre-creates the GitHub Release with notes **as a
draft**. The tag push triggers `.github/workflows/release.yml`.

## Draft-until-verified (do not regress)

The release is created as a **draft** and is published (`gh release edit
--draft=false --latest`, the workflow's "Publish release" step) **only after**
the build matrix uploads all assets AND the verify-assets step confirms the 6
expected files are present. Why: electron-updater ignores draft releases, so the
**previous fully-built release stays "latest"** during the ~8–10 min build
window. Before this, a pre-created-but-not-yet-built release became "latest" with
no `latest.yml`, so the updater reported "up to date" and refused to fall back to
the last good release — and a *failed* build left an asset-less "latest" that
broke auto-update until the next success. With the draft flow, a failed build
just leaves an unpublished draft and users stay on the last good version.

## Expected assets (verified before the release is published)

1. `dnd-vtt-${ver}-setup.exe`
2. `dnd-vtt-${ver}-setup.exe.blockmap`
3. `dnd-vtt-${ver}-x86_64.AppImage`
4. `latest.yml`
5. `latest-linux.yml`
6. `install-linux.sh`

`builder-debug.yml` is electron-builder's internal glob dump — it is **excluded**
from the release upload (`release.yml` names `latest{,-linux}.yml` explicitly
rather than `*.yml`).

## Build config invariants (do not reintroduce)

- **No `build.win.sign` property.** It was removed in electron-builder 25; it now
  lives under `signtoolOptions.sign`. We don't sign (no `CSC_LINK`), so there is
  no `sign` property at all. Reintroducing it fails the build with
  *"configuration.win has an unknown property 'sign'"*.
- **No `signAndEditExecutable: false`.** Leaving it at the default (`true`)
  preserves the Windows installer icon + exe metadata (electron-builder #6934,
  #4343). Setting it `false` strips them.
- **`compression: normal`** — coupled to differential downloads. High NSIS
  compression scrambles blocks and defeats block reuse, so do not raise it back
  to `maximum` without re-measuring the N→N+1 delta.

## Update channels

### Auto-check default

Auto-**check**-on-launch defaults **ON** (`updater.ts loadAutoUpdatePrefs`: unset
→ on; only an explicit `autoCheckUpdates: false` disables it). It only checks +
shows a dismissible prompt — auto-**download** and auto-install stay opt-in
(`autoDownloadUpdates`/`autoInstallSilent` default false), so nothing is fetched
or installed without a click. Manual "Check for Updates" lives in Settings →
Updates and on the About page.

### Windows
electron-updater (`autoUpdater`) reads `latest.yml` + the `.blockmap` and performs
a **differential** download (only changed bytes). Differential downloads are
enabled (the `disableDifferentialDownload` flags were removed). Silent OFF
(default) shows the visible NSIS installer; Silent ON installs with `/S`.

### Linux — DECISION (Phase 14i)

**The supported Linux update channel is the in-app electron-updater
(`AppImageUpdater`), NOT re-running `install-linux.sh`.**

Rationale:
- `latest-linux.yml` ships on every release and records `blockMapSize`, so the
  AppImage's trailing blockmap footer drives a differential update — there is no
  separate `.AppImage.blockmap` sidecar (the blockmap is embedded in the
  AppImage itself; this is correct, not a missing asset).
- `AppImageUpdater` replaces the AppImage in place via the `$APPIMAGE` path.
- `install-linux.sh` pre-extracts the AppImage to a fast-launch directory and
  **re-extracts on mtime drift**, so when the in-app updater swaps the AppImage,
  the next launch detects the newer mtime and re-extracts automatically. The two
  mechanisms therefore compose; the launcher does not fight the updater.

`install-linux.sh` remains the **first-install** path (and a manual fallback if a
user wants to reinstall from scratch), but routine updates go through the in-app
updater. Do not wire a second auto-update mechanism into `install-linux.sh`.

## Ollama

Ollama is **not bundled** (Phase 14a). The app prompts to install it on first run
and exposes Install / Check / Update buttons in Settings → Ollama AI. App updates
are fully decoupled from Ollama — an app update never downloads or version-checks
Ollama.
