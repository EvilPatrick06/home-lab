/**
 * DM Shop Utilities — D&D 5e 2024
 *
 * Price parsing, shop presets, and equipment-to-shop-item converters.
 * Extracted from DMShopModal for modularity.
 */

import type { ShopItem, ShopItemCategory, ShopItemRarity } from '../../../../network'
import type { ArmorData, GearData, MagicItemData, WeaponData } from '../../../../types/data'

// ─── Price utilities ───────────────────────────────────────────

export function parseCostString(cost: string): ShopItem['price'] {
  const price: ShopItem['price'] = {}
  const parts = cost.toLowerCase().split(',')
  for (const part of parts) {
    const trimmed = part.trim()
    const match = trimmed.match(/^([\d,.]+)\s*(cp|sp|gp|pp)$/)
    if (match) {
      const value = Number(match[1].replace(/,/g, ''))
      const unit = match[2] as 'cp' | 'sp' | 'gp' | 'pp'
      price[unit] = (price[unit] ?? 0) + value
    }
  }
  return price
}

export function applyMarkup(price: ShopItem['price'], markup: number): ShopItem['price'] {
  const result: ShopItem['price'] = {}
  if (price.pp) result.pp = Math.round(price.pp * markup * 100) / 100
  if (price.gp) result.gp = Math.round(price.gp * markup * 100) / 100
  if (price.sp) result.sp = Math.round(price.sp * markup * 100) / 100
  if (price.cp) result.cp = Math.round(price.cp * markup * 100) / 100
  return result
}

export function formatPrice(price: ShopItem['price']): string {
  const parts: string[] = []
  if (price.pp) parts.push(`${price.pp} pp`)
  if (price.gp) parts.push(`${price.gp} gp`)
  if (price.sp) parts.push(`${price.sp} sp`)
  if (price.cp) parts.push(`${price.cp} cp`)
  return parts.join(', ') || 'Free'
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

// ─── Constants ─────────────────────────────────────────────────

export const SHOP_CATEGORIES: ShopItemCategory[] = [
  'weapon',
  'armor',
  'potion',
  'scroll',
  'wondrous',
  'tool',
  'adventuring',
  'trade',
  'other'
]

export const RARITY_OPTIONS: ShopItemRarity[] = ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact']

export const RARITY_COLORS: Record<ShopItemRarity, string> = {
  common: 'text-gray-400',
  uncommon: 'text-green-400',
  rare: 'text-blue-400',
  'very rare': 'text-purple-400',
  legendary: 'text-amber-400',
  artifact: 'text-red-400'
}

// ─── Shop presets ──────────────────────────────────────────────

export interface PresetDef {
  label: string
  weaponNames: string[]
  armorNames: string[]
  gearNames: string[]
  magicItemNames: string[]
}

export const PRESETS: Record<string, PresetDef> = {
  general: {
    label: 'General Store',
    weaponNames: [],
    armorNames: [],
    gearNames: [
      'Backpack',
      'Bedroll',
      'Rope, Hempen (50 ft)',
      'Rations (1 day)',
      'Torch',
      'Waterskin',
      'Tinderbox',
      'Oil (flask)',
      'Crowbar',
      'Hammer',
      'Pitons (10)',
      'Lantern, Hooded'
    ],
    magicItemNames: []
  },
  blacksmith: {
    label: 'Blacksmith',
    weaponNames: [
      'Longsword',
      'Shortsword',
      'Greatsword',
      'Battleaxe',
      'Warhammer',
      'Mace',
      'Dagger',
      'Handaxe',
      'Spear',
      'Javelin',
      'Light crossbow'
    ],
    armorNames: ['Chain Mail', 'Chain Shirt', 'Scale Mail', 'Studded Leather', 'Leather', 'Shield'],
    gearNames: [],
    magicItemNames: []
  },
  alchemist: {
    label: 'Alchemist',
    weaponNames: [],
    armorNames: [],
    gearNames: [
      'Antitoxin (vial)',
      'Oil (flask)',
      'Acid (vial)',
      "Alchemist's Fire (flask)",
      'Holy Water (flask)',
      "Healer's Kit",
      'Herbalism Kit',
      'Vial',
      'Component Pouch'
    ],
    magicItemNames: ['Potion of Healing', 'Potion of Greater Healing', 'Potion of Climbing', 'Potion of Resistance']
  },
  magic: {
    label: 'Magic Shop',
    weaponNames: [],
    armorNames: [],
    gearNames: [
      'Arcane Focus (Crystal)',
      'Spellbook',
      'Component Pouch',
      'Ink (1-ounce bottle)',
      'Parchment (one sheet)'
    ],
    magicItemNames: [
      'Bag of Holding',
      'Cloak of Protection',
      'Boots of Elvenkind',
      'Cloak of Elvenkind',
      'Hat of Disguise',
      'Goggles of Night',
      'Driftglobe',
      'Immovable Rod',
      'Decanter of Endless Water',
      'Pearl of Power'
    ]
  },
  blackmarket: {
    label: 'Black Market',
    weaponNames: ['Dagger', 'Hand crossbow', 'Shortsword'],
    armorNames: [],
    gearNames: [
      "Thieves' Tools",
      'Caltrops (bag of 20)',
      "Burglar's Pack",
      'Disguise Kit',
      'Forgery Kit',
      "Poisoner's Kit"
    ],
    magicItemNames: [
      'Cloak of Elvenkind',
      'Boots of Elvenkind',
      'Dust of Disappearance',
      'Dust of Sneezing and Choking',
      'Hat of Disguise',
      'Ring of Mind Shielding'
    ]
  }
}

// ─── Equipment-to-shop-item converters ─────────────────────────

export interface ImportableItem {
  id: string
  name: string
  price: ShopItem['price']
  weight: number
  category: string
  shopCategory: ShopItemCategory
  description: string
  rarity?: ShopItemRarity
}

export function weaponToImportable(w: WeaponData): ImportableItem {
  return {
    id: slugify(w.name),
    name: w.name,
    price: parseCostString(w.cost),
    weight: w.weight,
    category: w.category,
    shopCategory: 'weapon',
    description: `${w.damage} ${w.damageType}${w.properties.length > 0 ? ` (${w.properties.join(', ')})` : ''}`
  }
}

export function armorToImportable(a: ArmorData): ImportableItem {
  return {
    id: slugify(a.name),
    name: a.name,
    price: parseCostString(a.cost),
    weight: a.weight,
    category: a.category,
    shopCategory: 'armor',
    description: `AC ${a.baseAC}${a.dexBonus ? ' + Dex' : ''}${a.dexBonusMax != null ? ` (max ${a.dexBonusMax})` : ''}${a.stealthDisadvantage ? ', Stealth Disadvantage' : ''}`
  }
}

export function gearToImportable(g: GearData): ImportableItem {
  return {
    id: slugify(g.name),
    name: g.name,
    price: parseCostString(g.cost),
    weight: g.weight,
    category: g.category,
    shopCategory: 'adventuring',
    description: g.description
  }
}

export function normalizeRarity(r: string): ShopItemRarity {
  const mapping: Record<string, ShopItemRarity> = {
    common: 'common',
    uncommon: 'uncommon',
    rare: 'rare',
    'very-rare': 'very rare',
    'very rare': 'very rare',
    legendary: 'legendary',
    artifact: 'artifact'
  }
  return mapping[r.toLowerCase()] ?? 'common'
}

export function magicItemToImportable(m: MagicItemData): ImportableItem {
  const typeMap: Record<string, ShopItemCategory> = {
    weapon: 'weapon',
    armor: 'armor',
    wondrous: 'wondrous',
    potion: 'potion',
    scroll: 'scroll',
    ring: 'wondrous',
    rod: 'wondrous',
    staff: 'wondrous',
    wand: 'wondrous'
  }
  return {
    id: m.id,
    name: m.name,
    price: parseCostString(m.cost),
    weight: 0,
    category: m.type,
    shopCategory: typeMap[m.type.toLowerCase()] ?? 'other',
    description: m.description.slice(0, 200) + (m.description.length > 200 ? '...' : ''),
    rarity: normalizeRarity(m.rarity)
  }
}

export function importableToShopItem(item: ImportableItem, quantity: number): ShopItem {
  return {
    id: `${item.id}-${crypto.randomUUID().slice(0, 8)}`,
    name: item.name,
    category: item.category,
    price: item.price,
    quantity,
    description: item.description,
    weight: item.weight,
    shopCategory: item.shopCategory,
    rarity: item.rarity
  }
}
