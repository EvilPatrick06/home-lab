/**
 * Ensures assets/embed.zip exists before Metro starts. First clone / fresh checkout
 * won't have the bundle; this runs build:embed automatically via the prestart hook.
 */
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { execSync } from "node:child_process"

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const zipPath = join(mobileRoot, "assets", "embed.zip")

if (existsSync(zipPath)) {
  console.log("[ensure-embed] embed.zip present")
  process.exit(0)
}

console.log("[ensure-embed] embed.zip missing — building embed bundle (one-time, ~2 min)…")
execSync("npm run build:embed", { cwd: mobileRoot, stdio: "inherit" })
