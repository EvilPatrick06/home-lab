/**
 * Resolve a runtime `public/`-relative asset path against the Vite base URL.
 *
 * The renderer is served from `/` on desktop (Electron) but from
 * `/DungeonTableOnline/` on the web build (`vite.web.config.ts` `base`). A
 * stored relative path like `./data/5e/maps/x.png` or `./sounds/dice/d20.mp3`
 * loads fine on desktop but 404s on the web build, because the raw relative
 * path ignores the base (it normalises to origin-root `/data/...`, or resolves
 * against the in-game route to the SPA-fallback HTML). Routing every runtime
 * asset load through this helper prefixes `import.meta.env.BASE_URL` — which is
 * `/` on desktop (a no-op) and `/DungeonTableOnline/` on the web build — so the
 * same code path works on both targets with no migration of persisted paths.
 *
 * Self-describing URLs (data:, blob:, file:, http(s):) — user uploads, the Pi
 * sound stream, on-disk cache — pass through unchanged.
 */
export function resolveAssetUrl(path: string): string {
  if (!path) return path
  if (/^(?:data:|blob:|file:|https?:)/i.test(path)) return path
  const base = import.meta.env.BASE_URL || '/'
  const rel = path.replace(/^\.?\//, '')
  return `${base}${rel}`
}
