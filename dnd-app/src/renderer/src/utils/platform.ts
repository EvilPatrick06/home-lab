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
