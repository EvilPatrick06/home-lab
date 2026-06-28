// Copies the shared TypeScript sources (the bridge protocol/types) from the
// parent dnd-app package into the mobile app tree (src/_shared) so Metro can
// bundle them in-tree and EAS — which only uploads the mobile project dir — can
// see them. Mirrors the sync-embed.mjs pattern. Run before bundling/builds.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const src = path.resolve(here, '../../src/shared')
const dest = path.resolve(here, '../src/_shared')

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
fs.writeFileSync(
  path.join(dest, 'README.md'),
  '# Generated — do not edit\n\nSynced from `dnd-app/src/shared` by `scripts/sync-shared.mjs`.\nEdit the source there; this copy exists so Metro/EAS can bundle it in-tree.\n'
)
console.log('[sync-shared] copied', src, '->', dest)
