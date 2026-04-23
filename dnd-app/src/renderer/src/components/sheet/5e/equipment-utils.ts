/**
 * Equipment Section Utilities — D&D 5e 2024
 *
 * Gear database hook, generic tool helpers, and CoinBadge component.
 * Extracted from EquipmentSection5e for modularity.
 */

import { useEquipmentData } from '../../../hooks/use-equipment-data'
import { load5eEquipment } from '../../../services/data-provider'

// ─── Gear database hook ────────────────────────────────────────

export interface GearItem {
  name: string
  cost?: string
  price?: string
  weight?: number
  bulk?: string | number
  description?: string
  category?: string
  contents?: Array<{ name: string; quantity: number }>
}

export function useGearDatabase(): GearItem[] {
  return useEquipmentData(() => load5eEquipment().then((d) => (d.gear as unknown as GearItem[]) ?? []), [])
}

export function getGearCost(item: GearItem): string {
  if (item.cost && typeof item.cost === 'string') return item.cost
  if (item.price && typeof item.price === 'string') return item.price
  return ''
}

export function getPackContents(
  itemName: string,
  gearDb: GearItem[]
): Array<{ name: string; quantity: number }> | null {
  const match = gearDb.find((g) => g.name.toLowerCase() === itemName.toLowerCase())
  if (match?.contents && match.contents.length > 0) {
    return match.contents
  }
  return null
}

// ─── Generic tool variant helpers ──────────────────────────────

export const GENERIC_TOOL_VARIANTS: Record<string, string[]> = {
  'gaming set': [
    'Gaming Set (Dice)',
    'Gaming Set (Dragonchess)',
    'Gaming Set (Playing Cards)',
    'Gaming Set (Three-Dragon Ante)'
  ],
  'musical instrument': ['Bagpipes', 'Drum', 'Dulcimer', 'Flute', 'Horn', 'Lute', 'Lyre', 'Pan Flute', 'Shawm', 'Viol']
}

export function isGenericTool(name: string): boolean {
  const lower = name.toLowerCase().replace(/\s*\(.*\)/, '')
  return Object.keys(GENERIC_TOOL_VARIANTS).some((k) => lower.includes(k))
}

export function getGenericToolBase(name: string): string | null {
  const lower = name.toLowerCase().replace(/\s*\(.*\)/, '')
  for (const key of Object.keys(GENERIC_TOOL_VARIANTS)) {
    if (lower.includes(key)) return key
  }
  return null
}
