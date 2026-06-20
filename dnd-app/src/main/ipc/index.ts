import { readFile, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { BrowserWindow, dialog } from 'electron'
import { MAX_READ_FILE_SIZE, MAX_WRITE_CONTENT_SIZE } from '../../shared/constants'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { SecurityEventSchema } from '../../shared/ipc-schemas'
import { logToFile } from '../log'
import { logSecurityEvent } from '../security-log'
import { handle, withSchema } from './_safe'
import { registerAiHandlers } from './ai-handlers'
import { registerAudioHandlers } from './audio-handlers'
import { registerBmoSyncHandlers } from './bmo-sync-handlers'
import { registerCloudSyncHandlers } from './cloud-sync-handlers'
import { addDialogPath, consumeDialogPath, isPathAllowed } from './dialog-allowlist'
import { registerDiscordHandlers } from './discord-handlers'
import { registerGameDataHandlers } from './game-data-handlers'
import { registerImageGenHandlers } from './image-gen-handlers'
import { registerLanHandlers } from './lan-handlers'
import { registerLibraryHandlers } from './library-handlers'
import { registerPluginHandlers } from './plugin-handlers'
import { registerRegistryHandlers } from './registry-handlers'
import { registerSoundCacheHandlers } from './sound-cache-handlers'
import { registerStorageHandlers } from './storage-handlers'

export function registerIpcHandlers(): void {
  // --- Storage handlers (character, campaign, bastion, creature, game state, homebrew, settings) ---
  registerStorageHandlers()

  // --- Ban storage moved to storage-handlers.ts ---

  // --- File dialogs ---

  handle(
    IPC_CHANNELS.DIALOG_SAVE,
    async (
      _event,
      options: { title: string; filters: Array<{ name: string; extensions: string[] }>; defaultPath?: string }
    ) => {
      // Phase 17d (RUN-7) — `getAllWindows()[0]` is undefined when no window exists, which
      // would pass `undefined` as the parent and throw. Fall back to the parent-less dialog.
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
      // Forward the renderer-supplied `defaultPath` so the native dialog pre-fills a
      // filename instead of opening blank. Omitting the key entirely when undefined
      // keeps Electron's own default behavior.
      const opts = {
        title: options.title,
        filters: options.filters,
        ...(options.defaultPath ? { defaultPath: options.defaultPath } : {})
      }
      const result = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
      if (result.canceled || !result.filePath) {
        return null
      }
      addDialogPath(result.filePath)
      return result.filePath
    }
  )

  handle(
    IPC_CHANNELS.DIALOG_OPEN,
    async (_event, options: { title: string; filters: Array<{ name: string; extensions: string[] }> }) => {
      // Phase 17d (RUN-7) — parent-less fallback when no window exists (see DIALOG_SAVE).
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
      const opts = { title: options.title, filters: options.filters, properties: ['openFile'] as Array<'openFile'> }
      const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
      if (result.canceled || result.filePaths.length === 0) {
        return null
      }
      addDialogPath(result.filePaths[0])
      return result.filePaths[0]
    }
  )

  // --- File I/O (restricted to dialog-selected paths and userData) ---

  handle(IPC_CHANNELS.FS_READ, async (_event, filePath: string) => {
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

  handle(IPC_CHANNELS.FS_READ_BINARY, async (_event, filePath: string) => {
    if (!isPathAllowed(filePath)) {
      throw new Error('Access denied: path not allowed')
    }
    const resolvedPath = resolve(filePath)
    try {
      const fileStats = await stat(resolvedPath)
      if (fileStats.size > MAX_READ_FILE_SIZE) {
        throw new Error(`File too large: ${fileStats.size} bytes (max ${MAX_READ_FILE_SIZE})`)
      }
      const content = await readFile(resolvedPath)
      const arrayBuffer = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength)
      return arrayBuffer
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('File too large')) throw err
      logToFile('ERROR', 'fs:read-file-binary failed:', String(err))
      throw err
    }
  })

  handle(IPC_CHANNELS.FS_WRITE, async (_event, filePath: string, content: string) => {
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
      consumeDialogPath(resolvedPath)
    }
  })

  handle(IPC_CHANNELS.FS_WRITE_BINARY, async (_event, filePath: string, buffer: ArrayBuffer) => {
    if (!isPathAllowed(filePath)) {
      throw new Error('Access denied: path not allowed')
    }
    // Phase 17a (NET-15) — mirror the FS_WRITE size guard; binary writes skipped it.
    if (buffer.byteLength > MAX_WRITE_CONTENT_SIZE) {
      throw new Error(`Content too large: ${buffer.byteLength} bytes (max ${MAX_WRITE_CONTENT_SIZE})`)
    }
    const resolvedPath = resolve(filePath)
    try {
      await writeFile(resolvedPath, Buffer.from(buffer))
    } catch (err) {
      logToFile('ERROR', 'fs:write-file-binary failed:', String(err))
      throw err
    } finally {
      consumeDialogPath(resolvedPath)
    }
  })

  // --- Window controls ---

  handle(IPC_CHANNELS.TOGGLE_FULLSCREEN, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      win.setFullScreen(!win.isFullScreen())
      return win.isFullScreen()
    }
    return false
  })

  handle(IPC_CHANNELS.IS_FULLSCREEN, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win?.isFullScreen() ?? false
  })

  handle(IPC_CHANNELS.OPEN_DEVTOOLS, async (event) => {
    if (!is.dev) return // Only allow DevTools in development
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      win.webContents.openDevTools()
    }
  })

  // --- Security audit (20g): renderer-originated security events ---
  // The renderer (host kick/ban, rejected network messages) can't write the
  // audit log directly; it forwards events here and main records them via the
  // shared logSecurityEvent (capped at 4 KB).
  handle(
    IPC_CHANNELS.LOG_SECURITY_EVENT,
    withSchema(IPC_CHANNELS.LOG_SECURITY_EVENT, SecurityEventSchema, (_event, data) => {
      logSecurityEvent(`renderer.${data.event}`, data.details ?? {})
    })
  )

  // --- AI DM handlers ---
  registerAiHandlers()
  registerImageGenHandlers()

  // --- Audio handlers ---
  registerAudioHandlers()

  // --- Sound cache handlers (thin installer — fetch bundled MP3s from Pi) ---
  registerSoundCacheHandlers()

  // --- Discord integration handlers ---
  registerDiscordHandlers()

  // --- Game data handlers ---
  registerGameDataHandlers()

  // --- Plugin handlers ---
  registerPluginHandlers()

  // --- Cloud sync handlers (Google Drive via Rclone on Pi) ---
  registerCloudSyncHandlers()

  // --- BMO Pi Bridge: Sync receiver & handlers ---
  registerBmoSyncHandlers()

  // --- LAN discovery (mDNS / Bonjour) for multiplayer game browser ---
  registerLanHandlers()

  // --- Pi game registry (main-process REST proxy + polling live feed) ---
  registerRegistryHandlers()

  // --- Pi 5e library (main-process manifest/file fetch proxy) ---
  registerLibraryHandlers()
}
