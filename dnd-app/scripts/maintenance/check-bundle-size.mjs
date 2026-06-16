#!/usr/bin/env node
// PHASE-13 13O — bundle-size CI guard. Walks the electron-vite `out/` dirs, sums file
// sizes (and gzips renderer .js chunks), and fails when any budget in bundle-budgets.json
// is exceeded. Zero deps; Node >= 20. Run AFTER `npx electron-vite build`.
//
//   node scripts/maintenance/check-bundle-size.mjs                 # check (CI)
//   node scripts/maintenance/check-bundle-size.mjs --write-budgets # record actual*1.25
//   node scripts/maintenance/check-bundle-size.mjs --budgets <f>   # use an alternate budgets file
//
// Exit codes: 0 = within budget / wrote budgets, 1 = a budget exceeded, 2 = `out/` missing.

import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import zlib from 'node:zlib'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const root = process.cwd()
const DIRS = ['out/renderer', 'out/main', 'out/preload']
const KB = 1024
const HEADROOM = 1.25 // budget = current * 1.25 (catch runaway regressions, not routine growth)

const argv = process.argv.slice(2)
const writeBudgets = argv.includes('--write-budgets')
const budgetsArgIdx = argv.indexOf('--budgets')
const budgetsPath =
  budgetsArgIdx >= 0 && argv[budgetsArgIdx + 1]
    ? path.resolve(argv[budgetsArgIdx + 1])
    : path.join(__dirname, 'bundle-budgets.json')

/** Recursively list every file under `dir`. */
function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (entry.isFile()) out.push(full)
  }
  return out
}

/** Total bytes + max gzipped .js chunk for a directory. */
function measure(absDir) {
  let totalBytes = 0
  let maxChunkGzipBytes = 0
  for (const file of walk(absDir)) {
    const bytes = fs.statSync(file).size
    totalBytes += bytes
    if (file.endsWith('.js')) {
      const gz = zlib.gzipSync(fs.readFileSync(file)).length
      if (gz > maxChunkGzipBytes) maxChunkGzipBytes = gz
    }
  }
  return { totalBytes, maxChunkGzipBytes }
}

/** Round up to the nearest 50 KB so routine growth doesn't flake the gate. */
const roundUp50k = (n) => Math.ceil(n / (50 * KB)) * (50 * KB)
const fmtKb = (n) => `${(n / KB).toFixed(1)} KB`

if (!fs.existsSync(path.join(root, 'out'))) {
  console.error('✗ out/ not found — run `npx electron-vite build` before the bundle-size guard.')
  process.exit(2)
}

const measured = {}
for (const dir of DIRS) {
  const abs = path.join(root, dir)
  if (!fs.existsSync(abs)) {
    console.error(`✗ ${dir} not found — incomplete build.`)
    process.exit(2)
  }
  measured[dir] = measure(abs)
}

if (writeBudgets) {
  const budgets = {
    'out/renderer': {
      totalBytes: roundUp50k(measured['out/renderer'].totalBytes * HEADROOM),
      maxChunkGzipBytes: roundUp50k(measured['out/renderer'].maxChunkGzipBytes * HEADROOM)
    },
    'out/main': { totalBytes: roundUp50k(measured['out/main'].totalBytes * HEADROOM) },
    'out/preload': { totalBytes: roundUp50k(measured['out/preload'].totalBytes * HEADROOM) }
  }
  fs.writeFileSync(budgetsPath, `${JSON.stringify(budgets, null, 2)}\n`)
  console.log(`✓ wrote budgets (actual × ${HEADROOM}, rounded up to 50 KB) → ${path.relative(root, budgetsPath)}`)
  for (const dir of DIRS) console.log(`  ${dir}: ${fmtKb(measured[dir].totalBytes)} actual`)
  process.exit(0)
}

if (!fs.existsSync(budgetsPath)) {
  console.error(`✗ budgets file missing: ${path.relative(root, budgetsPath)} (run with --write-budgets once).`)
  process.exit(2)
}

const budgets = JSON.parse(fs.readFileSync(budgetsPath, 'utf8'))
const offenders = []
const rows = []

for (const dir of DIRS) {
  const b = budgets[dir] ?? {}
  const m = measured[dir]
  const checks = [['total', m.totalBytes, b.totalBytes]]
  if (dir === 'out/renderer') checks.push(['max gzip chunk', m.maxChunkGzipBytes, b.maxChunkGzipBytes])
  for (const [label, actual, budget] of checks) {
    if (typeof budget !== 'number') continue
    const headroomPct = (((budget - actual) / budget) * 100).toFixed(1)
    const over = actual > budget
    rows.push(`  ${over ? '✗' : '✓'} ${dir} (${label}): ${fmtKb(actual)} / ${fmtKb(budget)} (${headroomPct}% headroom)`)
    if (over) offenders.push(`${dir} (${label}): ${fmtKb(actual)} exceeds ${fmtKb(budget)}`)
  }
}

console.log('Bundle size guard (actual / budget):')
for (const row of rows) console.log(row)

if (offenders.length > 0) {
  console.error('\n✗ Bundle budget exceeded:')
  for (const o of offenders) console.error(`  - ${o}`)
  console.error('\nIf this growth is intentional, re-run with --write-budgets and commit bundle-budgets.json.')
  process.exit(1)
}

console.log('\n✓ All bundles within budget.')
process.exit(0)
