#!/usr/bin/env node
// Locale parity gate (suggestions-log 2026-06-22): every non-source locale must
// carry exactly the same flattened key set as the source locale (en.json).
// check-keys.mjs only validates that referenced keys exist in en.json; nothing
// checked that es.json kept pace, so a contributor adding an en key but
// forgetting the es translation got no failure (es users silently fall back to
// the en string, or the raw key if i18next fallback is off). This fails CI on
// any missing OR extra key in a non-source locale.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const localesDir = resolve(here, '..', '..', 'src', 'renderer', 'src', 'i18n', 'locales')
const SOURCE = 'en.json'

function flatten(obj, prefix, out) {
  for (const k of Object.keys(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    const v = obj[k]
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, path, out)
    else out.add(path)
  }
  return out
}

const enKeys = flatten(JSON.parse(readFileSync(join(localesDir, SOURCE), 'utf8')), '', new Set())
const locales = readdirSync(localesDir).filter((f) => f.endsWith('.json') && f !== SOURCE)
let failed = false
for (const f of locales) {
  const keys = flatten(JSON.parse(readFileSync(join(localesDir, f), 'utf8')), '', new Set())
  const missing = [...enKeys].filter((k) => !keys.has(k))
  const extra = [...keys].filter((k) => !enKeys.has(k))
  if (missing.length || extra.length) {
    failed = true
    console.error(`✖ ${f}: ${missing.length} missing, ${extra.length} extra vs ${SOURCE}`)
    for (const k of missing.slice(0, 20)) console.error(`    missing: ${k}`)
    for (const k of extra.slice(0, 20)) console.error(`    extra:   ${k}`)
    if (missing.length > 20 || extra.length > 20) console.error('    … (truncated)')
  } else {
    console.log(`✔ ${f}: ${keys.size} keys, in parity with ${SOURCE}`)
  }
}
process.exit(failed ? 1 : 0)
