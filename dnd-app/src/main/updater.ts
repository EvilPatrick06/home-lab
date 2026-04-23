/**
 * Auto-update module using electron-updater.
 *
 * Behavior:
 * - Checks for updates on demand (user clicks "Check for Updates")
 * - Downloads updates in the background
 * - Prompts user to restart — never forces mid-session
 * - DM is notified of available updates; players are not interrupted
 */

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

function sendStatus(win: BrowserWindow | null): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC_CHANNELS.UPDATE_STATUS, currentStatus)
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

/**
 * Register update-related IPC handlers.
 * Call once during app initialization.
 */
export function registerUpdateHandlers(): void {
  // Route electron-updater's own diagnostics into the app log file
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
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
    try {
      const autoUpdater = getAutoUpdater()
      autoUpdater.autoDownload = false
      autoUpdater.autoInstallOnAppQuit = false

      currentStatus = { state: 'checking' }
      sendStatus(win)

      const result = await autoUpdater.checkForUpdates()
      if (result && result.updateInfo.version !== autoUpdater.currentVersion.version) {
        currentStatus = { state: 'available', version: result.updateInfo.version }
      } else {
        currentStatus = { state: 'not-available' }
      }
      sendStatus(win)
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
      if (isNoRelease) {
        currentStatus = { state: 'not-available' }
      } else {
        currentStatus = { state: 'error', message: msg }
      }
      sendStatus(win)
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

      autoUpdater.removeAllListeners('download-progress')
      autoUpdater.on('download-progress', (progress: { percent: number }) => {
        // Re-resolve the active window on each tick so progress is always sent
        // to a live window even if focus changed after download started.
        const activeWin = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
        currentStatus = { state: 'downloading', percent: Math.round(progress.percent) }
        sendStatus(activeWin)
      })

      await autoUpdater.downloadUpdate()

      autoUpdater.autoInstallOnAppQuit = true

      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
      currentStatus = { state: 'downloaded', version: pendingVersion }
      sendStatus(win)
      return currentStatus
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      currentStatus = { state: 'error', message: msg }
      const errWin = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
      sendStatus(errWin)
      return currentStatus
    }
  })

  ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, async () => {
    try {
      const autoUpdater = getAutoUpdater()
      autoUpdater.quitAndInstall(true, true)
    } catch (err) {
      // quitAndInstall failed — force quit so the downloaded update can run on next launch
      logToFile('ERROR', 'quitAndInstall failed, forcing quit:', String(err))
      app.quit()
    }
  })
}
