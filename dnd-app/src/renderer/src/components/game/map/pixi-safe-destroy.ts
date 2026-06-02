/**
 * BUG-7 — safe PixiJS display-object teardown.
 *
 * Destroying a Pixi `Text` returns its glyph texture to a shared pool. When the
 * map re-renders during a teardown-ish moment — the QA repro was switching the
 * map editor's View → "As role: Player", which re-renders MapCanvas and destroys
 * the DM-only token labels / grid coords / text drawings — Pixi's `returnTexture`
 * can push to a pool array that's momentarily undefined and throw
 * `Cannot read properties of undefined (reading 'push')`. That synchronous throw
 * escaped into React's error boundary and took down the whole in-game view.
 *
 * The destroy itself is intended (the object is already removed from its parent),
 * so the texture-pool hiccup is non-fatal: swallow it. This mirrors the existing
 * "swallow Pixi teardown failures" guards in light-animation / fog-overlay.
 */
import type { DestroyOptions } from 'pixi.js'

interface Destroyable {
  destroy: (options?: DestroyOptions) => void
  destroyed?: boolean
}

/** Destroy a Pixi object, skipping if already destroyed and swallowing the
 * texture-pool teardown race that would otherwise crash the React tree. */
export function safeDestroy(obj: Destroyable | null | undefined, options?: DestroyOptions): void {
  if (!obj || obj.destroyed) return
  try {
    obj.destroy(options)
  } catch {
    // Pixi texture-pool teardown race (returnTexture on a torn-down pool). The
    // object is already detached from its container, so this is cosmetic-safe.
  }
}
