import { describe, expect, it, vi } from 'vitest'

// Mock external dependencies that require Electron IPC or canvas APIs
vi.mock('../../../services/data-provider', () => ({
  load5eEquipment: vi.fn().mockResolvedValue({ weapons: [], armor: [], gear: [] })
}))

vi.mock('../../../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
}))

vi.mock('../../../../public/data/5e/equipment/currency-config.json', () => ({
  default: [
    {
      key: 'pp',
      label: 'PP',
      fullName: 'Platinum Pieces',
      ring: 'ring-platinum',
      bg: 'bg-platinum',
      text: 'text-platinum'
    },
    {
      key: 'gp',
      label: 'GP',
      fullName: 'Gold Pieces',
      ring: 'ring-yellow-500',
      bg: 'bg-yellow-500',
      text: 'text-yellow-600'
    },
    {
      key: 'sp',
      label: 'SP',
      fullName: 'Silver Pieces',
      ring: 'ring-gray-300',
      bg: 'bg-gray-300',
      text: 'text-gray-600'
    },
    {
      key: 'cp',
      label: 'CP',
      fullName: 'Copper Pieces',
      ring: 'ring-orange-400',
      bg: 'bg-orange-400',
      text: 'text-orange-700'
    }
  ]
}))

import type { ArmorData, EquipmentDatabase, GearData, WeaponData } from './gear-tab-types'
import { CURRENCY_CONFIG, lookupItem } from './gear-tab-types'

describe('CURRENCY_CONFIG', () => {
  it('is an array', () => {
    expect(Array.isArray(CURRENCY_CONFIG)).toBe(true)
  })

  it('contains exactly 4 currency types', () => {
    expect(CURRENCY_CONFIG).toHaveLength(4)
  })

  it('has pp, gp, sp, cp keys', () => {
    const keys = CURRENCY_CONFIG.map((c) => c.key)
    expect(keys).toContain('pp')
    expect(keys).toContain('gp')
    expect(keys).toContain('sp')
    expect(keys).toContain('cp')
  })

  it('each entry has required fields', () => {
    for (const entry of CURRENCY_CONFIG) {
      expect(entry).toHaveProperty('key')
      expect(entry).toHaveProperty('label')
      expect(entry).toHaveProperty('fullName')
      expect(entry).toHaveProperty('ring')
      expect(entry).toHaveProperty('bg')
      expect(entry).toHaveProperty('text')
    }
  })
})

describe('WeaponData interface', () => {
  it('satisfies required fields', () => {
    const weapon: WeaponData = {
      name: 'Longsword',
      category: 'Martial Melee',
      damage: '1d8',
      damageType: 'slashing'
    }
    expect(weapon.name).toBe('Longsword')
    expect(weapon.category).toBe('Martial Melee')
    expect(weapon.damage).toBe('1d8')
    expect(weapon.damageType).toBe('slashing')
  })

  it('accepts optional fields', () => {
    const weapon: WeaponData = {
      name: 'Dagger',
      category: 'Simple Melee',
      damage: '1d4',
      damageType: 'piercing',
      weight: 1,
      properties: ['Finesse', 'Light', 'Thrown'],
      cost: '2 gp',
      description: 'A small blade.'
    }
    expect(weapon.properties).toHaveLength(3)
    expect(weapon.cost).toBe('2 gp')
  })
})

describe('ArmorData interface', () => {
  it('satisfies required fields', () => {
    const armor: ArmorData = {
      name: 'Chain Mail',
      category: 'Heavy'
    }
    expect(armor.name).toBe('Chain Mail')
    expect(armor.category).toBe('Heavy')
  })

  it('accepts optional fields', () => {
    const armor: ArmorData = {
      name: 'Leather Armor',
      category: 'Light',
      baseAC: 11,
      dexBonus: true,
      dexBonusMax: null,
      weight: 10,
      stealthDisadvantage: false,
      cost: '10 gp',
      description: 'Light protection.',
      strengthRequirement: 0
    }
    expect(armor.baseAC).toBe(11)
    expect(armor.dexBonus).toBe(true)
    expect(armor.dexBonusMax).toBeNull()
  })
})

describe('GearData interface', () => {
  it('satisfies required fields', () => {
    const gear: GearData = {
      name: 'Torch',
      description: 'Burns for 1 hour.'
    }
    expect(gear.name).toBe('Torch')
    expect(gear.description).toBe('Burns for 1 hour.')
  })

  it('accepts optional fields', () => {
    const gear: GearData = {
      name: 'Rope',
      category: 'Adventuring Gear',
      weight: 10,
      cost: '1 gp',
      description: '50 feet of hempen rope.'
    }
    expect(gear.category).toBe('Adventuring Gear')
    expect(gear.weight).toBe(10)
  })
})

describe('lookupItem', () => {
  const makeDb = (): EquipmentDatabase => ({
    weapons: [
      { name: 'Longsword', category: 'Martial Melee', damage: '1d8', damageType: 'slashing' },
      { name: 'Handaxe', category: 'Simple Melee', damage: '1d6', damageType: 'slashing' }
    ],
    armor: [{ name: 'Leather Armor', category: 'Light', baseAC: 11, dexBonus: true }],
    gear: [
      { name: 'Torch', description: 'Provides light.' },
      { name: 'Rope, Hempen (50 feet)', description: 'Sturdy rope.' }
    ]
  })

  it('returns null when db is null', () => {
    expect(lookupItem(null, 'Longsword')).toBeNull()
  })

  it('returns null when item is not found', () => {
    expect(lookupItem(makeDb(), 'Wand of Fireballs')).toBeNull()
  })

  it('finds a weapon by exact name (case-insensitive)', () => {
    const result = lookupItem(makeDb(), 'longsword')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('weapon')
    expect(result!.data.name).toBe('Longsword')
  })

  it('finds armor by exact name (case-insensitive)', () => {
    const result = lookupItem(makeDb(), 'leather armor')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('armor')
  })

  it('finds gear by exact name (case-insensitive)', () => {
    const result = lookupItem(makeDb(), 'torch')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('gear')
  })

  it('finds items via fuzzy (partial) match', () => {
    const result = lookupItem(makeDb(), 'Rope')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('gear')
  })

  it('prefers exact match over fuzzy match', () => {
    const result = lookupItem(makeDb(), 'Handaxe')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('weapon')
    if (result!.type === 'weapon') {
      expect(result!.data.name).toBe('Handaxe')
    }
  })
})
