/**
 * Post-process the web build (vite build --config vite.web.config.ts):
 *   - rename index.web.html → index.html (clean SPA entry for any static host)
 *   - copy it to 404.html so deep links fall back to the SPA on static hosts
 *     (the Flask/Cloudflare serve route does the same fallback server-side)
 */
import { copyFileSync, existsSync, renameSync } from "node:fs"
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
console.log("[finalize-web] index.html + 404.html ready in dist-web/")
