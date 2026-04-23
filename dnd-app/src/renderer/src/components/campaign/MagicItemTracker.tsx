import { useMemo } from 'react'
import { useCharacterStore } from '../../stores/use-character-store'
import type { Campaign } from '../../types/campaign'
import type { Character5e } from '../../types/character-5e'
import type { MagicItemRarity5e } from '../../types/character-common'

// DMG 2024 recommended magic items by level tier (cumulative across levels 1-20)
// 19 Common, 28 Uncommon, 23 Rare, 19 Very Rare, 11 Legendary = 100 total
const DMG_RECOMMENDED_BY_TIER: Record<string, Record<MagicItemRarity5e, number>> = {
  '1-4': { common: 9, uncommon: 5, rare: 1, 'very-rare': 0, legendary: 0, artifact: 0 },
  '5-10': { common: 15, uncommon: 15, rare: 7, 'very-rare': 3, legendary: 1, artifact: 0 },
  '11-16': { common: 18, uncommon: 23, rare: 15, 'very-rare': 10, legendary: 5, artifact: 0 },
  '17-20': { common: 19, uncommon: 28, rare: 23, 'very-rare': 19, legendary: 11, artifact: 0 }
}

const RARITY_ORDER: MagicItemRarity5e[] = ['common', 'uncommon', 'rare', 'very-rare', 'legendary', 'artifact']

const RARITY_COLORS: Record<MagicItemRarity5e, string> = {
  common: 'text-gray-300 bg-gray-700/50',
  uncommon: 'text-green-400 bg-green-900/30',
  rare: 'text-blue-400 bg-blue-900/30',
  'very-rare': 'text-purple-400 bg-purple-900/30',
  legendary: 'text-orange-400 bg-orange-900/30',
  artifact: 'text-red-400 bg-red-900/30'
}

const RARITY_LABELS: Record<MagicItemRarity5e, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  'very-rare': 'Very Rare',
  legendary: 'Legendary',
  artifact: 'Artifact'
}

function getLevelTier(level: number): string {
  if (level <= 4) return '1-4'
  if (level <= 10) return '5-10'
  if (level <= 16) return '11-16'
  return '17-20'
}

interface MagicItemTrackerProps {
  campaign: Campaign
}

export default function MagicItemTracker({ campaign }: MagicItemTrackerProps): JSX.Element {
  const characters = useCharacterStore((s) => s.characters)

  const { itemsByRarity, totalItems, averageLevel, tier, characterItems } = useMemo(() => {
    const campaignChars = characters.filter(
      (c) => c.gameSystem === 'dnd5e' && campaign.players.some((p) => p.characterId === c.id)
    ) as Character5e[]

    const counts: Record<MagicItemRarity5e, number> = {
      common: 0,
      uncommon: 0,
      rare: 0,
      'very-rare': 0,
      legendary: 0,
      artifact: 0
    }

    const perChar: { name: string; items: { name: string; rarity: MagicItemRarity5e }[] }[] = []
    let total = 0
    let levelSum = 0

    for (const char of campaignChars) {
      levelSum += char.level
      const charItems: { name: string; rarity: MagicItemRarity5e }[] = []
      for (const item of char.magicItems ?? []) {
        const rarity = item.rarity as MagicItemRarity5e
        if (counts[rarity] !== undefined) counts[rarity]++
        total++
        charItems.push({ name: item.name, rarity })
      }
      if (charItems.length > 0) {
        perChar.push({ name: char.name, items: charItems })
      }
    }

    const avg = campaignChars.length > 0 ? Math.round(levelSum / campaignChars.length) : 1

    return {
      itemsByRarity: counts,
      totalItems: total,
      averageLevel: avg,
      tier: getLevelTier(avg),
      characterItems: perChar
    }
  }, [characters, campaign.players])

  const recommended = DMG_RECOMMENDED_BY_TIER[tier]
  const recommendedTotal = Object.values(recommended).reduce((a, b) => a + b, 0)

  const status =
    totalItems < recommendedTotal * 0.7 ? 'behind' : totalItems > recommendedTotal * 1.3 ? 'ahead' : 'on-track'

  const statusLabel: Record<string, { text: string; color: string }> = {
    behind: { text: 'Behind Curve', color: 'text-red-400 bg-red-900/30' },
    'on-track': { text: 'On Track', color: 'text-green-400 bg-green-900/30' },
    ahead: { text: 'Ahead of Curve', color: 'text-amber-400 bg-amber-900/30' }
  }

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-400">
          Avg Party Level: <span className="text-gray-200 font-medium">{averageLevel}</span>
          <span className="text-gray-600 mx-1.5">|</span>
          Tier: <span className="text-gray-200 font-medium">{tier}</span>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusLabel[status].color}`}>
          {statusLabel[status].text}
        </span>
      </div>

      {/* Rarity Breakdown */}
      <div className="space-y-1.5">
        {RARITY_ORDER.map((rarity) => {
          const actual = itemsByRarity[rarity]
          const expected = recommended[rarity]
          const pct = expected > 0 ? Math.min(100, (actual / expected) * 100) : actual > 0 ? 100 : 0

          return (
            <div key={rarity} className="flex items-center gap-2">
              <span className={`text-[10px] w-16 shrink-0 px-1.5 py-0.5 rounded text-center ${RARITY_COLORS[rarity]}`}>
                {RARITY_LABELS[rarity]}
              </span>
              <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    actual > expected ? 'bg-amber-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-400 w-12 text-right shrink-0">
                {actual}/{expected}
              </span>
            </div>
          )
        })}
      </div>

      {/* Total */}
      <div className="text-xs text-gray-500 text-center">
        Total: {totalItems} / {recommendedTotal} items (DMG recommended for tier {tier})
      </div>

      {/* Per-Character Breakdown */}
      {characterItems.length > 0 && (
        <div className="border-t border-gray-800 pt-2">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">By Character</div>
          <div className="space-y-1.5">
            {characterItems.map((char) => (
              <div key={char.name}>
                <div className="text-xs text-gray-300 font-medium">{char.name}</div>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {char.items.map((item, i) => (
                    <span
                      key={i}
                      className={`text-[9px] px-1.5 py-0.5 rounded ${RARITY_COLORS[item.rarity]}`}
                      title={RARITY_LABELS[item.rarity]}
                    >
                      {item.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
