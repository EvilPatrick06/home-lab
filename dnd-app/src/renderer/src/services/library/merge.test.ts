import { describe, expect, it } from 'vitest'
import { deepMergeObjects } from './merge'

describe('deepMergeObjects', () => {
  it('returns base when overrides is undefined', () => {
    const base = { a: 1, b: 'x' }
    expect(deepMergeObjects(base, undefined)).toEqual(base)
  })

  it('returns a copy, not the original reference', () => {
    const base = { a: 1 }
    const out = deepMergeObjects(base, {})
    expect(out).not.toBe(base)
    expect(out).toEqual({ a: 1 })
  })

  it('flat replace — primitive override replaces base value', () => {
    expect(deepMergeObjects({ name: 'Wand of Magic Missiles' }, { name: 'Pew Pew' })).toEqual({ name: 'Pew Pew' })
  })

  it('nested object merge — keys merge key-by-key', () => {
    const base = { meta: { a: 1, b: 2 }, name: 'x' }
    const overrides = { meta: { b: 99 } }
    expect(deepMergeObjects(base, overrides)).toEqual({ meta: { a: 1, b: 99 }, name: 'x' })
  })

  it('two-level deep merge', () => {
    const base = { a: { b: { c: 1, d: 2 } } }
    const overrides = { a: { b: { d: 99 } } }
    expect(deepMergeObjects(base, overrides)).toEqual({ a: { b: { c: 1, d: 99 } } })
  })

  it('array atomic replace — entire array is overridden', () => {
    const base = { actions: [1, 2, 3] }
    const overrides = { actions: [9] }
    expect(deepMergeObjects(base, overrides)).toEqual({ actions: [9] })
  })

  it('array replace at depth — nested arrays still replace atomically', () => {
    const base = { stats: { skills: ['perception', 'stealth'] } }
    const overrides = { stats: { skills: ['arcana'] } }
    expect(deepMergeObjects(base, overrides)).toEqual({ stats: { skills: ['arcana'] } })
  })

  it('undefined skip — undefined override does not erase base value', () => {
    const base = { a: 1, b: 2 }
    const overrides = { a: undefined as unknown as number, b: 99 }
    expect(deepMergeObjects(base, overrides)).toEqual({ a: 1, b: 99 })
  })

  it('empty override is identity', () => {
    const base = { a: 1, b: { c: 2 } }
    expect(deepMergeObjects(base, {})).toEqual(base)
  })

  it('override adds a new key not present in base', () => {
    expect(deepMergeObjects<Record<string, unknown>>({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 })
  })

  it('non-plain-object override (Date, Map) replaces atomically', () => {
    const date = new Date('2026-05-19')
    expect(deepMergeObjects({ when: 'unknown' as unknown as Date }, { when: date })).toEqual({ when: date })
  })

  it('null override replaces base value', () => {
    expect(deepMergeObjects({ pluginId: 'plugin-a' }, { pluginId: null })).toEqual({ pluginId: null })
  })
})
