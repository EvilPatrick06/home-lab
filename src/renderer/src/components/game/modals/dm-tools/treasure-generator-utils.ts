export type CrTier = '0-4' | '5-10' | '11-16' | '17+'
export type TreasureType = 'individual' | 'hoard'

export interface TreasureResult {
  coins: { cp: number; sp: number; ep: number; gp: number; pp: number }
  gems: string[]
  artObjects: string[]
  magicItems: string[]
}

export interface TreasureIndividualEntry {
  crRange: string
  amount: string
  unit: string
  average: number
}

export interface TreasureHoardEntry {
  crRange: string
  coins: string
  coinsUnit: string
  coinsAverage: number
  magicItems: string
}

export interface MagicItemRarity {
  d100Min: number
  d100Max: number
  rarity: string
}

export interface MagicItemTableEntry {
  d100Min: number
  d100Max: number
  itemName: string
}

export interface HoardDetail {
  gemTier: string
  artTier: string
  magicTable: string
}

export interface TreasureTableData {
  individual: TreasureIndividualEntry[]
  hoard: TreasureHoardEntry[]
  magicItemRarities: MagicItemRarity[]
  gems: Record<string, string[]>
  art: Record<string, string[]>
  magicItemTables?: Record<string, MagicItemTableEntry[]>
  hoardDetails?: Record<string, HoardDetail>
}

export type CoinResult = TreasureResult['coins']

export function rollDice(notation: string): number {
  const match = notation.match(/^(\d+)?d(\d+)(?:\s*[x*]\s*(\d+))?(?:\s*\+\s*(\d+))?$/)
  if (!match) {
    const num = parseInt(notation, 10)
    return Number.isNaN(num) ? 0 : num
  }
  const count = parseInt(match[1] ?? '1', 10)
  const sides = parseInt(match[2], 10)
  const multiplier = match[3] ? parseInt(match[3], 10) : 1
  const bonus = match[4] ? parseInt(match[4], 10) : 0
  const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1)
  const total = rolls.reduce((s, r) => s + r, 0)
  return total * multiplier + bonus
}

function rollD100(): number {
  return Math.floor(Math.random() * 100) + 1
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

const FALLBACK_GEMS: string[] = [
  // ... fallback gems
]

const FALLBACK_ART: string[] = [
  // ... fallback art objects
]

const FALLBACK_MAGIC: Record<string, string[]> = {
  // ... fallback magic items
}

function rollMagicItemRarity(tables: TreasureTableData | null): string {
  const roll = rollD100()
  const entry = tables?.magicItemRarities?.find((r: MagicItemRarity) => roll >= r.d100Min && roll <= r.d100Max)
  return entry?.rarity ?? 'Common'
}

function rollOnMagicItemTable(tableKey: string, tables: TreasureTableData | null): string {
  const table = tables?.magicItemTables?.[tableKey]
  if (!table || table.length === 0) {
    const fallback = FALLBACK_MAGIC[tableKey]
    if (fallback && fallback.length > 0) {
      return pickRandom(fallback)
    }
    return `${rollMagicItemRarity(tables)} Magic Item`
  }
  const roll = rollD100()
  const entry = table.find((e: MagicItemTableEntry) => roll >= e.d100Min && roll <= e.d100Max)
  return entry?.itemName ?? `${rollMagicItemRarity(tables)} Magic Item`
}

export function generateIndividual(tier: CrTier, tables: TreasureTableData | null): TreasureResult {
  const coins: TreasureResult['coins'] = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }

  const entry = tables?.individual?.find((e: TreasureIndividualEntry) => e.crRange === tier)
  if (entry) {
    const amount = rollDice(entry.amount)
    if (entry.unit === 'pp') {
      coins.pp = amount
    } else {
      coins.gp = amount
    }
  } else {
    switch (tier) {
      case '0-4':
        coins.gp = rollDice('3d6')
        break
      case '5-10':
        coins.gp = rollDice('2d8x10')
        break
      case '11-16':
        coins.pp = rollDice('2d10x10')
        break
      case '17+':
        coins.pp = rollDice('2d8x100')
        break
    }
  }

  return { coins, gems: [], artObjects: [], magicItems: [] }
}

export function generateHoard(tier: CrTier, tables: TreasureTableData | null): TreasureResult {
  const coins: TreasureResult['coins'] = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }
  const gems: string[] = []
  const artObjects: string[] = []
  const magicItems: string[] = []

  const entry = tables?.hoard?.find((e: TreasureHoardEntry) => e.crRange === tier)
  if (entry) {
    const amount = rollDice(entry.coins)
    coins.gp = amount
  } else {
    switch (tier) {
      case '0-4':
        coins.gp = rollDice('2d4x100')
        break
      case '5-10':
        coins.gp = rollDice('8d10x100')
        break
      case '11-16':
        coins.gp = rollDice('8d8x10000')
        break
      case '17+':
        coins.gp = rollDice('6d10x10000')
        break
    }
  }

  const details = tables?.hoardDetails?.[tier]
  const gemTier =
    details?.gemTier ?? (tier === '0-4' ? '50gp' : tier === '5-10' ? '100gp' : tier === '11-16' ? '500gp' : '1000gp')
  const artTier =
    details?.artTier ?? (tier === '0-4' ? '25gp' : tier === '5-10' ? '250gp' : tier === '11-16' ? '750gp' : '2500gp')
  const magicTableKey =
    details?.magicTable ?? (tier === '0-4' ? 'A' : tier === '5-10' ? 'B' : tier === '11-16' ? 'C' : 'D')

  const gemList = tables?.gems?.[gemTier] ?? FALLBACK_GEMS
  const artList = tables?.art?.[artTier] ?? FALLBACK_ART

  const gemCount = rollDice('1d4')
  for (let i = 0; i < gemCount; i++) gems.push(`${pickRandom(gemList)} (${gemTier})`)

  if (tier !== '0-4') {
    const artCount = rollDice('1d4')
    for (let i = 0; i < artCount; i++) artObjects.push(`${pickRandom(artList)} (${artTier})`)
  }

  const magicDice =
    entry?.magicItems ?? (tier === '0-4' ? '1d4-1' : tier === '5-10' ? '1d3' : tier === '11-16' ? '1d4' : '1d6')
  let magicCount = rollDice(magicDice)
  if (magicCount < 0) magicCount = 0
  for (let i = 0; i < magicCount; i++) {
    magicItems.push(rollOnMagicItemTable(magicTableKey, tables))
  }

  return { coins, gems, artObjects, magicItems }
}

export function formatTreasureResult(result: TreasureResult): string {
  const parts: string[] = []

  const coinParts: string[] = []
  if (result.coins.cp > 0) coinParts.push(`${result.coins.cp.toLocaleString()} cp`)
  if (result.coins.sp > 0) coinParts.push(`${result.coins.sp.toLocaleString()} sp`)
  if (result.coins.ep > 0) coinParts.push(`${result.coins.ep.toLocaleString()} ep`)
  if (result.coins.gp > 0) coinParts.push(`${result.coins.gp.toLocaleString()} gp`)
  if (result.coins.pp > 0) coinParts.push(`${result.coins.pp.toLocaleString()} pp`)
  if (coinParts.length > 0) parts.push(`Coins: ${coinParts.join(', ')}`)
  if (result.gems.length > 0) parts.push(`Gems: ${result.gems.join(', ')}`)
  if (result.artObjects.length > 0) parts.push(`Art: ${result.artObjects.join(', ')}`)
  if (result.magicItems.length > 0) parts.push(`Magic Items: ${result.magicItems.join(', ')}`)

  return `Treasure awarded! ${parts.join(' | ')}`
}
