// Copies the shared TypeScript sources (the bridge protocol/types) from the
// parent dnd-app package into the mobile app tree (src/_shared) so Metro can
// bundle them in-tree and EAS — which only uploads the mobile project dir — can
// see them. Mirrors the sync-embed.mjs pattern. Run before bundling/builds.
//
// `--check` mode (CI drift guard): instead of copying, verify the committed
// src/_shared copy is byte-identical to what a fresh sync would produce, and
// exit 1 with a summary when it is not. Wired into dnd-app CI so a desktop-side
// `src/shared` change can never silently strand the mobile copy again.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const src = path.resolve(here, '../../src/shared')
const dest = path.resolve(here, '../src/_shared')

const README_NAME = 'README.md'
const README_BODY =
  '# Generated — do not edit\n\nSynced from `dnd-app/src/shared` by `scripts/sync-shared.mjs`.\nEdit the source there; this copy exists so Metro/EAS can bundle it in-tree.\n'

// Everything under src/shared is synced except tests (they pull in vitest).
const listSyncedFiles = (root, base = root) => {
  const out = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.endsWith('.test.ts')) continue
    const abs = path.join(root, entry.name)
    if (entry.isDirectory()) out.push(...listSyncedFiles(abs, base))
    else out.push(path.relative(base, abs))
  }
  return out
}

const check = () => {
  const problems = []
  const srcFiles = listSyncedFiles(src)
  const destFiles = fs.existsSync(dest) ? listSyncedFiles(dest).filter((f) => f !== README_NAME) : []
  const destSet = new Set(destFiles)
  for (const rel of srcFiles) {
    if (!destSet.has(rel)) {
      problems.push(`missing from _shared: ${rel}`)
      continue
    }
    destSet.delete(rel)
    const a = fs.readFileSync(path.join(src, rel))
    const b = fs.readFileSync(path.join(dest, rel))
    if (!a.equals(b)) problems.push(`differs from src/shared: ${rel}`)
  }
  for (const rel of destSet) problems.push(`stale extra file in _shared: ${rel}`)
  if (problems.length > 0) {
    console.error('[sync-shared --check] mobile/src/_shared has drifted from src/shared:')
    for (const p of problems) console.error(`  - ${p}`)
    console.error(
      'Run `node mobile/scripts/sync-shared.mjs` (or `npm --prefix mobile run sync-shared`) and commit the result.'
    )
    process.exit(1)
  }
  console.log(`[sync-shared --check] OK — ${srcFiles.length} files in sync`)
}

const copy = () => {
  fs.rmSync(dest, { recursive: true, force: true })
  fs.mkdirSync(dest, { recursive: true })
  const copyDir = (s, d) => {
    for (const entry of fs.readdirSync(s, { withFileTypes: true })) {
      if (entry.name.endsWith('.test.ts')) continue // skip tests (pull in vitest)
      const sp = path.join(s, entry.name)
      const dp = path.join(d, entry.name)
      if (entry.isDirectory()) {
        fs.mkdirSync(dp, { recursive: true })
        copyDir(sp, dp)
      } else {
        fs.copyFileSync(sp, dp)
      }
    }
  }
  copyDir(src, dest)
  // Leave a header note so it is obvious the dir is generated.
  fs.writeFileSync(path.join(dest, README_NAME), README_BODY)
  console.log('[sync-shared] copied', src, '->', dest)
}

if (process.argv.includes('--check')) check()
else copy()
