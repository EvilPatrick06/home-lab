import type { Dirent } from 'node:fs'
import { readdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, dialog, nativeImage, shell } from 'electron'
import { disposeAiService, initFromSavedConfig } from './ai/ai-service'
import { applySyncBindFromSettings, stopSyncReceiver } from './bmo-bridge'
import { applyBmoApiKeyFromSettings, applyBmoBaseUrlFromSettings } from './bmo-config'
import { bmoCspConnectFragment } from './bmo-csp'
import { registerIpcHandlers } from './ipc'
import { startBmoDiscovery } from './lan-discovery'
import { logToFile } from './log'
import { registerPluginProtocol, registerPluginScheme } from './plugins/plugin-protocol'
import { registerCoreBooks } from './storage/book-storage'
import { loadSettings } from './storage/settings-storage'
import { isUpdateInProgress, maybeAutoCheckOnLaunch, registerUpdateHandlers } from './updater'

// ── Unhandled Error Handlers ──

// Phase 17d (RUN-15) — a process-level uncaught error/rejection leaves the main
// process in an undefined state; continuing risks corrupt writes. Log it, show a
// fatal dialog, then quit. Guarded so a cascade of follow-on errors doesn't stack
// dialogs or re-enter the quit path.
let fatalShutdownStarted = false
function handleFatal(kind: 'FATAL' | 'ERROR', label: string, reason: unknown): void {
  const msg = reason instanceof Error ? reason.message : String(reason)
  const stack = reason instanceof Error ? reason.stack : undefined
  logToFile(kind, `${label}: ${msg}`, stack)
  if (fatalShutdownStarted) return
  fatalShutdownStarted = true
  try {
    // showErrorBox is synchronous and safe to call before/after `ready`.
    dialog.showErrorBox(
      'D&D VTT — Fatal Error',
      `${label}.\n\n${msg}\n\nThe app needs to close to avoid corrupting saved data. A crash log was written.`
    )
  } catch {
    // If even the dialog fails, fall through to exit.
  }
  app.exit(1)
}

process.on('uncaughtException', (error) => {
  handleFatal('FATAL', 'Uncaught exception', error)
})

process.on('unhandledRejection', (reason) => {
  handleFatal('ERROR', 'Unhandled rejection', reason)
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

// LAN P2P reliability: expose raw local IPs in WebRTC ICE *host* candidates.
// Chromium hides them behind random `<uuid>.local` mDNS hostnames by default
// (a privacy measure), but using such a candidate then requires the remote peer
// to resolve that `.local` name via mDNS. On a machine whose WebRTC network
// service has no working resolver — the user's two-window test logged EVERY host,
// including the public STUN servers, failing with "Failed to resolve address …
// errorcode: -105" — neither the `.local` host candidates nor STUN-derived srflx
// candidates resolve, so ICE can't nominate a pair and same-machine / same-LAN
// P2P never connects. With this feature disabled the host candidates carry raw
// IPs (192.168.x.x / 127.0.0.1) that are dialed directly — no DNS, no STUN — so
// on-LAN self-host games connect even on a box with a broken WebRTC resolver. The
// privacy trade-off is negligible for a LAN VTT: the only peer that learns the IP
// is one you deliberately invited into your game. (Off-LAN play routes through the
// Cloudflare-tunnelled cloud relay, not raw P2P, so it's unaffected.)
const disabledFeatures = app.commandLine.getSwitchValue('disable-features')
if (!disabledFeatures.split(',').includes('WebRtcHideLocalIpsWithMdns')) {
  app.commandLine.appendSwitch(
    'disable-features',
    disabledFeatures ? `${disabledFeatures},WebRtcHideLocalIpsWithMdns` : 'WebRtcHideLocalIpsWithMdns'
  )
}

// Single-instance lock — bypassed ONLY by the two-window local multiplayer test
// launcher (`scripts/dev/two-windows-test.bat` sets DNDVTT_TEST_MULTI=1 and points
// each instance at its own --user-data-dir, giving them distinct identities).
// Without the flag (every normal launch) the lock is enforced: a 2nd copy just
// focuses the existing window, so the app can never open two windows on its own.
const gotTheLock = process.env.DNDVTT_TEST_MULTI === '1' || app.requestSingleInstanceLock()
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
  // Rebuild CSP on each response so BMO `connect-src` updates after settings save.
  // The renderer no longer makes ANY broad http/ws fetch to the Pi: the game
  // registry + 5e-library run in the MAIN process (registry-bridge.ts /
  // library-bridge.ts) and sounds are fetched + cached in main (sound-cache.ts),
  // all via IPC. The only renderer→Pi socket is the cloud-session Socket.IO
  // relay, which connects to the SPECIFIC discovered Pi host — already covered by
  // `bmoCspConnectFragment()` (`ws://<host>:* wss://<host>:*`). So `connect-src`
  // drops the broad `http:`/`ws:` scheme-sources and keeps only the tunnel
  // https/wss + PeerJS + the per-host Pi fragment. (Safe regardless: renderer runs
  // only first-party bundled code — script-src 'self' plugin:, sandbox +
  // contextIsolation on.) `media-src` allows `file:` + `http:` so `new Audio()`
  // can load the on-disk sound cache (`file://userData/sound-cache/...`) or stream
  // a clip live from the Pi when the cache is cold (media-src can't execute code).
  const inlinePolicy = is.dev ? " 'unsafe-inline' 'unsafe-eval'" : ''
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const devConnect = is.dev ? ' ws://localhost:5173 http://localhost:5173' : ''
    const piConnect = bmoCspConnectFragment()
    // style-src allows 'unsafe-inline' (always): tiptap (the Journal rich-text
    // editor) injects a runtime <style> via ProseMirror, and various components
    // use dynamic inline styles. CSP style-src can't execute code, so inline
    // styles are a low-risk allowance (script-src stays strict — no inline/eval
    // in prod). Without it the Journal editor's CSS is blocked + renders broken.
    // The renderer makes TWO kinds of direct LAN connection to the Pi: P2P
    // signaling through the PeerServer (bmo-peerjs :9000) and the cloud-relay
    // Socket.IO transport through Flask (:5000). On-LAN it dials whatever
    // lan-discovery registered — now a numeric LAN IP (the mDNS hostname is
    // resolved to its A-record before registering, since the sandboxed renderer
    // can't resolve bare `bmo`). That host is discovered AFTER the window loads, so
    // it can differ from / lag the per-response `piConnect` fragment, and the
    // DOCUMENT's CSP is fixed at load time. Allow BOTH BMO LAN ports on ANY host
    // statically — :9000 (P2P `ws://<host>:9000/myapp` + `/peerjs/id`) and :5000
    // (cloud relay `http://<host>:5000/socket.io` + its `ws://` upgrade) — so
    // neither is CSP-blocked regardless of which form/timing discovery lands on.
    // Off-LAN both paths use the `wss://<tunnel>:*` covered by `piConnect`.
    const lanBmoPorts = ' ws://*:9000 http://*:9000 ws://*:5000 http://*:5000'
    const csp = `default-src 'self' plugin:; script-src 'self' plugin:${inlinePolicy}; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' plugin:; connect-src 'self' plugin: data: wss://0.peerjs.com https://0.peerjs.com${lanBmoPorts}${piConnect}${devConnect}; img-src 'self' data: blob: plugin:; media-src 'self' blob: data: file: http: plugin:; font-src 'self' plugin:`
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    })
  })

  // Two-window test (scripts/dev/two-windows-test.bat): tag the title with the
  // role (DNDVTT_TEST_ROLE=DM/Player) so the two windows are distinguishable.
  // No-op on a normal launch (env unset).
  const testRole = process.env.DNDVTT_TEST_ROLE
  if (testRole) {
    mainWindow.on('page-title-updated', (e, title) => {
      e.preventDefault()
      mainWindow.setTitle(`${title}  —  TEST · ${testRole}`)
    })
  }

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

  // DevTools shortcut — F12 or Ctrl+Shift+I. Available in PRODUCTION too (not
  // just dev) so users can open the console to capture errors for bug reports.
  // Previously this was gated behind `is.dev` and only bound Ctrl+Shift+I, so
  // F12 did nothing in a packaged build.
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type !== 'keyDown') return
    const isDevToolsToggle = input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')
    if (isDevToolsToggle) mainWindow.webContents.toggleDevTools()
  })

  // SEC (SECURITY-LOG 2026-06-22): DevTools stays available in production for bug
  // reports, but print the standard self-XSS warning on open so a user can't be
  // socially-engineered into pasting attacker code into the console (which has
  // one-paste access to the window.api IPC surface). wipeAllData and other
  // destructive actions are separately confirmed in the renderer.
  mainWindow.webContents.on('devtools-opened', () => {
    if (is.dev) return
    void mainWindow.webContents
      .executeJavaScript(
        "console.log('%cStop!', 'color:#e11d48;font-size:48px;font-weight:bold');" +
          "console.log('%cThis console is for developers. Do NOT paste anything here — code pasted here can give an attacker control of your app data and accounts. If someone told you to paste something, it is a scam.', 'font-size:16px');"
      )
      .catch(() => {})
  })

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

  // Phase 28c.6 — validate the dev renderer URL before loading it: it must be a
  // localhost origin on the Vite dev-port range. A malformed/foreign URL falls
  // back to the packaged file:// bundle rather than navigating somewhere unsafe.
  const devUrl = is.dev ? process.env.ELECTRON_RENDERER_URL : undefined
  if (devUrl && isValidRendererUrl(devUrl)) {
    mainWindow.loadURL(devUrl)
  } else {
    if (devUrl) logToFile('WARN', `Rejected ELECTRON_RENDERER_URL "${devUrl}" — loading packaged bundle`)
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** Phase 28c.6 — accept only http://localhost|127.0.0.1 on ports 5170–5180. */
function isValidRendererUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'http:') return false
    if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') return false
    const port = Number(u.port)
    return port >= 5170 && port <= 5180
  } catch {
    return false
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
    // PHASE-22 22D: wire the shared secret + keyed LAN bind from settings.
    applyBmoApiKeyFromSettings(st.data)
    applySyncBindFromSettings(st.data)
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

  // Discover the BMO Pi at boot (mDNS + LAN probe) so the resolved base URL
  // points at the LAN Pi early — Cloud Backup status, the Pi library, and the
  // WebRTC signaling probe all use it. Previously this only ran when a LAN game
  // scan started (lobby/join), so on Settings the URL stayed the off-LAN tunnel
  // default ("Could not reach the Pi") and the signaling probe never fired.
  try {
    startBmoDiscovery()
  } catch (err) {
    logToFile('WARN', `[boot] BMO discovery failed to start: ${String(err)}`)
  }

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

// Phase 28c.3 — graceful BMO sync-receiver shutdown before the process exits.
// before-quit fires once; we defer the quit, await a clean server close, then
// re-quit. The `quitting` guard prevents an infinite preventDefault loop.
let quitting = false
app.on('before-quit', (e) => {
  if (quitting) return
  quitting = true
  e.preventDefault()
  stopSyncReceiver().finally(() => app.quit())
})

app.on('will-quit', () => {
  // Phase 22b — clear the module-scoped stale-stream sweep interval.
  disposeAiService()
  // Release the single-instance lock so the NSIS installer doesn't think the app is still running
  app.releaseSingleInstanceLock()
})
