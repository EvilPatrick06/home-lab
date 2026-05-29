#!/usr/bin/env node
/**
 * Cut a new dnd-app release.
 *
 * Usage:
 *   node scripts/release/cut.mjs <X.Y.Z> [--notes-file <path>]
 *
 * What it does (in order, fail-fast):
 *   1. Validate args + version format.
 *   2. Require a clean working tree (no uncommitted changes).
 *   3. Reject if tag vX.Y.Z already exists locally or on the remote.
 *   4. Bump `dnd-app/package.json` and `dnd-app/package-lock.json` to X.Y.Z.
 *      Keeping these in sync with the tag is non-negotiable: electron-builder
 *      reads package.json `version` to name artifacts (e.g.
 *      `dnd-vtt-${version}-setup.exe`) AND to decide which release tag to
 *      publish to. A mismatch silently uploads to the wrong release (or
 *      nowhere) — that's the bug that caused v2.0.1/v2.0.2/v2.1.0's
 *      partial-asset uploads on 2026-05-16.
 *   5. Commit the bump as `chore(release): bump to vX.Y.Z`.
 *   6. Tag vX.Y.Z on that commit.
 *   7. Push master + tag in one step. The tag push triggers the Release
 *      workflow (`.github/workflows/release.yml`):
 *         preflight → build (Win+Linux matrix) → verify-assets.
 *      Preflight will hard-fail if package.json doesn't match the tag, so the
 *      version sync above is also enforced by CI.
 *   8. Optionally pre-create the GitHub release with `--notes-file <path>` so
 *      the body is set before electron-builder uploads its artifacts. If you
 *      skip this, electron-builder will create the release itself with an
 *      empty body and you can edit notes afterward.
 *
 * Run from the dnd-app/ working directory or the repo root — the script
 * resolves both via __dirname.
 */

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
// scripts/release/ → scripts/ → dnd-app/
const DND_APP_ROOT = join(SCRIPT_DIR, '..', '..')
// dnd-app/ → repo root
const REPO_ROOT = join(DND_APP_ROOT, '..')

// ── arg parsing ───────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const version = args.find((a) => !a.startsWith('-'))
let notesFileIndex = args.indexOf('--notes-file')
const notesFile = notesFileIndex >= 0 ? args[notesFileIndex + 1] : null

if (!version) {
  console.error('Usage: node scripts/release/cut.mjs <X.Y.Z> [--notes-file <path>]')
  process.exit(1)
}
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Invalid version "${version}". Use semver X.Y.Z (e.g. 2.1.1).`)
  process.exit(1)
}
const tag = `v${version}`

if (notesFile && !existsSync(notesFile)) {
  console.error(`Notes file not found: ${notesFile}`)
  process.exit(1)
}

// ── helpers ───────────────────────────────────────────────────────────────

function sh(cmd, opts = {}) {
  return execSync(cmd, {
    encoding: 'utf-8',
    cwd: REPO_ROOT,
    stdio: opts.silent ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    ...opts
  })
}

function shCapture(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', cwd: REPO_ROOT, stdio: ['inherit', 'pipe', 'pipe'] }).trim()
  } catch (err) {
    return null
  }
}

function fail(msg) {
  console.error(`\n✖ ${msg}\n`)
  process.exit(1)
}

// ── 1. clean working tree ─────────────────────────────────────────────────

const status = shCapture('git status --porcelain')
if (status) {
  fail(`Working tree is not clean. Commit or stash these changes first:\n${status}`)
}

// ── 2. tag must not already exist ─────────────────────────────────────────

const localTag = shCapture(`git tag -l ${tag}`)
if (localTag) {
  fail(`Tag ${tag} already exists locally. Delete it first: git tag -d ${tag}`)
}
// Fetch remote tags to check the origin too
shCapture('git fetch --tags')
const remoteTags = shCapture('git ls-remote --tags origin')
if (remoteTags && remoteTags.includes(`refs/tags/${tag}`)) {
  fail(`Tag ${tag} already exists on origin. Pick a new version, or delete the remote tag first: git push --delete origin ${tag}`)
}

// ── 3. bump versions ──────────────────────────────────────────────────────

const pkgPath = join(DND_APP_ROOT, 'package.json')
const lockPath = join(DND_APP_ROOT, 'package-lock.json')

const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
const prev = pkg.version
pkg.version = version
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
console.log(`✓ dnd-app/package.json: ${prev} → ${version}`)

if (existsSync(lockPath)) {
  const lock = JSON.parse(readFileSync(lockPath, 'utf-8'))
  lock.version = version
  if (lock.packages?.['']) {
    lock.packages[''].version = version
  }
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`)
  console.log(`✓ dnd-app/package-lock.json: → ${version}`)
}

// ── 4. commit + tag + push master ─────────────────────────────────────────

sh('git add dnd-app/package.json dnd-app/package-lock.json')
sh(`git commit -m "chore(release): bump dnd-app to ${tag}"`)
sh(`git tag ${tag}`)
console.log(`✓ Committed and tagged ${tag}`)

// Push commit first, then the tag (tag-push triggers the Release workflow).
sh('git push origin HEAD')

// ── 5. optionally pre-create release with notes BEFORE the tag push ───────
// Pre-creating with custom notes prevents electron-builder from creating an
// empty release. The tag push below then triggers the workflow which
// uploads artifacts INTO the pre-existing release.
if (notesFile) {
  console.log(`✓ Pre-creating GitHub release with notes from ${notesFile}`)
  const fullSha = shCapture('git rev-parse HEAD')
  sh(`gh release create ${tag} --target ${fullSha} --title "${version}" --notes-file "${notesFile}"`)
}

sh(`git push origin ${tag}`)
console.log(`✓ Pushed ${tag} — Release workflow now running.`)
console.log('')
console.log(`Track CI:    https://github.com/EvilPatrick06/home-lab/actions`)
console.log(`Release URL: https://github.com/EvilPatrick06/home-lab/releases/tag/${tag}`)
