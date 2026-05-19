import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getAllCategories } from '../../../types/library'
import { BaseLibraryEntrySchema } from './base'
import { SCHEMA_REGISTRY, safeValidateEntry, validateEntry } from './registry'

describe('SCHEMA_REGISTRY', () => {
  it('has a schema for every LibraryCategory in the enum', () => {
    const expected = getAllCategories().map((c) => c.id)
    for (const cat of expected) {
      expect(SCHEMA_REGISTRY[cat], `missing schema for category "${cat}"`).toBeDefined()
    }
  })

  it('schema count matches category count exactly', () => {
    const categoryCount = getAllCategories().length
    expect(Object.keys(SCHEMA_REGISTRY).length).toBe(categoryCount)
  })
})

describe('BaseLibraryEntrySchema', () => {
  it('accepts a minimal entry with id + name', () => {
    const result = BaseLibraryEntrySchema.safeParse({ id: 'a', name: 'A' })
    expect(result.success).toBe(true)
  })

  it('rejects an entry missing id', () => {
    const result = BaseLibraryEntrySchema.safeParse({ name: 'A' })
    expect(result.success).toBe(false)
  })

  it('rejects an entry missing name', () => {
    const result = BaseLibraryEntrySchema.safeParse({ id: 'a' })
    expect(result.success).toBe(false)
  })

  it('accepts optional audit fields', () => {
    const result = BaseLibraryEntrySchema.safeParse({
      id: 'a',
      name: 'A',
      createdAt: '2026-05-19',
      updatedAt: '2026-05-19',
      pluginId: 'plugin-a',
      source: 'official'
    })
    expect(result.success).toBe(true)
  })
})

describe('validateEntry / safeValidateEntry', () => {
  it('validateEntry returns parsed data on success', () => {
    const out = validateEntry('spells', { id: 'fireball', name: 'Fireball', level: 3 })
    expect(out.id).toBe('fireball')
    expect(out.name).toBe('Fireball')
  })

  it('validateEntry throws on invalid input', () => {
    expect(() => validateEntry('spells', { name: 'No ID' })).toThrow()
  })

  it('safeValidateEntry returns success:true on valid', () => {
    const out = safeValidateEntry('weapons', { id: 'shortsword', name: 'Shortsword', damage: '1d6' })
    expect(out.success).toBe(true)
    if (out.success) expect(out.data.id).toBe('shortsword')
  })

  it('safeValidateEntry returns success:false on invalid', () => {
    const out = safeValidateEntry('weapons', { description: 'missing id+name' })
    expect(out.success).toBe(false)
  })

  it('passthrough preserves unknown fields on the parsed result', () => {
    const out = validateEntry('feats', {
      id: 'great-weapon-master',
      name: 'Great Weapon Master',
      customField: 'kept'
    })
    expect((out as Record<string, unknown>).customField).toBe('kept')
  })
})

describe('snapshot against public/data/5e/spells/spells.json', () => {
  it('every spell entry validates against SpellsSchema', () => {
    const path = resolve(__dirname, '../../../../public/data/5e/spells/spells.json')
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Array<Record<string, unknown>>
    expect(Array.isArray(raw)).toBe(true)
    expect(raw.length).toBeGreaterThan(0)
    for (const entry of raw) {
      const result = safeValidateEntry('spells', entry)
      if (!result.success) {
        throw new Error(`spell "${entry.id ?? entry.name ?? '?'}" failed validation: ${result.error.message}`)
      }
    }
  })
})
