import { describe, expect, it } from 'vitest'
import en from './locales/en.json'
import enXA from './locales/en-XA.json'

// The existing check-keys gate only flattens en.json — a second locale missing
// keys would pass it silently. This is the gate that proves en-XA parity. Run
// `npm run i18n:gen-pseudo` after adding any en.json key, or this fails.
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

describe('en-XA pseudo-locale parity', () => {
  const fe = flatten(en)
  const fx = flatten(enXA)

  it('has the IDENTICAL key set as en (regenerate via npm run i18n:gen-pseudo)', () => {
    const eKeys = [...fe.keys()].sort()
    const xKeys = [...fx.keys()].sort()
    const missingInXA = eKeys.filter((k) => !fx.has(k))
    const extraInXA = xKeys.filter((k) => !fe.has(k))
    expect({ missingInXA, extraInXA }).toEqual({ missingInXA: [], extraInXA: [] })
  })

  it('actually transformed the values (proves the generator ran)', () => {
    // Every non-empty en string should differ from its en-XA counterpart.
    const sample = [...fe.entries()].filter(([, v]) => typeof v === 'string' && v.length > 0).slice(0, 200)
    for (const [k, v] of sample) {
      expect(fx.get(k), `en-XA[${k}] should differ from en`).not.toBe(v)
    }
  })

  it('preserves {{interpolation}} placeholders', () => {
    for (const [k, v] of fe.entries()) {
      if (typeof v === 'string') {
        const placeholders = v.match(/\{\{[^}]*\}\}/g)
        if (placeholders) {
          const xv = String(fx.get(k))
          for (const p of placeholders) expect(xv, `en-XA[${k}] must keep ${p}`).toContain(p)
        }
      }
    }
  })
})
