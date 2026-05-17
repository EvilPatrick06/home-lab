import type { Dirent } from 'node:fs'
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
import { isUpdateInProgress, maybeAutoCheckOnLaunch, registerUpdateHandlers } from './updater'

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

// Force the X11 backend on Linux. Electron's ozone auto-detection picks
// Wayland when `XDG_SESSION_TYPE=wayland`, but several common Wayland
// compositors (the one in stock Ubuntu 22 Hyper-V VMs, GNOME-on-WSLg,
// some Cinnamon/Xfce hybrid sessions) negotiate a surface that the
// Electron renderer then fails to draw — processes stay alive, no
// window appears. X11 is the safer default; Wayland users running a
// native session can override with --ozone-platform=wayland.
if (process.platform === 'linux' && !app.commandLine.hasSwitch('ozone-platform')) {
  app.commandLine.appendSwitch('ozone-platform', 'x11')
}

// MP-5 (v2.1.31 QA): allow software WebGL via SwiftShader when no GPU
// is available. Hyper-V VMs and other headless-ish Linux environments
// don't expose hardware GPU; without this flag, Chromium refuses to
// initialize *any* WebGL context (even software-rasterized), and the
// app's map renderer (PixiJS) hard-fails with "WebGL is not available."
// SwiftShader is the software-rendering fallback Chromium ships — it's
// slower than hardware but allows the map / dice / Three.js scenes to
// actually paint. Hardware-GPU systems ignore this flag and continue
// using their real driver.
if (!app.commandLine.hasSwitch('enable-unsafe-swiftshader')) {
  app.commandLine.appendSwitch('enable-unsafe-swiftshader')
}

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  // `app.quit()` is async — the rest of this module still loads, the
  // `app.whenReady().then(...)` handler below still runs, `createWindow()`
  // still creates a BrowserWindow, and `quit()` only takes effect after
  // the window has briefly flashed on screen and then been torn down.
  // `app.exit(0)` terminates the process synchronously so the secondary
  // instance never gets that far.
  app.exit(0)
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    title: 'D&D Virtual Tabletop',
    backgroundColor: '#030712',
    // Was `show: false` + ready-to-show + 5 s force-show fallback. Some Linux
    // VM configs never produced a window even with the fallback firing —
    // show() returns successfully but the WM doesn't draw anything. Showing
    // from creation eliminates the hidden state entirely; the brief flash
    // of background color before first paint is the universal trade-off
    // for guaranteed window visibility.
    show: true,
    // Explicit window-manager hints. Defaults are already `true`, but on
    // Linux + XWayland (forced via --ozone-platform=x11 to work around the
    // earlier Wayland surface-bind bug), the `_NET_WM_ALLOWED_ACTIONS`
    // X11 atom that tells GNOME "this window can be maximized" doesn't
    // always get emitted unless we set the flag explicitly. Result: max
    // button hidden from title bar even though gsettings allows it. Setting
    // these explicitly triggers Electron to send the hints.
    resizable: true,
    maximizable: true,
    minimizable: true,
    fullscreenable: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Belt & suspenders: on some Linux configs the constructor hints don't
  // reach the WM. Re-emit after the window object exists.
  if (process.platform === 'linux') {
    mainWindow.setMaximizable(true)
    mainWindow.setMinimizable(true)
    mainWindow.setResizable(true)
  }

  // Explicitly set taskbar icon. Windows wants .ico; Linux/macOS prefer
  // a PNG (nativeImage can technically load .ico on Linux but does so
  // unreliably depending on the distro's ICO codec). Pick the right
  // file by platform so setIcon never silently no-ops.
  const iconExt = process.platform === 'win32' ? 'ico' : 'png'
  const iconBasename = `icon.${iconExt}`
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, iconBasename)
    : join(__dirname, '../../resources', iconBasename)
  try {
    const appIcon = nativeImage.createFromPath(iconPath)
    if (!appIcon.isEmpty()) {
      mainWindow.setIcon(appIcon)
    } else {
      logToFile('WARN', `Failed to load app icon from: ${iconPath}`)
    }
  } catch (err) {
    logToFile('WARN', `nativeImage threw on ${iconPath}`, err instanceof Error ? err.message : String(err))
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

  // On ready-to-show, nudge the WM to draw + focus the window. Belt &
  // suspenders for X11/Wayland compositors that sometimes drop the
  // initial map request from an Electron app.
  mainWindow.on('ready-to-show', () => {
    if (mainWindow.isDestroyed()) return
    if (!mainWindow.isVisible()) {
      mainWindow.show()
    }
    mainWindow.focus()
    mainWindow.moveTop()
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

  // Defense-in-depth: keep the main document URL on the app shell (file:// or dev server).
  const isAllowedMainNavigation = (rawUrl: string): boolean => {
    if (is.dev) {
      const base = (process.env.ELECTRON_RENDERER_URL ?? 'http://localhost:5173').replace(/\/$/, '')
      return rawUrl.startsWith(base)
    }
    return rawUrl.startsWith('file://')
  }
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAllowedMainNavigation(url)) {
      return
    }
    event.preventDefault()
    logToFile('WARN', `Blocked main-window will-navigate to ${url}`)
  })
  mainWindow.webContents.on('will-redirect', (event, url) => {
    if (isAllowedMainNavigation(url)) {
      return
    }
    event.preventDefault()
    logToFile('WARN', `Blocked main-window will-redirect to ${url}`)
  })
  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
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
        const e = entry as Dirent & { parentPath?: string; path?: string }
        const parentPath = e.parentPath || e.path || dir
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

  // v2.1.16: optional auto-check for updates on launch (opt-in via
  // Settings → autoCheckUpdates). Fires asynchronously so it doesn't
  // block app boot.
  void maybeAutoCheckOnLaunch()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // CRITICAL: bail out if an install is in flight. performInstall (updater.ts)
  // closes every BrowserWindow and *then* schedules quitAndInstall on a
  // 1500 ms timer to give file handles time to release. If we let
  // app.quit() fire here the moment the last window closes, the app exits
  // *before* the timeout runs — quitAndInstall is never invoked, the
  // installer never spawns, the app reopens at the same version, the
  // auto-update flow rediscovers the same pending update, and the user is
  // stuck in an infinite "restart → no install → re-detect → restart" loop
  // on both Linux and Windows. This was the v2.1.34-era bug the user
  // reported across both platforms.
  if (isUpdateInProgress()) return
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  // Release the single-instance lock so the NSIS installer doesn't think the app is still running
  app.releaseSingleInstanceLock()
})
