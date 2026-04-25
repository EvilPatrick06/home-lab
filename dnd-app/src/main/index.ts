import { readdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, nativeImage, shell } from 'electron'
import { initFromSavedConfig } from './ai/ai-service'
import { applyBmoBaseUrlFromSettings } from './bmo-config'
import { bmoCspConnectFragment } from './bmo-csp'
import { registerIpcHandlers } from './ipc'
import { logToFile } from './log'
import { registerPluginProtocol, registerPluginScheme } from './plugins/plugin-protocol'
import { registerCoreBooks } from './storage/book-storage'
import { loadSettings } from './storage/settings-storage'
import { registerUpdateHandlers } from './updater'

// ── Unhandled Error Handlers ──

process.on('uncaughtException', (error) => {
  logToFile('FATAL', `Uncaught exception: ${error.message}`, error.stack)
})

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason)
  const stack = reason instanceof Error ? reason.stack : undefined
  logToFile('ERROR', `Unhandled rejection: ${msg}`, stack)
})

// Register plugin:// scheme as privileged (must be before app.whenReady)
registerPluginScheme()

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    title: 'D&D Virtual Tabletop',
    backgroundColor: '#030712',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Explicitly set taskbar icon
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icon.ico')
    : join(__dirname, '../../resources/icon.ico')
  const appIcon = nativeImage.createFromPath(iconPath)
  if (!appIcon.isEmpty()) {
    mainWindow.setIcon(appIcon)
  } else {
    logToFile('WARN', `Failed to load app icon from: ${iconPath}`)
  }

  // Content Security Policy — relax inline restrictions in dev for Vite HMR
  // Rebuild CSP on each response so BMO `connect-src` updates after settings save
  const inlinePolicy = is.dev ? " 'unsafe-inline' 'unsafe-eval'" : ''
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const devConnect = is.dev ? ' ws://localhost:5173 http://localhost:5173' : ''
    const piConnect = bmoCspConnectFragment()
    const csp = `default-src 'self' plugin:; script-src 'self' plugin:${inlinePolicy}; worker-src 'self' blob:; style-src 'self' plugin:${inlinePolicy}; connect-src 'self' plugin: data: wss://0.peerjs.com https://0.peerjs.com${piConnect}${devConnect}; img-src 'self' data: blob: plugin:; media-src 'self' blob: plugin:; font-src 'self' plugin:`
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    })
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // DevTools shortcut (development only)
  if (is.dev) {
    mainWindow.webContents.on('before-input-event', (_event, input) => {
      if (input.control && input.shift && input.key.toLowerCase() === 'i') {
        mainWindow.webContents.toggleDevTools()
      }
    })
  }

  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const url = new URL(details.url)
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        shell.openExternal(details.url)
      }
    } catch {
      // Invalid URL, ignore
    }
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

async function cleanupTmpFiles(dir: string): Promise<void> {
  try {
    // Requires Node 20+, which Electron 28+ supports
    const entries = await readdir(dir, { recursive: true, withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.tmp')) {
        // Handle both older Node (entry.path) and newer Node (entry.parentPath)
        const parentPath = (entry as any).parentPath || (entry as any).path || dir
        await unlink(join(parentPath, entry.name)).catch(() => {})
        logToFile('INFO', `Cleaned up orphaned tmp file: ${entry.name}`)
      }
    }
  } catch (err) {
    logToFile('WARN', `Failed to cleanup .tmp files: ${err}`)
  }
}

app.whenReady().then(async () => {
  app.setAppUserModelId('com.dnd-vtt.app')
  cleanupTmpFiles(app.getPath('userData'))

  const st = await loadSettings()
  if (st.success && st.data) {
    applyBmoBaseUrlFromSettings(st.data)
  }

  // Install React DevTools in dev mode
  if (is.dev) {
    try {
      const { default: installExtension, REACT_DEVELOPER_TOOLS } = await import('electron-devtools-installer')
      await installExtension(REACT_DEVELOPER_TOOLS)
      logToFile('INFO', 'React DevTools installed')
    } catch (err) {
      logToFile('WARN', `Failed to install React DevTools: ${err}`)
    }
  }

  registerPluginProtocol()
  registerIpcHandlers()
  registerUpdateHandlers()
  initFromSavedConfig()
  registerCoreBooks()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  // Release the single-instance lock so the NSIS installer doesn't think the app is still running
  app.releaseSingleInstanceLock()
})
