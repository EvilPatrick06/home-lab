#!/usr/bin/env node
// Phase 34 — merge i18n/locales/_fragments/*.json into en.json.
//
// Each area sweep writes a fragment (one top-level namespace, byte-identical
// English values). This deep-merges every fragment into en.json so `t('ns.key')`
// resolves. Idempotent: re-merging the same fragments is a no-op. Detects
// genuine collisions (the SAME leaf key set to DIFFERENT values by two
// fragments) and fails loudly rather than silently clobbering.
//
// Usage: node scripts/i18n/merge-fragments.mjs [--clean]
//   --clean  also remove the _fragments/ directory after a successful merge.

import { readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const localesDir = join(here, '..', '..', 'src', 'renderer', 'src', 'i18n', 'locales')
const fragmentsDir = join(localesDir, '_fragments')
const enPath = join(localesDir, 'en.json')

const collisions = []

/** Deep-merge `src` into `target`, recording any conflicting leaf overwrite. */
function deepMerge(target, src, path = '') {
  for (const key of Object.keys(src)) {
    const here = path ? `${path}.${key}` : key
    const sv = src[key]
    if (sv && typeof sv === 'object' && !Array.isArray(sv)) {
      if (target[key] && typeof target[key] !== 'object') {
        collisions.push(`${here} (object over scalar)`)
        target[key] = {}
      }
      target[key] = target[key] || {}
      deepMerge(target[key], sv, here)
    } else {
      if (key in target && target[key] !== sv && typeof target[key] !== 'object') {
        collisions.push(`${here}: "${target[key]}" vs "${sv}"`)
      }
      target[key] = sv
    }
  }
  return target
}

const enCurrent = JSON.parse(readFileSync(enPath, 'utf8'))

let fragments = []
try {
  fragments = readdirSync(fragmentsDir).filter((f) => f.endsWith('.json')).sort()
} catch {
  console.error('No _fragments/ dir — nothing to merge.')
  process.exit(0)
}

// Rebuild deterministically: fragments are authoritative for their top-level
// namespaces, so start from a base of only the en.json namespaces NOT produced
// by any fragment (the `common` seed), then merge fragments fresh. Without this,
// re-merging accumulates into stale values and a legitimately CHANGED value
// (e.g. an interpolation var rename) reads as a false collision.
const parsed = fragments.map((f) => JSON.parse(readFileSync(join(fragmentsDir, f), 'utf8')))
const fragNamespaces = new Set()
for (const frag of parsed) for (const k of Object.keys(frag)) fragNamespaces.add(k)

const en = {}
for (const k of Object.keys(enCurrent)) {
  if (!fragNamespaces.has(k)) en[k] = enCurrent[k]
}

let merged = 0
for (const frag of parsed) {
  deepMerge(en, frag)
  merged++
}

if (collisions.length) {
  console.error(`✗ ${collisions.length} key collision(s) — two fragments set the same key to different values:`)
  for (const c of collisions.slice(0, 40)) console.error('  ' + c)
  process.exit(1)
}

writeFileSync(enPath, JSON.stringify(en, null, 2) + '\n')
const leafCount = JSON.stringify(en).split('":"').length - 1
console.log(`✓ merged ${merged} fragment(s) → en.json (~${leafCount} leaf keys)`)

if (process.argv.includes('--clean')) {
  rmSync(fragmentsDir, { recursive: true, force: true })
  console.log('✓ removed _fragments/')
}
