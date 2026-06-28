/**
 * Post-process the embed build (vite build --config vite.embed.config.ts):
 *   - rename index.embed.html → index.html so the WebView loads a clean entry
 *     (and a file:// load resolves the directory index)
 *
 * The bundle is consumed by the React Native app: `mobile/scripts/sync-embed.mjs`
 * copies dist-embed/ into mobile/assets/embed/ for offline bundling.
 */
import { existsSync, renameSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const dist = join(root, "dist-embed")
const src = join(dist, "index.embed.html")
const out = join(dist, "index.html")

if (!existsSync(src)) {
  console.error("[finalize-embed] expected", src, "— did the build run?")
  process.exit(1)
}
renameSync(src, out)
console.log("[finalize-embed] index.html ready in dist-embed/")
