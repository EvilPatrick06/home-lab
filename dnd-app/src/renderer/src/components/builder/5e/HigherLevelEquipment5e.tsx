import { useCallback, useMemo, useState } from 'react'
import {
  getHigherLevelEquipment,
  type HigherLevelEquipment,
  rollStartingGold
} from '../../../data/starting-equipment-table'
import { useT } from '../../../i18n'
import type { TranslationKeys } from '../../../i18n/types'
import { load5eMagicItems } from '../../../services/data-provider'
import { useLibraryCategory } from '../../../services/library/use-library-entry'
import { useBuilderStore } from '../../../stores/use-builder-store'
import type { MagicItemRarity5e } from '../../../types/character-common'
import type { MagicItemData } from '../../../types/data'
import SectionBanner from '../shared/SectionBanner'

const RARITY_COLORS: Record<string, string> = {
  common: 'text-gray-300 border-gray-500',
  uncommon: 'text-green-400 border-green-600',
  rare: 'text-blue-400 border-blue-600',
  'very-rare': 'text-purple-400 border-purple-600',
  legendary: 'text-orange-400 border-orange-600'
}

const RARITY_LABEL_KEYS: Record<string, TranslationKeys> = {
  common: 'builder.higherLevelEquipment.rarity.common',
  uncommon: 'builder.higherLevelEquipment.rarity.uncommon',
  rare: 'builder.higherLevelEquipment.rarity.rare',
  'very-rare': 'builder.higherLevelEquipment.rarity.veryRare',
  legendary: 'builder.higherLevelEquipment.rarity.legendary'
}

function MagicItemSlot({
  rarity,
  slotIndex,
  selectedItem,
  onSelect,
  onClear
}: {
  rarity: MagicItemRarity5e
  slotIndex: number
  selectedItem: { itemId: string; itemName: string } | null
  onSelect: (item: MagicItemData) => void
  onClear: () => void
}): JSX.Element {
  const { t } = useT()
  const [expanded, setExpanded] = useState(false)
  const [search, setSearch] = useState('')
  const rarityLabel = RARITY_LABEL_KEYS[rarity] ? t(RARITY_LABEL_KEYS[rarity]) : rarity

  // Phase 15b Step 1 — magic items live in the truth store; filter by rarity at render time.
  const allItems = useLibraryCategory('magic-items', () => load5eMagicItems()) as unknown as MagicItemData[]
  const items = useMemo(() => allItems.filter((i) => i.rarity === rarity), [allItems, rarity])

  const filtered = useMemo(() => {
    if (!search) return items
    const q = search.toLowerCase()
    return items.filter((i) => i.name.toLowerCase().includes(q) || i.type.toLowerCase().includes(q))
  }, [items, search])

  const colors = RARITY_COLORS[rarity] ?? 'text-muted border-gray-600'

  if (selectedItem) {
    return (
      <div
        className={`flex items-center justify-between border rounded px-2 py-1.5 ${colors}`}
        title={t('builder.higherLevelEquipment.rarityTitle', { rarity: rarityLabel })}
        aria-label={t('builder.higherLevelEquipment.rarityTitle', { rarity: rarityLabel })}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{selectedItem.itemName}</span>
          <span className="text-xs text-gray-500">{rarityLabel}</span>
        </div>
        <button onClick={onClear} className="text-xs text-gray-500 hover:text-red-400 px-1 cursor-pointer">
          {t('builder.higherLevelEquipment.change')}
        </button>
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className={`text-xs border rounded px-2 py-1 cursor-pointer transition-colors ${colors} hover:bg-surface-2`}
        title={t('builder.higherLevelEquipment.rarityTitle', { rarity: rarityLabel })}
      >
        {expanded
          ? t('builder.higherLevelEquipment.hideItems', { rarity: rarityLabel })
          : t('builder.higherLevelEquipment.selectItem', { rarity: rarityLabel, slot: slotIndex + 1 })}
      </button>
      {expanded && (
        <div className="mt-1 border border-border rounded bg-surface/80 overflow-hidden">
          <div className="px-2 py-1.5 border-b border-gray-800">
            <input
              aria-label={t('builder.higherLevelEquipment.searchPlaceholder', { rarity: rarityLabel })}
              type="text"
              name="magic-item-search"
              placeholder={t('builder.higherLevelEquipment.searchPlaceholder', { rarity: rarityLabel })}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs bg-surface-2 border border-border rounded px-2 py-1 text-gray-200 placeholder:text-gray-500 outline-none focus:border-amber-500/50"
            />
          </div>
          <div className="max-h-40 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-500 italic px-2 py-2 text-center">
                {items.length === 0 ? t('common.states.loading') : t('builder.higherLevelEquipment.noItemsMatch')}
              </p>
            ) : (
              filtered.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelect(item)
                    setExpanded(false)
                    setSearch('')
                  }}
                  className="w-full text-left flex items-center justify-between px-2 py-1 hover:bg-surface-2 border-b border-gray-800/50 last:border-0 cursor-pointer"
                >
                  <div>
                    <span className="text-sm text-gray-200">{item.name}</span>
                    {item.attunement && (
                      <span className="text-xs text-purple-400 ms-1">
                        {t('builder.higherLevelEquipment.attunement')}
                      </span>
                    )}
                    <div className="text-xs text-gray-500">
                      {item.type} - {item.cost}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function HigherLevelEquipment5e(): JSX.Element | null {
  const { t } = useT()
  const targetLevel = useBuilderStore((s) => s.targetLevel)
  const higherLevelGoldBonus = useBuilderStore((s) => s.higherLevelGoldBonus)
  const setHigherLevelGoldBonus = useBuilderStore((s) => s.setHigherLevelGoldBonus)
  const selectedMagicItems = useBuilderStore((s) => s.selectedMagicItems)
  const setSelectedMagicItems = useBuilderStore((s) => s.setSelectedMagicItems)
  const currency = useBuilderStore((s) => s.currency)
  const setCurrency = useBuilderStore((s) => s.setCurrency)

  const hlEquip: HigherLevelEquipment | null = getHigherLevelEquipment(targetLevel)

  const handleRollGold = useCallback((): void => {
    const rolled = rollStartingGold(targetLevel)
    // Remove previous bonus and add new one
    const currentGp = currency.gp - higherLevelGoldBonus + rolled
    setCurrency({ ...currency, gp: Math.max(0, currentGp) })
    setHigherLevelGoldBonus(rolled)
  }, [targetLevel, currency, higherLevelGoldBonus, setCurrency, setHigherLevelGoldBonus])

  const handleTakeAverage = useCallback((): void => {
    const avg = hlEquip ? hlEquip.baseGold + (hlEquip.diceCount > 0 ? Math.ceil(5.5 * hlEquip.diceMultiplier) : 0) : 0
    const currentGp = currency.gp - higherLevelGoldBonus + avg
    setCurrency({ ...currency, gp: Math.max(0, currentGp) })
    setHigherLevelGoldBonus(avg)
  }, [hlEquip, currency, higherLevelGoldBonus, setCurrency, setHigherLevelGoldBonus])

  if (!hlEquip) return null

  // Build magic item slots from the grants table
  const magicSlots: Array<{ rarity: MagicItemRarity5e; index: number }> = []
  for (const [rarity, count] of Object.entries(hlEquip.magicItems)) {
    for (let i = 0; i < (count ?? 0); i++) {
      magicSlots.push({ rarity: rarity as MagicItemRarity5e, index: magicSlots.length })
    }
  }

  const handleSelectMagicItem = (slotIdx: number, rarity: string, item: MagicItemData): void => {
    const updated = [...selectedMagicItems]
    // Replace or add at slotIdx
    const existingIdx = updated.findIndex((_, i) => i === slotIdx)
    if (existingIdx >= 0) {
      updated[existingIdx] = { slotRarity: rarity, itemId: item.id, itemName: item.name }
    } else {
      // Pad with empty entries if needed
      while (updated.length <= slotIdx) {
        updated.push({ slotRarity: '', itemId: '', itemName: '' })
      }
      updated[slotIdx] = { slotRarity: rarity, itemId: item.id, itemName: item.name }
    }
    setSelectedMagicItems(updated)
  }

  const handleClearMagicItem = (slotIdx: number): void => {
    const updated = [...selectedMagicItems]
    if (slotIdx < updated.length) {
      updated[slotIdx] = { slotRarity: '', itemId: '', itemName: '' }
    }
    setSelectedMagicItems(updated)
  }

  return (
    <>
      <SectionBanner label={t('builder.higherLevelEquipment.sectionTitle')} />
      <div className="px-4 py-3 border-b border-gray-800 space-y-3">
        <p className="text-xs text-gray-500">{t('builder.higherLevelEquipment.levelIntro', { level: targetLevel })}</p>

        {/* Bonus Gold */}
        <div>
          <div className="text-xs text-muted uppercase tracking-wide mb-1">
            {t('builder.higherLevelEquipment.bonusGoldLabel')}
          </div>
          {hlEquip.diceCount > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-300">
                {t('builder.higherLevelEquipment.goldFormula', {
                  base: hlEquip.baseGold,
                  dice: hlEquip.diceCount,
                  multiplier: hlEquip.diceMultiplier
                })}
              </span>
              <button
                onClick={handleRollGold}
                className="text-xs px-2 py-0.5 rounded bg-amber-600 hover:bg-accent-strong text-gray-900 font-semibold cursor-pointer"
              >
                {t('builder.higherLevelEquipment.roll')}
              </button>
              <button
                onClick={handleTakeAverage}
                className="text-xs px-2 py-0.5 rounded border border-gray-600 text-muted hover:text-gray-200 cursor-pointer"
              >
                {t('builder.higherLevelEquipment.average')}
              </button>
              {higherLevelGoldBonus > 0 && (
                <span className="text-sm text-accent font-bold">
                  {t('builder.higherLevelEquipment.goldBonus', { gold: higherLevelGoldBonus })}
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-300">{t('builder.higherLevelEquipment.noBonusGold')}</span>
              {hlEquip.baseGold > 0 && (
                <span className="text-sm text-accent font-bold">
                  {t('builder.higherLevelEquipment.goldBonus', { gold: hlEquip.baseGold })}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Magic Item Slots */}
        {magicSlots.length > 0 && (
          <div>
            <div className="text-xs text-muted uppercase tracking-wide mb-1">
              {t('builder.higherLevelEquipment.magicItemsLabel')}
            </div>
            <div className="space-y-1.5">
              {magicSlots.map((slot, idx) => {
                const selected = selectedMagicItems[idx]
                const hasSelection = selected?.itemId ? { itemId: selected.itemId, itemName: selected.itemName } : null
                return (
                  <MagicItemSlot
                    key={`${slot.rarity}-${idx}`}
                    rarity={slot.rarity}
                    slotIndex={idx}
                    selectedItem={hasSelection}
                    onSelect={(item) => handleSelectMagicItem(idx, slot.rarity, item)}
                    onClear={() => handleClearMagicItem(idx)}
                  />
                )
              })}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
