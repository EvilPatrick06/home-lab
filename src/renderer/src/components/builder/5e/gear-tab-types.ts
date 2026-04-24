import currencyConfigJson from '@data/5e/equipment/currency-config.json'
import { useEffect, useState } from 'react'
import { load5eCurrencyConfig, load5eEquipment } from '../../../services/data-provider'
import { logger } from '../../../utils/logger'

export const CURRENCY_CONFIG = currencyConfigJson as Array<{
  key: 'pp' | 'gp' | 'sp' | 'cp'
  label: string
  fullName: string
  ring: string
  bg: string
  text: string
}>

/** Load currency config from the data store (includes plugin currencies). */
export async function loadCurrencyConfigData(): Promise<unknown> {
  return load5eCurrencyConfig()
}

// Equipment data types from equipment.json
export interface WeaponData {
  name: string
  category: string
  damage: string
  damageType: string
  weight?: number
  properties?: string[]
  cost?: string
  description?: string
}

export interface ArmorData {
  name: string
  category: string
  baseAC?: number
  dexBonus?: boolean
  dexBonusMax?: number | null
  weight?: number
  stealthDisadvantage?: boolean
  cost?: string
  description?: string
  strengthRequirement?: number
}

export interface GearData {
  name: string
  category?: string
  weight?: number
  cost?: string
  description: string
}

export interface EquipmentDatabase {
  weapons: WeaponData[]
  armor: ArmorData[]
  gear: GearData[]
}

export function useEquipmentDatabase(): EquipmentDatabase | null {
  const [db, setDb] = useState<EquipmentDatabase | null>(null)
  useEffect(() => {
    load5eEquipment()
      .then((data) => setDb(data as unknown as EquipmentDatabase))
      .catch((err) => logger.error('Failed to load equipment data:', err))
  }, [])
  return db
}

export function lookupItem(
  db: EquipmentDatabase | null,
  name: string
): { type: 'weapon'; data: WeaponData } | { type: 'armor'; data: ArmorData } | { type: 'gear'; data: GearData } | null {
  if (!db) return null
  const lowerName = name.toLowerCase()

  const weapon = db.weapons.find((w) => w.name.toLowerCase() === lowerName)
  if (weapon) return { type: 'weapon', data: weapon }

  const armor = db.armor.find((a) => a.name.toLowerCase() === lowerName)
  if (armor) return { type: 'armor', data: armor }

  const gear = db.gear.find((g) => g.name.toLowerCase() === lowerName)
  if (gear) return { type: 'gear', data: gear }

  // Fuzzy match
  for (const w of db.weapons) {
    if (lowerName.includes(w.name.toLowerCase()) || w.name.toLowerCase().includes(lowerName)) {
      return { type: 'weapon', data: w }
    }
  }
  for (const a of db.armor) {
    if (lowerName.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(lowerName)) {
      return { type: 'armor', data: a }
    }
  }
  for (const g of db.gear) {
    if (lowerName.includes(g.name.toLowerCase()) || g.name.toLowerCase().includes(lowerName)) {
      return { type: 'gear', data: g }
    }
  }

  return null
}
