import { useEffect, useState } from 'react'
import { load5eTreasureTables } from '../../../../services/data-provider'
import { rollMultiple, rollSingle } from '../../../../services/dice/dice-service'
import { logger } from '../../../../utils/logger'
import type {
  CoinResult,
  CrTier,
  HoardDetail,
  MagicItemRarity,
  MagicItemTableEntry,
  TreasureHoardEntry,
  TreasureIndividualEntry,
  TreasureResult,
  TreasureTableData,
  TreasureType
} from './treasure-generator-utils'

interface TreasureGeneratorModalProps {
  onClose: () => void
  onBroadcastResult: (message: string) => void
}

function rollDice(notation: string): number {
  const match = notation.match(/^(\d+)?d(\d+)(?:\s*[x*]\s*(\d+))?(?:\s*\+\s*(\d+))?$/)
  if (!match) {
    const num = parseInt(notation, 10)
    return Number.isNaN(num) ? 0 : num
  }
  const count = parseInt(match[1] ?? '1', 10)
  const sides = parseInt(match[2], 10)
  const multiplier = match[3] ? parseInt(match[3], 10) : 1
  const bonus = match[4] ? parseInt(match[4], 10) : 0
  const rolls = rollMultiple(count, sides)
  const total = rolls.reduce((s, r) => s + r, 0)
  return total * multiplier + bonus
}

function rollD100(): number {
  return rollSingle(100)
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

const FALLBACK_GEMS = [
  'Azurite (10 gp)',
  'Blue quartz (10 gp)',
  'Agate (10 gp)',
  'Turquoise (10 gp)',
  'Bloodstone (50 gp)',
  'Carnelian (50 gp)',
  'Jasper (50 gp)',
  'Moonstone (50 gp)',
  'Amber (100 gp)',
  'Amethyst (100 gp)',
  'Garnet (100 gp)',
  'Jade (100 gp)',
  'Pearl (100 gp)',
  'Black pearl (500 gp)',
  'Diamond (500 gp)',
  'Emerald (1,000 gp)',
  'Ruby (1,000 gp)',
  'Star ruby (1,000 gp)',
  'Black opal (1,000 gp)',
  'Blue sapphire (5,000 gp)',
  'Diamond (5,000 gp)',
  'Jacinth (5,000 gp)'
]

const FALLBACK_ART = [
  'Silver ewer (25 gp)',
  'Carved bone statuette (25 gp)',
  'Gold bracelet (25 gp)',
  'Silk robe with gold embroidery (250 gp)',
  'Jeweled gold crown (250 gp)',
  'Fine gold chain with fire opal (2,500 gp)',
  'Old masterpiece painting (2,500 gp)',
  'Gold music box (2,500 gp)',
  'Jeweled platinum ring (7,500 gp)',
  'Gold idol (7,500 gp)'
]

const FALLBACK_MAGIC: Record<string, string[]> = {
  A: [
    'Potion of Healing',
    'Spell Scroll (Cantrip)',
    'Potion of Climbing',
    'Spell Scroll (1st level)',
    'Bag of Holding',
    'Driftglobe'
  ],
  B: [
    'Potion of Greater Healing',
    'Spell Scroll (2nd level)',
    'Adamantine Armor',
    'Bag of Tricks',
    'Cloak of Protection',
    'Gauntlets of Ogre Power',
    'Hat of Disguise',
    'Javelin of Lightning',
    'Pearl of Power',
    'Sword of Wounding'
  ],
  C: [
    'Potion of Superior Healing',
    'Spell Scroll (4th level)',
    'Amulet of Health',
    'Armor of Resistance',
    'Belt of Giant Strength (Hill)',
    'Boots of Speed',
    'Bracers of Defense',
    'Cloak of Displacement',
    'Flame Tongue',
    'Ring of Spell Storing'
  ],
  D: [
    'Potion of Supreme Healing',
    'Spell Scroll (6th level)',
    'Animated Shield',
    'Belt of Giant Strength (Fire)',
    'Cloak of Arachnida',
    'Dancing Sword',
    'Ring of Regeneration',
    'Rod of Alertness',
    'Staff of Fire',
    'Vorpal Sword'
  ]
}

function generateIndividual(tier: CrTier, tables: TreasureTableData | null): TreasureResult {
  const coins: CoinResult = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }

  const entry: TreasureIndividualEntry | undefined = tables?.individual?.find((e) => e.crRange === tier)
  if (entry) {
    const amount = rollDice(entry.amount)
    if (entry.unit === 'pp') {
      coins.pp = amount
    } else {
      coins.gp = amount
    }
  } else {
    // DMG 2024 fallback
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

function rollMagicItemRarity(tables: TreasureTableData | null): string {
  const roll = rollD100()
  const entry: MagicItemRarity | undefined = tables?.magicItemRarities?.find(
    (r) => roll >= r.d100Min && roll <= r.d100Max
  )
  return entry?.rarity ?? 'Common'
}

/**
 * Roll on a specific lettered magic item table (A-E) from DMG 2024.
 * Falls back to the generic rarity-based system if the table isn't available.
 */
function rollOnMagicItemTable(tableKey: string, tables: TreasureTableData | null): string {
  const table = tables?.magicItemTables?.[tableKey]
  if (!table || table.length === 0) {
    // Fallback to the old FALLBACK_MAGIC tables
    const fallback = FALLBACK_MAGIC[tableKey]
    if (fallback && fallback.length > 0) {
      return pickRandom(fallback)
    }
    return `${rollMagicItemRarity(tables)} Magic Item`
  }
  const roll = rollD100()
  const entry: MagicItemTableEntry | undefined = table.find((e) => roll >= e.d100Min && roll <= e.d100Max)
  return entry?.itemName ?? `${rollMagicItemRarity(tables)} Magic Item`
}

function generateHoard(tier: CrTier, tables: TreasureTableData | null): TreasureResult {
  const coins: CoinResult = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }
  const gems: string[] = []
  const artObjects: string[] = []
  const magicItems: string[] = []

  // DMG 2024 simplified hoard coins
  const entry: TreasureHoardEntry | undefined = tables?.hoard?.find((e) => e.crRange === tier)
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

  // Use hoardDetails for the correct gem/art/magic table per tier
  const details: HoardDetail | undefined = tables?.hoardDetails?.[tier]
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

  // DMG 2024: roll on lettered magic item tables for specific item names
  const magicDice =
    entry?.magicItems ?? (tier === '0-4' ? '1d4-1' : tier === '5-10' ? '1d3' : tier === '11-16' ? '1d4' : '1d6')
  let magicCount = rollDice(magicDice)
  if (magicCount < 0) magicCount = 0
  for (let i = 0; i < magicCount; i++) {
    magicItems.push(rollOnMagicItemTable(magicTableKey, tables))
  }

  return { coins, gems, artObjects, magicItems }
}

export default function TreasureGeneratorModal({
  onClose,
  onBroadcastResult
}: TreasureGeneratorModalProps): JSX.Element {
  const [crTier, setCrTier] = useState<CrTier>('0-4')
  const [type, setType] = useState<TreasureType>('individual')
  const [result, setResult] = useState<TreasureResult | null>(null)
  const [treasureData, setTreasureData] = useState<TreasureTableData | null>(null)

  useEffect(() => {
    load5eTreasureTables()
      .then((data) => setTreasureData(data as unknown as TreasureTableData))
      .catch((e) => logger.warn('[TreasureGenerator] Failed to load treasure tables', e))
  }, [])

  const handleGenerate = (): void => {
    if (type === 'individual') {
      setResult(generateIndividual(crTier, treasureData))
    } else {
      setResult(generateHoard(crTier, treasureData))
    }
  }

  const handleAward = (): void => {
    if (!result) return
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

    onBroadcastResult(`Treasure awarded! ${parts.join(' | ')}`)
  }

  const tiers: CrTier[] = ['0-4', '5-10', '11-16', '17+']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <h2 className="text-lg font-bold text-amber-400">Treasure Generator</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl leading-none px-1"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* CR Tier Selector */}
          <div>
            <label className="block text-xs text-gray-400 mb-2">Challenge Rating Tier</label>
            <div className="flex gap-2">
              {tiers.map((tier) => (
                <button
                  key={tier}
                  onClick={() => setCrTier(tier)}
                  className={`flex-1 px-3 py-1.5 text-sm rounded border ${
                    crTier === tier
                      ? 'bg-amber-600 border-amber-500 text-white'
                      : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  CR {tier}
                </button>
              ))}
            </div>
          </div>

          {/* Type Toggle */}
          <div>
            <label className="block text-xs text-gray-400 mb-2">Treasure Type</label>
            <div className="flex gap-2">
              <button
                onClick={() => setType('individual')}
                className={`flex-1 px-3 py-1.5 text-sm rounded border ${
                  type === 'individual'
                    ? 'bg-amber-600 border-amber-500 text-white'
                    : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'
                }`}
              >
                Individual
              </button>
              <button
                onClick={() => setType('hoard')}
                className={`flex-1 px-3 py-1.5 text-sm rounded border ${
                  type === 'hoard'
                    ? 'bg-amber-600 border-amber-500 text-white'
                    : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'
                }`}
              >
                Hoard
              </button>
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded font-medium"
          >
            Generate Treasure
          </button>

          {/* Results */}
          {result && (
            <div className="space-y-3">
              {/* Coins */}
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-3">
                <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">Coins</h3>
                <div className="flex flex-wrap gap-3 text-sm">
                  {result.coins.cp > 0 && (
                    <span className="text-amber-700">
                      {result.coins.cp.toLocaleString()} <span className="text-xs text-gray-500">CP</span>
                    </span>
                  )}
                  {result.coins.sp > 0 && (
                    <span className="text-gray-300">
                      {result.coins.sp.toLocaleString()} <span className="text-xs text-gray-500">SP</span>
                    </span>
                  )}
                  {result.coins.ep > 0 && (
                    <span className="text-blue-300">
                      {result.coins.ep.toLocaleString()} <span className="text-xs text-gray-500">EP</span>
                    </span>
                  )}
                  {result.coins.gp > 0 && (
                    <span className="text-amber-400 font-semibold">
                      {result.coins.gp.toLocaleString()} <span className="text-xs text-gray-500">GP</span>
                    </span>
                  )}
                  {result.coins.pp > 0 && (
                    <span className="text-purple-300">
                      {result.coins.pp.toLocaleString()} <span className="text-xs text-gray-500">PP</span>
                    </span>
                  )}
                  {result.coins.cp === 0 &&
                    result.coins.sp === 0 &&
                    result.coins.ep === 0 &&
                    result.coins.gp === 0 &&
                    result.coins.pp === 0 && <span className="text-gray-500 italic">None</span>}
                </div>
              </div>

              {/* Gems */}
              {result.gems.length > 0 && (
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-3">
                  <h3 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider mb-2">
                    Gems ({result.gems.length})
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {result.gems.map((gem, i) => (
                      <span key={i} className="px-2 py-0.5 bg-gray-700 rounded text-xs text-cyan-300">
                        {gem}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Art Objects */}
              {result.artObjects.length > 0 && (
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-3">
                  <h3 className="text-xs font-semibold text-pink-400 uppercase tracking-wider mb-2">
                    Art Objects ({result.artObjects.length})
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {result.artObjects.map((art, i) => (
                      <span key={i} className="px-2 py-0.5 bg-gray-700 rounded text-xs text-pink-300">
                        {art}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Magic Items */}
              {result.magicItems.length > 0 && (
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-3">
                  <h3 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2">
                    Magic Items ({result.magicItems.length})
                  </h3>
                  <div className="space-y-1">
                    {result.magicItems.map((item, i) => (
                      <div key={i} className="text-sm text-purple-300">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-700">
          <button onClick={onClose} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded">
            Close
          </button>
          {result && (
            <button
              onClick={handleAward}
              className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded font-medium"
            >
              Award to Party
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
