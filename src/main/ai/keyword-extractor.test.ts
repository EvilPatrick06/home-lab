import { describe, expect, it } from 'vitest'
import { extractKeywords, tokenize } from './keyword-extractor'

describe('extractKeywords', () => {
  it('extracts simple keywords from text', () => {
    const result = extractKeywords('fireball damage spell')
    expect(result).toContain('fireball')
    expect(result).toContain('damage')
    expect(result).toContain('spell')
  })

  it('removes stop words', () => {
    const result = extractKeywords('the dragon is in the cave')
    expect(result).not.toContain('the')
    expect(result).not.toContain('is')
    expect(result).not.toContain('in')
    expect(result).toContain('dragon')
    expect(result).toContain('cave')
  })

  it('preserves compound D&D terms', () => {
    const result = extractKeywords('I want to make a death saving throw')
    expect(result).toContain('death saving throw')
  })

  it('lowercases all keywords', () => {
    const result = extractKeywords('Fireball DAMAGE Spell')
    for (const kw of result) {
      expect(kw).toBe(kw.toLowerCase())
    }
  })

  it('deduplicates keywords', () => {
    const result = extractKeywords('fireball fireball fireball')
    const fireballCount = result.filter((k) => k === 'fireball').length
    expect(fireballCount).toBe(1)
  })

  it('filters out single-character words', () => {
    const result = extractKeywords('I a fireball')
    expect(result).not.toContain('a')
    expect(result).not.toContain('i')
    expect(result).toContain('fireball')
  })

  it('returns empty array for empty string', () => {
    expect(extractKeywords('')).toEqual([])
  })

  it('returns empty array for only stop words', () => {
    const result = extractKeywords('the is a an to of in for')
    expect(result).toEqual([])
  })

  it('handles compound term alongside single keywords', () => {
    const result = extractKeywords('critical hit with a sword')
    expect(result).toContain('critical hit')
    expect(result).toContain('sword')
  })

  it('handles special regex characters in text', () => {
    const result = extractKeywords('fireball (5d6) damage [fire]')
    expect(result).toContain('fireball')
    expect(result).toContain('damage')
    expect(result).toContain('fire')
  })
})

describe('tokenize', () => {
  it('splits text into lowercase tokens', () => {
    const result = tokenize('Hello World Test')
    expect(result).toContain('hello')
    expect(result).toContain('world')
    expect(result).toContain('test')
  })

  it('removes stop words', () => {
    const result = tokenize('the dragon is in the cave')
    expect(result).not.toContain('the')
    expect(result).not.toContain('is')
    expect(result).not.toContain('in')
    expect(result).toContain('dragon')
    expect(result).toContain('cave')
  })

  it('filters out single-character tokens', () => {
    const result = tokenize('a b c dragon')
    expect(result).toEqual(['dragon'])
  })

  it('returns empty array for empty string', () => {
    expect(tokenize('')).toEqual([])
  })

  it('splits on non-alphanumeric characters', () => {
    const result = tokenize('hello-world foo_bar baz!qux')
    expect(result).toContain('hello-world')
    expect(result).toContain('foo')
    expect(result).toContain('bar')
  })

  it('preserves apostrophes and hyphens in words', () => {
    const result = tokenize("don't half-orc")
    expect(result).toContain("don't")
    expect(result).toContain('half-orc')
  })
})
