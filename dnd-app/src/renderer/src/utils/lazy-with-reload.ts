/**
 * PHASE-44 (F3b) — resilient lazy() for the web build.
 *
 * Routes are code-split into content-hashed chunks (App.tsx). When the Pi
 * redeploys the web build mid-session, an already-loaded tab still references
 * the PREVIOUS build's hashed chunk names; the new server no longer has them,
 * so the next lazy-route navigation throws "Failed to fetch dynamically
 * imported module" straight to the error boundary and hard-crashes the SPA.
 *
 * `lazyWithReload` wraps `lazy()` so a chunk-load failure triggers exactly ONE
 * `window.location.reload()` (which fetches the fresh index.html + current
 * chunk names), guarded by a sessionStorage one-shot flag so a chunk that is
 * GENUINELY gone can't spin in a reload loop — the second failure rethrows to
 * the boundary, which then shows a "new version available — reload" affordance.
 */
import { type ComponentType, type LazyExoticComponent, lazy } from 'react'

const CHUNK_ERROR_RE =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError/i

/** One-shot guard key: set right before a reload, cleared on any successful load. */
export const CHUNK_RELOAD_FLAG = 'dnd:chunk-reload'

/** True when `err` looks like a stale-chunk / failed-dynamic-import error. */
export function isChunkLoadError(err: unknown): boolean {
  if (!err) return false
  const message = err instanceof Error ? err.message : String(err)
  const name = err instanceof Error ? err.name : ''
  return name === 'ChunkLoadError' || CHUNK_ERROR_RE.test(message)
}

function readReloadFlag(): boolean {
  try {
    return window.sessionStorage.getItem(CHUNK_RELOAD_FLAG) === '1'
  } catch {
    return false
  }
}

function setReloadFlag(): void {
  try {
    window.sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1')
  } catch {
    /* sessionStorage unavailable (private mode / disabled) — best effort */
  }
}

function clearReloadFlag(): void {
  try {
    window.sessionStorage.removeItem(CHUNK_RELOAD_FLAG)
  } catch {
    /* sessionStorage unavailable — best effort */
  }
}

// biome-ignore lint/suspicious/noExplicitAny: lazy()'s own signature is ComponentType<any>.
export function lazyWithReload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  return lazy(() =>
    factory().then(
      (mod) => {
        // Reached the latest chunks — release the one-shot guard so a future
        // genuine redeploy can reload again.
        clearReloadFlag()
        return mod
      },
      (err: unknown) => {
        if (isChunkLoadError(err) && !readReloadFlag()) {
          setReloadFlag()
          window.location.reload()
          // Never resolve: keep the Suspense fallback up while the reload
          // navigates away, instead of flashing the error boundary.
          return new Promise<{ default: T }>(() => {})
        }
        // Not a chunk error, or we already reloaded once and it's still gone —
        // surface it to the ErrorBoundary.
        throw err
      }
    )
  )
}
