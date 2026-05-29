/**
 * verify-build.mjs
 * Phase 19c — local pre-package smoke check.
 *
 * Runs after `electron-vite build` and before `electron-builder` packages the
 * app. Asserts the critical build outputs exist so a broken/partial build is
 * caught locally instead of shipping an installer that crashes on launch or
 * (the Phase 19a class of bug) silently can't find its bundled 5e data.
 *
 * Exits non-zero with the list of missing paths if any are absent.
 *
 * Run via: node scripts/build/verify-build.mjs
 */

import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..', '..')

const required = [
  'out/main/index.js',
  'out/preload/index.mjs',
  'out/renderer/index.html',
  // Vite strips public/, so bundled 5e data lands at out/renderer/data/5e (Phase 19a).
  'out/renderer/data/5e/spells/spells.json',
  // Rulebook RAG index is an extraResource checked into the repo.
  'resources/chunk-index.json'
]

const missing = required.filter((rel) => !existsSync(join(root, rel)))

if (missing.length > 0) {
  console.error('verify-build: missing required build outputs:')
  for (const m of missing) console.error(`  ✗ ${m}`)
  console.error('\nDid `electron-vite build` succeed? Aborting before electron-builder.')
  process.exit(1)
}

console.log(`verify-build: all ${required.length} required outputs present.`)
