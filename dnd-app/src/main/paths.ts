import { join } from 'node:path'
import { app } from 'electron'

/**
 * Phase 19b — single source of truth for dev-vs-packaged path resolution.
 *
 * Vite copies the *contents* of `src/renderer/public/` to the root of
 * `out/renderer/` (the `public/` segment is stripped). electron-builder then
 * packages the project's `out/` tree into `app.asar`, preserving the layout
 * (`app.asar/out/main`, `app.asar/out/renderer`, …). So:
 *
 *   dev      → <projectRoot>/src/renderer/public/<x>
 *   packaged → <app.asar>/out/renderer/<x>        (no `public/` segment)
 *
 * `app.getAppPath()` returns the project root in dev and the asar root when
 * packaged, which makes both branches expressible without `process.resourcesPath`
 * or `__dirname` gymnastics.
 *
 * NOTE: this caused the long-lived SRD bug (Phase 19a) where the packaged
 * branch joined a stale `public/` segment and dropped `out/`, so SRD lookups
 * silently returned nothing in production.
 */

/** Base directory whose contents mirror `src/renderer/public/`. */
export function getRendererPublicDir(): string {
  return app.isPackaged
    ? join(app.getAppPath(), 'out', 'renderer')
    : join(app.getAppPath(), 'src', 'renderer', 'public')
}

/** Directory holding the bundled 5e SRD/monster JSON (`.../data/5e`). */
export function getDataDir(): string {
  return join(getRendererPublicDir(), 'data', '5e')
}

/**
 * Resolve an `extraResources` entry. These live *outside* the asar at
 * `process.resourcesPath` (e.g. `chunk-index.json`, the `rulebooks/` tree, the
 * Ollama bundle). Never prepend `app.asar` to one of these.
 */
export function getResourcePath(relative: string): string {
  return join(process.resourcesPath, relative)
}
