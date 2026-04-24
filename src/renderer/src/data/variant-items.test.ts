import { beforeAll, describe, expect, it, vi } from 'vitest'

// Mock data-provider with realistic variant item data
vi.mock('../services/data-provider', () => ({
  load5eVariantItems: vi.fn(() =>
    Promise.resolve({
      Longsword: {
        label: 'Longsword',
        variants: ['Longsword +1', 'Longsword +2', 'Longsword +3', 'Flame Tongue Longsword']
      },
      Shield: { label: 'Shield', variants: ['Shield +1', 'Shield +2', 'Shield +3', 'Sentinel Shield'] },
      Leather: { label: 'Leather Armor', variants: ['Leather Armor +1', 'Leather Armor +2'] }
    })
  )
}))

import { VARIANT_ITEMS } from './variant-items'

describe('variant-items', () => {
  // Allow the fire-and-forget promise in the module to settle
  beforeAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
  })

  it('exports VARIANT_ITEMS as a record object', () => {
    expect(VARIANT_ITEMS).toBeDefined()
    expect(typeof VARIANT_ITEMS).toBe('object')
  })

  it('has entries after async load', () => {
    expect(Object.keys(VARIANT_ITEMS).length).toBeGreaterThan(0)
  })

  it('VARIANT_ITEMS keys are strings', () => {
    for (const key of Object.keys(VARIANT_ITEMS)) {
      expect(typeof key).toBe('string')
    }
  })

  it('each entry has a label string and variants array', () => {
    for (const [, entry] of Object.entries(VARIANT_ITEMS)) {
      expect(typeof entry.label).toBe('string')
      expect(entry.label.length).toBeGreaterThan(0)
      expect(Array.isArray(entry.variants)).toBe(true)
      expect(entry.variants.length).toBeGreaterThan(0)
    }
  })

  it('variants are all non-empty strings', () => {
    for (const entry of Object.values(VARIANT_ITEMS)) {
      for (const variant of entry.variants) {
        expect(typeof variant).toBe('string')
        expect(variant.length).toBeGreaterThan(0)
      }
    }
  })

  it('contains Longsword variants including magic versions', () => {
    expect(VARIANT_ITEMS.Longsword).toBeDefined()
    expect(VARIANT_ITEMS.Longsword.variants).toContain('Longsword +1')
  })
})
