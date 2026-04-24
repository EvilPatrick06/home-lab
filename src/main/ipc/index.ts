import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { MAX_READ_FILE_SIZE, MAX_WRITE_CONTENT_SIZE } from '../../shared/constants'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { isValidUUID } from '../../shared/utils/uuid'
import { logToFile } from '../log'
import { registerAiHandlers } from './ai-handlers'
import { registerAudioHandlers } from './audio-handlers'
import { registerCloudSyncHandlers } from './cloud-sync-handlers'
import { registerDiscordHandlers } from './discord-handlers'
import { registerGameDataHandlers } from './game-data-handlers'
import { registerPluginHandlers } from './plugin-handlers'
import { registerStorageHandlers } from './storage-handlers'

// Tracks paths returned by file dialogs so fs:read-file / fs:write-file
// only operate on user-selected locations or the app's own data directory.
// Values are timestamps for TTL expiry.
const dialogAllowedPaths = new Map<string, number>()
const DIALOG_PATH_TTL = 300_000 // 5 minutes

function addDialogPath(p: string): void {
  dialogAllowedPaths.set(resolve(p), Date.now())
}

function isDialogPathValid(p: string): boolean {
  const resolved = resolve(p)
  const timestamp = dialogAllowedPaths.get(resolved)
  if (timestamp === undefined) return false
  if (Date.now() - timestamp >= DIALOG_PATH_TTL) {
    dialogAllowedPaths.delete(resolved)
    return false
  }
  return true
}

function isPathAllowed(targetPath: string): boolean {
  const resolved = resolve(targetPath)
  const userData = resolve(app.getPath('userData'))

  // Allow anything under the app's userData directory
  // Use path.relative() to prevent traversal attacks (e.g., "userData/../../../etc/passwd")
  const rel = relative(userData, resolved)
  if (rel && !rel.startsWith('..') && !isAbsolute(rel)) {
    return true
  }

  // Allow paths the user explicitly selected via a file dialog (with TTL check)
  if (isDialogPathValid(resolved)) {
    return true
  }

  return false
}

export function registerIpcHandlers(): void {
  // --- Storage handlers (character, campaign, bastion, creature, game state, homebrew, settings) ---
  registerStorageHandlers()

  // --- Ban storage ---

  ipcMain.handle(IPC_CHANNELS.LOAD_BANS, async (_event, campaignId: string) => {
    if (!isValidUUID(campaignId)) {
      throw new Error('Invalid campaign ID')
    }
    try {
      const bansDir = join(app.getPath('userData'), 'bans')
      const banPath = join(bansDir, `${campaignId}.json`)
      const content = await readFile(banPath, 'utf-8')
      const parsed = JSON.parse(content)
      return {
        peerIds: Array.isArray(parsed.peerIds) ? (parsed.peerIds as string[]) : [],
        names: Array.isArray(parsed.names) ? (parsed.names as string[]) : []
      }
    } catch {
      return { peerIds: [] as string[], names: [] as string[] }
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.SAVE_BANS,
    async (_event, campaignId: string, banData: { peerIds: string[]; names: string[] }) => {
      if (!isValidUUID(campaignId)) {
        throw new Error('Invalid campaign ID')
      }
      if (!banData || typeof banData !== 'object') {
        throw new Error('Invalid ban data: expected object')
      }
      const { peerIds, names } = banData
      if (!Array.isArray(peerIds)) {
        throw new Error('Invalid peer IDs: expected array')
      }
      if (!Array.isArray(names)) {
        throw new Error('Invalid names: expected array')
      }
      if (peerIds.length > 1000 || names.length > 1000) {
        throw new Error('Invalid ban data: too many entries')
      }
      for (const id of peerIds) {
        if (typeof id !== 'string' || id.length > 64) {
          throw new Error('Invalid peer ID in list')
        }
      }
      for (const name of names) {
        if (typeof name !== 'string' || name.length > 64) {
          throw new Error('Invalid name in list')
        }
      }
      try {
        const bansDir = join(app.getPath('userData'), 'bans')
        await mkdir(bansDir, { recursive: true })
        const banPath = join(bansDir, `${campaignId}.json`)
        await writeFile(banPath, JSON.stringify({ peerIds, names }), 'utf-8')
        return { success: true }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }
  )

  // --- File dialogs ---

  ipcMain.handle(
    IPC_CHANNELS.DIALOG_SAVE,
    async (_event, options: { title: string; filters: Array<{ name: string; extensions: string[] }> }) => {
      const win = BrowserWindow.getFocusedWindow()
      const result = await dialog.showSaveDialog(win ?? BrowserWindow.getAllWindows()[0], {
        title: options.title,
        filters: options.filters
      })
      if (result.canceled || !result.filePath) {
        return null
      }
      addDialogPath(result.filePath)
      return result.filePath
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.DIALOG_OPEN,
    async (_event, options: { title: string; filters: Array<{ name: string; extensions: string[] }> }) => {
      const win = BrowserWindow.getFocusedWindow()
      const result = await dialog.showOpenDialog(win ?? BrowserWindow.getAllWindows()[0], {
        title: options.title,
        filters: options.filters,
        properties: ['openFile']
      })
      if (result.canceled || result.filePaths.length === 0) {
        return null
      }
      addDialogPath(result.filePaths[0])
      return result.filePaths[0]
    }
  )

  // --- File I/O (restricted to dialog-selected paths and userData) ---

  ipcMain.handle(IPC_CHANNELS.FS_READ, async (_event, filePath: string) => {
    if (!isPathAllowed(filePath)) {
      throw new Error('Access denied: path not allowed')
    }
    const resolvedPath = resolve(filePath)
    try {
      const fileStats = await stat(resolvedPath)
      if (fileStats.size > MAX_READ_FILE_SIZE) {
        throw new Error(`File too large: ${fileStats.size} bytes (max ${MAX_READ_FILE_SIZE})`)
      }
      const content = await readFile(resolvedPath, 'utf-8')
      return content
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('File too large')) throw err
      logToFile('ERROR', 'fs:read-file failed:', String(err))
      throw err
    }
    // Dialog path is NOT consumed on read so the caller can subsequently write to the same path.
  })

  ipcMain.handle(IPC_CHANNELS.FS_WRITE, async (_event, filePath: string, content: string) => {
    if (!isPathAllowed(filePath)) {
      throw new Error('Access denied: path not allowed')
    }
    if (typeof content === 'string' && content.length > MAX_WRITE_CONTENT_SIZE) {
      throw new Error(`Content too large: ${content.length} bytes (max ${MAX_WRITE_CONTENT_SIZE})`)
    }
    const resolvedPath = resolve(filePath)
    try {
      await writeFile(resolvedPath, content, 'utf-8')
    } catch (err) {
      logToFile('ERROR', 'fs:write-file failed:', String(err))
      throw err
    } finally {
      dialogAllowedPaths.delete(resolvedPath)
    }
  })

  ipcMain.handle(IPC_CHANNELS.FS_WRITE_BINARY, async (_event, filePath: string, buffer: ArrayBuffer) => {
    if (!isPathAllowed(filePath)) {
      throw new Error('Access denied: path not allowed')
    }
    const resolvedPath = resolve(filePath)
    try {
      await writeFile(resolvedPath, Buffer.from(buffer))
    } catch (err) {
      logToFile('ERROR', 'fs:write-file-binary failed:', String(err))
      throw err
    } finally {
      dialogAllowedPaths.delete(resolvedPath)
    }
  })

  // --- Window controls ---

  ipcMain.handle(IPC_CHANNELS.TOGGLE_FULLSCREEN, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      win.setFullScreen(!win.isFullScreen())
      return win.isFullScreen()
    }
    return false
  })

  ipcMain.handle(IPC_CHANNELS.IS_FULLSCREEN, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win?.isFullScreen() ?? false
  })

  ipcMain.handle(IPC_CHANNELS.OPEN_DEVTOOLS, async (event) => {
    if (!is.dev) return // Only allow DevTools in development
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      win.webContents.openDevTools()
    }
  })

  // --- AI DM handlers ---
  registerAiHandlers()

  // --- Audio handlers ---
  registerAudioHandlers()

  // --- Discord integration handlers ---
  registerDiscordHandlers()

  // --- Game data handlers ---
  registerGameDataHandlers()

  // --- Plugin handlers ---
  registerPluginHandlers()

  // --- Cloud sync handlers (Google Drive via Rclone on Pi) ---
  registerCloudSyncHandlers()
}
