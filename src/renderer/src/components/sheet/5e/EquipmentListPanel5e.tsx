import { useState } from 'react'
import { isWearableItem } from '../../../data/wearable-items'
import { useCharacterEditor } from '../../../hooks/use-character-editor'
import type { Character } from '../../../types/character'
import type { Character5e } from '../../../types/character-5e'
import type { ArmorEntry } from '../../../types/character-common'
import { addCurrency, computeSellPrice, deductWithConversion, parseCost } from '../../../utils/currency'
import {
  GENERIC_TOOL_VARIANTS,
  type GearItem,
  getGearCost,
  getGenericToolBase,
  getPackContents,
  isGenericTool,
  useGearDatabase
} from './equipment-utils'

interface EquipmentListPanel5eProps {
  character: Character5e
  readonly?: boolean
}

export default function EquipmentListPanel5e({ character, readonly }: EquipmentListPanel5eProps): JSX.Element {
  const { getLatest, saveAndBroadcast } = useCharacterEditor(character.id)
  const equipment = character.equipment
  const hasEquipment = equipment.length > 0
  const [expandedItem, setExpandedItem] = useState<number | null>(null)
  const [expandedPack, setExpandedPack] = useState<number | null>(null)

  const [showAddEquipment, setShowAddEquipment] = useState(false)
  const [equipmentForm, setEquipmentForm] = useState({ name: '', quantity: '1' })

  const [showGearShop, setShowGearShop] = useState(false)
  const [gearSearch, setGearSearch] = useState('')
  const [buyWarning, setBuyWarning] = useState<string | null>(null)

  const gearDatabase = useGearDatabase()

  const filteredGear = gearSearch
    ? gearDatabase.filter((g) => g.name.toLowerCase().includes(gearSearch.toLowerCase()))
    : gearDatabase

  const handleRemoveEquipment = (index: number): void => {
    const latest = getLatest()
    if (!latest) return
    const updated = {
      ...latest,
      equipment: latest.equipment.filter((_, i) => i !== index),
      updatedAt: new Date().toISOString()
    } as Character
    saveAndBroadcast(updated)
  }

  const handleSellEquipment = (index: number): void => {
    const latest = getLatest()
    if (!latest) return
    const item = latest.equipment[index]
    if (!item) return

    let costStr = (item as { cost?: string }).cost
    if (!costStr) {
      const dbItem = gearDatabase.find((g) => g.name.toLowerCase() === item.name.toLowerCase())
      if (dbItem) costStr = getGearCost(dbItem)
    }

    let updatedTreasure = latest.treasure
    if (costStr) {
      const sellPrice = computeSellPrice(costStr)
      if (sellPrice) {
        const currentCurrency = {
          pp: latest.treasure.pp,
          gp: latest.treasure.gp,
          sp: latest.treasure.sp,
          cp: latest.treasure.cp
        }
        updatedTreasure = { ...latest.treasure, ...addCurrency(currentCurrency, sellPrice) }
      }
    }

    const updated = {
      ...latest,
      equipment: latest.equipment.filter((_, i) => i !== index),
      treasure: updatedTreasure,
      updatedAt: new Date().toISOString()
    } as Character
    saveAndBroadcast(updated)
  }

  const handleOpenPack = (index: number): void => {
    const latest = getLatest()
    if (!latest) return
    const pack = latest.equipment[index]
    if (!pack) return

    const contents = getPackContents(pack.name, gearDatabase)
    if (!contents) return

    // Remove one pack (or decrement quantity)
    let currentEquipment: typeof latest.equipment
    if (pack.quantity > 1) {
      currentEquipment = latest.equipment.map((e, i) => (i === index ? { ...e, quantity: e.quantity - 1 } : e))
    } else {
      currentEquipment = latest.equipment.filter((_, i) => i !== index)
    }

    // Add each component, stacking with existing items
    for (const component of contents) {
      const existingIdx = currentEquipment.findIndex((e) => e.name.toLowerCase() === component.name.toLowerCase())
      if (existingIdx >= 0) {
        currentEquipment = currentEquipment.map((e, i) =>
          i === existingIdx ? { ...e, quantity: e.quantity + component.quantity } : e
        )
      } else {
        const dbItem = gearDatabase.find((g) => g.name.toLowerCase() === component.name.toLowerCase())
        currentEquipment = [
          ...currentEquipment,
          {
            name: component.name,
            quantity: component.quantity,
            description: dbItem?.description,
            cost: dbItem ? getGearCost(dbItem) : undefined
          }
        ]
      }
    }

    const updated = {
      ...latest,
      equipment: currentEquipment,
      updatedAt: new Date().toISOString()
    } as Character
    saveAndBroadcast(updated)
  }

  const handleAddEquipment = (): void => {
    const name = equipmentForm.name.trim()
    if (!name) return
    const latest = getLatest()
    if (!latest) return
    const qty = Math.max(1, parseInt(equipmentForm.quantity, 10) || 1)
    const newItem = { name, quantity: qty }
    const updated = {
      ...latest,
      equipment: [...latest.equipment, newItem],
      updatedAt: new Date().toISOString()
    } as Character
    saveAndBroadcast(updated)
    setEquipmentForm({ name: '', quantity: '1' })
    setShowAddEquipment(false)
  }

  const handleBuyGear = (item: GearItem): void => {
    const latest = getLatest()
    if (!latest) return

    const costStr = getGearCost(item)
    const cost = parseCost(costStr)

    let updatedTreasure = latest.treasure
    if (cost && cost.amount > 0) {
      const currentCurrency = {
        pp: latest.treasure.pp,
        gp: latest.treasure.gp,
        sp: latest.treasure.sp,
        cp: latest.treasure.cp
      }
      const result = deductWithConversion(currentCurrency, cost)
      if (!result) {
        setBuyWarning(`Not enough funds for ${item.name}`)
        setTimeout(() => setBuyWarning(null), 3000)
        return
      }
      updatedTreasure = { ...latest.treasure, ...result }
    }

    if (isWearableItem(item.name)) {
      const newArmor: ArmorEntry = {
        id: crypto.randomUUID(),
        name: item.name,
        acBonus: 0,
        equipped: false,
        type: 'clothing',
        description: item.description,
        cost: costStr || undefined
      }
      const currentArmor: ArmorEntry[] = latest.armor ?? []
      const updated = {
        ...latest,
        armor: [...currentArmor, newArmor],
        treasure: updatedTreasure,
        updatedAt: new Date().toISOString()
      } as Character
      saveAndBroadcast(updated)
      setBuyWarning(null)
      return
    }

    const newItem = { name: item.name, quantity: 1, description: item.description, cost: costStr || undefined }
    const updated = {
      ...latest,
      equipment: [...latest.equipment, newItem],
      treasure: updatedTreasure,
      updatedAt: new Date().toISOString()
    } as Character
    saveAndBroadcast(updated)
    setBuyWarning(null)
  }

  return (
    <div className="mb-3">
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Equipment</div>
      {hasEquipment ? (
        <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3">
          {equipment.map((item, i) => (
            <div key={i}>
              <div className="flex items-center">
                <button
                  onClick={() => setExpandedItem(expandedItem === i ? null : i)}
                  className="flex-1 flex justify-between py-1 border-b border-gray-800 last:border-0 text-sm cursor-pointer hover:bg-gray-800/30 transition-colors"
                >
                  <span className="text-gray-300 flex items-center gap-1">
                    {item.name}
                    <span className="text-gray-600 text-[10px]">{expandedItem === i ? '\u25BE' : '\u25B8'}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    {item.quantity > 1 && <span className="text-gray-500">x{item.quantity}</span>}
                    {'weight' in item && (item as { weight?: number }).weight != null && (
                      <span className="text-xs text-gray-600">{(item as { weight?: number }).weight} lb</span>
                    )}
                  </div>
                </button>
                {getPackContents(item.name, gearDatabase) &&
                  (readonly ? (
                    <button
                      onClick={() => setExpandedPack(expandedPack === i ? null : i)}
                      className="ml-1 px-1.5 py-0.5 text-[10px] bg-gray-700 hover:bg-gray-600 rounded text-gray-300 cursor-pointer flex-shrink-0"
                      title="View pack contents"
                    >
                      {expandedPack === i ? 'Hide' : 'Contents'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleOpenPack(i)}
                      className="ml-1 px-1.5 py-0.5 text-[10px] bg-amber-600 hover:bg-amber-500 rounded text-white cursor-pointer flex-shrink-0"
                      title="Open pack into individual items"
                    >
                      Open
                    </button>
                  ))}
                {!readonly && (
                  <>
                    <button
                      onClick={() => handleSellEquipment(i)}
                      className="ml-1 text-gray-600 hover:text-green-400 cursor-pointer text-xs flex-shrink-0"
                      title="Sell (half price)"
                    >
                      &#x24;
                    </button>
                    <button
                      onClick={() => handleRemoveEquipment(i)}
                      className="ml-2 text-gray-600 hover:text-red-400 cursor-pointer text-xs flex-shrink-0"
                      title="Remove item"
                    >
                      &#x2715;
                    </button>
                  </>
                )}
              </div>
              {expandedPack === i &&
                readonly &&
                (() => {
                  const contents = getPackContents(item.name, gearDatabase)
                  if (!contents) return null
                  return (
                    <div className="text-xs text-gray-500 py-1 pl-2 bg-gray-800/30 rounded mt-0.5 mb-0.5">
                      <div className="text-gray-400 mb-1 font-medium">Pack Contents:</div>
                      {contents.map((c, ci) => (
                        <div key={ci} className="flex items-center gap-1 py-0.5">
                          <span className="text-gray-300">{c.name}</span>
                          {c.quantity > 1 && <span className="text-gray-600">x{c.quantity}</span>}
                        </div>
                      ))}
                    </div>
                  )
                })()}
              {expandedItem === i && (
                <div className="text-xs text-gray-500 py-1 pl-2">
                  {item.description ||
                    gearDatabase.find((g) => g.name.toLowerCase() === item.name.toLowerCase())?.description ||
                    'No description available.'}
                  {!readonly &&
                    isGenericTool(item.name) &&
                    (() => {
                      const base = getGenericToolBase(item.name)
                      if (!base) return null
                      const variants = GENERIC_TOOL_VARIANTS[base]
                      if (!variants) return null
                      return (
                        <div className="mt-2">
                          <div className="text-gray-400 mb-1">Choose a specific {base}:</div>
                          <div className="flex flex-wrap gap-1">
                            {variants.map((variant) => (
                              <button
                                key={variant}
                                onClick={() => {
                                  const latest = getLatest()
                                  if (!latest || latest.gameSystem !== 'dnd5e') return
                                  const l = latest as Character5e
                                  const updated = {
                                    ...l,
                                    equipment: l.equipment.map((e, idx) => (idx === i ? { ...e, name: variant } : e)),
                                    proficiencies: {
                                      ...l.proficiencies,
                                      tools: l.proficiencies.tools.map((t) =>
                                        t.toLowerCase() === item.name.toLowerCase() ? variant : t
                                      )
                                    },
                                    updatedAt: new Date().toISOString()
                                  }
                                  saveAndBroadcast(updated)
                                  setExpandedItem(null)
                                }}
                                className="px-2 py-0.5 text-[11px] rounded border border-amber-700/50 text-amber-300 hover:bg-amber-900/40 cursor-pointer transition-colors"
                              >
                                {variant}
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })()}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">No equipment.</p>
      )}

      {!readonly && (
        <div className="mt-2">
          {showAddEquipment ? (
            <div className="bg-gray-800/50 rounded p-3 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Item name"
                  value={equipmentForm.name}
                  onChange={(e) => setEquipmentForm((f) => ({ ...f, name: e.target.value }))}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
                />
                <input
                  type="number"
                  min={1}
                  placeholder="Qty"
                  value={equipmentForm.quantity}
                  onChange={(e) => setEquipmentForm((f) => ({ ...f, quantity: e.target.value }))}
                  className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 text-center focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={handleAddEquipment}
                  disabled={!equipmentForm.name.trim()}
                  className="px-3 py-1 text-xs bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded text-white cursor-pointer"
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setShowAddEquipment(false)
                    setEquipmentForm({ name: '', quantity: '1' })
                  }}
                  className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : showGearShop ? (
            <div className="bg-gray-800/50 rounded p-3 space-y-2">
              <div className="text-xs text-gray-400 font-medium mb-1">Gear Shop</div>
              <input
                type="text"
                placeholder="Search gear..."
                value={gearSearch}
                onChange={(e) => setGearSearch(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
              />
              {buyWarning && (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-2 py-1">
                  {buyWarning}
                </div>
              )}
              <div className="max-h-40 overflow-y-auto space-y-0.5">
                {filteredGear.slice(0, 50).map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-xs py-1 px-1 hover:bg-gray-800/50 rounded"
                  >
                    <span className="text-gray-300">{item.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">{getGearCost(item) || 'free'}</span>
                      <button
                        onClick={() => handleBuyGear(item)}
                        className="px-2 py-0.5 bg-amber-600 hover:bg-amber-500 rounded text-white cursor-pointer"
                      >
                        Buy
                      </button>
                    </div>
                  </div>
                ))}
                {filteredGear.length === 0 && <p className="text-xs text-gray-500 text-center py-2">No items found.</p>}
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setShowGearShop(false)
                    setGearSearch('')
                    setBuyWarning(null)
                  }}
                  className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setShowAddEquipment(true)}
                className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
              >
                + Add Item
              </button>
              <button
                onClick={() => setShowGearShop(true)}
                className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
              >
                + Shop
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
