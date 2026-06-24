// PHASE-01 (F1a) — resilient React.lazy for the GitHub-Pages web build.
//
// Every screen but Home is React.lazy in App.jsx, each emitted as a
// content-hashed chunk. When deploy.yml republishes mid-session the already
// loaded tab still references the PREVIOUS build chunk names; the new tree no
// longer ships them (and the SW cleanupOutdatedCaches purges the old precache),
// so the next lazy-route navigation throws "Failed to fetch dynamically
// imported module" straight to the ErrorBoundary and strands the user.
//
// lazyWithReload wraps lazy() so a chunk-load failure triggers exactly ONE
// window.location.reload() (fetching the fresh index.html + current chunk
// names), guarded by a sessionStorage one-shot flag so a chunk that is GENUINELY
// gone cannot spin in a reload loop — the second failure rethrows to the
// boundary, which then shows a "new edition — reload" affordance (01B).
//
// The one-shot guard is shared with the vite:preloadError listener (main.jsx)
// and the SW controllerchange handshake (pwaUpdate.js, 01C) so whichever path
// fires first wins and the others are suppressed for that load — no double
// reload, no loop. Keep the matcher/key consistent with dnd-app PHASE-44C
// (src/renderer/src/utils/lazy-with-reload.ts) so the two apps behave the same;
// only the key namespace differs (ds: vs dnd:).
import { lazy } from 'react';

const CHUNK_ERROR_RE =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError/i;

/** One-shot guard key: set right before a reload, cleared on any successful load. */
export const CHUNK_RELOAD_FLAG = 'ds:chunk-reload';

/** True when `err` looks like a stale-chunk / failed-dynamic-import error. */
export function isChunkLoadError(err) {
  if (!err) return false;
  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : '';
  return name === 'ChunkLoadError' || CHUNK_ERROR_RE.test(message);
}

function readReloadFlag() {
  try {
    return window.sessionStorage.getItem(CHUNK_RELOAD_FLAG) === '1';
  } catch {
    return false;
  }
}

function setReloadFlag() {
  try {
    window.sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1');
  } catch {
    /* sessionStorage unavailable (private mode / disabled) — best effort */
  }
}

/** Release the one-shot guard so a future genuine redeploy can reload again. */
export function clearReloadFlag() {
  try {
    window.sessionStorage.removeItem(CHUNK_RELOAD_FLAG);
  } catch {
    /* sessionStorage unavailable — best effort */
  }
}

/**
 * Guarded one-shot reload. Reloads at most once per session (until a successful
 * load clears the flag). Returns true iff it triggered a reload. Shared by the
 * vite:preloadError listener (01A) and the SW controllerchange handshake (01C);
 * the lazy() reject path below uses the same flag so all three coordinate.
 */
export function guardedReloadOnce() {
  if (readReloadFlag()) return false;
  setReloadFlag();
  try {
    window.location.reload();
  } catch {
    /* non-browser context — best effort */
  }
  return true;
}

/** lazy() that self-recovers from a stale-chunk import via one guarded reload. */
export function lazyWithReload(factory) {
  return lazy(() =>
    factory().then(
      (mod) => {
        // Reached the latest chunks — release the guard for the next deploy.
        clearReloadFlag();
        return mod;
      },
      (err) => {
        if (isChunkLoadError(err) && guardedReloadOnce()) {
          // Never resolve: keep the Suspense fallback up while the reload
          // navigates away, instead of flashing the error boundary.
          return new Promise(() => {});
        }
        // Not a chunk error, or we already reloaded once and it is still gone —
        // surface it to the ErrorBoundary (01B renders the reload affordance).
        throw err;
      },
    ),
  );
}
