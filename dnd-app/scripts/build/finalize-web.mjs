/**
 * Post-process the web build (vite build --config vite.web.config.ts):
 *   - rename index.web.html → index.html (clean SPA entry for any static host)
 *   - copy it to 404.html so deep links fall back to the SPA on static hosts
 *     (the Flask/Cloudflare serve route does the same fallback server-side)
 *   - stamp the app version into sw.js (PWA service worker) so each deploy gets
 *     a fresh cache namespace and the old one is evicted on activate
 */
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const dist = join(root, "dist-web")
const src = join(dist, "index.web.html")
const out = join(dist, "index.html")

if (!existsSync(src)) {
  console.error("[finalize-web] expected", src, "— did the build run?")
  process.exit(1)
}
renameSync(src, out)
copyFileSync(out, join(dist, "404.html"))

// Stamp the service-worker cache version from package.json + a build timestamp.
const swPath = join(dist, "sw.js")
if (existsSync(swPath)) {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"))
  const version = `${pkg.version}-${Date.now().toString(36)}`
  const swSrc = readFileSync(swPath, "utf-8").replaceAll("__SW_CACHE_VERSION__", version)
  writeFileSync(swPath, swSrc)
  console.log(`[finalize-web] sw.js cache version stamped → ${version}`)
} else {
  console.warn("[finalize-web] sw.js not found in dist-web/ — PWA offline cache disabled")
}

console.log("[finalize-web] index.html + 404.html ready in dist-web/")
