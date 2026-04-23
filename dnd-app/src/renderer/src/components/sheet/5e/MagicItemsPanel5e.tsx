import { useState } from 'react'
import { useCharacterEditor } from '../../../hooks/use-character-editor'
import { load5eMagicItems } from '../../../services/data-provider'
import type { Character5e } from '../../../types/character-5e'
import type { MagicItemRarity5e } from '../../../types/character-common'
import { logger } from '../../../utils/logger'
import AttunementTracker5e from './AttunementTracker5e'
import MagicItemCard5e from './MagicItemCard5e'

interface MagicItemsPanelProps {
  character: Character5e
  readonly?: boolean
}

export default function MagicItemsPanel5e({ character, readonly }: MagicItemsPanelProps): JSX.Element {
  const { getLatest, saveAndBroadcast } = useCharacterEditor(character.id)
  const [showMagicItemPicker, setShowMagicItemPicker] = useState(false)
  const [magicItemSearch, setMagicItemSearch] = useState('')
  const [magicItemRarityFilter, setMagicItemRarityFilter] = useState<string>('all')
  const [magicItems, setMagicItems] = useState<
    { id: string; name: string; rarity: MagicItemRarity5e; type: string; attunement: boolean; description: string }[]
  >([])
  const [showManualMagicItem, setShowManualMagicItem] = useState(false)
  const [manualMagicItem, setManualMagicItem] = useState<{
    name: string
    rarity: MagicItemRarity5e
    attunement: boolean
    description: string
  }>({ name: '', rarity: 'common', attunement: false, description: '' })
  const [giveUnidentified, setGiveUnidentified] = useState(false)
  const [buyWarning, setBuyWarning] = useState<string | null>(null)

  const getLatestTyped = (): Character5e | undefined => {
    const latest = getLatest()
    if (!latest || latest.gameSystem !== 'dnd5e') return undefined
    return latest as Character5e
  }

  const saveTyped = (updated: Character5e): void => {
    saveAndBroadcast(updated)
  }

  return (
    <>
      <AttunementTracker5e
        character={character}
        readonly={readonly}
        getLatest={getLatestTyped}
        saveAndBroadcast={saveTyped}
      />

      {/* Magic Items */}
      {((character.magicItems && character.magicItems.length > 0) || !readonly) && (
        <div className="mb-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            Magic Items
            {character.magicItems?.some((mi) => mi.attunement) && (
              <span className="ml-2 text-purple-400 normal-case">
                Attuned: {(character.magicItems ?? []).filter((mi) => mi.attuned).length}/3
              </span>
            )}
          </div>
          {buyWarning && <div className="text-xs text-red-400 mb-1">{buyWarning}</div>}
          {character.magicItems && character.magicItems.length > 0 ? (
            <div className="space-y-1">
              {character.magicItems.map((item, i) => (
                <MagicItemCard5e
                  key={item.id || i}
                  item={item}
                  index={i}
                  character={character}
                  readonly={readonly}
                  getLatest={getLatestTyped}
                  saveAndBroadcast={saveTyped}
                  setBuyWarning={setBuyWarning}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No magic items.</p>
          )}
          {!readonly && (
            <div className="mt-2">
              {showMagicItemPicker ? (
                <div className="bg-gray-800/50 rounded p-3 space-y-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-purple-400 font-medium">
                      {showManualMagicItem ? 'Manual Entry' : 'Magic Item Browser'}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowManualMagicItem(!showManualMagicItem)}
                        className="text-[10px] text-gray-400 hover:text-gray-300 cursor-pointer underline"
                      >
                        {showManualMagicItem ? 'Browse SRD' : 'Manual Entry'}
                      </button>
                      <button
                        onClick={() => {
                          setShowMagicItemPicker(false)
                          setShowManualMagicItem(false)
                          setMagicItemSearch('')
                          setMagicItemRarityFilter('all')
                          setManualMagicItem({ name: '', rarity: 'common', attunement: false, description: '' })
                        }}
                        className="text-[10px] text-gray-500 hover:text-gray-300 cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                  </div>

                  {showManualMagicItem ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Item name"
                        value={manualMagicItem.name}
                        onChange={(e) => setManualMagicItem((f) => ({ ...f, name: e.target.value }))}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-purple-500"
                      />
                      <div className="flex gap-2">
                        <select
                          value={manualMagicItem.rarity}
                          onChange={(e) =>
                            setManualMagicItem((f) => ({ ...f, rarity: e.target.value as typeof f.rarity }))
                          }
                          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-purple-500"
                        >
                          <option value="common">Common</option>
                          <option value="uncommon">Uncommon</option>
                          <option value="rare">Rare</option>
                          <option value="very-rare">Very Rare</option>
                          <option value="legendary">Legendary</option>
                          <option value="artifact">Artifact</option>
                        </select>
                        <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={manualMagicItem.attunement}
                            onChange={(e) => setManualMagicItem((f) => ({ ...f, attunement: e.target.checked }))}
                            className="rounded"
                          />
                          Attunement
                        </label>
                        <label className="flex items-center gap-1 text-xs text-yellow-500 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={giveUnidentified}
                            onChange={(e) => setGiveUnidentified(e.target.checked)}
                            className="rounded"
                          />
                          Unidentified
                        </label>
                      </div>
                      <input
                        type="text"
                        placeholder="Description (optional)"
                        value={manualMagicItem.description}
                        onChange={(e) => setManualMagicItem((f) => ({ ...f, description: e.target.value }))}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-purple-500"
                      />
                      <div className="flex justify-end">
                        <button
                          onClick={() => {
                            if (!manualMagicItem.name.trim()) return
                            const latest = getLatestTyped()
                            if (!latest) return
                            const newItem = {
                              id: crypto.randomUUID(),
                              name: manualMagicItem.name.trim(),
                              rarity: manualMagicItem.rarity,
                              type: 'wondrous',
                              attunement: manualMagicItem.attunement,
                              description: manualMagicItem.description.trim(),
                              ...(giveUnidentified ? { identified: false as const } : {})
                            }
                            const updated = {
                              ...latest,
                              magicItems: [...(latest.magicItems ?? []), newItem],
                              updatedAt: new Date().toISOString()
                            } as Character5e
                            saveTyped(updated)
                            setManualMagicItem({ name: '', rarity: 'common', attunement: false, description: '' })
                          }}
                          disabled={!manualMagicItem.name.trim()}
                          className="px-3 py-1 text-xs bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded text-white cursor-pointer"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Search magic items..."
                          value={magicItemSearch}
                          onChange={(e) => setMagicItemSearch(e.target.value)}
                          className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-purple-500"
                        />
                        <select
                          value={magicItemRarityFilter}
                          onChange={(e) => setMagicItemRarityFilter(e.target.value)}
                          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-purple-500"
                        >
                          <option value="all">All Rarities</option>
                          <option value="common">Common</option>
                          <option value="uncommon">Uncommon</option>
                          <option value="rare">Rare</option>
                          <option value="very-rare">Very Rare</option>
                          <option value="legendary">Legendary</option>
                          <option value="artifact">Artifact</option>
                        </select>
                        <label className="flex items-center gap-1 text-xs text-yellow-500 cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={giveUnidentified}
                            onChange={(e) => setGiveUnidentified(e.target.checked)}
                            className="rounded"
                          />
                          Unidentified
                        </label>
                      </div>
                      <div className="max-h-48 overflow-y-auto space-y-0.5">
                        {magicItems
                          .filter(
                            (item) =>
                              !magicItemSearch || item.name.toLowerCase().includes(magicItemSearch.toLowerCase())
                          )
                          .filter((item) => magicItemRarityFilter === 'all' || item.rarity === magicItemRarityFilter)
                          .slice(0, 50)
                          .map((item) => {
                            const rarityColor: Record<string, string> = {
                              common: 'text-gray-400',
                              uncommon: 'text-green-400',
                              rare: 'text-blue-400',
                              'very-rare': 'text-purple-400',
                              legendary: 'text-orange-400',
                              artifact: 'text-red-400'
                            }
                            return (
                              <button
                                key={item.id}
                                onClick={() => {
                                  const latest = getLatestTyped()
                                  if (!latest) return
                                  const newItem = {
                                    id: crypto.randomUUID(),
                                    name: item.name,
                                    rarity: item.rarity,
                                    type: item.type || 'wondrous',
                                    attunement: item.attunement,
                                    description: item.description || '',
                                    ...(giveUnidentified ? { identified: false as const } : {})
                                  }
                                  const updated = {
                                    ...latest,
                                    magicItems: [...(latest.magicItems ?? []), newItem],
                                    updatedAt: new Date().toISOString()
                                  } as Character5e
                                  saveTyped(updated)
                                }}
                                className="w-full flex items-center justify-between text-xs py-1 px-2 hover:bg-gray-800/50 rounded text-left cursor-pointer"
                              >
                                <span className={`font-medium ${rarityColor[item.rarity] ?? 'text-gray-300'}`}>
                                  {item.name}
                                </span>
                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                  {item.attunement && <span className="text-[9px] text-purple-500">Attune</span>}
                                  <span className="text-[10px] text-gray-600 capitalize">
                                    {item.rarity.replace('-', ' ')}
                                  </span>
                                </div>
                              </button>
                            )
                          })}
                        {magicItems.length === 0 && (
                          <p className="text-xs text-gray-500 text-center py-2">Loading magic items...</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => {
                    setShowMagicItemPicker(true)
                    if (magicItems.length === 0) {
                      load5eMagicItems()
                        .then((items) => setMagicItems(items))
                        .catch((e) => logger.warn('[MagicItems] Failed to load magic items', e))
                    }
                  }}
                  className="text-xs text-purple-400 hover:text-purple-300 cursor-pointer"
                >
                  + Add Magic Item
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
