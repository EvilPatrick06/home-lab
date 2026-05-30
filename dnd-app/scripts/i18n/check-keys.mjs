#!/usr/bin/env node
// Phase 34k — i18n key checker.
//
// Flattens en.json into the full set of dotted keys, then scans the renderer
// source for static `t('literal')` / `i18n.t('literal')` calls and fails if any
// referenced key is missing from en.json. Catches typos + sweep gaps that would
// otherwise render the raw key string at runtime.
//
// Dynamic keys (template literals, variables, concatenations) are skipped — they
// can't be statically verified. i18next plural calls (`t('x.count', {count})`)
// are satisfied by `x.count`, `x.count_one`, or `x.count_other` in en.json.
//
// Usage: node scripts/i18n/check-keys.mjs   (exit 1 on any missing key)

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const rendererSrc = join(root, 'src', 'renderer', 'src')
const enPath = join(rendererSrc, 'i18n', 'locales', 'en.json')

/** Flatten a nested object into a Set of dotted leaf paths. */
function flatten(obj, prefix, out) {
  for (const k of Object.keys(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    const v = obj[k]
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, path, out)
    else out.add(path)
  }
  return out
}

const en = JSON.parse(readFileSync(enPath, 'utf8'))
const keys = flatten(en, '', new Set())

/** A referenced key is satisfied if it (or its plural variants) exist. */
function hasKey(k) {
  return keys.has(k) || keys.has(`${k}_one`) || keys.has(`${k}_other`)
}

// The i18n module itself (config/index/use-translation) documents the key
// convention in comments with illustrative `t('…')` examples — not real consumer
// calls — so it is excluded from the consumer scan.
const I18N_DIR = join(rendererSrc, 'i18n')

function listFiles(dir, out = []) {
  if (dir === I18N_DIR) return out
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'dist' || name === '_fragments') continue
    const full = join(dir, name)
    const s = statSync(full)
    if (s.isDirectory()) listFiles(full, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

// `t('key'`/`t("key"` and `i18n.t('key'` — single/double quotes only (backtick =
// dynamic, skipped). Key chars: word, dot, dash.
const CALL_RE = /(?<![\w.])(?:i18n\.)?t\(\s*(['"])([\w.-]+)\1/g

const files = listFiles(rendererSrc)
const missing = []
for (const abs of files) {
  const content = readFileSync(abs, 'utf8')
  CALL_RE.lastIndex = 0
  let m
  while ((m = CALL_RE.exec(content)) !== null) {
    const key = m[2]
    // Only check dotted keys (a bare word is almost always a non-i18n `t(...)`
    // helper, e.g. a local `t` param; our keys are always namespaced).
    if (!key.includes('.')) continue
    if (!hasKey(key)) {
      const line = content.slice(0, m.index).split('\n').length
      missing.push(`${relative(root, abs)}:${line} — t('${key}')`)
    }
  }
}

console.log(`i18n key-check: ${keys.size} keys in en.json, scanned ${files.length} source files.`)
if (missing.length) {
  console.error(`\n✗ ${missing.length} referenced key(s) missing from en.json:`)
  for (const x of missing.slice(0, 60)) console.error('  ' + x)
  if (missing.length > 60) console.error(`  …and ${missing.length - 60} more`)
  process.exit(1)
}
console.log('✓ every static t() / i18n.t() key resolves.')
