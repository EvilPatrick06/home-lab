/**
 * Runtime build-target detection.
 *
 * The renderer is shared by the desktop (Electron) app and the browser (web)
 * build. The web entry sets a global flag (`__DND_WEB__`) before the app mounts;
 * desktop never does. Use `isWebBuild()` to hide desktop-only affordances
 * (local-Ollama install, auto-updater, LAN/mDNS discovery) that have no meaning
 * in a browser, where those capabilities are absent or routed through the Pi.
 */
export function isWebBuild(): boolean {
  return typeof window !== 'undefined' && (window as unknown as { __DND_WEB__?: boolean }).__DND_WEB__ === true
}

/**
 * The EMBED build runs the renderer inside the React Native WebView (mobile).
 * It sets `__DTO_EMBED__` (in addition to `__DND_WEB__`) before mount. Unlike
 * the standalone web build it is loaded from a file/opaque origin and driven by
 * a native shell, so it uses an in-memory router seeded with an initial route
 * instead of BrowserRouter, and routes desktop-style window.api calls over the
 * bridge.
 */
export function isEmbedBuild(): boolean {
  return typeof window !== 'undefined' && (window as unknown as { __DTO_EMBED__?: boolean }).__DTO_EMBED__ === true
}
