/**
 * Side-effect module: install the web `window.api` shim if no preload bridge is
 * present (i.e. we are running in a plain browser, not Electron). Imported FIRST
 * by the web entry so `window.api` exists before any renderer store evaluates.
 *
 * The shim is assigned through an `unknown`-typed view of `globalThis` on
 * purpose: the renderer call sites are type-checked against the canonical
 * `Window["api"]` declaration (from the preload `.d.ts`), while the web
 * implementation is intentionally looser (conservative return types for the
 * not-yet-bridged surface). Routing the assignment through `unknown` keeps the
 * renderer contract authoritative without forcing the shim to re-declare all
 * ~227 channel signatures.
 */
import { createWebApi } from './web-api'

const target = globalThis as unknown as { api?: unknown }
if (typeof window !== 'undefined' && !target.api) {
  target.api = createWebApi()
}
