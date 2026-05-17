/**
 * Auto-update module using electron-updater.
 *
 * v2.1.16 redesign:
 * - Hardened install path. Windows users were hitting a "Update &
 *   Restart" crash that needed multiple retries before the new
 *   build came up. Root cause was a 3-way race between the
 *   renderer's IPC reply, Electron's quit sequence, and the NSIS
 *   installer launch. The new flow:
 *     1. Reply to the IPC handler first.
 *     2. Cleanly close every BrowserWindow (gives renderers a tick
 *        to flush localStorage / sessionStorage writes).
 *     3. Wait a beat for those `close` events to fire.
 *     4. Call quitAndInstall.
 * - Optional auto-check on startup (settings.autoCheckUpdates).
 * - Optional auto-download when a new version is found
 *   (settings.autoDownloadUpdates).
 * - Optional auto-restart on download complete
 *   (settings.autoRestartAfterUpdate).
 * - Optional silent install reusing prior NSIS settings
 *   (settings.autoInstallSilent).
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import { logToFile } from './log'

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }

let currentStatus: UpdateStatus = { state: 'idle' }

function broadcastStatus(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.UPDATE_STATUS, currentStatus)
    }
  }
}

function getAutoUpdater() {
  const mod = require('electron-updater')
  const updater = mod.autoUpdater ?? mod.default?.autoUpdater ?? mod.default ?? mod
  if (typeof updater?.checkForUpdates !== 'function') {
    throw new Error('electron-updater: could not resolve a valid autoUpdater instance')
  }
  return updater
}

interface AutoUpdatePrefs {
  autoCheckUpdates: boolean
  autoDownloadUpdates: boolean
  autoRestartAfterUpdate: boolean
  autoInstallSilent: boolean
}

async function loadAutoUpdatePrefs(): Promise<AutoUpdatePrefs> {
  const defaults: AutoUpdatePrefs = {
    autoCheckUpdates: false,
    autoDownloadUpdates: false,
    autoRestartAfterUpdate: false,
    autoInstallSilent: false
  }
  try {
    const path = join(app.getPath('userData'), 'settings.json')
    const raw = await fs.readFile(path, 'utf-8')
    const data = JSON.parse(raw) as Partial<AutoUpdatePrefs>
    return {
      autoCheckUpdates: data.autoCheckUpdates === true,
      autoDownloadUpdates: data.autoDownloadUpdates === true,
      autoRestartAfterUpdate: data.autoRestartAfterUpdate === true,
      autoInstallSilent: data.autoInstallSilent === true
    }
  } catch {
    return defaults
  }
}

/**
 * Run the install / relaunch sequence with the v2.1.16 hardening:
 * close every window, wait for the close events to flush, then
 * quitAndInstall. `isSilent` controls whether the NSIS installer UI
 * surfaces (false = visible 1s window, true = no UI).
 */
function performInstall(isSilent: boolean): void {
  logToFile('INFO', `[updater] performInstall(isSilent=${isSilent}, isForceRunAfter=true)`)

  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      try {
        win.close()
      } catch (err) {
        logToFile('WARN', '[updater] window.close() failed during install:', String(err))
      }
    }
  }

  // Give the windows ~1500 ms to flush close handlers + persisted state
  // AND for the OS to fully release the file handle on dnd-vtt.exe.
  // Was 250 ms (v2.1.16) — wasn't enough on every Windows config: NSIS
  // would try to overwrite the still-locked .exe, the install would
  // silently abort, and the relaunch would bring back the old version.
  // 1500 ms is empirically enough headroom on every machine tested.
  setTimeout(() => {
    try {
      const autoUpdater = getAutoUpdater()
      logToFile('INFO', '[updater] calling quitAndInstall now')
      autoUpdater.quitAndInstall(isSilent, true)
    } catch (err) {
      logToFile('ERROR', '[updater] quitAndInstall failed, forcing quit:', String(err))
      app.quit()
    }
  }, 1500)
}

/**
 * Register update-related IPC handlers.
 * Call once during app initialization.
 */
export function registerUpdateHandlers(): void {
  try {
    const autoUpdater = getAutoUpdater()
    autoUpdater.logger = {
      info: (...args: unknown[]) => logToFile('INFO', '[updater]', ...args.map(String)),
      warn: (...args: unknown[]) => logToFile('WARN', '[updater]', ...args.map(String)),
      error: (...args: unknown[]) => logToFile('ERROR', '[updater]', ...args.map(String)),
      debug: () => {
        /* suppress debug noise */
      }
    }
  } catch {
    // Not yet packaged / electron-updater not available — ignore
  }

  ipcMain.handle(IPC_CHANNELS.APP_VERSION, () => {
    return app.getVersion()
  })

  ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, async () => {
    try {
      const autoUpdater = getAutoUpdater()
      autoUpdater.autoDownload = false
      autoUpdater.autoInstallOnAppQuit = false

      currentStatus = { state: 'checking' }
      broadcastStatus()

      const result = await autoUpdater.checkForUpdates()
      if (result && result.updateInfo.version !== autoUpdater.currentVersion.version) {
        currentStatus = { state: 'available', version: result.updateInfo.version }
      } else {
        currentStatus = { state: 'not-available' }
      }
      broadcastStatus()
      return currentStatus
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const isNoRelease =
        msg.includes('Cannot find module') ||
        msg.includes('ERR_UPDATER_') ||
        msg.includes('404') ||
        msg.includes('No published versions') ||
        msg.includes('net::') ||
        msg.includes('ENOTFOUND')
      currentStatus = isNoRelease ? { state: 'not-available' } : { state: 'error', message: msg }
      broadcastStatus()
      return currentStatus
    }
  })

  ipcMain.handle(IPC_CHANNELS.UPDATE_DOWNLOAD, async () => {
    try {
      if (currentStatus.state !== 'available') {
        return currentStatus
      }
      const autoUpdater = getAutoUpdater()
      const pendingVersion = currentStatus.version

      // Force full re-download (no differential / blockmap patching).
      // With the 1.7 GB installer (Ollama bundle), differential updates
      // are slow AND occasionally corrupt across structural changes
      // (e.g. v2.0 → v2.1 when signAndEditExecutable flipped). A full
      // re-download is bandwidth-expensive but reliable.
      autoUpdater.disableDifferentialDownload = true

      autoUpdater.removeAllListeners('download-progress')
      autoUpdater.on('download-progress', (progress: { percent: number }) => {
        currentStatus = { state: 'downloading', percent: Math.round(progress.percent) }
        broadcastStatus()
      })

      await autoUpdater.downloadUpdate()
      autoUpdater.autoInstallOnAppQuit = true
      currentStatus = { state: 'downloaded', version: pendingVersion }
      broadcastStatus()
      return currentStatus
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      currentStatus = { state: 'error', message: msg }
      broadcastStatus()
      return currentStatus
    }
  })

  ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, async () => {
    // Reply to the renderer FIRST, then schedule the install on the
    // next tick so the renderer's await resolves cleanly before any
    // quit sequence begins.
    //
    // Pass isSilent=false so the user sees a small progress modal
    // during install. The no-click-through behavior the user wants
    // comes from `oneClick: true` in the nsis build config — that's
    // a build-time flag that makes the installer skip the wizard
    // pages and auto-run. `isSilent=true` on top of oneClick goes
    // fully silent (no UI at all), which suppresses the very
    // progress indicator we want to keep. v2.1.29 had both set,
    // which is why "no progress, doesn't seem to do anything" was
    // the symptom — the installer was silently running and either
    // completing or failing with no feedback.
    setImmediate(() => performInstall(false))
    return { state: 'installing' as const }
  })
}

/**
 * Kick off the optional auto-check-on-startup flow. Called from
 * main/index.ts after `app.whenReady()`. Reads settings.json
 * directly — IPC isn't available yet at this point in startup.
 */
export async function maybeAutoCheckOnLaunch(): Promise<void> {
  const prefs = await loadAutoUpdatePrefs()
  if (!prefs.autoCheckUpdates) return

  // Defer slightly so the renderer is alive to receive status events.
  setTimeout(() => {
    void runAutoUpdateFlow(prefs)
  }, 5_000)
}

async function runAutoUpdateFlow(prefs: AutoUpdatePrefs): Promise<void> {
  try {
    const autoUpdater = getAutoUpdater()
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false

    currentStatus = { state: 'checking' }
    broadcastStatus()

    const result = await autoUpdater.checkForUpdates()
    if (!result || result.updateInfo.version === autoUpdater.currentVersion.version) {
      currentStatus = { state: 'not-available' }
      broadcastStatus()
      return
    }

    const pendingVersion = result.updateInfo.version
    currentStatus = { state: 'available', version: pendingVersion }
    broadcastStatus()

    if (!prefs.autoDownloadUpdates) return

    autoUpdater.disableDifferentialDownload = true
    autoUpdater.removeAllListeners('download-progress')
    autoUpdater.on('download-progress', (progress: { percent: number }) => {
      currentStatus = { state: 'downloading', percent: Math.round(progress.percent) }
      broadcastStatus()
    })
    await autoUpdater.downloadUpdate()
    autoUpdater.autoInstallOnAppQuit = true
    currentStatus = { state: 'downloaded', version: pendingVersion }
    broadcastStatus()

    if (!prefs.autoRestartAfterUpdate) return

    // Give the renderer a moment to surface the "downloaded" banner
    // before yanking it for the install. 1.5s is enough for users to
    // notice without being annoying.
    setTimeout(() => performInstall(prefs.autoInstallSilent), 1_500)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    currentStatus = { state: 'error', message: msg }
    broadcastStatus()
    logToFile('ERROR', '[updater] auto-flow failed:', msg)
  }
}
