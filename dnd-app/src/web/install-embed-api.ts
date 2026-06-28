/**
 * Side-effect module for the EMBED build (the bundle hosted in the React Native
 * WebView). Installs `window.api` BEFORE the renderer module graph evaluates, so
 * every store sees it on first read — same ordering contract as
 * install-web-api.ts.
 *
 * If the native bridge is present (running inside the RN shell) the storage
 * surface routes to native; otherwise it degrades to the standard browser shim
 * so the embed bundle still runs in a plain browser for dev/preview.
 */
import { createBridgeApi } from './bridge-api'
import { createWebBridge } from './bridge-transport'
import { captureWebAuthToken, createWebApi } from './web-api'

const target = globalThis as unknown as { api?: unknown; __DND_WEB__?: boolean; __DTO_EMBED__?: boolean }
target.__DND_WEB__ = true
target.__DTO_EMBED__ = true

if (typeof window !== 'undefined' && !target.api) {
  // createWebApi is intentionally looser than the canonical Window['api'] (the
  // not-yet-bridged surface uses conservative return types), so route through
  // unknown like install-web-api.ts does.
  const base = createWebApi() as unknown as Window['api']
  const bridge = createWebBridge()
  target.api = bridge ? createBridgeApi(bridge, base) : base
  void captureWebAuthToken()
}
