/**
 * prerelease-clean.js
 * Removes the entire dist/ output directory before a release build.
 * Prevents stale artifacts (old .exe, .blockmap, .yml, builder cache)
 * from interfering with delta-update logic or being uploaded accidentally.
 *
 * Run via: node scripts/prerelease-clean.js
 * Called automatically by the "prerelease" npm script.
 */

import { existsSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = join(__dirname, '..', 'dist')

if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true, force: true })
  console.log(`Cleaned dist/ → ${distDir}`)
} else {
  console.log('dist/ does not exist, nothing to clean.')
}
