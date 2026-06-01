#!/usr/bin/env node
// Backlog grind — generate the compile-time TranslationKey literal union.
//
// Flattens `en.json` (the source of truth) into the full set of dotted leaf
// keys and writes `src/renderer/src/i18n/generated-keys.ts` containing
// `export type TranslationKey = 'a.b' | 'c.d' | …`. Wiring `t()` to this union
// turns every typo'd / un-added key into a compile error instead of a silent
// raw-key render at runtime.
//
// The file is GENERATED — never hand-edit it. Re-run after touching en.json:
//   npm run i18n:gen-keys
//
// Generation rules mirror `check-keys.mjs` / `gen-pseudo-locale.mjs`:
//   - Only LEAF paths become union members (objects are intermediate nodes).
//   - i18next plural variants (`x.count_one` / `x.count_other`) are stored under
//     the suffixed key but CALLED with the bare base (`t('x.count', {count})`),
//     which i18next resolves at runtime. So for every `<base>_<plural>` leaf we
//     ALSO synthesize the bare `<base>` as a union member (the suffixed variants
//     stay too — harmless, and keeps the union a faithful mirror of the JSON).
//     This is the inverse of `check-keys.mjs`'s `hasKey()` plural tolerance.
//   - Members are sorted for a stable, diff-friendly output.

// i18next CLDR plural-category suffixes. A leaf `foo_one` / `foo_other` (etc.)
// is addressed by callers as the bare `foo`, so the union must include `foo`.
const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other']

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const i18nDir = resolve(here, '..', '..', 'src', 'renderer', 'src', 'i18n')
const enPath = join(i18nDir, 'locales', 'en.json')
const outPath = join(i18nDir, 'generated-keys.ts')

/** Flatten a nested object into an array of dotted leaf paths. */
function flatten(obj, prefix, out) {
  for (const k of Object.keys(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    const v = obj[k]
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, path, out)
    else out.push(path)
  }
  return out
}

const en = JSON.parse(readFileSync(enPath, 'utf8'))
const leaves = flatten(en, '', [])

// Synthesize the bare base key for every plural-suffixed leaf so the union
// matches how i18next is actually called (`t('x.count', {count})`).
const keySet = new Set(leaves)
for (const leaf of leaves) {
  const suffix = PLURAL_SUFFIXES.find((s) => leaf.endsWith(s))
  if (suffix) keySet.add(leaf.slice(0, -suffix.length))
}
const keys = [...keySet].sort()

// en.json keys are plain dotted paths (word chars, dots, dashes) — no quotes or
// backslashes — so single-quoting them needs no escaping. Guard anyway so a
// future stray key can't emit a broken union (it would fail the regex and abort).
const SAFE_KEY = /^[\w.-]+$/
const bad = keys.filter((k) => !SAFE_KEY.test(k))
if (bad.length) {
  console.error(`✗ ${bad.length} en.json key(s) contain characters unsafe for the union literal:`)
  for (const k of bad.slice(0, 20)) console.error(`  ${k}`)
  process.exit(1)
}

const members = keys.map((k) => `  | '${k}'`).join('\n')
const banner = `/**
 * GENERATED FILE — do not edit by hand.
 * Run \`npm run i18n:gen-keys\` (scripts/i18n/gen-key-union.mjs) to regenerate
 * after changing en.json. Source: src/renderer/src/i18n/locales/en.json.
 *
 * A literal union of every dotted leaf key in en.json (${keys.length} keys),
 * so \`t()\` calls are checked at compile time instead of silently rendering a
 * raw key string when a key is typo'd or missing.
 */`

writeFileSync(outPath, `${banner}\nexport type TranslationKey =\n${members}\n`)
console.log(`✓ wrote ${outPath} (${keys.length} keys)`)
