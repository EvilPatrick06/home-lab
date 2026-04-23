import { describe, expect, it } from 'vitest'
import { DND_COMPOUND_TERMS } from './dnd-terms'

describe('DND_COMPOUND_TERMS', () => {
  it('is an array of strings', () => {
    expect(Array.isArray(DND_COMPOUND_TERMS)).toBe(true)
    for (const term of DND_COMPOUND_TERMS) {
      expect(typeof term).toBe('string')
    }
  })

  it('is non-empty', () => {
    expect(DND_COMPOUND_TERMS.length).toBeGreaterThan(0)
  })

  it('contains well-known D&D compound terms', () => {
    const terms = DND_COMPOUND_TERMS
    expect(terms).toContain('death saving throw')
    expect(terms).toContain('ability score increase')
    expect(terms).toContain('critical hit')
    expect(terms).toContain('challenge rating')
    expect(terms).toContain('armor class bonus')
  })

  it('all terms are non-empty', () => {
    for (const term of DND_COMPOUND_TERMS) {
      expect(term.trim().length).toBeGreaterThan(0)
    }
  })

  it('all terms are lowercase', () => {
    for (const term of DND_COMPOUND_TERMS) {
      expect(term).toBe(term.toLowerCase())
    }
  })

  it('has no duplicates', () => {
    const unique = new Set(DND_COMPOUND_TERMS)
    expect(unique.size).toBe(DND_COMPOUND_TERMS.length)
  })
})
