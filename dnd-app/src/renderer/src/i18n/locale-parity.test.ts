import { describe, expect, it } from 'vitest'
import { SUPPORTED_LOCALES } from './config'

// Data-driven parity guard. The check-keys gate only flattens en.json, so a
// second locale missing keys would pass it silently. Rather than a hardcoded
// es-only block (which left every FUTURE locale unchecked), we eagerly load
// every bundled ./locales/*.json and assert key-set + {{interpolation}} parity
// for each non-en locale in SUPPORTED_LOCALES — so adding fr.json (and listing
// it in SUPPORTED_LOCALES) is covered automatically.
const localeModules = import.meta.glob('./locales/*.json', { eager: true }) as Record<string, { default: unknown }>

function loadLocale(code: string): unknown {
  const entry = localeModules[`./locales/${code}.json`]
  if (!entry) throw new Error(`locale file ./locales/${code}.json not found`)
  return entry.default
}

function flatten(obj: unknown, prefix = '', out: Map<string, unknown> = new Map()): Map<string, unknown> {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const k of Object.keys(obj as Record<string, unknown>)) {
      flatten((obj as Record<string, unknown>)[k], prefix ? `${prefix}.${k}` : k, out)
    }
  } else {
    out.set(prefix, obj)
  }
  return out
}

const fe = flatten(loadLocale('en'))
const otherLocales = SUPPORTED_LOCALES.filter((l) => l !== 'en')

describe('locale parity', () => {
  it('has at least one non-en locale to check', () => {
    expect(otherLocales.length).toBeGreaterThan(0)
  })

  for (const code of otherLocales) {
    describe(`${code} locale parity`, () => {
      const fl = flatten(loadLocale(code))

      it('has the IDENTICAL key set as en', () => {
        const eKeys = [...fe.keys()].sort()
        const lKeys = [...fl.keys()].sort()
        const missing = eKeys.filter((k) => !fl.has(k))
        const extra = lKeys.filter((k) => !fe.has(k))
        expect({ missing, extra }).toEqual({ missing: [], extra: [] })
      })

      it('preserves {{interpolation}} placeholders', () => {
        for (const [k, v] of fe.entries()) {
          if (typeof v === 'string') {
            const placeholders = v.match(/\{\{[^}]*\}\}/g)
            if (placeholders) {
              const lv = String(fl.get(k))
              for (const p of placeholders) expect(lv, `${code}[${k}] must keep ${p}`).toContain(p)
            }
          }
        }
      })
    })
  }
})
