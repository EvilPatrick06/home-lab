import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import en from './locales/en.json'

// Drift gate for the compile-time TranslationKey union. `generated-keys.ts` is
// produced by `scripts/i18n/gen-key-union.mjs` (`npm run i18n:gen-keys`) from
// en.json; if a key is added/removed without regenerating, the union goes stale
// and t() typo-catching drifts from reality. This proves the file is current.
//
// `TranslationKey` is a type (erased at runtime), so we parse the union members
// out of the generated source text and compare against a fresh flatten of en.json
// — the same plural-base synthesis the generator applies.

const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other']

function flatten(obj: unknown, prefix = '', out: string[] = []): string[] {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const k of Object.keys(obj as Record<string, unknown>)) {
      flatten((obj as Record<string, unknown>)[k], prefix ? `${prefix}.${k}` : k, out)
    }
  } else {
    out.push(prefix)
  }
  return out
}

/** Expected union members: every leaf, plus the bare base of each plural leaf. */
function expectedKeys(): string[] {
  const leaves = flatten(en)
  const set = new Set(leaves)
  for (const leaf of leaves) {
    const suffix = PLURAL_SUFFIXES.find((s) => leaf.endsWith(s))
    if (suffix) set.add(leaf.slice(0, -suffix.length))
  }
  return [...set].sort()
}

/** Parse the `| 'a.b'` union members out of the generated file. */
function generatedKeys(): string[] {
  const here = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(join(here, 'generated-keys.ts'), 'utf8')
  const members: string[] = []
  const re = /^\s*\|\s*'([^']+)'/gm
  let m: RegExpExecArray | null
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex-exec loop
  while ((m = re.exec(src)) !== null) members.push(m[1])
  return members.sort()
}

describe('generated TranslationKey union (i18n:gen-keys)', () => {
  it('matches en.json (regenerate via npm run i18n:gen-keys)', () => {
    const expected = expectedKeys()
    const generated = generatedKeys()
    const missing = expected.filter((k) => !generated.includes(k))
    const extra = generated.filter((k) => !expected.includes(k))
    expect({ missing, extra }).toEqual({ missing: [], extra: [] })
  })
})
