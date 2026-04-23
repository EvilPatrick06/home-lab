import { describe, expect, it } from 'vitest'
import type { ArmorData, GearData, MagicItemData, WeaponData } from '../../../../types/data'
import {
  applyMarkup,
  armorToImportable,
  formatPrice,
  gearToImportable,
  importableToShopItem,
  magicItemToImportable,
  normalizeRarity,
  PRESETS,
  parseCostString,
  RARITY_COLORS,
  RARITY_OPTIONS,
  SHOP_CATEGORIES,
  weaponToImportable
} from './shop-utils'

// ─── parseCostString ──────────────────────────────────────────

describe('parseCostString', () => {
  it('parses a simple gp value', () => {
    expect(parseCostString('15 gp')).toEqual({ gp: 15 })
  })

  it('parses a simple sp value', () => {
    expect(parseCostString('2 sp')).toEqual({ sp: 2 })
  })

  it('parses a cp value', () => {
    expect(parseCostString('50 cp')).toEqual({ cp: 50 })
  })

  it('parses a pp value', () => {
    expect(parseCostString('1 pp')).toEqual({ pp: 1 })
  })

  it('parses multiple currencies in one string', () => {
    expect(parseCostString('1 gp, 5 sp')).toEqual({ gp: 1, sp: 5 })
  })

  it('handles comma-separated multi-currency strings', () => {
    // parseCostString splits on comma to handle "5 gp, 3 sp" style
    expect(parseCostString('100 gp, 50 sp, 10 cp')).toEqual({ gp: 100, sp: 50, cp: 10 })
  })

  it('returns an empty object for unrecognised strings', () => {
    expect(parseCostString('priceless')).toEqual({})
  })

  it('returns an empty object for empty string', () => {
    expect(parseCostString('')).toEqual({})
  })

  it('is case-insensitive for currency codes (lowercased internally)', () => {
    // parseCostString calls .toLowerCase() first, so 'GP' becomes 'gp'
    expect(parseCostString('10 GP')).toEqual({ gp: 10 })
  })
})

// ─── applyMarkup ─────────────────────────────────────────────

describe('applyMarkup', () => {
  it('doubles a price with markup 2', () => {
    expect(applyMarkup({ gp: 10 }, 2)).toEqual({ gp: 20 })
  })

  it('halves a price with markup 0.5', () => {
    expect(applyMarkup({ gp: 10 }, 0.5)).toEqual({ gp: 5 })
  })

  it('applies markup to all currency types', () => {
    const result = applyMarkup({ cp: 100, sp: 10, gp: 5, pp: 1 }, 2)
    expect(result).toEqual({ cp: 200, sp: 20, gp: 10, pp: 2 })
  })

  it('rounds to 2 decimal places', () => {
    const result = applyMarkup({ gp: 3 }, 1.5)
    expect(result.gp).toBe(4.5)
  })

  it('returns empty object for empty price', () => {
    expect(applyMarkup({}, 2)).toEqual({})
  })

  it('identity markup (1) leaves price unchanged', () => {
    expect(applyMarkup({ gp: 25 }, 1)).toEqual({ gp: 25 })
  })
})

// ─── formatPrice ─────────────────────────────────────────────

describe('formatPrice', () => {
  it('formats gp', () => {
    expect(formatPrice({ gp: 10 })).toBe('10 gp')
  })

  it('formats multiple currencies in pp > gp > sp > cp order', () => {
    expect(formatPrice({ cp: 5, sp: 3, gp: 2, pp: 1 })).toBe('1 pp, 2 gp, 3 sp, 5 cp')
  })

  it('returns "Free" for empty price object', () => {
    expect(formatPrice({})).toBe('Free')
  })

  it('omits zero-value currencies', () => {
    expect(formatPrice({ gp: 0, sp: 5 })).toBe('5 sp')
  })
})

// ─── normalizeRarity ─────────────────────────────────────────

describe('normalizeRarity', () => {
  it('normalizes "common"', () => {
    expect(normalizeRarity('common')).toBe('common')
  })

  it('normalizes "uncommon"', () => {
    expect(normalizeRarity('uncommon')).toBe('uncommon')
  })

  it('normalizes "rare"', () => {
    expect(normalizeRarity('rare')).toBe('rare')
  })

  it('normalizes "very-rare" (hyphenated)', () => {
    expect(normalizeRarity('very-rare')).toBe('very rare')
  })

  it('normalizes "very rare" (spaced)', () => {
    expect(normalizeRarity('very rare')).toBe('very rare')
  })

  it('normalizes "legendary"', () => {
    expect(normalizeRarity('legendary')).toBe('legendary')
  })

  it('normalizes "artifact"', () => {
    expect(normalizeRarity('artifact')).toBe('artifact')
  })

  it('defaults unknown rarities to "common"', () => {
    expect(normalizeRarity('godlike')).toBe('common')
  })
})

// ─── SHOP_CATEGORIES & RARITY_OPTIONS constants ───────────────

describe('SHOP_CATEGORIES', () => {
  it('contains expected categories', () => {
    expect(SHOP_CATEGORIES).toContain('weapon')
    expect(SHOP_CATEGORIES).toContain('armor')
    expect(SHOP_CATEGORIES).toContain('potion')
    expect(SHOP_CATEGORIES).toContain('adventuring')
  })
})

describe('RARITY_OPTIONS', () => {
  it('contains all 6 standard rarities', () => {
    expect(RARITY_OPTIONS).toHaveLength(6)
    expect(RARITY_OPTIONS).toContain('common')
    expect(RARITY_OPTIONS).toContain('legendary')
    expect(RARITY_OPTIONS).toContain('artifact')
  })
})

describe('RARITY_COLORS', () => {
  it('has a Tailwind color class for each rarity', () => {
    for (const rarity of RARITY_OPTIONS) {
      expect(RARITY_COLORS[rarity]).toBeDefined()
      expect(typeof RARITY_COLORS[rarity]).toBe('string')
    }
  })
})

// ─── PRESETS ──────────────────────────────────────────────────

describe('PRESETS', () => {
  it('contains expected preset keys', () => {
    expect(Object.keys(PRESETS)).toContain('general')
    expect(Object.keys(PRESETS)).toContain('blacksmith')
    expect(Object.keys(PRESETS)).toContain('alchemist')
    expect(Object.keys(PRESETS)).toContain('magic')
    expect(Object.keys(PRESETS)).toContain('blackmarket')
  })

  it('each preset has a label', () => {
    for (const preset of Object.values(PRESETS)) {
      expect(typeof preset.label).toBe('string')
      expect(preset.label.length).toBeGreaterThan(0)
    }
  })

  it('blacksmith preset has weapon entries', () => {
    expect(PRESETS.blacksmith.weaponNames.length).toBeGreaterThan(0)
  })
})

// ─── Converter functions ──────────────────────────────────────

describe('weaponToImportable', () => {
  const weapon: WeaponData = {
    name: 'Longsword',
    cost: '15 gp',
    weight: 3,
    category: 'Martial Melee',
    damage: '1d8',
    damageType: 'slashing',
    properties: ['Versatile']
  } as WeaponData

  it('returns shopCategory "weapon"', () => {
    expect(weaponToImportable(weapon).shopCategory).toBe('weapon')
  })

  it('includes the weapon name', () => {
    expect(weaponToImportable(weapon).name).toBe('Longsword')
  })

  it('parses the cost string', () => {
    expect(weaponToImportable(weapon).price).toEqual({ gp: 15 })
  })

  it('includes damage info in description', () => {
    const desc = weaponToImportable(weapon).description
    expect(desc).toContain('1d8')
    expect(desc).toContain('slashing')
  })
})

describe('armorToImportable', () => {
  const armor: ArmorData = {
    name: 'Chain Mail',
    cost: '75 gp',
    weight: 55,
    category: 'Heavy',
    baseAC: 16,
    dexBonus: false,
    dexBonusMax: null,
    stealthDisadvantage: true
  } as ArmorData

  it('returns shopCategory "armor"', () => {
    expect(armorToImportable(armor).shopCategory).toBe('armor')
  })

  it('includes AC in description', () => {
    expect(armorToImportable(armor).description).toContain('16')
  })

  it('includes Stealth Disadvantage in description when applicable', () => {
    expect(armorToImportable(armor).description).toContain('Stealth Disadvantage')
  })
})

describe('gearToImportable', () => {
  const gear: GearData = {
    name: 'Rope, Hempen (50 ft)',
    cost: '1 gp',
    weight: 10,
    category: 'Adventuring Gear',
    description: 'Useful for climbing and tying things.'
  } as GearData

  it('returns shopCategory "adventuring"', () => {
    expect(gearToImportable(gear).shopCategory).toBe('adventuring')
  })

  it('includes the gear description', () => {
    expect(gearToImportable(gear).description).toBe('Useful for climbing and tying things.')
  })
})

describe('magicItemToImportable', () => {
  const item: MagicItemData = {
    id: 'bag-of-holding',
    name: 'Bag of Holding',
    cost: '500 gp',
    type: 'wondrous',
    rarity: 'uncommon',
    description: 'A bag with extradimensional space inside.'
  } as MagicItemData

  it('uses the item id directly', () => {
    expect(magicItemToImportable(item).id).toBe('bag-of-holding')
  })

  it('normalizes rarity correctly', () => {
    expect(magicItemToImportable(item).rarity).toBe('uncommon')
  })

  it('maps wondrous type to wondrous shopCategory', () => {
    expect(magicItemToImportable(item).shopCategory).toBe('wondrous')
  })

  it('truncates long descriptions to 200 chars + "..."', () => {
    const longDesc = 'A'.repeat(250)
    const longItem: MagicItemData = { ...item, description: longDesc }
    const result = magicItemToImportable(longItem)
    expect(result.description.length).toBe(203) // 200 + '...'
    expect(result.description.endsWith('...')).toBe(true)
  })

  it('does not append "..." for short descriptions', () => {
    const shortItem: MagicItemData = { ...item, description: 'Short description.' }
    expect(magicItemToImportable(shortItem).description).toBe('Short description.')
  })
})

describe('importableToShopItem', () => {
  const importable = {
    id: 'longsword',
    name: 'Longsword',
    price: { gp: 15 },
    weight: 3,
    category: 'Martial Melee',
    shopCategory: 'weapon' as const,
    description: 'A versatile blade.'
  }

  it('creates a shop item with a unique id', () => {
    const item1 = importableToShopItem(importable, 5)
    const item2 = importableToShopItem(importable, 5)
    expect(item1.id).not.toBe(item2.id)
  })

  it('sets the quantity correctly', () => {
    const item = importableToShopItem(importable, 12)
    expect(item.quantity).toBe(12)
  })

  it('copies all importable fields', () => {
    const item = importableToShopItem(importable, 3)
    expect(item.name).toBe('Longsword')
    expect(item.price).toEqual({ gp: 15 })
    expect(item.weight).toBe(3)
    expect(item.shopCategory).toBe('weapon')
  })
})
