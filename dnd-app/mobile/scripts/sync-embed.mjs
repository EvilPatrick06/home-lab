/**
 * Copy the built embed bundle (../dist-embed) into the mobile app so it can be
 * shipped offline inside the APK/AAB. Run after `npm --prefix .. run build:embed`
 * (the `build:embed` npm script does both).
 *
 * Loading a bundled multi-file SPA offline in react-native-webview requires the
 * files to live where the WebView can reach them via a file URI. This script
 * stages them under mobile/assets/embed/; see README.md for the WebView wiring
 * (point EMBED_URL at the staged index.html's localUri).
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { execSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const repoRoot = join(mobileRoot, "..")
const distEmbed = join(repoRoot, "dist-embed")
const dest = join(mobileRoot, "assets", "embed")

if (!existsSync(distEmbed)) {
  console.error("[sync-embed] dist-embed not found — run `npm --prefix .. run build:embed` first")
  process.exit(1)
}

rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })
cpSync(distEmbed, dest, { recursive: true })
console.log(`[sync-embed] embed bundle copied → ${dest}`)

// Single-file archive for Metro bundling + first-launch unzip in the app.
const zipPath = join(mobileRoot, "assets", "embed.zip")
try {
  execSync(`zip -qr "${zipPath}" .`, { cwd: distEmbed, stdio: "inherit" })
  console.log(`[sync-embed] embed.zip written → ${zipPath}`)
} catch (err) {
  console.error("[sync-embed] zip failed — install `zip`:", err.message)
  process.exit(1)
}
