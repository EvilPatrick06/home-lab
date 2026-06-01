import { describe, expect, it } from 'vitest'
import en from './locales/en.json'
import es from './locales/es.json'

// The check-keys gate only flattens en.json — a second locale missing keys would
// pass it silently. This proves the es translation stays key-complete + keeps
// every {{interpolation}} placeholder. (es is a real human translation, so its
// values legitimately differ from / sometimes match en — we do NOT assert
// difference, only key parity + placeholder preservation.)
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

describe('es locale parity', () => {
  const fe = flatten(en)
  const fs = flatten(es)

  it('has the IDENTICAL key set as en', () => {
    const eKeys = [...fe.keys()].sort()
    const sKeys = [...fs.keys()].sort()
    const missingInEs = eKeys.filter((k) => !fs.has(k))
    const extraInEs = sKeys.filter((k) => !fe.has(k))
    expect({ missingInEs, extraInEs }).toEqual({ missingInEs: [], extraInEs: [] })
  })

  it('preserves {{interpolation}} placeholders', () => {
    for (const [k, v] of fe.entries()) {
      if (typeof v === 'string') {
        const placeholders = v.match(/\{\{[^}]*\}\}/g)
        if (placeholders) {
          const sv = String(fs.get(k))
          for (const p of placeholders) expect(sv, `es[${k}] must keep ${p}`).toContain(p)
        }
      }
    }
  })
})
