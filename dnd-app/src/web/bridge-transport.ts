/**
 * Web side of the native ↔ WebView bridge. When the embed bundle runs inside the
 * React Native shell, `window.ReactNativeWebView` is present; we wire a
 * BridgeEndpoint to its `postMessage` and install the global the native side
 * injects into (`__DTO_BRIDGE_RECEIVE__`), flushing any frames the bootstrap
 * script buffered before this module evaluated.
 *
 * Returns null in a plain browser (no RN shell) so the embed entry can fall back
 * to the standard IndexedDB/fetch `window.api` shim for dev + web preview.
 */
import { BridgeEndpoint } from '../shared/bridge'

interface RNWebView {
  postMessage: (data: string) => void
}
interface BridgeGlobals {
  ReactNativeWebView?: RNWebView
  __DTO_BRIDGE_RECEIVE__?: (frame: string) => void
  __DTO_BRIDGE_QUEUE__?: string[]
  __DTO_BRIDGE__?: BridgeEndpoint
}

export function createWebBridge(): BridgeEndpoint | null {
  if (typeof window === 'undefined') return null
  const g = window as unknown as BridgeGlobals
  const rn = g.ReactNativeWebView
  if (!rn) return null

  const endpoint = new BridgeEndpoint({
    role: 'web',
    send: (data) => rn.postMessage(data),
    onError: (e) => console.warn('[bridge:web]', e.message)
  })

  const queued = Array.isArray(g.__DTO_BRIDGE_QUEUE__) ? g.__DTO_BRIDGE_QUEUE__ : []
  g.__DTO_BRIDGE_RECEIVE__ = (frame: string) => endpoint.receive(frame)
  for (const f of queued) endpoint.receive(f)
  g.__DTO_BRIDGE_QUEUE__ = []
  g.__DTO_BRIDGE__ = endpoint

  endpoint.hello()
  // Recover any state events the native side emitted before we attached.
  endpoint.requestResync()
  return endpoint
}
