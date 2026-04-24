import { beforeAll, describe, expect, it, vi } from 'vitest'

// Mock data-provider with realistic wearable item names
vi.mock('../services/data-provider', () => ({
  load5eWearableItems: vi.fn(() =>
    Promise.resolve([
      'Ring',
      'Amulet',
      'Cloak',
      'Boots',
      'Gloves',
      'Belt',
      'Helm',
      'Bracers',
      'Circlet',
      'Crown',
      'Robe',
      'Mantle',
      'Cape',
      'Gauntlets',
      'Headband'
    ])
  )
}))

import { isWearableItem, WEARABLE_ITEM_NAMES } from './wearable-items'

describe('wearable-items', () => {
  // Allow the fire-and-forget promise in the module to settle
  beforeAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
  })

  describe('WEARABLE_ITEM_NAMES', () => {
    it('exports WEARABLE_ITEM_NAMES as a Set', () => {
      expect(WEARABLE_ITEM_NAMES).toBeInstanceOf(Set)
    })

    it('contains wearable item category names', () => {
      expect(WEARABLE_ITEM_NAMES.size).toBeGreaterThan(0)
    })

    it('all entries are non-empty strings', () => {
      for (const name of WEARABLE_ITEM_NAMES) {
        expect(typeof name).toBe('string')
        expect(name.length).toBeGreaterThan(0)
      }
    })

    it('includes common wearable categories', () => {
      expect(WEARABLE_ITEM_NAMES.has('Ring')).toBe(true)
      expect(WEARABLE_ITEM_NAMES.has('Cloak')).toBe(true)
      expect(WEARABLE_ITEM_NAMES.has('Boots')).toBe(true)
    })
  })

  describe('isWearableItem', () => {
    it('returns true for a known wearable item (case-insensitive partial match)', () => {
      expect(isWearableItem('Ring of Protection')).toBe(true)
      expect(isWearableItem('Cloak of Elvenkind')).toBe(true)
      expect(isWearableItem('Boots of Speed')).toBe(true)
    })

    it('returns true for lowercase matches', () => {
      expect(isWearableItem('ring of protection')).toBe(true)
      expect(isWearableItem('cloak of elvenkind')).toBe(true)
    })

    it('returns true for uppercase matches', () => {
      expect(isWearableItem('RING OF PROTECTION')).toBe(true)
    })

    it('returns false for non-wearable items', () => {
      expect(isWearableItem('Longsword')).toBe(false)
      expect(isWearableItem('Potion of Healing')).toBe(false)
      expect(isWearableItem('Bag of Holding')).toBe(false)
    })

    it('returns false for empty string', () => {
      expect(isWearableItem('')).toBe(false)
    })

    it('detects wearable category as substring', () => {
      // "Bracers of Defense" contains "Bracers"
      expect(isWearableItem('Bracers of Defense')).toBe(true)
      // "Gauntlets of Ogre Power" contains "Gauntlets"
      expect(isWearableItem('Gauntlets of Ogre Power')).toBe(true)
    })
  })
})
