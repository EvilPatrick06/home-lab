/**
 * electron-eol-check.mjs
 *
 * Turns the "remember to bump Electron before EOL" manual reminder
 * (docs/DEPENDENCIES.md → "Electron upgrade cadence") into an automatic check.
 *
 * Electron ships a new major roughly every ~8 weeks and supports the latest 3
 * majors (each major ≈ 6 months of support). Running an EOL major means no
 * Chromium/V8 security patches. This script reads the installed Electron major
 * and compares it against a hardcoded EOL-date map, printing a WARNING when the
 * running major is within EOL_WARN_WEEKS of its end-of-life — or already past it.
 *
 * Informational by default (exit 0 even on warnings) so it can run as a
 * non-blocking CI step. Pass `--strict` to exit non-zero on a warning.
 *
 * EOL data source: https://endoflife.date/electron and the official
 * https://releases.electronjs.org/schedule (each major is supported until the
 * 3rd-later major ships). Verified 2026-05-31. Re-check / extend this map when
 * bumping Electron — add the new major's EOL row from the schedule above.
 *
 * Run via: node scripts/maintenance/electron-eol-check.mjs [--strict]
 * npm:      npm run check:electron-eol
 */

import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..', '..')

// How close to EOL (in weeks) before we start warning.
const EOL_WARN_WEEKS = 8
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

// Hardcoded Electron major → end-of-support (EOL) date (UTC, ISO yyyy-mm-dd).
// Source: https://endoflife.date/electron + https://releases.electronjs.org/schedule
// (verified 2026-05-31). A major is supported until ~the date its 3rd-later
// major ships. Extend this when you bump Electron — never let the running
// major fall off the bottom of the map (that's treated as "unknown" below).
const EOL_BY_MAJOR = {
  38: '2026-03-10',
  39: '2026-05-05',
  40: '2026-06-30',
  41: '2026-08-25',
  42: '2026-10-20',
  43: '2027-01-05',
  44: '2027-03-02'
}

/** Parse the leading integer (major version) out of a semver-ish string. */
function parseMajor(version) {
  const cleaned = String(version)
    .trim()
    .replace(/^[^0-9]*/, '')
  const major = Number.parseInt(cleaned, 10)
  return Number.isNaN(major) ? null : major
}

/**
 * Resolve the installed Electron major. Prefer the actually-installed package
 * (node_modules/electron/package.json) so the check reflects reality even if
 * package.json's range drifts; fall back to the declared devDependency range.
 */
function resolveElectronMajor() {
  const installed = join(root, 'node_modules', 'electron', 'package.json')
  if (existsSync(installed)) {
    try {
      const { version } = JSON.parse(readFileSync(installed, 'utf8'))
      const major = parseMajor(version)
      if (major !== null) return { major, version, source: 'node_modules/electron' }
    } catch {
      // fall through to package.json
    }
  }

  const pkgPath = join(root, 'package.json')
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    const range = pkg.devDependencies?.electron ?? pkg.dependencies?.electron
    if (range) {
      const major = parseMajor(range)
      if (major !== null) return { major, version: range, source: 'package.json (devDependencies)' }
    }
  } catch {
    // fall through to the unresolved case
  }

  return null
}

function daysBetween(a, b) {
  return Math.round((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000))
}

const resolved = resolveElectronMajor()

if (resolved === null) {
  console.log('check:electron-eol: could not resolve the installed Electron version — skipping.')
  process.exit(0)
}

const { major, version, source } = resolved
const eolStr = EOL_BY_MAJOR[major]

if (!eolStr) {
  // The running major is newer than anything we've recorded — that's fine
  // (newer = more runway), but we can't compute a real EOL distance.
  console.log(
    `check:electron-eol: Electron ${major} (${version}, from ${source}) is newer than the recorded EOL map ` +
      `(top entry: ${Math.max(...Object.keys(EOL_BY_MAJOR).map(Number))}). Update EOL_BY_MAJOR from ` +
      'https://releases.electronjs.org/schedule to track its end-of-life.'
  )
  process.exit(0)
}

const now = new Date()
const eol = new Date(`${eolStr}T00:00:00Z`)
const msUntil = eol.getTime() - now.getTime()
const days = daysBetween(eol, now)
const strict = process.argv.includes('--strict')

if (msUntil < 0) {
  console.warn(
    `WARNING: Electron ${major} (${version}, from ${source}) reached end-of-life on ${eolStr} ` +
      `(${-days} day(s) ago). It no longer receives Chromium/V8 security patches — bump to a ` +
      'currently-supported major. See docs/DEPENDENCIES.md → "Electron upgrade cadence".'
  )
  process.exit(strict ? 1 : 0)
}

if (msUntil <= EOL_WARN_WEEKS * MS_PER_WEEK) {
  const weeks = Math.floor(days / 7)
  console.warn(
    `WARNING: Electron ${major} (${version}, from ${source}) hits end-of-life on ${eolStr} — ` +
      `~${days} day(s) (~${weeks} week(s)) away. Plan a bump to a current major before then. ` +
      'See docs/DEPENDENCIES.md → "Electron upgrade cadence".'
  )
  process.exit(strict ? 1 : 0)
}

console.log(
  `check:electron-eol: Electron ${major} (${version}, from ${source}) is supported until ${eolStr} ` +
    `(~${days} day(s) away). No action needed.`
)
process.exit(0)
